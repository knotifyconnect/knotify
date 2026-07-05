import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import {
  createCvProfilePreviewFromPdf,
  CvProfilePreviewError,
} from '../services/cvProfilePreview.js'

const CV_EXTRACTION_MODEL = process.env.COMPANION_MODEL || 'gemini-2.5-flash'
const CV_EXTRACTION_TIMEOUT_MS = 45_000
import type {
  CvExistingProfileSnapshot,
} from '../services/cvProfileReview.js'

/** Innermost Error.cause in a chain — the actual root failure, not a wrapper's generic message. */
function deepestCauseMessage(error: unknown): string {
  let current = error
  let message = error instanceof Error ? error.message : String(error)
  const seen = new Set<unknown>()
  while (current instanceof Error && current.cause && !seen.has(current.cause)) {
    seen.add(current.cause)
    current = current.cause
    message = current instanceof Error ? current.message : String(current)
  }
  return message
}

/** Full "OuterMessage -> MiddleMessage -> InnerMessage" chain, for context alongside deepestCauseMessage. */
function causeChainSummary(error: unknown): string {
  const parts: string[] = []
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Error) {
    parts.push(`${current.name}: ${current.message}`)
    if (!current.cause || seen.has(current.cause)) break
    seen.add(current.cause)
    current = current.cause
  }
  return parts.join(' -> ')
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
})

const catalogCategorySchema = z.enum([
  'Tech',
  'Design',
  'Business',
  'Science',
  'Other',
])

const yearSchema = z.number().int().min(1900).max(2100).nullable()

function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (year < 1900 || year > 2100) return false

  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const dateSchema = z
  .string()
  .refine(isValidIsoDate, {
    message: 'Expected a valid date in YYYY-MM-DD format',
  })
  .nullable()

const educationSchema = z
  .object({
    institution: z.string().trim().min(1).max(200),
    degree: z.string().trim().max(100).default(''),
    field: z.string().trim().max(100).default(''),
    startYear: yearSchema.default(null),
    endYear: yearSchema.default(null),
    description: z.string().trim().max(500).default(''),
  })
  .superRefine((item, context) => {
    if (
      item.startYear !== null &&
      item.endYear !== null &&
      item.endYear < item.startYear
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endYear'],
        message: 'End year cannot be before start year',
      })
    }
  })

const experienceSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(120),
    startDate: dateSchema.default(null),
    endDate: dateSchema.default(null),
    description: z.string().trim().max(800).default(''),
  })
  .superRefine((item, context) => {
    if (
      item.startDate !== null &&
      item.endDate !== null &&
      item.endDate < item.startDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date cannot be before start date',
      })
    }
  })
const skillSchema = z.object({
  catalogSkillId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  category: catalogCategorySchema.default('Other'),
})

const profileFieldSchema = (maxLength: number) =>
  z.object({
    value: z.string().trim().min(1).max(maxLength),
    replaceExisting: z.boolean().default(false),
  })

const applySchema = z
  .object({
    profile: z
      .object({
        headline: profileFieldSchema(120).optional(),
        bio: profileFieldSchema(500).optional(),
        languages: z
          .array(z.string().trim().min(1).max(50))
          .max(20)
          .optional(),
      })
      .default({}),
    education: z.array(educationSchema).max(12).default([]),
    experience: z.array(experienceSchema).max(16).default([]),
    skills: z.array(skillSchema).max(50).default([]),
  })
  .superRefine((value, context) => {
    const hasProfileValues =
      value.profile.headline !== undefined ||
      value.profile.bio !== undefined ||
      (value.profile.languages?.length ?? 0) > 0

    if (
      !hasProfileValues &&
      value.education.length === 0 &&
      value.experience.length === 0 &&
      value.skills.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No approved CV items were provided',
      })
    }
  })


function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown) {
  const text = textValue(value).trim()
  return text || null
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null
}

