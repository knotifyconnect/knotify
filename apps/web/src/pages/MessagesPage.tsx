import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { supabase } from '../lib/supabase'

type UserPreview = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
}

type ConversationSummary = {
  id: string
  created_at: string
  peer: UserPreview | null
  unread_count: number
  latest_message: {
    id: string
    content: string
    created_at: string
    sender_id: string
  } | null
}

type MessageReaction = { emoji: string; count: number; mine: boolean }

type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  delivered_at: string | null
  created_at: string
  sender: UserPreview | null
  is_mine: boolean
  reactions: MessageReaction[]
}

type OptimisticMessage = Message & {
  pending: boolean
  failed: boolean
  local: true
}

type Connection = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  user: UserPreview | null
}

function isOpt(m: Message | OptimisticMessage): m is OptimisticMessage {
  return (m as OptimisticMessage).local === true
}

function relativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString()
}

function dayLabel(value: string) {
  const date = new Date(value)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (current === today) return 'Today'
  if (current === yesterday) return 'Yesterday'
  return date.toLocaleDateString()
}

const QUICK_ACTIONS = [
  { label: 'Video call 📹', message: "Would you be up for a quick video call?" },
  { label: 'Intro request 🤝', message: "Could you introduce me to someone at your company?" },
  { label: 'Vouch request ⭐', message: "Would you be willing to vouch for me on knotify?" },
]

type CafeOption = {
  id: string
  name: string
  address: string | null
}

