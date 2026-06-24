import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const feedbackRouter = Router()

const TYPES = ['bug', 'suggestion', 'other'] as const

const submitSchema = z.object({
  type: z.enum(TYPES),
  message: z.string().trim().min(2).max(4000),
  page: z.string().max(300).optional(),
})

// ── POST /api/feedback — submit a piece of feedback ──────────────────────────
feedbackRouter.post('/', requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Please pick a type and write a short message.' })

  const { type, message, page } = parsed.data
  const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 400)

  const { error } = await supabase.from('feedback').insert({
    user_id: req.appUserId ?? null,
    type,
    message,
    page: page ?? null,
    user_agent: userAgent || null,
  })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ ok: true })
})
