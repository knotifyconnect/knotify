import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
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
  deleted_at?: string | null
  deleted_by?: string | null
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

type MessageDeleteScope = 'for-me' | 'for-everyone'

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

type CoffeeTimelineEvent = {
  title: string
  detail: string
  note: string | null
  tone: 'proposed' | 'confirmed' | 'cancelled' | 'declined' | 'default'
}

function coffeeTimelineEventFromContent(content: string): CoffeeTimelineEvent | null {
  const clean = content.trim()
  if (!clean.startsWith('☕')) return null

  const lines = clean.split('\n').map((line) => line.trim()).filter(Boolean)
  const first = lines[0] ?? ''
  const withoutIcon = first.replace(/^☕\s*/, '')
  const splitAt = withoutIcon.indexOf(':')
  const title = splitAt >= 0 ? withoutIcon.slice(0, splitAt).trim() : withoutIcon.trim()
  const detail = splitAt >= 0 ? withoutIcon.slice(splitAt + 1).trim().replace(/\.$/, '') : ''

  const lower = title.toLowerCase()
  const tone =
    lower.includes('proposed') ? 'proposed'
      : lower.includes('confirmed') ? 'confirmed'
        : lower.includes('cancelled') ? 'cancelled'
          : lower.includes('declined') ? 'declined'
            : 'default'

  const note = lines
    .slice(1)
    .filter((line) => !line.toLowerCase().includes('coffee card above'))
    .join(' ')
    .trim() || null

  if (!title && !detail) return null
  return { title, detail, note, tone }
}

function CoffeeTimelineEventCard({
  event,
  createdAt,
  actorName,
}: {
  event: CoffeeTimelineEvent
  createdAt: string
  actorName: string
}) {
  const accent =
    event.tone === 'confirmed' ? 'var(--verd)'
      : event.tone === 'cancelled' || event.tone === 'declined' ? 'var(--signal-deep)'
        : 'var(--ochre)'

  return (
    <div
      style={{
        width: 'min(520px, 100%)',
        margin: '8px auto 10px',
        padding: '12px 14px',
        borderRadius: 16,
        border: '0.5px solid rgba(200, 148, 31, 0.24)',
        background: 'linear-gradient(135deg, rgba(250,243,226,0.96), rgba(255,255,255,0.92))',
        boxShadow: '0 10px 26px rgba(58, 45, 25, 0.07)',
      }}
    >
      <div style={{ fontSize: 10.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: accent, fontWeight: 700, marginBottom: 5 }}>
        ☕ {event.title}
      </div>
      {event.detail && (
        <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.35 }}>
          {event.detail}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        {actorName} · {relativeTime(createdAt)}
      </div>
      {event.note && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: 'var(--ink-muted)', fontStyle: 'italic', lineHeight: 1.35 }}>
          {event.note}
        </div>
      )}
    </div>
  )
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

type MeetingStatus = 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'completed'

type MeetingSummary = {
  id: string
  initiator_id: string
  invitee_id: string
  cafe_id: string | null
  location_text: string | null
  scheduled_at: string
  status: MeetingStatus
  note: string | null
  created_at: string
  updated_at?: string | null
  cafe: CafeOption | null
  peer?: UserPreview | null
  am_initiator: boolean
}

function formatMeetingTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function meetingLocationLabel(meeting: MeetingSummary, cafes: CafeOption[]) {
  const cafe = meeting.cafe ?? cafes.find((c) => c.id === meeting.cafe_id) ?? null
  return cafe?.name ?? meeting.location_text ?? 'Coffee'
}