async function loadExistingProfileSnapshot(
  userId: string
): Promise<CvExistingProfileSnapshot | null> {
  const [profile, education, experience, skills] = await Promise.all([
    supabase
      .from('users')
      .select('headline, bio, languages')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_education')
      .select('institution, degree, field, start_year, end_year')
      .eq('user_id', userId),
    supabase
      .from('user_experience')
      .select('company, role, start_date, end_date')
      .eq('user_id', userId),
    supabase
      .from('user_skills')
      .select('skill_id, skill_catalog(id, name)')
      .eq('user_id', userId),
  ])

  if (
    profile.error ||
    education.error ||
    experience.error ||
    skills.error ||
    !profile.data
  ) {
    return null
  }

  return {
    headline: nullableText(profile.data.headline),
    bio: nullableText(profile.data.bio),
    languages: Array.isArray(profile.data.languages)
      ? profile.data.languages
          .map((value) => textValue(value).trim())
          .filter(Boolean)
      : [],
    education: (education.data ?? []).map((item) => ({
      institution: textValue(item.institution).trim(),
      degree: textValue(item.degree).trim(),
      field: textValue(item.field).trim(),
      startYear: nullableNumber(item.start_year),
      endYear: nullableNumber(item.end_year),
    })),
    experience: (experience.data ?? []).map((item) => ({
      company: textValue(item.company).trim(),
      role: textValue(item.role).trim(),
      startDate: nullableText(item.start_date),
      endDate: nullableText(item.end_date),
    })),
    skills: (skills.data ?? []).flatMap((item) => {
      const catalogValue = Array.isArray(item.skill_catalog)
        ? item.skill_catalog[0]
        : item.skill_catalog

      if (!catalogValue || typeof catalogValue !== 'object') {
        return []
      }

      const catalog = catalogValue as {
        id?: unknown
        name?: unknown
      }
      const name = textValue(catalog.name).trim()

      if (!name) return []

      return [{
        catalogSkillId:
          typeof catalog.id === 'number' ? catalog.id : null,
        name,
      }]
    }),
  }
}

export const cvProfileImportRouter = Router()

cvProfileImportRouter.post(
  '/preview',
  requireAuth,
  upload.single('cv'),
  async (req, res) => {
    if (!req.appUserId) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'CV file is required' })
    }

    if (
      req.file.mimetype !== 'application/pdf' ||
      req.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      return res.status(422).json({
        error: 'The uploaded file is not a valid PDF',
      })
    }

    const abortController = new AbortController()
    const cancelIfDisconnected = () => {
      if (!res.writableEnded) {
        abortController.abort()
      }
    }

    res.once('close', cancelIfDisconnected)

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[cv-profile-import] GEMINI_API_KEY is not set in process.env for this runtime')
      return res.status(422).json({
        error: 'CV extraction is not configured on this server',
        code: 'MODEL_UNAVAILABLE',
      })
    }

    try {
      const catalogResult = await supabase
        .from('skill_catalog')
        .select('id, name, category')

      if (catalogResult.error) {
        return res.status(500).json({
          error: catalogResult.error.message,
        })
      }

      if (abortController.signal.aborted) {
        return
      }

      const existingProfile = await loadExistingProfileSnapshot(
        req.appUserId
      )

      if (abortController.signal.aborted) {
        return
      }

      const result = await createCvProfilePreviewFromPdf(
        req.file.buffer,
        {
          catalog: (catalogResult.data ?? []).map((item) => ({
            id: Number(item.id),
            name: String(item.name),
            category: String(item.category),
          })),
          existingProfile,
          apiKey,
          model: CV_EXTRACTION_MODEL,
          timeoutMs: CV_EXTRACTION_TIMEOUT_MS,
          signal: abortController.signal,
        }
      )

      return res.json(result)
    } catch (error) {
      if (abortController.signal.aborted && !res.writableEnded) {
        return
      }

      if (error instanceof CvProfilePreviewError) {
        // Walk the Error.cause chain (CvProfilePreviewError -> PdfLayoutError
        // -> the real pdfjs-dist error) and log the innermost message FIRST
        // and on one line — Vercel's log list view truncates long entries,
        // so anything after the visible prefix is lost otherwise.
        console.error(`[cv-profile-import] preview failed: ${deepestCauseMessage(error)} (chain: ${causeChainSummary(error)})`)
        return res.status(422).json({
          error: error.message,
          code: error.code,
        })
      }

      console.error('[cv-profile-import] preview failed unexpectedly', error)
      return res.status(500).json({
        error: 'CV preview failed',
      })
    } finally {
      res.off('close', cancelIfDisconnected)
    }
  }
)

cvProfileImportRouter.post(
  '/apply',
  requireAuth,
  async (req, res) => {
    if (!req.appUserId) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    const parsed = applySchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(422).json({
        error: 'Invalid reviewed CV payload',
        fields: parsed.error.flatten(),
      })
    }

    const result = await supabase.rpc(
      'apply_cv_profile_import',
      {
        p_user_id: req.appUserId,
        p_profile: parsed.data.profile,
        p_education: parsed.data.education,
        p_experience: parsed.data.experience,
        p_skills: parsed.data.skills,
      }
    )

    if (result.error) {
      return res.status(500).json({
        error: result.error.message,
      })
    }

    return res.json(result.data)
  }
)
