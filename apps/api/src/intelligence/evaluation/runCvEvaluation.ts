import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import { analyseCvDocument } from '../cv/analyseCvDocument.js'
import { cvEvaluationPdfFixtures } from '../cv/__fixtures__/evaluationCorpus.js'
import type {
  CvCandidate,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
  CvNormalizedDate,
} from '../cv/contracts.js'
import { extractPdfLayout } from '../document/extractPdfLayout.js'
import { normalizeDocument } from '../document/normalizeDocument.js'
import {
  cvEvaluationCoverageTags,
  type CvEvaluationCounts,
  type CvEvaluationCoverageTag,
  type CvEvaluationFixtureDefinition,
  type CvEvaluationFixtureReport,
  type CvEvaluationMetrics,
  type CvEvaluationQualityTargets,
  type CvEvaluationReport,
  type CvEvaluationRuntime,
  type ExpectedCvEducation,
  type ExpectedCvExperience,
  type ExpectedCvLanguage,
  type ExpectedCvResult,
} from './contracts.js'

const nullableText = z.string().trim().min(1).nullable()
const expectedDate = z
  .string()
  .regex(/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$|^current$/)
  .nullable()

const expectedExperienceSchema = z.object({
  company: nullableText,
  role: nullableText,
  startDate: expectedDate,
  endDate: expectedDate,
})

const expectedEducationSchema = z.object({
  institution: nullableText,
  degree: nullableText,
  field: nullableText,
  startDate: expectedDate,
  endDate: expectedDate,
})

const expectedLanguageSchema = z.object({
  name: z.string().trim().min(1),
  proficiency: nullableText,
})

const expectedFixtureSchema = z.object({
  id: z.string().trim().min(1),
  coverage: z.array(z.enum(cvEvaluationCoverageTags)),
  expected: z.object({
    experience: z.array(expectedExperienceSchema),
    education: z.array(expectedEducationSchema),
    skills: z.array(z.string().trim().min(1)),
    languages: z.array(expectedLanguageSchema),
    forbiddenDescriptionText: z
      .array(z.string().trim().min(1))
      .default([]),
    requiredDescriptionText: z
      .array(z.string().trim().min(1))
      .default([]),
  }),
})

export const defaultCvEvaluationTargets: CvEvaluationQualityTargets = {
  experienceRecall: 0.9,
  educationRecall: 0.9,
  companyRolePrecision: 0.95,
  dateAccuracy: 0.9,
  fabricatedRecords: 0,
  validStructuredOutputRate: 1,
  stableOrderingRate: 1,
  sectionLeakage: 0,
  descriptionCompleteness: 0.95,
  truncatedDescriptionFields: 0,
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

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000
}

function dateValue(value: CvNormalizedDate | null) {
  if (!value) return null
  if (value.current) return 'current'
  if (value.year === null) return null
  if (value.precision === 'month' && value.month !== null) {
    return `${value.year}-${String(value.month).padStart(2, '0')}`
  }
  return String(value.year)
}

function experienceIdentity(value: {
  company: string | null
  role: string | null
}) {
  return `${normalise(value.company)}|${normalise(value.role)}`
}

function educationIdentity(value: {
  institution: string | null
  degree: string | null
}) {
  return `${normalise(value.institution)}|${normalise(value.degree)}`
}

function languageIdentity(value: ExpectedCvLanguage) {
  return `${normalise(value.name)}|${normalise(value.proficiency)}`
}

function candidateEvidenceText(candidate: CvCandidate<unknown>) {
  return candidate.evidence.map((item) => item.text).join('\n')
}

function isSupported(value: string | null, candidate: CvCandidate<unknown>) {
  if (!value) return true
  return normalise(candidateEvidenceText(candidate)).includes(normalise(value))
}

function countUnsupportedValues(candidates: CvCandidateSet) {
  let count = 0

  for (const candidate of candidates.experience) {
    for (const value of [candidate.value.company, candidate.value.role]) {
      if (!isSupported(value, candidate)) count += 1
    }
  }

  for (const candidate of candidates.education) {
    for (const value of [
      candidate.value.institution,
      candidate.value.degree,
      candidate.value.field,
    ]) {
      if (!isSupported(value, candidate)) count += 1
    }
  }

  for (const candidate of candidates.skills) {
    if (!isSupported(candidate.value.name, candidate)) count += 1
  }

  for (const candidate of candidates.languages) {
    if (!isSupported(candidate.value.name, candidate)) count += 1
    if (!isSupported(candidate.value.proficiency, candidate)) count += 1
  }

  return count
}

