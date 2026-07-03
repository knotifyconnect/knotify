import type { DocumentBlock } from '../document/contracts.js'

export type CvSectionKind =
  | 'header'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'projects'
  | 'certifications'
  | 'other'

export type CvCandidateKind =
  | 'headline'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skill'
  | 'language'

export type CvDatePrecision = 'year' | 'month'

export interface CvNormalizedDate {
  raw: string
  iso: string | null
  year: number | null
  month: number | null
  current: boolean
  precision: CvDatePrecision | null
}

export interface CvSourceEvidence {
  blockId: string
  lineIds: string[]
  page: number
  column: number
  text: string
}

export interface CvCandidate<TValue> {
  id: string
  kind: CvCandidateKind
  value: TValue
  confidence: number
  sourceBlockIds: string[]
  evidence: CvSourceEvidence[]
  warnings: string[]
  sourceOrder: number
}

export interface CvHeadlineValue {
  text: string
}

export interface CvSummaryValue {
  text: string
}

export interface CvExperienceValue {
  company: string | null
  role: string | null
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
  description: string
}

export interface CvEducationValue {
  institution: string | null
  degree: string | null
  field: string | null
  startDate: CvNormalizedDate | null
  endDate: CvNormalizedDate | null
  description: string
}

export interface CvSkillValue {
  name: string
}

export interface CvLanguageValue {
  name: string
  proficiency: string | null
}

export interface ClassifiedCvBlock {
  block: DocumentBlock
  section: CvSectionKind
  headingSection: CvSectionKind | null
  contentText: string
}

export interface ClassifiedCvDocument {
  blocks: ClassifiedCvBlock[]
}

export interface CvCandidateSet {
  headline: Array<CvCandidate<CvHeadlineValue>>
  summary: Array<CvCandidate<CvSummaryValue>>
  experience: Array<CvCandidate<CvExperienceValue>>
  education: Array<CvCandidate<CvEducationValue>>
  skills: Array<CvCandidate<CvSkillValue>>
  languages: Array<CvCandidate<CvLanguageValue>>
}

export interface CvModelSuggestion {
  kind: CvCandidateKind
  targetCandidateId: string | null
  sourceBlockIds: string[]
  confidence: number
  text: string | null
  company: string | null
  role: string | null
  institution: string | null
  degree: string | null
  field: string | null
  startDate: string | null
  endDate: string | null
  proficiency: string | null
}

export interface CvModelInterpretation {
  suggestions: CvModelSuggestion[]
}

export interface CvModelRunMetadata {
  attempted: boolean
  used: boolean
  provider: string | null
  model: string | null
  durationMs: number | null
  acceptedSuggestions: number
  rejectedSuggestions: number
  errorCode: string | null
}

export interface CvAnalysisResult {
  candidates: CvCandidateSet
  model: CvModelRunMetadata
  warnings: string[]
}
