import type {
  ClassifiedCvDocument,
  CvCandidate,
  CvCandidateKind,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
  CvLanguageValue,
  CvSkillValue,
  CvSourceEvidence,
  CvSummaryValue,
} from './contracts.js'
import { extractCvDateRange } from './cvDates.js'
import {
  cleanCvText,
  segmentCvEntries,
  unitsForCvSection,
  type CvEntryGroup,
  type CvSourceUnit,
} from './segmentCvEntries.js'
import {
  sortEducationCandidates,
  sortExperienceCandidates,
} from './sortCvEntries.js'

const companyPattern =
  /\b(gmbh|ag|se|kg|ug|ltd|limited|inc|llc|corp|corporation|company|group|bank|university|universitaet|hochschule|institute|institut|solutions|technologies|technology|electronics|studio|labs?|foundation|association|consulting|startup|start-up)\b/i
const rolePattern =
  /\b(engineer|developer|manager|management|analyst|consultant|internship|intern|assistant|researcher|scientist|designer|specialist|coordinator|lead|director|founder|owner|architect|administrator|officer|associate|student|werkstudent|product|marketing|sales|operations|logistics|finance|accountant|teacher|professor|trader)\b/i
const rolePhraseStartPattern =
  /\b(?:working\s+student(?:\s+in)?|student\s+assistant|internship(?:\s+in)?|intern|(?:(?:senior|junior|lead|principal|associate|freelance|independent|product|project|business|data|investment|financial|software|research|marketing|sales|operations|logistics)\s+){0,3}(?:engineer|developer|manager|analyst|consultant|assistant|researcher|scientist|designer|specialist|coordinator|director|architect|administrator|officer|student|trader)|founder|owner|professor|teacher|werkstudent)\b/i
const institutionPattern =
  /\b(university|universitaet|hochschule|college|institute|institut|school|academy|polytechnic|gymnasium|tum|lmu|rwth|tu\s+[a-z])\b/i
const degreeTokenPattern =
  "(?:bachelor(?:'s)?|master(?:'s)?|b\\.?\\s?sc\\.?|m\\.?\\s?sc\\.?|b\\.?\\s?eng\\.?|m\\.?\\s?eng\\.?|b\\.?\\s?tech\\.?|m\\.?\\s?tech\\.?|b\\.?\\s?a\\.?|m\\.?\\s?a\\.?|mba|ph\\.?\\s?d\\.?|doctorate|diploma|diplom|degree|certificate|apprenticeship|ausbildung)"
