import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const cafesRouter = Router()

// ── Public: list active cafés (for the Cafés page + map) ─────────────────
cafesRouter.get('/', requireAuth, async (_req, res) => {
  const result = await supabase
    .from('cafes')
    .select('id, slug, name, address, city, perk_text, photo_url, hours_text, lat, lng, current_checkins')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ cafes: result.data ?? [] })
})

cafesRouter.get('/:idOrSlug', requireAuth, async (req, res) => {
  const idOrSlug = req.params.idOrSlug
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug)
  const query = supabase.from('cafes').select('*').eq('is_active', true)
  const result = isUuid ? await query.eq('id', idOrSlug).maybeSingle() : await query.eq('slug', idOrSlug).maybeSingle()
  if (result.error) return res.status(500).json({ error: result.error.message })
  if (!result.data) return res.status(404).json({ error: 'Café not found' })
  return res.json({ cafe: result.data })
})

// ── Member check-in (gives a unique discount code) ───────────────────────
function genCode(): string {
  // 8 chars, uppercase letters + digits, e.g. K7N2P4QX
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1
  let out = ''
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

const checkinSchema = z.object({
  cafeId: z.string().uuid(),
})

cafesRouter.post('/:id/checkin', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const parsed = checkinSchema.safeParse({ cafeId: req.params.id })
  if (!parsed.success) return res.status(422).json({ error: 'Invalid café id' })

  // Verify café exists and is active
  const cafe = await supabase.from('cafes').select('id, name').eq('id', parsed.data.cafeId).eq('is_active', true).maybeSingle()
  if (cafe.error) return res.status(500).json({ error: cafe.error.message })
  if (!cafe.data) return res.status(404).json({ error: 'Café not found or inactive' })

  // Allow at most one un-redeemed code per (cafe, user) — return the existing one if present
  const existing = await supabase
    .from('cafe_checkins')
    .select('id, discount_code, created_at, redeemed_at')
    .eq('cafe_id', parsed.data.cafeId)
    .eq('user_id', req.appUserId)
    .is('redeemed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.error) return res.status(500).json({ error: existing.error.message })

  if (existing.data) {
    return res.json({ checkin: existing.data, cafe: cafe.data, reused: true })
  }

  // Generate a unique code, retry on collision (rare)
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode()
    const insert = await supabase
      .from('cafe_checkins')
      .insert({ cafe_id: parsed.data.cafeId, user_id: req.appUserId, discount_code: code })
      .select('id, discount_code, created_at, redeemed_at')
      .single()
    if (!insert.error) {
      return res.status(201).json({ checkin: insert.data, cafe: cafe.data, reused: false })
    }
    lastErr = insert.error.message
  }
  return res.status(500).json({ error: lastErr ?? 'Could not generate discount code' })
})

// ── User suggestion for a new café ───────────────────────────────────────
cafesRouter.post('/suggest', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const { name, address, notes } = req.body as { name: string; address: string; notes?: string }
  if (!name?.trim() || !address?.trim()) return res.status(422).json({ error: 'Name and address are required' })
  const insert = await supabase
    .from('pending_cafes')
    .insert({ name: name.trim(), address: address.trim(), notes: notes?.trim() ?? null, suggested_by: req.appUserId })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })
  return res.status(201).json({ pending: insert.data })
})

cafesRouter.get('/me/checkins', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const result = await supabase
    .from('cafe_checkins')
    .select('id, cafe_id, discount_code, created_at, redeemed_at')
    .eq('user_id', req.appUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (result.error) return res.status(500).json({ error: result.error.message })
  return res.json({ checkins: result.data ?? [] })
})
