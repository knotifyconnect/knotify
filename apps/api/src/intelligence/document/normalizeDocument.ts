import type {
  DocumentBlock,
  DocumentSpan,
  ExtractedDocumentLayout,
  StructuredDocument,
  StructuredDocumentPage,
} from './contracts.js'
import { detectColumns } from './detectColumns.js'
import { reconstructReadingOrder } from './reconstructReadingOrder.js'
import { segmentDocument } from './segmentDocument.js'

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000
}

function normaliseText(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\t\r\n\f\v\u00A0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

function normaliseSpans(spans: DocumentSpan[]) {
  return spans
    .map((span) => ({
      ...span,
      text: normaliseText(span.text),
      x: roundCoordinate(Math.max(0, span.x)),
      y: roundCoordinate(Math.max(0, span.y)),
      width: roundCoordinate(Math.max(0, span.width)),
      height: roundCoordinate(Math.max(0, span.height)),
      fontSize: roundCoordinate(Math.max(1, span.fontSize)),
    }))
    .filter(
      (span) =>
        span.text.length > 0 &&
        span.width > 0 &&
        span.height > 0
    )
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.y - right.y ||
        left.x - right.x
    )
}

export function normalizeDocument(
  extracted: ExtractedDocumentLayout
): StructuredDocument {
  let globalLineOrder = 0
  let globalBlockOrder = 0
  const allBlocks: DocumentBlock[] = []
  const pages: StructuredDocumentPage[] = extracted.pages.map(
    (page) => {
      const spans = normaliseSpans(page.spans)
      const normalisedPage = { ...page, spans }
      const columns = detectColumns(normalisedPage)
      const lines = reconstructReadingOrder(
        normalisedPage,
        columns
      ).map((line) => ({
        ...line,
        readingOrder: globalLineOrder++,
      }))
      const blocks = segmentDocument(lines).map((block) => ({
        ...block,
        readingOrder: globalBlockOrder++,
      }))

      allBlocks.push(...blocks)

      return {
        page: page.page,
        width: roundCoordinate(page.width),
        height: roundCoordinate(page.height),
        columns,
        spans,
        lines,
        blocks,
      }
    }
  )

  return {
    version: '1.0',
    pageCount: extracted.pageCount,
    pages,
    blocks: allBlocks,
  }
}