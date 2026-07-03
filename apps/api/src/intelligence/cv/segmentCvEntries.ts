import type { DocumentBlock, DocumentLine } from '../document/contracts.js'
import {
  documentContinuationJoinReason,
  reconstructDocumentParagraphs,
} from '../document/reconstructContinuations.js'
import type {
  ClassifiedCvDocument,
  CvNormalizedDate,
  CvSectionKind,
} from './contracts.js'
import {
  extractCvDateRanges,
  type CvDateRangeSpan,
} from './cvDates.js'

export interface CvSourceUnit {
  rawText: string
  text: string
  block: DocumentBlock
  lineIds: string[]
  sourceOrder: number
  y: number
  entryHeader: boolean
  line: DocumentLine | null
}

export interface CvEntryDateRange {
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
  singleDate: boolean
}

export interface CvEntryGroup {
  contextText: string | null
  entryText: string | null
  header: string[]
  description: string[]
  descriptionUnits: CvSourceUnit[]
  dateRange: CvEntryDateRange | null
  units: CvSourceUnit[]
}

export interface CvInlineHeaderParts {
  contextText: string | null
  entryText: string | null
}

export interface CvEntrySegmentationOptions {
  section: CvSectionKind
  isContext: (text: string) => boolean
  splitInlineHeader: (
    text: string,
    entryHeader: boolean
  ) => CvInlineHeaderParts
}

function isEntryHeader(value: string) {
  return /^[\s]*(?:[\u27a2\u2794\u25b8\u25ba>])(?:\s+|$)/.test(
    value
  )
}

