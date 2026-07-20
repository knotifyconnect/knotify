/**
 * /api/asks — professional asks on the knot map.
 *
 * Endpoints:
 *   GET  /api/asks/by-user/:userId        — list a user's asks (open first, then resolved)
 *   POST /api/asks                         — create a new ask (auth user)
 *   PATCH /api/asks/:id                     — edit own ask text
 *   POST /api/asks/:id/resolve             — mark own ask as resolved
 *   POST /api/asks/:id/reopen              — un-resolve own ask
 *   DELETE /api/asks/:id                   — delete own ask
 *   GET  /api/asks/:id/replies             — list replies
 *   POST /api/asks/:id/replies             — post a reply
 *   DELETE /api/asks/:id/replies/:replyId  — delete own reply
 *   POST /api/asks/:id/react               — toggle a reaction emoji
 */
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { createNotification, getUserFirstName } from '../lib/notifications.js'

export const asksRouter = Router()

const ALLOWED_EMOJIS = ['❤️', '👍', '🙌', '💡', '🔥', '🤝'] as const

const createAskSchema = z.object({
  content: z.string().min(1).max(280),
  audienceType: z.enum(['everyone', 'interest', 'persona']).default('everyone'),
  audienceValue: z.string().max(80).nullable().optional(),
})
const updateAskSchema = z.object({
  content: z.string().min(1).max(280),
})
const replySchema = z.object({
  body: z.string().min(1).max(800),
})
const reactSchema = z.object({
  emoji: z.enum(ALLOWED_EMOJIS),
})

type AskRow = {
  id: string
  user_id: string
  content: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  created_at: string
  audience_type?: 'everyone' | 'interest' | 'persona'
  audience_value?: string | null
}

type ReactionRow = {
  ask_id: string
  user_id: string
  emoji: string
}

type ReplyRow = {
  id: string
  ask_id: string
  user_id: string
  body: string
  created_at: string
}

// ── Hydrate asks with replies count and reactions map ────────────────────────
async function hydrateAsks(asks: AskRow[], viewerId: string) {
  if (asks.length === 0) return []
  const askIds = asks.map((a) => a.id)

  const [reactionsR, repliesR] = await Promise.allSettled([
    supabase.from('ask_reactions').select('ask_id, user_id, emoji').in('ask_id', askIds),
    supabase.from('ask_replies').select('ask_id, id').in('ask_id', askIds),
  ])

  const reactionRows: ReactionRow[] = (reactionsR.status === 'fulfilled' && !reactionsR.value.error)
    ? (reactionsR.value.data ?? []) as ReactionRow[]
    : []
  const replyRows: Array<{ ask_id: string; id: string }> = (repliesR.status === 'fulfilled' && !repliesR.value.error)
    ? (repliesR.value.data ?? []) as Array<{ ask_id: string; id: string }>
    : []

  // Build reactions map per ask
  const reactionsByAsk = new Map<string, Record<string, { count: number; mine: boolean }>>()
  for (const r of reactionRows) {
    const map = reactionsByAsk.get(r.ask_id) ?? {}
    if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
    map[r.emoji].count += 1
    if (r.user_id === viewerId) map[r.emoji].mine = true
    reactionsByAsk.set(r.ask_id, map)
  }

  // Reply count per ask
  const replyCount = new Map<string, number>()
  for (const r of replyRows) {
    replyCount.set(r.ask_id, (replyCount.get(r.ask_id) ?? 0) + 1)
  }

  return asks.map((a) => ({
    ...a,
    reactions: reactionsByAsk.get(a.id) ?? {},
    reply_count: replyCount.get(a.id) ?? 0,
  }))
}

