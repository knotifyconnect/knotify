import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { fetchUrlSafely } from '../lib/safeFetchUrl.js'
import { extractJobFromHtml } from '../services/jobLinkExtractor.js'

const createJobSchema = z
  .object({
    companyId: z.string().uuid().optional(),
    companyName: z.string().trim().min(1).max(120).optional(),
    companyLogoUrl: z.string().url().optional(),
    applyUrl: z.string().url().optional(),
    source: z.enum(['employer', 'link_share']).default('employer'),
    title: z.string().min(2),
    description: z.string().min(20),
    requiredSkills: z.array(z.string().min(1)).default([]),
    location: z.string().max(120).optional(),
    isRemote: z.boolean().optional(),
    salaryMin: z.number().int().nonnegative().optional(),
    salaryMax: z.number().int().nonnegative().optional(),
    status: z.enum(['open', 'closed', 'draft']).optional(),
  })
  .refine(
    (data) => (data.source === 'link_share' ? Boolean(data.companyName && data.applyUrl) : Boolean(data.companyId)),
    { message: 'employer jobs require companyId; link_share jobs require companyName and applyUrl' }
  )

const parseJobLinkSchema = z.object({
  url: z.string().url(),
})

const patchJobSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(20).optional(),
  requiredSkills: z.array(z.string().min(1)).optional(),
  location: z.string().max(120).optional(),
  isRemote: z.boolean().optional(),
  salaryMin: z.number().int().nonnegative().optional(),
  salaryMax: z.number().int().nonnegative().optional(),
  status: z.enum(['open', 'closed', 'draft']).optional(),
  isFeatured: z.boolean().optional(),
})

const jobsQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'draft', 'all']).default('open'),
  skill: z.string().trim().max(64).default(''),
  companyId: z.string().uuid().optional(),
  location: z.string().trim().max(120).default(''),
  type: z.string().trim().default(''),
  remote: z.string().default(''),
  search: z.string().trim().max(200).default(''),
})

const jobIdParamSchema = z.object({
  id: z.string().uuid(),
})

function sanitizeSkills(skills: string[]) {
  return [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))]
}

async function canManageCompany(companyId: string, userId: string) {
  const company = await supabase.from('companies').select('id, created_by').eq('id', companyId).maybeSingle()
  if (company.error) throw new Error(company.error.message)
  if (!company.data) return false
  if (company.data.created_by === userId) return true

  const membership = await supabase
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('role', ['hr', 'admin'])
    .eq('confirmed', true)
    .maybeSingle()

  if (membership.error) throw new Error(membership.error.message)
  return Boolean(membership.data)
}

export const jobsRouter = Router()

// Paste a job posting URL, get back an editable draft (title/company/location/
// salary/description). Nothing is persisted here — the client shows a preview
// and posts the confirmed fields via POST / with source: 'link_share'.
jobsRouter.post('/parse-link', requireAuth, async (req, res) => {
  const parsed = parseJobLinkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  let fetched: { html: string; finalUrl: string }
  try {
    fetched = await fetchUrlSafely(parsed.data.url)
  } catch (e) {
    return res.status(422).json({ error: e instanceof Error ? e.message : 'Could not fetch that link' })
  }

  try {
    const draft = await extractJobFromHtml(fetched.html, fetched.finalUrl)
    return res.json({ draft, sourceUrl: fetched.finalUrl })
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Could not read that job posting' })
  }
})

