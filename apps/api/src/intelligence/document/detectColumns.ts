import type {
  DetectedColumn,
  DocumentSpan,
  ExtractedDocumentPage,
} from './contracts.js'

interface GutterCandidate {
  start: number
  end: number
  score: number
}

const BIN_COUNT = 160

function spanEnd(span: DocumentSpan) {
  return span.x + span.width
}

function spanCentreY(span: DocumentSpan) {
  return span.y + span.height / 2
}

function characterCount(spans: DocumentSpan[]) {
  return spans.reduce(
    (total, span) => total + span.text.replace(/\s/g, '').length,
    0
  )
}

function rowCentres(spans: DocumentSpan[], tolerance: number) {
  const rows: number[] = []

  for (const span of [...spans].sort(
    (left, right) => spanCentreY(left) - spanCentreY(right)
  )) {
    const centre = spanCentreY(span)
    const existing = rows.findIndex(
      (row) => Math.abs(row - centre) <= tolerance
    )

    if (existing === -1) {
      rows.push(centre)
    } else {
      rows[existing] = (rows[existing] + centre) / 2
    }
  }

  return rows
}

function pairedRowRatio(
  leftRows: number[],
  rightRows: number[],
  tolerance: number
) {
  if (leftRows.length === 0 || rightRows.length === 0) {
    return 0
  }

  const smaller =
    leftRows.length <= rightRows.length ? leftRows : rightRows
  const larger =
    leftRows.length <= rightRows.length ? rightRows : leftRows
  const paired = smaller.filter((row) =>
    larger.some((candidate) =>
      Math.abs(candidate - row) <= tolerance
    )
  ).length

  return paired / smaller.length
}

function verticalRange(spans: DocumentSpan[]) {
  if (spans.length === 0) return null

  const top = Math.min(...spans.map((span) => span.y))
  const bottom = Math.max(
    ...spans.map((span) => span.y + span.height)
  )

  return { top, bottom, height: Math.max(1, bottom - top) }
}

function verticalOverlapRatio(
  left: DocumentSpan[],
  right: DocumentSpan[]
) {
  const leftRange = verticalRange(left)
  const rightRange = verticalRange(right)
  if (!leftRange || !rightRange) return 0

  const overlap = Math.max(
    0,
    Math.min(leftRange.bottom, rightRange.bottom) -
      Math.max(leftRange.top, rightRange.top)
  )

  return overlap / Math.min(leftRange.height, rightRange.height)
}

function scoreCandidate(
  page: ExtractedDocumentPage,
  start: number,
  end: number
): GutterCandidate | null {
  const left = page.spans.filter(
    (span) => spanEnd(span) <= start
  )
  const right = page.spans.filter((span) => span.x >= end)
  const crossing = page.spans.filter(
    (span) => span.x < end && spanEnd(span) > start
  )

  const totalCharacters = Math.max(
    1,
    characterCount(page.spans)
  )
  const leftCharacters = characterCount(left)
  const rightCharacters = characterCount(right)
  const crossingCharacters = characterCount(crossing)
  const smallerCharacterRatio =
    Math.min(leftCharacters, rightCharacters) / totalCharacters

  if (smallerCharacterRatio < 0.12) return null
  if (crossingCharacters / totalCharacters > 0.2) return null

  const fontSizes = page.spans
    .map((span) => span.fontSize)
    .filter((size) => size > 0)
    .sort((a, b) => a - b)
  const medianFontSize =
    fontSizes[Math.floor(fontSizes.length / 2)] ?? 10
  const tolerance = Math.max(2, medianFontSize * 0.45)
  const leftRows = rowCentres(left, tolerance)
  const rightRows = rowCentres(right, tolerance)

  if (Math.min(leftRows.length, rightRows.length) < 3) {
    return null
  }
  if (
    Math.min(leftRows.length, rightRows.length) /
      Math.max(leftRows.length, rightRows.length) <
    0.35
  ) {
    return null
  }

  const overlap = verticalOverlapRatio(left, right)
  if (overlap < 0.4) return null

  const rightMaxWidth = Math.max(
    ...right.map((span) => span.width),
    0
  )
  if (
    rightCharacters < leftCharacters &&
    rightMaxWidth < page.width * 0.18 &&
    pairedRowRatio(leftRows, rightRows, tolerance) > 0.8
  ) {
    return null
  }

  const gutterWidth = end - start
  const balance =
    Math.min(leftCharacters, rightCharacters) /
    Math.max(leftCharacters, rightCharacters)

  return {
    start,
    end,
    score:
      gutterWidth * 2 +
      balance * page.width * 0.25 +
      overlap * page.width * 0.15 -
      crossingCharacters,
  }
}

export function detectColumns(
  page: ExtractedDocumentPage
): DetectedColumn[] {
  if (page.spans.length < 6 || page.width <= 0) {
    return [{ index: 1, x: 0, width: page.width }]
  }

  const binWidth = page.width / BIN_COUNT
  const occupancy = Array.from(
    { length: BIN_COUNT },
    () => 0
  )
  const sortedFontSizes = page.spans
    .map((span) => span.fontSize)
    .filter((size) => size > 0)
    .sort((left, right) => left - right)
  const medianFontSize =
    sortedFontSizes[Math.floor(sortedFontSizes.length / 2)] ?? 10
  const occupancySpans = page.spans.filter(
    (span) =>
      !(
        span.y < page.height * 0.18 &&
        span.fontSize >= medianFontSize * 1.25
      )
  )

  for (const span of occupancySpans) {
    const startBin = Math.max(
      0,
      Math.floor(span.x / binWidth)
    )
    const endBin = Math.min(
      BIN_COUNT - 1,
      Math.ceil(spanEnd(span) / binWidth)
    )

    for (let index = startBin; index <= endBin; index += 1) {
      occupancy[index] += 1
    }
  }

  const searchStart = Math.floor(BIN_COUNT * 0.2)
  const searchEnd = Math.ceil(BIN_COUNT * 0.8)
  const maxOccupancy = Math.max(...occupancy, 1)
  const lowOccupancyThreshold = Math.max(
    0,
    Math.floor(maxOccupancy * 0.04)
  )
  const candidates: GutterCandidate[] = []
  let runStart: number | null = null

  for (let index = searchStart; index <= searchEnd; index += 1) {
    const isOpen =
      index < searchEnd &&
      occupancy[index] <= lowOccupancyThreshold

    if (isOpen && runStart === null) {
      runStart = index
      continue
    }

    if (!isOpen && runStart !== null) {
      const runEnd = index
      const start = runStart * binWidth
      const end = runEnd * binWidth
      runStart = null

      if (end - start < page.width * 0.04) continue

      const candidate = scoreCandidate(page, start, end)
      if (candidate) candidates.push(candidate)
    }
  }

  const best = candidates.sort(
    (left, right) => right.score - left.score
  )[0]

  if (!best) {
    return [{ index: 1, x: 0, width: page.width }]
  }

  return [
    {
      index: 1,
      x: 0,
      width: best.start,
    },
    {
      index: 2,
      x: best.end,
      width: Math.max(0, page.width - best.end),
    },
  ]
}

export function columnForSpan(
  span: DocumentSpan,
  columns: DetectedColumn[]
) {
  if (columns.length < 2) return 1

  const left = columns[0]
  const right = columns[1]
  const leftEnd = left.x + left.width
  const rightStart = right.x
  const end = spanEnd(span)

  if (end <= leftEnd) return left.index
  if (span.x >= rightStart) return right.index

  return 0
}