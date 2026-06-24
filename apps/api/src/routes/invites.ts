import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const invitesRouter = Router()

// The newcomer's one-time welcome bonus for joining via an invite. Recorded as a
// user_quests row so it stays consistent with the credibility model (score is the
// sum of user_quests.points_awarded). The inviter's reward is earned through the
// invite_* milestone quests, not a flat payout, so signups cannot be farmed.
const WELCOME_BONUS_POINTS = 10
const WELCOME_BONUS_KEY = 'joined_via_invite'

// Unambiguous alphabet (no 0/O/1/I/L) for human-shareable codes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomCode(length = 7) {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/** Return the member's invite code, generating + persisting one on first use. */
async function ensureInviteCode(userId: string): Promise<string | null> {
  const existing = await supabase.from('users').select('invite_code').eq('id', userId).maybeSingle()
  if (existing.error) return null
  if (existing.data?.invite_code) return existing.data.invite_code

  // Retry on the (unlikely) unique-index collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const upd = await supabase
      .from('users')
      .update({ invite_code: code })
      .eq('id', userId)
      .is('invite_code', null)
      .select('invite_code')
      .maybeSingle()
    if (!upd.error && upd.data?.invite_code) return upd.data.invite_code
    // Someone else set it concurrently, or the code collided. Re-read and retry.
    const reread = await supabase.from('users').select('invite_code').eq('id', userId).maybeSingle()
    if (reread.data?.invite_code) return reread.data.invite_code
  }
  return null
}

function inviteUrl(code: string) {
  const base = (process.env.PUBLIC_WEB_URL || process.env.ALLOWED_ORIGIN || 'https://knotify.pro').replace(/\/$/, '')
  return `${base}/signup?invite=${code}`
}

function isProfileOnboarded(u: { persona?: unknown; interests?: unknown; goals?: unknown } | null | undefined) {
  if (!u) return false
  const interests = Array.isArray(u.interests) ? u.interests : []
  const goals = Array.isArray(u.goals) ? u.goals : []
  return Boolean(u.persona) && interests.length >= 3 && goals.length >= 1
}

// ── GET /api/invites/me — my link + who I have brought in ────────────────────
invitesRouter.get('/me', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const code = await ensureInviteCode(req.appUserId)
  if (!code) return res.status(500).json({ error: 'Could not generate invite code' })

  const invitesResult = await supabase
    .from('invites')
    .select('invitee_id, created_at')
    .eq('inviter_id', req.appUserId)
    .order('created_at', { ascending: false })

  if (invitesResult.error) return res.status(500).json({ error: invitesResult.error.message })

  const rows = invitesResult.data ?? []
  const inviteeIds = rows.map((r) => r.invitee_id)

  let invited: Array<{
    id: string
    full_name: string
    username: string
    avatar_url: string | null
    joined_at: string
    onboarded: boolean
  }> = []

  if (inviteeIds.length) {
    const usersResult = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, persona, interests, goals')
      .in('id', inviteeIds)
    if (usersResult.error) return res.status(500).json({ error: usersResult.error.message })

    const byId = new Map((usersResult.data ?? []).map((u) => [u.id, u]))
    invited = rows
      .map((r) => {
        const u = byId.get(r.invitee_id)
        if (!u) return null
        return {
          id: u.id,
          full_name: u.full_name,
          username: u.username,
          avatar_url: u.avatar_url ?? null,
          joined_at: r.created_at,
          onboarded: isProfileOnboarded(u),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  const onboardedCount = invited.filter((i) => i.onboarded).length

  return res.json({
    code,
    url: inviteUrl(code),
    invited,
    stats: {
      total: invited.length,
      onboarded: onboardedCount,
    },
  })
})

// ── GET /api/invites/lookup/:code — public, for the signup "invited by" banner ─
invitesRouter.get('/lookup/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase()
  if (!code || code.length > 16) return res.status(404).json({ error: 'Unknown invite' })

  const inviter = await supabase
    .from('users')
    .select('full_name, avatar_url')
    .eq('invite_code', code)
    .maybeSingle()

  if (inviter.error || !inviter.data) return res.status(404).json({ error: 'Unknown invite' })

  // Only expose the first name + avatar — enough to reassure, nothing identifying.
  const firstName = (inviter.data.full_name || '').trim().split(/\s+/)[0] || 'A member'
  return res.json({ inviterName: firstName, inviterAvatar: inviter.data.avatar_url ?? null })
})

// ── POST /api/invites/claim — attribute the caller to an inviter (idempotent) ─
const claimSchema = z.object({ code: z.string().min(3).max(16) })

invitesRouter.post('/claim', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = claimSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const code = parsed.data.code.trim().toUpperCase()
  const me = req.appUserId

  // Already attributed? Stay idempotent so the onboarding hook can fire safely.
  const mine = await supabase.from('users').select('invited_by').eq('id', me).maybeSingle()
  if (mine.error) return res.status(500).json({ error: mine.error.message })
  if (mine.data?.invited_by) return res.json({ ok: true, alreadyAttributed: true })

  const inviter = await supabase.from('users').select('id').eq('invite_code', code).maybeSingle()
  if (inviter.error) return res.status(500).json({ error: inviter.error.message })
  if (!inviter.data) return res.status(404).json({ error: 'Unknown invite code' })

  const inviterId = inviter.data.id as string
  if (inviterId === me) return res.status(422).json({ error: 'You cannot invite yourself' })

  // Record attribution. unique(invitee_id) is the real guard against races.
  const insert = await supabase
    .from('invites')
    .insert({ inviter_id: inviterId, invitee_id: me, code })
    .select('id')
    .maybeSingle()

  if (insert.error) {
    // 23505 = already attributed by a concurrent request; treat as success.
    if ((insert.error as { code?: string }).code === '23505') {
      return res.json({ ok: true, alreadyAttributed: true })
    }
    return res.status(500).json({ error: insert.error.message })
  }

  await supabase.from('users').update({ invited_by: inviterId }).eq('id', me)

  // Welcome bonus for the newcomer (idempotent via user_quests unique key).
  await supabase
    .from('user_quests')
    .upsert(
      { user_id: me, quest_key: WELCOME_BONUS_KEY, points_awarded: WELCOME_BONUS_POINTS },
      { onConflict: 'user_id,quest_key', ignoreDuplicates: true }
    )
  const myQuests = (await supabase.from('user_quests').select('points_awarded').eq('user_id', me)).data ?? []
  const myScore = myQuests.reduce((s: number, r: any) => s + (r.points_awarded ?? 0), 0)
  await supabase.from('users').update({ credibility_score: myScore }).eq('id', me)

  // Network-first: the two already know each other, so pre-seed a pending knot.
  const existingConn = await supabase
    .from('connections')
    .select('id')
    .or(
      `and(requester_id.eq.${inviterId},addressee_id.eq.${me}),and(requester_id.eq.${me},addressee_id.eq.${inviterId})`
    )
    .maybeSingle()
  if (!existingConn.data) {
    await supabase
      .from('connections')
      .insert({ requester_id: inviterId, addressee_id: me, status: 'pending' })
  }

  return res.status(201).json({ ok: true, welcomeBonus: WELCOME_BONUS_POINTS })
})