jobsRouter.get('/', requireAuth, async (req, res) => {
  const queryParams = jobsQuerySchema.safeParse(req.query)
  if (!queryParams.success) {
    return res.status(422).json({ error: 'Invalid query params', fields: queryParams.error.flatten() })
  }
  const status = queryParams.data.status
  const skill = queryParams.data.skill.toLowerCase()
  const companyId = queryParams.data.companyId?.trim() ?? ''
  const { location, type, remote, search } = queryParams.data

  let query = supabase
    .from('jobs')
    .select('id, company_id, company_name, company_logo_url, apply_url, source, title, description, required_skills, location, is_remote, salary_min, salary_max, employment_type, status, is_featured, created_at')
    .order('created_at', { ascending: false })

  if (status && status !== 'all' && ['open', 'closed', 'draft'].includes(status)) {
    query = query.eq('status', status as 'open' | 'closed' | 'draft')
  }
  if (companyId) {
    query = query.eq('company_id', companyId)
  }
  if (location) {
    query = query.ilike('location', `%${location}%`)
  }
  if (type && ['full_time', 'part_time', 'contract', 'internship', 'freelance'].includes(type)) {
    query = query.eq('employment_type', type)
  }
  if (remote === 'true') query = query.eq('is_remote', true)
  if (remote === 'false') query = query.eq('is_remote', false)
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const jobsResult = await query
  if (jobsResult.error) return res.status(500).json({ error: jobsResult.error.message })

  const jobs = jobsResult.data ?? []

  const companyIds = [...new Set(jobs.map((j) => j.company_id).filter((id): id is string => Boolean(id)))]
  const companies = companyIds.length
    ? await supabase.from('companies').select('id, name, logo_url, city').in('id', companyIds)
    : { data: [], error: null }
  if (companies.error) return res.status(500).json({ error: companies.error.message })

  const companyMap = new Map((companies.data ?? []).map((c) => [c.id, c]))

  let verifiedSkillNames = new Set<string>()
  if (req.appUserId) {
    const mySkills = await supabase
      .from('skills_legacy')
      .select('name')
      .eq('user_id', req.appUserId)
      .eq('is_verified', true)
    if (mySkills.error) return res.status(500).json({ error: mySkills.error.message })
    verifiedSkillNames = new Set((mySkills.data ?? []).map((s) => (s.name ?? '').toLowerCase()))
  }

  // Check which jobs current user has saved
  const jobIds = jobs.map((j) => j.id)
  let savedSet = new Set<string>()
  if (req.appUserId && jobIds.length > 0) {
    const savedResult = await supabase.from('saved_jobs').select('job_id').eq('user_id', req.appUserId).in('job_id', jobIds)
    savedSet = new Set((savedResult.data ?? []).map((r) => r.job_id))
  }

  const mapped = jobs.map((job) => {
    const required: string[] = (job.required_skills ?? []).map((s: unknown) => String(s).toLowerCase())
    const matched = required.filter((s: string) => verifiedSkillNames.has(s)).length
    const matchScore = required.length ? Math.round((matched / required.length) * 100) : 0

    const company = job.company_id
      ? companyMap.get(job.company_id) ?? null
      : { id: null, name: job.company_name, logo_url: job.company_logo_url, city: null }

    return {
      ...job,
      company,
      matchScore,
      matchedRequiredSkills: matched,
      totalRequiredSkills: required.length,
      saved: savedSet.has(job.id),
    }
  })

  if (skill) {
    const filtered = mapped.filter((j) => (j.required_skills ?? []).some((s: unknown) => String(s).toLowerCase().includes(skill)))
    return res.json({ jobs: filtered })
  }

  mapped.sort((a, b) => b.matchScore - a.matchScore || (a.created_at < b.created_at ? 1 : -1))
  return res.json({ jobs: mapped })
})

