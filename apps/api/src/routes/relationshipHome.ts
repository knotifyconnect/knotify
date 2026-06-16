/**
 * /api/relationship-home
 *
 * Runs the Relationship Priority Engine (Layer 1 deterministic + Layer 2 cached).
 * Layer 2 (Claude) is NEVER called synchronously — results come from the cache;
 * a background refresh is fired after the response is sent.
 *
 * Also exposes:
 *   POST /api/relationship-home/feedback  — log acted/dismissed/ignored
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import {
  rankConnections,
  refreshLayer2InBackground,
  logFeedback,
  type PeerProfile,
  type UserProfile,
  type RankedConnection,
} from '../engine/relationshipPriority.js'

export const relationshipHomeRouter = Router()

// ── GET / ────────────────────────────────────────────────────────────────────
relationshipHomeRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    // 1. Accepted connections — direct query, no timeout wrapper (mirrors /api/connections)
    const connResult = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, updated_at, created_at, status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    const allConns = (connResult.data ?? []) as Array<{
      id: string; requester_id: string; addressee_id: string
      updated_at: string; created_at: string; status: string
    }>
    const accepted = allConns.filter((c) => c.status === 'accepted')

    // 2. Pending requests waiting on current user
    const pendingRaw = allConns.filter(
      (c) => c.status === 'pending' && c.addressee_id === userId
    )

    const peerIds = accepted.map((c) =>
      c.requester_id === userId ? c.addressee_id : c.requester_id
    )

    if (!peerIds.length) {
      return res.json({ ranked: [], milestones: [], openAsks: [], pendingForMe: [] })
    }

    // 3. Current user profile
    const { data: meData } = await supabase
      .from('users')
      .select('id, full_name, headline, current_company, location_city, can_help_with')
      .eq('id', userId)
      .single()

    const userProfile: UserProfile = meData ?? {
      id: userId, full_name: '', headline: null,
      current_company: null, location_city: null, can_help_with: null,
    }

    // 4. Peer profiles
    const { data: peersData } = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, headline, current_company, location_city, open_to_roles, can_help_with')
      .in('id', peerIds)

    const peerProfiles = new Map<string, PeerProfile>(
      ((peersData ?? []) as PeerProfile[]).map((u) => [u.id, u])
    )

    // 5. Message history (for tieStrength + expectedInterval)
    const messageDatesByPeer = new Map<string, string[]>()
    const messagesSentByUser = new Map<string, number>()
    const messagesSentByPeer = new Map<string, number>()

    try {
      const { data: myParts } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)

      const myConvIds = ((myParts ?? []) as Array<{ conversation_id: string }>).map((p) => p.conversation_id)

      if (myConvIds.length) {
        const { data: peerParts } = await supabase
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .in('user_id', peerIds)
          .in('conversation_id', myConvIds)

        const pp = (peerParts ?? []) as Array<{ conversation_id: string; user_id: string }>
        const convToPeer = new Map<string, string>()
        for (const p of pp) convToPeer.set(p.conversation_id, p.user_id)

        const peerConvIds = [...new Set(pp.map((p) => p.conversation_id))]
        if (peerConvIds.length) {
          const { data: msgs } = await supabase
            .from('messages')
            .select('conversation_id, created_at, sender_id')
            .in('conversation_id', peerConvIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1000)

          for (const m of (msgs ?? []) as Array<{ conversation_id: string; created_at: string; sender_id: string }>) {
            const peerId = convToPeer.get(m.conversation_id)
            if (!peerId) continue
            const dates = messageDatesByPeer.get(peerId) ?? []
            dates.push(m.created_at)
            messageDatesByPeer.set(peerId, dates)

            if (m.sender_id === userId) {
              messagesSentByUser.set(peerId, (messagesSentByUser.get(peerId) ?? 0) + 1)
            } else {
              messagesSentByPeer.set(peerId, (messagesSentByPeer.get(peerId) ?? 0) + 1)
            }
          }
        }
      }
    } catch { /* fall back — engine works without message history */ }

    // 6. Milestones (recent updates from connections)
    const peerIdsWithMilestone = new Set<string>()
    let milestones: Array<{ id: string; content: string; created_at: string; user: PeerProfile | null }> = []
    try {
      const { data: updatesData } = await supabase
        .from('updates')
        .select('id, user_id, content, created_at')
        .in('user_id', peerIds)
        .order('created_at', { ascending: false })
        .limit(15)
      milestones = ((updatesData ?? []) as Array<{ id: string; user_id: string; content: string; created_at: string }>).map(
        (u) => {
          peerIdsWithMilestone.add(u.user_id)
          return { id: u.id, content: u.content, created_at: u.created_at, user: peerProfiles.get(u.user_id) ?? null }
        }
      )
    } catch { /* non-critical */ }

    // 7. Open asks
    const peerIdsWithOpenAsk = new Set<string>()
    let openAsks: Array<{ id: string; content: string; created_at: string; user: PeerProfile | null }> = []
    try {
      const { data: asksData } = await supabase
        .from('user_asks')
        .select('id, user_id, content, created_at')
        .in('user_id', peerIds)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(10)
      openAsks = ((asksData ?? []) as Array<{ id: string; user_id: string; content: string; created_at: string }>).map(
        (a) => {
          peerIdsWithOpenAsk.add(a.user_id)
          return { id: a.id, content: a.content, created_at: a.created_at, user: peerProfiles.get(a.user_id) ?? null }
        }
      )
    } catch { /* non-critical */ }

    // 8. Mutual connection counts (lightweight)
    const mutualConnectionCounts = new Map<string, number>()
    try {
      const { data: allConnsData } = await supabase
        .from('connections')
        .select('requester_id, addressee_id')
        .or(peerIds.map((id) => `requester_id.eq.${id},addressee_id.eq.${id}`).join(','))
        .eq('status', 'accepted')

      for (const peerId of peerIds) {
        const peerConns = ((allConnsData ?? []) as Array<{ requester_id: string; addressee_id: string }>).filter(
          (c) => c.requester_id === peerId || c.addressee_id === peerId
        )
        const peerConnIds = new Set(peerConns.map((c) => c.requester_id === peerId ? c.addressee_id : c.requester_id))
        const mutual = peerIds.filter((id) => id !== peerId && peerConnIds.has(id)).length
        mutualConnectionCounts.set(peerId, mutual)
      }
    } catch { /* non-critical */ }

    // 9. Load cached Layer 2 insights
    type L2Cached = { relationshipType: string; whyNow: string; suggestedAction: import('../engine/relationshipPriority.js').SuggestedAction; toneGuidance: string; draftOpener?: string }
    const cachedInsights = new Map<string, L2Cached>()
    try {
      const { data: insightsData } = await supabase
        .from('relationship_insights')
        .select('connection_id, relationship_type, why_now, suggested_action, tone_guidance, draft_opener')
        .eq('user_id', userId)
        .in('connection_id', accepted.map((c) => c.id))

      for (const ins of (insightsData ?? []) as Array<{
        connection_id: string; relationship_type: string; why_now: string;
        suggested_action: string; tone_guidance: string; draft_opener: string | null
      }>) {
        cachedInsights.set(ins.connection_id, {
          relationshipType: ins.relationship_type,
          whyNow:           ins.why_now,
          suggestedAction:  ins.suggested_action as import('../engine/relationshipPriority.js').SuggestedAction,
          toneGuidance:     ins.tone_guidance,
          draftOpener:      ins.draft_opener ?? undefined,
        })
      }
    } catch { /* non-critical */ }

    // 10. Pending user details
    const pendingRequesterIds = pendingRaw.map((c) => c.requester_id)
    let pendingForMe: Array<{ id: string; peer: PeerProfile; created_at: string }> = []
    if (pendingRequesterIds.length) {
      try {
        const { data: pendingUsers } = await supabase
          .from('users')
          .select('id, full_name, username, avatar_url, headline, current_company')
          .in('id', pendingRequesterIds)
        const pendingById = new Map(((pendingUsers ?? []) as PeerProfile[]).map((u) => [u.id, u]))
        pendingForMe = pendingRaw
          .filter((c) => pendingById.has(c.requester_id))
          .map((c) => ({ id: c.id, peer: pendingById.get(c.requester_id)!, created_at: c.created_at }))
      } catch { /* non-critical */ }
    }

    // 11. Run Layer 1 engine
    const ranked = rankConnections({
      userId,
      userProfile,
      connections:           accepted,
      peerProfiles,
      messageDatesByPeer,
      messagesSentByPeer,
      messagesSentByUser,
      peerIdsWithMilestone,
      peerIdsWithOpenAsk,
      mutualConnectionCounts,
      totalConnectionCount:  peerIds.length,
      cachedInsights,
    })

    // 12. Send response immediately
    res.json({ ranked, milestones, openAsks, pendingForMe })

    // 13. Fire Layer 2 refresh in background (after response sent)
    setImmediate(() => {
      refreshLayer2InBackground({
        userId,
        userProfile,
        connections: accepted,
        peerProfiles,
        ranked,
      }).catch((e) => console.error('[engine] Layer 2 background refresh failed', e))
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading relationship home' })
  }
})

// ── POST /feedback ───────────────────────────────────────────────────────────
relationshipHomeRouter.post('/feedback', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  const { connectionId, priorityScore, dominantFactor, suggestedAction, signals, outcome } = req.body
  if (!connectionId || !outcome) return res.status(400).json({ error: 'connectionId and outcome are required' })

  await logFeedback({ userId, connectionId, priorityScore, dominantFactor, suggestedAction, signals, outcome })
  return res.json({ ok: true })
})
