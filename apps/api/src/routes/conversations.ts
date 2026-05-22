import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

type ConversationRow = {
  id: string
  created_at: string
}

type ParticipantRow = {
  conversation_id: string
  user_id: string
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  created_at: string
}

type UserPreview = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
}

const createConversationSchema = z.object({
  userId: z.string().uuid(),
})

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
})

const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const conversationsRouter = Router()

async function isParticipant(conversationId: string, userId: string) {
  const participant = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (participant.error) {
    throw new Error(participant.error.message)
  }

  return Boolean(participant.data)
}

async function ensureAcceptedConnection(userId: string, otherUserId: string) {
  const connection = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`
    )
    .limit(1)

  if (connection.error) {
    throw new Error(connection.error.message)
  }

  return (connection.data ?? []).length > 0
}

async function findDirectConversationId(userId: string, otherUserId: string) {
  const [mine, theirs] = await Promise.all([
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId),
    supabase.from('conversation_participants').select('conversation_id').eq('user_id', otherUserId),
  ])

  if (mine.error) throw new Error(mine.error.message)
  if (theirs.error) throw new Error(theirs.error.message)

  const myIds = new Set((mine.data ?? []).map((row) => row.conversation_id))
  const sharedIds = (theirs.data ?? []).map((row) => row.conversation_id).filter((id) => myIds.has(id))

  if (!sharedIds.length) return null

  const participants = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', sharedIds)

  if (participants.error) throw new Error(participants.error.message)

  const byConversation = new Map<string, Set<string>>()
  for (const row of (participants.data ?? []) as ParticipantRow[]) {
    const set = byConversation.get(row.conversation_id) ?? new Set<string>()
    set.add(row.user_id)
    byConversation.set(row.conversation_id, set)
  }

  for (const id of sharedIds) {
    const users = byConversation.get(id)
    if (!users) continue
    if (users.size === 2 && users.has(userId) && users.has(otherUserId)) {
      return id
    }
  }

  return null
}

async function listConversationIdsForUser(userId: string) {
  const participants = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)

  if (participants.error) throw new Error(participants.error.message)

  return [...new Set((participants.data ?? []).map((row) => row.conversation_id))]
}

conversationsRouter.get('/unread', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const conversationIds = await listConversationIdsForUser(req.appUserId)
    if (!conversationIds.length) return res.json({ count: 0 })

    const unread = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .neq('sender_id', req.appUserId)
      .is('read_at', null)

    if (unread.error) return res.status(500).json({ error: unread.error.message })

    return res.json({ count: unread.count ?? 0 })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed loading unread messages' })
  }
})

conversationsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const conversationIds = await listConversationIdsForUser(req.appUserId)
    if (!conversationIds.length) return res.json({ conversations: [] })

    const [conversations, participants, messages, unreadRows] = await Promise.all([
      supabase.from('conversations').select('id, created_at').in('id', conversationIds).order('created_at', { ascending: false }),
      supabase.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', conversationIds),
      supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, read_at, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages')
        .select('id, conversation_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', req.appUserId)
        .is('read_at', null),
    ])

    if (conversations.error) return res.status(500).json({ error: conversations.error.message })
    if (participants.error) return res.status(500).json({ error: participants.error.message })
    if (messages.error) return res.status(500).json({ error: messages.error.message })
    if (unreadRows.error) return res.status(500).json({ error: unreadRows.error.message })

    const participantRows = (participants.data ?? []) as ParticipantRow[]
    const messagesRows = (messages.data ?? []) as MessageRow[]

    const peerIds = [...new Set(participantRows.map((row) => row.user_id).filter((id) => id !== req.appUserId))]
    const peerUsers = peerIds.length
      ? await supabase.from('users').select('id, full_name, username, avatar_url').in('id', peerIds)
      : { data: [], error: null }

    if (peerUsers.error) return res.status(500).json({ error: peerUsers.error.message })

    const usersById = new Map((peerUsers.data ?? []).map((user) => [user.id, user as UserPreview]))

    const peerByConversationId = new Map<string, UserPreview | null>()
    for (const row of participantRows) {
      if (row.user_id === req.appUserId) continue
      if (!peerByConversationId.has(row.conversation_id)) {
        peerByConversationId.set(row.conversation_id, usersById.get(row.user_id) ?? null)
      }
    }

    const latestByConversationId = new Map<string, MessageRow>()
    for (const message of messagesRows) {
      if (!latestByConversationId.has(message.conversation_id)) {
        latestByConversationId.set(message.conversation_id, message)
      }
    }

    const unreadByConversationId = new Map<string, number>()
    for (const row of unreadRows.data ?? []) {
      const count = unreadByConversationId.get(row.conversation_id) ?? 0
      unreadByConversationId.set(row.conversation_id, count + 1)
    }

    const payload = ((conversations.data ?? []) as ConversationRow[]).map((conversation) => {
      const latest = latestByConversationId.get(conversation.id) ?? null
      return {
        id: conversation.id,
        created_at: conversation.created_at,
        peer: peerByConversationId.get(conversation.id) ?? null,
        unread_count: unreadByConversationId.get(conversation.id) ?? 0,
        latest_message: latest
          ? {
              id: latest.id,
              content: latest.content,
              created_at: latest.created_at,
              sender_id: latest.sender_id,
            }
          : null,
      }
    })

    payload.sort((a, b) => {
      const aTime = a.latest_message?.created_at ?? a.created_at
      const bTime = b.latest_message?.created_at ?? b.created_at
      return bTime.localeCompare(aTime)
    })

    return res.json({ conversations: payload })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed loading conversations' })
  }
})

conversationsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = createConversationSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const { userId } = parsed.data

  if (userId === req.appUserId) {
    return res.status(422).json({ error: 'Cannot create a conversation with yourself' })
  }

  try {
    const otherUser = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
    if (otherUser.error) return res.status(500).json({ error: otherUser.error.message })
    if (!otherUser.data) return res.status(404).json({ error: 'User not found' })

    const connected = await ensureAcceptedConnection(req.appUserId, userId)
    if (!connected) {
      return res.status(403).json({ error: 'You can only message accepted connections' })
    }

    const existingConversationId = await findDirectConversationId(req.appUserId, userId)
    if (existingConversationId) {
      return res.status(200).json({ conversation: { id: existingConversationId }, existing: true })
    }

    const created = await supabase.from('conversations').insert({}).select('id, created_at').single()
    if (created.error) return res.status(500).json({ error: created.error.message })

    const participants = await supabase.from('conversation_participants').insert([
      { conversation_id: created.data.id, user_id: req.appUserId },
      { conversation_id: created.data.id, user_id: userId },
    ])

    if (participants.error) {
      await supabase.from('conversations').delete().eq('id', created.data.id)
      return res.status(500).json({ error: participants.error.message })
    }

    return res.status(201).json({ conversation: created.data })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed creating conversation' })
  }
})

conversationsRouter.get('/:id/messages', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const params = conversationIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid conversation id', fields: params.error.flatten() })
  }
  const conversationId = params.data.id

  try {
    const allowed = await isParticipant(conversationId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to view this conversation' })

    const messages = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, read_at, delivered_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300)

    if (messages.error) return res.status(500).json({ error: messages.error.message })

    const rows = (messages.data ?? []) as MessageRow[]
    const senderIds = [...new Set(rows.map((row) => row.sender_id))]
    const senders = senderIds.length
      ? await supabase.from('users').select('id, full_name, username, avatar_url').in('id', senderIds)
      : { data: [], error: null }

    if (senders.error) return res.status(500).json({ error: senders.error.message })

    const sendersById = new Map((senders.data ?? []).map((user) => [user.id, user as UserPreview]))

    // Fetch reactions for all messages
    const msgIds = rows.map((r) => r.id)
    const reactionsMap: Record<string, { emoji: string; count: number; mine: boolean }[]> = {}
    if (msgIds.length > 0) {
      const reactions = await supabase
        .from('message_reactions')
        .select('message_id, emoji, user_id')
        .in('message_id', msgIds)
      const grouped: Record<string, Record<string, { count: number; mine: boolean }>> = {}
      for (const r of reactions.data ?? []) {
        if (!grouped[r.message_id]) grouped[r.message_id] = {}
        if (!grouped[r.message_id][r.emoji]) grouped[r.message_id][r.emoji] = { count: 0, mine: false }
        grouped[r.message_id][r.emoji].count++
        if (r.user_id === req.appUserId) grouped[r.message_id][r.emoji].mine = true
      }
      for (const [msgId, emojis] of Object.entries(grouped)) {
        reactionsMap[msgId] = Object.entries(emojis).map(([emoji, data]) => ({ emoji, ...data }))
      }
    }

    return res.json({
      messages: rows.map((row) => ({
        ...row,
        sender: sendersById.get(row.sender_id) ?? null,
        is_mine: row.sender_id === req.appUserId,
        reactions: reactionsMap[row.id] ?? [],
      })),
    })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed loading messages' })
  }
})

conversationsRouter.post('/:id/messages', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = sendMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const params = conversationIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid conversation id', fields: params.error.flatten() })
  }
  const conversationId = params.data.id

  try {
    const allowed = await isParticipant(conversationId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to send in this conversation' })

    const insert = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: req.appUserId,
        content: parsed.data.content,
      })
      .select('id, conversation_id, sender_id, content, read_at, created_at')
      .single()

    if (insert.error) return res.status(500).json({ error: insert.error.message })

    const sender = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url')
      .eq('id', req.appUserId)
      .maybeSingle()

    if (sender.error) return res.status(500).json({ error: sender.error.message })

    return res.status(201).json({
      message: {
        ...insert.data,
        sender: sender.data ?? null,
        is_mine: true,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed sending message' })
  }
})

conversationsRouter.post('/:id/read', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const params = conversationIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid conversation id', fields: params.error.flatten() })
  }
  const conversationId = params.data.id

  try {
    const allowed = await isParticipant(conversationId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this conversation' })

    const update = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', req.appUserId)
      .is('read_at', null)

    if (update.error) return res.status(500).json({ error: update.error.message })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed updating read state' })
  }
})

// ── Mark messages as delivered ────────────────────────────────────────────
conversationsRouter.post('/:id/delivered', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const params = conversationIdParamSchema.safeParse(req.params)
  if (!params.success) return res.status(422).json({ error: 'Invalid conversation id' })
  const conversationId = params.data.id
  try {
    const allowed = await isParticipant(conversationId, req.appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed' })
    await supabase
      .from('messages')
      .update({ delivered_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', req.appUserId)
      .is('delivered_at', null)
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' })
  }
})

// ── Toggle emoji reaction on a message ───────────────────────────────────
conversationsRouter.post('/:id/messages/:msgId/react', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const { emoji } = req.body as { emoji: string }
  const validEmojis = ['❤️', '👍', '😂', '🙌', '🔥']
  if (!validEmojis.includes(emoji)) return res.status(422).json({ error: 'Invalid emoji' })
  const msgId = req.params.msgId
  const existing = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', msgId)
    .eq('user_id', req.appUserId)
    .eq('emoji', emoji)
    .maybeSingle()
  if (existing.data) {
    await supabase.from('message_reactions').delete().eq('id', existing.data.id)
    return res.json({ reacted: false, emoji, message_id: msgId })
  } else {
    await supabase.from('message_reactions').insert({ message_id: msgId, user_id: req.appUserId, emoji })
    return res.json({ reacted: true, emoji, message_id: msgId })
  }
})
