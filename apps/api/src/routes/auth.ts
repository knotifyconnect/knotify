import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

const completeProfileSchema = z.object({
  fullName: z.string().min(2),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  locationCity: z.string().min(2).default('Munich'),
  university: z.string().optional(),
  status: z.enum(['studying', 'open_to_work', 'employed']).default('open_to_work'),
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
  const username = parsed.data.username.trim()
  const locationCity = parsed.data.locationCity.trim()
  const university = parsed.data.university?.trim()
  const status = parsed.data.status

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
      },
      { onConflict: 'auth_id' }
    )
    .select('id, email, full_name, username, location_city, university, status, created_at, updated_at')
    .single()

  if (upsert.error) {
    return res.status(500).json({ error: upsert.error.message })
  }

  return res.status(200).json({ user: upsert.data })
})
