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
  archived_at?: string | null
  cleared_at?: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  delivered_at?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
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

const messageTargetParamSchema = z.object({
  id: z.string().uuid(),
  msgId: z.string().uuid(),
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

function directPairKey(userId: string, otherUserId: string) {
  return [userId, otherUserId].sort().join(':')
}

async function findDirectConversationByPairKey(pairKey: string) {
  const conversation = await supabase
    .from('conversations')
    .select('id')
    .eq('direct_pair_key', pairKey)
    .maybeSingle()

  if (conversation.error) {
    const message = conversation.error.message.toLowerCase()
    if (message.includes('direct_pair_key')) return null
    throw new Error(conversation.error.message)
  }

  return conversation.data?.id ?? null
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
    .is('archived_at', null)

  if (participants.error) throw new Error(participants.error.message)

  return [...new Set((participants.data ?? []).map((row) => row.conversation_id))]
}

async function restoreConversationForUser(conversationId: string, userId: string) {
  const update = await supabase
    .from('conversation_participants')
    .update({ archived_at: null })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)

  if (update.error) throw new Error(update.error.message)
}

async function restoreConversationForAllParticipants(conversationId: string) {
  const update = await supabase
    .from('conversation_participants')
    .update({ archived_at: null })
    .eq('conversation_id', conversationId)

  if (update.error) throw new Error(update.error.message)
}

async function hiddenMessageIdSet(userId: string, messageIds: string[]) {
  const uniqueIds = [...new Set(messageIds)].filter(Boolean)
  if (!uniqueIds.length) return new Set<string>()

  const hidden = await supabase
    .from('message_deletions')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', uniqueIds)

  if (hidden.error) throw new Error(hidden.error.message)

  return new Set((hidden.data ?? []).map((row) => row.message_id as string))
}

function visibleMessagesForUser<T extends { id: string }>(rows: T[], hiddenIds: Set<string>) {
  return rows.filter((row) => !hiddenIds.has(row.id))
}

function isVisibleAfterClearedAt(row: { created_at: string }, clearedAt: string | null | undefined) {
  if (!clearedAt) return true
  const rowTime = new Date(row.created_at).getTime()
  const clearedTime = new Date(clearedAt).getTime()
  if (Number.isNaN(rowTime) || Number.isNaN(clearedTime)) return true
  return rowTime > clearedTime
}

function visibleAfterClearedAt<T extends { created_at: string }>(rows: T[], clearedAt: string | null | undefined) {
  return rows.filter((row) => isVisibleAfterClearedAt(row, clearedAt))
}

function clearedAtByConversationForUser(participants: ParticipantRow[], userId: string) {
  const map = new Map<string, string | null>()
  for (const row of participants) {
    if (row.user_id === userId) map.set(row.conversation_id, row.cleared_at ?? null)
  }
  return map
}

async function loadParticipantState(conversationId: string, userId: string) {
  const participant = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, archived_at, cleared_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (participant.error) throw new Error(participant.error.message)
  return participant.data as ParticipantRow | null
}

function messagePreviewContent(message: MessageRow) {
  return message.deleted_at ? 'Message deleted' : message.content
}

async function loadMessageForDeletion(conversationId: string, msgId: string) {
  const message = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, deleted_at')
    .eq('id', msgId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (message.error) throw new Error(message.error.message)
  return message.data as { id: string; conversation_id: string; sender_id: string; deleted_at: string | null } | null
}

async function deleteMessageForMe(conversationId: string, msgId: string, appUserId: string) {
  const message = await loadMessageForDeletion(conversationId, msgId)
  if (!message) return { status: 404 as const, body: { error: 'Message not found' } }

  const deletion = await supabase
    .from('message_deletions')
    .upsert(
      { message_id: msgId, user_id: appUserId, deleted_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id' }
    )

  if (deletion.error) throw new Error(deletion.error.message)

  return { status: 200 as const, body: { deleted_for_me: true, message_id: msgId } }
}

async function deleteMessageForEveryone(conversationId: string, msgId: string, appUserId: string) {
  const message = await loadMessageForDeletion(conversationId, msgId)
  if (!message) return { status: 404 as const, body: { error: 'Message not found' } }
  if (message.sender_id !== appUserId) return { status: 403 as const, body: { error: 'You can only delete messages you sent' } }

  if (message.deleted_at) {
    return { status: 200 as const, body: { message, deleted: true, deleted_for_everyone: true } }
  }

  const update = await supabase
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: appUserId,
    })
    .eq('id', msgId)
    .eq('conversation_id', conversationId)
    .select('id, conversation_id, sender_id, content, read_at, delivered_at, created_at, deleted_at, deleted_by')
    .single()

  if (update.error) throw new Error(update.error.message)

  return { status: 200 as const, body: { message: update.data, deleted: true, deleted_for_everyone: true } }
}

conversationsRouter.get('/unread', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const conversationIds = await listConversationIdsForUser(req.appUserId)
    if (!conversationIds.length) return res.json({ count: 0 })

    const unread = await supabase
      .from('messages')
      .select('id, conversation_id, created_at')
      .in('conversation_id', conversationIds)
      .neq('sender_id', req.appUserId)
      .is('deleted_at', null)
      .is('read_at', null)

    if (unread.error) return res.status(500).json({ error: unread.error.message })

    const unreadRows = (unread.data ?? []) as { id: string; conversation_id: string; created_at: string }[]
    const hiddenIds = await hiddenMessageIdSet(req.appUserId, unreadRows.map((row) => row.id))
    const participantStates = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, cleared_at')
      .eq('user_id', req.appUserId)
      .in('conversation_id', conversationIds)

    if (participantStates.error) return res.status(500).json({ error: participantStates.error.message })

    const clearedAtByConversationId = clearedAtByConversationForUser((participantStates.data ?? []) as ParticipantRow[], req.appUserId)
    const visibleUnreadRows = unreadRows
      .filter((row) => !hiddenIds.has(row.id))
      .filter((row) => isVisibleAfterClearedAt(row, clearedAtByConversationId.get(row.conversation_id)))

    return res.json({ count: visibleUnreadRows.length })
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
      supabase.from('conversation_participants').select('conversation_id, user_id, archived_at, cleared_at').in('conversation_id', conversationIds),
      supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, read_at, delivered_at, created_at, deleted_at, deleted_by')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages')
        .select('id, conversation_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', req.appUserId)
        .is('deleted_at', null)
        .is('read_at', null),
    ])

    if (conversations.error) return res.status(500).json({ error: conversations.error.message })
    if (participants.error) return res.status(500).json({ error: participants.error.message })
    if (messages.error) return res.status(500).json({ error: messages.error.message })
    if (unreadRows.error) return res.status(500).json({ error: unreadRows.error.message })

    const participantRows = (participants.data ?? []) as ParticipantRow[]
    const rawMessageRows = (messages.data ?? []) as MessageRow[]
    const rawUnreadRows = (unreadRows.data ?? []) as { id: string; conversation_id: string; created_at: string }[]
    const hiddenIds = await hiddenMessageIdSet(req.appUserId, [
      ...rawMessageRows.map((row) => row.id),
      ...rawUnreadRows.map((row) => row.id),
    ])
    const clearedAtByConversationId = clearedAtByConversationForUser(participantRows, req.appUserId)
    const messagesRows = visibleMessagesForUser(rawMessageRows, hiddenIds)
      .filter((row) => isVisibleAfterClearedAt(row, clearedAtByConversationId.get(row.conversation_id)))
    const visibleUnreadRows = visibleMessagesForUser(rawUnreadRows, hiddenIds)
      .filter((row) => isVisibleAfterClearedAt(row, clearedAtByConversationId.get(row.conversation_id)))

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
    for (const row of visibleUnreadRows) {
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
              content: messagePreviewContent(latest),
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

    const pairKey = directPairKey(req.appUserId, userId)

    const existingByPairKey = await findDirectConversationByPairKey(pairKey)
    if (existingByPairKey) {
      await restoreConversationForUser(existingByPairKey, req.appUserId)
      return res.status(200).json({ conversation: { id: existingByPairKey }, existing: true })
    }

    const existingConversationId = await findDirectConversationId(req.appUserId, userId)
    if (existingConversationId) {
      const keyed = await supabase
        .from('conversations')
        .update({ direct_pair_key: pairKey })
        .eq('id', existingConversationId)
        .select('id')
        .maybeSingle()

      if (keyed.error) {
        const duplicate = await findDirectConversationByPairKey(pairKey)
        if (duplicate) return res.status(200).json({ conversation: { id: duplicate }, existing: true })
      }

      await restoreConversationForUser(existingConversationId, req.appUserId)
      return res.status(200).json({ conversation: { id: existingConversationId }, existing: true })
    }

    const created = await supabase
      .from('conversations')
      .insert({ direct_pair_key: pairKey })
      .select('id, created_at, direct_pair_key')
      .single()

    if (created.error) {
      const duplicate = await findDirectConversationByPairKey(pairKey)
      if (duplicate) return res.status(200).json({ conversation: { id: duplicate }, existing: true })
      return res.status(500).json({ error: created.error.message })
    }

    const participants = await supabase.from('conversation_participants').insert([
      { conversation_id: created.data.id, user_id: req.appUserId },
      { conversation_id: created.data.id, user_id: userId },
    ])

    if (participants.error) {
      await supabase.from('conversations').delete().eq('id', created.data.id)
      const duplicate = await findDirectConversationByPairKey(pairKey)
      if (duplicate) return res.status(200).json({ conversation: { id: duplicate }, existing: true })
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
  const appUserId = req.appUserId

  if (!appUserId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const participantState = await loadParticipantState(conversationId, appUserId)
    if (!participantState) return res.status(403).json({ error: 'Not allowed to view this conversation' })

    const messages = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, read_at, delivered_at, created_at, deleted_at, deleted_by')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300)

    if (messages.error) return res.status(500).json({ error: messages.error.message })

    const rawRows = (messages.data ?? []) as MessageRow[]
    const hiddenIds = await hiddenMessageIdSet(req.appUserId, rawRows.map((row) => row.id))
    const rows = visibleAfterClearedAt(visibleMessagesForUser(rawRows, hiddenIds), participantState.cleared_at)
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
        reactions: (row as MessageRow & { deleted_at?: string | null }).deleted_at ? [] : reactionsMap[row.id] ?? [],
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
      .select('id, conversation_id, sender_id, content, read_at, delivered_at, created_at, deleted_at, deleted_by')
      .single()

    if (insert.error) return res.status(500).json({ error: insert.error.message })

    try {
      await restoreConversationForAllParticipants(conversationId)
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed restoring conversation' })
    }

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

conversationsRouter.delete('/:id/messages/:msgId/for-me', requireAuth, async (req, res) => {
  const params = messageTargetParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid message delete target', fields: params.error.flatten() })
  }

  const conversationId = params.data.id
  const msgId = params.data.msgId
  const appUserId = req.appUserId

  if (!appUserId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const allowed = await isParticipant(conversationId, appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this conversation' })

    const result = await deleteMessageForMe(conversationId, msgId, appUserId)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed deleting message for me' })
  }
})

conversationsRouter.delete('/:id/messages/:msgId/for-everyone', requireAuth, async (req, res) => {
  const params = messageTargetParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid message delete target', fields: params.error.flatten() })
  }

  const conversationId = params.data.id
  const msgId = params.data.msgId
  const appUserId = req.appUserId

  if (!appUserId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const allowed = await isParticipant(conversationId, appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this conversation' })

    const result = await deleteMessageForEveryone(conversationId, msgId, appUserId)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed deleting message for everyone' })
  }
})

// Backwards-compatible route: old delete endpoint means “delete for everyone”.
conversationsRouter.delete('/:id/messages/:msgId', requireAuth, async (req, res) => {
  const params = messageTargetParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid message delete target', fields: params.error.flatten() })
  }

  const conversationId = params.data.id
  const msgId = params.data.msgId
  const appUserId = req.appUserId

  if (!appUserId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const allowed = await isParticipant(conversationId, appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this conversation' })

    const result = await deleteMessageForEveryone(conversationId, msgId, appUserId)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed deleting message' })
  }
})

conversationsRouter.delete('/:id', requireAuth, async (req, res) => {
  const params = conversationIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid conversation id', fields: params.error.flatten() })
  }

  const conversationId = params.data.id
  const appUserId = req.appUserId

  if (!appUserId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const allowed = await isParticipant(conversationId, appUserId)
    if (!allowed) return res.status(403).json({ error: 'Not allowed to delete this conversation' })

    const deletedAt = new Date().toISOString()
    const update = await supabase
      .from('conversation_participants')
      .update({ archived_at: deletedAt, cleared_at: deletedAt })
      .eq('conversation_id', conversationId)
      .eq('user_id', appUserId)

    if (update.error) return res.status(500).json({ error: update.error.message })

    return res.json({ archived: true })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed deleting conversation' })
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
      .is('deleted_at', null)
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
