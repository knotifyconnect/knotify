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
  locationText: z.string().max(160).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
})

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length ? trimmed : null
}

function directPairKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

async function findConversationByPairKey(pairKey: string) {
  const result = await supabase
    .from('conversations')
    .select('id')
    .eq('direct_pair_key', pairKey)
    .maybeSingle()

  if (result.error) {
    const message = result.error.message.toLowerCase()
    if (message.includes('direct_pair_key')) return null
    throw new Error(result.error.message)
  }

  return result.data?.id ?? null
}

async function findDirectConversationForMeeting(userId: string, otherUserId: string) {
  const pairKey = directPairKey(userId, otherUserId)
  const byPairKey = await findConversationByPairKey(pairKey)
  if (byPairKey) return byPairKey

  const [mine, theirs] = await Promise.all([
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId),
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', otherUserId),
  ])

  if (mine.error) throw new Error(mine.error.message)
  if (theirs.error) throw new Error(theirs.error.message)

  const mineIds = new Set((mine.data ?? []).map((row) => row.conversation_id))
  const sharedIds = (theirs.data ?? []).map((row) => row.conversation_id).filter((id) => mineIds.has(id))

  if (sharedIds.length) {
    const participants = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', sharedIds)

    if (participants.error) throw new Error(participants.error.message)

    const byConversation = new Map<string, Set<string>>()
    for (const row of (participants.data ?? []) as Array<{ conversation_id: string; user_id: string }>) {
      const set = byConversation.get(row.conversation_id) ?? new Set<string>()
      set.add(row.user_id)
      byConversation.set(row.conversation_id, set)
    }

    for (const id of sharedIds) {
      const users = byConversation.get(id)
      if (users?.size === 2 && users.has(userId) && users.has(otherUserId)) {
        const update = await supabase.from('conversations').update({ direct_pair_key: pairKey }).eq('id', id)
        if (update.error) {
          const duplicate = await findConversationByPairKey(pairKey)
          if (duplicate) return duplicate
          throw new Error(update.error.message)
        }
        return id
      }
    }
  }

  const created = await supabase
    .from('conversations')
    .insert({ direct_pair_key: pairKey })
    .select('id')
    .single()

  if (created.error) {
    const duplicate = await findConversationByPairKey(pairKey)
    if (duplicate) return duplicate
    throw new Error(created.error.message)
  }

  const participants = await supabase.from('conversation_participants').insert([
    { conversation_id: created.data.id, user_id: userId },
    { conversation_id: created.data.id, user_id: otherUserId },
  ])

  if (participants.error) {
    await supabase.from('conversations').delete().eq('id', created.data.id)
    const duplicate = await findConversationByPairKey(pairKey)
    if (duplicate) return duplicate
    throw new Error(participants.error.message)
  }

  return created.data.id
}

function formatReceiptTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function meetingReceiptLocation(meeting: { cafe_id: string | null; location_text: string | null }) {
  if (meeting.cafe_id) {
    const cafe = await supabase.from('cafes').select('name').eq('id', meeting.cafe_id).maybeSingle()
    if (!cafe.error && cafe.data?.name) return cafe.data.name
  }

  return meeting.location_text ?? 'a café'
}

async function insertMeetingReceiptMessage(meetingId: string, actorId: string, peerId: string, content: string) {
  const conversationId = await findDirectConversationForMeeting(actorId, peerId)

  const insert = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: actorId,
      content,
    })
    .select('id')
    .single()

  if (insert.error) throw new Error(insert.error.message)

  const link = await supabase
    .from('meetings')
    .update({
      last_receipt_message_id: insert.data.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)

  if (link.error) throw new Error(link.error.message)
}

meetingsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  if (parsed.data.inviteeId === req.appUserId) {
    return res.status(422).json({ error: 'Cannot meet yourself' })
  }

  const normalizedCafeId = parsed.data.cafeId ?? null
  const normalizedLocationText = nullableText(parsed.data.locationText)
  const normalizedNote = nullableText(parsed.data.note)

  if (!normalizedCafeId && !normalizedLocationText) {
    return res.status(422).json({
      error: 'Invalid payload',
      fields: {
        formErrors: [],
        fieldErrors: { locationText: ['Choose a café or add a location'] },
      },
    })
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
      cafe_id: normalizedCafeId,
      location_text: normalizedLocationText,
      scheduled_at: parsed.data.scheduledAt,
      status: 'proposed',
      note: normalizedNote,
    })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })

  try {
    const where = await meetingReceiptLocation(insert.data)
    const when = formatReceiptTime(insert.data.scheduled_at)
    await insertMeetingReceiptMessage(
      insert.data.id,
      req.appUserId,
      parsed.data.inviteeId,
      `☕ Proposed: coffee at ${where} — ${when}.${normalizedNote ? ` "${normalizedNote}"` : ''}\nUse the coffee card above to respond.`
    )
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed writing meeting receipt' })
  }

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
  if ((parsed.data.status === 'confirmed' || parsed.data.status === 'declined') && meeting.data.status !== 'proposed') return res.status(422).json({ error: 'Only proposed meetings can be confirmed or declined' })
  if (parsed.data.status === 'cancelled' && meeting.data.status === 'proposed' && !isInitiator) return res.status(403).json({ error: 'Only the initiator can cancel a proposed meeting' })
  if (parsed.data.status === 'completed' && meeting.data.status !== 'confirmed') return res.status(422).json({ error: 'Only confirmed meetings can be completed' })

  const upd = await supabase
    .from('meetings')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .single()
  if (upd.error) return res.status(500).json({ error: upd.error.message })

  try {
    const peerId = isInitiator ? meeting.data.invitee_id : meeting.data.initiator_id
    const where = await meetingReceiptLocation(upd.data)
    const when = formatReceiptTime(upd.data.scheduled_at)
    const verb =
      parsed.data.status === 'confirmed'
        ? 'confirmed'
        : parsed.data.status === 'declined'
          ? 'declined'
          : parsed.data.status === 'cancelled'
            ? 'cancelled'
            : parsed.data.status

    await insertMeetingReceiptMessage(upd.data.id, req.appUserId, peerId, `☕ Coffee ${verb}: ${where} — ${when}.`)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed writing meeting receipt' })
  }

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

  const rows = result.data ?? []
  if (!rows.length) return res.json({ meetings: [] })

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
