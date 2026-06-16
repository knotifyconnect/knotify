/**
 * Relationship Priority Engine
 *
 * Multi-signal, per-relationship priority ranking for the Home dashboard.
 * NOT a flat "days > N = cold" model. State is derived from overdueRatio
 * against each relationship's own expected cadence.
 *
 * Architecture:
 *   Layer 1 — deterministic signals, runs synchronously on every request
 *   Layer 2 — Claude reasoning, batched + cached in relationship_insights,
 *              never runs synchronously in the Home request path
 *
 * Feedback logging: every surfaced result is written to relationship_feedback.
 * v1 is write-only; v2 will use it to tune per-user weights.
 */

import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import { supabase } from '../lib.js'

// ── Tunable constants ────────────────────────────────────────────────────────

/** Composite score weights. Must sum to 1 when all three terms are active. */
const WEIGHTS = {
  wMaintenance: 0.50,
  wOpportunity: 0.30,
  wNew:         0.20,
}

/** Cap for overdueRatio before normalisation. Prevents extreme values dominating. */
const OVERDUE_CAP = 4

/** New-connection boost decays from 1 → 0 over this many days. */
const NEW_CONNECTION_WINDOW_DAYS = 7

/** Layer 1 score floor before Layer 2 (Claude) is triggered. */
const LAYER2_SCORE_FLOOR = 0.35

/** Layer 2 cache TTL in ms. Recompute if signals_hash changes OR cache is older. */
const LAYER2_TTL_MS = 24 * 60 * 60 * 1000

/** Expected interval (days) per relationship type — personalised cadence baselines. */
const EXPECTED_INTERVAL_BY_TYPE: Record<string, number> = {
  collaborator:      10,
  peer:              30,
  mentor:           120,
  'recruiter-contact': 60,
  acquaintance:      90,
  'dormant-lead':   180,
}
const DEFAULT_EXPECTED_INTERVAL = 45

/** Tie-strength signal weights. */
const TIE_WEIGHTS = {
  interactionFreq:   0.35,
  reciprocity:       0.25,
  mutualConnections: 0.15,
  asksExchanged:     0.15,
  metInPerson:       0.10,
}

// ── Public types ─────────────────────────────────────────────────────────────

export type RelationshipState = 'warm' | 'cooling' | 'cold' | 'new'

export type SuggestedAction =
  | 'reconnect'
  | 'message'
  | 'congratulate'
  | 'welcome'
  | 'meet'
  | 'ask'

export type DominantFactor = 'maintenance' | 'opportunity' | 'milestone' | 'new'

export interface Layer1Signals {
  tieStrength:        number   // 0..1
  expectedInterval:   number   // days
  overdueRatio:       number   // daysSince / expectedInterval
  daysSince:          number
  relevance:          number   // 0..1
  timeliness:         number   // 0..1
  connectionAgeDays:  number
  newBoost:           number   // 0..1, decays over NEW_CONNECTION_WINDOW_DAYS
  hasMilestone:       boolean
  hasOpenAsk:         boolean
}

export interface RankedConnection {
  connectionId:    string
  peerId:          string
  peer:            PeerProfile
  priorityScore:   number         // 0..100
  dominantFactor:  DominantFactor
  state:           RelationshipState
  reason:          string
  suggestedAction: SuggestedAction
  draftOpener?:    string
  signals:         Layer1Signals
}

export interface PeerProfile {
  id:              string
  full_name:       string
  username:        string
  avatar_url:      string | null
  headline:        string | null
  current_company: string | null
  location_city?:  string | null
  open_to_roles?:  boolean
  can_help_with?:  string | null
}

export interface UserProfile {
  id:              string
  full_name:       string
  headline:        string | null
  current_company: string | null
  location_city?:  string | null
  can_help_with?:  string | null
}

interface ConnectionRow {
  id:            string
  requester_id:  string
  addressee_id:  string
  updated_at:    string
  created_at:    string
  status:        string
}

// ── Layer 1: deterministic signals ──────────────────────────────────────────

