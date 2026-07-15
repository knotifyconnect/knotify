import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { sendBetaApprovalEmail } from '../lib/email.js'

export const adminRouter = Router()

// All routes require admin
adminRouter.use(requireAuth, requireAdmin)

// ── Beta waitlist ──────────────────────────────────────────────────────────
adminRouter.get('/beta-signups', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase.from('beta_signups').select('*').order('created_at', { ascending: false })
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }
  const result = await query
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ signups: result.data ?? [] })
})

const betaSignupStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

adminRouter.patch('/beta-signups/:id', async (req, res) => {
  const parsed = betaSignupStatusSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const upd = await supabase
    .from('beta_signups')
    .update({ status: parsed.data.status })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle()
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  if (!upd.data) return res.status(404).json({ error: 'Signup not found' })

  if (parsed.data.status === 'approved' && upd.data.email) {
    sendBetaApprovalEmail(upd.data.email, upd.data.name ?? undefined).catch((err) =>
      console.error('[admin] approval email failed:', err)
    )
  }

  return res.json({ signup: upd.data })
})

// ── Role requests ──────────────────────────────────────────────────────────
adminRouter.get('/role-requests', async (_req, res) => {
  const result = await supabase
    .from('role_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (result.error) return res.status(500).json({ error: result.error.message })

  const rows = result.data ?? []
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const users = userIds.length
    ? await supabase.from('users').select('id, full_name, username, email, avatar_url').in('id', userIds)
    : { data: [], error: null }
  if (users.error) return res.status(500).json({ error: users.error.message })

  const byId = new Map((users.data ?? []).map((u) => [u.id, u]))
  return res.json({
    requests: rows.map((r) => ({ ...r, user: byId.get(r.user_id) ?? null })),
  })
})

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
})

adminRouter.patch('/role-requests/:id', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const id = req.params.id
  const upd = await supabase
    .from('role_requests')
    .update({
      status: parsed.data.status,
      review_note: parsed.data.note ?? null,
      reviewer_id: req.appUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (upd.error) return res.status(500).json({ error: upd.error.message })
  if (!upd.data) return res.status(404).json({ error: 'Pending request not found' })

  // If approved → grant the role
  if (parsed.data.status === 'approved') {
    if (upd.data.requested_role === 'hr') {
      await supabase.from('users').update({ is_hr: true }).eq('id', upd.data.user_id)
    }
    // company_owner doesn't require a flag — the act of creating a company makes them owner
  }

  return res.json({ request: upd.data })
})

// ── User management (basic) ───────────────────────────────────────────────
adminRouter.get('/users', async (_req, res) => {
  const result = await supabase
    .from('users')
    .select('id, email, full_name, username, is_admin, is_hr, created_at')
    .order('created_at', { ascending: false })
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ users: result.data ?? [] })
})

const userPatchSchema = z.object({
  isAdmin: z.boolean().optional(),
  isHr: z.boolean().optional(),
})

adminRouter.patch('/users/:id', async (req, res) => {
  const parsed = userPatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const patch: Record<string, unknown> = {}
  if (parsed.data.isAdmin !== undefined) patch.is_admin = parsed.data.isAdmin
  if (parsed.data.isHr !== undefined) patch.is_hr = parsed.data.isHr

  if (!Object.keys(patch).length) return res.status(422).json({ error: 'Nothing to update' })

  const upd = await supabase.from('users').update(patch).eq('id', req.params.id).select('id, email, full_name, username, is_admin, is_hr').maybeSingle()
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  if (!upd.data) return res.status(404).json({ error: 'User not found' })
  return res.json({ user: upd.data })
})
