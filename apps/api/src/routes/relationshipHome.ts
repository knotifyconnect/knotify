/**
 * /api/relationship-home — data for the Relationship Home dashboard.
 *
 * Returns three buckets:
 *   goingCold   — accepted connections with no recent conversation (>30 days)
 *   milestones  — recent network updates (status posts) from connections
 *   openAsks    — asks from connections that are still open
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const relationshipHomeRouter = Router()

const COLD_THRESHOLD_DAYS = 30

relationshipHomeRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    // ── 1. Get accepted connections ──────────────────────────────────────────
    const connectionsResult = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, updated_at')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

    if (connectionsResult.error) return res.status(500).json({ error: connectionsResult.error.message })

    const connections = connectionsResult.data ?? []
    const peerIds = connections.map((c) => (c.requester_id === userId ? c.addressee_id : c.requester_id))

    if (!peerIds.length) {
      return res.json({ goingCold: [], milestones: [], openAsks: [] })
    }

    // ── 2. Get last message date per peer conversation ───────────────────────
    const participantsResult = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)

    const myConversationIds = (participantsResult.data ?? []).map((p) => p.conversation_id)

    // For each peer, find their shared conversation and last message date
    const peerLastMessage: Map<string, string | null> = new Map(peerIds.map((id) => [id, null]))

    if (myConversationIds.length) {
      const peerParticipantsResult = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('user_id', peerIds)
        .in('conversation_id', myConversationIds)

      const peerConversationIds = [...new Set((peerParticipantsResult.data ?? []).map((p) => p.conversation_id))]

      if (peerConversationIds.length) {
        const lastMessagesResult = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .in('conversation_id', peerConversationIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })

        const lastMsgByConversation = new Map<string, string>()
        for (const msg of lastMessagesResult.data ?? []) {
          if (!lastMsgByConversation.has(msg.conversation_id)) {
            lastMsgByConversation.set(msg.conversation_id, msg.created_at)
          }
        }

        for (const pp of peerParticipantsResult.data ?? []) {
          const lastMsg = lastMsgByConversation.get(pp.conversation_id)
          if (lastMsg) {
            const existing = peerLastMessage.get(pp.user_id)
            if (!existing || lastMsg > existing) {
              peerLastMessage.set(pp.user_id, lastMsg)
            }
          }
        }
      }
    }

    // ── 3. Get peer user details ─────────────────────────────────────────────
    const peersResult = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, headline, current_company')
      .in('id', peerIds)

    if (peersResult.error) return res.status(500).json({ error: peersResult.error.message })
    const peersById = new Map((peersResult.data ?? []).map((u) => [u.id, u]))

    // ── 4. Build "going cold" list ───────────────────────────────────────────
    const cutoff = new Date(Date.now() - COLD_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const goingCold = connections
      .map((c) => {
        const peerId = c.requester_id === userId ? c.addressee_id : c.requester_id
        const lastMsg = peerLastMessage.get(peerId)
        const lastContact = lastMsg ?? c.updated_at
        const peer = peersById.get(peerId)
        if (!peer) return null
        return { peer, lastContact, daysSince: Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000) }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.lastContact < cutoff)
      .sort((a, b) => a.lastContact.localeCompare(b.lastContact))
      .slice(0, 10)

    // ── 5. Get milestones (recent updates from connections) ──────────────────
    const updatesResult = await supabase
      .from('updates')
      .select('id, user_id, content, created_at')
      .in('user_id', peerIds)
      .order('created_at', { ascending: false })
      .limit(15)

    const milestones = (updatesResult.data ?? []).map((u) => ({
      id: u.id,
      content: u.content,
      created_at: u.created_at,
      user: peersById.get(u.user_id) ?? null,
    }))

    // ── 6. Get open asks from connections ────────────────────────────────────
    const asksResult = await supabase
      .from('asks')
      .select('id, user_id, content, created_at')
      .in('user_id', peerIds)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10)

    const openAsks = (asksResult.data ?? []).map((a) => ({
      id: a.id,
      content: a.content,
      created_at: a.created_at,
      user: peersById.get(a.user_id) ?? null,
    }))

    return res.json({ goingCold, milestones, openAsks })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})