function computeTieStrength(opts: {
  messageCount90d:    number
  sentByUser:         number
  sentByPeer:         number
  mutualConnections:  number
  totalConnections:   number
  asksExchanged:      number
  metInPerson:        boolean
}): number {
  const maxMsgs = 60 // normalise against a reasonable ceiling
  const freqScore = Math.min(opts.messageCount90d / maxMsgs, 1)

  const total = opts.sentByUser + opts.sentByPeer
  const reciprocity = total > 0
    ? 1 - Math.abs(opts.sentByUser - opts.sentByPeer) / total
    : 0

  const mutualScore = opts.totalConnections > 0
    ? Math.min(opts.mutualConnections / opts.totalConnections, 1)
    : 0

  const asksScore = Math.min(opts.asksExchanged / 3, 1)
  const metScore  = opts.metInPerson ? 1 : 0

  return (
    TIE_WEIGHTS.interactionFreq   * freqScore
    + TIE_WEIGHTS.reciprocity       * reciprocity
    + TIE_WEIGHTS.mutualConnections * mutualScore
    + TIE_WEIGHTS.asksExchanged     * asksScore
    + TIE_WEIGHTS.metInPerson       * metScore
  )
}

function computeExpectedInterval(opts: {
  messageDates:      string[]   // ISO timestamps of historical interactions
  relationshipType:  string | null
  tieStrength:       number
}): number {
  // Primary: median gap between interactions with this person
  if (opts.messageDates.length >= 3) {
    const sorted = [...opts.messageDates].sort()
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(
        (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000
      )
    }
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    if (median > 0 && median < 365) return Math.round(median)
  }

  // Cold-start fallback: use type + tieStrength
  const typeBase =
    opts.relationshipType ? EXPECTED_INTERVAL_BY_TYPE[opts.relationshipType] ?? DEFAULT_EXPECTED_INTERVAL
    : DEFAULT_EXPECTED_INTERVAL

  // Stronger tie → shorter expected interval (scale ×0.5 to ×1.5)
  const strengthMultiplier = 1 - opts.tieStrength * 0.5
  return Math.round(typeBase * strengthMultiplier)
}

function computeRelevance(user: UserProfile, peer: PeerProfile): number {
  let score = 0

  // Same city
  if (
    user.location_city && peer.location_city &&
    user.location_city.toLowerCase() === peer.location_city.toLowerCase()
  ) score += 0.25

  // Same company
  if (
    user.current_company && peer.current_company &&
    user.current_company.toLowerCase() === peer.current_company.toLowerCase()
  ) score += 0.20

  // Peer can help with something
  if (peer.can_help_with) score += 0.20

  // Peer is open to roles (useful if user is looking)
  if (peer.open_to_roles) score += 0.10

  // Partial headline overlap (simple keyword check)
  if (user.headline && peer.headline) {
    const userWords = new Set(user.headline.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
    const peerWords = peer.headline.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    const overlap = peerWords.filter((w) => userWords.has(w)).length
    score += Math.min(overlap / 4, 0.25)
  }

  return Math.min(score, 1)
}

function computeTimeliness(peer: PeerProfile, opts: {
  hasMilestone:   boolean
  hasOpenAsk:     boolean
}): number {
  let score = 0
  if (peer.open_to_roles)    score += 0.30  // they're available now
  if (opts.hasMilestone)     score += 0.40  // recent milestone (congratulate window)
  if (opts.hasOpenAsk)       score += 0.30  // they have an open ask we might answer
  return Math.min(score, 1)
}

function deriveState(overdueRatio: number, connectionAgeDays: number): RelationshipState {
  if (connectionAgeDays <= NEW_CONNECTION_WINDOW_DAYS) return 'new'
  if (overdueRatio < 0.8)  return 'warm'
  if (overdueRatio < 1.5)  return 'cooling'
  return 'cold'
}

function deterministicReason(state: RelationshipState, signals: Layer1Signals, peer: PeerProfile): string {
  const firstName = peer.full_name.split(' ')[0]
  const d = signals.daysSince
  const ei = Math.round(signals.expectedInterval)

  if (state === 'new') {
    return `You connected with ${firstName} recently. Send a note while the connection is fresh.`
  }
  if (signals.hasMilestone) {
    return `${firstName} shared a recent update — a great moment to reach out and congratulate them.`
  }
  if (signals.hasOpenAsk) {
    return `${firstName} has an open ask you might be able to help with.`
  }
  if (state === 'cold') {
    return `You haven't spoken with ${firstName} in ${d} days (your usual cadence is ~${ei}d). This connection is at risk.`
  }
  if (state === 'cooling') {
    return `It's been ${d} days since you last spoke with ${firstName}. Based on your history, now is a good time to check in.`
  }
  return `${firstName} is warm. Stay in touch — your last contact was ${d} day${d === 1 ? '' : 's'} ago.`
}

function determineSuggestedAction(
  state: RelationshipState,
  signals: Layer1Signals,
  dominantFactor: DominantFactor
): SuggestedAction {
  if (state === 'new')              return 'welcome'
  if (signals.hasMilestone)        return 'congratulate'
  if (dominantFactor === 'opportunity' && signals.relevance > 0.5) return 'meet'
  if (state === 'cold')            return 'reconnect'
  if (state === 'cooling')         return 'message'
  return 'message'
}

// ── Layer 2: Claude reasoning (cached, never synchronous) ───────────────────

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

type Layer2Result = {
  relationshipType:  string
  whyNow:            string
  suggestedAction:   SuggestedAction
  toneGuidance:      string
  draftOpener?:      string
}

function hashSignals(signals: Layer1Signals): string {
  const key = JSON.stringify({
    ts: Math.round(signals.tieStrength * 100),
    or: Math.round(signals.overdueRatio * 100),
    rel: Math.round(signals.relevance * 100),
    tim: Math.round(signals.timeliness * 100),
    ms: signals.hasMilestone,
    ask: signals.hasOpenAsk,
  })
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)
}

