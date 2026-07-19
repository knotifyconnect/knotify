import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { createNotification, getUserFirstName } from '../lib/notifications.js'

export const eventsRouter = Router()

const publicEventFields = 'id, title, description, location, starts_at, ends_at, time_tba, capacity, price_eur, event_type, interests, host_id, source, url, host_label, image_url, archived_at, created_at, users:host_id(full_name, username, avatar_url)'
const publicEventFieldsWithoutArchive = 'id, title, description, location, starts_at, ends_at, time_tba, capacity, price_eur, event_type, interests, host_id, source, url, host_label, image_url, created_at, users:host_id(full_name, username, avatar_url)'
const legacyPublicEventFields = 'id, title, description, location, starts_at, ends_at, capacity, price_eur, event_type, interests, host_id, source, url, host_label, image_url, created_at, users:host_id(full_name, username, avatar_url)'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

const EVENT_IMAGES_BUCKET = 'event-images'

async function ensureEventBucket() {
  const buckets = await supabase.storage.listBuckets()
  if (buckets.error) throw new Error(buckets.error.message)
  if (!buckets.data.find((b) => b.name === EVENT_IMAGES_BUCKET)) {
    const create = await supabase.storage.createBucket(EVENT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    })
    if (create.error) throw new Error(create.error.message)
  }
}

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

  let events: any = await supabase
    .from('events')
    .select(publicEventFields)
    .gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .is('archived_at', null)
    .order('starts_at', { ascending: true })
    .limit(limit)

  if (events.error?.message.includes('archived_at')) {
    events = await supabase.from('events').select(publicEventFieldsWithoutArchive).gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString()).order('starts_at', { ascending: true }).limit(limit)
  }
  let legacyEvents: any = null
  if (events.error?.message.includes('time_tba')) {
    legacyEvents = await supabase.from('events').select(legacyPublicEventFields).gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString()).order('starts_at', { ascending: true }).limit(limit)
  }
  if (events.error && !legacyEvents) return res.status(500).json({ error: events.error.message })
  if (legacyEvents?.error) return res.status(500).json({ error: legacyEvents.error.message })
  const rows = (legacyEvents?.data ?? events.data ?? []).map((event: any) => legacyEvents ? { ...event, time_tba: false } : event)
  const ids = rows.map((e: any) => e.id)

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

  const out = rows.map((e: any) => {
    const host = Array.isArray((e as any).users) ? (e as any).users[0] : (e as any).users
    const curated = (e as any).source === 'curated'
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      starts_at: e.starts_at,
      interests: e.interests ?? [],
      source: (e as any).source ?? 'peer',
      url: (e as any).url ?? null,
      image_url: (e as any).image_url ?? null,
      host_name: curated ? ((e as any).host_label ?? 'Munich') : (host?.full_name ?? 'Someone'),
      host_avatar: host?.avatar_url ?? null,
      is_host: !!e.host_id && e.host_id === req.appUserId,
      rsvp_count: counts.get(e.id) ?? 0,
      rsvped: mine.has(e.id),
      ends_at: (e as any).ends_at ?? null,
      capacity: (e as any).capacity ?? null,
      price_eur: (e as any).price_eur ?? null,
      event_type: (e as any).event_type ?? null,
      time_tba: Boolean((e as any).time_tba),
    }
  })

  return res.json({ events: out })
})

eventsRouter.post('/', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  // interests may arrive as a JSON string under multipart, or as an array under JSON.
  const rawInterests = (req.body as any).interests
  const interests = Array.isArray(rawInterests)
    ? rawInterests
    : typeof rawInterests === 'string' && rawInterests.trim()
      ? (() => { try { const v = JSON.parse(rawInterests); return Array.isArray(v) ? v : [] } catch { return [] } })()
      : undefined

  const parsed = createSchema.safeParse({ ...req.body, interests })
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  const d = parsed.data

  // Optional cover image upload
  let imageUrl: string | null = null
  if (req.file) {
    try {
      await ensureEventBucket()
      const ext = (req.file.mimetype.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '') || 'png'
      const path = `${req.appUserId}/${Date.now()}.${ext}`
      const upl = await supabase.storage.from(EVENT_IMAGES_BUCKET).upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })
      if (upl.error) return res.status(500).json({ error: `Image upload failed: ${upl.error.message}` })
      imageUrl = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Image upload failed' })
    }
  }

  const ins = await supabase
    .from('events')
    .insert({
      host_id: req.appUserId,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      location: d.location?.trim() || null,
      starts_at: new Date(d.startsAt).toISOString(),
      interests: d.interests ?? [],
      image_url: imageUrl,
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

  const event = await supabase.from('events').select('host_id, title').eq('id', req.params.id).maybeSingle()
  if (event.data && event.data.host_id !== req.appUserId) {
    const attendeeName = await getUserFirstName(req.appUserId)
    void createNotification({
      userId: event.data.host_id,
      actorId: req.appUserId,
      type: 'event_rsvp',
      title: `${attendeeName} RSVP'd to ${event.data.title}`,
      entityType: 'event',
      entityId: req.params.id,
    })
  }

  return res.json({ rsvped: true })
})
