import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { MUNICH_DISTRICTS, districtForPoint, districtForText } from '../lib/districts.js'
import { recomputeCredibility } from '../lib/credibility.js'

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
  key: string; title: string; description: string; points: number
  category: QuestCategory; icon: string
  how_to: string; where_to_go: string | null; estimated_minutes: number
  difficulty: 'easy' | 'medium' | 'hard'; partner_required: boolean
}

const VERIFIED: VerifiedQuest[] = [
  {
    key: 'complete_profile', title: 'First impressions', description: 'Complete your profile so people get who you are.',
    points: 20, category: 'profile', icon: 'target',
    how_to: 'Go to your profile and fill in your persona (student / professional / expat), pick at least 3 interests, and add one goal. That is all it takes.',
    where_to_go: 'Profile page — click your avatar or go to Settings.',
    estimated_minutes: 5, difficulty: 'easy', partner_required: false,
  },
  {
    key: 'add_bio_photo', title: 'Show your face', description: 'Add a photo or a short bio.',
    points: 10, category: 'profile', icon: 'camera',
    how_to: 'Upload a real photo of yourself (not a logo, not a cartoon) and write two or three sentences about who you are and what you are up to in Munich.',
    where_to_go: 'Profile page — Edit profile.',
    estimated_minutes: 3, difficulty: 'easy', partner_required: false,
  },
  {
    key: 'curious', title: 'Many sides', description: 'Pick 5+ interests. Work is only part of you.',
    points: 10, category: 'profile', icon: 'palette',
    how_to: 'Open your profile, go to Interests, and select at least 5 things that genuinely represent you — not just your degree or job. Sports, music, food, languages, hobbies all count.',
    where_to_go: 'Profile page — Edit profile — Interests.',
    estimated_minutes: 3, difficulty: 'easy', partner_required: false,
  },
  {
    key: 'polyglot', title: 'Citizen of the world', description: 'Add 2+ languages you speak.',
    points: 10, category: 'profile', icon: 'globe',
    how_to: 'Go to your profile and add every language you can hold a real conversation in. Even if it is basic, add it — it is a connection point.',
    where_to_go: 'Profile page — Edit profile — Languages.',
    estimated_minutes: 2, difficulty: 'easy', partner_required: false,
  },
  {
    key: 'first_connection', title: 'Ice breaker', description: 'Make your very first connection.',
    points: 15, category: 'network', icon: 'handshake',
    how_to: 'Go to Discover, find someone interesting, and send a connection request with a short note. Or accept a pending request from someone who reached out to you.',
    where_to_go: 'Discover page or Your Knot — Pending requests.',
    estimated_minutes: 5, difficulty: 'easy', partner_required: true,
  },
  {
    key: 'growing_network', title: 'Inner circle', description: 'Grow to 5 connections.',
    points: 25, category: 'network', icon: 'users',
    how_to: 'Connect with 5 people on knotify. Quality matters — connect with people you have actually met, talked to, or genuinely want to know.',
    where_to_go: 'Discover page to find people. Events are the fastest way to meet people to connect with.',
    estimated_minutes: 30, difficulty: 'medium', partner_required: true,
  },
  {
    key: 'invite_first', title: 'Open the door', description: 'Bring one friend onto knotify.',
    points: 15, category: 'network', icon: 'handshake',
    how_to: 'Share your personal invite link. Once a friend signs up and sets up their profile, this is yours. The network grows one real introduction at a time.',
    where_to_go: 'Invite page — copy your link or share it.',
    estimated_minutes: 5, difficulty: 'easy', partner_required: true,
  },
  {
    key: 'invite_squad', title: 'Bring the crew', description: 'Get 3 friends onto knotify.',
    points: 30, category: 'network', icon: 'users',
    how_to: 'Invite the people who make Munich feel like home. When 3 of them join and finish onboarding, claim this. A network is more useful the more of your real circle is on it.',
    where_to_go: 'Invite page — share your link with your group.',
    estimated_minutes: 20, difficulty: 'medium', partner_required: true,
  },
  {
    key: 'invite_super', title: 'Super-connector', description: 'Bring 10 friends onto knotify.',
    points: 60, category: 'network', icon: 'sparkles',
    how_to: 'Ten real people, brought in by you. This is how a city stops feeling cold. Reaching this marks you as one of the people knotify is built around.',
    where_to_go: 'Invite page — share your link far and wide.',
    estimated_minutes: 60, difficulty: 'hard', partner_required: true,
  },
]