// ── List a user's asks ───────────────────────────────────────────────────────
asksRouter.get('/by-user/:userId', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const userId = req.params.userId
    if (!userId) return res.status(422).json({ error: 'Invalid userId' })

    // Open first (most recent), then resolved
    const openR = await supabase
      .from('user_asks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (openR.error) {
      // eslint-disable-next-line no-console
      console.error('asks/by-user open query error:', openR.error)
      return res.status(500).json({ error: openR.error.message })
    }

    const resolvedR = await supabase
      .from('user_asks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(5)

    const allAsks: AskRow[] = [
      ...(openR.data ?? []) as AskRow[],
      ...(!resolvedR.error ? (resolvedR.data ?? []) as AskRow[] : []),
    ]

    const hydrated = await hydrateAsks(allAsks, req.appUserId)
    return res.json({ asks: hydrated })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('asks/by-user error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Create an ask ────────────────────────────────────────────────────────────
asksRouter.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = createAskSchema.safeParse(req.body)
    if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

    const audienceType = parsed.data.audienceType
    const audienceValue = audienceType === 'everyone' ? null : (parsed.data.audienceValue ?? null)
    if (audienceType !== 'everyone' && !audienceValue) {
      return res.status(422).json({ error: 'Pick who this ask is for.' })
    }

    const insert = await supabase
      .from('user_asks')
      .insert({
        user_id: req.appUserId,
        content: parsed.data.content,
        audience_type: audienceType,
        audience_value: audienceValue,
      })
      .select('*')
      .maybeSingle()

    if (insert.error || !insert.data) return res.status(500).json({ error: insert.error?.message ?? 'Insert failed' })
    return res.json({ ask: { ...insert.data, reactions: {}, reply_count: 0 } })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── "Asks for you" feed: targeted, answerable asks from other people ──────────
async function acceptedConnectionIds(viewerId: string): Promise<string[]> {
  const result = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)

  const rows = (result.data ?? []) as { requester_id: string; addressee_id: string; status: string }[]
  return rows
    .filter((c) => c.status === 'accepted')
    .map((c) => (c.requester_id === viewerId ? c.addressee_id : c.requester_id))
}

async function matchedOpenAsks(viewerId: string): Promise<AskRow[]> {
  // "Everyone" means everyone in the viewer's own network, not the whole
  // knotify user base — asks are a connections-scoped discovery surface.
  const connectionIds = await acceptedConnectionIds(viewerId)
  if (connectionIds.length === 0) return []

  const meR = await supabase.from('users').select('interests, persona').eq('id', viewerId).maybeSingle()
  const interests: string[] = Array.isArray(meR.data?.interests) ? meR.data!.interests : []
  const persona: string | null = meR.data?.persona ?? null

  // Pull recent open asks from connections, then match by audience in JS — the
  // audience values (interest strings) aren't safe to interpolate into a filter.
  const askR = await supabase
    .from('user_asks')
    .select('*')
    .eq('status', 'open')
    .in('user_id', connectionIds)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (askR.data ?? []) as AskRow[]
  return rows.filter((a) => {
    const type = a.audience_type ?? 'everyone'
    if (type === 'everyone') return true
    if (type === 'interest') return !!a.audience_value && interests.includes(a.audience_value)
    if (type === 'persona') return !!a.audience_value && persona === a.audience_value
    return false
  })
}

async function attachAuthors<T extends { user_id: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.user_id))]
  if (ids.length === 0) return rows.map((r) => ({ ...r, author: null as null | object }))
  const usersR = await supabase.from('users').select('id, full_name, username, avatar_url').in('id', ids)
  const byId = new Map((usersR.data ?? []).map((u) => [u.id, u]))
  return rows.map((r) => ({ ...r, author: byId.get(r.user_id) ?? null }))
}

asksRouter.get('/feed', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const limit = Math.min(Number(req.query.limit) || 30, 60)

    const matched = await matchedOpenAsks(req.appUserId)

    const seenR = await supabase.from('users').select('asks_seen_at').eq('id', req.appUserId).maybeSingle()
    const seenAt = seenR.data?.asks_seen_at ? new Date(seenR.data.asks_seen_at).getTime() : 0
    const unseen = matched.filter((a) => new Date(a.created_at).getTime() > seenAt).length

    const hydrated = await hydrateAsks(matched.slice(0, limit), req.appUserId)
    const withAuthors = await attachAuthors(hydrated)
    return res.json({ asks: withAuthors, unseen })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

asksRouter.get('/unread-count', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const matched = await matchedOpenAsks(req.appUserId)
    const seenR = await supabase.from('users').select('asks_seen_at').eq('id', req.appUserId).maybeSingle()
    const seenAt = seenR.data?.asks_seen_at ? new Date(seenR.data.asks_seen_at).getTime() : 0
    const count = matched.filter((a) => new Date(a.created_at).getTime() > seenAt).length
    return res.json({ count })
  } catch {
    return res.json({ count: 0 })
  }
})

