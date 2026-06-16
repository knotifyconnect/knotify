/**
 * /api/relationship-home — data for the Relationship Home dashboard.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const relationshipHomeRouter = Router()

const COLD_THRESHOLD_DAYS = 30
const COOLING_THRESHOLD_DAYS = 60
const QUERY_TIMEOUT_MS = 6000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qt(query: any): Promise<{ data: any[] | null; error: unknown }> {
  return Promise.race([
    query as Promise<{ data: any[] | null; error: unknown }>,
    new Promise<{ data: any[] | null; error: unknown }>((resolve) =>
      setTimeout(() => resolve({ data: [], error: null }), QUERY_TIMEOUT_MS)
    ),
  ])
}

type PeerRow = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline: string | null
  current_company: string | null
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

    // ── 2. Pending requests waiting on me ────────────────────────────────────
    let pendingForMe: Array<{ id: string; peer: PeerRow; created_at: string }> = []
    try {
      const { data: pendingData } = await qt(
        supabase
          .from('connections')
          .select('id, created_at, requester_id')
          .eq('status', 'pending')
          .eq('addressee_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)
      )
      const pendingRequesterIds = ((pendingData ?? []) as Array<{ id: string; created_at: string; requester_id: string }>).map(p => p.requester_id)
      if (pendingRequesterIds.length) {
        const { data: pendingUsers } = await qt(
          supabase.from('users').select('id, full_name, username, avatar_url, headline, current_company').in('id', pendingRequesterIds)
        )
        const pendingUsersById = new Map<string, PeerRow>(((pendingUsers ?? []) as PeerRow[]).map(u => [u.id, u]))
        pendingForMe = ((pendingData ?? []) as Array<{ id: string; created_at: string; requester_id: string }>)
          .filter(p => pendingUsersById.has(p.requester_id))
          .map(p => ({ id: p.id, peer: pendingUsersById.get(p.requester_id)!, created_at: p.created_at }))
      }
    } catch { /* non-critical */ }

    if (!peerIds.length) {
      return res.json({ connections: [], milestones: [], openAsks: [], pendingForMe })
    }

    // ── 3. Last message date per peer (best-effort) ──────────────────────────
    const peerLastMessage = new Map<string, string>()
    try {
      const { data: myParticipants } = await qt(
        supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId)
      )
      const myConvIds = ((myParticipants ?? []) as Array<{ conversation_id: string }>).map(p => p.conversation_id)

      if (myConvIds.length) {
        const { data: peerParticipants } = await qt(
          supabase
            .from('conversation_participants')
            .select('conversation_id, user_id')
            .in('user_id', peerIds)
            .in('conversation_id', myConvIds)
        )
        const pp = (peerParticipants ?? []) as Array<{ conversation_id: string; user_id: string }>
        const peerConvIds = [...new Set(pp.map(p => p.conversation_id))]

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
            if (!lastMsgByConv.has(msg.conversation_id)) lastMsgByConv.set(msg.conversation_id, msg.created_at)
          }
          for (const p of pp) {
            const lastMsg = lastMsgByConv.get(p.conversation_id)
            if (lastMsg) {
              const existing = peerLastMessage.get(p.user_id)
              if (!existing || lastMsg > existing) peerLastMessage.set(p.user_id, lastMsg)
            }
          }
        }
      }
    } catch { /* fall back to connection date */ }

    // ── 4. Peer user details ─────────────────────────────────────────────────
    const { data: peersData } = await qt(
      supabase
        .from('users')
        .select('id, full_name, username, avatar_url, headline, current_company')
        .in('id', peerIds)
    )
    const peersById = new Map<string, PeerRow>(((peersData ?? []) as PeerRow[]).map(u => [u.id, u]))

    // ── 5. Build connections list — include even if user lookup missed them ──
    const allConnections = connections
      .map((c) => {
        const peerId = c.requester_id === userId ? c.addressee_id : c.requester_id
        const peer = peersById.get(peerId)
        // If user record missing, create a minimal placeholder so connection still shows
        const safePeer: PeerRow = peer ?? {
          id: peerId,
          full_name: 'Unknown',
          username: peerId,
          avatar_url: null,
          headline: null,
          current_company: null,
        }
        const lastMsg = peerLastMessage.get(peerId)
        const lastContact = lastMsg || c.updated_at
        const daysSince = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000)
        const health: 'warm' | 'cooling' | 'cold' =
          daysSince >= COOLING_THRESHOLD_DAYS ? 'cold' :
          daysSince >= COLD_THRESHOLD_DAYS ? 'cooling' : 'warm'
        return { peer: safePeer, lastContact, daysSince, health }
      })
      .sort((a, b) => a.lastContact.localeCompare(b.lastContact))
      .slice(0, 20)

    // ── 6. Milestones ────────────────────────────────────────────────────────
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
        u => ({ id: u.id, content: u.content, created_at: u.created_at, user: peersById.get(u.user_id) ?? null })
      )
    } catch { /* non-critical */ }

    // ── 7. Open asks ─────────────────────────────────────────────────────────
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
        a => ({ id: a.id, content: a.content, created_at: a.created_at, user: peersById.get(a.user_id) ?? null })
      )
    } catch { /* non-critical */ }

    return res.json({ connections: allConnections, milestones, openAsks, pendingForMe })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})