const degreePattern = new RegExp(`\\b${degreeTokenPattern}`, 'i')

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function normaliseKey(value: string) {
  return cleanCvText(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
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

function evidenceFromUnits(units: CvSourceUnit[]): CvSourceEvidence[] {
  const byBlock = new Map<
    string,
    CvSourceEvidence & { texts: string[] }
  >()

  for (const unit of units) {
    const sourceText = unit.rawText.trim() || unit.text.trim()
    const existing = byBlock.get(unit.block.id)

    if (existing) {
      existing.lineIds = [
        ...new Set([...existing.lineIds, ...unit.lineIds]),
      ]
      if (
        sourceText &&
        !existing.texts.some((text) => normaliseKey(text) === normaliseKey(sourceText))
      ) {
        existing.texts.push(sourceText)
      }
      continue
    }

    byBlock.set(unit.block.id, {
      blockId: unit.block.id,
      lineIds: [...unit.lineIds],
      page: unit.block.page,
      column: unit.block.column,
      text: '',
      texts: sourceText ? [sourceText] : [unit.block.text],
    })
  }

  return [...byBlock.values()].map(({ texts, ...evidence }) => ({
    ...evidence,
    text: texts.join('\n'),
  }))
}

function candidate<TValue>(
  id: string,
  kind: CvCandidateKind,
  value: TValue,
  confidence: number,
  units: CvSourceUnit[],
  warnings: string[]
): CvCandidate<TValue> {
  const evidence = evidenceFromUnits(units)

  return {
    id,
    kind,
    value,
    confidence: clampConfidence(confidence),
    sourceBlockIds: evidence.map((item) => item.blockId),
    evidence,
    warnings: [...new Set(warnings)],
    sourceOrder: Math.min(
      ...units.map((unit) => unit.sourceOrder),
      Number.MAX_SAFE_INTEGER
    ),
  }
}

function organisationName(value: string) {
  const cleaned = cleanCvText(value)
    .replace(/\s*\((?:start-?up|startup)\)\s*$/i, '')
  const [name] = cleaned.split(/\s*,\s*/, 1)
  return cleanCvText(name || cleaned)
}

function splitParentheticalRole(text: string) {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text)
  if (!match || !rolePattern.test(match[2])) return null

  return {
    contextText: organisationName(match[1]),
    entryText: cleanCvText(match[2]),
  }
}

function splitRoleFirstComma(text: string) {
  const match = /^(.*?),\s*(.+)$/.exec(text)
  if (!match) return null

  const left = cleanCvText(match[1])
  const right = cleanCvText(match[2])

  if (
    rolePattern.test(left) &&
    !rolePattern.test(right) &&
    right.split(/\s+/).length <= 5
  ) {
    return {
      contextText: right,
      entryText: left,
    }
  }

  return null
}

function splitCombinedHeader(text: string) {
  const atMatch = /^(.*?)\s+(?:at|@)\s+(.+)$/i.exec(text)
  if (atMatch) {
    const first = cleanCvText(atMatch[1])
    const second = cleanCvText(atMatch[2])

    return rolePattern.test(first)
      ? { contextText: second, entryText: first }
      : { contextText: first, entryText: second }
  }

  const separator =
    /^(.*?)\s+(?:[|\u00b7]|[-\u2013\u2014])\s+(.+)$/.exec(text)

  if (!separator) return null

  const first = cleanCvText(separator[1])
  const second = cleanCvText(separator[2])
  const firstRole = rolePattern.test(first)
  const firstCompany = companyPattern.test(first)
  const secondRole = rolePattern.test(second)
  const secondCompany = companyPattern.test(second)

  if (firstRole && (secondCompany || !secondRole)) {
    return { contextText: second, entryText: first }
  }

  if ((firstCompany || !firstRole) && secondRole) {
    return { contextText: first, entryText: second }
  }

  return null
}

function splitInlineExperienceHeader(
  value: string,
  entryHeader: boolean
) {
  const text = cleanCvText(value)
  if (!text) {
    return { contextText: null, entryText: null }
  }

  const parenthetical = splitParentheticalRole(text)
  if (parenthetical) return parenthetical

  const roleFirst = splitRoleFirstComma(text)
  if (roleFirst) return roleFirst

  const combined = splitCombinedHeader(text)
  if (combined) return combined

  const roleMatch = rolePhraseStartPattern.exec(text)
  if (roleMatch) {
    if (roleMatch.index > 0) {
      return {
        contextText: cleanCvText(text.slice(0, roleMatch.index)),
        entryText: cleanCvText(text.slice(roleMatch.index)),
      }
    }

    return { contextText: null, entryText: text }
  }

  if (entryHeader || companyPattern.test(text)) {
    return { contextText: text, entryText: null }
  }

  return { contextText: null, entryText: text }
}

function degreeFields(text: string) {
  const match = new RegExp(
    `^(${degreeTokenPattern})(?:\\s+(?:in|of)\\b)?\\s*(.*)$`,
    'i'
  ).exec(text)

  if (!match) {
    return { degree: text, field: null as string | null }
  }

  return {
    degree: cleanCvText(match[1]),
    field: cleanCvText(match[2]) || null,
  }
}

function splitInlineEducationHeader(
  value: string,
  entryHeader: boolean
) {
  const text = cleanCvText(value)
  if (!text) {
    return { contextText: null, entryText: null }
  }

  const degreeMatch = new RegExp(`\\b${degreeTokenPattern}`, 'i').exec(
    text
  )

  if (degreeMatch && degreeMatch.index > 0) {
    return {
      contextText: cleanCvText(text.slice(0, degreeMatch.index)),
      entryText: cleanCvText(text.slice(degreeMatch.index)),
    }
  }

  if (degreePattern.test(text)) {
    return { contextText: null, entryText: text }
  }

  if (entryHeader || institutionPattern.test(text)) {
    return { contextText: text, entryText: null }
  }

  return { contextText: null, entryText: text }
}

function experienceFields(group: CvEntryGroup) {
  const warnings: string[] = []
  let company = group.contextText
    ? organisationName(group.contextText)
    : null
  let role = group.entryText
    ? cleanCvText(group.entryText)
    : null

  if (!company && role) {
    const fallback = splitInlineExperienceHeader(role, false)
    if (fallback.contextText) {
      company = organisationName(fallback.contextText)
      role = fallback.entryText
    }
  }

  if (role && !rolePattern.test(role)) {
    warnings.push('ambiguous-role')
  }

  if (!role) warnings.push('missing-role')
  if (!company) warnings.push('missing-company')

  return { role, company, warnings }
}

function educationFields(group: CvEntryGroup) {
  const warnings: string[] = []
  const institution = group.contextText
    ? organisationName(group.contextText)
    : null
  let degree: string | null = null
  let field: string | null = null

  if (group.entryText) {
    const parsed = degreeFields(group.entryText)
    degree = parsed.degree || null
    field = parsed.field
  }

  if (!institution) warnings.push('missing-institution')
  if (!degree) warnings.push('missing-degree')

  return { institution, degree, field, warnings }
}

function experienceCandidates(
  classified: ClassifiedCvDocument
): Array<CvCandidate<CvExperienceValue>> {
  const groups = segmentCvEntries(classified, {
    section: 'experience',
    isContext: (text) => companyPattern.test(text),
    splitInlineHeader: splitInlineExperienceHeader,
  })

  const candidates = groups.map((group, index) => {
    const fields = experienceFields(group)
    const warnings = [...fields.warnings]

    if (!group.dateRange) warnings.push('missing-date')
    if (group.dateRange?.singleDate) warnings.push('single-date')

    const description = group.description
      .map(cleanCvText)
      .filter(Boolean)
      .join('\n')

    const confidence =
      0.25 +
      (fields.role ? 0.2 : 0) +
      (fields.company ? 0.2 : 0) +
      (group.dateRange ? 0.2 : 0) +
      (group.header.length > 0 ? 0.05 : 0) +
      (warnings.some((warning) => warning.startsWith('ambiguous'))
        ? 0
        : 0.05)

    return candidate(
      `experience-${index + 1}`,
      'experience',
      {
        company: fields.company,
        role: fields.role,
        startDate: group.dateRange?.startDate ?? null,
        endDate: group.dateRange?.endDate ?? null,
        description,
      },
      confidence,
      group.units,
      warnings
    )
  })

  return sortExperienceCandidates(candidates)
}

function educationCandidates(
  classified: ClassifiedCvDocument
): Array<CvCandidate<CvEducationValue>> {
  const groups = segmentCvEntries(classified, {
    section: 'education',
    isContext: (text) => institutionPattern.test(text),
    splitInlineHeader: splitInlineEducationHeader,
  })

  const candidates = groups.map((group, index) => {
    const fields = educationFields(group)
    const warnings = [...fields.warnings]

    if (!group.dateRange) warnings.push('missing-date')
    if (group.dateRange?.singleDate) warnings.push('single-date')

    const description = group.description
      .map(cleanCvText)
      .filter(Boolean)
      .join('\n')

    const confidence =
      0.25 +
      (fields.institution ? 0.2 : 0) +
      (fields.degree ? 0.2 : 0) +
      (group.dateRange ? 0.2 : 0) +
      (group.header.length > 0 ? 0.05 : 0) +
      (warnings.some((warning) => warning.startsWith('ambiguous'))
        ? 0
        : 0.05)

    return candidate(
      `education-${index + 1}`,
      'education',
      {
        institution: fields.institution,
        degree: fields.degree,
        field: fields.field,
        startDate: group.dateRange?.startDate ?? null,
        endDate: group.dateRange?.endDate ?? null,
        description,
      },
      confidence,
      group.units,
      warnings
    )
  })

  return sortEducationCandidates(candidates)
}

function splitListUnit(unit: CvSourceUnit) {
  const parts = unit.text
    .split(/[|,;\u2022\u00b7]/)
    .map(cleanCvText)
    .filter(Boolean)

  return parts.length > 0 ? parts : [cleanCvText(unit.text)]
}

function simpleCandidates<TValue extends { name: string }>(
  kind: 'skill' | 'language',
  units: CvSourceUnit[],
  valueFor: (text: string) => TValue
): Array<CvCandidate<TValue>> {
  const byName = new Map<
    string,
    { value: TValue; units: CvSourceUnit[]; sourceOrder: number }
  >()

  for (const unit of units) {
    for (const part of splitListUnit(unit)) {
      const value = valueFor(part)
      const key = normaliseKey(value.name)
      if (!key || /^\d+$/.test(key)) continue

      const existing = byName.get(key)
      if (existing) {
        existing.units.push(unit)
        continue
      }

      byName.set(key, {
        value,
        units: [unit],
        sourceOrder: unit.sourceOrder,
      })
    }
  }

  return [...byName.values()]
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((item, index) =>
      candidate(
        `${kind}-${index + 1}`,
        kind,
        item.value,
        0.9,
        uniqueUnits(item.units),
        []
      )
    )
}

const proficiencyPattern = new RegExp(
  [
    'A1|A2|B1|B2|C1|C2',
    'native|mother tongue|fluent|professional|advanced|intermediate|basic',
    'muttersprache|fliessend|flie\u00dfend|verhandlungssicher|fortgeschritten|grundkenntnisse',
  ].join('|'),
  'i'
)

function languageValue(text: string): CvLanguageValue {
  const parenthesized = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text)
  if (parenthesized && proficiencyPattern.test(parenthesized[2])) {
    return {
      name: cleanCvText(parenthesized[1]),
      proficiency: cleanCvText(parenthesized[2]),
    }
  }

  const trailing = new RegExp(
    `^(.*?)\\s+(${proficiencyPattern.source})$`,
    'i'
  ).exec(text)

  if (trailing) {
    return {
      name: cleanCvText(trailing[1]),
      proficiency: cleanCvText(trailing[2]),
    }
  }

  return { name: cleanCvText(text), proficiency: null }
}