function outputIsValid(candidates: CvCandidateSet) {
  const all = [
    ...candidates.headline,
    ...candidates.summary,
    ...candidates.experience,
    ...candidates.education,
    ...candidates.skills,
    ...candidates.languages,
  ]
  const ids = new Set<string>()

  for (const candidate of all) {
    if (ids.has(candidate.id)) return false
    ids.add(candidate.id)

    if (
      candidate.confidence < 0 ||
      candidate.confidence > 1 ||
      candidate.sourceBlockIds.length === 0 ||
      candidate.evidence.length === 0
    ) {
      return false
    }
  }

  return true
}

function matchByIdentity<TExpected, TActual>(
  expected: TExpected[],
  actual: TActual[],
  expectedIdentity: (value: TExpected) => string,
  actualIdentity: (value: TActual) => string
) {
  const actualByIdentity = new Map<string, number[]>()

  actual.forEach((value, index) => {
    const key = actualIdentity(value)
    const indexes = actualByIdentity.get(key) ?? []
    indexes.push(index)
    actualByIdentity.set(key, indexes)
  })

  const matches: Array<{ expectedIndex: number; actualIndex: number }> = []

  expected.forEach((value, expectedIndex) => {
    const indexes = actualByIdentity.get(expectedIdentity(value))
    const actualIndex = indexes?.shift()
    if (actualIndex !== undefined) {
      matches.push({ expectedIndex, actualIndex })
    }
  })

  return matches
}

function countDateFields(
  expectedExperience: ExpectedCvExperience[],
  actualExperience: Array<CvCandidate<CvExperienceValue>>,
  experienceMatches: Array<{ expectedIndex: number; actualIndex: number }>,
  expectedEducation: ExpectedCvEducation[],
  actualEducation: Array<CvCandidate<CvEducationValue>>,
  educationMatches: Array<{ expectedIndex: number; actualIndex: number }>
) {
  let total = 0
  let correct = 0

  for (const match of experienceMatches) {
    const expected = expectedExperience[match.expectedIndex]
    const actual = actualExperience[match.actualIndex].value

    for (const [expectedDateValue, actualDateValue] of [
      [expected.startDate, dateValue(actual.startDate)],
      [expected.endDate, dateValue(actual.endDate)],
    ] as const) {
      total += 1
      if (expectedDateValue === actualDateValue) correct += 1
    }
  }

  for (const match of educationMatches) {
    const expected = expectedEducation[match.expectedIndex]
    const actual = actualEducation[match.actualIndex].value

    for (const [expectedDateValue, actualDateValue] of [
      [expected.startDate, dateValue(actual.startDate)],
      [expected.endDate, dateValue(actual.endDate)],
    ] as const) {
      total += 1
      if (expectedDateValue === actualDateValue) correct += 1
    }
  }

  return { total, correct }
}

function stableIdentityOrder(
  expectedExperience: ExpectedCvExperience[],
  actualExperience: Array<CvCandidate<CvExperienceValue>>,
  expectedEducation: ExpectedCvEducation[],
  actualEducation: Array<CvCandidate<CvEducationValue>>
) {
  const expectedExperienceOrder = expectedExperience
    .map(experienceIdentity)
    .join(',')
  const actualExperienceOrder = actualExperience
    .map((candidate) => experienceIdentity(candidate.value))
    .join(',')
  const expectedEducationOrder = expectedEducation
    .map(educationIdentity)
    .join(',')
  const actualEducationOrder = actualEducation
    .map((candidate) => educationIdentity(candidate.value))
    .join(',')

  return (
    expectedExperienceOrder === actualExperienceOrder &&
    expectedEducationOrder === actualEducationOrder
  )
}

function countSectionLeakage(
  expected: ExpectedCvResult,
  candidates: CvCandidateSet
) {
  const descriptions = [
    ...candidates.experience.map(
      (candidate) => candidate.value.description
    ),
    ...candidates.education.map(
      (candidate) => candidate.value.description
    ),
  ].map(normalise)

  return expected.forbiddenDescriptionText.filter((value) => {
    const forbidden = normalise(value)
    return (
      forbidden.length > 0 &&
      descriptions.some((description) =>
        description.includes(forbidden)
      )
    )
  }).length
}

function countDescriptionCompleteness(
  expected: ExpectedCvResult,
  candidates: CvCandidateSet
) {
  const descriptions = [
    ...candidates.experience.map(
      (candidate) => candidate.value.description
    ),
    ...candidates.education.map(
      (candidate) => candidate.value.description
    ),
  ].map(normalise)
  const required = expected.requiredDescriptionText.map(normalise)
  const matched = required.filter(
    (fragment) =>
      fragment.length > 0 &&
      descriptions.some((description) =>
        description.includes(fragment)
      )
  ).length

  return {
    expected: required.length,
    matched,
    truncated: required.length - matched,
  }
}

