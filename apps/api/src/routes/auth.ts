import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

// Bump when the Terms of Service / Privacy Policy change in a way that requires
// re-consent. Only recorded at account creation — see below.
const TERMS_VERSION = 'v1'

const completeProfileSchema = z.object({
  fullName: z.string().min(2),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  locationCity: z.string().min(2).default('Munich'),
  university: z.string().optional(),
  status: z.enum(['studying', 'open_to_work', 'employed']).default('open_to_work'),
  termsAccepted: z.boolean().optional(),
})

export const authRouter = Router()

authRouter.post('/complete-profile', requireAuth, async (req, res) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const parsed = completeProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const fullName = parsed.data.fullName.trim()
  const username = parsed.data.username.trim().toLowerCase()
  const locationCity = parsed.data.locationCity.trim()
  const university = parsed.data.university?.trim()
  const status = parsed.data.status

  const existing = await supabase
    .from('users')
    .select('id, terms_accepted_at')
    .eq('auth_id', req.authUser.id)
    .maybeSingle()

  if (existing.error) {
    return res.status(500).json({ error: existing.error.message })
  }

  const needsConsentRecord = !existing.data?.terms_accepted_at

  // Legal consent is only required — and only recorded — at the moment the
  // account row is actually created. This is a server-enforced gate, not just
  // a UI checkbox: re-syncing an existing profile (e.g. on every login) never
  // requires or overwrites the original consent timestamp.
  if (needsConsentRecord && parsed.data.termsAccepted !== true) {
    return res.status(422).json({ error: 'You must accept the Terms of Service and Privacy Policy to create an account.' })
  }

  const upsert = await supabase
    .from('users')
    .upsert(
      {
        auth_id: req.authUser.id,
        email: req.authUser.email,
        full_name: fullName,
        username,
        location_city: locationCity,
        university: university ?? null,
        status,
        ...(needsConsentRecord ? { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } : {}),
      },
      { onConflict: 'auth_id' }
    )
    .select('id, email, full_name, username, location_city, university, status, created_at, updated_at')
    .single()

  if (upsert.error) {
    if (upsert.error.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' })
    }
    return res.status(500).json({ error: upsert.error.message })
  }

  return res.status(200).json({ user: upsert.data })
})
