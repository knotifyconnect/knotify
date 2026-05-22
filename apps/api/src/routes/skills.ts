import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const skillsRouter = Router()
const skillIdParamSchema = z.object({ id: z.string().uuid() })

skillsRouter.post('/:id/verify', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const params = skillIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid skill id', fields: params.error.flatten() })
  }
  const skillId = params.data.id

  const updated = await supabase
    .from('skills_legacy')
    .update({ is_verified: true })
    .eq('id', skillId)
    .eq('user_id', req.appUserId)
    .select('id, name, category, is_verified, source')
    .maybeSingle()

  if (updated.error) {
    return res.status(500).json({ error: updated.error.message })
  }

  if (!updated.data) {
    return res.status(404).json({ error: 'Skill not found' })
  }

  return res.json({ skill: updated.data })
})

skillsRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const params = skillIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid skill id', fields: params.error.flatten() })
  }
  const skillId = params.data.id

  const removed = await supabase
    .from('skills_legacy')
    .delete()
    .eq('id', skillId)
    .eq('user_id', req.appUserId)
    .select('id')
    .maybeSingle()

  if (removed.error) {
    return res.status(500).json({ error: removed.error.message })
  }

  if (!removed.data) {
    return res.status(404).json({ error: 'Skill not found' })
  }

  return res.status(204).send()
})