function countsFor(
  expected: ExpectedCvResult,
  candidates: CvCandidateSet,
  model: { attempted: boolean; errorCode: string | null }
): CvEvaluationCounts {
  const experienceMatches = matchByIdentity(
    expected.experience,
    candidates.experience,
    experienceIdentity,
    (candidate) => experienceIdentity(candidate.value)
  )
  const educationMatches = matchByIdentity(
    expected.education,
    candidates.education,
    educationIdentity,
    (candidate) => educationIdentity(candidate.value)
  )
  const dateCounts = countDateFields(
    expected.experience,
    candidates.experience,
    experienceMatches,
    expected.education,
    candidates.education,
    educationMatches
  )
  const expectedSkills = new Set(expected.skills.map(normalise))
  const actualSkills = candidates.skills.map((candidate) =>
    normalise(candidate.value.name)
  )
  const expectedLanguages = new Set(
    expected.languages.map(languageIdentity)
  )
  const actualLanguages = candidates.languages.map((candidate) =>
    languageIdentity(candidate.value)
  )
  const descriptionCounts = countDescriptionCompleteness(
    expected,
    candidates
  )

  return {
    expectedExperience: expected.experience.length,
    matchedExperience: experienceMatches.length,
    actualExperience: candidates.experience.length,
    expectedEducation: expected.education.length,
    matchedEducation: educationMatches.length,
    actualEducation: candidates.education.length,
    dateFields: dateCounts.total,
    correctDateFields: dateCounts.correct,
    expectedSkills: expected.skills.length,
    matchedSkills: actualSkills.filter((value) => expectedSkills.has(value))
      .length,
    actualSkills: actualSkills.length,
    expectedLanguages: expected.languages.length,
    matchedLanguages: actualLanguages.filter((value) =>
      expectedLanguages.has(value)
    ).length,
    actualLanguages: actualLanguages.length,
    fabricatedRecords:
      candidates.experience.length - experienceMatches.length +
      candidates.education.length - educationMatches.length,
    unsupportedValues: countUnsupportedValues(candidates),
    validOutputs: outputIsValid(candidates) ? 1 : 0,
    stableOrdering: stableIdentityOrder(
      expected.experience,
      candidates.experience,
      expected.education,
      candidates.education
    )
      ? 1
      : 0,
    modelAttempts: model.attempted ? 1 : 0,
    modelFallbacks: model.attempted && model.errorCode ? 1 : 0,
    sectionLeakage: countSectionLeakage(expected, candidates),
    expectedDescriptionFragments: descriptionCounts.expected,
    matchedDescriptionFragments: descriptionCounts.matched,
    truncatedDescriptionFields: descriptionCounts.truncated,
  }
}

function metricsFor(counts: CvEvaluationCounts, durationMs: number) {
  return {
    experienceRecall: round(
      ratio(counts.matchedExperience, counts.expectedExperience)
    ),
    educationRecall: round(
      ratio(counts.matchedEducation, counts.expectedEducation)
    ),
    companyRolePrecision: round(
      ratio(counts.matchedExperience, counts.actualExperience)
    ),
    dateAccuracy: round(
      ratio(counts.correctDateFields, counts.dateFields)
    ),
    skillPrecision: round(
      ratio(counts.matchedSkills, counts.actualSkills)
    ),
    skillRecall: round(
      ratio(counts.matchedSkills, counts.expectedSkills)
    ),
    languagePrecision: round(
      ratio(counts.matchedLanguages, counts.actualLanguages)
    ),
    languageRecall: round(
      ratio(counts.matchedLanguages, counts.expectedLanguages)
    ),
    fabricatedRecords: counts.fabricatedRecords,
    unsupportedValues: counts.unsupportedValues,
    validStructuredOutputRate: counts.validOutputs,
    stableOrderingRate: counts.stableOrdering,
    fallbackFrequency:
      counts.modelAttempts === 0
        ? 0
        : round(
            ratio(counts.modelFallbacks, counts.modelAttempts)
          ),
    processingDurationMs: Math.round(durationMs),
    sectionLeakage: counts.sectionLeakage,
    descriptionCompleteness: round(
      ratio(
        counts.matchedDescriptionFragments,
        counts.expectedDescriptionFragments
      )
    ),
    truncatedDescriptionFields: counts.truncatedDescriptionFields,
  } satisfies CvEvaluationMetrics
}

function addCounts(target: CvEvaluationCounts, source: CvEvaluationCounts) {
  for (const key of Object.keys(target) as Array<keyof CvEvaluationCounts>) {
    target[key] += source[key]
  }
}

