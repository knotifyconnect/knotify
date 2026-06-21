import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const questsRouter = Router()

// ── Verified quests (code-defined: each condition is checked server-side) ────
type QuestCategory = 'profile' | 'network' | 'social' | 'explore' | 'give'
type VerifiedQuest = {
  key: string
  title: string
  description: string
  points: number
  category: QuestCategory
  icon: string
}

const VERIFIED: VerifiedQuest[] = [
  { key: 'complete_profile', title: 'First impressions',    description: 'Complete your profile so people get who you are.', points: 20, category: 'profile', icon: 'target' },
  { key: 'add_bio_photo',    title: 'Show your face',       description: 'Add a photo or a short bio.',                     points: 10, category: 'profile', icon: 'camera' },
  { key: 'curious',          title: 'Many sides',           description: 'Pick 5+ interests. Work is only part of you.',    points: 10, category: 'profile', icon: 'palette' },
  { key: 'polyglot',         title: 'Citizen of the world', description: 'Add 2+ languages you speak.',                     points: 10, category: 'profile', icon: 'globe' },
  { key: 'first_connection', title: 'Ice breaker',          description: 'Make your very first connection.',                points: 15, category: 'network', icon: 'handshake' },
  { key: 'growing_network',  title: 'Inner circle',         description: 'Grow to 5 connections.',                          points: 25, category: 'network', icon: 'users' },
]

// Credibility tiers. Reaching "Trusted" unlocks offering gigs.
const TIERS = [
  { min: 0,   name: 'Newcomer' },
  { min: 30,  name: 'Connected' },
  { min: 70,  name: 'Trusted' },
  { min: 120, name: 'Pillar' },
]
const GIG_UNLOCK_AT = 70

function tierFor(score: number) {
  let t = TIERS[0]
  for (const x of TIERS) if (score >= x.min) t = x
  return t
}
function nextTierFor(score: number) {
  return TIERS.find((x) => x.min > score) ?? null
}

type EvalEntry = { done: boolean; progress?: number; target?: number }

// Evaluate verified-quest conditions against live data (not gameable).
async function evaluate(userId: string): Promise<Record<string, EvalEntry>> {
  const userRow = await supabase
    .from('users')
    .select('persona, interests, goals, bio, avatar_url, languages')
    .eq('id', userId)
    .maybeSingle()

  const conn = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted')

  const u = (userRow.data ?? {}) as any
  const interests = Array.isArray(u.interests) ? u.interests : []
  const goals = Array.isArray(u.goals) ? u.goals : []
  const languages = Array.isArray(u.languages) ? u.languages : []
  const bio = typeof u.bio === 'string' ? u.bio.trim() : ''
  const connCount = conn.count ?? 0

  return {
    complete_profile: { done: !!u.persona && interests.length >= 3 && goals.length >= 1 },
    add_bio_photo:    { done: bio.length > 0 || !!u.avatar_url },
    curious:          { done: interests.length >= 5, progress: Math.min(interests.length, 5), target: 5 },
    polyglot:         { done: languages.length >= 2, progress: Math.min(languages.length, 2), target: 2 },
    first_connection: { done: connCount >= 1 },
    growing_network:  { done: connCount >= 5, progress: Math.min(connCount, 5), target: 5 },
  }
}

// Active honour quests from the DB (admin-managed), respecting schedule window.
async function activeDbQuests() {
  const nowIso = new Date().toISOString()
  const rows = (await supabase.from('quests').select('*').eq('active', true)).data ?? []
  return rows.filter((q: any) => {
    if (q.starts_at && q.starts_at > nowIso) return false
    if (q.ends_at && q.ends_at < nowIso) return false
    return true
  })
}

async function completedRows(userId: string) {
  return (await supabase.from('user_quests').select('quest_key, points_awarded').eq('user_id', userId)).data ?? []
}

questsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const [evalMap, dbQuests, doneRows] = await Promise.all([
    evaluate(req.appUserId),
    activeDbQuests(),
    completedRows(req.appUserId),
  ])
  const completed = new Set(doneRows.map((r: any) => r.quest_key))
  const score = doneRows.reduce((s: number, r: any) => s + (r.points_awarded ?? 0), 0)

  const verified = VERIFIED.map((q) => {
    const st = evalMap[q.key] ?? { done: false }
    const status = completed.has(q.key) ? 'completed' : st.done ? 'claimable' : 'locked'
    return { ...q, type: 'verified' as const, progress: st.progress, target: st.target, status }
  })

  const self = dbQuests.map((q: any) => ({
    key: q.key,
    title: q.title,
    description: q.description ?? '',
    points: q.points,
    category: q.category,
    icon: q.icon ?? 'sparkles',
    type: 'self' as const,
    progress: undefined,
    target: undefined,
    status: completed.has(q.key) ? 'completed' : 'claimable',
  }))

  const tier = tierFor(score)
  const next = nextTierFor(score)

  return res.json({
    credibility_score: score,
    tier: tier.name,
    next_tier: next ? { name: next.name, at: next.min } : null,
    gig_unlocked: score >= GIG_UNLOCK_AT,
    gig_unlock_at: GIG_UNLOCK_AT,
    quests: [...verified, ...self],
  })
})

questsRouter.post('/:key/claim', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const key = req.params.key

  let points: number
  const verified = VERIFIED.find((q) => q.key === key)
  if (verified) {
    const evalMap = await evaluate(req.appUserId)
    if (!evalMap[key]?.done) return res.status(400).json({ error: 'Quest requirements not met yet.' })
    points = verified.points
  } else {
    const dbQuest = (await activeDbQuests()).find((q: any) => q.key === key)
    if (!dbQuest) return res.status(404).json({ error: 'Unknown or inactive quest' })
    points = dbQuest.points
  }

  const ins = await supabase
    .from('user_quests')
    .upsert(
      { user_id: req.appUserId, quest_key: key, points_awarded: points },
      { onConflict: 'user_id,quest_key', ignoreDuplicates: true }
    )
  if (ins.error) return res.status(500).json({ error: ins.error.message })

  const rows = await completedRows(req.appUserId)
  const score = rows.reduce((s: number, r: any) => s + (r.points_awarded ?? 0), 0)
  await supabase.from('users').update({ credibility_score: score }).eq('id', req.appUserId)

  return res.json({ ok: true, credibility_score: score, awarded: points })
})
