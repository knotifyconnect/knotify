import type {
  CvAnalysisResult,
  CvCandidate,
  CvCandidateKind,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
} from '../intelligence/cv/contracts.js'
import type {
  CvProfilePreview,
  CvProfilePreviewEducation,
  CvProfilePreviewExperience,
  CvProfilePreviewSkill,
} from './cvProfilePreview.js'

export type CvReviewState = 'ready' | 'review' | 'unresolved'

export type CvReviewAction =
  | 'add'
  | 'already-present'
  | 'keep-existing'
  | 'review'

export type CvExtractionMethod =
  | 'deterministic'
  | 'model-resolved'

export interface CvReviewEvidence {
  page: number
  text: string
}

export interface CvReviewItem<TExisting = unknown> {
  candidateId: string
  state: CvReviewState
  action: CvReviewAction
  confidence: 'high' | 'medium' | 'low'
  extractionMethod: CvExtractionMethod
  reasonCodes: string[]
  warnings: string[]
  evidence: CvReviewEvidence[]
  existingValue: TExisting | null
}

export interface CvUnresolvedReviewItem {
  candidateId: string
  kind: CvCandidateKind
  state: 'unresolved'
  action: 'review'
  reasonCodes: string[]
  warnings: string[]
  evidence: CvReviewEvidence[]
}

export interface CvExistingProfileSnapshot {
  headline: string | null
  bio: string | null
  languages: string[]
  education: Array<{
    institution: string
    degree: string
    field: string
    startYear: number | null
    endYear: number | null
  }>
  experience: Array<{
    company: string
    role: string
    startDate: string | null
    endDate: string | null
  }>
  skills: Array<{
    catalogSkillId: number | null
    name: string
  }>
}

export interface CvProfilePreviewReview {
  comparisonAvailable: boolean
  summary: {
    ready: number
    review: number
    unresolved: number
    alreadyPresent: number
    protectedExisting: number
  }
  headline: CvReviewItem<string> | null
  bio: CvReviewItem<string> | null
  education: Array<CvReviewItem<CvExistingProfileSnapshot['education'][number]>>
  experience: Array<CvReviewItem<CvExistingProfileSnapshot['experience'][number]>>
  skills: Array<CvReviewItem<CvExistingProfileSnapshot['skills'][number]>>
  languages: Array<CvReviewItem<string>>
  unresolved: CvUnresolvedReviewItem[]
}

const MAX_EVIDENCE_ITEMS = 3
const MAX_EVIDENCE_TEXT = 240

function normaliseKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function confidenceLabel(value: number) {
  if (value >= 0.8) return 'high' as const
  if (value >= 0.55) return 'medium' as const
  return 'low' as const
}

function evidenceFor(candidate: CvCandidate<unknown>) {
  const seen = new Set<string>()
  const output: CvReviewEvidence[] = []

  for (const evidence of candidate.evidence) {
    const text = evidence.text.replace(/\s+/g, ' ').trim()
    if (!text) continue

    const key = `${evidence.page}:${normaliseKey(text)}`
    if (seen.has(key)) continue
    seen.add(key)

    output.push({
      page: evidence.page,
      text: text.slice(0, MAX_EVIDENCE_TEXT),
    })

    if (output.length >= MAX_EVIDENCE_ITEMS) break
  }

  return output
}

function methodFor(candidate: CvCandidate<unknown>): CvExtractionMethod {
  return candidate.warnings.includes('model-assisted')
    ? 'model-resolved'
    : 'deterministic'
}

function candidateReasonCodes(candidate: CvCandidate<unknown>) {
  const confidence = confidenceLabel(candidate.confidence)
  const reasons: string[] = []

  if (confidence === 'medium') reasons.push('medium-confidence')
  if (confidence === 'low') reasons.push('low-confidence')

  if (candidate.warnings.some((warning) => warning !== 'model-assisted')) {
    reasons.push('candidate-warning')
  }

  if (candidate.warnings.includes('model-assisted')) {
    reasons.push('model-resolved')
  }

  return reasons
}

function reviewState(
  candidate: CvCandidate<unknown>,
  action: CvReviewAction,
  extraReasons: string[]
): CvReviewState {
  if (action === 'keep-existing' || action === 'review') {
    return 'review'
  }

  const confidence = confidenceLabel(candidate.confidence)
  const hasCandidateWarning = candidate.warnings.some(
    (warning) => warning !== 'model-assisted'
  )

  if (
    confidence !== 'high' ||
    hasCandidateWarning ||
    extraReasons.includes('catalog-match-required')
  ) {
    return 'review'
  }

  return 'ready'
}

function itemReview<TExisting>(
  candidate: CvCandidate<unknown>,
  action: CvReviewAction,
  existingValue: TExisting | null,
  extraReasons: string[] = []
): CvReviewItem<TExisting> {
  const reasonCodes = [
    ...candidateReasonCodes(candidate),
    ...extraReasons,
  ]

  return {
    candidateId: candidate.id,
    state: reviewState(candidate, action, reasonCodes),
    action,
    confidence: confidenceLabel(candidate.confidence),
    extractionMethod: methodFor(candidate),
    reasonCodes: [...new Set(reasonCodes)],
    warnings: [...new Set(candidate.warnings)],
    evidence: evidenceFor(candidate),
    existingValue,
  }
}

