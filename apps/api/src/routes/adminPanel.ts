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

// ── Events (curated Munich events + view peer events) ───────────────────────
adminPanelRouter.get('/events', async (_req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, source, url, host_label, host_id, created_at')
    .order('starts_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ events: data ?? [] })
})

adminPanelRouter.post('/events', async (req, res) => {
  const { title, description, location, startsAt, url, hostLabel, interests } = req.body
  if (!title || !startsAt) return res.status(422).json({ error: 'Title and start time are required.' })
  const { data, error } = await supabase
    .from('events')
    .insert({
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      location: location ? String(location).trim() : null,
      starts_at: new Date(startsAt).toISOString(),
      url: url ? String(url).trim() : null,
      host_label: hostLabel ? String(hostLabel).trim() : 'Munich',
      source: 'curated',
      interests: Array.isArray(interests) ? interests : [],
    })
    .select('id')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.delete('/events/:id', async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// ── Gigs (moderation) ───────────────────────────────────────────────────────
adminPanelRouter.get('/gigs', async (_req, res) => {
  const { data, error } = await supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, created_at, users:provider_id(full_name, credibility_score)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  const gigs = (data ?? []).map((g: any) => {
    const p = Array.isArray(g.users) ? g.users[0] : g.users
    return { ...g, users: undefined, provider_name: p?.full_name ?? 'Someone', provider_credibility: p?.credibility_score ?? 0 }
  })
  return res.json({ gigs })
})

adminPanelRouter.patch('/gigs/:id', async (req, res) => {
  const { status } = req.body
  if (!['open', 'closed'].includes(status)) return res.status(422).json({ error: 'Invalid status.' })
  const { error } = await supabase.from('gigs').update({ status }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/gigs/:id', async (req, res) => {
  const { error } = await supabase.from('gigs').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// ── Quests (admin-managed honour quests) ────────────────────────────────────
adminPanelRouter.get('/quests', async (_req, res) => {
  const { data, error } = await supabase.from('quests').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ quests: data ?? [] })
})

adminPanelRouter.post('/quests', async (req, res) => {
  const { title, description, points, category, icon, active, startsAt, endsAt } = req.body
  if (!title) return res.status(422).json({ error: 'Title is required.' })
  const key =
    String(title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) +
    '_' + Math.random().toString(36).slice(2, 6)
  const { data, error } = await supabase
    .from('quests')
    .insert({
      key,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      points: Number(points) || 10,
      category: category || 'social',
      icon: icon || 'sparkles',
      active: active !== false,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    })
    .select('id')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.patch('/quests/:id', async (req, res) => {
  const patch: Record<string, unknown> = {}
  const b = req.body
  if (b.title !== undefined) patch.title = String(b.title).trim()
  if (b.description !== undefined) patch.description = b.description ? String(b.description).trim() : null
  if (b.points !== undefined) patch.points = Number(b.points) || 0
  if (b.category !== undefined) patch.category = b.category
  if (b.icon !== undefined) patch.icon = b.icon
  if (b.active !== undefined) patch.active = !!b.active
  if (b.startsAt !== undefined) patch.starts_at = b.startsAt ? new Date(b.startsAt).toISOString() : null
  if (b.endsAt !== undefined) patch.ends_at = b.endsAt ? new Date(b.endsAt).toISOString() : null
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields provided.' })
  const { error } = await supabase.from('quests').update(patch).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/quests/:id', async (req, res) => {
  const { error } = await supabase.from('quests').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

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
