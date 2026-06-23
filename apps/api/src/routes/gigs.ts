import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { ensureDirectConversation, postMessage } from '../services/conversation.js'

export const gigsRouter = Router()

const GIG_UNLOCK_AT = 70 // must match quests.ts tier threshold ("Trusted")
const CREDIBILITY_PER_5_STAR = 3 // small bump per great review, scaled by rating

const GIG_TYPES = ['cv_review', 'referral', 'mentorship', 'tour', 'advice', 'other'] as const
const REWARD_TYPES = ['coffee', 'paid', 'free'] as const

const createSchema = z.object({
  gigType: z.enum(GIG_TYPES),
  title: z.string().min(4).max(120),
  description: z.string().max(1000).optional().nullable(),
  rewardType: z.enum(REWARD_TYPES),
  priceEur: z.number().int().min(0).max(1000).optional().nullable(),
})

const patchSchema = z.object({
  gigType: z.enum(GIG_TYPES).optional(),
  title: z.string().min(4).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  rewardType: z.enum(REWARD_TYPES).optional(),
  priceEur: z.number().int().min(0).max(1000).optional().nullable(),
  status: z.enum(['open', 'closed']).optional(),
})

const requestSchema = z.object({
  message: z.string().max(800).optional().nullable(),
})

const requestActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'complete', 'cancel']),
})

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(600).optional().nullable(),
})

function providerOf(row: any) {
  return Array.isArray(row?.users) ? row.users[0] : row?.users
}

function shapeGig(g: any, viewerId: string) {
  const p = providerOf(g)
  return {
    id: g.id,
    gig_type: g.gig_type,
    title: g.title,
    description: g.description,
    reward_type: g.reward_type,
    price_eur: g.price_eur,
    status: g.status,
    is_featured: g.is_featured ?? false,
    created_at: g.created_at,
    provider_id: g.provider_id,
    provider_name: p?.full_name ?? 'Someone',
    provider_username: p?.username ?? null,
    provider_avatar: p?.avatar_url ?? null,
    provider_credibility: p?.credibility_score ?? 0,
    is_mine: g.provider_id === viewerId,
  }
}

// ── List open gigs with my-request status + counts ──────────────────────────
gigsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const viewerId = req.appUserId
  const limit = Math.min(Number(req.query.limit) || 50, 100)
  const typeFilter = typeof req.query.type === 'string' && (GIG_TYPES as readonly string[]).includes(req.query.type)
    ? req.query.type
    : null
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

  let query = supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, is_featured, created_at, provider_id, users:provider_id(full_name, username, avatar_url, credibility_score)')
    .eq('status', 'open')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (typeFilter) query = query.eq('gig_type', typeFilter)
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

  const gigs = await query
  if (gigs.error) return res.status(500).json({ error: gigs.error.message })

  const rows = gigs.data ?? []
  const gigIds = rows.map((g) => g.id)

  // My active request per gig + total request counts (for provider's own gigs)
  let myRequests = new Map<string, string>()
  const requestCounts = new Map<string, number>()
  if (gigIds.length) {
    const reqs = await supabase
      .from('gig_requests')
      .select('gig_id, seeker_id, status')
      .in('gig_id', gigIds)
    if (!reqs.error) {
      for (const r of reqs.data ?? []) {
        if (r.seeker_id === viewerId) myRequests.set(r.gig_id, r.status)
        if (['pending', 'accepted'].includes(r.status)) {
          requestCounts.set(r.gig_id, (requestCounts.get(r.gig_id) ?? 0) + 1)
        }
      }
    }
  }

  const out = rows.map((g) => ({
    ...shapeGig(g, viewerId),
    my_request_status: myRequests.get(g.id) ?? null,
    active_request_count: requestCounts.get(g.id) ?? 0,
  }))

  return res.json({ gigs: out, unlock_at: GIG_UNLOCK_AT })
})

// ── My eligibility to offer gigs ────────────────────────────────────────────
gigsRouter.get('/eligibility', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const me = await supabase.from('users').select('credibility_score').eq('id', req.appUserId).maybeSingle()
  const score = me.data?.credibility_score ?? 0
  return res.json({ credibility_score: score, can_offer: score >= GIG_UNLOCK_AT, unlock_at: GIG_UNLOCK_AT })
})