// Credibility ranks are real knots. The Bowline is the knot sailors trust
// with weight — reaching it unlocks offering gigs.
const TIERS = [
  { min: 0,   name: 'Loose end' },
  { min: 30,  name: 'Overhand' },
  { min: 70,  name: 'Bowline' },
  { min: 120, name: 'Masthead' },
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
  const [userRow, conn, invitedRows] = await Promise.all([
    supabase
      .from('users')
      .select('persona, interests, goals, bio, avatar_url, languages')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted'),
    // Count invitees who completed onboarding (not gameable: requires real profile).
    // Only verified email invites ('email' kind) count — reusable-link joins don't,
    // so a member can't farm credibility by pasting their link in a group chat.
    supabase
      .from('invites')
      .select('invitee_id')
      .eq('inviter_id', userId)
      .eq('kind', 'email'),
  ])

  const u = (userRow.data ?? {}) as any
  const interests = Array.isArray(u.interests) ? u.interests : []
  const goals = Array.isArray(u.goals) ? u.goals : []
  const languages = Array.isArray(u.languages) ? u.languages : []
  const bio = typeof u.bio === 'string' ? u.bio.trim() : ''
  const connCount = conn.count ?? 0

  // For invite milestones we only count invitees who have finished onboarding
  // (have a persona, 3+ interests, 1+ goal). This prevents farming empty signups.
  let onboardedInviteCount = 0
  const inviteeIds = (invitedRows.data ?? []).map((r: any) => r.invitee_id)
  if (inviteeIds.length > 0) {
    const inviteeProfiles = await supabase
      .from('users')
      .select('persona, interests, goals')
      .in('id', inviteeIds)
    const profiles = inviteeProfiles.data ?? []
    onboardedInviteCount = profiles.filter((p: any) => {
      const pi = Array.isArray(p.interests) ? p.interests : []
      const pg = Array.isArray(p.goals) ? p.goals : []
      return !!p.persona && pi.length >= 3 && pg.length >= 1
    }).length
  }

  return {
    complete_profile: { done: !!u.persona && interests.length >= 3 && goals.length >= 1 },
    add_bio_photo:    { done: bio.length > 0 || !!u.avatar_url },
    curious:          { done: interests.length >= 5, progress: Math.min(interests.length, 5), target: 5 },
    polyglot:         { done: languages.length >= 2, progress: Math.min(languages.length, 2), target: 2 },
    first_connection: { done: connCount >= 1 },
    growing_network:  { done: connCount >= 5, progress: Math.min(connCount, 5), target: 5 },
    invite_first:     { done: onboardedInviteCount >= 1, progress: Math.min(onboardedInviteCount, 1), target: 1 },
    invite_squad:     { done: onboardedInviteCount >= 3, progress: Math.min(onboardedInviteCount, 3), target: 3 },
    invite_super:     { done: onboardedInviteCount >= 10, progress: Math.min(onboardedInviteCount, 10), target: 10 },
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
  return (await supabase.from('user_quests').select('quest_key, points_awarded, completed_at, photo_url').eq('user_id', userId)).data ?? []
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

// Countersignatures for the requester's quests + requests waiting on me.
// Fail-soft: if the table does not exist yet, quests still load.
async function signatureContext(userId: string) {
  try {
    const [mineR, incomingR] = await Promise.all([
      supabase
        .from('quest_signatures')
        .select('id, quest_key, status, signer_id, signed_at')
        .eq('requester_id', userId),
      supabase
        .from('quest_signatures')
        .select('id, quest_key, requester_id, created_at')
        .eq('signer_id', userId)
        .eq('status', 'pending'),
    ])
    const mine = mineR.data ?? []
    const incoming = incomingR.data ?? []
    const peopleIds = [...new Set([...mine.map((s: any) => s.signer_id), ...incoming.map((s: any) => s.requester_id)])]
    const people = peopleIds.length
      ? (await supabase.from('users').select('id, full_name, username, avatar_url').in('id', peopleIds)).data ?? []
      : []
    const byId = new Map(people.map((p: any) => [p.id, p]))
    return {
      mine: new Map(mine.map((s: any) => [s.quest_key, { id: s.id, status: s.status, signed_at: s.signed_at, signer: byId.get(s.signer_id) ?? null }])),
      incoming: incoming.map((s: any) => ({ id: s.id, quest_key: s.quest_key, created_at: s.created_at, requester: byId.get(s.requester_id) ?? null })),
    }
  } catch {
    return { mine: new Map(), incoming: [] as any[] }
  }
}

function questTitleFor(key: string, dbQuests: any[]): string {
  return VERIFIED.find((q) => q.key === key)?.title ?? dbQuests.find((q: any) => q.key === key)?.title ?? key
}

questsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const [evalMap, dbQuests, doneRows, signatures] = await Promise.all([
    evaluate(req.appUserId),
    activeDbQuests(),
    completedRows(req.appUserId),
    signatureContext(req.appUserId),
  ])
  const completed = new Set(doneRows.map((r: any) => r.quest_key))
  const doneByKey = new Map(doneRows.map((r: any) => [r.quest_key, r]))
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
    const done = doneByKey.get(q.key) as any
    return {
      ...q, type: 'verified' as const, progress: st.progress, target: st.target, status,
      how_to: q.how_to, where_to_go: q.where_to_go,
      estimated_minutes: q.estimated_minutes, difficulty: q.difficulty, partner_required: q.partner_required,
      completed_at: done?.completed_at ?? null, photo_url: done?.photo_url ?? null, ends_at: null,
      signature: q.partner_required ? signatures.mine.get(q.key) ?? null : null,
    }
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
    completed_at: (doneByKey.get(q.key) as any)?.completed_at ?? null,
    photo_url: (doneByKey.get(q.key) as any)?.photo_url ?? null,
    // Scheduled window turns a quest into a time-limited "chapter" entry.
    ends_at: q.ends_at ?? null,
    signature: q.partner_required ? signatures.mine.get(q.key) ?? null : null,
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
    incoming_signature_requests: signatures.incoming.map((s: any) => ({
      ...s,
      quest_title: questTitleFor(s.quest_key, dbQuests),
    })),
  })
})