function skillValue(text: string): CvSkillValue {
  return {
    name: cleanCvText(
      text.replace(
        /^(?:tools?|technologies|tech stack|software|systems?)\s*:\s*/i,
        ''
      )
    ),
  }
}

function summaryCandidates(
  classified: ClassifiedCvDocument
): Array<CvCandidate<CvSummaryValue>> {
  const units = unitsForCvSection(classified, 'summary')
  if (units.length === 0) return []

  const text = units
    .map((unit) => unit.text)
    .map(cleanCvText)
    .filter(Boolean)
    .join('\n')

  if (!text) return []

  return [
    candidate(
      'summary-1',
      'summary',
      { text },
      0.9,
      units,
      []
    ),
  ]
}

export function extractDeterministicCvCandidates(
  classified: ClassifiedCvDocument
): CvCandidateSet {
  return {
    headline: [],
    summary: summaryCandidates(classified),
    experience: experienceCandidates(classified),
    education: educationCandidates(classified),
    skills: simpleCandidates<CvSkillValue>(
      'skill',
      unitsForCvSection(classified, 'skills'),
      skillValue
    ),
    languages: simpleCandidates<CvLanguageValue>(
      'language',
      unitsForCvSection(classified, 'languages'),
      languageValue
    ),
  }
}

export { extractCvDateRange } from './cvDates.js'
export type { DateRangeExtraction } from './cvDates.js'