function scalarReview(
  candidate: CvCandidate<unknown> | undefined,
  proposedValue: string | null,
  existingValue: string | null,
  comparisonAvailable: boolean
): CvReviewItem<string> | null {
  if (!candidate || !proposedValue) return null

  if (!comparisonAvailable) {
    return itemReview<string>(candidate, 'add', null, [
      'existing-comparison-unavailable',
    ])
  }

  if (!existingValue) {
    return itemReview<string>(candidate, 'add', null)
  }

  if (normaliseKey(existingValue) === normaliseKey(proposedValue)) {
    return itemReview(candidate, 'already-present', existingValue, [
      'existing-exact-match',
    ])
  }

  return itemReview(candidate, 'keep-existing', existingValue, [
    'existing-value-protected',
  ])
}

function educationKey(value: {
  institution: string
  degree: string
  field: string
  startYear: number | null
  endYear: number | null
}) {
  return [
    normaliseKey(value.institution),
    normaliseKey(value.degree),
    normaliseKey(value.field),
    value.startYear ?? '',
    value.endYear ?? '',
  ].join('|')
}

function educationIdentity(value: {
  institution: string
  degree: string
  field: string
}) {
  return [
    normaliseKey(value.institution),
    normaliseKey(value.degree),
    normaliseKey(value.field),
  ].join('|')
}

function experienceKey(value: {
  company: string
  role: string
  startDate: string | null
  endDate: string | null
}) {
  return [
    normaliseKey(value.company),
    normaliseKey(value.role),
    value.startDate ?? '',
    value.endDate ?? '',
  ].join('|')
}

function experienceIdentity(value: {
  company: string
  role: string
}) {
  return [normaliseKey(value.company), normaliseKey(value.role)].join('|')
}

function educationReview(
  candidate: CvCandidate<CvEducationValue>,
  item: CvProfilePreviewEducation,
  existing: CvExistingProfileSnapshot['education'],
  comparisonAvailable: boolean
) {
  if (!comparisonAvailable) {
    return itemReview<CvExistingProfileSnapshot['education'][number]>(
      candidate,
      'add',
      null,
      ['existing-comparison-unavailable']
    )
  }

  const exact = existing.find(
    (value) => educationKey(value) === educationKey(item)
  )

  if (exact) {
    return itemReview(candidate, 'already-present', exact, [
      'existing-exact-match',
    ])
  }

  const possibleConflict = existing.find(
    (value) => educationIdentity(value) === educationIdentity(item)
  )

  if (possibleConflict) {
    return itemReview(candidate, 'review', possibleConflict, [
      'possible-existing-conflict',
    ])
  }

  return itemReview<CvExistingProfileSnapshot['education'][number]>(
    candidate,
    'add',
    null
  )
}

function experienceReview(
  candidate: CvCandidate<CvExperienceValue>,
  item: CvProfilePreviewExperience,
  existing: CvExistingProfileSnapshot['experience'],
  comparisonAvailable: boolean
) {
  if (!comparisonAvailable) {
    return itemReview<CvExistingProfileSnapshot['experience'][number]>(
      candidate,
      'add',
      null,
      ['existing-comparison-unavailable']
    )
  }

  const exact = existing.find(
    (value) => experienceKey(value) === experienceKey(item)
  )

  if (exact) {
    return itemReview(candidate, 'already-present', exact, [
      'existing-exact-match',
    ])
  }

  const possibleConflict = existing.find(
    (value) => experienceIdentity(value) === experienceIdentity(item)
  )

  if (possibleConflict) {
    return itemReview(candidate, 'review', possibleConflict, [
      'possible-existing-conflict',
    ])
  }

  return itemReview<CvExistingProfileSnapshot['experience'][number]>(
    candidate,
    'add',
    null
  )
}

function skillReview(
  candidate: CvCandidate<unknown>,
  item: CvProfilePreviewSkill,
  existing: CvExistingProfileSnapshot['skills'],
  comparisonAvailable: boolean
) {
  if (!comparisonAvailable) {
    return itemReview<CvExistingProfileSnapshot['skills'][number]>(
      candidate,
      'add',
      null,
      [
        'existing-comparison-unavailable',
        ...(item.matchedCatalog ? [] : ['catalog-match-required']),
      ]
    )
  }

  const exact = existing.find((value) => {
    if (
      item.catalogSkillId !== null &&
      value.catalogSkillId === item.catalogSkillId
    ) {
      return true
    }

    return normaliseKey(value.name) === normaliseKey(item.name)
  })

  if (exact) {
    return itemReview(candidate, 'already-present', exact, [
      'existing-exact-match',
    ])
  }

  return itemReview<CvExistingProfileSnapshot['skills'][number]>(
    candidate,
    'add',
    null,
    [...(item.matchedCatalog ? [] : ['catalog-match-required'])]
  )
}

