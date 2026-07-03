import { isDeepStrictEqual } from 'node:util'
import {
  multiPageFixture,
  oneColumnFixture,
  rightAlignedDatesFixture,
  twoColumnFixture,
} from '../intelligence/document/__fixtures__/syntheticPdf.js'
import {
  extractPdfLayout,
  PdfLayoutError,
} from '../intelligence/document/extractPdfLayout.js'
import { normalizeDocument } from '../intelligence/document/normalizeDocument.js'

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message)
}

function lineTexts(document: ReturnType<typeof normalizeDocument>) {
  return document.pages.flatMap((page) =>
    page.lines.map((line) => line.text)
  )
}

async function extractAndNormalize(buffer: Buffer) {
  const extracted = await extractPdfLayout(buffer)
  return normalizeDocument(extracted)
}

async function main() {
  const oneColumn = await extractAndNormalize(oneColumnFixture)

  assert(oneColumn.pageCount === 1, 'Expected one PDF page')
  assert(
    oneColumn.pages[0].columns.length === 1,
    'One-column fixture was incorrectly split'
  )
  assert(
    lineTexts(oneColumn).join('|') ===
      [
        'JAY EXAMPLE',
        'EXPERIENCE',
        'Product Analyst',
        'Acme GmbH',
        '2023 - Present',
        'EDUCATION',
        'Technical University of Munich',
      ].join('|'),
    'One-column reading order is incorrect'
  )
  assert(
    oneColumn.pages[0].spans.every(
      (span) =>
        span.width > 0 &&
        span.height > 0 &&
        span.fontSize > 0
    ),
    'Span geometry was not preserved'
  )

  console.log('DOCUMENT ONE COLUMN: PASS')

  const twoColumn = await extractAndNormalize(twoColumnFixture)
  const twoColumnLines = lineTexts(twoColumn)

  assert(
    twoColumn.pages[0].columns.length === 2,
    'Two-column fixture was not detected'
  )
  assert(
    twoColumnLines.indexOf('SKILLS') <
      twoColumnLines.indexOf('EXPERIENCE'),
    'Two-column reading order did not keep the left column first'
  )
  assert(
    twoColumnLines.indexOf('German B2') <
      twoColumnLines.indexOf('EXPERIENCE'),
    'Two-column content was interleaved by row'
  )
  assert(
    twoColumn.pages[0].lines.some(
      (line) => line.column === 1
    ) &&
      twoColumn.pages[0].lines.some(
        (line) => line.column === 2
      ),
    'Column assignments were not retained'
  )

  console.log('DOCUMENT TWO COLUMN: PASS')

  const rightAlignedDates = await extractAndNormalize(
    rightAlignedDatesFixture
  )

  assert(
    rightAlignedDates.pages[0].columns.length === 1,
    'Right-aligned dates were incorrectly treated as a second column'
  )

  console.log('DOCUMENT RIGHT-ALIGNED DATES: PASS')

  const multiPage = await extractAndNormalize(multiPageFixture)

  assert(multiPage.pageCount === 2, 'Expected two PDF pages')
  assert(
    multiPage.pages.map((page) => page.page).join(',') === '1,2',
    'Page continuity was not preserved'
  )
  assert(
    multiPage.blocks[0].page === 1 &&
      multiPage.blocks.at(-1)?.page === 2,
    'Global block order did not preserve page order'
  )

  console.log('DOCUMENT MULTI PAGE: PASS')

  const repeated = await extractAndNormalize(twoColumnFixture)

  assert(
    isDeepStrictEqual(twoColumn, repeated),
    'Document extraction is not deterministic'
  )

  console.log('DOCUMENT DETERMINISM: PASS')

  let pageLimitPassed = false

  try {
    await extractPdfLayout(multiPageFixture, { maxPages: 1 })
  } catch (error) {
    pageLimitPassed =
      error instanceof PdfLayoutError &&
      error.code === 'PAGE_LIMIT'
  }

  assert(pageLimitPassed, 'PDF page limit was not enforced')

  let spanLimitPassed = false

  try {
    await extractPdfLayout(oneColumnFixture, { maxSpans: 2 })
  } catch (error) {
    spanLimitPassed =
      error instanceof PdfLayoutError &&
      error.code === 'SPAN_LIMIT'
  }

  assert(spanLimitPassed, 'PDF span limit was not enforced')

  let invalidPdfPassed = false

  try {
    await extractPdfLayout(Buffer.from('not a pdf'))
  } catch (error) {
    invalidPdfPassed =
      error instanceof PdfLayoutError &&
      error.code === 'INVALID_PDF'
  }

  assert(invalidPdfPassed, 'Invalid PDF buffers were not rejected')

  console.log('DOCUMENT LIMITS: PASS')
  console.log('DOCUMENT EXTRACTION SMOKE: PASS')
}

main().catch((error) => {
  if (error instanceof PdfLayoutError) {
    console.error(
      `DOCUMENT EXTRACTION SMOKE: FAIL [${error.code}]`
    )
  } else {
    console.error(
      error instanceof Error ? error.message : String(error)
    )
  }

  process.exitCode = 1
})