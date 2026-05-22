/**
 * /api/asks — professional asks on the knot map.
 *
 * Endpoints:
 *   GET  /api/asks/by-user/:userId        — list a user's asks (open first, then resolved)
 *   POST /api/asks                         — create a new ask (auth user)
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

export const asksRouter = Router()

const ALLOWED_EMOJIS = ['❤️', '👍', '🙌', '💡', '🔥', '🤝'] as const

const createAskSchema = z.object({
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

    const insert = await supabase
      .from('user_asks')
      .insert({ user_id: req.appUserId, content: parsed.data.content })
      .select('*')
      .maybeSingle()

    if (insert.error || !insert.data) return res.status(500).json({ error: insert.error?.message ?? 'Insert failed' })
    return res.json({ ask: { ...insert.data, reactions: {}, reply_count: 0 } })
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
    const askExists = await supabase.from('user_asks').select('id').eq('id', req.params.id).maybeSingle()
    if (askExists.error || !askExists.data) return res.status(404).json({ error: 'Ask not found' })

    const insert = await supabase
      .from('ask_replies')
      .insert({ ask_id: req.params.id, user_id: req.appUserId, body: parsed.data.body })
      .select('*')
      .maybeSingle()
    if (insert.error || !insert.data) return res.status(500).json({ error: insert.error?.message ?? 'Insert failed' })

    const me = await supabase.from('users').select('id, full_name, username, avatar_url').eq('id', req.appUserId).maybeSingle()
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
