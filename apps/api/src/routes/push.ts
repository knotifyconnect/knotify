import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const pushRouter = Router()

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const unsubscribeQuerySchema = z.object({
  endpoint: z.string().url(),
})

pushRouter.get('/vapid-public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) return res.status(503).json({ error: 'Push notifications are not configured' })
  return res.json({ key })
})

pushRouter.post('/subscribe', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = subscribeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const result = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: req.appUserId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
      { onConflict: 'endpoint' }
    )

  if (result.error) return res.status(500).json({ error: result.error.message })

  return res.status(201).json({ ok: true })
})

pushRouter.delete('/subscribe', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const parsed = unsubscribeQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const result = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', req.appUserId)

  if (result.error) return res.status(500).json({ error: result.error.message })

  return res.json({ ok: true })
})