export function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [optimistic, setOptimistic] = useState<Record<string, OptimisticMessage[]>>({})
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [composer, setComposer] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatSearch, setNewChatSearch] = useState('')
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [coffeeOpen, setCoffeeOpen] = useState(false)
  const [cafeOptions, setCafeOptions] = useState<CafeOption[]>([])
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [pickerOpenMsgId, setPickerOpenMsgId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkUserId = searchParams.get('to')
  const deepLinkAction = searchParams.get('action')

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (c) =>
        c.peer?.full_name?.toLowerCase().includes(q) ||
        c.peer?.username?.toLowerCase().includes(q)
    )
  }, [conversations, search])

  const acceptedConns = useMemo(
    () => connections.filter((c) => c.status === 'accepted' && c.user),
    [connections]
  )

  const filteredConns = useMemo(() => {
    const q = newChatSearch.trim().toLowerCase()
    if (!q) return acceptedConns
    return acceptedConns.filter(
      (c) =>
        c.user?.full_name?.toLowerCase().includes(q) ||
        c.user?.username?.toLowerCase().includes(q)
    )
  }, [acceptedConns, newChatSearch])

  const displayMessages = useMemo(() => {
    if (!selectedId) return [] as (Message | OptimisticMessage)[]
    const opt = optimistic[selectedId] ?? []
    return [...messages, ...opt].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [messages, optimistic, selectedId])

  const unreadTotal = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0),
    [conversations]
  )

  const lastMine = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i].is_mine) return displayMessages[i]
    }
    return null
  }, [displayMessages])

  const lastMineLabel = useMemo(() => {
    if (!lastMine) return null
    if (isOpt(lastMine)) {
      if (lastMine.failed) return 'Not sent'
      if (lastMine.pending) return 'Sending…'
    }
    return lastMine.read_at ? 'Seen' : 'Delivered'
  }, [lastMine])

  async function loadConvs(keepErr = false) {
    setLoadingConvs(true)
    try {
      const res = await apiGet<{ conversations: ConversationSummary[] }>('/api/conversations')
      const next = res.conversations ?? []
      setConversations(next)
      if (!next.length) { setSelectedId(null); setMessages([]) }
      else if (!selectedId || !next.some((c) => c.id === selectedId)) {
        // Only auto-pick first chat on desktop — on mobile we want the list to be the
        // landing surface so the user picks intentionally.
        const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
        if (isDesktop) setSelectedId(next[0].id)
      }
      if (!keepErr) setError(null)
    } catch (err) {
      if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading')
    } finally {
      setLoadingConvs(false)
    }
  }

  async function loadMsgs(id: string, keepErr = false) {
    setLoadingMsgs(true)
    try {
      const res = await apiGet<{ messages: Message[] }>(`/api/conversations/${id}/messages`)
      setMessages(res.messages ?? [])
      if (!keepErr) setError(null)
    } catch (err) {
      if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading messages')
    } finally {
      setLoadingMsgs(false)
    }
  }

  async function markRead(id: string) {
    try {
      await apiPost(`/api/conversations/${id}/read`, {})
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
      )
    } catch { /* best effort */ }
  }

  async function scheduleCoffee(payload: { inviteeId: string; scheduledAt: string; cafeId: string | null; locationText: string | null; note: string | null }): Promise<void> {
    if (!selectedId) return
    setError(null)
    try {
      await apiPost('/api/meetings', payload)
      // Send a system-style message into the conversation so the peer sees it
      const when = new Date(payload.scheduledAt)
      const cafe = cafeOptions.find((c) => c.id === payload.cafeId)
      const where = cafe?.name ?? payload.locationText ?? 'a café'
      const friendlyTime = when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      await sendMessage(`☕ Proposed: coffee at ${where} — ${friendlyTime}.${payload.note ? ` "${payload.note}"` : ''}\nConfirm or reschedule on your map page.`)
      setCoffeeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed scheduling')
    }
  }

  useEffect(() => {
    void loadConvs()
    void (async () => {
      try { const r = await apiGet<{ connections: Connection[] }>('/api/connections'); setConnections(r.connections ?? []) } catch { /* noop */ }
      try { const c = await apiGet<{ cafes: CafeOption[] }>('/api/cafes'); setCafeOptions(c.cafes ?? []) } catch { /* noop */ }
    })()
  }, [])

  useEffect(() => {
    if (!selectedId) return
    void loadMsgs(selectedId)
    void markRead(selectedId)
  }, [selectedId])

  // Realtime: subscribe to new messages in the selected conversation
  useEffect(() => {
    if (!selectedId) return
    // Mark delivered when opening conversation
    void apiPost(`/api/conversations/${selectedId}/delivered`, {}).catch(() => {})
    const channel = supabase
      .channel(`messages:conv:${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, () => {
        void loadMsgs(selectedId, true)
        void markRead(selectedId)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [selectedId])

  // Realtime: subscribe to any new message for unread badge refresh
  useEffect(() => {
    const channel = supabase
      .channel('messages:any')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void loadConvs(true)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages, selectedId])

  // Honor ?to=USER_ID&action=coffee deep links from elsewhere in the app
  useEffect(() => {
    if (!deepLinkUserId) return
    void (async () => {
      await openOrCreate(deepLinkUserId)
      // Strip the query so it doesn't re-fire on re-render
      const next = new URLSearchParams(searchParams)
      const wantsCoffee = next.get('action') === 'coffee'
      next.delete('to'); next.delete('action')
      setSearchParams(next, { replace: true })
      if (wantsCoffee) setTimeout(() => setCoffeeOpen(true), 200)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkUserId, deepLinkAction])

  async function openOrCreate(userId: string) {
    setCreatingFor(userId)
    try {
      const res = await apiPost<{ conversation: { id: string } }>('/api/conversations', { userId })
      await loadConvs(true)
      setSelectedId(res.conversation.id)
      await loadMsgs(res.conversation.id, true)
      await markRead(res.conversation.id)
      setNewChatOpen(false)
      setNewChatSearch('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed starting conversation')
    } finally {
      setCreatingFor(null)
    }
  }

  async function sendMessage(contentOverride?: string) {
    if (!selectedId || sendLoading) return
    const trimmed = (contentOverride ?? composer).trim()
    if (!trimmed) return

    const nowIso = new Date().toISOString()
    const tempId = `tmp-${Date.now()}`
    const opt: OptimisticMessage = {
      id: tempId, conversation_id: selectedId, sender_id: 'me',
      content: trimmed, read_at: null, delivered_at: null, created_at: nowIso,
      sender: null, is_mine: true, pending: true, failed: false, local: true,
      reactions: [],
    }

    if (!contentOverride) setComposer('')
    setSendLoading(true)
    setOptimistic((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), opt] }))

    try {
      const res = await apiPost<{ message: Message }>(`/api/conversations/${selectedId}/messages`, { content: trimmed })
      setOptimistic((prev) => ({ ...prev, [selectedId]: (prev[selectedId] ?? []).filter((m) => m.id !== tempId) }))
      setMessages((prev) => [...prev, res.message])
      await loadConvs(true)
    } catch (err) {
      setOptimistic((prev) => ({
        ...prev,
        [selectedId]: (prev[selectedId] ?? []).map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m),
      }))
      setError(err instanceof Error ? err.message : 'Failed sending')
      if (contentOverride) setComposer(trimmed)
    } finally {
      setSendLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  async function toggleReaction(msgId: string, emoji: string) {
    if (!selectedId) return
    // Optimistic update — toggle locally so the UI responds instantly
    setMessages((prev: Message[]) => prev.map((m) => {
      if (m.id !== msgId) return m
      const existing: MessageReaction[] = m.reactions ?? []
      const mineIdx = existing.findIndex((r) => r.emoji === emoji && r.mine)
      if (mineIdx >= 0) {
        // remove mine
        const next = existing
          .map((r, i) => i === mineIdx ? { ...r, count: r.count - 1, mine: false } : r)
          .filter((r) => r.count > 0)
        return { ...m, reactions: next }
      }
      const otherIdx = existing.findIndex((r) => r.emoji === emoji)
      if (otherIdx >= 0) {
        const next = existing.map((r, i) => i === otherIdx ? { ...r, count: r.count + 1, mine: true } : r)
        return { ...m, reactions: next }
      }
      return { ...m, reactions: [...existing, { emoji, count: 1, mine: true }] }
    }))
    // Close the hover picker so user sees the result
    setHoveredMsgId(null)
    try {
      await apiPost(`/api/conversations/${selectedId}/messages/${msgId}/react`, { emoji })
      // Reload to sync exact server state
      void loadMsgs(selectedId, true)
    } catch (err) {
      // Revert on failure
      void loadMsgs(selectedId, true)
      setError(err instanceof Error ? err.message : 'Reaction failed')
    }
  }

  const QUICK_REACTIONS = ['❤️', '👍', '😂', '🙌', '🔥']
  const EMOJI_KEYBOARD = ['😊', '😂', '❤️', '👍', '🙌', '🔥', '🎉', '🤔', '😎', '👏', '✨', '💪', '🚀', '💯', '🙏']

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto' }}>

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5, fontFamily: "'IBM Plex Sans'" }}>
            knotify · messages
          </div>
          <h1
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 'clamp(22px, 2.5vw, 34px)',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            Your <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>conversations.</span>
          </h1>
        </div>
        <KBtn variant="ghost" size="sm" onClick={() => setNewChatOpen((p) => !p)}>
          + New
        </KBtn>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ─── Layout ──────────────────────────────────────────────────────── */}
      {/* Desktop: list (300px) + thread side-by-side.
          Mobile: SHOW EITHER list OR thread (switcher driven by selectedId).
          Picking a chat → thread; back arrow in thread → list. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px minmax(0,1fr)',
          gap: 12,
          height: 'calc(100vh - 200px)',
          minHeight: 400,
        }}
        className="!grid-cols-1 md:!grid-cols-[300px_1fr]"
      >
        {/* ── Conversation list ─────────────────────────────────────────── */}
        {/* On mobile: hidden when a chat is selected */}
        <KCard
          className={selectedId ? 'hidden md:flex' : 'flex'}
          style={{ padding: 0, flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* Search */}
          <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--rule-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>Chats</span>
              {unreadTotal > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: 'white',
                    background: 'var(--signal)',
                    borderRadius: 999,
                    padding: '1px 7px',
                    fontFamily: "'IBM Plex Mono'",
                  }}
                >
                  {unreadTotal}
                </span>
              )}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{
                width: '100%',
                padding: '8px 11px',
                borderRadius: 9,
                border: '0.5px solid var(--rule)',
                background: 'var(--paper-soft)',
                fontSize: 13,
                fontFamily: "'IBM Plex Sans', sans-serif",
                color: 'var(--ink)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* New chat picker */}
          {newChatOpen && (
            <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--rule-soft)', background: 'var(--paper-soft)' }}>
              <input
                autoFocus
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Search connections…"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '0.5px solid var(--rule)',
                  background: 'var(--paper)',
                  fontSize: 12.5,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: 'var(--ink)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 8,
                }}
              />
              <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {filteredConns.length ? filteredConns.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={creatingFor === c.user?.id}
                    onClick={() => c.user && openOrCreate(c.user.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--paper)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <KAvatar name={c.user?.full_name} src={c.user?.avatar_url} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.user?.full_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>@{c.user?.username}</div>
                    </div>
                    {creatingFor === c.user?.id && (
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)', marginLeft: 'auto' }}>…</span>
                    )}
                  </button>
                )) : (
                  <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0, padding: '4px 0' }}>No accepted connections.</p>
                )}
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {loadingConvs && !conversations.length && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 4px', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>
                Loading…
              </p>
            )}
            {!filteredConvs.length && !loadingConvs && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 4px', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>
                No conversations yet.
              </p>
            )}
            {filteredConvs.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => setSelectedId(conv.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 11,
                  border: selectedId === conv.id ? '0.5px solid rgba(216,68,43,0.22)' : '0.5px solid transparent',
                  background: selectedId === conv.id ? 'var(--signal-soft)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 2,
                  transition: 'all 0.1s',
                }}
              >
                <KAvatar name={conv.peer?.full_name} src={conv.peer?.avatar_url} size={38} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: conv.unread_count > 0 ? 600 : 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.peer?.full_name ?? 'Unknown'}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', flexShrink: 0 }}>
                      {relativeTime(conv.latest_message?.created_at ?? conv.created_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {conv.latest_message?.content ?? 'Start the conversation'}
                    </span>
                    {conv.unread_count > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'white',
                          background: 'var(--signal)',
                          borderRadius: 999,
                          padding: '1px 6px',
                          flexShrink: 0,
                        }}
                      >
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </KCard>

        {/* ── Thread ────────────────────────────────────────────────────── */}
        {/* On mobile: hidden when no chat selected */}
        <KCard
          className={selectedId ? 'flex' : 'hidden md:flex'}
          style={{ padding: 0, flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* Thread header */}
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '0.5px solid var(--rule-soft)',
              background: 'var(--paper-soft)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {selectedConv?.peer ? (
              <>
                {/* Mobile back-to-list */}
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden"
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
                  aria-label="Back to chats"
                >
                  ←
                </button>
                <KAvatar name={selectedConv.peer.full_name} src={selectedConv.peer.avatar_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedConv.peer.full_name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>@{selectedConv.peer.username}</div>
                </div>
                {/* Plan coffee button */}
                <KBtn variant="signal" size="sm" onClick={() => setCoffeeOpen(true)}>
                  ☕ Plan coffee
                </KBtn>
                {/* IRL context strip */}
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'var(--ochre-soft)',
                    border: '0.5px solid rgba(200,148,31,0.2)',
                    fontSize: 11,
                    color: 'var(--ochre)',
                    fontFamily: "'IBM Plex Sans'",
                    whiteSpace: 'nowrap',
                  }}
                >
                  1st connection
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>Select a conversation</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Choose from the left or start a new one.</div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              background: 'var(--paper-soft)',
            }}
          >
            {!selectedId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink-faint)', textAlign: 'center' }}>
                  Select a conversation to start messaging.
                </p>
              </div>
            ) : loadingMsgs && !displayMessages.length ? (
              <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--ink-faint)' }}>
                Loading…
              </p>
            ) : displayMessages.length === 0 ? (
              <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--ink-faint)' }}>
                No messages yet. Break the ice.
              </p>
            ) : (
              displayMessages.map((msg, i) => {
                const prev = displayMessages[i - 1]
                const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(msg.created_at)
                const showAuthor = !msg.is_mine && (!prev || prev.sender_id !== msg.sender_id)

                const msgReactions = (!isOpt(msg) && msg.reactions) ? msg.reactions : []
                return (
                  <div key={msg.id}>
                    {showDay && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', background: 'rgba(244,239,230,0.9)', border: '0.5px solid var(--rule-soft)', borderRadius: 999, padding: '3px 10px', fontFamily: "'IBM Plex Sans'" }}>
                          {dayLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {showAuthor && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3, marginLeft: 12 }}>
                        {msg.sender?.full_name ?? 'Unknown'}
                      </div>
                    )}
                    <div
                      style={{ display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', marginBottom: 2, alignItems: 'center', gap: 6 }}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                    >
                      {/* Tiny react button — visible on hover, sits to the left of mine, right of others */}
                      {msg.is_mine && hoveredMsgId === msg.id && !isOpt(msg) && (
                        <button
                          type="button"
                          onClick={() => setPickerOpenMsgId(pickerOpenMsgId === msg.id ? null : msg.id)}
                          aria-label="Add reaction"
                          style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--paper)', border: '0.5px solid var(--rule)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, padding: 0, boxShadow: '0 2px 6px rgba(26,24,21,0.08)',
                            order: 0,
                          }}
                        >
                          🙂
                        </button>
                      )}
                      <div style={{ maxWidth: '72%', position: 'relative' }}>
                        {/* Bubble */}
                        <div
                          style={{
                            padding: '9px 13px',
                            borderRadius: msg.is_mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: msg.is_mine ? 'var(--ink)' : 'var(--paper)',
                            color: msg.is_mine ? 'var(--paper)' : 'var(--ink)',
                            border: msg.is_mine ? 'none' : '0.5px solid var(--rule-soft)',
                            fontSize: 13.5,
                            lineHeight: 1.5,
                            boxShadow: '0 1px 4px rgba(26,24,21,0.06)',
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                          <div style={{ marginTop: 3, fontSize: 10.5, color: msg.is_mine ? 'rgba(244,239,230,0.5)' : 'var(--ink-faint)', textAlign: msg.is_mine ? 'right' : 'left', display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 4 }}>
                            <span>{relativeTime(msg.created_at)}{isOpt(msg) && msg.pending ? ' · Sending…' : ''}{isOpt(msg) && msg.failed ? ' · Failed' : ''}</span>
                            {/* Status ticks for own messages */}
                            {msg.is_mine && !isOpt(msg) && (
                              <span style={{ color: msg.read_at ? 'var(--verd)' : 'rgba(244,239,230,0.5)', fontSize: 11 }}>
                                {msg.read_at || msg.delivered_at ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                          {isOpt(msg) && msg.failed && (
                            <button type="button" onClick={() => { setOptimistic((prev) => ({ ...prev, [selectedId!]: (prev[selectedId!] ?? []).filter((m) => m.id !== msg.id) })); void sendMessage(msg.content) }} style={{ fontSize: 10.5, color: 'var(--signal)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3, padding: 0, fontFamily: "'IBM Plex Sans'" }}>Retry</button>
                          )}
                        </div>
                        {/* Reaction picker — drops BELOW the bubble when icon clicked */}
                        {pickerOpenMsgId === msg.id && !isOpt(msg) && (
                          <>
                            {/* Click-outside backdrop */}
                            <div
                              onClick={() => setPickerOpenMsgId(null)}
                              style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: 'calc(100% + 6px)',
                                [msg.is_mine ? 'right' : 'left']: 0,
                                background: 'var(--paper)',
                                border: '1px solid var(--rule)',
                                borderRadius: 22,
                                padding: '6px 10px',
                                display: 'flex',
                                gap: 4,
                                boxShadow: '0 8px 24px rgba(26,24,21,0.18)',
                                zIndex: 10,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {QUICK_REACTIONS.map((e) => (
                                <button
                                  key={e}
                                  onClick={(ev) => { ev.stopPropagation(); void toggleReaction(msg.id, e); setPickerOpenMsgId(null) }}
                                  style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1, borderRadius: 6, transition: 'transform 0.1s, background 0.1s' }}
                                  onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1.3)'; (ev.currentTarget as HTMLButtonElement).style.background = 'var(--paper-soft)' }}
                                  onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (ev.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Reactions display (under the bubble) */}
                        {msgReactions.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start' }}>
                            {msgReactions.map((r) => (
                              <button key={r.emoji} onClick={() => void toggleReaction(msg.id, r.emoji)} style={{ padding: '2px 7px', borderRadius: 12, border: `1px solid ${r.mine ? 'var(--signal)' : 'var(--rule)'}`, background: r.mine ? 'rgba(216,68,43,0.08)' : 'var(--paper-soft)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                {r.emoji} <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Tiny react button — right side for non-mine messages */}
                      {!msg.is_mine && hoveredMsgId === msg.id && !isOpt(msg) && (
                        <button
                          type="button"
                          onClick={() => setPickerOpenMsgId(pickerOpenMsgId === msg.id ? null : msg.id)}
                          aria-label="Add reaction"
                          style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--paper)', border: '0.5px solid var(--rule)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, padding: 0, boxShadow: '0 2px 6px rgba(26,24,21,0.08)',
                          }}
                        >
                          🙂
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {selectedId && (
            <div
              style={{
                padding: '8px 16px',
                borderTop: '0.5px solid var(--rule-soft)',
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                background: 'var(--paper-soft)',
              }}
            >
              {QUICK_ACTIONS.map(({ label, message }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void sendMessage(message)}
                  style={{
                    padding: '4px 11px',
                    borderRadius: 999,
                    border: '0.5px solid var(--rule)',
                    background: 'transparent',
                    fontSize: 12,
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    transition: 'all 0.1s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-soft)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '0.5px solid var(--rule-soft)',
              background: 'var(--paper-soft)',
            }}
          >
            {lastMineLabel && (
              <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', textAlign: 'right', marginBottom: 6, fontFamily: "'IBM Plex Mono'" }}>
                {lastMineLabel}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={composer}
                  onChange={(e) => {
                    setComposer(e.target.value.slice(0, 4000))
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedId ? 'Type a message… (Enter to send, Shift+Enter for newline)' : 'Select a conversation first'}
                  disabled={!selectedId || sendLoading}
                  rows={1}
                  style={{
                    width: '100%',
                    minHeight: 42,
                    maxHeight: 120,
                    resize: 'none',
                    borderRadius: 12,
                    border: '0.5px solid var(--rule)',
                    background: 'var(--paper-soft)',
                    padding: '9px 40px 9px 12px',
                    fontSize: 14,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    color: 'var(--ink)',
                    outline: 'none',
                    lineHeight: 1.5,
                    overflowY: 'auto',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--signal)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule)' }}
                />
                {/* Emoji keyboard button */}
                <div style={{ position: 'absolute', right: 8, bottom: 9 }}>
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen((p) => !p)}
                    style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: 2, color: 'var(--ink-faint)', lineHeight: 1 }}
                  >
                    😊
                  </button>
                  {emojiPickerOpen && (
                    <div style={{ position: 'absolute', bottom: '100%', right: 0, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6, width: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20 }}>
                      {EMOJI_KEYBOARD.map((e) => (
                        <button key={e} type="button" onClick={() => { setComposer((d) => d + e); setEmojiPickerOpen(false) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <KBtn
                variant="signal"
                size="sm"
                disabled={!selectedId || !composer.trim() || sendLoading}
                onClick={() => void sendMessage()}
                style={{ flexShrink: 0, height: 42 }}
              >
                Send
              </KBtn>
            </div>
          </div>
        </KCard>
      </div>

      {/* Plan coffee modal */}
      {coffeeOpen && selectedConv?.peer && (
        <CoffeeScheduleModal
          peerName={selectedConv.peer.full_name}
          peerId={selectedConv.peer.id}
          cafes={cafeOptions}
          onCancel={() => setCoffeeOpen(false)}
          onSchedule={scheduleCoffee}
        />
      )}
    </div>
  )
}

// ─── Coffee schedule modal ─────────────────────────────────────────────────
function CoffeeScheduleModal({
  peerName,
  peerId,
  cafes,
  onCancel,
  onSchedule,
}: {
  peerName: string
  peerId: string
  cafes: CafeOption[]
  onCancel: () => void
  onSchedule: (payload: { inviteeId: string; scheduledAt: string; cafeId: string | null; locationText: string | null; note: string | null }) => Promise<void>
}) {
  const [date, setDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [time, setTime] = useState<string>('16:00')
  const [cafeId, setCafeId] = useState<string>('')
  const [locationText, setLocationText] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    setBusy(true)
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString()
      await onSchedule({
        inviteeId: peerId,
        scheduledAt: iso,
        cafeId: cafeId || null,
        locationText: cafeId ? null : (locationText.trim() || null),
        note: note.trim() || null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: 'var(--paper)', borderRadius: 18, padding: 24 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, marginBottom: 4, letterSpacing: -0.2 }}>
          Plan a coffee with <span style={{ fontStyle: 'italic' }}>{peerName}</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 18, lineHeight: 1.4 }}>
          We'll send a proposal. They can confirm from their map page.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Café (partner)</label>
          <select value={cafeId} onChange={(e) => setCafeId(e.target.value)} style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <option value="">Other / not a partner café</option>
            {cafes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ''}</option>
            ))}
          </select>
        </div>

        {!cafeId && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Location</label>
            <input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="e.g. Tortoise on Türkenstraße" style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Optional note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="What you want to chat about" style={{ width: '100%', minHeight: 64, padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: "'IBM Plex Sans', sans-serif" }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <KBtn variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={submit} disabled={busy}>
            {busy ? 'Scheduling…' : 'Send proposal'}
          </KBtn>
        </div>
      </div>
    </div>
  )
}