// ── Fog of war: Munich districts ─────────────────────────────────────────────
// A district clears when the user genuinely showed up there. Derived from real
// activity (café check-ins, meetings at cafés, RSVP'd past events) — never
// self-reported, so the map cannot be gamed.

questsRouter.get('/districts', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const uid = req.appUserId

  const [checkinsR, meetingsR, rsvpsR] = await Promise.all([
    supabase.from('cafe_checkins').select('cafe_id, cafes(lat, lng, address, name)').eq('user_id', uid),
    supabase
      .from('meetings')
      .select('cafe_id, location_text, status, cafes(lat, lng, address, name)')
      .or(`initiator_id.eq.${uid},invitee_id.eq.${uid}`)
      .in('status', ['confirmed', 'completed']),
    supabase
      .from('event_rsvps')
      .select('event_id, events(location, starts_at)')
      .eq('user_id', uid),
  ])

  const visited = new Map<string, string>() // district key -> how

  const markPoint = (lat: unknown, lng: unknown, how: string) => {
    const la = typeof lat === 'string' ? parseFloat(lat) : (lat as number)
    const ln = typeof lng === 'string' ? parseFloat(lng) : (lng as number)
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return
    const d = districtForPoint(la, ln)
    if (d && !visited.has(d.key)) visited.set(d.key, how)
  }
  const markText = (text: string | null | undefined, how: string) => {
    const d = districtForText(text)
    if (d && !visited.has(d.key)) visited.set(d.key, how)
  }

  for (const row of checkinsR.data ?? []) {
    const cafe = (row as any).cafes
    if (cafe) {
      markPoint(cafe.lat, cafe.lng, `Café check-in at ${cafe.name ?? 'a partner café'}`)
      if (cafe.lat == null) markText(cafe.address, `Café check-in at ${cafe.name ?? 'a partner café'}`)
    }
  }
  for (const row of meetingsR.data ?? []) {
    const cafe = (row as any).cafes
    if (cafe) markPoint(cafe.lat, cafe.lng, `A meeting at ${cafe.name ?? 'a café'}`)
    else markText((row as any).location_text, 'A meeting there')
  }
  const now = Date.now()
  for (const row of rsvpsR.data ?? []) {
    const ev = (row as any).events
    if (ev && ev.starts_at && new Date(ev.starts_at).getTime() <= now) {
      markText(ev.location, 'An event you attended')
    }
  }

  return res.json({
    total: MUNICH_DISTRICTS.length,
    visited_count: visited.size,
    districts: MUNICH_DISTRICTS.map((d) => ({
      key: d.key,
      name: d.name,
      visited: visited.has(d.key),
      via: visited.get(d.key) ?? null,
    })),
  })
})

