import type { CvNormalizedDate } from './contracts.js'

export interface DateRangeExtraction {
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
  remainder: string
  singleDate: boolean
}

export interface CvDateRangeSpan {
  startIndex: number
  endIndex: number
  raw: string
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
  singleDate: boolean
}

const monthNumbers: Record<string, number> = {
  jan: 1,
  january: 1,
  januar: 1,
  feb: 2,
  february: 2,
  februar: 2,
  mar: 3,
  march: 3,
  maer: 3,
  maerz: 3,
  marz: 3,
  'm\u00e4r': 3,
  'm\u00e4rz': 3,
  apr: 4,
  april: 4,
  may: 5,
  mai: 5,
  jun: 6,
  june: 6,
  juni: 6,
  jul: 7,
  july: 7,
  juli: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  dez: 12,
  dezember: 12,
}

const monthNamePattern = Object.keys(monthNumbers)
  .sort((left, right) => right.length - left.length)
  .join('|')

const currentPattern =
  'bis\\s+heute|present|current|now|today|heute|aktuell|gegenwart|gegenwaertig|gegenw\\u00e4rtig'
const currentDateTokenPattern =
  `(?<![\\p{L}\\p{N}])(?:${currentPattern})(?![\\p{L}\\p{N}])`
const dateTokenPattern = [
  `(?:${monthNamePattern})\\.?\\s+(?:19|20)\\d{2}`,
  '(?:0?[1-9]|1[0-2])[./-](?:19|20)\\d{2}',
  '(?:19|20)\\d{2}[./-](?:0?[1-9]|1[0-2])',
  '(?:19|20)\\d{2}',
  currentDateTokenPattern,
].join('|')

const rangeSeparatorPattern =
  '(?:\\s*(?:-|\\u2013|\\u2014|to|until|through|bis)\\s*)'

function cleanRemainder(value: string) {
  return value
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*[|,;]\s*$/g, ' ')
    .replace(/^\s*[|,;]\s*/g, ' ')
    .replace(/\s+[-\u2013\u2014]\s*$/g, ' ')
    .replace(/^\s*[-\u2013\u2014]\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normaliseDateToken(raw: string): CvNormalizedDate | null {
  const normalised = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (
    /^(present|current|now|today|heute|aktuell|gegenwart|gegenwartig|gegenwaertig|bis heute)$/.test(
      normalised
    )
  ) {
    return {
      raw: raw.trim(),
      iso: null,
      year: null,
      month: null,
      current: true,
      precision: null,
    }
  }

  const yearOnly = /^(19|20)\d{2}$/.exec(normalised)
  if (yearOnly) {
    const year = Number(normalised)
    return {
      raw: raw.trim(),
      iso: `${year}-01-01`,
      year,
      month: null,
      current: false,
      precision: 'year',
    }
  }

  const monthYear = /^(0?[1-9]|1[0-2])[./-]((?:19|20)\d{2})$/.exec(
    normalised
  )
  if (monthYear) {
    const month = Number(monthYear[1])
    const year = Number(monthYear[2])
    return {
      raw: raw.trim(),
      iso: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      current: false,
      precision: 'month',
    }
  }

  const yearMonth = /^((?:19|20)\d{2})[./-](0?[1-9]|1[0-2])$/.exec(
    normalised
  )
  if (yearMonth) {
    const year = Number(yearMonth[1])
    const month = Number(yearMonth[2])
    return {
      raw: raw.trim(),
      iso: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      current: false,
      precision: 'month',
    }
  }

  const namedMonth = new RegExp(
    `^(${monthNamePattern})\\.?\\s+((?:19|20)\\d{2})$`,
    'i'
  ).exec(normalised)

  if (namedMonth) {
    const month = monthNumbers[namedMonth[1]]
    const year = Number(namedMonth[2])
    if (!month) return null

    return {
      raw: raw.trim(),
      iso: `${year}-${String(month).padStart(2, '0')}-01`,
      year,
      month,
      current: false,
      precision: 'month',
    }
  }

  return null
}

function explicitRangeSpans(text: string): CvDateRangeSpan[] {
  const matcher = new RegExp(
    `(?<start>${dateTokenPattern})${rangeSeparatorPattern}(?<end>${dateTokenPattern})`,
    'giu'
  )
  const spans: CvDateRangeSpan[] = []

  for (const match of text.matchAll(matcher)) {
    const groups = match.groups
    const start = groups?.start
      ? normaliseDateToken(groups.start)
      : null
    const end = groups?.end
      ? normaliseDateToken(groups.end)
      : null

    if (!start || !end || match.index === undefined) continue

    spans.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      raw: match[0],
      startDate: start,
      endDate: end,
      singleDate: false,
    })
  }

  return spans
}

function singleDateSpans(text: string): CvDateRangeSpan[] {
  const matcher = new RegExp(dateTokenPattern, 'giu')
  const matches = [...text.matchAll(matcher)]
  if (matches.length !== 1) return []

  const match = matches[0]
  const parsed = normaliseDateToken(match[0])
  if (!parsed || match.index === undefined) return []

  return [
    {
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      raw: match[0],
      startDate: parsed.current ? null : parsed,
      endDate: parsed.current ? parsed : null,
      singleDate: true,
    },
  ]
}

export function extractCvDateRanges(text: string): CvDateRangeSpan[] {
  const explicit = explicitRangeSpans(text)
  return explicit.length > 0 ? explicit : singleDateSpans(text)
}

export function extractCvDateRange(
  text: string
): DateRangeExtraction | null {
  const span = extractCvDateRanges(text)[0]
  if (!span) return null

  return {
    startDate: span.startDate,
    endDate: span.endDate,
    remainder: cleanRemainder(
      `${text.slice(0, span.startIndex)} ${text.slice(span.endIndex)}`
    ),
    singleDate: span.singleDate,
  }
}
