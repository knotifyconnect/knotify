import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { analyseCv } from '../services/cvAnalysis.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

async function ensureCvBucket() {
  const bucketName = 'cvs'
  const buckets = await supabase.storage.listBuckets()
  if (buckets.error) throw new Error(buckets.error.message)

  if (!buckets.data.find((b) => b.name === bucketName)) {
    const createBucket = await supabase.storage.createBucket(bucketName, { public: false })
    if (createBucket.error) throw new Error(createBucket.error.message)
  }

  return bucketName
}

function cleanFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

type ParsedCv = {
  extractedSkills?: Array<{ name?: string; category?: string; confidence?: string }>
  careerPaths?: Array<{
    title?: string
    description?: string
    matchScore?: number
    skillGaps?: Array<{ skill?: string; priority?: string }>
  }>
  experienceLevel?: string
  summary?: string
  profileExtract?: {
    headline?: string | null
    bio?: string | null
    education?: Array<{ institution: string; degree: string; field: string; start_year: string; end_year: string; description: string }>
    experience?: Array<{ company: string; role: string; start_date: string; end_date: string; description: string }>
  } | null
}

export const cvRouter = Router()

cvRouter.post('/upload', requireAuth, upload.single('cv'), async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'CV file is required' })
  }

  if (req.file.mimetype !== 'application/pdf') {
    return res.status(422).json({ error: 'Only PDF files are supported' })
  }

  try {
    const bucket = await ensureCvBucket()
    const filePath = `${req.appUserId}/${Date.now()}-${cleanFilename(req.file.originalname || 'cv.pdf')}`

    const uploadResult = await supabase.storage.from(bucket).upload(filePath, req.file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

    if (uploadResult.error) {
      return res.status(500).json({ error: uploadResult.error.message })
    }

    const pdfParseModule = await import('pdf-parse')
    const parsed = await pdfParseModule.default(req.file.buffer)
    const cvText = (parsed.text ?? '').trim()

    if (!cvText) {
      return res.status(422).json({ error: 'Could not extract text from PDF' })
    }

    const analysis = (await analyseCv(cvText)) as ParsedCv

    const analysisInsert = await supabase
      .from('cv_analyses')
      .insert({
        user_id: req.appUserId,
        cv_file_url: `${bucket}/${filePath}`,
        raw_text: cvText,
        career_paths: analysis.careerPaths ?? [],
        extracted_skills: analysis.extractedSkills ?? [],
        analysis_status: 'complete',
      })
      .select('id, career_paths, extracted_skills, analysis_status, created_at')
      .single()

    if (analysisInsert.error) {
      return res.status(500).json({ error: analysisInsert.error.message })
    }

    // Remove old, unverified CV-extracted skills so each upload reflects current analysis.
    const purgeOld = await supabase
      .from('skills_legacy')
      .delete()
      .eq('user_id', req.appUserId)
      .eq('source', 'cv_extracted')
      .eq('is_verified', false)
    if (purgeOld.error) {
      return res.status(500).json({ error: purgeOld.error.message })
    }

    const extractedSkills = (analysis.extractedSkills ?? [])
      .map((s) => ({
        name: (s.name ?? '').trim(),
        category: (s.category ?? '').trim() || null,
      }))
      .filter((s) => s.name.length > 0)

    if (extractedSkills.length) {
      const insertSkills = await supabase.from('skills_legacy').insert(
        extractedSkills.map((s) => ({
          user_id: req.appUserId,
          name: s.name,
          category: s.category,
          source: 'cv_extracted',
          is_verified: false,
        }))
      )

      if (insertSkills.error) {
        return res.status(500).json({ error: insertSkills.error.message })
      }
    }

    const userSkills = await supabase
      .from('skills_legacy')
      .select('id, name, category, is_verified, source')
      .eq('user_id', req.appUserId)
      .order('is_verified', { ascending: false })
      .order('created_at', { ascending: false })

    if (userSkills.error) {
      return res.status(500).json({ error: userSkills.error.message })
    }

    return res.json({
      analysisId: analysisInsert.data.id,
      analysis: {
        careerPaths: analysis.careerPaths ?? [],
        extractedSkills: analysis.extractedSkills ?? [],
        experienceLevel: analysis.experienceLevel ?? null,
        summary: analysis.summary ?? null,
        profileExtract: analysis.profileExtract ?? null,
      },
      skills: userSkills.data ?? [],
    })
  } catch (error) {
    const failInsert = await supabase.from('cv_analyses').insert({
      user_id: req.appUserId,
      cv_file_url: 'failed_upload',
      raw_text: null,
      analysis_status: 'failed',
    })

    if (failInsert.error) {
      // Ignore secondary failure and return the primary error.
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'CV upload failed',
    })
  }
})

cvRouter.get('/analysis', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const analysis = await supabase
    .from('cv_analyses')
    .select('id, career_paths, extracted_skills, analysis_status, created_at')
    .eq('user_id', req.appUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (analysis.error) {
    return res.status(500).json({ error: analysis.error.message })
  }

  const skills = await supabase
    .from('skills_legacy')
    .select('id, name, category, is_verified, source')
    .eq('user_id', req.appUserId)
    .order('is_verified', { ascending: false })
    .order('created_at', { ascending: false })

  if (skills.error) {
    return res.status(500).json({ error: skills.error.message })
  }

  return res.json({
    analysis: analysis.data,
    skills: skills.data ?? [],
  })
})