// ── My gigs (as provider), with incoming request pipeline ───────────────────
gigsRouter.get('/mine', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const viewerId = req.appUserId

  const gigs = await supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, is_featured, created_at, provider_id, users:provider_id(full_name, username, avatar_url, credibility_score)')
    .eq('provider_id', viewerId)
    .order('created_at', { ascending: false })
  if (gigs.error) return res.status(500).json({ error: gigs.error.message })

  const rows = gigs.data ?? []
  const gigIds = rows.map((g) => g.id)

  let requestsByGig = new Map<string, any[]>()
  if (gigIds.length) {
    const reqs = await supabase
      .from('gig_requests')
      .select('id, gig_id, status, message, created_at, seeker_id, users:seeker_id(full_name, username, avatar_url)')
      .in('gig_id', gigIds)
      .order('created_at', { ascending: false })
    if (!reqs.error) {
      for (const r of reqs.data ?? []) {
        const s = Array.isArray((r as any).users) ? (r as any).users[0] : (r as any).users
        const shaped = {
          id: r.id,
          gig_id: r.gig_id,
          status: r.status,
          message: r.message,
          created_at: r.created_at,
          seeker_id: r.seeker_id,
          seeker_name: s?.full_name ?? 'Someone',
          seeker_username: s?.username ?? null,
          seeker_avatar: s?.avatar_url ?? null,
        }
        const list = requestsByGig.get(r.gig_id) ?? []
        list.push(shaped)
        requestsByGig.set(r.gig_id, list)
      }
    }
  }

  const out = rows.map((g) => ({
    ...shapeGig(g, viewerId),
    requests: requestsByGig.get(g.id) ?? [],
  }))

  return res.json({ gigs: out })
})

// ── My outgoing requests (as seeker) ────────────────────────────────────────
gigsRouter.get('/requests/outgoing', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const reqs = await supabase
    .from('gig_requests')
    .select('id, gig_id, status, message, price_eur, conversation_id, created_at, provider_id, gigs:gig_id(title, gig_type, reward_type, price_eur), users:provider_id(full_name, username, avatar_url)')
    .eq('seeker_id', req.appUserId)
    .order('created_at', { ascending: false })
  if (reqs.error) return res.status(500).json({ error: reqs.error.message })

  // Which of my completed requests already have a review
  const completedIds = (reqs.data ?? []).filter((r) => r.status === 'completed').map((r) => r.id)
  let reviewed = new Set<string>()
  if (completedIds.length) {
    const rv = await supabase.from('gig_reviews').select('request_id').in('request_id', completedIds)
    reviewed = new Set((rv.data ?? []).map((r) => r.request_id))
  }

  const out = (reqs.data ?? []).map((r) => {
    const gig = Array.isArray((r as any).gigs) ? (r as any).gigs[0] : (r as any).gigs
    const prov = Array.isArray((r as any).users) ? (r as any).users[0] : (r as any).users
    return {
      id: r.id,
      gig_id: r.gig_id,
      status: r.status,
      message: r.message,
      conversation_id: r.conversation_id,
      created_at: r.created_at,
      provider_id: r.provider_id,
      provider_name: prov?.full_name ?? 'Someone',
      provider_avatar: prov?.avatar_url ?? null,
      gig_title: gig?.title ?? 'Gig',
      gig_type: gig?.gig_type ?? 'other',
      reward_type: gig?.reward_type ?? 'free',
      price_eur: gig?.price_eur ?? null,
      can_review: r.status === 'completed' && !reviewed.has(r.id),
    }
  })

  return res.json({ requests: out })
})

// ── Create a gig (gated by credibility) ─────────────────────────────────────
gigsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const me = await supabase.from('users').select('credibility_score').eq('id', req.appUserId).maybeSingle()
  const score = me.data?.credibility_score ?? 0
  if (score < GIG_UNLOCK_AT) {
    return res.status(403).json({ error: `Reach ${GIG_UNLOCK_AT} credibility (Trusted) to offer gigs. You have ${score}.` })
  }

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  const d = parsed.data

  const ins = await supabase
    .from('gigs')
    .insert({
      provider_id: req.appUserId,
      gig_type: d.gigType,
      title: d.title.trim(),
      description: d.description?.trim() || null,
      reward_type: d.rewardType,
      price_eur: d.rewardType === 'paid' ? d.priceEur ?? null : null,
    })
    .select('id')
    .single()

  if (ins.error) return res.status(500).json({ error: ins.error.message })
  return res.status(201).json({ id: ins.data.id })
})

