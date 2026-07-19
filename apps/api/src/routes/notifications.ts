import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { entityUrl } from '../lib/notifications.js'

export const notificationsRouter = Router()

const notificationIdParamSchema = z.object({ id: z.string().uuid() })

notificationsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const limit = Math.min(Number(req.query.limit) || 30, 100)

  const result = await supabase
    .from('notifications')
    .select('id, type, title, body, entity_type, entity_id, read_at, created_at, actor:actor_id(id, full_name, username, avatar_url)')
    .eq('user_id', req.appUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (result.error) return res.status(500).json({ error: result.error.message })

  const notifications = (result.data ?? []).map((n) => ({
    ...n,
    url: n.entity_type && n.entity_id ? entityUrl(n.entity_type, n.entity_id) ?? null : null,
  }))

  return res.json({ notifications })
})

notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const result = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.appUserId)
    .is('read_at', null)

  if (result.error) return res.status(500).json({ error: result.error.message })

  return res.json({ count: result.count ?? 0 })
})

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const params = notificationIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid notification id', fields: params.error.flatten() })
  }

  const result = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', params.data.id)
    .eq('user_id', req.appUserId)
    .select('id')
    .maybeSingle()

  if (result.error) return res.status(500).json({ error: result.error.message })
  if (!result.data) return res.status(404).json({ error: 'Notification not found' })

  return res.json({ ok: true })
})

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })

  const result = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', req.appUserId)
    .is('read_at', null)

  if (result.error) return res.status(500).json({ error: result.error.message })

  return res.json({ ok: true })
})
