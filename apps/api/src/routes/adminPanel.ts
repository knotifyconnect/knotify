import { Router } from 'express'
import multer from 'multer'
import { supabase } from '../lib.js'
import { invalidateBetaCache } from '../middleware/auth.js'

export const adminPanelRouter = Router()

function requirePanelSecret(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_PANEL_SECRET
  if (!secret) return res.status(500).json({ error: 'Admin panel not configured.' })
  const auth = req.headers['x-admin-secret']
  if (auth !== secret) return res.status(401).json({ error: 'Unauthorized.' })
  next()
}

adminPanelRouter.use(requirePanelSecret)

// ── Image upload ──────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })
const ADMIN_IMAGES_BUCKET = 'admin-images'

async function ensureAdminBucket() {
  const { data } = await supabase.storage.listBuckets()
  if (!data?.find(b => b.name === ADMIN_IMAGES_BUCKET)) {
    await supabase.storage.createBucket(ADMIN_IMAGES_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    })
  }
}

adminPanelRouter.post('/upload', upload.single('image'), async (req: any, res: any) => {
  if (!req.file) return res.status(422).json({ error: 'No image file provided.' })
  try {
    await ensureAdminBucket()
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(ADMIN_IMAGES_BUCKET).upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    })
    if (error) return res.status(500).json({ error: error.message })
    const { data: pub } = supabase.storage.from(ADMIN_IMAGES_BUCKET).getPublicUrl(path)
    return res.json({ url: pub.publicUrl })
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Upload failed.' })
  }
})

// ── Beta signups ──────────────────────────────────────────────────────────────
adminPanelRouter.get('/beta-signups', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase.from('beta_signups').select('*').order('created_at', { ascending: false })
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
    .from('beta_signups').update({ status }).eq('id', req.params.id).select('*').maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Signup not found.' })
  return res.json({ signup: data })
})

// ── Events ────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/events', async (_req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, source, url, host_label, image_url, event_type, capacity, price_eur, interests, created_at')
    .order('starts_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ events: data ?? [] })
})

function parseEventBody(b: any) {
  const patch: Record<string, unknown> = {}
  if (b.title !== undefined)       patch.title       = String(b.title).trim()
  if (b.description !== undefined) patch.description = b.description ? String(b.description).trim() : null
  if (b.location !== undefined)    patch.location    = b.location ? String(b.location).trim() : null
  if (b.startsAt !== undefined)    patch.starts_at   = b.startsAt ? new Date(b.startsAt).toISOString() : null
  if (b.endsAt !== undefined)      patch.ends_at     = b.endsAt ? new Date(b.endsAt).toISOString() : null
  if (b.url !== undefined)         patch.url         = b.url ? String(b.url).trim() : null
  if (b.hostLabel !== undefined)   patch.host_label  = b.hostLabel ? String(b.hostLabel).trim() : null
  if (b.imageUrl !== undefined)    patch.image_url   = b.imageUrl ? String(b.imageUrl).trim() : null
  if (b.eventType !== undefined)   patch.event_type  = b.eventType || null
  if (b.capacity !== undefined)    patch.capacity    = b.capacity != null ? Number(b.capacity) : null
  if (b.priceEur !== undefined)    patch.price_eur   = b.priceEur != null ? Number(b.priceEur) : null
  if (b.interests !== undefined)   patch.interests   = Array.isArray(b.interests) ? b.interests : []
  return patch
}

