import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

type ReferralStatus =
  | 'requested'
  | 'declined'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'interview'
  | 'rejected'
  | 'hired'
  | 'converted'

type HrDecisionStatus = 'under_review' | 'interview' | 'rejected' | 'hired'

type ReferralRow = {
  id: string
  job_id: string
  applicant_id: string
  referrer_id: string
  company_id: string
  status: ReferralStatus
  overall_rating: number | null
  hr_flagged: boolean
  created_at: string
}

type ReferralAccessRow = {
  id: string
  applicant_id: string
  referrer_id: string
  company_id: string
}

type ReferralEventRow = {
  id: string
  referral_id: string
  actor_id: string | null
  event_type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const createReferralSchema = z.object({
  jobId: z.string().uuid(),
  referrerId: z.string().uuid(),
  note: z.string().max(500).optional(),
})

const respondSchema = z.object({
  accepted: z.boolean(),
})

const submitReferralSchema = z.object({
  relationship_type: z.enum(['classmate', 'colleague', 'project', 'other']).optional(),
  relationship_duration: z.string().max(120).optional(),
  observed_work_directly: z.boolean().optional(),
  rating_problem_solving: z.number().int().min(1).max(3).optional(),
  rating_collaboration: z.number().int().min(1).max(3).optional(),
  rating_role_relevance: z.number().int().min(1).max(3).optional(),
  note_problem_solving: z.string().max(300).optional(),
  note_collaboration: z.string().max(300).optional(),
  note_role_relevance: z.string().max(300).optional(),
  overall_rating: z.number().int().min(1).max(3).optional(),
  recommendation_text: z.string().max(280).optional(),
  accountability_confirmed: z.boolean().optional(),
})

const hrDecisionSchema = z.object({
  status: z.enum(['under_review', 'interview', 'rejected', 'hired']),
  note: z.string().max(600).optional(),
})

const referralIdParamSchema = z.object({
  id: z.string().uuid(),
})

const checkReferralsQuerySchema = z.object({
  companyId: z.string().uuid(),
})

const companyInboxQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  statuses: z.string().optional(),
})

const companyInboxStatuses: ReferralStatus[] = ['submitted', 'under_review', 'interview', 'rejected', 'hired']
const applicantUpdateStatuses: ReferralStatus[] = ['under_review', 'interview', 'rejected', 'hired']
const hrActionableStatuses: ReferralStatus[] = ['submitted', 'under_review', 'interview']

const hrDecisionTransitions: Record<ReferralStatus, HrDecisionStatus[]> = {
  requested: [],
  declined: [],
  in_progress: [],
  submitted: ['under_review', 'interview', 'rejected', 'hired'],
  under_review: ['interview', 'rejected', 'hired'],
  interview: ['under_review', 'rejected', 'hired'],
  rejected: [],
  hired: [],
  converted: [],
}