async function getCachedInsight(connectionId: string, userId: string, signalsHash: string): Promise<Layer2Result | null> {
  try {
    const { data } = await supabase
      .from('relationship_insights')
      .select('relationship_type, why_now, suggested_action, tone_guidance, draft_opener, computed_at, signals_hash')
      .eq('connection_id', connectionId)
      .eq('user_id', userId)
      .single()

    if (!data) return null

    const age = Date.now() - new Date(data.computed_at).getTime()
    if (age > LAYER2_TTL_MS) return null          // cache expired
    if (data.signals_hash !== signalsHash) return null // signals changed

    return {
      relationshipType: data.relationship_type ?? 'peer',
      whyNow:           data.why_now ?? '',
      suggestedAction:  (data.suggested_action as SuggestedAction) ?? 'message',
      toneGuidance:     data.tone_guidance ?? '',
      draftOpener:      data.draft_opener ?? undefined,
    }
  } catch {
    return null
  }
}

async function writeInsightCache(
  connectionId: string,
  userId: string,
  signalsHash: string,
  result: Layer2Result
): Promise<void> {
  try {
    await supabase.from('relationship_insights').upsert({
      connection_id:     connectionId,
      user_id:           userId,
      relationship_type: result.relationshipType,
      why_now:           result.whyNow,
      suggested_action:  result.suggestedAction,
      tone_guidance:     result.toneGuidance,
      draft_opener:      result.draftOpener ?? null,
      signals_hash:      signalsHash,
      computed_at:       new Date().toISOString(),
    }, { onConflict: 'connection_id,user_id' })
  } catch (e) {
    console.error('[engine] Failed to write insight cache', e)
  }
}

/**
 * Call Claude to generate a Layer 2 insight for a single connection.
 * Defensive parse: falls back to null on any failure.
 * Never called synchronously in the Home request path.
 */
async function callClaude(
  user: UserProfile,
  peer: PeerProfile,
  signals: Layer1Signals,
  deterministicFallback: string
): Promise<Layer2Result | null> {
  if (!anthropic) return null

  const prompt = `You are analyzing a professional relationship to produce a brief, specific insight.

USER (the person viewing their dashboard):
- Name: ${user.full_name}
- Role/Headline: ${user.headline ?? 'unknown'}
- Company: ${user.current_company ?? 'unknown'}
- Location: ${user.location_city ?? 'unknown'}

THEIR CONNECTION:
- Name: ${peer.full_name}
- Role/Headline: ${peer.headline ?? 'unknown'}
- Company: ${peer.current_company ?? 'unknown'}
- Location: ${peer.location_city ?? 'unknown'}
- Open to roles: ${peer.open_to_roles ? 'yes' : 'no'}
- Can help with: ${peer.can_help_with ?? 'not specified'}

RELATIONSHIP SIGNALS:
- Days since last contact: ${signals.daysSince}
- Expected contact interval for this relationship: ${Math.round(signals.expectedInterval)} days
- Overdue ratio: ${signals.overdueRatio.toFixed(2)} (>1 = overdue vs their personal cadence)
- Tie strength: ${(signals.tieStrength * 100).toFixed(0)}/100
- Relevance score: ${(signals.relevance * 100).toFixed(0)}/100
- Has recent milestone: ${signals.hasMilestone}
- Has open ask: ${signals.hasOpenAsk}
- Connection age: ${signals.connectionAgeDays} days

Return ONLY valid JSON, no markdown, no prose:
{
  "relationshipType": "mentor|peer|collaborator|recruiter-contact|acquaintance|dormant-lead",
  "whyNow": "one specific sentence about why reaching out NOW makes sense, referencing real details from both profiles — NEVER generic",
  "suggestedAction": "reconnect|message|congratulate|welcome|ask|meet",
  "toneGuidance": "short description of tone",
  "draftOpener": "optional first sentence for a message, leave blank string if not confident"
}

The whyNow MUST reference real details (names, roles, companies, milestones). If you cannot produce something specific, return exactly: "${deterministicFallback}"`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }],
    })
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    // Strip stray fences
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as Layer2Result
    // Validate required fields
    if (!parsed.whyNow || !parsed.suggestedAction) return null
    // Quality gate: whyNow must reference at least one real name/company
    const nameCheck = [peer.full_name.split(' ')[0], peer.current_company, user.full_name.split(' ')[0]].filter(Boolean)
    const hasSpecific = nameCheck.some((n) => n && parsed.whyNow.includes(n))
    if (!hasSpecific) {
      parsed.whyNow = deterministicFallback
    }
    return parsed
  } catch {
    return null
  }
}

