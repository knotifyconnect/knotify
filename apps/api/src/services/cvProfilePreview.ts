import { analyseCvDocument } from '../intelligence/cv/analyseCvDocument.js'
import type {
  CvAnalysisResult,
  CvCandidate,
  CvCandidateSet,
  CvEducationValue,
  CvExperienceValue,
  CvNormalizedDate,
} from '../intelligence/cv/contracts.js'
import {
  CvGeminiExtractionError,
  extractCvDirectlyFromPdf,
} from '../intelligence/cv/extractCvDirectFromPdf.js'
import {
  extractPdfLayout,
  PdfLayoutError,
} from '../intelligence/document/extractPdfLayout.js'
import { normalizeDocument } from '../intelligence/document/normalizeDocument.js'
import {
  IntelligenceConfigError,
} from '../intelligence/runtime/IntelligenceConfig.js'
import type { ModelGateway } from '../intelligence/runtime/ModelGateway.js'
import {
  createDocumentModelRuntime,
  type DocumentModelRuntime,
} from '../intelligence/runtime/ModelRegistry.js'
import { analyseCv } from './cvAnalysis.js'
import {
  buildCvProfileReview,
  type CvExistingProfileSnapshot,
  type CvProfilePreviewReview,
} from './cvProfileReview.js'

export type CvCatalogCategory =
  | 'Tech'
  | 'Design'
  | 'Business'
  | 'Science'
  | 'Other'

export interface CvSkillCatalogEntry {
  id: number
  name: string
  category: string
}

export interface CvProfilePreviewEducation {
  candidateId: string
  institution: string
  degree: string
  field: string
  startYear: number | null
  endYear: number | null
  description: string
  confidence: 'high' | 'medium' | 'low'
  source: 'structured-local'
}

export interface CvProfilePreviewExperience {
  candidateId: string
  company: string
  role: string
  startDate: string | null
  endDate: string | null
  description: string
  confidence: 'high' | 'medium' | 'low'
  source: 'structured-local'
}

export interface CvProfilePreviewSkill {
  candidateId: string
  catalogSkillId: number | null
  name: string
  category: CvCatalogCategory
  confidence: 'high' | 'medium' | 'low'
  matchedCatalog: boolean
  source: 'structured-local'
}

export interface CvProfilePreview {
  headline: string | null
  bio: string | null
  education: CvProfilePreviewEducation[]
  experience: CvProfilePreviewExperience[]
  skills: CvProfilePreviewSkill[]
  languages: string[]
  review: CvProfilePreviewReview
}

export interface CvProfilePreviewAnalysis {
  provider: 'local' | 'gemini'
  summary: string
  experienceLevel: 'student' | 'junior' | 'mid'
  careerPaths: Array<{
    title?: string
    description?: string
    matchScore?: number
    skillGaps?: Array<{
      skill?: string
      priority?: string
    }>
  }>
  intelligence: {
    pipeline: 'structured-local-v1' | 'gemini-direct-v1'
    pageCount: number
    blockCount: number
    processingDurationMs: number
    model: CvAnalysisResult['model']
    warnings: string[]
  }
}

export interface CvProfilePreviewResult {
  preview: CvProfilePreview
  analysis: CvProfilePreviewAnalysis
}

export type CvProfilePreviewErrorCode =
  | 'INVALID_PDF'
  | 'PAGE_LIMIT'
  | 'SPAN_LIMIT'
  | 'EMPTY_DOCUMENT'
  | 'EXTRACTION_FAILED'
  | 'MODEL_UNAVAILABLE'

export class CvProfilePreviewError extends Error {
  readonly name = 'CvProfilePreviewError'

