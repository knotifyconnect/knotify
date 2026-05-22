/**
 * knotify · Pulse — the social feed.
 *
 * Reddit-meets-Instagram: rich posts with image upload, upvotes, emoji reactions,
 * Instagram-flat comments with one reply level, public global feed plus channels.
 *
 * Layout:
 *  - Left rail: channel selector (All / Following / + my channels / Browse)
 *  - Center: composer + feed
 *  - Right rail: trending channels + create-channel CTA
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowBigUp, Hash, Image as ImageIcon, MessageCircle, Plus, Send, X } from 'lucide-react'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '@/lib/knotify'
import { apiDelete, apiGet, apiPost, apiPostForm } from '@/lib/api'

type UserPreview = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
}

type Channel = {
  id: string
  slug: string
  name: string
  description: string | null
  cover_url: string | null
  is_public: boolean
  member_count: number
  post_count: number
  is_joined?: boolean
}

type ReactionMap = Record<string, { count: number; mine: boolean }>

type Post = {
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
  author: UserPreview | null
  channel: { id: string; slug: string; name: string } | null
  my_vote: number
  reactions: ReactionMap
}

type Comment = {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  body: string
  created_at: string
  author: UserPreview | null
}

type Scope = { kind: 'global' } | { kind: 'channel'; slug: string } | { kind: 'joined' } | { kind: 'me' }

const QUICK_REACTIONS = ['❤️', '🔥', '👏', '🎉', '😂', '🤔']

const LINKEDIN_REACTIONS = [
  { emoji: '👍', label: 'Like',       color: 'var(--signal)' },
  { emoji: '💡', label: 'Insightful', color: 'var(--ochre)'  },
  { emoji: '🤝', label: 'Support',    color: 'var(--verd)'   },
] as const

type OgMeta = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

// ─── Page ───────────────────────────────────────────────────────────────────
export function HomePage() {
  const [scope, setScope] = useState<Scope>({ kind: 'global' })
  const [sort, setSort] = useState<'new' | 'hot'>('new')
  const [posts, setPosts] = useState<Post[]>([])
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [createChannelOpen, setCreateChannelOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  function buildParams(extra?: Record<string, string>) {
    const params = new URLSearchParams()
    params.set('sort', sort)
    params.set('limit', '20')
    if (scope.kind === 'channel') {
      params.set('scope', 'channel')
      params.set('channel', scope.slug)
    } else {
      params.set('scope', scope.kind)
    }
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v))
    return params
  }

  const reload = useCallback(async () => {
    setLoadingFeed(true)
    setHasMore(true)
    setBeforeCursor(null)
    setError(null)
    try {
      const data = await apiGet<{ posts: Post[] }>(`/api/posts?${buildParams().toString()}`)
      const fetched = data.posts ?? []
      setPosts(fetched)
      if (fetched.length < 20) setHasMore(false)
      else setBeforeCursor(fetched[fetched.length - 1].created_at)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading feed')
    } finally {
      setLoadingFeed(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, sort])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingFeed || loadingMore || !beforeCursor) return
    setLoadingMore(true)
    try {
      const data = await apiGet<{ posts: Post[] }>(`/api/posts?${buildParams({ before: beforeCursor }).toString()}`)
      const fetched = data.posts ?? []
      setPosts((prev) => [...prev, ...fetched])
      if (fetched.length < 20) setHasMore(false)
      else setBeforeCursor(fetched[fetched.length - 1].created_at)
    } catch {
      // silently ignore load-more errors
    } finally {
      setLoadingMore(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingFeed, loadingMore, beforeCursor, scope, sort])

  useEffect(() => { void reload() }, [reload])

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) void loadMore() },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, hasMore])

  useEffect(() => {
    apiGet<{ channels: Channel[] }>('/api/channels')
      .then((d) => setChannels(d.channels ?? []))
      .catch(() => setChannels([]))
  }, [])

  const joinedChannels = useMemo(() => channels.filter((c) => c.is_joined), [channels])
  const trendingChannels = useMemo(
    () => [...channels].sort((a, b) => b.member_count - a.member_count).slice(0, 6),
    [channels]
  )

  const activeChannelSlug = scope.kind === 'channel' ? scope.slug : null

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
          knotify · pulse
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(26px, 3vw, 38px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            margin: '0 0 4px',
          }}
        >
          The pulse of <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>your knot.</span>
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
          Share what you're building, ask questions, react, and connect over real things.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* ── Mobile-only: scope strip (replaces left rail) ────────────── */}
      <MobileScopeStrip
        scope={scope}
        setScope={setScope}
        joinedChannels={joinedChannels}
        onCreate={() => setCreateChannelOpen(true)}
      />

      {/* ── Three-column layout (desktop only — rails hidden on mobile) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr_240px]">
        {/* Left rail: channel nav (desktop only) */}
        <div className="hidden lg:block">
          <ChannelRail
            scope={scope}
            setScope={setScope}
            joinedChannels={joinedChannels}
            allChannels={channels}
            onCreate={() => setCreateChannelOpen(true)}
            onChannelsChange={setChannels}
          />
        </div>

        {/* Middle: composer + feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Composer
            channels={channels}
            currentChannelSlug={activeChannelSlug}
            onPosted={() => void reload()}
          />

          {/* Sort tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
            {(['new', 'hot'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: sort === s ? 'none' : '0.5px solid var(--rule)',
                  background: sort === s ? 'var(--ink)' : 'transparent',
                  color: sort === s ? 'var(--paper)' : 'var(--ink-muted)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {posts.length} post{posts.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Feed */}
          {loadingFeed && !posts.length ? (
            <KCard style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-muted)' }}>Loading the pulse…</p>
            </KCard>
          ) : posts.length === 0 ? (
            <KCard style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-muted)', margin: 0 }}>
                {scope.kind === 'me'
                  ? "You haven't posted yet."
                  : scope.kind === 'joined'
                  ? 'Join a channel to see posts here.'
                  : 'No posts yet — be the first.'}
              </p>
            </KCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map((p) => (
                <PostCard key={p.id} post={p} onChange={(next) => setPosts((prev) => prev.map((x) => (x.id === next.id ? next : x)))} onDelete={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
              ))}
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />
              {loadingMore && (
                <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>
                  Loading more…
                </div>
              )}
              {!hasMore && posts.length > 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  · end of feed ·
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail: trending (desktop only) */}
        <div className="hidden lg:block">
          <TrendingRail
            channels={trendingChannels}
            onPick={(slug) => setScope({ kind: 'channel', slug })}
          />
        </div>
      </div>

      {createChannelOpen && (
        <CreateChannelModal
          onClose={() => setCreateChannelOpen(false)}
          onCreated={(c) => {
            setChannels((prev) => [{ ...c, is_joined: true }, ...prev])
            setScope({ kind: 'channel', slug: c.slug })
            setCreateChannelOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Channel rail ──────────────────────────────────────────────────────────
// ─── Mobile scope strip — horizontal chips above the feed ─────────────────
function MobileScopeStrip({
  scope,
  setScope,
  joinedChannels,
  onCreate,
}: {
  scope: Scope
  setScope: (s: Scope) => void
  joinedChannels: Channel[]
  onCreate: () => void
}) {
  const isActive = (s: Scope) => JSON.stringify(s) === JSON.stringify(scope)
  const chip = (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? 'none' : '0.5px solid var(--rule)',
    background: active ? 'var(--ink)' : 'transparent',
    color: active ? 'var(--paper)' : 'var(--ink-muted)',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })
  return (
    <div className="flex lg:hidden" style={{ gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4, marginBottom: 12 }}>
      <button type="button" onClick={() => setScope({ kind: 'global' })} style={chip(isActive({ kind: 'global' }))}>Public</button>
      <button type="button" onClick={() => setScope({ kind: 'joined' })} style={chip(isActive({ kind: 'joined' }))}>My channels</button>
      <button type="button" onClick={() => setScope({ kind: 'me' })} style={chip(isActive({ kind: 'me' }))}>My posts</button>
      {joinedChannels.map((c) => (
        <button key={c.id} type="button" onClick={() => setScope({ kind: 'channel', slug: c.slug })} style={chip(scope.kind === 'channel' && scope.slug === c.slug)}>
          #{c.slug}
        </button>
      ))}
      <button type="button" onClick={onCreate} style={{ ...chip(false), color: 'var(--signal)' }}>+ New</button>
    </div>
  )
}

function ChannelRail({
  scope,
  setScope,
  joinedChannels,
  allChannels,
  onCreate,
  onChannelsChange,
}: {
  scope: Scope
  setScope: (s: Scope) => void
  joinedChannels: Channel[]
  allChannels: Channel[]
  onCreate: () => void
  onChannelsChange: (channels: Channel[]) => void
}) {
  const isActive = (s: Scope) => JSON.stringify(s) === JSON.stringify(scope)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const unjoinedChannels = allChannels.filter((c) => !c.is_joined)

  async function toggleJoin(c: Channel) {
    setJoiningId(c.id)
    try {
      if (c.is_joined) {
        await apiDelete(`/api/channels/${c.id}/join`)
        onChannelsChange(allChannels.map((ch) => ch.id === c.id ? { ...ch, is_joined: false, member_count: ch.member_count - 1 } : ch))
      } else {
        await apiPost(`/api/channels/${c.id}/join`, {})
        onChannelsChange(allChannels.map((ch) => ch.id === c.id ? { ...ch, is_joined: true, member_count: ch.member_count + 1 } : ch))
      }
    } catch { /* ignore */ }
    finally { setJoiningId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Top picks */}
      {([
        { label: 'Public feed', s: { kind: 'global' as const } },
        { label: 'My channels', s: { kind: 'joined' as const } },
        { label: 'My posts', s: { kind: 'me' as const } },
      ]).map(({ label, s }) => (
        <button
          key={label}
          type="button"
          onClick={() => setScope(s)}
          style={railBtnStyle(isActive(s))}
        >
          {label}
        </button>
      ))}

      <div style={{ height: 14 }} />

      <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', padding: '0 12px 6px' }}>
        Joined
      </div>
      {joinedChannels.length === 0 ? (
        <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
          No channels yet.
        </div>
      ) : (
        joinedChannels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setScope({ kind: 'channel', slug: c.slug })}
            style={railBtnStyle(scope.kind === 'channel' && scope.slug === c.slug)}
          >
            <Hash size={12} style={{ marginRight: 6, opacity: 0.6 }} />
            {c.name}
          </button>
        ))
      )}

      <div style={{ height: 14 }} />
      <button
        type="button"
        onClick={onCreate}
        style={{ ...railBtnStyle(false), color: 'var(--signal)', fontWeight: 500 }}
      >
        <Plus size={13} style={{ marginRight: 6 }} />
        New channel
      </button>
      <button
        type="button"
        onClick={() => setBrowseOpen((v) => !v)}
        style={railBtnStyle(false)}
      >
        {browseOpen ? 'Show less ↑' : 'Browse all ↓'}
      </button>

      {/* Inline channel browser */}
      {browseOpen && (
        <div style={{ marginTop: 6, borderTop: '0.5px solid var(--rule)', paddingTop: 8 }}>
          {unjoinedChannels.length === 0 ? (
            <div style={{ padding: '4px 12px', fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
              You've joined all channels.
            </div>
          ) : (
            unjoinedChannels.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 9 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--paper-soft)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <Hash size={11} color="var(--ink-muted)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{c.member_count} members</div>
                </div>
                <button
                  type="button"
                  disabled={joiningId === c.id}
                  onClick={() => toggleJoin(c)}
                  style={{
                    flexShrink: 0,
                    padding: '4px 9px',
                    borderRadius: 999,
                    border: '0.5px solid var(--signal)',
                    background: 'transparent',
                    color: 'var(--signal)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  {joiningId === c.id ? '…' : 'Join'}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function railBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 9,
    border: 'none',
    background: active ? 'var(--ink)' : 'transparent',
    color: active ? 'var(--paper)' : 'var(--ink)',
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  }
}

// ─── Trending rail ─────────────────────────────────────────────────────────
function TrendingRail({ channels, onPick }: { channels: Channel[]; onPick: (slug: string) => void }) {
  if (!channels.length) return <div />
  return (
    <KCard style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
        Trending channels
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.slug)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-soft)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <Hash size={13} color="var(--ink-muted)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
                {c.member_count} {c.member_count === 1 ? 'member' : 'members'} · {c.post_count} posts
              </div>
            </div>
          </button>
        ))}
      </div>
    </KCard>
  )
}

// ─── Composer ──────────────────────────────────────────────────────────────
function Composer({
  channels,
  currentChannelSlug,
  onPosted,
}: {
  channels: Channel[]
  currentChannelSlug: string | null
  onPosted: () => void
}) {
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [channelSlug, setChannelSlug] = useState<string>(currentChannelSlug ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // OG preview
  const [ogMeta, setOgMeta] = useState<OgMeta | null>(null)
  const [ogLoading, setOgLoading] = useState(false)
  const [ogDismissed, setOgDismissed] = useState(false)
  const ogFetchedUrl = useRef<string | null>(null)

  useEffect(() => {
    setChannelSlug(currentChannelSlug ?? '')
  }, [currentChannelSlug])

  // Detect URL in body and fetch OG preview
  useEffect(() => {
    const match = body.match(/https?:\/\/[^\s]{5,}/)
    const url = match ? match[0] : null
    if (!url || ogDismissed || url === ogFetchedUrl.current) return
    const timer = setTimeout(async () => {
      ogFetchedUrl.current = url
      setOgLoading(true)
      try {
        const data = await apiGet<OgMeta>(`/api/og/fetch?url=${encodeURIComponent(url)}`)
        if (data.title || data.description || data.image) {
          setOgMeta(data)
          setOgDismissed(false)
        }
      } catch { /* ignore */ }
      finally { setOgLoading(false) }
    }, 700)
    return () => clearTimeout(timer)
  }, [body, ogDismissed])

  function pickImage(file: File) {
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setErr('Image must be ≤ 5 MB'); return }
    setErr(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function submit() {
    if (!body.trim() && !imageFile) { setErr('Write something or attach an image'); return }
    setSubmitting(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('body', body.trim())
      if (showTitle && title.trim()) fd.append('title', title.trim())
      if (channelSlug) fd.append('channelSlug', channelSlug)
      if (imageFile) fd.append('image', imageFile)
      if (ogMeta?.url) fd.append('linkUrl', ogMeta.url)
      await apiPostForm('/api/posts', fd)
      setBody('')
      setTitle('')
      setShowTitle(false)
      setOgMeta(null)
      setOgDismissed(false)
      ogFetchedUrl.current = null
      clearImage()
      onPosted()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed posting')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KCard style={{ padding: '14px 16px' }}>
      {showTitle && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="Title (optional)"
          style={{
            width: '100%',
            padding: '8px 11px',
            borderRadius: 9,
            border: '0.5px solid var(--rule)',
            background: 'var(--paper-soft)',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "'IBM Plex Sans', sans-serif",
            color: 'var(--ink)',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 8,
          }}
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 4000))}
        placeholder="Share an update, ask a question, post a project…"
        rows={3}
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: 9,
          border: '0.5px solid var(--rule)',
          background: 'var(--paper-soft)',
          fontSize: 13.5,
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: 'var(--ink)',
          outline: 'none',
          boxSizing: 'border-box',
          resize: 'vertical',
          lineHeight: 1.5,
        }}
      />
      {imagePreview && (
        <div style={{ marginTop: 10, position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img src={imagePreview} alt="" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 10, display: 'block' }} />
          <button
            type="button"
            onClick={clearImage}
            style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(26,24,21,0.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* OG link preview */}
      {ogLoading && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>
          Fetching link preview…
        </div>
      )}
      {!ogLoading && ogMeta && !ogDismissed && (
        <div
          style={{
            marginTop: 10,
            borderRadius: 10,
            border: '0.5px solid var(--rule)',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--paper-soft)',
          }}
        >
          <button
            type="button"
            onClick={() => { setOgDismissed(true); setOgMeta(null) }}
            style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(26,24,21,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
          >
            <X size={10} />
          </button>
          <div style={{ display: 'flex', gap: 0 }}>
            {ogMeta.image && (
              <img
                src={ogMeta.image}
                alt=""
                style={{ width: 80, height: 80, objectFit: 'cover', flexShrink: 0 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div style={{ padding: '10px 12px', minWidth: 0 }}>
              {ogMeta.site_name && (
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  {ogMeta.site_name}
                </div>
              )}
              {ogMeta.title && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {ogMeta.title}
                </div>
              )}
              {ogMeta.description && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {ogMeta.description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--signal)' }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          style={composerBtnStyle()}
          title="Attach image"
        >
          <ImageIcon size={13} />
          Image
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImage(f) }}
        />
        <button type="button" onClick={() => setShowTitle((v) => !v)} style={composerBtnStyle()}>
          {showTitle ? '— Title' : '+ Title'}
        </button>
        <select
          value={channelSlug}
          onChange={(e) => setChannelSlug(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: '0.5px solid var(--rule)',
            background: 'var(--paper-soft)',
            fontSize: 12,
            color: 'var(--ink)',
            fontFamily: "'IBM Plex Sans', sans-serif",
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">Public feed</option>
          {channels.map((c) => (
            <option key={c.id} value={c.slug}>#{c.slug}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {body.length}/4000
        </span>
        <KBtn variant="signal" size="sm" onClick={submit} disabled={submitting || (!body.trim() && !imageFile)}>
          {submitting ? 'Posting…' : <><Send size={11} style={{ marginRight: 4 }} />Post</>}
        </KBtn>
      </div>
    </KCard>
  )
}

function composerBtnStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 11px',
    borderRadius: 999,
    border: '0.5px solid var(--rule)',
    background: 'transparent',
    color: 'var(--ink-muted)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'IBM Plex Sans', sans-serif",
  }
}

// ─── Post card ─────────────────────────────────────────────────────────────
function PostCard({
  post,
  onChange,
  onDelete,
}: {
  post: Post
  onChange: (p: Post) => void
  onDelete: (id: string) => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showLinkedInPicker, setShowLinkedInPicker] = useState(false)
  const liReactionHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function vote() {
    const wantValue = post.my_vote === 1 ? 1 : 1 // tap = upvote (toggle)
    const optimisticVote = post.my_vote === 1 ? 0 : 1
    const optimisticDelta = optimisticVote - post.my_vote
    onChange({ ...post, my_vote: optimisticVote, upvote_count: post.upvote_count + optimisticDelta })
    try {
      const res = await apiPost<{ my_vote: number }>(`/api/posts/${post.id}/vote`, { value: wantValue })
      // Sync exact server count by reloading single post
      try {
        const fresh = await apiGet<{ post: Post }>(`/api/posts/${post.id}`)
        onChange(fresh.post)
      } catch {
        onChange({ ...post, my_vote: res.my_vote })
      }
    } catch {
      // revert
      onChange(post)
    }
  }

  async function react(emoji: string) {
    setShowEmojiPicker(false)
    const cur = post.reactions[emoji]
    const optimistic: ReactionMap = { ...post.reactions }
    if (cur?.mine) {
      const nextCount = cur.count - 1
      if (nextCount <= 0) delete optimistic[emoji]
      else optimistic[emoji] = { count: nextCount, mine: false }
    } else {
      optimistic[emoji] = { count: (cur?.count ?? 0) + 1, mine: true }
    }
    onChange({ ...post, reactions: optimistic })
    try {
      await apiPost(`/api/posts/${post.id}/react`, { emoji })
    } catch {
      onChange(post) // revert
    }
  }

  async function remove() {
    if (!confirm('Delete this post?')) return
    try {
      await apiDelete(`/api/posts/${post.id}`)
      onDelete(post.id)
    } catch {
      // ignore
    }
  }

  const reactionEntries = Object.entries(post.reactions)

  return (
    <KCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
        <KAvatar name={post.author?.full_name ?? '?'} src={post.author?.avatar_url ?? null} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.author?.full_name ?? 'Unknown'}
            </span>
            <VerifiedBadge size={12} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
            @{post.author?.username ?? '—'} · {relTime(post.created_at)}
            {post.channel && (
              <> · <span style={{ color: 'var(--signal)' }}>#{post.channel.slug}</span></>
            )}
          </div>
        </div>
      </div>

      {/* Title (if any) */}
      {post.title && (
        <div style={{ padding: '0 16px 6px', fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: -0.2, lineHeight: 1.2 }}>
          {post.title}
        </div>
      )}

      {/* Body */}
      {post.body && (
        <div style={{ padding: '0 16px 12px', fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {post.body}
        </div>
      )}

      {/* Image */}
      {post.image_url && (
        <div style={{ background: 'var(--paper-soft)' }}>
          <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: 520, objectFit: 'contain', display: 'block' }} />
        </div>
      )}

      {/* Reactions strip */}
      {reactionEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 0' }}>
          {reactionEntries
            .sort((a, b) => b[1].count - a[1].count)
            .map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 9px',
                  borderRadius: 999,
                  border: mine ? '0.5px solid var(--signal)' : '0.5px solid var(--rule)',
                  background: mine ? 'var(--signal-soft)' : 'var(--paper-soft)',
                  fontSize: 12,
                  color: mine ? 'var(--signal-deep)' : 'var(--ink)',
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                <span>{emoji}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{count}</span>
              </button>
            ))}
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 12px', borderTop: '0.5px solid var(--rule-soft)', marginTop: 10 }}>
        {/* LinkedIn-style reaction button */}
        {(() => {
          const myLiReaction = LINKEDIN_REACTIONS.find((r) => post.reactions[r.emoji]?.mine)
          const totalLiCount = LINKEDIN_REACTIONS.reduce((sum, r) => sum + (post.reactions[r.emoji]?.count ?? 0), 0)
          return (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => {
                if (liReactionHoverTimer.current) clearTimeout(liReactionHoverTimer.current)
                liReactionHoverTimer.current = setTimeout(() => setShowLinkedInPicker(true), 350)
              }}
              onMouseLeave={() => {
                if (liReactionHoverTimer.current) clearTimeout(liReactionHoverTimer.current)
                liReactionHoverTimer.current = setTimeout(() => setShowLinkedInPicker(false), 200)
              }}
            >
              <button
                type="button"
                onClick={() => myLiReaction ? react(myLiReaction.emoji) : react('👍')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  borderRadius: 999,
                  border: 'none',
                  background: myLiReaction ? 'var(--signal-soft)' : 'transparent',
                  color: myLiReaction ? (myLiReaction.color) : 'var(--ink-muted)',
                  fontSize: 12.5,
                  fontWeight: myLiReaction ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>{myLiReaction ? myLiReaction.emoji : '👍'}</span>
                <span style={{ fontWeight: 500 }}>{myLiReaction ? myLiReaction.label : 'Like'}</span>
                {totalLiCount > 0 && (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, opacity: 0.7, marginLeft: 2 }}>
                    {totalLiCount}
                  </span>
                )}
              </button>

              {showLinkedInPicker && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    display: 'flex',
                    gap: 4,
                    padding: '8px 10px',
                    borderRadius: 999,
                    background: 'var(--paper)',
                    border: '0.5px solid var(--rule)',
                    boxShadow: '0 4px 20px rgba(26,24,21,0.14)',
                    zIndex: 10,
                    animation: 'fadeUp 0.12s ease-out',
                  }}
                >
                  {LINKEDIN_REACTIONS.map((r) => {
                    const active = post.reactions[r.emoji]?.mine
                    return (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => { react(r.emoji); setShowLinkedInPicker(false) }}
                        title={r.label}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                          padding: '4px 6px',
                          borderRadius: 8,
                          border: 'none',
                          background: active ? 'var(--paper-soft)' : 'transparent',
                          cursor: 'pointer',
                          transform: active ? 'scale(1.2)' : 'scale(1)',
                          transition: 'transform 0.1s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.3)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = active ? 'scale(1.2)' : 'scale(1)' }}
                      >
                        <span style={{ fontSize: 22 }}>{r.emoji}</span>
                        <span style={{ fontSize: 9, color: active ? r.color : 'var(--ink-faint)', fontWeight: 500, fontFamily: "'IBM Plex Sans'" }}>{r.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Add reaction */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            style={{ padding: '5px 10px', borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink-muted)', fontSize: 14, cursor: 'pointer' }}
            title="React"
          >
            😊
          </button>
          {showEmojiPicker && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                display: 'flex',
                gap: 2,
                padding: 6,
                borderRadius: 999,
                background: 'var(--paper)',
                border: '0.5px solid var(--rule)',
                boxShadow: '0 4px 16px rgba(26,24,21,0.12)',
                zIndex: 10,
              }}
            >
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => react(e)}
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
                  onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = 'var(--paper-soft)' }}
                  onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            borderRadius: 999,
            border: 'none',
            background: showComments ? 'var(--paper-deep)' : 'transparent',
            color: 'var(--ink-muted)',
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          <MessageCircle size={13} />
          <span>{post.comment_count}</span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Delete (own only — best-effort: server will 404 if not author) */}
        <button
          type="button"
          onClick={remove}
          style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--ink-faint)', fontSize: 11, cursor: 'pointer' }}
          title="Delete (own posts only)"
        >
          ⋯
        </button>
      </div>

      {showComments && <CommentThread postId={post.id} />}
    </KCard>
  )
}

// ─── Comments ──────────────────────────────────────────────────────────────
function CommentThread({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    apiGet<{ comments: Comment[] }>(`/api/posts/${postId}/comments`)
      .then((d) => { if (mounted) setComments(d.comments ?? []) })
      .catch(() => { /* ignore */ })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [postId])

  // Group: top-level + replies
  const grouped = useMemo(() => {
    const topLevel = comments.filter((c) => !c.parent_id)
    const replies = new Map<string, Comment[]>()
    for (const c of comments) {
      if (c.parent_id) {
        const arr = replies.get(c.parent_id) ?? []
        arr.push(c)
        replies.set(c.parent_id, arr)
      }
    }
    return { topLevel, replies }
  }, [comments])

  async function submit() {
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await apiPost<{ comment: Comment }>(`/api/posts/${postId}/comments`, {
        body,
        parentId: replyTo?.id ?? null,
      })
      setComments((prev) => [...prev, res.comment])
      setDraft('')
      setReplyTo(null)
    } catch {
      // ignore
    } finally {
      setPosting(false)
    }
  }

  async function remove(c: Comment) {
    try {
      await apiDelete(`/api/posts/${postId}/comments/${c.id}`)
      setComments((prev) => prev.filter((x) => x.id !== c.id && x.parent_id !== c.id))
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ background: 'var(--paper-soft)', padding: '12px 16px', borderTop: '0.5px solid var(--rule-soft)' }}>
      {/* Composer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1500))}
          placeholder={replyTo ? `Reply to ${replyTo.author?.full_name ?? 'comment'}…` : 'Add a comment…'}
          rows={1}
          style={{
            flex: 1,
            padding: '8px 11px',
            borderRadius: 999,
            border: '0.5px solid var(--rule)',
            background: 'var(--paper)',
            fontSize: 13,
            fontFamily: "'IBM Plex Sans', sans-serif",
            color: 'var(--ink)',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.4,
            minHeight: 34,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
          }}
        />
        <KBtn variant="signal" size="sm" onClick={submit} disabled={posting || !draft.trim()}>
          {posting ? '…' : 'Post'}
        </KBtn>
      </div>
      {replyTo && (
        <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
          Replying to <strong>{replyTo.author?.full_name ?? 'comment'}</strong>{' '}
          <button type="button" onClick={() => setReplyTo(null)} style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--signal)', cursor: 'pointer', fontFamily: "'IBM Plex Sans'", fontSize: 11 }}>cancel</button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'", margin: 0 }}>Loading comments…</p>
      ) : grouped.topLevel.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0 }}>Be the first to comment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grouped.topLevel.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} onReply={() => setReplyTo(c)} onDelete={() => remove(c)} />
              {(grouped.replies.get(c.id) ?? []).map((r) => (
                <div key={r.id} style={{ marginLeft: 36, marginTop: 6 }}>
                  <CommentRow comment={r} onReply={() => setReplyTo(c) /* replies always under top-level */} onDelete={() => remove(r)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CommentRow({ comment, onReply, onDelete }: { comment: Comment; onReply: () => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <KAvatar name={comment.author?.full_name ?? '?'} src={comment.author?.avatar_url ?? null} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: 'var(--paper)', borderRadius: 14, padding: '8px 12px', display: 'inline-block', maxWidth: '100%' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{comment.author?.full_name ?? 'Unknown'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{comment.body}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 10.5, color: 'var(--ink-faint)' }}>
          <span>{relTime(comment.created_at)}</span>
          <button type="button" onClick={onReply} style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: 10.5, padding: 0, fontFamily: "'IBM Plex Sans'" }}>Reply</button>
          <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 10.5, padding: 0, fontFamily: "'IBM Plex Sans'" }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Create channel modal ─────────────────────────────────────────────────
function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Channel) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function autoSlug(v: string) {
    return v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  }

  async function submit() {
    if (!name.trim() || !slug.trim()) { setErr('Name and slug required'); return }
    setSubmitting(true)
    setErr(null)
    try {
      const res = await apiPost<{ channel: Channel }>('/api/channels', {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onCreated(res.channel)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed creating')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: 'var(--paper)', borderRadius: 18, padding: 24 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, marginBottom: 6, letterSpacing: -0.2 }}>
          New channel
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 16, lineHeight: 1.4 }}>
          A channel is a small community around a topic. You'll automatically be the owner.
        </p>

        <label style={fieldLabel}>Name</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)) }}
          placeholder="e.g. Munich Founders"
          style={fieldInput}
        />

        <label style={fieldLabel}>Slug (URL handle)</label>
        <input
          value={slug}
          onChange={(e) => setSlug(autoSlug(e.target.value))}
          placeholder="munich-founders"
          style={fieldInput}
        />

        <label style={fieldLabel}>Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 400))}
          placeholder="What is this channel for?"
          rows={3}
          style={{ ...fieldInput, resize: 'vertical' }}
        />

        {err && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--signal)' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <KBtn variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={submit} disabled={submitting || !name.trim() || !slug.trim()}>
            {submitting ? 'Creating…' : 'Create channel'}
          </KBtn>
        </div>
      </div>
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  display: 'block',
  marginBottom: 4,
  marginTop: 12,
}
const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 9,
  border: '0.5px solid var(--rule)',
  background: 'var(--paper-soft)',
  fontSize: 13.5,
  fontFamily: "'IBM Plex Sans', sans-serif",
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
}