jobsRouter.get('/:id', requireAuth, async (req, res) => {
  const params = jobIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid job id', fields: params.error.flatten() })
  }

  const job = await supabase
    .from('jobs')
    .select('id, company_id, company_name, company_logo_url, apply_url, source, posted_by, title, description, required_skills, location, is_remote, salary_min, salary_max, status, is_featured, created_at, updated_at')
    .eq('id', params.data.id)
    .maybeSingle()

  if (job.error) return res.status(500).json({ error: job.error.message })
  if (!job.data) return res.status(404).json({ error: 'Job not found' })

  const company = job.data.company_id
    ? await supabase.from('companies').select('id, name, logo_url, website, city').eq('id', job.data.company_id).maybeSingle()
    : { data: { id: null, name: job.data.company_name, logo_url: job.data.company_logo_url, website: job.data.apply_url, city: null }, error: null }
  if (company.error) return res.status(500).json({ error: company.error.message })

  const referralsCount = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.data.id)
    .in('status', ['submitted', 'under_review', 'interview', 'rejected', 'hired', 'converted'])
  if (referralsCount.error) return res.status(500).json({ error: referralsCount.error.message })

  // Referral connections — users connected to me who work at this company
  let referralConnections: any[] = []
  if (req.appUserId && company.data) {
    const conns = await supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${req.appUserId},addressee_id.eq.${req.appUserId}`)
    const connIds = (conns.data ?? []).map((c) => c.requester_id === req.appUserId ? c.addressee_id : c.requester_id)
    if (connIds.length > 0) {
      const companyName = company.data.name
      const users = await supabase
        .from('users')
        .select('id, full_name, username, avatar_url, current_company')
        .in('id', connIds)
        .ilike('current_company', `%${companyName}%`)
      referralConnections = users.data ?? []
    }
  }

  return res.json({ job: { ...job.data, company: company.data ?? null, submittedReferrals: referralsCount.count ?? 0, referral_connections: referralConnections } })
})

// ── Saved jobs ────────────────────────────────────────────────────────────
jobsRouter.get('/saved', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const saved = await supabase
    .from('saved_jobs')
    .select('job_id')
    .eq('user_id', req.appUserId)
    .order('created_at', { ascending: false })
  if (saved.error) return res.status(500).json({ error: saved.error.message })
  const jobIds = (saved.data ?? []).map((r) => r.job_id)
  if (!jobIds.length) return res.json({ jobs: [] })
  const jobs = await supabase
    .from('jobs')
    .select('id, title, description, location, is_remote, salary_min, salary_max, employment_type, status, created_at, company_id, companies(id, name, logo_url)')
    .in('id', jobIds)
  if (jobs.error) return res.status(500).json({ error: jobs.error.message })
  return res.json({ jobs: (jobs.data ?? []).map((j) => ({ ...j, saved: true })) })
})

// ── Toggle save job ───────────────────────────────────────────────────────
jobsRouter.post('/:id/save', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const jobId = req.params.id
  const existing = await supabase.from('saved_jobs').select('job_id').eq('user_id', req.appUserId).eq('job_id', jobId).maybeSingle()
  if (existing.data) {
    await supabase.from('saved_jobs').delete().eq('user_id', req.appUserId).eq('job_id', jobId)
    return res.json({ saved: false })
  } else {
    await supabase.from('saved_jobs').insert({ user_id: req.appUserId, job_id: jobId })
    return res.json({ saved: true })
  }
})

jobsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = createJobSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  const data = parsed.data

  // Peer-to-peer: any member can share a job link they found elsewhere. No
  // company row, no HR gate — it posts as its own listing with an external
  // apply_url, since we have no insiders at an arbitrary scraped company.
  if (data.source === 'link_share') {
    const insert = await supabase
      .from('jobs')
      .insert({
        company_id: null,
        company_name: data.companyName!.trim(),
        company_logo_url: data.companyLogoUrl ?? null,
        apply_url: data.applyUrl,
        source: 'link_share',
        posted_by: req.appUserId,
        title: data.title.trim(),
        description: data.description.trim(),
        required_skills: sanitizeSkills(data.requiredSkills),
        location: data.location?.trim() || 'Munich',
        is_remote: data.isRemote ?? false,
        salary_min: data.salaryMin ?? null,
        salary_max: data.salaryMax ?? null,
        status: data.status ?? 'open',
      })
      .select('*')
      .single()

    if (insert.error) return res.status(500).json({ error: insert.error.message })
    return res.status(201).json({ job: insert.data })
  }

  const user = await supabase.from('users').select('id, is_hr').eq('id', req.appUserId).single()
  if (user.error) return res.status(500).json({ error: user.error.message })
  if (!user.data?.is_hr) return res.status(403).json({ error: 'Only HR users can create jobs' })

  try {
    const allowed = await canManageCompany(data.companyId!, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to post for this company' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const insert = await supabase
    .from('jobs')
    .insert({
      company_id: data.companyId,
      source: 'employer',
      posted_by: req.appUserId,
      title: data.title.trim(),
      description: data.description.trim(),
      required_skills: sanitizeSkills(data.requiredSkills),
      location: data.location?.trim() || 'Munich',
      is_remote: data.isRemote ?? false,
      salary_min: data.salaryMin ?? null,
      salary_max: data.salaryMax ?? null,
      status: data.status ?? 'open',
    })
    .select('*')
    .single()

  if (insert.error) return res.status(500).json({ error: insert.error.message })
  return res.status(201).json({ job: insert.data })
})

jobsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const params = jobIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid job id', fields: params.error.flatten() })
  }

  const parsed = patchJobSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'No fields provided' })

  const job = await supabase.from('jobs').select('id, company_id').eq('id', params.data.id).maybeSingle()
  if (job.error) return res.status(500).json({ error: job.error.message })
  if (!job.data) return res.status(404).json({ error: 'Job not found' })

  try {
    const allowed = await canManageCompany(job.data.company_id, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this job' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.title !== undefined) update.title = parsed.data.title.trim()
  if (parsed.data.description !== undefined) update.description = parsed.data.description.trim()
  if (parsed.data.requiredSkills !== undefined) update.required_skills = sanitizeSkills(parsed.data.requiredSkills)
  if (parsed.data.location !== undefined) update.location = parsed.data.location.trim()
  if (parsed.data.isRemote !== undefined) update.is_remote = parsed.data.isRemote
  if (parsed.data.salaryMin !== undefined) update.salary_min = parsed.data.salaryMin
  if (parsed.data.salaryMax !== undefined) update.salary_max = parsed.data.salaryMax
  if (parsed.data.status !== undefined) update.status = parsed.data.status
  if (parsed.data.isFeatured !== undefined) update.is_featured = parsed.data.isFeatured

  const result = await supabase.from('jobs').update(update).eq('id', params.data.id).select('*').single()
  if (result.error) return res.status(500).json({ error: result.error.message })

  return res.json({ job: result.data })
})