  constructor(
    readonly code: CvProfilePreviewErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export interface CvProfilePreviewModelRuntime {
  gateway: ModelGateway
  model: string
  timeoutMs?: number
}

export interface CreateCvProfilePreviewOptions {
  catalog: CvSkillCatalogEntry[]
  modelRuntime?: CvProfilePreviewModelRuntime | null
  environment?: NodeJS.ProcessEnv
  signal?: AbortSignal
  legacyAnalyse?: typeof analyseCv
  existingProfile?: CvExistingProfileSnapshot | null
}

const MAX_CV_PAGES = 12
const MAX_CV_SPANS = 20_000
const MAX_PREVIEW_MODEL_TIMEOUT_MS = 20_000
const MAX_EDUCATION = 12
const MAX_EXPERIENCE = 16
const MAX_SKILLS = 50
const MAX_LANGUAGES = 20

function normaliseKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textOrNull(value: string | null | undefined, maxLength: number) {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function confidenceLabel(value: number) {
  if (value >= 0.8) return 'high' as const
  if (value >= 0.55) return 'medium' as const
  return 'low' as const
}

function catalogCategoryFor(value: string | undefined): CvCatalogCategory {
  switch (value) {
    case 'Tech':
    case 'Design':
    case 'Business':
    case 'Science':
    case 'Other':
      return value
    case 'technical':
      return 'Tech'
    case 'domain':
      return 'Business'
    default:
      return 'Other'
  }
}

function dateOrNull(value: CvNormalizedDate | null) {
  if (!value || value.current) return null
  return value.iso
}

function selectBestTextCandidate(
  candidates: CvCandidateSet['headline'] | CvCandidateSet['summary']
) {
  return [...candidates].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.sourceOrder - right.sourceOrder
  )[0]
}

function mapEducation(
  candidate: CvCandidate<CvEducationValue>
): CvProfilePreviewEducation | null {
  const institution = textOrNull(candidate.value.institution, 200)
  if (!institution) return null

  return {
    candidateId: candidate.id,
    institution,
    degree: textOrNull(candidate.value.degree, 100) ?? '',
    field: textOrNull(candidate.value.field, 100) ?? '',
    startYear: candidate.value.startDate?.year ?? null,
    endYear: candidate.value.endDate?.current
      ? null
      : candidate.value.endDate?.year ?? null,
    description: candidate.value.description.trim().slice(0, 500),
    confidence: confidenceLabel(candidate.confidence),
    source: 'structured-local',
  }
}

function mapExperience(
  candidate: CvCandidate<CvExperienceValue>
): CvProfilePreviewExperience | null {
  const company = textOrNull(candidate.value.company, 200)
  const role = textOrNull(candidate.value.role, 120)

  if (!company || !role) return null

  return {
    candidateId: candidate.id,
    company,
    role,
    startDate: dateOrNull(candidate.value.startDate),
    endDate: dateOrNull(candidate.value.endDate),
    description: candidate.value.description.trim().slice(0, 800),
    confidence: confidenceLabel(candidate.confidence),
    source: 'structured-local',
  }
}

function buildSkillCategoryMap(
  legacySkills: Awaited<ReturnType<typeof analyseCv>>['extractedSkills']
) {
  return new Map(
    legacySkills.map((skill) => [
      normaliseKey(skill.name),
      catalogCategoryFor(skill.category),
    ])
  )
}

function mapPreview(
  analysis: CvAnalysisResult,
  catalog: CvSkillCatalogEntry[],
  legacySkills: Awaited<ReturnType<typeof analyseCv>>['extractedSkills'],
  warnings: string[],
  existingProfile?: CvExistingProfileSnapshot | null
): CvProfilePreview {
  const catalogByName = new Map(
    catalog.map((item) => [
      normaliseKey(item.name),
      {
        id: Number(item.id),
        name: String(item.name),
        category: catalogCategoryFor(item.category),
      },
    ])
  )
  const legacySkillCategories = buildSkillCategoryMap(legacySkills)

  const headlineCandidate = selectBestTextCandidate(
    analysis.candidates.headline
  )
  const summaryCandidate = selectBestTextCandidate(
    analysis.candidates.summary
  )

  const education = analysis.candidates.education
    .map(mapEducation)
    .filter(
      (item): item is CvProfilePreviewEducation => item !== null
    )

  const experience = analysis.candidates.experience
    .map(mapExperience)
    .filter(
      (item): item is CvProfilePreviewExperience => item !== null
    )

  const skills = analysis.candidates.skills
    .map((candidate): CvProfilePreviewSkill | null => {
      const rawName = textOrNull(candidate.value.name, 100)
      if (!rawName) return null

      const key = normaliseKey(rawName)
      const catalogMatch = catalogByName.get(key)

      return {
        candidateId: candidate.id,
        catalogSkillId: catalogMatch?.id ?? null,
        name: catalogMatch?.name ?? rawName,
        category:
          catalogMatch?.category ??
          legacySkillCategories.get(key) ??
          'Other',
        confidence: confidenceLabel(candidate.confidence),
        matchedCatalog: Boolean(catalogMatch),
        source: 'structured-local',
      }
    })
    .filter((item): item is CvProfilePreviewSkill => item !== null)

  const languages = [
    ...new Map(
      analysis.candidates.languages
        .map((candidate) => candidate.value.name.trim())
        .filter(Boolean)
        .map((name) => [normaliseKey(name), name])
    ).values(),
  ]

  if (education.length > MAX_EDUCATION) {
    warnings.push(`preview-limit:education:${education.length}`)
  }
  if (experience.length > MAX_EXPERIENCE) {
    warnings.push(`preview-limit:experience:${experience.length}`)
  }
  if (skills.length > MAX_SKILLS) {
    warnings.push(`preview-limit:skills:${skills.length}`)
  }
  if (languages.length > MAX_LANGUAGES) {
    warnings.push(`preview-limit:languages:${languages.length}`)
  }

  const previewWithoutReview = {
    headline: textOrNull(headlineCandidate?.value.text, 120),
    bio: textOrNull(summaryCandidate?.value.text, 500),
    education: education.slice(0, MAX_EDUCATION),
    experience: experience.slice(0, MAX_EXPERIENCE),
    skills: skills.slice(0, MAX_SKILLS),
    languages: languages.slice(0, MAX_LANGUAGES),
  }

  return {
    ...previewWithoutReview,
    review: buildCvProfileReview(
      analysis,
      previewWithoutReview,
      existingProfile
    ),
  }
}

function resolveModelRuntime(
  options: CreateCvProfilePreviewOptions,
  warnings: string[]
): CvProfilePreviewModelRuntime | null {
  if (options.modelRuntime !== undefined) {
    return options.modelRuntime
  }

  try {
    const runtime: DocumentModelRuntime = createDocumentModelRuntime(
      options.environment ?? process.env
    )

    return {
      gateway: runtime.gateway,
      model: runtime.model,
      timeoutMs: runtime.config.timeoutMs,
    }
  } catch (error) {
    if (error instanceof IntelligenceConfigError) {
      warnings.push('model-disabled:configuration')
      return null
    }

    throw error
  }
}

function mapPdfError(error: PdfLayoutError) {
  switch (error.code) {
    case 'INVALID_PDF':
      return new CvProfilePreviewError(
        'INVALID_PDF',
        'The uploaded file is not a valid PDF',
        { cause: error }
      )
    case 'PAGE_LIMIT':
      return new CvProfilePreviewError(
        'PAGE_LIMIT',
        `The PDF exceeds the ${MAX_CV_PAGES} page limit`,
        { cause: error }
      )
    case 'SPAN_LIMIT':
      return new CvProfilePreviewError(
        'SPAN_LIMIT',
        'The PDF contains too much extractable content',
        { cause: error }
      )
    case 'EXTRACTION_FAILED':
      return new CvProfilePreviewError(
        'EXTRACTION_FAILED',
        'Could not extract structured text from PDF',
        { cause: error }
      )
  }
}

export async function createCvProfilePreview(
  buffer: Buffer,
  options: CreateCvProfilePreviewOptions
): Promise<CvProfilePreviewResult> {
  const startedAt = Date.now()
  const warnings: string[] = []

  let extracted

  try {
    extracted = await extractPdfLayout(buffer, {
      maxPages: MAX_CV_PAGES,
      maxSpans: MAX_CV_SPANS,
    })
  } catch (error) {
    if (error instanceof PdfLayoutError) {
      throw mapPdfError(error)
    }

    throw error
  }

  const document = normalizeDocument(extracted)
  const canonicalText = document.blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')

  if (!canonicalText) {
    throw new CvProfilePreviewError(
      'EMPTY_DOCUMENT',
      'Could not extract text from PDF'
    )
  }

  const runtime = resolveModelRuntime(options, warnings)
  const analysis = await analyseCvDocument(
    document,
    runtime
      ? {
          gateway: runtime.gateway,
          model: runtime.model,
          timeoutMs: Math.min(
            runtime.timeoutMs ?? MAX_PREVIEW_MODEL_TIMEOUT_MS,
            MAX_PREVIEW_MODEL_TIMEOUT_MS
          ),
          signal: options.signal,
        }
      : {}
  )

  const legacyAnalyse = options.legacyAnalyse ?? analyseCv
  let legacyAnalysis: Awaited<ReturnType<typeof analyseCv>>

  try {
    legacyAnalysis = await legacyAnalyse(canonicalText)
  } catch {
    warnings.push('legacy-analysis-fallback')
    legacyAnalysis = {
      extractedSkills: [],
      careerPaths: [],
      experienceLevel:
        analysis.candidates.experience.length === 0
          ? 'student'
          : analysis.candidates.experience.length === 1
            ? 'junior'
            : 'mid',
      summary: 'The CV was analysed locally using structured document extraction.',
      provider: 'local',
      profileExtract: {
        headline: null,
        bio: null,
        education: [],
        experience: [],
      },
    }
  }

  const combinedWarnings = [
    ...new Set([...warnings, ...analysis.warnings]),
  ]

  return {
    preview: mapPreview(
      analysis,
      options.catalog,
      legacyAnalysis.extractedSkills,
      combinedWarnings,
      options.existingProfile
    ),
    analysis: {
      provider: 'local',
      summary: legacyAnalysis.summary,
      experienceLevel: legacyAnalysis.experienceLevel,
      careerPaths: legacyAnalysis.careerPaths,
      intelligence: {
        pipeline: 'structured-local-v1',
        pageCount: document.pageCount,
        blockCount: document.blocks.length,
        processingDurationMs: Date.now() - startedAt,
        model: analysis.model,
        warnings: [...new Set(combinedWarnings)],
      },
    },
  }
}

export interface CreateCvProfilePreviewFromPdfOptions {
  catalog: CvSkillCatalogEntry[]
  apiKey: string
  model: string
  timeoutMs?: number
  signal?: AbortSignal
  existingProfile?: CvExistingProfileSnapshot | null
}

/**
 * The current profile-import pipeline: sends the PDF directly to Gemini
 * (no pdfjs-dist, no deterministic regex pass) and reuses mapPreview() /
 * buildCvProfileReview() unchanged, so the review-and-confirm UI and the
 * /apply write path are identical to before. See extractCvDirectFromPdf.ts
 * for why this replaced the old text-extraction + heuristics pipeline.
 *
 * Career-path suggestions (a minor bonus feature of the old pipeline, driven
 * by the legacy analyseCv() heuristic) are not reproduced here — the
 * frontend already hides that panel when the list is empty, so this is a
 * clean no-op, not a broken state.
 */
export async function createCvProfilePreviewFromPdf(
  buffer: Buffer,
  options: CreateCvProfilePreviewFromPdfOptions
): Promise<CvProfilePreviewResult> {
  const startedAt = Date.now()

  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new CvProfilePreviewError('INVALID_PDF', 'The uploaded file is not a valid PDF')
  }

  let analysis: CvAnalysisResult
  try {
    analysis = await extractCvDirectlyFromPdf(buffer, {
      apiKey: options.apiKey,
      model: options.model,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof CvGeminiExtractionError) {
      throw new CvProfilePreviewError(
        'MODEL_UNAVAILABLE',
        'CV extraction is temporarily unavailable, please try again shortly',
        { cause: error }
      )
    }
    throw error
  }

  const experienceCount = analysis.candidates.experience.length
  const warnings = [...analysis.warnings]

  return {
    preview: mapPreview(analysis, options.catalog, [], warnings, options.existingProfile),
    analysis: {
      provider: 'gemini',
      summary: 'Extracted directly from your CV using Gemini.',
      experienceLevel: experienceCount === 0 ? 'student' : experienceCount === 1 ? 'junior' : 'mid',
      careerPaths: [],
      intelligence: {
        pipeline: 'gemini-direct-v1',
        pageCount: 0,
        blockCount: 0,
        processingDurationMs: Date.now() - startedAt,
        model: analysis.model,
        warnings: [...new Set(warnings)],
      },
    },
  }
}
