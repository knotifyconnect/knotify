import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const gigsRouter = Router()

const GIG_UNLOCK_AT = 70 // must match quests.ts tier threshold ("Trusted")

const createSchema = z.object({
  gigType: z.enum(['cv_review', 'referral', 'mentorship', 'tour', 'advice', 'other']),
  title: z.string().min(4).max(120),
  description: z.string().max(1000).optional().nullable(),
  rewardType: z.enum(['coffee', 'paid', 'free']),
  priceEur: z.number().int().min(0).max(1000).optional().nullable(),
})

// GET /api/gigs — open gigs with provider info + credibility
gigsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const gigs = await supabase
    .from('gigs')
    .select('id, gig_type, title, description, reward_type, price_eur, status, created_at, provider_id, users:provider_id(full_name, username, avatar_url, credibility_score)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (gigs.error) return res.status(500).json({ error: gigs.error.message })

  const out = (gigs.data ?? []).map((g) => {
    const p = Array.isArray((g as any).users) ? (g as any).users[0] : (g as any).users
    return {
      id: g.id,
      gig_type: g.gig_type,
      title: g.title,
      description: g.description,
      reward_type: g.reward_type,
      price_eur: g.price_eur,
      provider_name: p?.full_name ?? 'Someone',
      provider_avatar: p?.avatar_url ?? null,
      provider_credibility: p?.credibility_score ?? 0,
      is_mine: g.provider_id === req.appUserId,
    }
  })

  return res.json({ gigs: out, unlock_at: GIG_UNLOCK_AT })
})

// My eligibility to offer gigs
gigsRouter.get('/eligibility', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const me = await supabase.from('users').select('credibility_score').eq('id', req.appUserId).maybeSingle()
  const score = me.data?.credibility_score ?? 0
  return res.json({ credibility_score: score, can_offer: score >= GIG_UNLOCK_AT, unlock_at: GIG_UNLOCK_AT })
})

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
