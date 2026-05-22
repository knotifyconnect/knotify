import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

const createCompanySchema = z.object({
  name: z.string().min(2),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
})

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['hr', 'employee', 'admin']).default('employee'),
  title: z.string().max(160).optional(),
})

const manageMemberSchema = z.object({
  action: z.enum(['confirm', 'remove']),
  role: z.enum(['hr', 'employee', 'admin']).optional(),
  title: z.string().max(160).optional(),
})

const companyIdParamSchema = z.object({
  id: z.string().uuid(),
})

const companyMemberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
})

async function currentUser(userId: string) {
  return supabase.from('users').select('id, is_hr').eq('id', userId).single()
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

export const companiesRouter = Router()

companiesRouter.get('/', requireAuth, async (_req, res) => {
  const companies = await supabase.from('companies').select('*').order('created_at', { ascending: false })
  if (companies.error) return res.status(500).json({ error: companies.error.message })

  const ids = (companies.data ?? []).map((c) => c.id)

  let memberCounts = new Map<string, number>()
  let openJobCounts = new Map<string, number>()

  if (ids.length) {
    const members = await supabase.from('company_members').select('company_id').in('company_id', ids).eq('confirmed', true)
    if (members.error) return res.status(500).json({ error: members.error.message })
    memberCounts = (members.data ?? []).reduce((map, row) => {
      map.set(row.company_id, (map.get(row.company_id) ?? 0) + 1)
      return map
    }, new Map<string, number>())

    const jobs = await supabase.from('jobs').select('company_id').in('company_id', ids).eq('status', 'open')
    if (jobs.error) return res.status(500).json({ error: jobs.error.message })
    openJobCounts = (jobs.data ?? []).reduce((map, row) => {
      map.set(row.company_id, (map.get(row.company_id) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  }

  const list = (companies.data ?? []).map((company) => ({
    ...company,
    confirmedMemberCount: memberCounts.get(company.id) ?? 0,
    openJobsCount: openJobCounts.get(company.id) ?? 0,
  }))

  return res.json({ companies: list })
})

companiesRouter.get('/:id/members', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = companyIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid company id', fields: params.error.flatten() })
  }
  const companyId = params.data.id

  try {
    const allowed = await canManageCompany(companyId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to view members for this company' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const members = await supabase
    .from('company_members')
    .select('id, company_id, user_id, role, title, confirmed, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (members.error) return res.status(500).json({ error: members.error.message })

  const userIds = [...new Set((members.data ?? []).map((m) => m.user_id))]
  const users = userIds.length
    ? await supabase.from('users').select('id, full_name, username, avatar_url, email').in('id', userIds)
    : { data: [], error: null }

  if (users.error) return res.status(500).json({ error: users.error.message })
  const usersById = new Map((users.data ?? []).map((u) => [u.id, u]))

  return res.json({
    members: (members.data ?? []).map((m) => ({ ...m, user: usersById.get(m.user_id) ?? null })),
  })
})

companiesRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = createCompanySchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const user = await currentUser(req.appUserId)
  if (user.error) return res.status(500).json({ error: user.error.message })
  if (!user.data?.is_hr) return res.status(403).json({ error: 'Only HR users can create companies' })

  const data = parsed.data
  const company = await supabase
    .from('companies')
    .insert({
      name: data.name.trim(),
      logo_url: data.logoUrl?.trim() ?? null,
      website: data.website?.trim() ?? null,
      description: data.description?.trim() ?? null,
      industry: data.industry?.trim() ?? null,
      city: data.city?.trim() || 'Munich',
      created_by: req.appUserId,
    })
    .select('*')
    .single()

  if (company.error) return res.status(500).json({ error: company.error.message })

  const addCreator = await supabase.from('company_members').insert({
    company_id: company.data.id,
    user_id: req.appUserId,
    role: 'admin',
    title: 'Creator',
    confirmed: true,
  })

  if (addCreator.error) return res.status(500).json({ error: addCreator.error.message })

  return res.status(201).json({ company: company.data })
})

companiesRouter.post('/:id/members', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = companyIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid company id', fields: params.error.flatten() })
  }
  const companyId = params.data.id

  const parsed = addMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  try {
    const allowed = await canManageCompany(companyId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to manage this company' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  const member = await supabase
    .from('company_members')
    .upsert(
      {
        company_id: companyId,
        user_id: parsed.data.userId,
        role: parsed.data.role,
        title: parsed.data.title?.trim() ?? null,
        confirmed: false,
      },
      { onConflict: 'company_id,user_id' }
    )
    .select('*')
    .single()

  if (member.error) return res.status(500).json({ error: member.error.message })
  return res.status(201).json({ member: member.data })
})

companiesRouter.patch('/:id/members/:userId', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = companyMemberParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid route params', fields: params.error.flatten() })
  }
  const { id: companyId, userId } = params.data

  const parsed = manageMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  try {
    const allowed = await canManageCompany(companyId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to manage this company' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Permission check failed' })
  }

  if (parsed.data.action === 'remove') {
    const remove = await supabase
      .from('company_members')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()

    if (remove.error) return res.status(500).json({ error: remove.error.message })
    if (!remove.data) return res.status(404).json({ error: 'Member not found' })
    return res.status(204).send()
  }

  const update: Record<string, unknown> = { confirmed: true }
  if (parsed.data.role) update.role = parsed.data.role
  if (parsed.data.title !== undefined) update.title = parsed.data.title.trim()

  const member = await supabase
    .from('company_members')
    .update(update)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (member.error) return res.status(500).json({ error: member.error.message })
  if (!member.data) return res.status(404).json({ error: 'Member not found' })

  return res.json({ member: member.data })
})
