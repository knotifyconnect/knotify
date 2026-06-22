import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })
const QUEST_PHOTOS_BUCKET = 'quest-photos'

async function ensureQuestPhotosBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.find((b) => b.name === QUEST_PHOTOS_BUCKET)) {
    await supabase.storage.createBucket(QUEST_PHOTOS_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      fileSizeLimit: 8 * 1024 * 1024,
    })
  }
}

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
  const rows = (await supabase.from('quests').select('key, title, description, points, category, icon, active, starts_at, ends_at, how_to, where_to_go, estimated_minutes, difficulty, partner_required').eq('active', true)).data ?? []
  return rows.filter((q: any) => {
    if (q.starts_at && q.starts_at > nowIso) return false
    if (q.ends_at && q.ends_at < nowIso) return false
    return true
  })
}

async function completedRows(userId: string) {
  return (await supabase.from('user_quests').select('quest_key, points_awarded, completed_at').eq('user_id', userId)).data ?? []
}

// Distinct-day streak: consecutive calendar days (ending today or yesterday)
// on which the user earned credibility. Real signal, derived from completions.
function computeStreak(rows: Array<{ completed_at?: string }>): number {
  const days = new Set<string>()
  for (const r of rows) {
    if (!r.completed_at) continue
    days.add(new Date(r.completed_at).toISOString().slice(0, 10))
  }
  if (!days.size) return 0
  const today = new Date()
  const dayStr = (d: Date) => d.toISOString().slice(0, 10)
  // Allow the streak to be "alive" if the last action was today or yesterday.
  let cursor = new Date(today)
  if (!days.has(dayStr(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (!days.has(dayStr(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayStr(cursor))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

// "top X%" — share of users ranked above this score. Null for newcomers (score 0).
async function computePercentile(score: number): Promise<number | null> {
  if (score <= 0) return null
  const totalR = await supabase.from('users').select('id', { count: 'exact', head: true })
  const higherR = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gt('credibility_score', score)
  const total = totalR.count ?? 0
  const higher = higherR.count ?? 0
  if (total <= 1) return null
  return Math.max(1, Math.round((higher / total) * 100))
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

  // Weekly delta + streak from completion timestamps; percentile across users.
  const weekAgo = Date.now() - 7 * 86400 * 1000
  const weeklyDelta = doneRows.reduce(
    (s: number, r: any) => s + (r.completed_at && new Date(r.completed_at).getTime() >= weekAgo ? (r.points_awarded ?? 0) : 0),
    0
  )
  const streak = computeStreak(doneRows as Array<{ completed_at?: string }>)
  const percentile = await computePercentile(score)

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
    how_to: q.how_to ?? null,
    where_to_go: q.where_to_go ?? null,
    estimated_minutes: q.estimated_minutes ?? null,
    difficulty: q.difficulty ?? null,
    partner_required: q.partner_required ?? false,
  }))

  const tier = tierFor(score)
  const next = nextTierFor(score)

  return res.json({
    credibility_score: score,
    tier: tier.name,
    next_tier: next ? { name: next.name, at: next.min } : null,
    gig_unlocked: score >= GIG_UNLOCK_AT,
    gig_unlock_at: GIG_UNLOCK_AT,
    weekly_delta: weeklyDelta,
    percentile,
    streak,
    quests: [...verified, ...self],
  })
})

questsRouter.post('/:key/claim', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const key = req.params.key
  const shareToFeed = req.body.shareToFeed === 'true' || req.body.shareToFeed === true

  let points: number
  let questTitle = key
  let isSelfQuest = false

  const verified = VERIFIED.find((q) => q.key === key)
  if (verified) {
    const evalMap = await evaluate(req.appUserId)
    if (!evalMap[key]?.done) return res.status(400).json({ error: 'Quest requirements not met yet.' })
    points = verified.points
    questTitle = verified.title
  } else {
    const dbQuest = (await activeDbQuests()).find((q: any) => q.key === key)
    if (!dbQuest) return res.status(404).json({ error: 'Unknown or inactive quest' })
    points = dbQuest.points
    questTitle = dbQuest.title
    isSelfQuest = true
  }

  // Upload photo evidence if provided (required for self quests, optional for verified)
  let photoUrl: string | null = null
  if (req.file) {
    try {
      await ensureQuestPhotosBucket()
      const ext = req.file.mimetype.split('/')[1] ?? 'jpg'
      const path = `${req.appUserId}/${key}-${Date.now()}.${ext}`
      const upl = await supabase.storage.from(QUEST_PHOTOS_BUCKET).upload(path, req.file.buffer, {
        contentType: req.file.mimetype, upsert: true,
      })
      if (upl.error) return res.status(500).json({ error: `Photo upload failed: ${upl.error.message}` })
      photoUrl = supabase.storage.from(QUEST_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Photo upload failed' })
    }
  } else if (isSelfQuest) {
    return res.status(400).json({ error: 'Photo evidence is required for life quests.' })
  }

  const ins = await supabase
    .from('user_quests')
    .upsert(
      { user_id: req.appUserId, quest_key: key, points_awarded: points, photo_url: photoUrl, share_to_feed: shareToFeed },
      { onConflict: 'user_id,quest_key', ignoreDuplicates: true }
    )
  if (ins.error) return res.status(500).json({ error: ins.error.message })

  const rows = await completedRows(req.appUserId)
  const score = rows.reduce((s: number, r: any) => s + (r.points_awarded ?? 0), 0)
  await supabase.from('users').update({ credibility_score: score }).eq('id', req.appUserId)

  // Post to updates feed if photo + shareToFeed
  if (photoUrl && shareToFeed) {
    try {
      await supabase.from('updates').insert({
        user_id: req.appUserId,
        content: `Completed the "${questTitle}" quest.`,
        image_url: photoUrl,
      })
    } catch { /* non-critical */ }
  }

  return res.json({ ok: true, credibility_score: score, awarded: points, photo_url: photoUrl })
})