async function enrichReferrals(rows: ReferralRow[]) {
  const jobIds = [...new Set(rows.map((r) => r.job_id))]
  const userIds = [...new Set(rows.flatMap((r) => [r.applicant_id, r.referrer_id]))]

  const [jobs, users, companies] = await Promise.all([
    jobIds.length
      ? supabase.from('jobs').select('id, title, company_id').in('id', jobIds)
      : Promise.resolve({ data: [], error: null } as const),
    userIds.length
      ? supabase.from('users').select('id, full_name, username, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [], error: null } as const),
    jobIds.length
      ? supabase
          .from('companies')
          .select('id, name, logo_url')
          .in(
            'id',
            [...new Set(rows.map((r) => r.company_id))]
          )
      : Promise.resolve({ data: [], error: null } as const),
  ])

  if (jobs.error) throw new Error(jobs.error.message)
  if (users.error) throw new Error(users.error.message)
  if (companies.error) throw new Error(companies.error.message)

  const jobsMap = new Map((jobs.data ?? []).map((j) => [j.id, j]))
  const usersMap = new Map((users.data ?? []).map((u) => [u.id, u]))
  const companiesMap = new Map((companies.data ?? []).map((c) => [c.id, c]))

  return rows.map((row) => ({
    ...row,
    job: jobsMap.get(row.job_id) ?? null,
    applicant: usersMap.get(row.applicant_id) ?? null,
    referrer: usersMap.get(row.referrer_id) ?? null,
    company: companiesMap.get(row.company_id) ?? null,
  }))
}

async function recalcReferralScore(referrerId: string) {
  const submitted = await supabase
    .from('referrals')
    .select('overall_rating')
    .eq('referrer_id', referrerId)
    .eq('status', 'submitted')
    .eq('hr_flagged', false)

  if (submitted.error) throw new Error(submitted.error.message)

  const total = (submitted.data ?? []).reduce((sum, row) => sum + (row.overall_rating ?? 0), 0)

  const update = await supabase.from('users').update({ referral_score: total }).eq('id', referrerId)
  if (update.error) throw new Error(update.error.message)
}

async function managedCompanyIdsForUser(userId: string) {
  const [memberships, createdCompanies] = await Promise.all([
    supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .in('role', ['hr', 'admin'])
      .eq('confirmed', true),
    supabase.from('companies').select('id').eq('created_by', userId),
  ])

  if (memberships.error) throw new Error(memberships.error.message)
  if (createdCompanies.error) throw new Error(createdCompanies.error.message)

  return [
    ...new Set([
      ...(memberships.data ?? []).map((row) => row.company_id),
      ...(createdCompanies.data ?? []).map((row) => row.id),
    ]),
  ]
}

async function assertCanManageCompany(userId: string, companyId: string) {
  const managedIds = await managedCompanyIdsForUser(userId)
  return managedIds.includes(companyId)
}

async function canAccessReferral(userId: string, referral: ReferralAccessRow) {
  if (referral.applicant_id === userId) return true
  if (referral.referrer_id === userId) return true
  return assertCanManageCompany(userId, referral.company_id)
}

function validateSubmissionFields(input: z.infer<typeof submitReferralSchema>) {
  const errors: Record<string, string> = {}

  if (!input.relationship_type) errors.relationship_type = 'Relationship type is required'
  if (input.rating_problem_solving === undefined) errors.rating_problem_solving = 'Problem solving rating is required'
  if (input.rating_collaboration === undefined) errors.rating_collaboration = 'Collaboration rating is required'
  if (input.rating_role_relevance === undefined) errors.rating_role_relevance = 'Role relevance rating is required'

  if (!input.note_problem_solving || input.note_problem_solving.trim().length < 20)
    errors.note_problem_solving = 'Problem solving note must be at least 20 characters'
  if (!input.note_collaboration || input.note_collaboration.trim().length < 20)
    errors.note_collaboration = 'Collaboration note must be at least 20 characters'
  if (!input.note_role_relevance || input.note_role_relevance.trim().length < 20)
    errors.note_role_relevance = 'Role relevance note must be at least 20 characters'

  if (input.overall_rating === undefined) errors.overall_rating = 'Overall rating is required'
  if (!input.recommendation_text || input.recommendation_text.trim().length < 50)
    errors.recommendation_text = 'Recommendation text must be at least 50 characters'
  if (input.recommendation_text && input.recommendation_text.length > 280)
    errors.recommendation_text = 'Recommendation text must be at most 280 characters'

  if (input.accountability_confirmed !== true)
    errors.accountability_confirmed = 'You must confirm accountability before submitting'

  return errors
}

export const referralsRouter = Router()

referralsRouter.get('/sent', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const referrals = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', req.appUserId)
    .order('created_at', { ascending: false })

  if (referrals.error) return res.status(500).json({ error: referrals.error.message })

  try {
    const enriched = await enrichReferrals((referrals.data ?? []) as ReferralRow[])
    return res.json({ referrals: enriched })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading sent referrals' })
  }
})

referralsRouter.get('/received', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const referrals = await supabase
    .from('referrals')
    .select('*')
    .eq('applicant_id', req.appUserId)
    .order('created_at', { ascending: false })

  if (referrals.error) return res.status(500).json({ error: referrals.error.message })

  try {
    const enriched = await enrichReferrals((referrals.data ?? []) as ReferralRow[])
    return res.json({ referrals: enriched })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading received referrals' })
  }
})