adminPanelRouter.post('/events', async (req, res) => {
  const b = req.body
  if (!b.title || !b.startsAt) return res.status(422).json({ error: 'Title and start time are required.' })
  const fields = parseEventBody(b)
  const { data, error } = await supabase
    .from('events')
    .insert({ ...fields, source: 'curated', host_label: fields.host_label ?? 'Munich' })
    .select('id').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.patch('/events/:id', async (req, res) => {
  const fields = parseEventBody(req.body)
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields provided.' })
  const { error } = await supabase.from('events').update(fields).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/events/:id', async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// ── Gigs ──────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/gigs', async (_req, res) => {
  const { data, error } = await supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, is_featured, created_at, users:provider_id(full_name, credibility_score)')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const gigs = (data ?? []).map((g: any) => {
    const p = Array.isArray(g.users) ? g.users[0] : g.users
    return { ...g, users: undefined, provider_name: p?.full_name ?? 'Someone', provider_credibility: p?.credibility_score ?? 0 }
  })

  // Attach active-request counts so admins see traction at a glance
  const gigIds = gigs.map((g: any) => g.id)
  if (gigIds.length) {
    const reqs = await supabase.from('gig_requests').select('gig_id, status').in('gig_id', gigIds)
    const counts = new Map<string, { active: number; total: number }>()
    for (const r of reqs.data ?? []) {
      const c = counts.get(r.gig_id) ?? { active: 0, total: 0 }
      c.total += 1
      if (['pending', 'accepted'].includes(r.status)) c.active += 1
      counts.set(r.gig_id, c)
    }
    for (const g of gigs as any[]) {
      const c = counts.get(g.id)
      g.active_request_count = c?.active ?? 0
      g.total_request_count = c?.total ?? 0
    }
  }

  return res.json({ gigs })
})

adminPanelRouter.patch('/gigs/:id', async (req, res) => {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (req.body.status !== undefined) {
    if (!['open', 'closed'].includes(req.body.status)) return res.status(422).json({ error: 'Invalid status.' })
    patch.status = req.body.status
  }
  if (req.body.isFeatured !== undefined) patch.is_featured = Boolean(req.body.isFeatured)
  if (req.body.title !== undefined) patch.title = String(req.body.title).trim()
  if (req.body.description !== undefined) patch.description = req.body.description ? String(req.body.description).trim() : null
  if (Object.keys(patch).length === 1) return res.status(400).json({ error: 'No fields provided.' })

  const { error } = await supabase.from('gigs').update(patch).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

adminPanelRouter.delete('/gigs/:id', async (req, res) => {
  const { error } = await supabase.from('gigs').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// All gig requests across the platform — moderation oversight of the pipeline
adminPanelRouter.get('/gig-requests', async (req, res) => {
  const status = req.query.status as string | undefined
  let query = supabase
    .from('gig_requests')
    .select('id, gig_id, status, message, price_eur, created_at, gigs:gig_id(title), seeker:seeker_id(full_name), provider:provider_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && ['pending', 'accepted', 'declined', 'completed', 'cancelled'].includes(status)) {
    query = query.eq('status', status)
  }
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  const requests = (data ?? []).map((r: any) => {
    const gig = Array.isArray(r.gigs) ? r.gigs[0] : r.gigs
    const seeker = Array.isArray(r.seeker) ? r.seeker[0] : r.seeker
    const provider = Array.isArray(r.provider) ? r.provider[0] : r.provider
    return {
      id: r.id,
      gig_id: r.gig_id,
      status: r.status,
      message: r.message,
      price_eur: r.price_eur,
      created_at: r.created_at,
      gig_title: gig?.title ?? 'Gig',
      seeker_name: seeker?.full_name ?? 'Someone',
      provider_name: provider?.full_name ?? 'Someone',
    }
  })
  return res.json({ requests })
})

// ── Quests ────────────────────────────────────────────────────────────────────
adminPanelRouter.get('/quests', async (_req, res) => {
  const { data, error } = await supabase.from('quests').select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ quests: data ?? [] })
})

function parseQuestBody(b: any) {
  const patch: Record<string, unknown> = {}
  if (b.title !== undefined)              patch.title               = String(b.title).trim()
  if (b.description !== undefined)        patch.description         = b.description ? String(b.description).trim() : null
  if (b.points !== undefined)             patch.points              = Number(b.points) || 10
  if (b.category !== undefined)           patch.category            = b.category
  if (b.icon !== undefined)               patch.icon                = b.icon
  if (b.active !== undefined)             patch.active              = !!b.active
  if (b.startsAt !== undefined)           patch.starts_at           = b.startsAt ? new Date(b.startsAt).toISOString() : null
  if (b.endsAt !== undefined)             patch.ends_at             = b.endsAt ? new Date(b.endsAt).toISOString() : null
  if (b.howTo !== undefined)              patch.how_to              = b.howTo ? String(b.howTo).trim() : null
  if (b.whereToGo !== undefined)          patch.where_to_go         = b.whereToGo ? String(b.whereToGo).trim() : null
  if (b.difficulty !== undefined)         patch.difficulty          = b.difficulty || null
  if (b.estimatedMinutes !== undefined)   patch.estimated_minutes   = b.estimatedMinutes != null ? Number(b.estimatedMinutes) : null
  if (b.partnerRequired !== undefined)    patch.partner_required    = !!b.partnerRequired
  if (b.type !== undefined)               patch.type                = b.type || 'self'
  return patch
}

adminPanelRouter.post('/quests', async (req, res) => {
  const b = req.body
  if (!b.title) return res.status(422).json({ error: 'Title is required.' })
  const key =
    String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) +
    '_' + Math.random().toString(36).slice(2, 6)
  const fields = parseQuestBody({ active: true, ...b })
  const { data, error } = await supabase.from('quests').insert({ key, ...fields }).select('id').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ id: data.id })
})

