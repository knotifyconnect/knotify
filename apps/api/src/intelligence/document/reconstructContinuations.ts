import type { DocumentLine } from './contracts.js'

export type DocumentContinuationJoinReason =
  | 'label-continuation'
  | 'hanging-indent'
  | 'wrapped-line'
  | 'lowercase-continuation'
  | 'hyphenated-line-break'

export interface ReconstructedDocumentParagraph {
  text: string
  lines: DocumentLine[]
  lineIds: string[]
  joinReasons: DocumentContinuationJoinReason[]
}

const bulletPattern =
  /^(?:[\u2022\u25cf\u25aa\u25e6\u2023\u2043\u27a2\u2794\u25b8\u25ba>*-]|\d+[.)])\s+/
const entryMarkerPattern =
  /^(?:[\u27a2\u2794\u25b8\u25ba>])(?:\s+|$)/
const dateRangePattern =
  /\b(?:19|20)\d{2}\b.*(?:-|\u2013|\u2014|to|bis).*\b(?:(?:19|20)\d{2}|present|current|heute|gegenwaertig|gegenw\u00e4rtig)\b/i

function maxFontSize(line: DocumentLine) {
  return Math.max(...line.spans.map((span) => span.fontSize), 1)
}

function contentStartX(line: DocumentLine) {
  if (!bulletPattern.test(line.text.trim())) return line.x

  const firstContentSpan = line.spans.find(
    (span) => !/^[\u2022\u25cf\u25aa\u25e6\u2023\u2043\u27a2\u2794\u25b8\u25ba>*-]$/.test(span.text.trim())
  )

  return firstContentSpan?.x ?? line.x
}

function verticalGap(previous: DocumentLine, current: DocumentLine) {
  return current.y - (previous.y + previous.height)
}

function isHardBoundary(line: DocumentLine) {
  const text = line.text.trim()
  return bulletPattern.test(text) || entryMarkerPattern.test(text)
}

function looksLikeHeading(line: DocumentLine) {
  const text = line.text.trim()
  if (!text || text.length > 100) return false

  const words = text.split(/\s+/)
  const letters = text.replace(/[^\p{L}]/gu, '')
  const uppercase =
    letters.length >= 3 && letters === letters.toUpperCase()

  return uppercase && words.length <= 10
}

export function documentContinuationJoinReason(
  previous: DocumentLine,
  current: DocumentLine
): DocumentContinuationJoinReason | null {
  if (previous.page !== current.page) return null
  if (previous.column !== current.column) return null
  if (isHardBoundary(current) || looksLikeHeading(current)) return null
  if (dateRangePattern.test(current.text)) return null

  const previousFont = maxFontSize(previous)
  const currentFont = maxFontSize(current)
  const font = Math.max(previousFont, currentFont)
  const gap = verticalGap(previous, current)
  const maxGap = Math.max(7, font * 0.9)

  if (gap < -font * 0.25 || gap > maxGap) return null

  const previousContentX = contentStartX(previous)
  const currentContentX = contentStartX(current)
  const indentDelta = Math.abs(currentContentX - previousContentX)
  const hangingIndent =
    currentContentX >= previousContentX - font * 0.35 &&
    currentContentX <= previousContentX + font * 2.25

  if (!hangingIndent && indentDelta > Math.max(18, font * 1.75)) {
    return null
  }

  const previousText = previous.text.trim()
  const currentText = current.text.trim()

  if (/\p{L}-$/u.test(previousText) && /^\p{Ll}/u.test(currentText)) {
    return 'hyphenated-line-break'
  }

  if (/[:;,]$/.test(previousText)) return 'label-continuation'
  if (/^[\p{Ll}\d(]/u.test(currentText)) {
    return 'lowercase-continuation'
  }
  if (bulletPattern.test(previousText) && hangingIndent) {
    return 'hanging-indent'
  }
  if (!/[.!?]$/.test(previousText) && hangingIndent) {
    return 'wrapped-line'
  }

  return null
}

function joinText(
  previous: string,
  current: string,
  reason: DocumentContinuationJoinReason
) {
  const left = previous.trimEnd()
  const right = current.trimStart()

  if (reason === 'hyphenated-line-break') {
    return `${left.slice(0, -1)}${right}`
  }

  return `${left} ${right}`.replace(/\s+/g, ' ').trim()
}

export function reconstructDocumentParagraphs(
  lines: DocumentLine[]
): ReconstructedDocumentParagraph[] {
  const ordered = [...lines].sort(
    (left, right) =>
      left.page - right.page ||
      left.column - right.column ||
      left.readingOrder - right.readingOrder ||
      left.sourceOrder - right.sourceOrder
  )
  const paragraphs: ReconstructedDocumentParagraph[] = []

  for (const line of ordered) {
    const previousParagraph = paragraphs[paragraphs.length - 1]
    const previousLine = previousParagraph?.lines.at(-1)
    const reason = previousLine
      ? documentContinuationJoinReason(previousLine, line)
      : null

    if (!previousParagraph || !previousLine || !reason) {
      paragraphs.push({
        text: line.text.trim(),
        lines: [line],
        lineIds: [line.id],
        joinReasons: [],
      })
      continue
    }

    previousParagraph.text = joinText(
      previousParagraph.text,
      line.text,
      reason
    )
    previousParagraph.lines.push(line)
    previousParagraph.lineIds.push(line.id)
    previousParagraph.joinReasons.push(reason)
  }

  return paragraphs
}
