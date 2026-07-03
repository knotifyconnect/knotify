import type {
  BoundingBox,
  DetectedColumn,
  DocumentLine,
  DocumentSpan,
  ExtractedDocumentPage,
} from './contracts.js'
import { columnForSpan } from './detectColumns.js'

function unionBox(items: BoundingBox[]): BoundingBox {
  const x = Math.min(...items.map((item) => item.x))
  const y = Math.min(...items.map((item) => item.y))
  const right = Math.max(
    ...items.map((item) => item.x + item.width)
  )
  const bottom = Math.max(
    ...items.map((item) => item.y + item.height)
  )

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}

function median(values: number[], fallback: number) {
  if (values.length === 0) return fallback

  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function centreY(span: DocumentSpan) {
  return span.y + span.height / 2
}

function needsSpace(
  previous: DocumentSpan,
  current: DocumentSpan
) {
  if (/\s$/.test(previous.text)) return false
  if (/^[,.;:!?%)\]}]/.test(current.text)) return false
  if (/[([{]$/.test(previous.text)) return false

  const gap = current.x - (previous.x + previous.width)
  if (gap <= 0.5) return false

  const previousCharacterWidth =
    previous.width / Math.max(1, previous.text.length)
  const currentCharacterWidth =
    current.width / Math.max(1, current.text.length)
  const threshold = Math.max(
    0.75,
    Math.min(previousCharacterWidth, currentCharacterWidth) *
      0.3
  )

  return gap > threshold
}

function lineText(spans: DocumentSpan[]) {
  const ordered = [...spans].sort(
    (left, right) =>
      left.x - right.x || left.sourceOrder - right.sourceOrder
  )
  let text = ''

  ordered.forEach((span, index) => {
    if (
      index > 0 &&
      needsSpace(ordered[index - 1], span)
    ) {
      text += ' '
    }

    text += span.text
  })

  return text.replace(/\s+/g, ' ').trim()
}

function buildColumnLines(
  page: number,
  column: number,
  spans: DocumentSpan[]
): DocumentLine[] {
  if (spans.length === 0) return []

  const tolerance = Math.max(
    2,
    median(
      spans.map((span) => span.fontSize),
      10
    ) * 0.45
  )
  const sorted = [...spans].sort(
    (left, right) =>
      centreY(left) - centreY(right) ||
      left.x - right.x ||
      left.sourceOrder - right.sourceOrder
  )
  const groups: DocumentSpan[][] = []

  for (const span of sorted) {
    const last = groups[groups.length - 1]

    if (!last) {
      groups.push([span])
      continue
    }

    const lastCentre =
      last.reduce((total, item) => total + centreY(item), 0) /
      last.length

    if (Math.abs(centreY(span) - lastCentre) <= tolerance) {
      last.push(span)
    } else {
      groups.push([span])
    }
  }

  return groups.map((group, index) => {
    const orderedSpans = [...group].sort(
      (left, right) =>
        left.x - right.x ||
        left.sourceOrder - right.sourceOrder
    )
    const box = unionBox(orderedSpans)

    return {
      id: `p${page}-c${column}-l${index + 1}`,
      page,
      column,
      text: lineText(orderedSpans),
      spans: orderedSpans,
      sourceOrder: Math.min(
        ...orderedSpans.map((span) => span.sourceOrder)
      ),
      readingOrder: -1,
      ...box,
    }
  })
}

function topToBottom(lines: DocumentLine[]) {
  return [...lines].sort(
    (left, right) =>
      left.y - right.y ||
      left.x - right.x ||
      left.sourceOrder - right.sourceOrder
  )
}

function orderTwoColumnLines(lines: DocumentLine[]) {
  const anchors = topToBottom(
    lines.filter((line) => line.column === 0)
  )
  const content = lines.filter((line) => line.column !== 0)
  const ordered: DocumentLine[] = []
  const consumed = new Set<string>()
  let previousAnchorBottom = Number.NEGATIVE_INFINITY

  const appendBand = (bandBottom: number) => {
    for (const column of [1, 2]) {
      const band = topToBottom(
        content.filter(
          (line) =>
            !consumed.has(line.id) &&
            line.column === column &&
            line.y >= previousAnchorBottom &&
            line.y < bandBottom
        )
      )

      for (const line of band) {
        consumed.add(line.id)
        ordered.push(line)
      }
    }
  }

  for (const anchor of anchors) {
    appendBand(anchor.y)
    ordered.push(anchor)
    previousAnchorBottom = anchor.y + anchor.height
  }

  appendBand(Number.POSITIVE_INFINITY)

  for (const line of topToBottom(content)) {
    if (!consumed.has(line.id)) ordered.push(line)
  }

  return ordered
}

export function reconstructReadingOrder(
  page: ExtractedDocumentPage,
  columns: DetectedColumn[]
): DocumentLine[] {
  const spansByColumn = new Map<number, DocumentSpan[]>()

  for (const span of page.spans) {
    const column = columnForSpan(span, columns)
    const existing = spansByColumn.get(column) ?? []
    existing.push(span)
    spansByColumn.set(column, existing)
  }

  const lines = [...spansByColumn.entries()].flatMap(
    ([column, spans]) =>
      buildColumnLines(page.page, column, spans)
  )
  const ordered =
    columns.length === 1
      ? topToBottom(lines)
      : orderTwoColumnLines(lines)

  return ordered.map((line, readingOrder) => ({
    ...line,
    readingOrder,
  }))
}