function languageReview(
  candidate: CvCandidate<unknown>,
  language: string,
  existing: string[],
  comparisonAvailable: boolean
) {
  if (!comparisonAvailable) {
    return itemReview<string>(candidate, 'add', null, [
      'existing-comparison-unavailable',
    ])
  }

  const exact = existing.find(
    (value) => normaliseKey(value) === normaliseKey(language)
  )

  if (exact) {
    return itemReview(candidate, 'already-present', exact, [
      'existing-exact-match',
    ])
  }

  return itemReview<string>(candidate, 'add', null)
}

function bestTextCandidate<T>(candidates: Array<CvCandidate<T>>) {
  return [...candidates].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.sourceOrder - right.sourceOrder
  )[0]
}

function unresolvedItems(candidates: CvCandidateSet) {
  const output: CvUnresolvedReviewItem[] = []

  for (const candidate of candidates.experience) {
    const reasons: string[] = []
    if (!candidate.value.company?.trim()) reasons.push('missing-company')
    if (!candidate.value.role?.trim()) reasons.push('missing-role')
    if (reasons.length === 0) continue

    output.push({
      candidateId: candidate.id,
      kind: candidate.kind,
      state: 'unresolved',
      action: 'review',
      reasonCodes: reasons,
      warnings: [...new Set(candidate.warnings)],
      evidence: evidenceFor(candidate),
    })
  }

  for (const candidate of candidates.education) {
    const reasons: string[] = []
    if (!candidate.value.institution?.trim()) {
      reasons.push('missing-institution')
    }
    if (reasons.length === 0) continue

    output.push({
      candidateId: candidate.id,
      kind: candidate.kind,
      state: 'unresolved',
      action: 'review',
      reasonCodes: reasons,
      warnings: [...new Set(candidate.warnings)],
      evidence: evidenceFor(candidate),
    })
  }

  return output
}

function candidateById<T>(
  candidates: Array<CvCandidate<T>>,
  candidateId: string
) {
  return candidates.find((candidate) => candidate.id === candidateId)
}

export function buildCvProfileReview(
  analysis: CvAnalysisResult,
  preview: Omit<CvProfilePreview, 'review'>,
  existingProfile?: CvExistingProfileSnapshot | null
): CvProfilePreviewReview {
  const comparisonAvailable = Boolean(existingProfile)
  const existing: CvExistingProfileSnapshot = existingProfile ?? {
    headline: null,
    bio: null,
    languages: [],
    education: [],
    experience: [],
    skills: [],
  }

  const headlineCandidate = bestTextCandidate(
    analysis.candidates.headline
  )
  const summaryCandidate = bestTextCandidate(
    analysis.candidates.summary
  )

  const headline = scalarReview(
    headlineCandidate,
    preview.headline,
    existing.headline,
    comparisonAvailable
  )
  const bio = scalarReview(
    summaryCandidate,
    preview.bio,
    existing.bio,
    comparisonAvailable
  )

  const education = preview.education.flatMap((item) => {
    const candidate = candidateById(
      analysis.candidates.education,
      item.candidateId
    )
    return candidate
      ? [educationReview(candidate, item, existing.education, comparisonAvailable)]
      : []
  })

  const experience = preview.experience.flatMap((item) => {
    const candidate = candidateById(
      analysis.candidates.experience,
      item.candidateId
    )
    return candidate
      ? [experienceReview(candidate, item, existing.experience, comparisonAvailable)]
      : []
  })

  const skills = preview.skills.flatMap((item) => {
    const candidate = candidateById(
      analysis.candidates.skills,
      item.candidateId
    )
    return candidate
      ? [skillReview(candidate, item, existing.skills, comparisonAvailable)]
      : []
  })

  const languages = preview.languages.flatMap((language) => {
    const candidate = analysis.candidates.languages.find(
      (item) => normaliseKey(item.value.name) === normaliseKey(language)
    )
    return candidate
      ? [languageReview(candidate, language, existing.languages, comparisonAvailable)]
      : []
  })

  const unresolved = unresolvedItems(analysis.candidates)
  const allItems = [
    ...(headline ? [headline] : []),
    ...(bio ? [bio] : []),
    ...education,
    ...experience,
    ...skills,
    ...languages,
  ]

  return {
    comparisonAvailable,
    summary: {
      ready: allItems.filter(
        (item) => item.state === 'ready' && item.action === 'add'
      ).length,
      review: allItems.filter((item) => item.state === 'review').length,
      unresolved: unresolved.length,
      alreadyPresent: allItems.filter(
        (item) => item.action === 'already-present'
      ).length,
      protectedExisting: allItems.filter(
        (item) => item.action === 'keep-existing'
      ).length,
    },
    headline,
    bio,
    education,
    experience,
    skills,
    languages,
    unresolved,
  }
}
