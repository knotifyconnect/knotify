/**
 * /api/relationship-home
 *
 * Runs the Relationship Priority Engine (Layer 1 deterministic + Layer 2 cached).
 * Layer 2 (Claude) is NEVER called synchronously — results come from the cache;
 * a background refresh is fired after the response is sent.
 *
 * Data gathering lives in ../engine/relationshipHomeData.ts so it can be reused
 * (currently by the Companion chat context builder).
 *
 * Also exposes:
 *   POST /api/relationship-home/feedback  — log acted/dismissed/ignored
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getRelationshipHomeData } from '../engine/relationshipHomeData.js'
import { refreshLayer2InBackground, logFeedback } from '../engine/relationshipPriority.js'

export const relationshipHomeRouter = Router()

// ── GET / ────────────────────────────────────────────────────────────────────
relationshipHomeRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const data = await getRelationshipHomeData(userId)

    // Send response immediately
    res.json({
      ranked: data.ranked,
      stats: data.stats,
      upcomingMeetings: data.upcomingMeetings,
      milestones: data.milestones,
      openAsks: data.openAsks,
      pendingForMe: data.pendingForMe,
      sharedEvents: data.sharedEvents,
    })

    // Fire Layer 2 refresh in background (after response sent)
    setImmediate(() => {
      refreshLayer2InBackground({
        userId,
        userProfile: data.userProfile,
        connections: data.accepted,
        peerProfiles: data.peerProfiles,
        ranked: data.rankedAll,
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
  if (!['acted', 'dismissed', 'snoozed', 'ignored'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid outcome' })
  }

  await logFeedback({ userId, connectionId, priorityScore, dominantFactor, suggestedAction, signals, outcome })
  return res.json({ ok: true })
})
