import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const questsRouter = Router()

// ── Quest catalog (code-defined; completions persisted in user_quests) ───────
// 'verified' quests are checked server-side against real data (not gameable).
// 'self' quests are real-life challenges done out in the world — completed on the
// honour system, which is itself part of building credibility (trust).
type QuestCategory = 'profile' | 'network' | 'social' | 'explore' | 'give'
type QuestType = 'verified' | 'self'
type Quest = {
  key: string
  title: string
  description: string
  points: number
  category: QuestCategory
  type: QuestType
  icon: string
}

const CATALOG: Quest[] = [
  // Verified — getting set up
  { key: 'complete_profile', title: 'First impressions',     description: 'Complete your profile so people get who you are.',     points: 20, category: 'profile', type: 'verified', icon: '🎯' },
  { key: 'add_bio_photo',    title: 'Show your face',        description: 'Add a photo or a short bio.',                          points: 10, category: 'profile', type: 'verified', icon: '📸' },
  { key: 'curious',          title: 'Many sides',            description: 'Pick 5+ interests — work is only part of you.',        points: 10, category: 'profile', type: 'verified', icon: '🎨' },
  { key: 'polyglot',         title: 'Citizen of the world',  description: 'Add 2+ languages you speak.',                          points: 10, category: 'profile', type: 'verified', icon: '🌍' },
  { key: 'first_connection', title: 'Ice breaker',           description: 'Make your very first connection.',                     points: 15, category: 'network', type: 'verified', icon: '🤝' },
  { key: 'growing_network',  title: 'Inner circle',          description: 'Grow to 5 connections.',                               points: 25, category: 'network', type: 'verified', icon: '🔗' },

  // Real-life — out in the world (honour system)
  { key: 'coffee_stranger',  title: 'Coffee with a stranger', description: 'Meet someone new from knotify for a real coffee.',    points: 30, category: 'social',  type: 'self', icon: '☕' },
  { key: 'matchmaker',       title: 'Matchmaker',            description: 'Introduce two people in your network to each other.',  points: 25, category: 'social',  type: 'self', icon: '💞' },
  { key: 'show_up',          title: 'Show up',               description: 'Go to a meetup or event — say yes and actually go.',    points: 25, category: 'social',  type: 'self', icon: '🎉' },
  { key: 'urban_explorer',   title: 'Urban explorer',        description: 'Explore a Munich neighbourhood you have never been to.', points: 15, category: 'explore', type: 'self', icon: '🗺️' },
  { key: 'sprachpartner',    title: 'Sprachpartner',         description: 'Hold a full conversation in German (or a language you are learning).', points: 20, category: 'explore', type: 'self', icon: '🇩🇪' },
  { key: 'cafe_regular',     title: 'Café regular',          description: 'Visit one of the knotify partner cafés.',              points: 15, category: 'explore', type: 'self', icon: '🥨' },
  { key: 'pay_it_forward',   title: 'Pay it forward',        description: 'Help someone — review a CV, share a referral, give real advice.', points: 30, category: 'give', type: 'self', icon: '🎁' },
]

// Credibility tiers. Reaching "Trusted" unlocks offering gigs (Phase 5).
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

// Evaluate each quest's completion condition against live data (server-side = not gameable).
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

  const u = userRow.data ?? {}
  const interests = Array.isArray((u as any).interests) ? (u as any).interests : []
  const goals = Array.isArray((u as any).goals) ? (u as any).goals : []
  const languages = Array.isArray((u as any).languages) ? (u as any).languages : []
  const bio = typeof (u as any).bio === 'string' ? (u as any).bio.trim() : ''
  const avatar = (u as any).avatar_url
  const persona = (u as any).persona
  const connCount = conn.count ?? 0

  return {
    complete_profile: { done: !!persona && interests.length >= 3 && goals.length >= 1 },
    add_bio_photo:    { done: bio.length > 0 || !!avatar },
    curious:          { done: interests.length >= 5, progress: Math.min(interests.length, 5), target: 5 },
    polyglot:         { done: languages.length >= 2, progress: Math.min(languages.length, 2), target: 2 },
    first_connection: { done: connCount >= 1 },
    growing_network:  { done: connCount >= 5, progress: Math.min(connCount, 5), target: 5 },
  }
}

async function completedKeys(userId: string): Promise<Set<string>> {
  const rows = (await supabase.from('user_quests').select('quest_key').eq('user_id', userId)).data ?? []
  return new Set(rows.map((r) => r.quest_key))
}

function scoreFrom(completed: Set<string>): number {
  return CATALOG.filter((q) => completed.has(q.key)).reduce((s, q) => s + q.points, 0)
}

questsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const [evalMap, completed] = await Promise.all([evaluate(req.appUserId), completedKeys(req.appUserId)])
  const score = scoreFrom(completed)

  const quests = CATALOG.map((q) => {
    const st = evalMap[q.key] ?? { done: false }
    const status = completed.has(q.key)
      ? 'completed'
      : q.type === 'self'
        ? 'claimable' // real-life quests can be marked done anytime (honour system)
        : st.done
          ? 'claimable'
          : 'locked'
    return {
      key: q.key,
      title: q.title,
      description: q.description,
      points: q.points,
      category: q.category,
      type: q.type,
      icon: q.icon,
      progress: st.progress,
      target: st.target,
      status,
    }
  })

  const tier = tierFor(score)
  const next = nextTierFor(score)

  return res.json({
    credibility_score: score,
    tier: tier.name,
    next_tier: next ? { name: next.name, at: next.min } : null,
    gig_unlocked: score >= GIG_UNLOCK_AT,
    gig_unlock_at: GIG_UNLOCK_AT,
    quests,
  })
})

questsRouter.post('/:key/claim', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const quest = CATALOG.find((q) => q.key === req.params.key)
  if (!quest) return res.status(404).json({ error: 'Unknown quest' })

  if (quest.type === 'verified') {
    const evalMap = await evaluate(req.appUserId)
    if (!evalMap[quest.key]?.done) {
      return res.status(400).json({ error: 'Quest requirements not met yet.' })
    }
  }

  const ins = await supabase
    .from('user_quests')
    .upsert(
      { user_id: req.appUserId, quest_key: quest.key, points_awarded: quest.points },
      { onConflict: 'user_id,quest_key', ignoreDuplicates: true }
    )
  if (ins.error) return res.status(500).json({ error: ins.error.message })

  const completed = await completedKeys(req.appUserId)
  const score = scoreFrom(completed)
  await supabase.from('users').update({ credibility_score: score }).eq('id', req.appUserId)

  return res.json({ ok: true, credibility_score: score, awarded: quest.points })
})
