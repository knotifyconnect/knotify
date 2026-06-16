/**
 * /api/relationship-home — data for the Relationship Home dashboard.
 *
 * Returns:
 *   connections   — all accepted connections with health + days since contact
 *   milestones    — recent network updates from connections
 *   openAsks      — asks from connections that are still open
 *   pendingForMe  — connection requests waiting on the current user to decide
 *
 * Resilient: if the users lookup times out, connections are still returned
 * using the name embedded in the connection join. Each query has a hard
 * timeout so a slow table never hangs the response.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const relationshipHomeRouter = Router()

const COLD_THRESHOLD_DAYS = 30
const COOLING_THRESHOLD_DAYS = 60
const QUERY_TIMEOUT_MS = 5000

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
        .select('id, requester_id, addressee_id, updated_at, user:users!connections_addressee_id_fkey(id, full_name, username, avatar_url, headline, current_company), requester:users!connections_requester_id_fkey(id, full_name, username, avatar_url, headline, current_company)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    )

    const connections = (connData ?? []) as Array<{
      id: string
      requester_id: string
      addressee_id: string
      updated_at: string
      user: { id: string; full_name: string; username: string; avatar_url: string | null; headline: string | null; current_company: string | null } | null
      requester: { id: string; full_name: string; username: string; avatar_url: string | null; headline: string | null; current_company: string | null } | null
    }>

    const peerIds = connections.map((c) =>
      c.requester_id === userId ? c.addressee_id : c.requester_id
    )

    // ── 2. Pending requests waiting on me ────────────────────────────────────
    let pendingForMe: Array<{ id: string; peer: { id: string; full_name: string; username: string; avatar_url: string | null; headline: string | null; current_company: string | null }; created_at: string }> = []
    try {
      const { data: pendingData } = await qt(
        supabase
          .from('connections')
          .select('id, created_at, requester:users!connections_requester_id_fkey(id, full_name, username, avatar_url, headline, current_company)')
          .eq('status', 'pending')
          .eq('addressee_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)
      )
      pendingForMe = ((pendingData ?? []) as Array<{ id: string; created_at: string; requester: { id: string; full_name: string; username: string; avatar_url: string | null; headline: string | null; current_company: string | null } | null }>)
        .filter((p) => p.requester !== null)
        .map((p) => ({ id: p.id, peer: p.requester!, created_at: p.created_at }))
    } catch { /* non-critical */ }

    if (!peerIds.length) {
      return res.json({ connections: [], milestones: [], openAsks: [], pendingForMe })
    }

    // ── 3. Last message date per peer (best-effort) ──────────────────────────
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

    // ── 4. Build connections list with health ────────────────────────────────
    type PeerRow = {
      id: string
      full_name: string
      username: string
      avatar_url: string | null
      headline: string | null
      current_company: string | null
    }

    const allConnections = connections
      .map((c) => {
        const peerId = c.requester_id === userId ? c.addressee_id : c.requester_id
        // Peer data comes from the join — no separate users query needed
        const peerJoin = c.requester_id === userId ? c.user : c.requester
        if (!peerJoin) return null
        const peer: PeerRow = peerJoin
        const lastMsg = peerLastMessage.get(peerId)
        const lastContact = lastMsg || c.updated_at
        const daysSince = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000)
        const health: 'warm' | 'cooling' | 'cold' =
          daysSince >= COOLING_THRESHOLD_DAYS ? 'cold' :
          daysSince >= COLD_THRESHOLD_DAYS ? 'cooling' : 'warm'
        return { peer, lastContact, daysSince, health }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.lastContact.localeCompare(b.lastContact))
      .slice(0, 20)

    // ── 5. Milestones ────────────────────────────────────────────────────────
    let milestones: Array<{ id: string; content: string; created_at: string; user: PeerRow | null }> = []
    try {
      const peersById = new Map<string, PeerRow>(allConnections.map((c) => [c.peer.id, c.peer]))
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
      const peersById = new Map<string, PeerRow>(allConnections.map((c) => [c.peer.id, c.peer]))
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

    return res.json({ connections: allConnections, milestones, openAsks, pendingForMe })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})