referralsRouter.get('/pending', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const referrals = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', req.appUserId)
    .eq('status', 'requested')
    .order('created_at', { ascending: false })

  if (referrals.error) return res.status(500).json({ error: referrals.error.message })

  try {
    const enriched = await enrichReferrals((referrals.data ?? []) as ReferralRow[])
    return res.json({ referrals: enriched })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading pending referrals' })
  }
})

referralsRouter.get('/in-progress', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const referrals = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', req.appUserId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })

  if (referrals.error) return res.status(500).json({ error: referrals.error.message })

  try {
    const enriched = await enrichReferrals((referrals.data ?? []) as ReferralRow[])
    return res.json({ referrals: enriched })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading in-progress referrals' })
  }
})

referralsRouter.get('/:id/history', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = referralIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid referral id', fields: params.error.flatten() })
  }

  const referral = await supabase
    .from('referrals')
    .select('id, applicant_id, referrer_id, company_id')
    .eq('id', params.data.id)
    .maybeSingle()

  if (referral.error) return res.status(500).json({ error: referral.error.message })
  if (!referral.data) return res.status(404).json({ error: 'Referral not found' })

  try {
    const canAccess = await canAccessReferral(req.appUserId, referral.data as ReferralAccessRow)
    if (!canAccess) return res.status(403).json({ error: 'Not allowed to view this referral history' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const events = await supabase
    .from('referral_events')
    .select('id, referral_id, actor_id, event_type, from_status, to_status, note, metadata, created_at')
    .eq('referral_id', referral.data.id)
    .order('created_at', { ascending: true })

  if (events.error) return res.status(500).json({ error: events.error.message })

  const actorIds = [...new Set((events.data ?? []).map((event) => event.actor_id).filter(Boolean) as string[])]
  const actors = actorIds.length
    ? await supabase.from('users').select('id, full_name, username, avatar_url').in('id', actorIds)
    : { data: [], error: null }

  if (actors.error) return res.status(500).json({ error: actors.error.message })
  const actorMap = new Map((actors.data ?? []).map((actor) => [actor.id, actor]))

  return res.json({
    events: ((events.data ?? []) as ReferralEventRow[]).map((event) => ({
      ...event,
      actor: event.actor_id ? actorMap.get(event.actor_id) ?? null : null,
    })),
  })
})

referralsRouter.get('/company-inbox', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const query = companyInboxQuerySchema.safeParse(req.query)
  if (!query.success) {
    return res.status(422).json({ error: 'Invalid query params', fields: query.error.flatten() })
  }

  const companyId = query.data.companyId ?? ''
  const statusesParam = String(query.data.statuses ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as ReferralStatus[]
  const requestedStatuses = statusesParam.filter((s) => companyInboxStatuses.includes(s))
  const statuses = requestedStatuses.length ? requestedStatuses : companyInboxStatuses

  let managedCompanyIds: string[] = []
  try {
    const allManagedCompanyIds = await managedCompanyIdsForUser(req.appUserId)
    if (companyId) {
      if (!allManagedCompanyIds.includes(companyId)) {
        return res.status(403).json({ error: 'Not allowed to view referral inbox for this company' })
      }
      managedCompanyIds = [companyId]
    } else {
      managedCompanyIds = allManagedCompanyIds
    }
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading managed companies' })
  }

  if (!managedCompanyIds.length) return res.json({ referrals: [] })

  const referrals = await supabase
    .from('referrals')
    .select('*')
    .in('company_id', managedCompanyIds)
    .in('status', statuses)
    .order('updated_at', { ascending: false })

  if (referrals.error) return res.status(500).json({ error: referrals.error.message })

  try {
    const enriched = await enrichReferrals((referrals.data ?? []) as ReferralRow[])
    return res.json({ referrals: enriched })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading referral inbox' })
  }
})

referralsRouter.get('/unread', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const [pending, inProgress, applicantUpdates, managedCompanyIds] = await Promise.all([
      supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', req.appUserId).eq('status', 'requested'),
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', req.appUserId)
        .eq('status', 'in_progress'),
      supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('applicant_id', req.appUserId)
        .in('status', applicantUpdateStatuses),
      managedCompanyIdsForUser(req.appUserId),
    ])

    if (pending.error) return res.status(500).json({ error: pending.error.message })
    if (inProgress.error) return res.status(500).json({ error: inProgress.error.message })
    if (applicantUpdates.error) return res.status(500).json({ error: applicantUpdates.error.message })

    let hrInboxCount = 0
    if (managedCompanyIds.length) {
      const hrInbox = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .in('company_id', managedCompanyIds)
        .in('status', hrActionableStatuses)

      if (hrInbox.error) return res.status(500).json({ error: hrInbox.error.message })
      hrInboxCount = hrInbox.count ?? 0
    }

    const breakdown = {
      referrerPending: pending.count ?? 0,
      referrerInProgress: inProgress.count ?? 0,
      applicantUpdates: applicantUpdates.count ?? 0,
      hrInbox: hrInboxCount,
    }

    return res.json({
      count: breakdown.referrerPending + breakdown.referrerInProgress + breakdown.applicantUpdates + breakdown.hrInbox,
      breakdown,
    })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed loading unread referral counts' })
  }
})