async function apiDeleteJson<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const baseUrl = ((import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000') as string).replace(/\/$/, '')

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error ?? 'Request failed')
  return json as T
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
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [meetingActionId, setMeetingActionId] = useState<string | null>(null)
  const [meetingNow, setMeetingNow] = useState(() => Date.now())
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [pickerOpenMsgId, setPickerOpenMsgId] = useState<string | null>(null)
  const [messageDeleteConfirm, setMessageDeleteConfirm] = useState<{ id: string; scope: MessageDeleteScope } | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false)
  const [deletingConversation, setDeletingConversation] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkUserId = searchParams.get('to')
  const deepLinkAction = searchParams.get('action')

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollStateRef = useRef<{ conversationId: string | null; lastMessageId: string | null }>({ conversationId: null, lastMessageId: null })
  const scrollIntentRef = useRef<'none' | 'open' | 'own-message'>('none')
  const openCreateInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map())
  const handledDeepLinkRef = useRef<string | null>(null)

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const selectedMeeting = useMemo(() => {
    const peerId = selectedConv?.peer?.id
    if (!peerId) return null

    const active = meetings
      .filter((meeting) => {
        const isActionableStatus = meeting.status === 'proposed' || meeting.status === 'confirmed'
        const isPeerMeeting = meeting.initiator_id === peerId || meeting.invitee_id === peerId
        const isUpcoming = new Date(meeting.scheduled_at).getTime() >= meetingNow

        return isActionableStatus && isPeerMeeting && isUpcoming
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    return active[0] ?? null
  }, [meetings, selectedConv, meetingNow])

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
      if (!next.length) {
        setSelectedId(null)
        setMessages([])
      } else if (selectedId && !next.some((c) => c.id === selectedId)) {
        setSelectedId(null)
        setMessages([])
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

  function openConversation(conversationId: string) {
    if (conversationId === selectedId) return
    scrollIntentRef.current = 'open'
    scrollStateRef.current = { conversationId: null, lastMessageId: null }
    setMessages([])
    setOptimistic((prev) => ({ ...prev, [conversationId]: prev[conversationId] ?? [] }))
    setSelectedId(conversationId)
  }

  async function markRead(id: string) {
    try {
      await apiPost(`/api/conversations/${id}/read`, {})
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
      )
    } catch { /* best effort */ }
  }

  async function loadMeetings(keepErr = false) {
    try {
      const res = await apiGet<{ meetings: MeetingSummary[] }>('/api/meetings')
      setMeetings(res.meetings ?? [])
    } catch (err) {
      if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading meetings')
    }
  }

  async function scheduleCoffee(payload: { inviteeId: string; scheduledAt: string; cafeId: string | null; locationText: string | null; note: string | null }): Promise<void> {
    if (!selectedId) return
    setError(null)
    try {
      await apiPost('/api/meetings', payload)
      await loadMeetings(true)
      await loadConvs(true)
      if (selectedId) await loadMsgs(selectedId, true)
      setCoffeeOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed scheduling')
    }
  }

  async function updateMeetingStatus(meeting: MeetingSummary, status: MeetingStatus) {
    if (!selectedId || meetingActionId) return

    setMeetingActionId(meeting.id)
    setError(null)
    try {
      await apiPatch<{ meeting: MeetingSummary }>(`/api/meetings/${meeting.id}`, { status })

      const nextMeeting = { ...meeting, status, updated_at: new Date().toISOString() }
      setMeetings((prev) => prev.map((item) => (item.id === meeting.id ? nextMeeting : item)))
      await loadMeetings(true)

      await loadConvs(true)
      if (selectedId) await loadMsgs(selectedId, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed updating coffee invite')
    } finally {
      setMeetingActionId(null)
    }
  }

  useEffect(() => {
    void loadConvs()
    void loadMeetings(true)
    void (async () => {
      try { const r = await apiGet<{ connections: Connection[] }>('/api/connections'); setConnections(r.connections ?? []) } catch { /* noop */ }
      try { const c = await apiGet<{ cafes: CafeOption[] }>('/api/cafes'); setCafeOptions(c.cafes ?? []) } catch { /* noop */ }
    })()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setMeetingNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setMessageDeleteConfirm(null)
    setThreadMenuOpen(false)
    setConfirmDeleteConversation(false)
    if (!selectedId) return
    void loadMsgs(selectedId)
    void markRead(selectedId)
  }, [selectedId])

  // Realtime: selected thread should react to both new messages and delivery/read updates.
  useEffect(() => {
    if (!selectedId) return

    const activeConversationId = selectedId

    function refreshSelectedThread() {
      void loadMsgs(activeConversationId, true)
      void loadConvs(true)
      void loadMeetings(true)
    }

    // Mark delivered/read when opening conversation.
    void apiPost(`/api/conversations/${activeConversationId}/delivered`, {}).catch(() => {})
    void markRead(activeConversationId)

    const channel = supabase
      .channel(`messages:conv:${activeConversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConversationId}`,
      }, () => {
        refreshSelectedThread()
        void apiPost(`/api/conversations/${activeConversationId}/delivered`, {}).catch(() => {})
        void markRead(activeConversationId)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [selectedId])

  // Realtime: any message insert/update can affect conversation ordering, unread counts, delivery/read ticks.
  useEffect(() => {
    const channel = supabase
      .channel('messages:any')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadConvs(true)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  // Reliability path: keep the open thread fresh even if Supabase message realtime
  // misses an event. This makes messaging usable instead of pretending realtime is magic.
  useEffect(() => {
    if (!selectedId) return

    const activeConversationId = selectedId
    let disposed = false
    let lastPresenceSync = 0

    async function syncOpenThread() {
      if (disposed) return

      await Promise.allSettled([
        loadMsgs(activeConversationId, true),
        loadConvs(true),
        loadMeetings(true),
      ])

      const now = Date.now()
      if (now - lastPresenceSync > 7000) {
        lastPresenceSync = now
        void apiPost(`/api/conversations/${activeConversationId}/delivered`, {}).catch(() => {})
        void markRead(activeConversationId)
      }
    }

    void syncOpenThread()
    const interval = window.setInterval(() => { void syncOpenThread() }, 2500)

    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [selectedId])

  // Realtime: meeting state is the source of truth for coffee action cards.
  // A meeting update is usually followed by a backend-owned receipt message,
  // so refresh the thread immediately and once after the receipt insert settles.
  useEffect(() => {
    function refreshMeetingState() {
      void loadMeetings(true)
      void loadConvs(true)
      if (selectedId) void loadMsgs(selectedId, true)
    }

    const channel = supabase
      .channel('meetings:any')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
        refreshMeetingState()
        window.setTimeout(refreshMeetingState, 500)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [selectedId])

  const latestDisplayMessage = displayMessages[displayMessages.length - 1] ?? null

  useLayoutEffect(() => {
    const previous = scrollStateRef.current
    const latestMessageId = latestDisplayMessage?.id ?? null
    const latestMessageChanged = previous.lastMessageId !== latestMessageId
    const scroller = messagesScrollRef.current
    const intent = scrollIntentRef.current

    if (!selectedId || !scroller) {
      scrollStateRef.current = { conversationId: selectedId, lastMessageId: latestMessageId }
      return
    }

    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    const isNearBottom = distanceFromBottom < 180
    const shouldJumpForOpen = intent === 'open' && Boolean(latestMessageId)
    const shouldScrollForOwnMessage = intent === 'own-message'
    const shouldFollowIncoming = latestMessageChanged && isNearBottom

    if (shouldJumpForOpen || shouldScrollForOwnMessage) {
      scroller.scrollTop = scroller.scrollHeight
      window.requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight
      })
      scrollIntentRef.current = 'none'
    } else if (shouldFollowIncoming) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }

    scrollStateRef.current = {
      conversationId: selectedId,
      lastMessageId: latestMessageId,
    }
  }, [selectedId, latestDisplayMessage?.id, latestDisplayMessage?.is_mine, displayMessages.length])

  // Honor ?to=USER_ID&action=coffee deep links from elsewhere in the app.
  // React dev mode can run effects twice, so guard by the exact deep-link key.
  useEffect(() => {
    if (!deepLinkUserId) return

    const deepLinkKey = `${deepLinkUserId}:${deepLinkAction ?? ''}`
    if (handledDeepLinkRef.current === deepLinkKey) return
    handledDeepLinkRef.current = deepLinkKey

    void (async () => {
      const wantsCoffee = deepLinkAction === 'coffee'
      const conversationId = await openOrCreate(deepLinkUserId)

      const next = new URLSearchParams(searchParams)
      next.delete('to')
      next.delete('action')
      setSearchParams(next, { replace: true })

      if (conversationId && wantsCoffee) setTimeout(() => setCoffeeOpen(true), 200)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkUserId, deepLinkAction])

  async function openOrCreate(userId: string): Promise<string | null> {
    const existingConversation = conversations.find((conv) => conv.peer?.id === userId)
    if (existingConversation) {
      scrollIntentRef.current = 'open'
      scrollStateRef.current = { conversationId: null, lastMessageId: null }
      setSelectedId(existingConversation.id)
      await loadMsgs(existingConversation.id, true)
      await markRead(existingConversation.id)
      setNewChatOpen(false)
      setNewChatSearch('')
      setError(null)
      return existingConversation.id
    }

    const inFlight = openCreateInFlightRef.current.get(userId)
    if (inFlight) {
      const conversationId = await inFlight
      if (conversationId) {
        scrollIntentRef.current = 'open'
        scrollStateRef.current = { conversationId: null, lastMessageId: null }
        setSelectedId(conversationId)
      }
      return conversationId
    }

    const task = (async () => {
      setCreatingFor(userId)
      try {
        const res = await apiPost<{ conversation: { id: string } }>('/api/conversations', { userId })
        await loadConvs(true)
        scrollIntentRef.current = 'open'
        scrollStateRef.current = { conversationId: null, lastMessageId: null }
        setSelectedId(res.conversation.id)
        await loadMsgs(res.conversation.id, true)
        await markRead(res.conversation.id)
        setNewChatOpen(false)
        setNewChatSearch('')
        setError(null)
        return res.conversation.id
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed starting conversation')
        return null
      } finally {
        setCreatingFor(null)
      }
    })()

    openCreateInFlightRef.current.set(userId, task)
    try {
      return await task
    } finally {
      openCreateInFlightRef.current.delete(userId)
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
      content: trimmed, read_at: null, delivered_at: null, deleted_at: null, deleted_by: null, created_at: nowIso,
      sender: null, is_mine: true, pending: true, failed: false, local: true,
      reactions: [],
    }

    if (!contentOverride) setComposer('')
    scrollIntentRef.current = 'own-message'
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

  async function deleteMessage(msg: Message | OptimisticMessage, scope: MessageDeleteScope) {
    if (!selectedId || isOpt(msg) || msg.deleted_at) return
    if (scope === 'for-everyone' && !msg.is_mine) return

    if (messageDeleteConfirm?.id !== msg.id || messageDeleteConfirm.scope !== scope) {
      setMessageDeleteConfirm({ id: msg.id, scope })
      return
    }

    const conversationId = selectedId
    setDeletingMessageId(msg.id)
    setError(null)

    try {
      if (scope === 'for-me') {
        await apiDeleteJson<{ deleted_for_me: boolean; message_id: string }>(`/api/conversations/${conversationId}/messages/${msg.id}/for-me`)
        setMessages((prev) => prev.filter((item) => item.id !== msg.id))
      } else {
        const res = await apiDeleteJson<{ message: Message; deleted: boolean }>(`/api/conversations/${conversationId}/messages/${msg.id}/for-everyone`)
        setMessages((prev) =>
          prev.map((item) =>
            item.id === msg.id
              ? { ...item, ...res.message, content: 'Message deleted', reactions: [] }
              : item
          )
        )
      }

      setMessageDeleteConfirm(null)
      await loadMsgs(conversationId, true)
      await loadConvs(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : scope === 'for-me' ? 'Failed deleting for me' : 'Failed deleting for everyone')
    } finally {
      setDeletingMessageId(null)
    }
  }

  async function deleteConversation() {
    if (!selectedId || deletingConversation) return

    if (!confirmDeleteConversation) {
      setConfirmDeleteConversation(true)
      return
    }

    const conversationId = selectedId
    setDeletingConversation(true)
    setError(null)

    try {
      await apiDeleteJson<{ archived: boolean }>(`/api/conversations/${conversationId}`)
      setConversations((prev) => prev.filter((conv) => conv.id !== conversationId))
      setSelectedId(null)
      setMessages([])
      setComposer('')
      setThreadMenuOpen(false)
      setConfirmDeleteConversation(false)
      await loadConvs(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed deleting conversation')
    } finally {
      setDeletingConversation(false)
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
                onClick={() => openConversation(conv.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openConversation(conv.id)
                  window.setTimeout(() => setConfirmDeleteConversation(true), 0)
                }}
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
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Conversation actions"
                    onClick={() => {
                      setThreadMenuOpen((open) => !open)
                      setConfirmDeleteConversation(false)
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border: '0.5px solid var(--rule-soft)',
                      background: 'var(--paper)',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      fontSize: 18,
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ⋯
                  </button>
                  {threadMenuOpen && (
                    <>
                      <div
                        onClick={() => {
                          setThreadMenuOpen(false)
                          setConfirmDeleteConversation(false)
                        }}
                        style={{ position: 'fixed', inset: 0, zIndex: 15 }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 8px)',
                          right: 0,
                          width: 210,
                          padding: 8,
                          borderRadius: 14,
                          border: '0.5px solid var(--rule)',
                          background: 'var(--paper)',
                          boxShadow: '0 16px 36px rgba(26,24,21,0.16)',
                          zIndex: 16,
                        }}
                      >
                        {confirmDeleteConversation ? (
                          <div style={{ display: 'grid', gap: 7 }}>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.35 }}>
                              Delete this chat for you?
                            </div>
                            <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                              <KBtn variant="ghost" size="sm" onClick={() => setConfirmDeleteConversation(false)} disabled={deletingConversation}>
                                Keep
                              </KBtn>
                              <KBtn variant="signal" size="sm" onClick={() => void deleteConversation()} disabled={deletingConversation}>
                                {deletingConversation ? 'Deleting…' : 'Yes, delete'}
                              </KBtn>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteConversation(true)}
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              textAlign: 'left',
                              padding: '8px 9px',
                              borderRadius: 10,
                              color: 'var(--signal)',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontFamily: "'IBM Plex Sans'",
                            }}
                          >
                            Delete chat
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>Select a conversation</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Choose from the left or start a new one.</div>
              </div>
            )}
          </div>

          {selectedMeeting && selectedConv?.peer && (
            <CoffeeActionCard
              meeting={selectedMeeting}
              cafes={cafeOptions}
              busy={meetingActionId === selectedMeeting.id}
              onConfirm={() => void updateMeetingStatus(selectedMeeting, 'confirmed')}
              onDecline={() => void updateMeetingStatus(selectedMeeting, 'declined')}
              onCancel={() => void updateMeetingStatus(selectedMeeting, 'cancelled')}
            />
          )}

          {/* Messages */}
          <div
            ref={messagesScrollRef}
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
                const isDeletedMessage = !isOpt(msg) && Boolean(msg.deleted_at)
                const coffeeEvent = isDeletedMessage ? null : coffeeTimelineEventFromContent(msg.content)
                const showAuthor = !coffeeEvent && !msg.is_mine && (!prev || prev.sender_id !== msg.sender_id)

                const msgReactions = (!coffeeEvent && !isDeletedMessage && !isOpt(msg) && msg.reactions) ? msg.reactions : []
                return (
                  <div key={msg.id}>
                    {showDay && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', background: 'rgba(244,239,230,0.9)', border: '0.5px solid var(--rule-soft)', borderRadius: 999, padding: '3px 10px', fontFamily: "'IBM Plex Sans'" }}>
                          {dayLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {coffeeEvent ? (
                      <CoffeeTimelineEventCard
                        event={coffeeEvent}
                        createdAt={msg.created_at}
                        actorName={msg.is_mine ? 'You' : msg.sender?.full_name ?? 'They'}
                      />
                    ) : (
                      <>
                    {showAuthor && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3, marginLeft: 12 }}>
                        {msg.sender?.full_name ?? 'Unknown'}
                      </div>
                    )}
                    <div
                      style={{ display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', marginBottom: 2, alignItems: 'center', gap: 6 }}
                    >
                      {/* Tiny react button — visible on hover, sits to the left of mine, right of others */}
                      {msg.is_mine && hoveredMsgId === msg.id && !isOpt(msg) && !isDeletedMessage && (
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
                      <div
                        style={{ maxWidth: '72%', position: 'relative' }}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                        onContextMenu={(event) => {
                          if (!isOpt(msg) && !isDeletedMessage) {
                            event.preventDefault()
                            setHoveredMsgId(msg.id)
                            setMessageDeleteConfirm({ id: msg.id, scope: msg.is_mine ? 'for-everyone' : 'for-me' })
                          }
                        }}
                      >
                        {/* Bubble */}
                        <div
                          style={{
                            padding: '9px 13px',
                            borderRadius: msg.is_mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: isDeletedMessage ? 'transparent' : msg.is_mine ? 'var(--ink)' : 'var(--paper)',
                            color: isDeletedMessage ? 'var(--ink-faint)' : msg.is_mine ? 'var(--paper)' : 'var(--ink)',
                            border: isDeletedMessage ? '0.5px dashed var(--rule-soft)' : msg.is_mine ? 'none' : '0.5px solid var(--rule-soft)',
                            fontSize: 13.5,
                            lineHeight: 1.5,
                            fontStyle: isDeletedMessage ? 'italic' : 'normal',
                            boxShadow: isDeletedMessage ? 'none' : '0 1px 4px rgba(26,24,21,0.06)',
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{isDeletedMessage ? 'Message deleted' : msg.content}</div>
                          <div style={{ marginTop: 3, fontSize: 10.5, color: msg.is_mine ? 'rgba(244,239,230,0.5)' : 'var(--ink-faint)', textAlign: msg.is_mine ? 'right' : 'left', display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 4 }}>
                            <span>{relativeTime(msg.created_at)}{isOpt(msg) && msg.pending ? ' · Sending…' : ''}{isOpt(msg) && msg.failed ? ' · Failed' : ''}</span>
                            {/* Status ticks for own messages */}
                            {msg.is_mine && !isOpt(msg) && !isDeletedMessage && (
                              <span style={{ color: msg.read_at ? 'var(--verd)' : 'rgba(244,239,230,0.5)', fontSize: 11 }}>
                                {msg.read_at || msg.delivered_at ? '✓✓' : '✓'}
                              </span>
                            )}
                            {!isOpt(msg) && !isDeletedMessage && hoveredMsgId === msg.id && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => void deleteMessage(msg, 'for-me')}
                                  disabled={deletingMessageId === msg.id}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: msg.is_mine ? 'rgba(244,239,230,0.72)' : 'var(--signal)',
                                    cursor: deletingMessageId === msg.id ? 'default' : 'pointer',
                                    fontSize: 10.5,
                                    padding: 0,
                                    fontFamily: "'IBM Plex Sans'",
                                    textDecoration: 'underline',
                                  }}
                                >
                                  {deletingMessageId === msg.id
                                    ? 'Deleting…'
                                    : messageDeleteConfirm?.id === msg.id && messageDeleteConfirm.scope === 'for-me'
                                      ? 'Confirm for me'
                                      : 'Delete for me'}
                                </button>
                                {msg.is_mine && (
                                  <button
                                    type="button"
                                    onClick={() => void deleteMessage(msg, 'for-everyone')}
                                    disabled={deletingMessageId === msg.id}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: msg.is_mine ? 'rgba(244,239,230,0.72)' : 'var(--signal)',
                                      cursor: deletingMessageId === msg.id ? 'default' : 'pointer',
                                      fontSize: 10.5,
                                      padding: 0,
                                      fontFamily: "'IBM Plex Sans'",
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    {deletingMessageId === msg.id
                                      ? 'Deleting…'
                                      : messageDeleteConfirm?.id === msg.id && messageDeleteConfirm.scope === 'for-everyone'
                                        ? 'Confirm everyone'
                                        : 'Delete for everyone'}
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                          {isOpt(msg) && msg.failed && (
                            <button type="button" onClick={() => { setOptimistic((prev) => ({ ...prev, [selectedId!]: (prev[selectedId!] ?? []).filter((m) => m.id !== msg.id) })); void sendMessage(msg.content) }} style={{ fontSize: 10.5, color: 'var(--signal)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3, padding: 0, fontFamily: "'IBM Plex Sans'" }}>Retry</button>
                          )}
                        </div>
                        {/* Reaction picker — drops BELOW the bubble when icon clicked */}
                        {pickerOpenMsgId === msg.id && !isOpt(msg) && !isDeletedMessage && (
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
                      {!msg.is_mine && hoveredMsgId === msg.id && !isOpt(msg) && !isDeletedMessage && (
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
                    </>
                    )}
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
              display: selectedId ? 'block' : 'none',
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
function CoffeeActionCard({
  meeting,
  cafes,
  busy,
  onConfirm,
  onDecline,
  onCancel,
}: {
  meeting: MeetingSummary
  cafes: CafeOption[]
  busy: boolean
  onConfirm: () => void
  onDecline: () => void
  onCancel: () => void
}) {
  const where = meetingLocationLabel(meeting, cafes)
  const when = formatMeetingTime(meeting.scheduled_at)
  const isProposed = meeting.status === 'proposed'
  const isConfirmed = meeting.status === 'confirmed'
  const isIncoming = isProposed && !meeting.am_initiator
  const isOutgoing = isProposed && meeting.am_initiator
  const [confirmCancel, setConfirmCancel] = useState(false)

  const title = isConfirmed ? 'Coffee confirmed' : 'Coffee proposed'
  const status = isConfirmed
    ? 'Both of you confirmed.'
    : isIncoming
      ? 'They are waiting for your response.'
      : 'Waiting for their response.'

  return (
    <div
      style={{
        margin: '0 20px 12px',
        padding: '13px 14px',
        borderRadius: 16,
        border: '0.5px solid rgba(200, 148, 31, 0.28)',
        background: 'linear-gradient(135deg, rgba(250,243,226,0.96), rgba(255,255,255,0.92))',
        boxShadow: '0 14px 34px rgba(58, 45, 25, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ochre)', marginBottom: 5 }}>
          ☕ {title}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>
          {where} · {when}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3 }}>
          {status}
        </div>
        {meeting.note && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 6, fontStyle: 'italic' }}>
            “{meeting.note}”
          </div>
        )}
      </div>

      {isIncoming ? (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <KBtn variant="ghost" size="sm" onClick={onDecline} disabled={busy}>Decline</KBtn>
          <KBtn variant="signal" size="sm" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : 'Accept'}</KBtn>
        </div>
      ) : isOutgoing ? (
        confirmCancel ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Cancel invite?</span>
            <KBtn variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep</KBtn>
            <KBtn variant="signal" size="sm" onClick={onCancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel'}</KBtn>
          </div>
        ) : (
          <KBtn variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel invite</KBtn>
        )
      ) : isConfirmed ? (
        confirmCancel ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Cancel this plan?</span>
            <KBtn variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep</KBtn>
            <KBtn variant="signal" size="sm" onClick={onCancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel'}</KBtn>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--verd)', fontWeight: 600, whiteSpace: 'nowrap' }}>Confirmed</div>
            <KBtn variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel plan</KBtn>
          </div>
        )
      ) : null}
    </div>
  )
}

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
  const [formError, setFormError] = useState<string | null>(null)

  async function submit() {
    if (busy) return

    const normalizedCafeId = cafeId || null
    const normalizedLocationText = locationText.trim()
    const normalizedNote = note.trim()

    if (!normalizedCafeId && !normalizedLocationText) {
      setFormError('Choose a café or add a location.')
      return
    }

    setFormError(null)
    setBusy(true)
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString()
      await onSchedule({
        inviteeId: peerId,
        scheduledAt: iso,
        cafeId: normalizedCafeId,
        locationText: normalizedCafeId ? null : normalizedLocationText,
        note: normalizedNote || null,
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
          <select value={cafeId} onChange={(e) => { setCafeId(e.target.value); setFormError(null) }} style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <option value="">Other / not a partner café</option>
            {cafes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ''}</option>
            ))}
          </select>
        </div>

        {!cafeId && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Location</label>
            <input value={locationText} onChange={(e) => { setLocationText(e.target.value); setFormError(null) }} placeholder="e.g. Tortoise on Türkenstraße" style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
        )}

        {formError && (
          <div style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 10, border: '0.5px solid rgba(181, 83, 63, 0.28)', background: 'rgba(181, 83, 63, 0.08)', color: 'var(--signal-deep)', fontSize: 12.5, lineHeight: 1.35 }}>
            {formError}
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