asksRouter.post('/seen', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    await supabase.from('users').update({ asks_seen_at: new Date().toISOString() }).eq('id', req.appUserId)
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Fetch a single ask (deep-linking from a notification) ────────────────────
asksRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const askR = await supabase.from('user_asks').select('*').eq('id', req.params.id).maybeSingle()
    if (askR.error || !askR.data) return res.status(404).json({ error: 'Ask not found' })

    const [hydrated] = await hydrateAsks([askR.data as AskRow], req.appUserId)
    const [withAuthor] = await attachAuthors([hydrated])
    return res.json({ ask: withAuthor })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Edit own ask ─────────────────────────────────────────────────────────────
asksRouter.patch('/:id', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = updateAskSchema.safeParse(req.body)
    if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

    const update = await supabase
      .from('user_asks')
      .update({ content: parsed.data.content.trim() })
      .eq('id', req.params.id)
      .eq('user_id', req.appUserId)
      .select('*')
      .maybeSingle()
    if (update.error || !update.data) return res.status(404).json({ error: 'Ask not found or not yours' })
    return res.json({ ask: update.data })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Mark resolved / Reopen ───────────────────────────────────────────────────
asksRouter.post('/:id/resolve', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const update = await supabase
      .from('user_asks')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.appUserId)
      .select('*')
      .maybeSingle()
    if (update.error || !update.data) return res.status(404).json({ error: 'Ask not found or not yours' })
    return res.json({ ask: update.data })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

asksRouter.post('/:id/reopen', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const update = await supabase
      .from('user_asks')
      .update({ status: 'open', resolved_at: null })
      .eq('id', req.params.id)
      .eq('user_id', req.appUserId)
      .select('*')
      .maybeSingle()
    if (update.error || !update.data) return res.status(404).json({ error: 'Ask not found or not yours' })
    return res.json({ ask: update.data })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Delete own ask ───────────────────────────────────────────────────────────
asksRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const del = await supabase
      .from('user_asks')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.appUserId)
    if (del.error) return res.status(500).json({ error: del.error.message })
    return res.status(204).end()
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Replies ──────────────────────────────────────────────────────────────────
asksRouter.get('/:id/replies', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const repliesR = await supabase
      .from('ask_replies')
      .select('id, ask_id, user_id, body, created_at')
      .eq('ask_id', req.params.id)
      .order('created_at', { ascending: true })
    if (repliesR.error) return res.status(500).json({ error: repliesR.error.message })

    const replies = (repliesR.data ?? []) as ReplyRow[]
    if (replies.length === 0) return res.json({ replies: [] })

    // Hydrate author info
    const authorIds = [...new Set(replies.map((r) => r.user_id))]
    const usersR = await supabase.from('users').select('id, full_name, username, avatar_url').in('id', authorIds)
    const byId = new Map((usersR.data ?? []).map((u) => [u.id, u]))

    return res.json({
      replies: replies.map((r) => ({ ...r, author: byId.get(r.user_id) ?? null })),
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

asksRouter.post('/:id/replies', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = replySchema.safeParse(req.body)
    if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

    // Confirm ask exists
    const askExists = await supabase.from('user_asks').select('id, user_id').eq('id', req.params.id).maybeSingle()
    if (askExists.error || !askExists.data) return res.status(404).json({ error: 'Ask not found' })

    const insert = await supabase
      .from('ask_replies')
      .insert({ ask_id: req.params.id, user_id: req.appUserId, body: parsed.data.body })
      .select('*')
      .maybeSingle()
    if (insert.error || !insert.data) return res.status(500).json({ error: insert.error?.message ?? 'Insert failed' })

    const me = await supabase.from('users').select('id, full_name, username, avatar_url').eq('id', req.appUserId).maybeSingle()

    if (askExists.data.user_id !== req.appUserId) {
      const replierName = await getUserFirstName(req.appUserId)
      void createNotification({
        userId: askExists.data.user_id,
        actorId: req.appUserId,
        type: 'ask_reply',
        title: `${replierName} replied to your ask`,
        body: parsed.data.body,
        entityType: 'ask',
        entityId: req.params.id,
      })
    }

    return res.json({ reply: { ...insert.data, author: me.data ?? null } })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

asksRouter.delete('/:id/replies/:replyId', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const del = await supabase
      .from('ask_replies')
      .delete()
      .eq('id', req.params.replyId)
      .eq('user_id', req.appUserId)
    if (del.error) return res.status(500).json({ error: del.error.message })
    return res.status(204).end()
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ── Reactions ────────────────────────────────────────────────────────────────
asksRouter.post('/:id/react', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = reactSchema.safeParse(req.body)
    if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

    // Toggle: if exists, delete; else insert
    const existing = await supabase
      .from('ask_reactions')
      .select('id')
      .eq('ask_id', req.params.id)
      .eq('user_id', req.appUserId)
      .eq('emoji', parsed.data.emoji)
      .maybeSingle()

    if (existing.data) {
      const del = await supabase.from('ask_reactions').delete().eq('id', existing.data.id)
      if (del.error) return res.status(500).json({ error: del.error.message })
      return res.json({ active: false })
    }

    const insert = await supabase.from('ask_reactions').insert({
      ask_id: req.params.id,
      user_id: req.appUserId,
      emoji: parsed.data.emoji,
    })
    if (insert.error) return res.status(500).json({ error: insert.error.message })
    return res.json({ active: true })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})