referralsRouter.get('/check', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const query = checkReferralsQuerySchema.safeParse(req.query)
  if (!query.success) {
    return res.status(422).json({ error: 'Invalid query params', fields: query.error.flatten() })
  }
  const companyId = query.data.companyId

  const acceptedConnections = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${req.appUserId},addressee_id.eq.${req.appUserId}`)

  if (acceptedConnections.error) return res.status(500).json({ error: acceptedConnections.error.message })

  const connectedIds = [...new Set((acceptedConnections.data ?? []).map((c) => (c.requester_id === req.appUserId ? c.addressee_id : c.requester_id)))]

  if (!connectedIds.length) return res.json({ users: [] })

  const companyMembers = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('confirmed', true)
    .in('user_id', connectedIds)

  if (companyMembers.error) return res.status(500).json({ error: companyMembers.error.message })

  const memberIds = [...new Set((companyMembers.data ?? []).map((m) => m.user_id))]
  if (!memberIds.length) return res.json({ users: [] })

  const users = await supabase
    .from('users')
    .select('id, full_name, avatar_url, username, location_lat, location_lng')
    .in('id', memberIds)

  if (users.error) return res.status(500).json({ error: users.error.message })

  return res.json({ users: users.data ?? [] })
})

referralsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = createReferralSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const { jobId, referrerId, note } = parsed.data
  if (referrerId === req.appUserId) return res.status(422).json({ error: 'Cannot request referral from yourself' })

  const job = await supabase.from('jobs').select('id, company_id, status').eq('id', jobId).maybeSingle()
  if (job.error) return res.status(500).json({ error: job.error.message })
  if (!job.data) return res.status(404).json({ error: 'Job not found' })
  if (job.data.status !== 'open') return res.status(422).json({ error: 'Referrals can only be requested for open jobs' })

  const connection = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${req.appUserId},addressee_id.eq.${referrerId}),and(requester_id.eq.${referrerId},addressee_id.eq.${req.appUserId})`)
    .maybeSingle()

  if (connection.error) return res.status(500).json({ error: connection.error.message })
  if (!connection.data) return res.status(422).json({ error: 'You can only request referrals from accepted connections' })

  const member = await supabase
    .from('company_members')
    .select('id')
    .eq('company_id', job.data.company_id)
    .eq('user_id', referrerId)
    .eq('confirmed', true)
    .maybeSingle()

  if (member.error) return res.status(500).json({ error: member.error.message })
  if (!member.data) return res.status(422).json({ error: 'Selected referrer is not a confirmed member of this company' })

  const insert = await supabase
    .from('referrals')
    .insert({
      job_id: jobId,
      applicant_id: req.appUserId,
      referrer_id: referrerId,
      company_id: job.data.company_id,
      initiated_by: 'applicant',
      applicant_note: note?.trim() || null,
      status: 'requested',
    })
    .select('*')
    .single()

  if (insert.error) {
    if (insert.error.code === '23505') {
      return res.status(409).json({ error: 'Referral already exists for this job and applicant' })
    }
    return res.status(500).json({ error: insert.error.message })
  }

  return res.status(201).json({ referral: insert.data })
})

