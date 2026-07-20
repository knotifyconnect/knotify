import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { allocateUsername, normalizeUsername, usernameOptions } from '../services/usernames.js'

// Bump when the Terms of Service / Privacy Policy change in a way that requires
// re-consent. Only recorded at account creation — see below.
const TERMS_VERSION = 'v1'

const completeProfileSchema = z.object({
  fullName: z.string().min(2),
  username: z.string().max(32).optional(),
  locationCity: z.string().min(2).default('Munich'),
  university: z.string().optional(),
  status: z.enum(['studying', 'open_to_work', 'employed']).default('open_to_work'),
  termsAccepted: z.boolean().optional(),
})

export const authRouter = Router()

const usernameOptionsQuery = z.object({
  fullName: z.string().trim().min(2).max(120),
  username: z.string().max(80).optional(),
})

authRouter.get('/username-options', async (req, res) => {
  const parsed = usernameOptionsQuery.safeParse(req.query)
  if (!parsed.success) return res.status(422).json({ error: 'Enter your name to choose a username.' })
  try {
    return res.json(await usernameOptions(parsed.data.fullName, parsed.data.username))
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not check username availability.' })
  }
})

authRouter.post('/complete-profile', requireAuth, async (req, res) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const authUser = req.authUser

  const parsed = completeProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const fullName = parsed.data.fullName.trim()
  const requestedUsername = normalizeUsername(parsed.data.username ?? '')
  if (parsed.data.username?.trim() && !/^[a-z0-9_]{3,32}$/.test(requestedUsername)) {
    return res.status(422).json({ error: 'Username must be 3–32 characters using letters, numbers, or underscores.' })
  }
  let username = requestedUsername
  const locationCity = parsed.data.locationCity.trim()
  const university = parsed.data.university?.trim()
  const status = parsed.data.status

  const existing = await supabase
    .from('users')
    .select('id, username, terms_accepted_at')
    .eq('auth_id', req.authUser.id)
    .maybeSingle()

  if (existing.error) {
    return res.status(500).json({ error: existing.error.message })
  }

  const shouldAllocate = !username && !existing.data?.username
  if (!username) username = existing.data?.username ?? await allocateUsername(fullName, existing.data?.id)

  // Legal consent is only required — and only recorded — at the moment the
  // account row is actually created. This is a server-enforced gate, not just
  // a UI checkbox: re-syncing an existing profile (e.g. on every login) never
  // requires or overwrites the original consent timestamp. Gate on the row's
  // existence, not on terms_accepted_at specifically — pre-existing accounts
  // whose timestamp was never backfilled (created before this column existed)
  // are not new signups and must not be asked to re-accept on every login.
  const isNewProfile = !existing.data
  const needsConsentBackfill = Boolean(existing.data && !existing.data.terms_accepted_at)

  if (isNewProfile && parsed.data.termsAccepted !== true) {
    return res.status(422).json({ error: 'You must accept the Terms of Service and Privacy Policy to create an account.' })
  }

  const writeProfile = (candidate: string) => supabase
    .from('users')
    .upsert(
      {
        auth_id: authUser.id,
        email: authUser.email,
        full_name: fullName,
        username: candidate,
        location_city: locationCity,
        university: university ?? null,
        status,
        ...(isNewProfile || needsConsentBackfill ? { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION } : {}),
      },
      { onConflict: 'auth_id' }
    )
    .select('id, email, full_name, username, location_city, university, status, created_at, updated_at')
    .single()

  let upsert = await writeProfile(username)
  // Availability checks improve UX; the database remains authoritative. If
  // two automatic signups choose the same name simultaneously, allocate the
  // next readable suffix instead of sending either person into recovery UI.
  if (upsert.error?.code === '23505' && shouldAllocate) {
    for (let attempt = 0; attempt < 3 && upsert.error?.code === '23505'; attempt += 1) {
      username = await allocateUsername(fullName, existing.data?.id)
      upsert = await writeProfile(username)
    }
  }

  if (upsert.error) {
    if (upsert.error.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' })
    }
    return res.status(500).json({ error: upsert.error.message })
  }

  return res.status(200).json({ user: upsert.data })
})
