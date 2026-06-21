import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const eventsRouter = Router()

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  startsAt: z.string().min(4), // ISO datetime
  interests: z.array(z.string().max(60)).max(10).optional(),
})

// GET /api/events?limit= — upcoming events with host + rsvp info
eventsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const events = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, interests, host_id, created_at, users:host_id(full_name, username, avatar_url)')
    .gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)

  if (events.error) return res.status(500).json({ error: events.error.message })
  const rows = events.data ?? []
  const ids = rows.map((e) => e.id)

  // rsvp counts + my rsvps
  const counts = new Map<string, number>()
  const mine = new Set<string>()
  if (ids.length) {
    const rsvps = await supabase.from('event_rsvps').select('event_id, user_id').in('event_id', ids)
    for (const r of rsvps.data ?? []) {
      counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1)
      if (r.user_id === req.appUserId) mine.add(r.event_id)
    }
  }

  const out = rows.map((e) => {
    const host = Array.isArray((e as any).users) ? (e as any).users[0] : (e as any).users
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      starts_at: e.starts_at,
      interests: e.interests ?? [],
      host_name: host?.full_name ?? 'Someone',
      host_avatar: host?.avatar_url ?? null,
      is_host: e.host_id === req.appUserId,
      rsvp_count: counts.get(e.id) ?? 0,
      rsvped: mine.has(e.id),
    }
  })

  return res.json({ events: out })
})

eventsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  const d = parsed.data

  const ins = await supabase
    .from('events')
    .insert({
      host_id: req.appUserId,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      location: d.location?.trim() || null,
      starts_at: new Date(d.startsAt).toISOString(),
      interests: d.interests ?? [],
    })
    .select('id')
    .single()

  if (ins.error) return res.status(500).json({ error: ins.error.message })
  // host auto-RSVPs
  await supabase.from('event_rsvps').upsert({ event_id: ins.data.id, user_id: req.appUserId }, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
  return res.status(201).json({ id: ins.data.id })
})

// Toggle RSVP
eventsRouter.post('/:id/rsvp', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const existing = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', req.params.id)
    .eq('user_id', req.appUserId)
    .maybeSingle()

  if (existing.data) {
    await supabase.from('event_rsvps').delete().eq('id', existing.data.id)
    return res.json({ rsvped: false })
  }
  const ins = await supabase.from('event_rsvps').insert({ event_id: req.params.id, user_id: req.appUserId })
  if (ins.error) return res.status(500).json({ error: ins.error.message })
  return res.json({ rsvped: true })
})