export function cleanCvText(value: string) {
  return value
    .replace(
      /^[\s\u2022\u25cf\u25aa\u25e6\u2023\u2043\u27a2\u2794\u25b8\u25ba>*-]+/,
      ''
    )
    .replace(/^[|,;:\u00b7\u2013\u2014-]+\s*/g, '')
    .replace(/\s*[|,;:\u00b7\u2013\u2014-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueUnits(units: CvSourceUnit[]) {
  const seen = new Set<string>()

  return units.filter((unit) => {
    const key = `${unit.block.id}:${unit.lineIds.join(',')}:${unit.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function unitsForCvSection(
  classified: ClassifiedCvDocument,
  section: CvSectionKind
): CvSourceUnit[] {
  const units: CvSourceUnit[] = []

  for (const item of classified.blocks) {
    if (item.section !== section) continue

    if (item.headingSection) {
      if (item.contentText) {
        units.push({
          rawText: item.contentText,
          text: cleanCvText(item.contentText),
          block: item.block,
          lineIds: item.block.lines.map((line) => line.id),
          sourceOrder: item.block.sourceOrder,
          y: item.block.y,
          entryHeader: isEntryHeader(item.contentText),
          line: null,
        })
      }
      continue
    }

    if (item.block.lines.length === 0) {
      if (item.contentText) {
        units.push({
          rawText: item.contentText,
          text: cleanCvText(item.contentText),
          block: item.block,
          lineIds: [],
          sourceOrder: item.block.sourceOrder,
          y: item.block.y,
          entryHeader: isEntryHeader(item.contentText),
          line: null,
        })
      }
      continue
    }

    for (const line of item.block.lines) {
      const rawText = line.text.trim()
      const text = cleanCvText(rawText)
      if (!text) continue

      units.push({
        rawText,
        text,
        block: item.block,
        lineIds: [line.id],
        sourceOrder: line.sourceOrder,
        y: line.y,
        entryHeader: isEntryHeader(rawText),
        line,
      })
    }
  }

  return units.sort(
    (left, right) =>
      left.block.page - right.block.page ||
      left.block.column - right.block.column ||
      left.y - right.y ||
      left.sourceOrder - right.sourceOrder
  )
}

function rangeLabels(text: string, spans: CvDateRangeSpan[]) {
  let cursor = 0

  return spans.map((span) => {
    const label = cleanCvText(text.slice(cursor, span.startIndex))
    cursor = span.endIndex
    return label
  })
}

function rangeValue(span: CvDateRangeSpan): CvEntryDateRange {
  return {
    startDate: span.startDate,
    endDate: span.endDate,
    singleDate: span.singleDate,
  }
}

function contextKey(value: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function descriptionFromUnits(units: CvSourceUnit[]) {
  const paragraphs: string[] = []
  let pendingLines: DocumentLine[] = []

  const flushLines = () => {
    if (pendingLines.length === 0) return

    paragraphs.push(
      ...reconstructDocumentParagraphs(pendingLines)
        .map((paragraph) => cleanCvText(paragraph.text))
        .filter(Boolean)
    )
    pendingLines = []
  }

  for (const unit of units) {
    if (unit.line) {
      pendingLines.push(unit.line)
      continue
    }

    flushLines()
    const text = cleanCvText(unit.text)
    if (text) paragraphs.push(text)
  }

  flushLines()
  return paragraphs
}

function createUndatedGroup(
  units: CvSourceUnit[],
  options: CvEntrySegmentationOptions
): CvEntryGroup | null {
  const cleaned = units.filter((unit) => unit.text)
  if (cleaned.length === 0) return null

  const first = cleaned[0]
  const second = cleaned[1]
  const firstParts = options.splitInlineHeader(
    first.text,
    first.entryHeader
  )
  const secondParts = second
    ? options.splitInlineHeader(
        second.text,
        second.entryHeader
      )
    : null

  let contextText = firstParts.contextText
  let entryText = firstParts.entryText
  let descriptionStart = 1

  if (
    second &&
    secondParts?.entryText &&
    !secondParts.contextText
  ) {
    contextText = first.text
    entryText = secondParts.entryText
    descriptionStart = 2
  } else if (
    second &&
    secondParts?.contextText &&
    !secondParts.entryText &&
    firstParts.entryText
  ) {
    contextText = secondParts.contextText
    entryText = firstParts.entryText
    descriptionStart = 2
  } else if (!contextText && !entryText && second) {
    contextText = first.text
    entryText = second.text
    descriptionStart = 2
  } else if (!contextText && !entryText) {
    if (options.isContext(first.text)) {
      contextText = first.text
    } else {
      entryText = first.text
    }
  }

  return {
    contextText,
    entryText,
    header: [contextText, entryText].filter(
      (value): value is string => Boolean(value)
    ),
    description: descriptionFromUnits(cleaned.slice(descriptionStart)),
    descriptionUnits: cleaned.slice(descriptionStart),
    dateRange: null,
    units: uniqueUnits(cleaned),
  }
}

function nextDatedUnit(
  units: CvSourceUnit[],
  index: number
) {
  for (
    let cursor = index + 1;
    cursor < units.length && cursor <= index + 2;
    cursor += 1
  ) {
    if (extractCvDateRanges(units[cursor].text).length > 0) {
      return true
    }
  }

  return false
}

function pendingEntryText(
  units: CvSourceUnit[],
  context: CvSourceUnit | null,
  options: CvEntrySegmentationOptions
) {
  const candidates = units.filter((unit) => unit !== context)

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parts = options.splitInlineHeader(
      candidates[index].text,
      candidates[index].entryHeader
    )

    if (parts.entryText) return parts.entryText
    if (!parts.contextText && candidates[index].text) {
      return candidates[index].text
    }
  }

  return null
}

function nextUnitStartsDatedContext(
  units: CvSourceUnit[],
  index: number,
  options: CvEntrySegmentationOptions
) {
  const next = units[index + 1]
  if (!next) return false

  return (
    (next.entryHeader || options.isContext(next.text)) &&
    nextDatedUnit(units, index + 1)
  )
}

function continuesActiveDescription(
  activeGroups: CvEntryGroup[],
  unit: CvSourceUnit
) {
  if (!unit.line || activeGroups.length === 0) return false

  return activeGroups.some((group) => {
    const previous = group.descriptionUnits.at(-1)?.line
    return Boolean(
      previous &&
      documentContinuationJoinReason(previous, unit.line!)
    )
  })
}

function appendDescriptionUnit(
  groups: CvEntryGroup[],
  unit: CvSourceUnit
) {
  for (const group of groups) {
    group.descriptionUnits.push(unit)
    group.units = uniqueUnits([...group.units, unit])
  }
}

export function segmentCvEntries(
  classified: ClassifiedCvDocument,
  options: CvEntrySegmentationOptions
): CvEntryGroup[] {
  const units = unitsForCvSection(classified, options.section)
  const groups: CvEntryGroup[] = []
  let currentContext: CvSourceUnit | null = null
  let currentContextText: string | null = null
  let contextGroups: CvEntryGroup[] = []
  let activeGroups: CvEntryGroup[] = []
  let pendingUnits: CvSourceUnit[] = []

  const flushPending = () => {
    if (pendingUnits.length === 0) return
    const undated = createUndatedGroup(pendingUnits, options)
    if (undated) groups.push(undated)
    pendingUnits = []
  }

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]
    const spans = extractCvDateRanges(unit.text)

    if (spans.length > 0) {
      const labels = rangeLabels(unit.text, spans)
      const pendingEntry = pendingEntryText(
        pendingUnits,
        currentContext,
        options
      )
      const firstParts = options.splitInlineHeader(
        labels[0] || pendingEntry || '',
        unit.entryHeader
      )
      const inheritedContext: string | null =
        firstParts.contextText ??
        currentContextText ??
        currentContext?.text ??
        null
      const contextChanged =
        Boolean(firstParts.contextText) &&
        contextKey(firstParts.contextText) !==
          contextKey(currentContextText)

      if (contextChanged) {
        flushPending()
        contextGroups = []
      }

      const created: CvEntryGroup[] = []

      spans.forEach((span, spanIndex) => {
        const label = labels[spanIndex] ?? ''
        const parts =
          spanIndex === 0
            ? firstParts
            : options.splitInlineHeader(label, false)
        const contextText =
          parts.contextText ??
          inheritedContext
        const entryText =
          parts.entryText ??
          (parts.contextText ? null : cleanCvText(label) || null)
        const contextUnit =
          currentContext &&
          contextKey(currentContext.text) === contextKey(contextText)
            ? currentContext
            : null
        const group: CvEntryGroup = {
          contextText,
          entryText,
          header: [contextText, entryText].filter(
            (value): value is string => Boolean(value)
          ),
          description: [],
          descriptionUnits: [],
          dateRange: rangeValue(span),
          units: uniqueUnits([
            ...pendingUnits,
            ...(contextUnit ? [contextUnit] : []),
            unit,
          ]),
        }

        groups.push(group)
        created.push(group)
      })

      const effectiveContext: string | null =
        created[0]?.contextText ?? inheritedContext

      if (
        contextKey(effectiveContext) ===
          contextKey(currentContextText) &&
        contextGroups.length > 0
      ) {
        contextGroups.push(...created)
      } else {
        contextGroups = [...created]
      }

      activeGroups = [...contextGroups]
      currentContextText = effectiveContext
      currentContext =
        firstParts.contextText ? unit : currentContext
      pendingUnits = []
      continue
    }

    const startsContext =
      unit.entryHeader ||
      (options.isContext(unit.text) &&
        nextDatedUnit(units, index))

    if (startsContext) {
      currentContext = unit
      currentContextText = unit.text
      contextGroups = []
      activeGroups = []
      pendingUnits = [...pendingUnits, unit]
      continue
    }

    if (continuesActiveDescription(activeGroups, unit)) {
      appendDescriptionUnit(activeGroups, unit)
      continue
    }

    const preparesNextEntry =
      unit.block.kind !== 'list-item' &&
      (
        extractCvDateRanges(units[index + 1]?.text ?? '').length > 0 ||
        nextUnitStartsDatedContext(units, index, options)
      )

    if (preparesNextEntry) {
      activeGroups = []
      pendingUnits = [unit]
      continue
    }

    if (activeGroups.length > 0) {
      appendDescriptionUnit(activeGroups, unit)
      continue
    }

    pendingUnits.push(unit)
  }

  flushPending()

  return groups.map((group) => ({
    ...group,
    description: descriptionFromUnits(group.descriptionUnits),
  }))
}
