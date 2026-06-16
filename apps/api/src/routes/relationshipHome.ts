/**
 * /api/relationship-home — data for the Relationship Home dashboard.
 *
 * Returns three buckets:
 *   goingCold   — accepted connections with no recent conversation (>30 days)
 *   milestones  — recent network updates (status posts) from connections
 *   openAsks    — asks from connections that are still open
 *
 * Each query is wrapped independently so one slow table never kills the response.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const relationshipHomeRouter = Router()

const COLD_THRESHOLD_DAYS = 30

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

relationshipHomeRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    // ── 1. Get accepted connections ──────────────────────────────────────────
    const connectionsResult = await withTimeout(
      supabase
        .from('connections')
        .select('id, requester_id, addressee_id, updated_at')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      5000,
      { data: [], error: null }
    )

    const connections = connectionsResult.data ?? []
    const peerIds = connections.map((c) => (c.requester_id === userId ? c.addressee_id : c.requester_id))

    if (!peerIds.length) {
      return res.json({ goingCold: [], milestones: [], openAsks: [] })
    }

    // ── 2. Find last-message date per peer (best-effort) ─────────────────────
    const peerLastMessage = new Map<string, string>(peerIds.map((id) => [id, '']))

    try {
      const participantsResult = await withTimeout(
        supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', userId),
        4000,
        { data: [], error: null }
      )

      const myConversationIds = (participantsResult.data ?? []).map((p) => p.conversation_id)

      if (myConversationIds.length) {
        const peerParticipantsResult = await withTimeout(
          supabase
            .from('conversation_participants')
            .select('conversation_id, user_id')
            .in('user_id', peerIds)
            .in('conversation_id', myConversationIds),
          4000,
          { data: [], error: null }
        )

        const peerConversationIds = [...new Set((peerParticipantsResult.data ?? []).map((p) => p.conversation_id))]

        if (peerConversationIds.length) {
          const lastMessagesResult = await withTimeout(
            supabase
              .from('messages')
              .select('conversation_id, created_at')
              .in('conversation_id', peerConversationIds)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(500),
            4000,
            { data: [], error: null }
          )

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
    } catch {
      // message history unavailable — fall back to connection date
    }

    // ── 3. Get peer user details ─────────────────────────────────────────────
    const peersResult = await withTimeout(
      supabase
        .from('users')
        .select('id, full_name, username, avatar_url, headline, current_company')
        .in('id', peerIds),
      4000,
      { data: [], error: null }
    )

    const peersById = new Map((peersResult.data ?? []).map((u) => [u.id, u]))

    // ── 4. Build "going cold" list ───────────────────────────────────────────
    const cutoff = new Date(Date.now() - COLD_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const goingCold = connections
      .map((c) => {
        const peerId = c.requester_id === userId ? c.addressee_id : c.requester_id
        const lastMsg = peerLastMessage.get(peerId)
        const lastContact = lastMsg || c.updated_at
        const peer = peersById.get(peerId)
        if (!peer) return null
        return { peer, lastContact, daysSince: Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000) }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.lastContact < cutoff)
      .sort((a, b) => a.lastContact.localeCompare(b.lastContact))
      .slice(0, 10)

    // ── 5. Get milestones ────────────────────────────────────────────────────
    let milestones: Array<{ id: string; content: string; created_at: string; user: unknown }> = []
    try {
      const updatesResult = await withTimeout(
        supabase
          .from('updates')
          .select('id, user_id, content, created_at')
          .in('user_id', peerIds)
          .order('created_at', { ascending: false })
          .limit(15),
        4000,
        { data: [], error: null }
      )
      milestones = (updatesResult.data ?? []).map((u) => ({
        id: u.id,
        content: u.content,
        created_at: u.created_at,
        user: peersById.get(u.user_id) ?? null,
      }))
    } catch { /* milestones non-critical */ }

    // ── 6. Get open asks ────────────────────────────────────────────────────
    let openAsks: Array<{ id: string; content: string; created_at: string; user: unknown }> = []
    try {
      const asksResult = await withTimeout(
        supabase
          .from('user_asks')
          .select('id, user_id, content, created_at')
          .in('user_id', peerIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(10),
        4000,
        { data: [], error: null }
      )
      openAsks = (asksResult.data ?? []).map((a) => ({
        id: a.id,
        content: a.content,
        created_at: a.created_at,
        user: peersById.get(a.user_id) ?? null,
      }))
    } catch { /* asks non-critical */ }

    return res.json({ goingCold, milestones, openAsks })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})