function emptyCounts(): CvEvaluationCounts {
  return {
    expectedExperience: 0,
    matchedExperience: 0,
    actualExperience: 0,
    expectedEducation: 0,
    matchedEducation: 0,
    actualEducation: 0,
    dateFields: 0,
    correctDateFields: 0,
    expectedSkills: 0,
    matchedSkills: 0,
    actualSkills: 0,
    expectedLanguages: 0,
    matchedLanguages: 0,
    actualLanguages: 0,
    fabricatedRecords: 0,
    unsupportedValues: 0,
    validOutputs: 0,
    stableOrdering: 0,
    modelAttempts: 0,
    modelFallbacks: 0,
    sectionLeakage: 0,
    expectedDescriptionFragments: 0,
    matchedDescriptionFragments: 0,
    truncatedDescriptionFields: 0,
  }
}

async function loadFixtures(): Promise<CvEvaluationFixtureDefinition[]> {
  const fixtureById = new Map(
    cvEvaluationPdfFixtures.map((fixture) => [fixture.id, fixture])
  )
  const root = path.resolve(process.cwd(), 'evaluation', 'cv')
  const fixtures: CvEvaluationFixtureDefinition[] = []

  for (const fixture of cvEvaluationPdfFixtures) {
    const file = path.join(root, `${fixture.id}.json`)
    const parsed = expectedFixtureSchema.parse(
      JSON.parse(await readFile(file, 'utf8'))
    )

    if (parsed.id !== fixture.id) {
      throw new Error(`Fixture ID mismatch in ${file}`)
    }

    fixtures.push({
      id: parsed.id,
      coverage: parsed.coverage,
      expected: parsed.expected,
      buffer: fixtureById.get(parsed.id)?.buffer ?? fixture.buffer,
    })
  }

  return fixtures
}

function failedTargets(
  metrics: CvEvaluationMetrics,
  targets: CvEvaluationQualityTargets
) {
  const failures: string[] = []

  for (const key of [
    'experienceRecall',
    'educationRecall',
    'companyRolePrecision',
    'dateAccuracy',
    'validStructuredOutputRate',
    'stableOrderingRate',
    'descriptionCompleteness',
  ] as const) {
    if (metrics[key] < targets[key]) failures.push(key)
  }

  if (metrics.fabricatedRecords > targets.fabricatedRecords) {
    failures.push('fabricatedRecords')
  }

  if (metrics.sectionLeakage > targets.sectionLeakage) {
    failures.push('sectionLeakage')
  }

  if (
    metrics.truncatedDescriptionFields >
    targets.truncatedDescriptionFields
  ) {
    failures.push('truncatedDescriptionFields')
  }

  return failures
}

export async function runCvEvaluation(
  runtime: CvEvaluationRuntime = {},
  targets: CvEvaluationQualityTargets = defaultCvEvaluationTargets
): Promise<CvEvaluationReport> {
  const fixtures = await loadFixtures()
  const started = performance.now()
  const reports: CvEvaluationFixtureReport[] = []
  const aggregate = emptyCounts()
  const coverage = new Set<CvEvaluationCoverageTag>()

  for (const fixture of fixtures) {
    const fixtureStarted = performance.now()
    const document = normalizeDocument(
      await extractPdfLayout(fixture.buffer)
    )
    const result = await analyseCvDocument(document, runtime)
    const durationMs = performance.now() - fixtureStarted
    const counts = countsFor(
      fixture.expected,
      result.candidates,
      result.model
    )
    const metrics = metricsFor(counts, durationMs)

    addCounts(aggregate, counts)
    fixture.coverage.forEach((tag) => coverage.add(tag))
    reports.push({
      id: fixture.id,
      coverage: fixture.coverage,
      durationMs: Math.round(durationMs),
      counts,
      metrics,
      warnings: result.warnings,
      model: {
        attempted: result.model.attempted,
        used: result.model.used,
        errorCode: result.model.errorCode,
      },
    })
  }

  const durationMs = performance.now() - started
  const metrics = metricsFor(aggregate, durationMs)
  metrics.validStructuredOutputRate = round(
    ratio(aggregate.validOutputs, fixtures.length)
  )
  metrics.stableOrderingRate = round(
    ratio(aggregate.stableOrdering, fixtures.length)
  )
  const failures = failedTargets(metrics, targets)

  return {
    mode: runtime.gateway && runtime.model ? 'local-model' : 'deterministic',
    fixtureCount: fixtures.length,
    coverage: [...coverage].sort(),
    durationMs: Math.round(durationMs),
    metrics,
    targets,
    qualityGatePassed: failures.length === 0,
    failedTargets: failures,
    fixtures: reports,
  }
}