adminPanelRouter.patch('/quests/:id', async (req, res) => {
  const patch = parseQuestBody(req.body)
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

// ── App settings (beta toggle etc.) ──────────────────────────────────────────
adminPanelRouter.get('/settings', async (_req, res) => {
  const { data, error } = await supabase.from('app_settings').select('key, value')
  if (error) return res.status(500).json({ error: error.message })
  const settings: Record<string, unknown> = {}
  for (const row of data ?? []) settings[row.key] = row.value
  return res.json({ settings })
})

adminPanelRouter.patch('/settings', async (req, res) => {
  const { key, value } = req.body
  if (typeof key !== 'string' || key.length === 0) {
    return res.status(422).json({ error: 'key is required' })
  }
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return res.status(500).json({ error: error.message })
  if (key === 'beta_open') invalidateBetaCache()
  return res.json({ ok: true })
})

// ── Invites admin ─────────────────────────────────────────────────────────────
adminPanelRouter.get('/invites', async (_req, res) => {
  // All invite rows joined with both users
  const { data: rows, error } = await supabase
    .from('invites')
    .select('id, created_at, code, inviter_id, invitee_id')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const allIds = new Set<string>()
  for (const r of rows ?? []) { allIds.add(r.inviter_id); allIds.add(r.invitee_id) }

  const usersRes = allIds.size
    ? await supabase.from('users').select('id, full_name, username, email, persona, interests, goals, created_at').in('id', [...allIds])
    : { data: [], error: null }
  if (usersRes.error) return res.status(500).json({ error: usersRes.error.message })

  const byId = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]))

  function isOnboarded(u: any) {
    if (!u) return false
    const interests = Array.isArray(u.interests) ? u.interests : []
    const goals = Array.isArray(u.goals) ? u.goals : []
    return !!u.persona && interests.length >= 3 && goals.length >= 1
  }

  const invites = (rows ?? []).map((r: any) => {
    const inviter = byId.get(r.inviter_id)
    const invitee = byId.get(r.invitee_id)
    return {
      id: r.id,
      created_at: r.created_at,
      code: r.code,
      inviter: inviter ? { id: inviter.id, full_name: inviter.full_name, username: inviter.username, email: inviter.email } : null,
      invitee: invitee ? { id: invitee.id, full_name: invitee.full_name, username: invitee.username, email: invitee.email, onboarded: isOnboarded(invitee) } : null,
    }
  })

  // Leaderboard: inviters ranked by count
  const countMap = new Map<string, { inviter: any; total: number; onboarded: number }>()
  for (const inv of invites) {
    if (!inv.inviter) continue
    const entry = countMap.get(inv.inviter.id) ?? { inviter: inv.inviter, total: 0, onboarded: 0 }
    entry.total++
    if (inv.invitee?.onboarded) entry.onboarded++
    countMap.set(inv.inviter.id, entry)
  }
  const leaderboard = [...countMap.values()].sort((a, b) => b.total - a.total)

  return res.json({ invites, leaderboard })
})
