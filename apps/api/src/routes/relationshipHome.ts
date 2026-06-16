/**
 * /api/relationship-home — data for the Relationship Home dashboard.
 *
 * Returns three buckets:
 *   goingCold   — accepted connections with no recent conversation (>30 days)
 *   milestones  — recent network updates from connections
 *   openAsks    — asks from connections that are still open
 *
 * Each query has a hard timeout so a slow table never hangs the response.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const relationshipHomeRouter = Router()

const COLD_THRESHOLD_DAYS = 30
const QUERY_TIMEOUT_MS = 4000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qt(query: any): Promise<{ data: any[] | null; error: unknown }> {
  return Promise.race([
    query as Promise<{ data: any[] | null; error: unknown }>,
    new Promise<{ data: any[] | null; error: unknown }>((resolve) =>
      setTimeout(() => resolve({ data: [], error: null }), QUERY_TIMEOUT_MS)
    ),
  ])
}

relationshipHomeRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    // ── 1. Accepted connections ──────────────────────────────────────────────
    const { data: connData } = await qt(
      supabase
        .from('connections')
        .select('id, requester_id, addressee_id, updated_at')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    )

    const connections = (connData ?? []) as Array<{
      id: string
      requester_id: string
      addressee_id: string
      updated_at: string
    }>

    const peerIds = connections.map((c) =>
      c.requester_id === userId ? c.addressee_id : c.requester_id
    )

    if (!peerIds.length) {
      return res.json({ goingCold: [], milestones: [], openAsks: [] })
    }

    // ── 2. Last message date per peer (best-effort) ──────────────────────────
    const peerLastMessage = new Map<string, string>()

    try {
      const { data: myParticipants } = await qt(
        supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', userId)
      )

      const myConvIds = ((myParticipants ?? []) as Array<{ conversation_id: string }>).map(
        (p) => p.conversation_id
      )

      if (myConvIds.length) {
        const { data: peerParticipants } = await qt(
          supabase
            .from('conversation_participants')
            .select('conversation_id, user_id')
            .in('user_id', peerIds)
            .in('conversation_id', myConvIds)
        )

        const peerConvIds = [
          ...new Set(
            ((peerParticipants ?? []) as Array<{ conversation_id: string; user_id: string }>).map(
              (p) => p.conversation_id
            )
          ),
        ]

        if (peerConvIds.length) {
          const { data: messages } = await qt(
            supabase
              .from('messages')
              .select('conversation_id, created_at')
              .in('conversation_id', peerConvIds)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(500)
          )

          const lastMsgByConv = new Map<string, string>()
          for (const msg of (messages ?? []) as Array<{ conversation_id: string; created_at: string }>) {
            if (!lastMsgByConv.has(msg.conversation_id)) {
              lastMsgByConv.set(msg.conversation_id, msg.created_at)
            }
          }

          for (const pp of (peerParticipants ?? []) as Array<{ conversation_id: string; user_id: string }>) {
            const lastMsg = lastMsgByConv.get(pp.conversation_id)
            if (lastMsg) {
              const existing = peerLastMessage.get(pp.user_id)
              if (!existing || lastMsg > existing) peerLastMessage.set(pp.user_id, lastMsg)
            }
          }
        }
      }
    } catch {
      // message history unavailable — fall back to connection date
    }

    // ── 3. Peer user details ─────────────────────────────────────────────────
    const { data: peersData } = await qt(
      supabase
        .from('users')
        .select('id, full_name, username, avatar_url, headline, current_company')
        .in('id', peerIds)
    )

    type PeerRow = {
      id: string
      full_name: string
      username: string
      avatar_url: string | null
      headline: string | null
      current_company: string | null
    }

    const peersById = new Map<string, PeerRow>(
      ((peersData ?? []) as PeerRow[]).map((u) => [u.id, u])
    )

    // ── 4. Going cold ────────────────────────────────────────────────────────
    const cutoff = new Date(Date.now() - COLD_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const goingCold = connections
      .map((c) => {
        const peerId = c.requester_id === userId ? c.addressee_id : c.requester_id
        const lastMsg = peerLastMessage.get(peerId)
        const lastContact = lastMsg || c.updated_at
        const peer = peersById.get(peerId)
        if (!peer) return null
        return {
          peer,
          lastContact,
          daysSince: Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.lastContact < cutoff)
      .sort((a, b) => a.lastContact.localeCompare(b.lastContact))
      .slice(0, 10)

    // ── 5. Milestones ────────────────────────────────────────────────────────
    let milestones: Array<{ id: string; content: string; created_at: string; user: PeerRow | null }> = []
    try {
      const { data: updatesData } = await qt(
        supabase
          .from('updates')
          .select('id, user_id, content, created_at')
          .in('user_id', peerIds)
          .order('created_at', { ascending: false })
          .limit(15)
      )
      milestones = ((updatesData ?? []) as Array<{ id: string; user_id: string; content: string; created_at: string }>).map(
        (u) => ({ id: u.id, content: u.content, created_at: u.created_at, user: peersById.get(u.user_id) ?? null })
      )
    } catch { /* non-critical */ }

    // ── 6. Open asks ─────────────────────────────────────────────────────────
    let openAsks: Array<{ id: string; content: string; created_at: string; user: PeerRow | null }> = []
    try {
      const { data: asksData } = await qt(
        supabase
          .from('user_asks')
          .select('id, user_id, content, created_at')
          .in('user_id', peerIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(10)
      )
      openAsks = ((asksData ?? []) as Array<{ id: string; user_id: string; content: string; created_at: string }>).map(
        (a) => ({ id: a.id, content: a.content, created_at: a.created_at, user: peersById.get(a.user_id) ?? null })
      )
    } catch { /* non-critical */ }

    return res.json({ goingCold, milestones, openAsks })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})