// ── Feedback logging ─────────────────────────────────────────────────────────

export async function logFeedback(opts: {
  userId:          string
  connectionId:    string
  priorityScore:   number
  dominantFactor:  DominantFactor
  suggestedAction: SuggestedAction
  signals:         Layer1Signals
  outcome:         'acted' | 'dismissed' | 'ignored'
}): Promise<void> {
  try {
    await supabase.from('relationship_feedback').insert({
      user_id:          opts.userId,
      connection_id:    opts.connectionId,
      priority_score:   opts.priorityScore,
      dominant_factor:  opts.dominantFactor,
      suggested_action: opts.suggestedAction,
      signals:          opts.signals,
      outcome:          opts.outcome,
    })
  } catch (e) {
    console.error('[engine] Failed to log feedback', e)
  }
}

// ── Main export: rank connections ────────────────────────────────────────────

export interface RankInput {
  userId:      string
  userProfile: UserProfile
  connections: ConnectionRow[]
  peerProfiles: Map<string, PeerProfile>
  /** ISO timestamps of messages per peer, keyed by peer user ID */
  messageDatesByPeer: Map<string, string[]>
  /** Peer IDs who sent messages (to compute reciprocity) */
  messagesSentByPeer: Map<string, number>
  /** Message counts sent by the current user per peer */
  messagesSentByUser: Map<string, number>
  /** Peer IDs with a recent milestone */
  peerIdsWithMilestone: Set<string>
  /** Peer IDs with an open ask */
  peerIdsWithOpenAsk: Set<string>
  /** Peer IDs who are mutual connections (appears in both knots) */
  mutualConnectionCounts: Map<string, number>
  totalConnectionCount: number
  /** Cached Layer 2 insights keyed by connectionId */
  cachedInsights: Map<string, Layer2Result>
}