referralsRouter.patch('/:id/respond', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = referralIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid referral id', fields: params.error.flatten() })
  }

  const parsed = respondSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const referral = await supabase.from('referrals').select('*').eq('id', params.data.id).maybeSingle()
  if (referral.error) return res.status(500).json({ error: referral.error.message })
  if (!referral.data) return res.status(404).json({ error: 'Referral not found' })

  if (referral.data.referrer_id !== req.appUserId) {
    return res.status(403).json({ error: 'Only the referrer can respond' })
  }

  if (referral.data.status !== 'requested') {
    return res.status(422).json({ error: `Invalid transition from ${referral.data.status}` })
  }

  const accepted = parsed.data.accepted

  const update = await supabase
    .from('referrals')
    .update({
      status: accepted ? 'in_progress' : 'declined',
      declined_at: accepted ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.data.id)
    .select('*')
    .single()

  if (update.error) return res.status(500).json({ error: update.error.message })
  return res.json({ referral: update.data })
})

referralsRouter.patch('/:id/submit', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = referralIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid referral id', fields: params.error.flatten() })
  }

  const parsed = submitReferralSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const fieldErrors = validateSubmissionFields(parsed.data)
  if (Object.keys(fieldErrors).length) {
    return res.status(422).json({ error: 'Validation failed', fields: fieldErrors })
  }

  const referral = await supabase.from('referrals').select('*').eq('id', params.data.id).maybeSingle()
  if (referral.error) return res.status(500).json({ error: referral.error.message })
  if (!referral.data) return res.status(404).json({ error: 'Referral not found' })

  if (referral.data.referrer_id !== req.appUserId) {
    return res.status(403).json({ error: 'Only the referrer can submit this referral' })
  }

  if (referral.data.status !== 'in_progress') {
    return res.status(422).json({ error: `Invalid transition from ${referral.data.status}` })
  }

  const update = await supabase
    .from('referrals')
    .update({
      ...parsed.data,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.data.id)
    .select('*')
    .single()

  if (update.error) return res.status(500).json({ error: update.error.message })

  try {
    await recalcReferralScore(update.data.referrer_id)
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to recalculate referral score' })
  }

  return res.json({ referral: update.data })
})

referralsRouter.patch('/:id/hr-decision', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = referralIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid referral id', fields: params.error.flatten() })
  }

  const parsed = hrDecisionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const referral = await supabase.from('referrals').select('*').eq('id', params.data.id).maybeSingle()
  if (referral.error) return res.status(500).json({ error: referral.error.message })
  if (!referral.data) return res.status(404).json({ error: 'Referral not found' })

  try {
    const canManage = await assertCanManageCompany(req.appUserId, referral.data.company_id)
    if (!canManage) return res.status(403).json({ error: 'Only HR/admin for this company can update referral status' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const currentStatus = referral.data.status as ReferralStatus
  const targetStatus = parsed.data.status
  const allowedNext = hrDecisionTransitions[currentStatus] ?? []

  if (!allowedNext.includes(targetStatus)) {
    return res.status(422).json({ error: `Invalid transition from ${currentStatus} to ${targetStatus}` })
  }

  const update = await supabase
    .from('referrals')
    .update({
      status: targetStatus,
      hr_decision_note: parsed.data.note?.trim() || null,
      hr_decision_by: req.appUserId,
      hr_decision_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.data.id)
    .select('*')
    .single()

  if (update.error) return res.status(500).json({ error: update.error.message })
  return res.json({ referral: update.data })
})

referralsRouter.patch('/:id/convert', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = referralIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid referral id', fields: params.error.flatten() })
  }

  const referral = await supabase.from('referrals').select('*').eq('id', params.data.id).maybeSingle()
  if (referral.error) return res.status(500).json({ error: referral.error.message })
  if (!referral.data) return res.status(404).json({ error: 'Referral not found' })

  if (referral.data.applicant_id !== req.appUserId) {
    return res.status(403).json({ error: 'Only the applicant can mark referral as converted' })
  }

  if (!['submitted', 'under_review', 'interview', 'hired'].includes(referral.data.status)) {
    return res.status(422).json({ error: `Invalid transition from ${referral.data.status}` })
  }

  const update = await supabase
    .from('referrals')
    .update({ status: 'converted', updated_at: new Date().toISOString() })
    .eq('id', params.data.id)
    .select('*')
    .single()

  if (update.error) return res.status(500).json({ error: update.error.message })
  return res.json({ referral: update.data })
})