// ── Countersignatures ────────────────────────────────────────────────────────
// Ask a connection to countersign a partner quest you completed. Their signed
// name renders on your journal card — a human vouching, in ink.

questsRouter.post('/:key/signature-request', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const key = req.params.key
  const signerId = typeof req.body?.signer_id === 'string' ? req.body.signer_id : null
  if (!signerId) return res.status(422).json({ error: 'signer_id is required' })
  if (signerId === req.appUserId) return res.status(422).json({ error: 'You cannot countersign your own quest.' })

  const verified = VERIFIED.find((q) => q.key === key)
  const dbQuest = verified ? null : (await activeDbQuests()).find((q: any) => q.key === key)
  const quest = verified ?? dbQuest
  if (!quest) return res.status(404).json({ error: 'Unknown quest' })
  if (!quest.partner_required) return res.status(422).json({ error: 'This quest does not take a countersignature.' })

  const done = await supabase
    .from('user_quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.appUserId)
    .eq('quest_key', key)
  if (!done.count) return res.status(400).json({ error: 'Complete the quest before asking for a signature.' })

  const conn = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .or(
      `and(requester_id.eq.${req.appUserId},addressee_id.eq.${signerId}),and(requester_id.eq.${signerId},addressee_id.eq.${req.appUserId})`
    )
    .eq('status', 'accepted')
  if (!conn.count) return res.status(403).json({ error: 'You can only ask people in your knot.' })

  const up = await supabase
    .from('quest_signatures')
    .upsert(
      { quest_key: key, requester_id: req.appUserId, signer_id: signerId, status: 'pending', signed_at: null },
      { onConflict: 'quest_key,requester_id' }
    )
  if (up.error) return res.status(500).json({ error: up.error.message })
  return res.json({ ok: true })
})

questsRouter.post('/signatures/:id/respond', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const action = req.body?.action
  if (action !== 'sign' && action !== 'decline') {
    return res.status(422).json({ error: 'action must be "sign" or "decline"' })
  }

  const row = await supabase
    .from('quest_signatures')
    .select('id, signer_id, status')
    .eq('id', req.params.id)
    .maybeSingle()
  if (!row.data) return res.status(404).json({ error: 'Signature request not found' })
  if (row.data.signer_id !== req.appUserId) return res.status(403).json({ error: 'This request is not yours to sign.' })
  if (row.data.status !== 'pending') return res.status(400).json({ error: 'Already answered.' })

  const upd = await supabase
    .from('quest_signatures')
    .update({ status: action === 'sign' ? 'signed' : 'declined', signed_at: action === 'sign' ? new Date().toISOString() : null })
    .eq('id', req.params.id)
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  return res.json({ ok: true })
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

  const score = await recomputeCredibility(req.appUserId)

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
