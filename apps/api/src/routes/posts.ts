import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

export const postsRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

const POST_IMAGES_BUCKET = 'post-images'

async function ensurePostBucket() {
  const buckets = await supabase.storage.listBuckets()
  if (buckets.error) throw new Error(buckets.error.message)
  if (!buckets.data.find((b) => b.name === POST_IMAGES_BUCKET)) {
    const create = await supabase.storage.createBucket(POST_IMAGES_BUCKET, {
      public: true, // images are public-readable; auth still required to upload via API
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    })
    if (create.error) throw new Error(create.error.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
type PostRow = {
  id: string
  author_id: string
  channel_id: string | null
  title: string | null
  body: string
  image_url: string | null
  link_url: string | null
  upvote_count: number
  comment_count: number
  created_at: string
}

async function hydratePosts(rows: PostRow[], viewerId: string) {
  if (!rows.length) return []
  const postIds = rows.map((p) => p.id)
  const authorIds = [...new Set(rows.map((p) => p.author_id))]
  const channelIds = [...new Set(rows.map((p) => p.channel_id).filter(Boolean) as string[])]

  const [authors, channels, myVotes, allReactions] = await Promise.all([
    supabase.from('users').select('id, full_name, username, avatar_url').in('id', authorIds),
    channelIds.length
      ? supabase.from('channels').select('id, slug, name').in('id', channelIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('post_votes').select('post_id, value').in('post_id', postIds).eq('user_id', viewerId),
    supabase.from('post_reactions').select('post_id, user_id, emoji').in('post_id', postIds),
  ])

  if (authors.error) throw new Error(authors.error.message)
  if ((channels as { error: { message: string } | null }).error) throw new Error((channels as { error: { message: string } }).error.message)
  if (myVotes.error) throw new Error(myVotes.error.message)
  if (allReactions.error) throw new Error(allReactions.error.message)

  const authorById = new Map((authors.data ?? []).map((a) => [a.id, a]))
  const channelById = new Map(((channels.data ?? []) as Array<{ id: string }>).map((c) => [c.id, c]))
  const myVoteByPost = new Map((myVotes.data ?? []).map((v) => [v.post_id, v.value]))

  // Aggregate reactions: { post_id: { emoji: { count, mine } } }
  const reactionsByPost = new Map<string, Record<string, { count: number; mine: boolean }>>()
  for (const r of (allReactions.data ?? [])) {
    const map = reactionsByPost.get(r.post_id) ?? {}
    if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
    map[r.emoji].count += 1
    if (r.user_id === viewerId) map[r.emoji].mine = true
    reactionsByPost.set(r.post_id, map)
  }

  return rows.map((p) => ({
    ...p,
    author: authorById.get(p.author_id) ?? null,
    channel: p.channel_id ? channelById.get(p.channel_id) ?? null : null,
    my_vote: myVoteByPost.get(p.id) ?? 0,
    reactions: reactionsByPost.get(p.id) ?? {},
  }))
}

// ── Feed ──────────────────────────────────────────────────────────────────
const feedQuerySchema = z.object({
  channel: z.string().optional(),
  scope: z.enum(['global', 'channel', 'joined', 'me', 'all']).optional().default('global'),
  sort: z.enum(['new', 'hot']).optional().default('new'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional(),
})

postsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const parsed = feedQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid query', fields: parsed.error.flatten() })

  let query = supabase
    .from('posts')
    .select('id, author_id, channel_id, title, body, image_url, link_url, upvote_count, comment_count, created_at')
    .limit(parsed.data.limit)

  if (parsed.data.scope === 'channel' && parsed.data.channel) {
    const ch = await supabase.from('channels').select('id').eq('slug', parsed.data.channel).maybeSingle()
    if (ch.error) return res.status(500).json({ error: ch.error.message })
    if (!ch.data) return res.status(404).json({ error: 'Channel not found' })
    query = query.eq('channel_id', ch.data.id)
  } else if (parsed.data.scope === 'global') {
    query = query.is('channel_id', null)
  } else if (parsed.data.scope === 'all') {
    // No channel filter — every post the viewer can see
  } else if (parsed.data.scope === 'joined') {
    const memberships = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', req.appUserId)
    if (memberships.error) return res.status(500).json({ error: memberships.error.message })
    const ids = (memberships.data ?? []).map((m) => m.channel_id)
    if (!ids.length) return res.json({ posts: [] })
    query = query.in('channel_id', ids)
  } else if (parsed.data.scope === 'me') {
    query = query.eq('author_id', req.appUserId)
  }

  if (parsed.data.before) query = query.lt('created_at', parsed.data.before)

  if (parsed.data.sort === 'hot') {
    query = query.order('upvote_count', { ascending: false }).order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const result = await query
  if (result.error) return res.status(500).json({ error: result.error.message })

  try {
    const posts = await hydratePosts((result.data ?? []) as PostRow[], req.appUserId)
    return res.json({ posts })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Hydration failed' })
  }
})

// ── Single post ───────────────────────────────────────────────────────────
postsRouter.get('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const result = await supabase
    .from('posts')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()
  if (result.error) return res.status(500).json({ error: result.error.message })
  if (!result.data) return res.status(404).json({ error: 'Post not found' })
  const [hydrated] = await hydratePosts([result.data as PostRow], req.appUserId)
  return res.json({ post: hydrated })
})

// ── Create post (with optional image upload) ──────────────────────────────
const createBodySchema = z.object({
  channelSlug: z.string().optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  body: z.string().min(1).max(4000),
  linkUrl: z.string().url().max(2048).optional().nullable(),
})

postsRouter.post('/', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })

  // Parse body. Multer stuffs text fields into req.body as strings.
  const raw: Record<string, unknown> = {
    channelSlug: req.body.channelSlug || null,
    title: req.body.title || null,
    body: req.body.body || '',
    linkUrl: req.body.linkUrl || null,
  }
  const parsed = createBodySchema.safeParse(raw)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  let channelId: string | null = null
  if (parsed.data.channelSlug) {
    const ch = await supabase.from('channels').select('id').eq('slug', parsed.data.channelSlug).maybeSingle()
    if (ch.error) return res.status(500).json({ error: ch.error.message })
    if (!ch.data) return res.status(404).json({ error: 'Channel not found' })
    channelId = ch.data.id
  }

  let imageUrl: string | null = null
  if (req.file) {
    try {
      await ensurePostBucket()
      const ext = (req.file.mimetype.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '') || 'png'
      const path = `${req.appUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const upl = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })
      if (upl.error) return res.status(500).json({ error: `Image upload failed: ${upl.error.message}` })
      const pub = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path)
      imageUrl = pub.data.publicUrl
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Image upload failed' })
    }
  }

  const insert = await supabase
    .from('posts')
    .insert({
      author_id: req.appUserId,
      channel_id: channelId,
      title: parsed.data.title,
      body: parsed.data.body,
      image_url: imageUrl,
      link_url: parsed.data.linkUrl,
    })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })

  const [hydrated] = await hydratePosts([insert.data as PostRow], req.appUserId)
  return res.status(201).json({ post: hydrated })
})

// ── Delete (own posts only) ───────────────────────────────────────────────
postsRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const del = await supabase
    .from('posts')
    .delete()
    .eq('id', req.params.id)
    .eq('author_id', req.appUserId)
  if (del.error) return res.status(500).json({ error: del.error.message })
  return res.json({ ok: true })
})

// ── Vote (toggle upvote) ──────────────────────────────────────────────────
postsRouter.post('/:id/vote', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const wantValue = req.body?.value === -1 ? -1 : 1

  // Check current state
  const existing = await supabase
    .from('post_votes')
    .select('value')
    .eq('post_id', req.params.id)
    .eq('user_id', req.appUserId)
    .maybeSingle()
  if (existing.error) return res.status(500).json({ error: existing.error.message })

  if (!existing.data) {
    const insert = await supabase
      .from('post_votes')
      .insert({ post_id: req.params.id, user_id: req.appUserId, value: wantValue })
    if (insert.error) return res.status(500).json({ error: insert.error.message })
    return res.json({ my_vote: wantValue })
  }

  if (existing.data.value === wantValue) {
    // Same vote → toggle off
    const del = await supabase
      .from('post_votes')
      .delete()
      .eq('post_id', req.params.id)
      .eq('user_id', req.appUserId)
    if (del.error) return res.status(500).json({ error: del.error.message })
    return res.json({ my_vote: 0 })
  }

  // Switch direction
  const upd = await supabase
    .from('post_votes')
    .update({ value: wantValue })
    .eq('post_id', req.params.id)
    .eq('user_id', req.appUserId)
  if (upd.error) return res.status(500).json({ error: upd.error.message })
  return res.json({ my_vote: wantValue })
})

// ── React (toggle emoji) ──────────────────────────────────────────────────
const reactSchema = z.object({ emoji: z.string().min(1).max(16) })

postsRouter.post('/:id/react', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const parsed = reactSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid emoji' })

  const existing = await supabase
    .from('post_reactions')
    .select('id')
    .eq('post_id', req.params.id)
    .eq('user_id', req.appUserId)
    .eq('emoji', parsed.data.emoji)
    .maybeSingle()
  if (existing.error) return res.status(500).json({ error: existing.error.message })

  if (existing.data) {
    const del = await supabase.from('post_reactions').delete().eq('id', existing.data.id)
    if (del.error) return res.status(500).json({ error: del.error.message })
    return res.json({ mine: false })
  }

  const insert = await supabase
    .from('post_reactions')
    .insert({ post_id: req.params.id, user_id: req.appUserId, emoji: parsed.data.emoji })
  if (insert.error) return res.status(500).json({ error: insert.error.message })
  return res.json({ mine: true })
})

// ── Comments ──────────────────────────────────────────────────────────────
type CommentRow = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
}

postsRouter.get('/:id/comments', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const result = await supabase
    .from('post_comments')
    .select('id, post_id, parent_id, author_id, body, created_at')
    .eq('post_id', req.params.id)
    .order('created_at', { ascending: true })
    .limit(500)
  if (result.error) return res.status(500).json({ error: result.error.message })

  const rows = (result.data ?? []) as CommentRow[]
  if (!rows.length) return res.json({ comments: [] })

  const authorIds = [...new Set(rows.map((c) => c.author_id))]
  const authors = await supabase.from('users').select('id, full_name, username, avatar_url').in('id', authorIds)
  if (authors.error) return res.status(500).json({ error: authors.error.message })
  const byId = new Map((authors.data ?? []).map((u) => [u.id, u]))

  return res.json({ comments: rows.map((r) => ({ ...r, author: byId.get(r.author_id) ?? null })) })
})

const commentSchema = z.object({
  body: z.string().min(1).max(1500),
  parentId: z.string().uuid().optional().nullable(),
})

postsRouter.post('/:id/comments', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })

  const insert = await supabase
    .from('post_comments')
    .insert({
      post_id: req.params.id,
      parent_id: parsed.data.parentId ?? null,
      author_id: req.appUserId,
      body: parsed.data.body,
    })
    .select('*')
    .single()
  if (insert.error) return res.status(500).json({ error: insert.error.message })

  const author = await supabase.from('users').select('id, full_name, username, avatar_url').eq('id', req.appUserId).maybeSingle()
  return res.status(201).json({ comment: { ...insert.data, author: author.data ?? null } })
})

postsRouter.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  const del = await supabase
    .from('post_comments')
    .delete()
    .eq('id', req.params.commentId)
    .eq('post_id', req.params.id)
    .eq('author_id', req.appUserId)
  if (del.error) return res.status(500).json({ error: del.error.message })
  return res.json({ ok: true })
})
