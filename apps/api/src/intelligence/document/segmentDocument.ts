import type {
  BoundingBox,
  DocumentBlock,
  DocumentBlockKind,
  DocumentLine,
} from './contracts.js'

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

function lineFontSize(line: DocumentLine) {
  return Math.max(
    ...line.spans.map((span) => span.fontSize),
    1
  )
}

function classifyLine(
  line: DocumentLine,
  medianFontSize: number
): DocumentBlockKind {
  const text = line.text.trim()
  if (!text) return 'unknown'

  if (
    /^(?:[\u2022\u25cf\u25aa\u25e6\u2023\u2043\u27a2\u2794\u25b8\u25ba>*-]|\d+[.)])\s+/.test(
      text
    )
  ) {
    return 'list-item'
  }

  const words = text.split(/\s+/)
  const letters = text.replace(/[^\p{L}]/gu, '')
  const isUppercase =
    letters.length >= 2 && letters === letters.toUpperCase()
  const fontSize = lineFontSize(line)

  if (
    text.length <= 100 &&
    words.length <= 12 &&
    (fontSize >= medianFontSize * 1.18 || isUppercase)
  ) {
    return 'heading'
  }

  return 'paragraph'
}
function shouldStartBlock(
  previous: DocumentLine | undefined,
  current: DocumentLine,
  currentKind: DocumentBlockKind,
  previousKind: DocumentBlockKind | undefined,
  medianFontSize: number
) {
  if (!previous) return true
  if (previous.page !== current.page) return true
  if (previous.column !== current.column) return true
  if (currentKind === 'heading' || currentKind === 'list-item') {
    return true
  }
  if (previousKind === 'heading' || previousKind === 'list-item') {
    return true
  }

  const gap = current.y - (previous.y + previous.height)
  return gap > medianFontSize * 1.25
}

export function segmentDocument(
  lines: DocumentLine[]
): DocumentBlock[] {
  if (lines.length === 0) return []

  const medianFontSize = median(
    lines.flatMap((line) =>
      line.spans.map((span) => span.fontSize)
    ),
    10
  )
  const groups: Array<{
    kind: DocumentBlockKind
    lines: DocumentLine[]
  }> = []
  let previous: DocumentLine | undefined
  let previousKind: DocumentBlockKind | undefined

  for (const line of lines) {
    const kind = classifyLine(line, medianFontSize)

    if (
      shouldStartBlock(
        previous,
        line,
        kind,
        previousKind,
        medianFontSize
      )
    ) {
      groups.push({ kind, lines: [line] })
    } else {
      groups[groups.length - 1].lines.push(line)
    }

    previous = line
    previousKind = kind
  }

  return groups.map((group, readingOrder) => {
    const box = unionBox(group.lines)
    const first = group.lines[0]

    return {
      id: `p${first.page}-b${readingOrder + 1}`,
      page: first.page,
      column: first.column,
      kind: group.kind,
      text: group.lines.map((line) => line.text).join('\n'),
      lines: group.lines,
      sourceOrder: Math.min(
        ...group.lines.map((line) => line.sourceOrder)
      ),
      readingOrder,
      ...box,
    }
  })
}