// ── Edit own gig ────────────────────────────────────────────────────────────
gigsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'No fields provided' })

  const gig = await supabase.from('gigs').select('id, provider_id, reward_type').eq('id', req.params.id).maybeSingle()
  if (gig.error) return res.status(500).json({ error: gig.error.message })
  if (!gig.data) return res.status(404).json({ error: 'Gig not found' })
  if (gig.data.provider_id !== req.appUserId) return res.status(403).json({ error: 'Not your gig' })

  const d = parsed.data
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (d.gigType !== undefined) update.gig_type = d.gigType
  if (d.title !== undefined) update.title = d.title.trim()
  if (d.description !== undefined) update.description = d.description?.trim() || null
  if (d.rewardType !== undefined) update.reward_type = d.rewardType
  if (d.status !== undefined) update.status = d.status
  const effectiveReward = d.rewardType ?? gig.data.reward_type
  if (d.priceEur !== undefined || d.rewardType !== undefined) {
    update.price_eur = effectiveReward === 'paid' ? d.priceEur ?? null : null
  }

  const result = await supabase.from('gigs').update(update).eq('id', req.params.id).select('id').single()
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ ok: true })
})

// ── Delete own gig ──────────────────────────────────────────────────────────
gigsRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const gig = await supabase.from('gigs').select('id, provider_id').eq('id', req.params.id).maybeSingle()
  if (gig.error) return res.status(500).json({ error: gig.error.message })
  if (!gig.data) return res.status(404).json({ error: 'Gig not found' })
  if (gig.data.provider_id !== req.appUserId) return res.status(403).json({ error: 'Not your gig' })

  const del = await supabase.from('gigs').delete().eq('id', req.params.id)
  if (del.error) return res.status(500).json({ error: del.error.message })
  return res.json({ ok: true })
})

// ── Request a gig (opens a Messages thread) ─────────────────────────────────
gigsRouter.post('/:id/request', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const seekerId = req.appUserId

  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const gig = await supabase
    .from('gigs')
    .select('id, provider_id, status, title, price_eur, reward_type, users:provider_id(full_name)')
    .eq('id', req.params.id)
    .maybeSingle()
  if (gig.error) return res.status(500).json({ error: gig.error.message })
  if (!gig.data) return res.status(404).json({ error: 'Gig not found' })
  if (gig.data.status !== 'open') return res.status(409).json({ error: 'This gig is no longer open' })
  if (gig.data.provider_id === seekerId) return res.status(422).json({ error: 'You cannot request your own gig' })

  // Reject duplicate active request
  const existing = await supabase
    .from('gig_requests')
    .select('id, status')
    .eq('gig_id', gig.data.id)
    .eq('seeker_id', seekerId)
    .in('status', ['pending', 'accepted'])
    .maybeSingle()
  if (existing.data) return res.status(409).json({ error: 'You already have an active request for this gig' })

  // Open / reuse the conversation between the two people
  let conversationId: string | null = null
  try {
    conversationId = await ensureDirectConversation(seekerId, gig.data.provider_id)
  } catch {
    conversationId = null // non-fatal: request still works, thread can be opened later
  }

  const ins = await supabase
    .from('gig_requests')
    .insert({
      gig_id: gig.data.id,
      seeker_id: seekerId,
      provider_id: gig.data.provider_id,
      conversation_id: conversationId,
      message: parsed.data.message?.trim() || null,
      price_eur: gig.data.reward_type === 'paid' ? gig.data.price_eur ?? null : null,
    })
    .select('id')
    .single()
  if (ins.error) return res.status(500).json({ error: ins.error.message })

  // Drop a system-style message so the provider sees context in Messages
  if (conversationId) {
    const seeker = await supabase.from('users').select('full_name').eq('id', seekerId).maybeSingle()
    const who = seeker.data?.full_name ?? 'Someone'
    const note = parsed.data.message?.trim()
    const body = `🤝 ${who} requested your gig "${gig.data.title}".${note ? `\n\n"${note}"` : ''}`
    await postMessage(conversationId, seekerId, body)
  }

  return res.status(201).json({ id: ins.data.id, conversation_id: conversationId })
})

