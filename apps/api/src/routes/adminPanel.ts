import { Router } from 'express'
import { supabase } from '../lib.js'

export const adminPanelRouter = Router()

// Simple secret key auth — no user accounts needed
function requirePanelSecret(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) return res.status(500).json({ error: 'Admin panel not configured.' })

  const auth = req.headers['x-admin-secret']
  if (auth !== secret) return res.status(401).json({ error: 'Unauthorized.' })

  next()
}

adminPanelRouter.use(requirePanelSecret)

// ── Beta signups ──────────────────────────────────────────────────────────────

adminPanelRouter.get('/beta-signups', async (req, res) => {
  const status = req.query.status as string | undefined

  let query = supabase
    .from('beta_signups')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ signups: data ?? [] })
})

adminPanelRouter.patch('/beta-signups/:id', async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(422).json({ error: 'Invalid status.' })
  }

  const { data, error } = await supabase
    .from('beta_signups')
    .update({ status })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Signup not found.' })
  return res.json({ signup: data })
})

// ── Stats ─────────────────────────────────────────────────────────────────────

adminPanelRouter.get('/stats', async (_req, res) => {
  const [total, pending, approved, rejected] = await Promise.all([
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('beta_signups').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ])

  return res.json({
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  })
})
