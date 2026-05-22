import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const meetingsRouter = Router()

// ── Create a meeting proposal ─────────────────────────────────────────────
const createSchema = z.object({
  inviteeId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  cafeId: z.string().uuid().optional().nullable(),
  locationText: z.string().max(160).optional(),
  note: z.string().max(500).optional(),
})

meetingsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  if (parsed.data.inviteeId === req.appUserId) {
    return res.status(422).json({ error: 'Cannot meet yourself' })
  }

  // Must be connected
  const conn = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${req.appUserId},addressee_id.eq.${parsed.data.inviteeId}),and(requester_id.eq.${parsed.data.inviteeId},addressee_id.eq.${req.appUserId})`
    )
    .maybeSingle()
  if (conn.error) return res.status(500).json({ error: conn.error.message })
  if (!conn.data) return res.status(403).json({ error: 'You can only schedule meetings with connections' })

  const insert = await supabase
    .from('meetings')
    .insert({
      initiator_id: req.appUserId,
      invitee_id: parsed.data.inviteeId,
      cafe_id: parsed.data.cafeId ?? null,
      location_text: parsed.data.locationText ?? null,
      scheduled_at: parsed.data.scheduledAt,
      status: 'proposed',
      note: parsed.data.note ?? null,
    })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })
  return res.status(201).json({ meeting: insert.data })
})

// ── Confirm / decline / cancel ────────────────────────────────────────────
const patchSchema = z.object({
  status: z.enum(['confirmed', 'declined', 'cancelled', 'completed']),
})

meetingsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  // Get the meeting first to authorise
  const meeting = await supabase.from('meetings').select('*').eq('id', req.params.id).maybeSingle()
  if (meeting.error) return res.status(500).json({ error: meeting.error.message })
  if (!meeting.data) return res.status(404).json({ error: 'Meeting not found' })

  const isInitiator = meeting.data.initiator_id === req.appUserId
  const isInvitee = meeting.data.invitee_id === req.appUserId
  if (!isInitiator && !isInvitee) return res.status(403).json({ error: 'Not your meeting' })

  // Only invitee can confirm/decline a proposed meeting
  if (parsed.data.status === 'confirmed' && !isInvitee) return res.status(403).json({ error: 'Only the invitee can confirm' })
  if (parsed.data.status === 'declined' && !isInvitee) return res.status(403).json({ error: 'Only the invitee can decline' })

  const upd = await supabase
    .from('meetings')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .single()
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  return res.json({ meeting: upd.data })
})

// ── My next upcoming meeting (for the map "Tomorrow · IRL" card) ──────────
meetingsRouter.get('/upcoming', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const nowIso = new Date().toISOString()

  const result = await supabase
    .from('meetings')
    .select('*')
    .or(`initiator_id.eq.${req.appUserId},invitee_id.eq.${req.appUserId}`)
    .in('status', ['proposed', 'confirmed'])
    .gte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (result.error) return res.status(500).json({ error: result.error.message })
  const rows = result.data ?? []

  const peerIds = [...new Set(rows.map((m) => (m.initiator_id === req.appUserId ? m.invitee_id : m.initiator_id)))]
  const cafeIds = [...new Set(rows.map((m) => m.cafe_id).filter(Boolean) as string[])]

  const [peers, cafes] = await Promise.all([
    peerIds.length
      ? supabase.from('users').select('id, full_name, username, avatar_url').in('id', peerIds)
      : Promise.resolve({ data: [], error: null }),
    cafeIds.length
      ? supabase.from('cafes').select('id, name, slug, address').in('id', cafeIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if ((peers as { error: { message: string } | null }).error) {
    return res.status(500).json({ error: (peers as { error: { message: string } }).error.message })
  }
  if ((cafes as { error: { message: string } | null }).error) {
    return res.status(500).json({ error: (cafes as { error: { message: string } }).error.message })
  }

  const peersMap = new Map(((peers.data ?? []) as Array<{ id: string }>).map((p) => [p.id, p]))
  const cafesMap = new Map(((cafes.data ?? []) as Array<{ id: string }>).map((c) => [c.id, c]))

  const meetings = rows.map((m) => ({
    ...m,
    peer: peersMap.get(m.initiator_id === req.appUserId ? m.invitee_id : m.initiator_id) ?? null,
    cafe: m.cafe_id ? cafesMap.get(m.cafe_id) ?? null : null,
    am_initiator: m.initiator_id === req.appUserId,
  }))

  return res.json({ meetings })
})

// ── List all my meetings (past + future) ──────────────────────────────────
meetingsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const result = await supabase
    .from('meetings')
    .select('*')
    .or(`initiator_id.eq.${req.appUserId},invitee_id.eq.${req.appUserId}`)
    .order('scheduled_at', { ascending: false })
    .limit(100)
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ meetings: result.data ?? [] })
})
