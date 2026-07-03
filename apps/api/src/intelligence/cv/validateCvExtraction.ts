import type {
  CvCandidate,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
} from './contracts.js'
import {
  sortEducationCandidates,
  sortExperienceCandidates,
} from './sortCvEntries.js'

export interface CvValidationResult {
  candidates: CvCandidateSet
  warnings: string[]
}

function normalise(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateKey(value: { iso: string | null; current: boolean } | null) {
  if (!value) return ''
  return value.current ? 'current' : value.iso ?? ''
}

function mergeCandidate<T>(
  target: CvCandidate<T>,
  duplicate: CvCandidate<T>
) {
  target.confidence = Math.max(target.confidence, duplicate.confidence)
  target.sourceOrder = Math.min(target.sourceOrder, duplicate.sourceOrder)
  target.warnings = [
    ...new Set([...target.warnings, ...duplicate.warnings]),
  ]

  const evidenceByBlock = new Map(
    target.evidence.map((item) => [item.blockId, item])
  )

  for (const evidence of duplicate.evidence) {
    const existing = evidenceByBlock.get(evidence.blockId)
    if (existing) {
      existing.lineIds = [
        ...new Set([...existing.lineIds, ...evidence.lineIds]),
      ]
    } else {
      target.evidence.push(evidence)
      evidenceByBlock.set(evidence.blockId, evidence)
    }
  }

  target.sourceBlockIds = target.evidence.map((item) => item.blockId)
}

function deduplicate<T>(
  candidates: Array<CvCandidate<T>>,
  keyFor: (candidate: CvCandidate<T>) => string
) {
  const byKey = new Map<string, CvCandidate<T>>()

  for (const candidate of candidates) {
    candidate.confidence = Math.max(0, Math.min(1, candidate.confidence))
    candidate.warnings = [...new Set(candidate.warnings)]
    candidate.sourceBlockIds = [...new Set(candidate.sourceBlockIds)]

    const key = keyFor(candidate)
    const existing = byKey.get(key)

    if (existing) {
      mergeCandidate(existing, candidate)
    } else {
      byKey.set(key, candidate)
    }
  }

  return [...byKey.values()]
}

function experienceKey(
  candidate: CvCandidate<CvExperienceValue>
) {
  return [
    normalise(candidate.value.company),
    normalise(candidate.value.role),
    dateKey(candidate.value.startDate),
    dateKey(candidate.value.endDate),
  ].join('|')
}

function educationKey(
  candidate: CvCandidate<CvEducationValue>
) {
  return [
    normalise(candidate.value.institution),
    normalise(candidate.value.degree),
    normalise(candidate.value.field),
    dateKey(candidate.value.startDate),
    dateKey(candidate.value.endDate),
  ].join('|')
}

export function validateCvExtraction(
  input: CvCandidateSet
): CvValidationResult {
  const candidates: CvCandidateSet = {
    headline: deduplicate(input.headline, (candidate) =>
      normalise(candidate.value.text)
    ).sort((left, right) => left.sourceOrder - right.sourceOrder),
    summary: deduplicate(input.summary, (candidate) =>
      normalise(candidate.value.text)
    ).sort((left, right) => left.sourceOrder - right.sourceOrder),
    experience: sortExperienceCandidates(
      deduplicate(input.experience, experienceKey)
    ),
    education: sortEducationCandidates(
      deduplicate(input.education, educationKey)
    ),
    skills: deduplicate(input.skills, (candidate) =>
      normalise(candidate.value.name)
    ).sort((left, right) => left.sourceOrder - right.sourceOrder),
    languages: deduplicate(input.languages, (candidate) =>
      normalise(candidate.value.name)
    ).sort((left, right) => left.sourceOrder - right.sourceOrder),
  }

  const warnings: string[] = []

  for (const group of Object.values(candidates)) {
    for (const candidate of group) {
      if (candidate.evidence.length === 0) {
        warnings.push(`candidate-without-evidence:${candidate.id}`)
      }
      if (candidate.sourceBlockIds.length === 0) {
        warnings.push(`candidate-without-source-block:${candidate.id}`)
      }
    }
  }

  return { candidates, warnings }
}