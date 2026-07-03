import type { ModelGateway } from '../runtime/ModelGateway.js'

export const cvEvaluationCoverageTags = [
  'one-column',
  'two-column',
  'german',
  'english',
  'right-aligned-dates',
  'company-before-role',
  'role-before-company',
  'undated-entry',
  'table-layout',
  'icons',
  'multi-page',
  'unusual-section-name',
  'multiple-degrees',
  'language-proficiency',
  'multi-role-line',
  'parent-child-hierarchy',
  'incomplete-entry-retention',
  'unknown-section-boundary',
  'wrapped-continuation-lines',
  'hanging-indent',
  'hyphenated-line-break',
] as const

export type CvEvaluationCoverageTag =
  (typeof cvEvaluationCoverageTags)[number]

export interface ExpectedCvExperience {
  company: string | null
  role: string | null
  startDate: string | null
  endDate: string | null
}

export interface ExpectedCvEducation {
  institution: string | null
  degree: string | null
  field: string | null
  startDate: string | null
  endDate: string | null
}

export interface ExpectedCvLanguage {
  name: string
  proficiency: string | null
}

export interface ExpectedCvResult {
  experience: ExpectedCvExperience[]
  education: ExpectedCvEducation[]
  skills: string[]
  languages: ExpectedCvLanguage[]
  forbiddenDescriptionText: string[]
  requiredDescriptionText: string[]
}

export interface CvEvaluationFixtureDefinition {
  id: string
  coverage: CvEvaluationCoverageTag[]
  expected: ExpectedCvResult
  buffer: Buffer
}

export interface CvEvaluationRuntime {
  gateway?: ModelGateway
  model?: string
  timeoutMs?: number
}

export interface CvEvaluationCounts {
  expectedExperience: number
  matchedExperience: number
  actualExperience: number
  expectedEducation: number
  matchedEducation: number
  actualEducation: number
  dateFields: number
  correctDateFields: number
  expectedSkills: number
  matchedSkills: number
  actualSkills: number
  expectedLanguages: number
  matchedLanguages: number
  actualLanguages: number
  fabricatedRecords: number
  unsupportedValues: number
  validOutputs: number
  stableOrdering: number
  modelAttempts: number
  modelFallbacks: number
  sectionLeakage: number
  expectedDescriptionFragments: number
  matchedDescriptionFragments: number
  truncatedDescriptionFields: number
}

export interface CvEvaluationMetrics {
  experienceRecall: number
  educationRecall: number
  companyRolePrecision: number
  dateAccuracy: number
  skillPrecision: number
  skillRecall: number
  languagePrecision: number
  languageRecall: number
  fabricatedRecords: number
  unsupportedValues: number
  validStructuredOutputRate: number
  stableOrderingRate: number
  fallbackFrequency: number
  processingDurationMs: number
  sectionLeakage: number
  descriptionCompleteness: number
  truncatedDescriptionFields: number
}

export interface CvEvaluationFixtureReport {
  id: string
  coverage: CvEvaluationCoverageTag[]
  durationMs: number
  counts: CvEvaluationCounts
  metrics: CvEvaluationMetrics
  warnings: string[]
  model: {
    attempted: boolean
    used: boolean
    errorCode: string | null
  }
}

export interface CvEvaluationQualityTargets {
  experienceRecall: number
  educationRecall: number
  companyRolePrecision: number
  dateAccuracy: number
  fabricatedRecords: number
  validStructuredOutputRate: number
  stableOrderingRate: number
  sectionLeakage: number
  descriptionCompleteness: number
  truncatedDescriptionFields: number
}

export interface CvEvaluationReport {
  mode: 'deterministic' | 'local-model'
  fixtureCount: number
  coverage: CvEvaluationCoverageTag[]
  durationMs: number
  metrics: CvEvaluationMetrics
  targets: CvEvaluationQualityTargets
  qualityGatePassed: boolean
  failedTargets: string[]
  fixtures: CvEvaluationFixtureReport[]
}
