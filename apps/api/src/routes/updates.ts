import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

type UpdateRow = {
  id: string
  user_id: string
  content: string
  created_at: string
}

const createUpdateSchema = z.object({
  content: z.string().trim().min(1).max(280),
})

const listUpdatesQuerySchema = z.object({
  scope: z.enum(['me', 'network']).default('network'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const updatesRouter = Router()

async function acceptedConnectionIdsForUser(userId: string) {
  const result = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  if (result.error) {
    throw new Error(result.error.message)
  }

  return [...new Set((result.data ?? []).map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id)))]
}

updatesRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = createUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const insert = await supabase
    .from('updates')
    .insert({
      user_id: req.appUserId,
      content: parsed.data.content,
    })
    .select('id, user_id, content, created_at')
    .single()

  if (insert.error) {
    return res.status(500).json({ error: insert.error.message })
  }

  const author = await supabase
    .from('users')
    .select('id, full_name, username, avatar_url')
    .eq('id', req.appUserId)
    .maybeSingle()

  if (author.error) {
    return res.status(500).json({ error: author.error.message })
  }

  return res.status(201).json({
    update: {
      ...insert.data,
      user: author.data ?? null,
    },
  })
})

updatesRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const query = listUpdatesQuerySchema.safeParse(req.query)
  if (!query.success) {
    return res.status(422).json({ error: 'Invalid query params', fields: query.error.flatten() })
  }
  const { scope, limit } = query.data

  try {
    const filterIds =
      scope === 'me' ? [req.appUserId] : [req.appUserId, ...(await acceptedConnectionIdsForUser(req.appUserId))]

    if (!filterIds.length) {
      return res.json({ updates: [] })
    }

    const updates = await supabase
      .from('updates')
      .select('id, user_id, content, created_at')
      .in('user_id', filterIds)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (updates.error) {
      return res.status(500).json({ error: updates.error.message })
    }

    const rows = (updates.data ?? []) as UpdateRow[]
    const userIds = [...new Set(rows.map((row) => row.user_id))]

    const users = userIds.length
      ? await supabase.from('users').select('id, full_name, username, avatar_url').in('id', userIds)
      : { data: [], error: null }

    if (users.error) {
      return res.status(500).json({ error: users.error.message })
    }

    const usersById = new Map((users.data ?? []).map((user) => [user.id, user]))

    return res.json({
      updates: rows.map((row) => ({
        ...row,
        user: usersById.get(row.user_id) ?? null,
      })),
    })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed loading updates' })
  }
})