// ── Act on a request (provider: accept/decline/complete; seeker: cancel) ────
gigsRouter.patch('/requests/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const userId = req.appUserId

  const parsed = requestActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  const { action } = parsed.data

  const reqRow = await supabase
    .from('gig_requests')
    .select('id, gig_id, seeker_id, provider_id, status, conversation_id, gigs:gig_id(title)')
    .eq('id', req.params.id)
    .maybeSingle()
  if (reqRow.error) return res.status(500).json({ error: reqRow.error.message })
  if (!reqRow.data) return res.status(404).json({ error: 'Request not found' })

  const r = reqRow.data
  const isProvider = r.provider_id === userId
  const isSeeker = r.seeker_id === userId
  if (!isProvider && !isSeeker) return res.status(403).json({ error: 'Not your request' })

  // Permission + transition rules
  const allowed: Record<string, { from: string[]; who: 'provider' | 'seeker' | 'both'; to: string }> = {
    accept:   { from: ['pending'],            who: 'provider', to: 'accepted' },
    decline:  { from: ['pending'],            who: 'provider', to: 'declined' },
    complete: { from: ['accepted'],           who: 'both',     to: 'completed' },
    cancel:   { from: ['pending', 'accepted'], who: 'seeker',   to: 'cancelled' },
  }
  const rule = allowed[action]
  if (!rule.from.includes(r.status)) {
    return res.status(409).json({ error: `Cannot ${action} a ${r.status} request` })
  }
  if (rule.who === 'provider' && !isProvider) return res.status(403).json({ error: 'Only the provider can do that' })
  if (rule.who === 'seeker' && !isSeeker) return res.status(403).json({ error: 'Only the requester can do that' })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status: rule.to, updated_at: now }
  if (action === 'accept' || action === 'decline') update.responded_at = now
  if (action === 'complete') update.completed_at = now

  const result = await supabase.from('gig_requests').update(update).eq('id', r.id).select('id').single()
  if (result.error) return res.status(500).json({ error: result.error.message })

  // Notify in the thread
  if (r.conversation_id) {
    const gigTitle = (Array.isArray((r as any).gigs) ? (r as any).gigs[0] : (r as any).gigs)?.title ?? 'the gig'
    const messages: Record<string, string> = {
      accept: `✅ Request accepted for "${gigTitle}". Let's coordinate here.`,
      decline: `Request for "${gigTitle}" was declined.`,
      complete: `🎉 "${gigTitle}" marked as completed.`,
      cancel: `Request for "${gigTitle}" was cancelled.`,
    }
    await postMessage(r.conversation_id, userId, messages[action])
  }

  return res.json({ ok: true, status: rule.to, conversation_id: r.conversation_id })
})

// ── Review a completed gig (feeds provider credibility) ─────────────────────
gigsRouter.post('/requests/:id/review', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const reviewerId = req.appUserId

  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const reqRow = await supabase
    .from('gig_requests')
    .select('id, gig_id, seeker_id, provider_id, status')
    .eq('id', req.params.id)
    .maybeSingle()
  if (reqRow.error) return res.status(500).json({ error: reqRow.error.message })
  if (!reqRow.data) return res.status(404).json({ error: 'Request not found' })
  const r = reqRow.data
  if (r.seeker_id !== reviewerId) return res.status(403).json({ error: 'Only the requester can review' })
  if (r.status !== 'completed') return res.status(409).json({ error: 'Only completed gigs can be reviewed' })

  const dupe = await supabase.from('gig_reviews').select('id').eq('request_id', r.id).maybeSingle()
  if (dupe.data) return res.status(409).json({ error: 'You already reviewed this gig' })

  const ins = await supabase
    .from('gig_reviews')
    .insert({
      request_id: r.id,
      gig_id: r.gig_id,
      reviewer_id: reviewerId,
      provider_id: r.provider_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment?.trim() || null,
    })
    .select('id')
    .single()
  if (ins.error) return res.status(500).json({ error: ins.error.message })

  // Credibility bump scaled by rating (4★ and 5★ reward the provider)
  const bump = Math.max(0, parsed.data.rating - 3) * CREDIBILITY_PER_5_STAR
  if (bump > 0) {
    const prov = await supabase.from('users').select('credibility_score').eq('id', r.provider_id).maybeSingle()
    const current = prov.data?.credibility_score ?? 0
    await supabase.from('users').update({ credibility_score: Math.min(100, current + bump) }).eq('id', r.provider_id)
  }

  return res.status(201).json({ id: ins.data.id, credibility_awarded: bump })
})
