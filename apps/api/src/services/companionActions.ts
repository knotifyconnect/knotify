/**
 * Companion agent actions — the real writes the Companion can perform on the
 * user's behalf from inside the chat (Claude tool-use). Every executor is
 * scoped to the authenticated user, validates its target against real data
 * (accepted connections, existing future events), and mirrors the behavior of
 * the corresponding user-facing route so an agent-sent message is
 * indistinguishable from one the user typed in /messages.
 *
 * The confirmation policy lives in the system prompt (never act outward
 * without the user's explicit go-ahead in conversation); this file is the
 * mechanical layer underneath it.
 */
import { supabase } from '../lib.js'
import type { PeerProfile } from '../engine/relationshipPriority.js'
import { notifyAskCreated } from '../lib/askNotifications.js'

export type ActionResult = {
  ok: boolean
  /** Short human-readable outcome, fed back to the model as the tool result. */
  detail: string
}

export type ExecutedAction = {
  tool: string
  detail: string
  ok: boolean
}

function directPairKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

/** Same conversation-resolution convention as routes/conversations.ts (pair key first, participant scan fallback, create last). */
async function getOrCreateDirectConversation(userId: string, peerId: string): Promise<string> {
  const pairKey = directPairKey(userId, peerId)

  const byKey = await supabase
    .from('conversations')
    .select('id')
    .eq('direct_pair_key', pairKey)
    .maybeSingle()
  if (byKey.data?.id) return byKey.data.id

  const [mine, theirs] = await Promise.all([
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId),
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', peerId),
  ])
  const myIds = new Set((mine.data ?? []).map((r) => r.conversation_id))
  const shared = (theirs.data ?? []).map((r) => r.conversation_id).filter((id) => myIds.has(id))
  if (shared.length) {
    const parts = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', shared)
    const byConv = new Map<string, Set<string>>()
    for (const p of (parts.data ?? []) as Array<{ conversation_id: string; user_id: string }>) {
      const set = byConv.get(p.conversation_id) ?? new Set<string>()
      set.add(p.user_id)
      byConv.set(p.conversation_id, set)
    }
    for (const id of shared) {
      const users = byConv.get(id)
      if (users && users.size === 2 && users.has(userId) && users.has(peerId)) return id
    }
  }

  const created = await supabase
    .from('conversations')
    .insert({ direct_pair_key: pairKey })
    .select('id')
    .single()
  if (created.error || !created.data) {
    // Unique-key race: someone created it in between — pick it up.
    const dup = await supabase.from('conversations').select('id').eq('direct_pair_key', pairKey).maybeSingle()
    if (dup.data?.id) return dup.data.id
    throw new Error(created.error?.message ?? 'Failed creating conversation')
  }
  const parts = await supabase.from('conversation_participants').insert([
    { conversation_id: created.data.id, user_id: userId },
    { conversation_id: created.data.id, user_id: peerId },
  ])
  if (parts.error) {
    await supabase.from('conversations').delete().eq('id', created.data.id)
    throw new Error(parts.error.message)
  }
  return created.data.id
}

export async function sendMessage(
  userId: string,
  peers: Map<string, PeerProfile>,
  input: { peerId?: string; text?: string }
): Promise<ActionResult> {
  const peer = input.peerId ? peers.get(input.peerId) : undefined
  if (!peer) return { ok: false, detail: 'peerId does not match any accepted connection in CONTEXT. Do not retry with an invented id.' }
  const text = (input.text ?? '').trim()
  if (!text) return { ok: false, detail: 'text is required' }
  if (text.length > 4000) return { ok: false, detail: 'text is too long (4000 char max)' }

  const conversationId = await getOrCreateDirectConversation(userId, peer.id)
  const insert = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: userId, content: text })
    .select('id')
    .single()
  if (insert.error) return { ok: false, detail: `Failed to send: ${insert.error.message}` }

  // Message restores the thread for both sides, like the normal send route.
  await supabase.from('conversation_participants').update({ archived_at: null }).eq('conversation_id', conversationId)

  return { ok: true, detail: `Message sent to ${peer.full_name}.` }
}

export async function proposeCoffee(
  userId: string,
  peers: Map<string, PeerProfile>,
  input: { peerId?: string; scheduledAt?: string; locationText?: string }
): Promise<ActionResult> {
  const peer = input.peerId ? peers.get(input.peerId) : undefined
  if (!peer) return { ok: false, detail: 'peerId does not match any accepted connection in CONTEXT. Do not retry with an invented id.' }

  const when = input.scheduledAt ? new Date(input.scheduledAt) : null
  if (!when || Number.isNaN(when.getTime())) return { ok: false, detail: 'scheduledAt must be a valid ISO datetime' }
  if (when.getTime() <= Date.now()) return { ok: false, detail: 'scheduledAt must be in the future' }

  const locationText = (input.locationText ?? '').trim()
  if (!locationText) return { ok: false, detail: 'locationText is required (a café name or meeting spot)' }

  const insert = await supabase
    .from('meetings')
    .insert({
      initiator_id: userId,
      invitee_id: peer.id,
      cafe_id: null,
      location_text: locationText.slice(0, 200),
      scheduled_at: when.toISOString(),
      status: 'proposed',
      note: null,
    })
    .select('id')
    .single()
  if (insert.error) return { ok: false, detail: `Failed to propose: ${insert.error.message}` }

  return { ok: true, detail: `Coffee proposed to ${peer.full_name} at ${locationText}, ${when.toISOString()}. They still need to confirm.` }
}

export async function rsvpEvent(userId: string, input: { eventId?: string }): Promise<ActionResult> {
  if (!input.eventId) return { ok: false, detail: 'eventId is required' }

  const event = await supabase
    .from('events')
    .select('id, title, starts_at')
    .eq('id', input.eventId)
    .maybeSingle()
  if (!event.data) return { ok: false, detail: 'Event not found. Only use eventIds from CONTEXT.' }
  if (new Date(event.data.starts_at).getTime() < Date.now()) return { ok: false, detail: 'That event already started.' }

  const existing = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', event.data.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing.data) return { ok: true, detail: `Already going to ${event.data.title}.` }

  const ins = await supabase.from('event_rsvps').insert({ event_id: event.data.id, user_id: userId })
  if (ins.error) return { ok: false, detail: `Failed to RSVP: ${ins.error.message}` }

  return { ok: true, detail: `RSVPed to ${event.data.title}.` }
}

export async function createAsk(userId: string, input: { content?: string }): Promise<ActionResult> {
  const content = (input.content ?? '').trim()
  if (content.length < 5) return { ok: false, detail: 'content must be at least 5 characters' }
  if (content.length > 280) return { ok: false, detail: 'content must be 280 characters or fewer' }

  const insert = await supabase
    .from('user_asks')
    .insert({ user_id: userId, content, audience_type: 'everyone', audience_value: null })
    .select('id, user_id, content, audience_type, audience_value')
    .single()
  if (insert.error) return { ok: false, detail: `Failed to post ask: ${insert.error.message}` }

  try {
    await notifyAskCreated(insert.data)
  } catch (error) {
    console.error('Failed to notify Ask audience', error)
  }

  return { ok: true, detail: 'Ask posted to your network.' }
}
