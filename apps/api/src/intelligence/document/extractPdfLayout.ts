import type {
  DocumentSpan,
  ExtractedDocumentLayout,
  ExtractedDocumentPage,
} from './contracts.js'

export type PdfLayoutErrorCode =
  | 'INVALID_PDF'
  | 'PAGE_LIMIT'
  | 'SPAN_LIMIT'
  | 'EXTRACTION_FAILED'

export class PdfLayoutError extends Error {
  readonly name = 'PdfLayoutError'

  constructor(
    readonly code: PdfLayoutErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export interface PdfLayoutExtractionOptions {
  maxPages?: number
  maxSpans?: number
}

const DEFAULT_MAX_PAGES = 50
const DEFAULT_MAX_SPANS = 50_000

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000
}

function normaliseSpanText(value: unknown) {
  if (typeof value !== 'string') return ''

  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t\r\n\f\v\u00A0]+/g, ' ')
    .trim()
}

function assertPdfBuffer(buffer: Buffer) {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new PdfLayoutError(
      'INVALID_PDF',
      'The document is not a valid PDF buffer'
    )
  }
}

export async function extractPdfLayout(
  buffer: Buffer,
  options: PdfLayoutExtractionOptions = {}
): Promise<ExtractedDocumentLayout> {
  assertPdfBuffer(buffer)

  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const maxSpans = options.maxSpans ?? DEFAULT_MAX_SPANS

  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new PdfLayoutError(
      'PAGE_LIMIT',
      'The PDF page limit must be a positive integer'
    )
  }

  if (!Number.isInteger(maxSpans) || maxSpans < 1) {
    throw new PdfLayoutError(
      'SPAN_LIMIT',
      'The PDF span limit must be a positive integer'
    )
  }

  let documentProxy:
    | Awaited<
        ReturnType<
          typeof import('pdfjs-dist/legacy/build/pdf.mjs')['getDocument']
        >['promise']
      >
    | undefined

  try {
    const { getDocument } = await import(
      'pdfjs-dist/legacy/build/pdf.mjs'
    )
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      stopAtErrors: false,
      verbosity: 0,
    })

    documentProxy = await loadingTask.promise

    if (documentProxy.numPages > maxPages) {
      throw new PdfLayoutError(
        'PAGE_LIMIT',
        `The PDF exceeds the ${maxPages} page limit`
      )
    }

    const pages: ExtractedDocumentPage[] = []
    let sourceOrder = 0
    let spanCount = 0

    for (
      let pageNumber = 1;
      pageNumber <= documentProxy.numPages;
      pageNumber += 1
    ) {
      const page = await documentProxy.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      })
      const spans: DocumentSpan[] = []

      for (const item of textContent.items) {
        if (!('str' in item)) continue

        const text = normaliseSpanText(item.str)
        const currentSourceOrder = sourceOrder
        sourceOrder += 1

        if (!text) continue

        const transform = item.transform.map((value) =>
          finiteNumber(value)
        )
        const transformHeight = Math.hypot(
          transform[2],
          transform[3]
        )
        const transformWidth = Math.hypot(
          transform[0],
          transform[1]
        )
        const fontSize = Math.max(
          finiteNumber(item.height),
          transformHeight,
          transformWidth,
          1
        )
        const height = Math.max(
          finiteNumber(item.height, fontSize),
          fontSize,
          1
        )
        const width = Math.max(
          finiteNumber(item.width),
          text.length * fontSize * 0.25,
          0.5
        )
        const [x, baselineY] =
          viewport.convertToViewportPoint(
            finiteNumber(transform[4]),
            finiteNumber(transform[5])
          )

        spanCount += 1
        if (spanCount > maxSpans) {
          throw new PdfLayoutError(
            'SPAN_LIMIT',
            `The PDF exceeds the ${maxSpans} span limit`
          )
        }

        spans.push({
          id: `p${pageNumber}-s${spans.length + 1}`,
          page: pageNumber,
          text,
          x: roundCoordinate(Math.max(0, x)),
          y: roundCoordinate(Math.max(0, baselineY - height)),
          width: roundCoordinate(width),
          height: roundCoordinate(height),
          fontSize: roundCoordinate(fontSize),
          fontName:
            typeof item.fontName === 'string' && item.fontName
              ? textContent.styles[item.fontName]?.fontFamily ??
                item.fontName.replace(/^g_d\d+_/, '')
              : null,
          sourceOrder: currentSourceOrder,
        })
      }

      pages.push({
        page: pageNumber,
        width: roundCoordinate(viewport.width),
        height: roundCoordinate(viewport.height),
        spans,
      })

      page.cleanup()
    }

    return {
      pageCount: documentProxy.numPages,
      pages,
    }
  } catch (error) {
    if (error instanceof PdfLayoutError) {
      throw error
    }

    throw new PdfLayoutError(
      'EXTRACTION_FAILED',
      'PDF layout extraction failed',
      { cause: error }
    )
  } finally {
    await documentProxy?.destroy()
  }
}