export function rankConnections(input: RankInput): RankedConnection[] {
  const now = Date.now()
  const results: RankedConnection[] = []

  for (const conn of input.connections) {
    const peerId = conn.requester_id === input.userId ? conn.addressee_id : conn.requester_id
    const peer = input.peerProfiles.get(peerId)
    if (!peer) continue

    const connectionAgeDays = Math.floor((now - new Date(conn.created_at).getTime()) / 86400000)
    const daysSince = Math.floor((now - new Date(conn.updated_at).getTime()) / 86400000)

    const messageDates  = input.messageDatesByPeer.get(peerId) ?? []
    const sentByPeer    = input.messagesSentByPeer.get(peerId) ?? 0
    const sentByUser    = input.messagesSentByUser.get(peerId) ?? 0
    const messageCount90d = messageDates.filter((d) => {
      return (now - new Date(d).getTime()) / 86400000 <= 90
    }).length

    const hasMilestone  = input.peerIdsWithMilestone.has(peerId)
    const hasOpenAsk    = input.peerIdsWithOpenAsk.has(peerId)
    const mutualConns   = input.mutualConnectionCounts.get(peerId) ?? 0

    // ── Layer 1 ──────────────────────────────────────────────────────────────
    const cachedInsight = input.cachedInsights.get(conn.id)
    const relationshipType = cachedInsight?.relationshipType ?? null

    const tieStrength = computeTieStrength({
      messageCount90d,
      sentByUser,
      sentByPeer,
      mutualConnections:  mutualConns,
      totalConnections:   input.totalConnectionCount,
      asksExchanged:      0, // TODO: wire through once asks-answered data available
      metInPerson:        false, // TODO: wire through once meetings table queried
    })

    const expectedInterval = computeExpectedInterval({
      messageDates,
      relationshipType,
      tieStrength,
    })

    const overdueRatio = expectedInterval > 0 ? daysSince / expectedInterval : 1
    const relevance    = computeRelevance(input.userProfile, peer)
    const timeliness   = computeTimeliness(peer, { hasMilestone, hasOpenAsk })

    const newBoost = connectionAgeDays <= NEW_CONNECTION_WINDOW_DAYS
      ? 1 - (connectionAgeDays / NEW_CONNECTION_WINDOW_DAYS)
      : 0

    const signals: Layer1Signals = {
      tieStrength,
      expectedInterval,
      overdueRatio,
      daysSince,
      relevance,
      timeliness,
      connectionAgeDays,
      newBoost,
      hasMilestone,
      hasOpenAsk,
    }

    // ── Composite score ───────────────────────────────────────────────────────
    const maintenanceTerm  = (Math.min(overdueRatio, OVERDUE_CAP) / OVERDUE_CAP) * tieStrength
    const opportunityTerm  = relevance * timeliness
    const newTerm          = newBoost

    const rawScore =
        WEIGHTS.wMaintenance * maintenanceTerm
      + WEIGHTS.wOpportunity * opportunityTerm
      + WEIGHTS.wNew         * newTerm

    const priorityScore = Math.round(Math.min(rawScore * 100, 100))

    // Dominant factor
    const terms = {
      maintenance: WEIGHTS.wMaintenance * maintenanceTerm,
      opportunity: WEIGHTS.wOpportunity * opportunityTerm,
      new:         WEIGHTS.wNew         * newTerm,
    }
    let dominantFactor: DominantFactor =
      hasMilestone ? 'milestone' :
      connectionAgeDays <= NEW_CONNECTION_WINDOW_DAYS ? 'new' :
      terms.maintenance >= terms.opportunity ? 'maintenance' : 'opportunity'

    const state = deriveState(overdueRatio, connectionAgeDays)

    // ── Reason + action (Layer 2 if cached, else deterministic) ──────────────
    const fallbackReason = deterministicReason(state, signals, peer)
    const reason = (cachedInsight?.whyNow && cachedInsight.whyNow !== fallbackReason)
      ? cachedInsight.whyNow
      : fallbackReason
    const suggestedAction: SuggestedAction =
      (cachedInsight?.suggestedAction as SuggestedAction | undefined)
      ?? determineSuggestedAction(state, signals, dominantFactor)
    const draftOpener = cachedInsight?.draftOpener || undefined

    results.push({
      connectionId: conn.id,
      peerId,
      peer,
      priorityScore,
      dominantFactor,
      state,
      reason,
      suggestedAction,
      draftOpener,
      signals,
    })
  }

  // Sort: priorityScore desc, then state rank, then daysSince desc
  const stateRank: Record<RelationshipState, number> = { cold: 0, cooling: 1, new: 2, warm: 3 }
  results.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
    if (stateRank[a.state] !== stateRank[b.state]) return stateRank[a.state] - stateRank[b.state]
    return b.signals.daysSince - a.signals.daysSince
  })

  return results
}

/**
 * Background refresh: compute Layer 2 insights for connections that clear
 * the score floor. Called AFTER the Home response is sent.
 * Fire-and-forget; errors are logged, not thrown.
 */
export async function refreshLayer2InBackground(opts: {
  userId:      string
  userProfile: UserProfile
  connections: ConnectionRow[]
  peerProfiles: Map<string, PeerProfile>
  ranked:      RankedConnection[]
}): Promise<void> {
  if (!anthropic) return

  const eligible = opts.ranked.filter(
    (r) => r.priorityScore >= LAYER2_SCORE_FLOOR * 100 || r.state === 'new'
  ).slice(0, 10) // cap to avoid runaway API usage

  for (const ranked of eligible) {
    const conn = opts.connections.find((c) => c.id === ranked.connectionId)
    if (!conn) continue
    const peer = opts.peerProfiles.get(ranked.peerId)
    if (!peer) continue

    const signalsHash = hashSignals(ranked.signals)
    const existing = await getCachedInsight(conn.id, opts.userId, signalsHash)
    if (existing) continue // already fresh

    const fallback = deterministicReason(ranked.state, ranked.signals, peer)
    const result = await callClaude(opts.userProfile, peer, ranked.signals, fallback)
    if (result) {
      await writeInsightCache(conn.id, opts.userId, signalsHash, result)
    }
  }
}
