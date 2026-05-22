import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const channelsRouter = Router()

// ── List channels ─────────────────────────────────────────────────────────
channelsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })

  const channels = await supabase
    .from('channels')
    .select('id, slug, name, description, cover_url, is_public, member_count, post_count, created_at')
    .order('member_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (channels.error) return res.status(500).json({ error: channels.error.message })

  // Mark which I'm a member of
  const myMemberships = await supabase
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', req.appUserId)
  if (myMemberships.error) return res.status(500).json({ error: myMemberships.error.message })

  const joinedSet = new Set((myMemberships.data ?? []).map((m) => m.channel_id))
  return res.json({
    channels: (channels.data ?? []).map((c) => ({ ...c, is_joined: joinedSet.has(c.id) })),
  })
})

// ── Get one channel ───────────────────────────────────────────────────────
channelsRouter.get('/:slug', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })

  const channel = await supabase
    .from('channels')
    .select('*')
    .eq('slug', req.params.slug)
    .maybeSingle()
  if (channel.error) return res.status(500).json({ error: channel.error.message })
  if (!channel.data) return res.status(404).json({ error: 'Channel not found' })

  const membership = await supabase
    .from('channel_members')
    .select('role')
    .eq('channel_id', channel.data.id)
    .eq('user_id', req.appUserId)
    .maybeSingle()
  if (membership.error) return res.status(500).json({ error: membership.error.message })

  return res.json({ channel: { ...channel.data, is_joined: Boolean(membership.data), my_role: membership.data?.role ?? null } })
})

// ── Create channel ────────────────────────────────────────────────────────
const createChannelSchema = z.object({
  slug: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/, 'lowercase letters/digits/hyphens only'),
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional(),
  isPublic: z.boolean().optional(),
})

channelsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const parsed = createChannelSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const insert = await supabase
    .from('channels')
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_public: parsed.data.isPublic ?? true,
      created_by: req.appUserId,
    })
    .select('*')
    .single()
  if (insert.error) {
    if (insert.error.code === '23505') return res.status(409).json({ error: 'Slug already taken' })
    return res.status(500).json({ error: insert.error.message })
  }

  // Auto-add creator as owner
  await supabase.from('channel_members').insert({
    channel_id: insert.data.id,
    user_id: req.appUserId,
    role: 'owner',
  })

  return res.status(201).json({ channel: insert.data })
})

// ── Join / leave ──────────────────────────────────────────────────────────
channelsRouter.post('/:slug/join', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const channel = await supabase.from('channels').select('id').eq('slug', req.params.slug).maybeSingle()
  if (channel.error) return res.status(500).json({ error: channel.error.message })
  if (!channel.data) return res.status(404).json({ error: 'Channel not found' })

  const insert = await supabase
    .from('channel_members')
    .insert({ channel_id: channel.data.id, user_id: req.appUserId, role: 'member' })
    .select('*')
    .single()
  if (insert.error) {
    if (insert.error.code === '23505') return res.json({ joined: true, alreadyJoined: true })
    return res.status(500).json({ error: insert.error.message })
  }
  return res.status(201).json({ joined: true, member: insert.data })
})

channelsRouter.post('/:slug/leave', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const channel = await supabase.from('channels').select('id').eq('slug', req.params.slug).maybeSingle()
  if (channel.error) return res.status(500).json({ error: channel.error.message })
  if (!channel.data) return res.status(404).json({ error: 'Channel not found' })

  const del = await supabase
    .from('channel_members')
    .delete()
    .eq('channel_id', channel.data.id)
    .eq('user_id', req.appUserId)
  if (del.error) return res.status(500).json({ error: del.error.message })
  return res.json({ joined: false })
})
