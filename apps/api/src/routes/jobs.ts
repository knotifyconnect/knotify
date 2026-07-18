import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { fetchUrlSafely, withDeadline } from '../lib/safeFetchUrl.js'
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

type NetworkPerson = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  current_company: string | null
}

type JobConnectionContext = {
  direct: NetworkPerson[]
  secondDegree: Array<NetworkPerson & { mutual_connections: NetworkPerson[] }>
}

function normalizedCompanyName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(gmbh|ag|se|inc|ltd|llc|group|holding|company|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function worksAtCompany(person: NetworkPerson, companyName: string) {
  const personCompany = normalizedCompanyName(person.current_company)
  const jobCompany = normalizedCompanyName(companyName)
  if (!personCompany || !jobCompany) return false
  return personCompany === jobCompany || personCompany.includes(jobCompany) || jobCompany.includes(personCompany)
}

async function connectionContextForCompanies(userId: string, companyNames: string[]) {
  const uniqueNames = [...new Set(companyNames.map((name) => name.trim()).filter(Boolean))]
  const empty = new Map(uniqueNames.map((name) => [name, { direct: [], secondDegree: [] } as JobConnectionContext]))
  if (!uniqueNames.length) return empty

  const myConnections = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  if (myConnections.error) throw new Error(myConnections.error.message)

  const directIds = [...new Set((myConnections.data ?? []).map((connection) =>
    connection.requester_id === userId ? connection.addressee_id : connection.requester_id
  ))]
  if (!directIds.length) return empty

  const [directResult, requestedByDirect, addressedToDirect] = await Promise.all([
    supabase.from('users').select('id, full_name, username, avatar_url, current_company').in('id', directIds),
    supabase.from('connections').select('requester_id, addressee_id').eq('status', 'accepted').in('requester_id', directIds),
    supabase.from('connections').select('requester_id, addressee_id').eq('status', 'accepted').in('addressee_id', directIds),
  ])
  if (directResult.error) throw new Error(directResult.error.message)
  if (requestedByDirect.error) throw new Error(requestedByDirect.error.message)
  if (addressedToDirect.error) throw new Error(addressedToDirect.error.message)

  const direct = (directResult.data ?? []) as NetworkPerson[]
  const directSet = new Set(directIds)
  const mutualIdsBySecond = new Map<string, Set<string>>()
  const edgeRows = [...(requestedByDirect.data ?? []), ...(addressedToDirect.data ?? [])]

  for (const connection of edgeRows) {
    const requesterIsDirect = directSet.has(connection.requester_id)
    const addresseeIsDirect = directSet.has(connection.addressee_id)
    if (requesterIsDirect === addresseeIsDirect) continue

    const mutualId = requesterIsDirect ? connection.requester_id : connection.addressee_id
    const secondId = requesterIsDirect ? connection.addressee_id : connection.requester_id
    if (secondId === userId || directSet.has(secondId)) continue

    const mutualIds = mutualIdsBySecond.get(secondId) ?? new Set<string>()
    mutualIds.add(mutualId)
    mutualIdsBySecond.set(secondId, mutualIds)
  }

  const secondIds = [...mutualIdsBySecond.keys()]
  const secondResult = secondIds.length
    ? await supabase.from('users').select('id, full_name, username, avatar_url, current_company').in('id', secondIds)
    : { data: [], error: null }
  if (secondResult.error) throw new Error(secondResult.error.message)

  const directById = new Map(direct.map((person) => [person.id, person]))
  const second = (secondResult.data ?? []) as NetworkPerson[]
  const result = new Map<string, JobConnectionContext>()

  for (const companyName of uniqueNames) {
    result.set(companyName, {
      direct: direct.filter((person) => worksAtCompany(person, companyName)).slice(0, 8),
      secondDegree: second
        .filter((person) => worksAtCompany(person, companyName))
        .slice(0, 12)
        .map((person) => ({
          ...person,
          mutual_connections: [...(mutualIdsBySecond.get(person.id) ?? [])]
            .map((id) => directById.get(id))
            .filter((value): value is NetworkPerson => Boolean(value))
            .slice(0, 4),
        })),
    })
  }

  return result
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
    fetched = await withDeadline(fetchUrlSafely(parsed.data.url), 12000, 'That page took too long to load')
  } catch (e) {
    return res.status(422).json({ error: e instanceof Error ? e.message : 'Could not fetch that link' })
  }

  try {
    const draft = await withDeadline(
      extractJobFromHtml(fetched.html, fetched.finalUrl),
      12000,
      'Reading that job posting took too long'
    )
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
    .select('id, company_id, company_name, company_logo_url, apply_url, source, posted_by, title, description, required_skills, location, is_remote, salary_min, salary_max, employment_type, status, is_featured, created_at')
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
  // Link-shared jobs have no verified company — the member who shared it is
  // the contact/referral point instead, so surface their identity.
  const posterIds = [...new Set(jobs.filter((j) => !j.company_id).map((j) => j.posted_by).filter(Boolean))]
  const jobIds = jobs.map((j) => j.id)
  const [companies, posters, mySkills, savedResult] = await Promise.all([
    companyIds.length
      ? supabase.from('companies').select('id, name, logo_url, city').in('id', companyIds)
      : Promise.resolve({ data: [], error: null }),
    posterIds.length
      ? supabase.from('users').select('id, full_name, username, avatar_url').in('id', posterIds)
      : Promise.resolve({ data: [], error: null }),
    req.appUserId
      ? supabase.from('skills_legacy').select('name').eq('user_id', req.appUserId).eq('is_verified', true)
      : Promise.resolve({ data: [], error: null }),
    req.appUserId && jobIds.length > 0
      ? supabase.from('saved_jobs').select('job_id').eq('user_id', req.appUserId).in('job_id', jobIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (companies.error) return res.status(500).json({ error: companies.error.message })
  if (posters.error) return res.status(500).json({ error: posters.error.message })
  if (mySkills.error) return res.status(500).json({ error: mySkills.error.message })
  if (savedResult.error) return res.status(500).json({ error: savedResult.error.message })

  const companyMap = new Map((companies.data ?? []).map((c) => [c.id, c]))
  const posterMap = new Map((posters.data ?? []).map((u) => [u.id, u]))
  const verifiedSkillNames = new Set((mySkills.data ?? []).map((s) => (s.name ?? '').toLowerCase()))
  const savedSet = new Set((savedResult.data ?? []).map((row) => row.job_id))

  const companyNames = jobs
    .map((job) => job.company_id ? companyMap.get(job.company_id)?.name : job.company_name)
    .filter((name): name is string => Boolean(name))
  let connectionContext = new Map<string, JobConnectionContext>()
  if (req.appUserId) {
    try {
      connectionContext = await connectionContextForCompanies(req.appUserId, companyNames)
    } catch (error) {
      // Connection hints should never prevent jobs themselves from loading.
      console.warn('[jobs] connection context unavailable:', error)
    }
  }

  const mapped = jobs.map((job) => {
    const required: string[] = (job.required_skills ?? []).map((s: unknown) => String(s).toLowerCase())
    const matched = required.filter((s: string) => verifiedSkillNames.has(s)).length
    const matchScore = required.length ? Math.round((matched / required.length) * 100) : 0

    const company = job.company_id
      ? companyMap.get(job.company_id) ?? null
      : { id: null, name: job.company_name, logo_url: job.company_logo_url, city: null }
    const poster = job.company_id ? null : posterMap.get(job.posted_by) ?? null
    const network = company?.name ? connectionContext.get(company.name) : null

    return {
      ...job,
      company,
      poster,
      connection_context: network ?? { direct: [], secondDegree: [] },
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

  // Link-shared jobs have no verified company — the member who shared it is
  // the contact/referral point instead of a "no warm-intro flow" dead end.
  const poster = !job.data.company_id
    ? await supabase.from('users').select('id, full_name, username, avatar_url').eq('id', job.data.posted_by).maybeSingle()
    : { data: null, error: null }
  if (poster.error) return res.status(500).json({ error: poster.error.message })

  const referralsCount = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.data.id)
    .in('status', ['submitted', 'under_review', 'interview', 'rejected', 'hired', 'converted'])
  if (referralsCount.error) return res.status(500).json({ error: referralsCount.error.message })

  // Referral connections — users connected to me who work at this company
  let network: JobConnectionContext = { direct: [], secondDegree: [] }
  if (req.appUserId && company.data?.name) {
    try {
      network = (await connectionContextForCompanies(req.appUserId, [company.data.name])).get(company.data.name) ?? network
    } catch (error) {
      console.warn('[jobs/:id] connection context unavailable:', error)
    }
  }

  return res.json({
    job: {
      ...job.data,
      company: company.data ?? null,
      poster: poster.data ?? null,
      submittedReferrals: referralsCount.count ?? 0,
      referral_connections: network.direct,
      connection_context: network,
    },
  })
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


