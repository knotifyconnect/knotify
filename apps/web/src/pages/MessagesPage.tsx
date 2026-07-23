import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, CircleHelp, Search, SmilePlus, Trash2 } from 'lucide-react'
import { apiDeleteJson, apiGet, apiGetCached, apiPatch, apiPost, getApiCacheSnapshot, setApiCacheSnapshot } from '../lib/api'
import { trackEvent } from '../lib/analytics'
import { KAvatar, KBtn, KCard, KnotifyMark } from '../lib/knotify'
import { supabase } from '../lib/supabase'
import { runWhenIdle } from '../lib/schedule'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { useIsMobile } from '../hooks/useIsMobile'

type UserPreview = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
}

type ConversationSummary = {
  id: string
  created_at: string
  cleared_at?: string | null
  peer: UserPreview | null
  unread_count: number
  latest_message: {
    id: string
    content: string
    created_at: string
    sender_id: string
  } | null
}

type ConversationsCache = {
  conversations: ConversationSummary[]
  current_user_id?: string
}

type ConversationUpdatesResponse = ConversationsCache & {
  server_time: string
}

type MessageReaction = { emoji: string; count: number; mine: boolean }

type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  message_kind?: 'text' | 'ask'
  ask_id?: string | null
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

type RealtimeMessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  message_kind?: 'text' | 'ask'
  ask_id?: string | null
  read_at: string | null
  delivered_at: string | null
  deleted_at?: string | null
  deleted_by?: string | null
  created_at: string
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

function realtimeMessageRow(value: unknown): RealtimeMessageRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<RealtimeMessageRow>
  if (
    typeof row.id !== 'string' ||
    typeof row.conversation_id !== 'string' ||
    typeof row.sender_id !== 'string' ||
    typeof row.content !== 'string' ||
    typeof row.created_at !== 'string'
  ) return null

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content,
    message_kind: row.message_kind ?? 'text',
    ask_id: row.ask_id ?? null,
    read_at: row.read_at ?? null,
    delivered_at: row.delivered_at ?? null,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    created_at: row.created_at,
  }
}

function previewContent(message: Pick<RealtimeMessageRow, 'content' | 'deleted_at' | 'message_kind'>) {
  if (message.deleted_at) return 'Message deleted'
  return message.message_kind === 'ask' ? `Ask for help · ${message.content}` : message.content
}

function mergeMessageList(prev: Message[], next: Message) {
  const existing = prev.find((message) => message.id === next.id)
  const merged = existing
    ? {
        ...existing,
        ...next,
        sender: next.sender ?? existing.sender,
        reactions: existing.reactions ?? next.reactions ?? [],
      }
    : next

  return [
    ...prev.filter((message) => message.id !== next.id),
    merged,
  ].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function dropMatchingOptimistic(
  prev: Record<string, OptimisticMessage[]>,
  conversationId: string,
  serverMessage: Pick<Message, 'sender_id' | 'content' | 'created_at' | 'message_kind'>,
  currentUserId: string | null
) {
  if (
    !currentUserId
    || serverMessage.sender_id !== currentUserId
    || serverMessage.message_kind === 'ask'
  ) return prev

  const list = prev[conversationId] ?? []
  if (!list.length) return prev

  const serverTime = new Date(serverMessage.created_at).getTime()
  let removed = false
  const nextList = list.filter((message) => {
    if (removed || message.failed || message.content !== serverMessage.content) return true

    const localTime = new Date(message.created_at).getTime()
    const closeEnough =
      Number.isNaN(serverTime) ||
      Number.isNaN(localTime) ||
      Math.abs(serverTime - localTime) < 120_000

    if (!closeEnough) return true
    removed = true
    return false
  })

  if (!removed) return prev
  return { ...prev, [conversationId]: nextList }
}

function mergeConversationPreview(
  prev: ConversationSummary[],
  row: RealtimeMessageRow,
  eventType: string,
  currentUserId: string | null,
  activeConversationId: string | null,
  resolvePeer?: (row: RealtimeMessageRow) => UserPreview | null
) {
  let found = false
  const isMine = Boolean(currentUserId && row.sender_id === currentUserId)
  const isActive = activeConversationId === row.conversation_id

  const next = prev.map((conversation) => {
    if (conversation.id !== row.conversation_id) return conversation

    found = true
    const latest = conversation.latest_message
    const shouldUseAsLatest =
      !latest ||
      latest.id === row.id ||
      row.created_at.localeCompare(latest.created_at) >= 0

    const unreadIncrement =
      eventType === 'INSERT' && latest?.id !== row.id && !isMine && !isActive
        ? 1
        : 0

    return {
      ...conversation,
      unread_count: isActive ? 0 : Math.max(0, (conversation.unread_count ?? 0) + unreadIncrement),
      latest_message: shouldUseAsLatest
        ? {
            id: row.id,
            content: previewContent(row),
            created_at: row.created_at,
            sender_id: row.sender_id,
          }
        : latest,
    }
  })

  if (!found) {
    if (eventType !== 'INSERT') return prev

    const seeded: ConversationSummary = {
      id: row.conversation_id,
      created_at: row.created_at,
      cleared_at: null,
      peer: resolvePeer?.(row) ?? null,
      unread_count: !isMine && !isActive ? 1 : 0,
      latest_message: {
        id: row.id,
        content: previewContent(row),
        created_at: row.created_at,
        sender_id: row.sender_id,
      },
    }

    return sortConversations([seeded, ...prev])
  }

  return sortConversations(next)
}

function sortConversations(conversations: ConversationSummary[]) {
  return conversations.sort((a, b) => {
    const aTime = a.latest_message?.created_at ?? a.created_at
    const bTime = b.latest_message?.created_at ?? b.created_at
    return bTime.localeCompare(aTime)
  })
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
  { label: 'Pick a time', message: 'Want to find a time to catch up this week?' },
  { label: 'Ask for intro', message: 'Could you introduce me to someone at your company?' },
  { label: 'Request support', message: 'Would you be willing to write me a short recommendation on knotify?' },
]

const MESSAGE_LANE_STYLE: React.CSSProperties = {
  width: 'min(100%, 880px)',
  margin: '0 auto',
}

function messageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const MOBILE_MESSAGE_LANE_STYLE: React.CSSProperties = {
  width: '100%',
  margin: 0,
}

type CafeOption = {
  id: string
  name: string
  address: string | null
  deal_code?: string | null
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

const CONVERSATIONS_PATH = '/api/conversations'
const MEETINGS_PATH = '/api/meetings'
const CONNECTIONS_PATH = '/api/connections'
const CAFES_PATH = '/api/cafes'
const MESSAGE_UNREAD_TOTAL_EVENT = 'knotify:message-unread-total'
const FAST_CONVERSATION_RECONCILE_GRACE_MS = 15_000
const CONVERSATION_UPDATES_OVERLAP_MS = 5_000

function formatMeetingTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function meetingLocationLabel(meeting: MeetingSummary, cafes: CafeOption[]) {
  const cafe = meeting.cafe ?? cafes.find((c) => c.id === meeting.cafe_id) ?? null
  return cafe?.name ?? meeting.location_text ?? 'Coffee'
}

function coffeeErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : ''
  const message = raw.trim()
  const lower = message.toLowerCase()

  if (lower.includes('only schedule meetings with connections')) {
    return 'You can only plan coffee with people already in your knot.'
  }

  if (lower.includes('choose a café') || lower.includes('choose a cafe') || lower.includes('location')) {
    return 'Choose a partner café or add a custom location.'
  }

  if (lower.includes('cannot meet yourself')) {
    return 'Pick another person. Planning coffee with yourself is called being tired.'
  }

  if (lower.includes('invalid payload') || lower.includes('422')) {
    return 'Check the date, time, and location before sending.'
  }

  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Network issue. Your proposal was not sent. Try again.'
  }

  return message || 'Could not send the coffee proposal. Check the details and try again.'
}

const MSG_ICON_BTN: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)', border: '0.5px solid var(--rule)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  color: 'var(--ink-muted)', boxShadow: '0 2px 6px rgba(26,24,21,0.12)',
}
const MSG_MENU_ITEM: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
  border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--ink)',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

export function MessagesPage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationSummary[]>(() => getApiCacheSnapshot<{ conversations: ConversationSummary[] }>(CONVERSATIONS_PATH)?.conversations ?? [])
  const [connections, setConnections] = useState<Connection[]>(() => getApiCacheSnapshot<{ connections: Connection[] }>(CONNECTIONS_PATH)?.connections ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>({})
  const [optimistic, setOptimistic] = useState<Record<string, OptimisticMessage[]>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getApiCacheSnapshot<ConversationsCache>(CONVERSATIONS_PATH)?.current_user_id ?? null)
  const [loadingConvs, setLoadingConvs] = useState(() => !getApiCacheSnapshot<{ conversations: ConversationSummary[] }>(CONVERSATIONS_PATH))
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [composer, setComposer] = useState('')
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [coffeeOpen, setCoffeeOpen] = useState(false)
  const [cafeOptions, setCafeOptions] = useState<CafeOption[]>(() => getApiCacheSnapshot<{ cafes: CafeOption[] }>(CAFES_PATH)?.cafes ?? [])
  const [meetings, setMeetings] = useState<MeetingSummary[]>(() => getApiCacheSnapshot<{ meetings: MeetingSummary[] }>(MEETINGS_PATH)?.meetings ?? [])
  const [meetingActionId, setMeetingActionId] = useState<string | null>(null)
  const [meetingNow, setMeetingNow] = useState(() => Date.now())
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [pickerOpenMsgId, setPickerOpenMsgId] = useState<string | null>(null)
  const [actionMenuMsgId, setActionMenuMsgId] = useState<string | null>(null)
  const [messageDeleteConfirm, setMessageDeleteConfirm] = useState<{ id: string; scope: MessageDeleteScope } | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false)
  const [deletingConversation, setDeletingConversation] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkUserId = searchParams.get('to')
  const deepLinkAction = searchParams.get('action')
  const deepLinkConversationId = searchParams.get('conversation')
  const deepLinkDraft = searchParams.get('draft')

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const scrollStateRef = useRef<{ conversationId: string | null; lastMessageId: string | null }>({ conversationId: null, lastMessageId: null })
  const scrollIntentRef = useRef<'none' | 'open' | 'own-message'>('none')
  const openCreateInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map())
  const handledDeepLinkRef = useRef<string | null>(null)
  const loadConvsInFlightRef = useRef<Promise<void> | null>(null)
  const loadMeetingsInFlightRef = useRef<Promise<void> | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const selectedConvRef = useRef<ConversationSummary | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  const conversationsRef = useRef<ConversationSummary[]>([])
  const connectionsRef = useRef<Connection[]>([])
  const messagesByConversationRef = useRef<Record<string, Message[]>>({})
  const loadConvsRef = useRef<(keepErr?: boolean) => Promise<void>>(async () => {})
  const loadMsgsRef = useRef<(id: string, keepErr?: boolean, quiet?: boolean) => Promise<void>>(async () => {})
  const loadMeetingsRef = useRef<(keepErr?: boolean) => Promise<void>>(async () => {})
  const markReadRef = useRef<(id: string) => Promise<void>>(async () => {})
  const conversationRefreshTimerRef = useRef<number | null>(null)
  const threadRefreshTimersRef = useRef<Record<string, number>>({})
  const conversationIdsRef = useRef<Set<string>>(new Set())
  const fastConversationUpdatedAtRef = useRef<Record<string, number>>({})
  const conversationUpdatesSinceRef = useRef<string | null>(null)
  const conversationUpdatesInFlightRef = useRef(false)

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  selectedIdRef.current = selectedId

  useEffect(() => {
    if (!isMobile) return
    if (selectedId) document.body.dataset.messageThreadOpen = 'true'
    else delete document.body.dataset.messageThreadOpen
    return () => { delete document.body.dataset.messageThreadOpen }
  }, [isMobile, selectedId])
  selectedConvRef.current = selectedConv
  currentUserIdRef.current = currentUserId
  conversationsRef.current = conversations
  connectionsRef.current = connections
  messagesByConversationRef.current = messagesByConversation
  conversationIdsRef.current = new Set(conversations.map((conversation) => conversation.id))

  const selectedHistoryCleared = Boolean(selectedConv?.cleared_at)

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

  const upcomingMeetings = useMemo(() => {
    return meetings
      .filter((meeting) => {
        const isActionableStatus = meeting.status === 'proposed' || meeting.status === 'confirmed'
        const isUpcoming = new Date(meeting.scheduled_at).getTime() >= meetingNow

        return isActionableStatus && isUpcoming
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, 3)
  }, [meetings, meetingNow])

  const searchQuery = search.trim().toLowerCase()
  const hasSearch = searchQuery.length > 0

  const filteredConvs = useMemo(() => {
    if (!searchQuery) return conversations
    return conversations.filter(
      (c) =>
        c.peer?.full_name?.toLowerCase().includes(searchQuery) ||
        c.peer?.username?.toLowerCase().includes(searchQuery) ||
        c.latest_message?.content?.toLowerCase().includes(searchQuery)
    )
  }, [conversations, searchQuery])

  const acceptedConns = useMemo(
    () => connections.filter((c) => c.status === 'accepted' && c.user),
    [connections]
  )

  const conversationPeerIds = useMemo(
    () => new Set(conversations.map((conversation) => conversation.peer?.id).filter(Boolean)),
    [conversations]
  )

  const filteredNewChatConns = useMemo(() => {
    if (!searchQuery) return []

    return acceptedConns.filter(
      (c) =>
        c.user?.id &&
        !conversationPeerIds.has(c.user.id) &&
        (
          c.user.full_name?.toLowerCase().includes(searchQuery) ||
          c.user.username?.toLowerCase().includes(searchQuery)
        )
    )
  }, [acceptedConns, conversationPeerIds, searchQuery])

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

  function cacheConversations(next: ConversationSummary[]) {
    setApiCacheSnapshot<ConversationsCache>(CONVERSATIONS_PATH, {
      conversations: next,
      current_user_id: currentUserIdRef.current ?? undefined,
    })
  }

  function publishUnreadTotal(next: ConversationSummary[]) {
    if (typeof window === 'undefined') return
    const count = next.reduce((sum, conversation) => sum + (conversation.unread_count ?? 0), 0)
    window.dispatchEvent(new CustomEvent(MESSAGE_UNREAD_TOTAL_EVENT, { detail: { count } }))
  }

  function updateConversations(
    updater: (prev: ConversationSummary[]) => ConversationSummary[],
    touchedConversationIds: string[] = []
  ) {
    setConversations((prev) => {
      const next = updater(prev)
      const touchedAt = Date.now()
      for (const conversationId of touchedConversationIds) {
        fastConversationUpdatedAtRef.current[conversationId] = touchedAt
      }
      conversationsRef.current = next
      conversationIdsRef.current = new Set(next.map((conversation) => conversation.id))
      cacheConversations(next)
      publishUnreadTotal(next)
      return next
    })
  }

  function rememberConversationUpdateTime(value: string) {
    const time = new Date(value).getTime()
    if (Number.isNaN(time)) return
    conversationUpdatesSinceRef.current = new Date(Math.max(0, time - CONVERSATION_UPDATES_OVERLAP_MS)).toISOString()
  }

  function applyConversationSummaries(summaries: ConversationSummary[]) {
    if (!summaries.length) return

    updateConversations((prev) => {
      const byId = new Map(prev.map((conversation) => [conversation.id, conversation]))
      for (const summary of summaries) {
        const existing = byId.get(summary.id)
        byId.set(summary.id, {
          ...summary,
          peer: summary.peer ?? existing?.peer ?? null,
          unread_count: selectedIdRef.current === summary.id ? 0 : summary.unread_count,
        })
      }
      return sortConversations([...byId.values()])
    })
  }

  function mergeRestConversationSnapshot(restConversations: ConversationSummary[], requestStartedAt: number) {
    const localConversations = conversationsRef.current
    const localById = new Map(localConversations.map((conversation) => [conversation.id, conversation]))
    const restIds = new Set(restConversations.map((conversation) => conversation.id))
    const now = Date.now()

    const merged = restConversations.map((serverConversation) => {
      const localConversation = localById.get(serverConversation.id)
      const isSelectedConversation = selectedIdRef.current === serverConversation.id
      const fastUpdatedAt = fastConversationUpdatedAtRef.current[serverConversation.id] ?? 0
      if (!localConversation || fastUpdatedAt <= 0) {
        return isSelectedConversation ? { ...serverConversation, unread_count: 0 } : serverConversation
      }

      const serverLatestAt = serverConversation.latest_message?.created_at ?? serverConversation.created_at
      const localLatestAt = localConversation.latest_message?.created_at ?? localConversation.created_at
      const localHasNewerLatest = localLatestAt.localeCompare(serverLatestAt) > 0
      const shouldPreserveFastState =
        (localHasNewerLatest && fastUpdatedAt > requestStartedAt) ||
        (localHasNewerLatest && now - fastUpdatedAt < FAST_CONVERSATION_RECONCILE_GRACE_MS)

      if (!shouldPreserveFastState) {
        return isSelectedConversation ? { ...serverConversation, unread_count: 0 } : serverConversation
      }

      const latest_message =
        localLatestAt.localeCompare(serverLatestAt) >= 0
          ? localConversation.latest_message
          : serverConversation.latest_message

      return {
        ...serverConversation,
        peer: serverConversation.peer ?? localConversation.peer,
        cleared_at: serverConversation.cleared_at ?? localConversation.cleared_at,
        unread_count: isSelectedConversation
          ? 0
          : localHasNewerLatest ? localConversation.unread_count : serverConversation.unread_count,
        latest_message,
      }
    })

    for (const localConversation of localConversations) {
      const fastUpdatedAt = fastConversationUpdatedAtRef.current[localConversation.id] ?? 0
      const shouldPreserveFastState =
        fastUpdatedAt > requestStartedAt ||
        (fastUpdatedAt > 0 && now - fastUpdatedAt < FAST_CONVERSATION_RECONCILE_GRACE_MS)

      if (!restIds.has(localConversation.id) && shouldPreserveFastState) {
        merged.push(localConversation)
      }
    }

    return sortConversations(merged)
  }

  function peerForRealtimeRow(row: RealtimeMessageRow) {
    const existing = conversationsRef.current.find((conversation) => conversation.id === row.conversation_id)
    if (existing?.peer) return existing.peer

    const selected = selectedConvRef.current
    if (selected?.id === row.conversation_id && selected.peer) return selected.peer

    return connectionsRef.current.find((connection) => connection.user?.id === row.sender_id)?.user ?? null
  }

  function upsertConversationShell(conversationId: string, peer: UserPreview | null, createdAt = new Date().toISOString()) {
    updateConversations(
      (prev) => {
        if (prev.some((conversation) => conversation.id === conversationId)) return prev

        return sortConversations([
          {
            id: conversationId,
            created_at: createdAt,
            cleared_at: null,
            peer,
            unread_count: 0,
            latest_message: null,
          },
          ...prev,
        ])
      },
      [conversationId]
    )
  }

  async function loadConvs(keepErr = false) {
    if (loadConvsInFlightRef.current) return loadConvsInFlightRef.current
    setLoadingConvs(true)
    const requestStartedAt = Date.now()
    const task = (async () => {
      try {
        const res = await apiGet<ConversationsCache>(CONVERSATIONS_PATH)
        if (res.current_user_id) {
          currentUserIdRef.current = res.current_user_id
          setCurrentUserId(res.current_user_id)
        }
        const next = mergeRestConversationSnapshot(res.conversations ?? [], requestStartedAt)
        updateConversations(() => next)
        rememberConversationUpdateTime(new Date(requestStartedAt).toISOString())
        const activeSelectedId = selectedIdRef.current
        if (!next.length) {
          setSelectedId(null)
          setMessages([])
        } else if (activeSelectedId && !next.some((c) => c.id === activeSelectedId)) {
          setSelectedId(null)
          setMessages([])
        }
        if (!keepErr) setError(null)
      } catch (err) {
        if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading')
      } finally {
        setLoadingConvs(false)
        loadConvsInFlightRef.current = null
      }
    })()
    loadConvsInFlightRef.current = task
    return task
  }

  async function loadMsgs(id: string, keepErr = false, quiet = false) {
    if (!quiet) setLoadingMsgs(true)
    try {
      const res = await apiGet<{ messages: Message[] }>(`/api/conversations/${id}/messages`)
      const nextMessages = res.messages ?? []
      setMessagesByConversation((prev) => ({ ...prev, [id]: nextMessages }))
      if (selectedIdRef.current === id) {
        setMessages(nextMessages)
        setOptimistic((prev) => {
          let next = prev
          for (const message of nextMessages) {
            next = dropMatchingOptimistic(next, id, message, currentUserIdRef.current)
          }
          return next
        })
      }
      if (!keepErr) setError(null)
    } catch (err) {
      if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading messages')
    } finally {
      if (!quiet) setLoadingMsgs(false)
    }
  }

  function openConversation(conversationId: string) {
    if (conversationId === selectedId) return
    scrollIntentRef.current = 'open'
    scrollStateRef.current = { conversationId: null, lastMessageId: null }
    setMessages(messagesByConversationRef.current[conversationId] ?? [])
    setOptimistic((prev) => ({ ...prev, [conversationId]: prev[conversationId] ?? [] }))
    updateConversations(
      (prev) => prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    )
    setSelectedId(conversationId)
  }

  async function markRead(id: string) {
    try {
      // Reading the thread here also clears any matching entry server-side
      // (see conversations.ts /:id/read) — invalidate so the notification
      // bell reflects that on its next load instead of serving a stale count.
      await apiPost(`/api/conversations/${id}/read`, {}, { invalidate: '/api/notifications' })
      updateConversations(
        (prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
      )
    } catch { /* best effort */ }
  }

  async function loadMeetings(keepErr = false) {
    if (loadMeetingsInFlightRef.current) return loadMeetingsInFlightRef.current
    const task = (async () => {
      try {
        const res = await apiGet<{ meetings: MeetingSummary[] }>(MEETINGS_PATH)
        setMeetings(res.meetings ?? [])
      } catch (err) {
        if (!keepErr) setError(err instanceof Error ? err.message : 'Failed loading meetings')
      } finally {
        loadMeetingsInFlightRef.current = null
      }
    })()
    loadMeetingsInFlightRef.current = task
    return task
  }

  loadConvsRef.current = loadConvs
  loadMsgsRef.current = loadMsgs
  loadMeetingsRef.current = loadMeetings
  markReadRef.current = markRead

  function scheduleConversationRefresh(delay = 750) {
    if (conversationRefreshTimerRef.current !== null) {
      window.clearTimeout(conversationRefreshTimerRef.current)
    }

    conversationRefreshTimerRef.current = window.setTimeout(() => {
      conversationRefreshTimerRef.current = null
      void loadConvsRef.current(true)
    }, delay)
  }

  function refreshConversationListForRealtime(conversationId: string, wasKnown: boolean) {
    if (wasKnown) return
    void loadConvsRef.current(true)
  }

  function scheduleThreadRefresh(conversationId: string, delay = 1200) {
    const existing = threadRefreshTimersRef.current[conversationId]
    if (existing !== undefined) window.clearTimeout(existing)

    threadRefreshTimersRef.current[conversationId] = window.setTimeout(() => {
      delete threadRefreshTimersRef.current[conversationId]
      if (selectedIdRef.current === conversationId) {
        void loadMsgsRef.current(conversationId, true, true)
      }
    }, delay)
  }

  async function syncConversationUpdates() {
    if (conversationUpdatesInFlightRef.current) return
    if (document.hidden) return

    const since = conversationUpdatesSinceRef.current
    if (!since) return

    conversationUpdatesInFlightRef.current = true
    try {
      const res = await apiGet<ConversationUpdatesResponse>(`${CONVERSATIONS_PATH}/updates?since=${encodeURIComponent(since)}`)
      if (res.current_user_id && res.current_user_id !== currentUserIdRef.current) {
        currentUserIdRef.current = res.current_user_id
        setCurrentUserId(res.current_user_id)
      }
      applyConversationSummaries(res.conversations ?? [])
      if (res.server_time) rememberConversationUpdateTime(res.server_time)
    } catch {
      // Realtime remains primary. Delta sync is best-effort repair, not a UI blocker.
    } finally {
      conversationUpdatesInFlightRef.current = false
    }
  }

  function messageFromRealtime(row: RealtimeMessageRow): Message {
    const activeConversation = selectedConvRef.current?.id === row.conversation_id
      ? selectedConvRef.current
      : null
    const isMine = Boolean(currentUserIdRef.current && row.sender_id === currentUserIdRef.current)

    return {
      ...row,
      sender: !isMine && activeConversation?.peer?.id === row.sender_id ? activeConversation.peer : null,
      is_mine: isMine,
      reactions: [],
    }
  }

  async function scheduleCoffee(payload: { inviteeId: string; scheduledAt: string; cafeId: string | null; locationText: string | null; note: string | null }): Promise<void> {
    if (!selectedId) return

    setError(null)

    const res = await apiPost<{ meeting: MeetingSummary }>('/api/meetings', payload)
    const localMeeting = res.meeting

    setMeetings((prev) => [localMeeting, ...prev.filter((item) => item.id !== localMeeting.id)])
    setCoffeeOpen(false)

    void loadMeetings(true)
    void loadConvs(true)
    if (selectedId) void loadMsgs(selectedId, true, true)
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
    return runWhenIdle(() => {
      void (async () => {
        try { const r = await apiGetCached<{ connections: Connection[] }>(CONNECTIONS_PATH, { ttlMs: 10_000 }); setConnections(r.connections ?? []) } catch { /* noop */ }
        try { const c = await apiGetCached<{ cafes: CafeOption[] }>(CAFES_PATH, { ttlMs: 60_000 }); setCafeOptions(c.cafes ?? []) } catch { /* noop */ }
      })()
    }, 1200)
  }, [])

  useEffect(() => {
    const sync = () => { void syncConversationUpdates() }
    const onVisibilityChange = () => {
      if (!document.hidden) sync()
    }

    // Realtime is primary. This is only a repair loop for missed events, so a
    // one-second database poll added load without making messages feel faster.
    const interval = window.setInterval(sync, 15_000)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', onVisibilityChange)
    sync()

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
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
    void loadMsgs(selectedId, false, true)
    void markRead(selectedId)
  }, [selectedId])

  useEscapeClose(Boolean(selectedId), () => setSelectedId(null), {
    disabled:
      coffeeOpen ||
      threadMenuOpen ||
      Boolean(messageDeleteConfirm) ||
      Boolean(actionMenuMsgId) ||
      Boolean(pickerOpenMsgId) ||
      emojiPickerOpen,
    shouldIgnore: () => Boolean(document.querySelector('.k-overlay, [role="dialog"]')),
  })

  // Realtime is the fast path. REST refetches below verify state, but message paint
  // should not wait on a full thread or conversation-list request.
  useEffect(() => {
    const channel = supabase
      .channel('messages:any')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const eventType = String(payload.eventType ?? '')
        const row = realtimeMessageRow(payload.new ?? payload.old)

        if (!row) {
          scheduleConversationRefresh()
          return
        }

        const activeConversationId = selectedIdRef.current
        const wasKnownConversation = conversationIdsRef.current.has(row.conversation_id)
        const isActiveThread = activeConversationId === row.conversation_id
        const currentUserId = currentUserIdRef.current
        const isMine = Boolean(currentUserId && row.sender_id === currentUserId)

        if (payload.new && eventType === 'INSERT' && !isMine && !row.delivered_at) {
          void apiPost(`/api/conversations/${row.conversation_id}/delivered`, {}).catch(() => {})
        }

        if (isActiveThread && payload.new) {
          const message = messageFromRealtime(row)
          setMessages((prev) => mergeMessageList(prev, message))

          if (!isMine && (eventType === 'INSERT' || !row.read_at)) {
            if (!row.read_at) {
              void markReadRef.current(row.conversation_id)
            }
          }

          scheduleThreadRefresh(row.conversation_id)
        }

        if (payload.new) {
          const message = messageFromRealtime(row)
          setMessagesByConversation((prev) => ({
            ...prev,
            [row.conversation_id]: mergeMessageList(prev[row.conversation_id] ?? [], message),
          }))
          setOptimistic((prev) => dropMatchingOptimistic(prev, row.conversation_id, message, currentUserId))
        }

        updateConversations(
          (prev) => mergeConversationPreview(prev, row, eventType, currentUserId, activeConversationId, peerForRealtimeRow),
          [row.conversation_id]
        )
        refreshConversationListForRealtime(row.conversation_id, wasKnownConversation)
      })
      .subscribe()

    return () => {
      if (conversationRefreshTimerRef.current !== null) {
        window.clearTimeout(conversationRefreshTimerRef.current)
      }
      for (const timer of Object.values(threadRefreshTimersRef.current)) {
        window.clearTimeout(timer)
      }
      threadRefreshTimersRef.current = {}
      void supabase.removeChannel(channel)
    }
  }, [])

  // Reliability path: keep the open thread fresh even if Supabase message realtime
  // misses an event. Keep this single-flight so slow requests cannot pile up.
  useEffect(() => {
    if (!selectedId) return

    const activeConversationId = selectedId
    let disposed = false
    let inFlight = false
    let lastPresenceSync = 0
    let lastBackgroundSync = 0

    async function syncOpenThread() {
      if (disposed || inFlight) return
      if (document.hidden) return

      inFlight = true
      try {
        await loadMsgs(activeConversationId, true, true)

        const now = Date.now()

        // Conversation list and coffee state are useful, but not urgent enough to block
        // every message poll. Refresh them in the background to avoid request dogpiling.
        if (now - lastBackgroundSync > 15000) {
          lastBackgroundSync = now
          void loadConvs(true)
          void loadMeetings(true)
        }

        if (now - lastPresenceSync > 7000) {
          lastPresenceSync = now
          void apiPost(`/api/conversations/${activeConversationId}/delivered`, {}).catch(() => {})
          void markRead(activeConversationId)
        }
      } finally {
        inFlight = false
      }
    }

    void syncOpenThread()
    const interval = window.setInterval(() => { void syncOpenThread() }, 10000)

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
      if (document.hidden) return
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

  // Honor deep links from elsewhere in the app:
  //   ?to=USER_ID[&action=coffee]      — open (or create) the direct chat, optionally the coffee planner
  //   ?conversation=CONV_ID            — open a specific conversation
  //   &draft=TEXT                      — prefill the composer (Relationship OS smart openers)
  // React dev mode can run effects twice, so guard by the exact deep-link key.
  useEffect(() => {
    if (!deepLinkUserId && !deepLinkConversationId) return

    const deepLinkKey = `${deepLinkUserId ?? ''}:${deepLinkConversationId ?? ''}:${deepLinkAction ?? ''}:${deepLinkDraft ?? ''}`
    if (handledDeepLinkRef.current === deepLinkKey) return
    handledDeepLinkRef.current = deepLinkKey

    void (async () => {
      const wantsCoffee = deepLinkAction === 'coffee'
      let conversationId: string | null = null
      if (deepLinkConversationId) {
        conversationId = deepLinkConversationId
        openConversation(deepLinkConversationId)
        if (!conversationIdsRef.current.has(deepLinkConversationId)) void loadConvs(true)
      } else if (deepLinkUserId) {
        conversationId = await openOrCreate(deepLinkUserId)
      }

      if (conversationId && deepLinkDraft) setComposer(deepLinkDraft)

      const next = new URLSearchParams(searchParams)
      next.delete('to')
      next.delete('action')
      next.delete('conversation')
      next.delete('draft')
      setSearchParams(next, { replace: true })

      if (conversationId && wantsCoffee) setTimeout(() => setCoffeeOpen(true), 200)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkUserId, deepLinkAction, deepLinkConversationId, deepLinkDraft])

  async function openOrCreate(userId: string): Promise<string | null> {
    const existingConversation = conversations.find((conv) => conv.peer?.id === userId)
    if (existingConversation) {
      openConversation(existingConversation.id)
      void loadMsgs(existingConversation.id, true, true)
      void markRead(existingConversation.id)
      setSearch('')
      setError(null)
      return existingConversation.id
    }

    const inFlight = openCreateInFlightRef.current.get(userId)
    if (inFlight) {
      const conversationId = await inFlight
      if (conversationId) {
        openConversation(conversationId)
      }
      return conversationId
    }

    const task = (async () => {
      setCreatingFor(userId)
      try {
        const res = await apiPost<{ conversation: { id: string; created_at?: string } }>('/api/conversations', { userId })
        const peer = connectionsRef.current.find((connection) => connection.user?.id === userId)?.user ?? null
        upsertConversationShell(res.conversation.id, peer, res.conversation.created_at)
        openConversation(res.conversation.id)
        void loadConvs(true)
        void loadMsgs(res.conversation.id, true, true)
        void markRead(res.conversation.id)
        setSearch('')
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
    const conversationId = selectedId
    const trimmed = (contentOverride ?? composer).trim()
    if (!trimmed) return

    const nowIso = new Date().toISOString()
    const tempId = `tmp-${Date.now()}`
    const opt: OptimisticMessage = {
      id: tempId, conversation_id: conversationId, sender_id: currentUserIdRef.current ?? 'me',
      content: trimmed, read_at: null, delivered_at: null, deleted_at: null, deleted_by: null, created_at: nowIso,
      sender: null, is_mine: true, pending: true, failed: false, local: true,
      reactions: [],
    }

    if (!contentOverride) setComposer('')
    scrollIntentRef.current = 'own-message'
    setSendLoading(true)
    setOptimistic((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), opt] }))
    updateConversations(
      (prev) => mergeConversationPreview(prev, opt, 'INSERT', currentUserIdRef.current, selectedIdRef.current, peerForRealtimeRow),
      [conversationId]
    )

    try {
      const res = await apiPost<{ message: Message }>(`/api/conversations/${conversationId}/messages`, { content: trimmed })
      const message = { ...res.message, reactions: res.message.reactions ?? [] }
      trackEvent('message_sent')
      setOptimistic((prev) => {
        const reconciled = dropMatchingOptimistic(prev, conversationId, message, currentUserIdRef.current)
        return {
          ...reconciled,
          [conversationId]: (reconciled[conversationId] ?? []).filter((m) => m.id !== tempId),
        }
      })
      if (selectedIdRef.current === conversationId) {
        setMessages((prev) => mergeMessageList(prev, message))
      }
      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: mergeMessageList(prev[conversationId] ?? [], message),
      }))
      updateConversations(
        (prev) => mergeConversationPreview(prev, message, 'INSERT', currentUserIdRef.current, selectedIdRef.current, peerForRealtimeRow),
        [conversationId]
      )
    } catch (err) {
      setOptimistic((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m),
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
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).filter((item) => item.id !== msg.id),
        }))
      } else {
        const res = await apiDeleteJson<{ message: Message; deleted: boolean }>(`/api/conversations/${conversationId}/messages/${msg.id}/for-everyone`)
        const applyDeletedMessage = (items: Message[]) =>
          items.map((item) =>
            item.id === msg.id
              ? { ...item, ...res.message, content: 'Message deleted', reactions: [] }
              : item
          )
        setMessages((prev) => applyDeletedMessage(prev))
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: applyDeletedMessage(prev[conversationId] ?? []),
        }))
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
      updateConversations((prev) => prev.filter((conv) => conv.id !== conversationId))
      setSelectedId(null)
      setMessages([])
      setMessagesByConversation((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
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
    // Optimistic update, toggle locally so the UI responds instantly
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
    <div
      style={{
        height: isMobile ? '100%' : 'calc(100dvh - 104px)',
        minHeight: isMobile ? 0 : 460,
        // The tab bar is hidden (globals.css, body[data-message-thread-open])
        // once a conversation is open — no need to reserve its ~64px here
        // too, or the gap it used to leave behind comes right back.
        paddingBottom: isMobile ? (selectedId ? 'env(safe-area-inset-bottom)' : 'calc(64px + env(safe-area-inset-bottom))') : 0,
        // 'clip' (not 'hidden') — this page is never meant to scroll, and
        // 'hidden' alone doesn't stop a mobile browser from forcibly
        // scrolling it anyway to bring the composer's textarea into view
        // on focus (see AppLayout.tsx for the matching body/html change).
        overflow: 'clip',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* App-shell: one surface split into conversation list + thread.
          Mobile: show EITHER list OR thread (switcher driven by selectedId). */}
      <div
        className="k-messages-shell grid grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)]"
        style={{
          flex: 1,
          minHeight: 0,
          width: 'min(100%, 1440px)',
          margin: '0 auto',
          borderRadius: isMobile ? 20 : 24,
          overflow: 'hidden',
          background: 'rgba(255,252,246,0.92)',
          border: '0.5px solid rgba(26,24,21,0.07)',
          boxShadow: '0 18px 54px rgba(26,24,21,0.11)',
        }}
      >
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <div
          data-tour="message-list"
          className={selectedId ? 'hidden md:flex' : 'flex'}
          style={{ flexDirection: 'column', overflow: 'hidden', borderRight: '0.5px solid rgba(26,24,21,0.08)', background: 'linear-gradient(180deg, rgba(255,252,246,0.96) 0%, rgba(244,239,230,0.82) 100%)' }}
        >
          {/* List header + search */}
          <div style={{ padding: isMobile ? '9px 12px 8px' : '22px 20px 14px' }}>
            {!isMobile && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 25, lineHeight: 1.08, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Messages</h1>
                  {unreadTotal > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: 'var(--signal)', borderRadius: 999, padding: '2px 8px', boxShadow: '0 5px 12px rgba(216,68,43,0.18)' }}>
                      {unreadTotal}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 3, color: 'var(--ink-faint)', fontSize: 12.5, lineHeight: 1.35, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                  Warm intros, thoughtful asks, coffee plans.
                </div>
              </div>
            </div>}
            <div className="k-message-search" style={{ position: 'relative' }}>
              {isMobile && (
                <Search
                  aria-hidden="true"
                  size={15}
                  style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)', pointerEvents: 'none' }}
                />
              )}
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isMobile ? 'Search or start a chat' : 'Search threads or start a new chat'}
                style={{
                  width: '100%',
                  padding: isMobile ? '8px 40px 8px 36px' : '11px 42px 11px 15px',
                  borderRadius: 999,
                  border: '0.5px solid rgba(26,24,21,0.06)',
                  background: 'rgba(238,231,216,0.72)',
                  fontSize: 13.5,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: 'var(--ink)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: 9,
                    transform: 'translateY(-50%)',
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(26,24,21,0.08)',
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 15,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '3px 8px 12px' : '8px 10px 14px' }}>
            {loadingConvs && !conversations.length && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 4px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                Loading…
              </p>
            )}
            {!hasSearch && !filteredConvs.length && !loadingConvs && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 4px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                No conversations yet.
              </p>
            )}
            {hasSearch && filteredConvs.length > 0 && (
              <div style={{ padding: '6px 8px 5px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: "'IBM Plex Mono', monospace" }}>
                Threads
              </div>
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
                  gap: 11,
                  padding: '10px 12px',
                  borderRadius: 16,
                  border: selectedId === conv.id ? '0.5px solid rgba(216,68,43,0.22)' : '0.5px solid transparent',
                  background: selectedId === conv.id ? 'rgba(216,68,43,0.11)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 4,
                  transition: 'background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease',
                  boxShadow: selectedId === conv.id ? '0 10px 24px rgba(216,68,43,0.09)' : 'none',
                }}
              >
                <KAvatar name={conv.peer?.full_name} src={conv.peer?.avatar_url} size={38} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: conv.unread_count > 0 ? 700 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.peer?.full_name ?? 'Unknown'}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', flexShrink: 0 }}>
                      {relativeTime(conv.latest_message?.created_at ?? conv.created_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 7, marginTop: 3 }}>
                    <span style={{ fontSize: 12.5, color: conv.unread_count > 0 ? 'var(--ink)' : 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1.35 }}>
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
            {hasSearch && filteredNewChatConns.length > 0 && (
              <>
                <div style={{ padding: '12px 8px 5px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: "'IBM Plex Mono', monospace" }}>
                  Start a new chat
                </div>
                {filteredNewChatConns.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    disabled={creatingFor === connection.user?.id}
                    onClick={() => connection.user && openOrCreate(connection.user.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '10px 12px',
                      borderRadius: 16,
                      border: '0.5px solid transparent',
                      background: 'rgba(255,252,246,0.58)',
                      cursor: connection.user && creatingFor !== connection.user.id ? 'pointer' : 'default',
                      textAlign: 'left',
                      marginBottom: 4,
                    }}
                  >
                    <KAvatar name={connection.user?.full_name} src={connection.user?.avatar_url} size={38} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {connection.user?.full_name ?? 'Unknown'}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{connection.user?.username} · start thread
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--signal)', flexShrink: 0 }}>
                      {creatingFor === connection.user?.id ? 'Starting…' : 'New'}
                    </span>
                  </button>
                ))}
              </>
            )}
            {hasSearch && !filteredConvs.length && !filteredNewChatConns.length && !loadingConvs && (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 4px', lineHeight: 1.45, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                No threads or connections match “{search.trim()}”.
              </p>
            )}
          </div>
        </div>

        {/* ── Thread ────────────────────────────────────────────────────── */}
        {/* On mobile: hidden when no chat selected */}
        <div
          className={selectedId ? 'flex' : 'hidden md:flex'}
          style={{ flexDirection: 'column', overflow: 'hidden', background: 'rgba(255,252,246,0.94)' }}
        >
          {/* Thread header */}
          <div
            style={{
              padding: '14px clamp(16px, 3vw, 26px)',
              borderBottom: '0.5px solid rgba(26,24,21,0.08)',
              background: 'rgba(255,252,246,0.96)',
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? 10 : 12,
              minHeight: isMobile ? 64 : 72,
            }}
          >
            {selectedConv?.peer ? (
              <>
                {/* Mobile back-to-list */}
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="md:hidden"
                  style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
                  aria-label="Back to chats"
                >
                  ←
                </button>
                <KAvatar name={selectedConv.peer.full_name} src={selectedConv.peer.avatar_url} size={isMobile ? 38 : 42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: isMobile ? 600 : 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedConv.peer.full_name}
                  </div>
                  <div style={{ marginTop: 2, fontSize: isMobile ? 11 : 12, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{selectedConv.peer.username} · in your knot
                  </div>
                </div>
                {/* Plan coffee button — icon-only on mobile */}
                <button
                  type="button"
                  onClick={() => setCoffeeOpen(true)}
                  style={{
                    flexShrink: 0,
                    padding: isMobile ? '0 14px' : '0 16px',
                    width: 'auto',
                    minWidth: isMobile ? 62 : 0,
                    height: 36,
                    borderRadius: 999,
                    border: '0.5px solid var(--signal)',
                    background: 'var(--signal)',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 24px rgba(216,68,43,0.16)',
                  }}
                >
                  <span>{isMobile ? 'Plan' : 'Plan meetup'}</span>
                </button>
                {/* Live coffee status — only when a meeting actually exists */}
                {selectedMeeting && (
                  <div
                    className="hidden sm:block"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--verd-soft)',
                      border: '0.5px solid rgba(31,107,94,0.24)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--verd)',
                      fontFamily: "'IBM Plex Sans'",
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMeetingTime(selectedMeeting.scheduled_at)}{selectedMeeting.status === 'proposed' ? ' · proposed' : ''}
                  </div>
                )}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Conversation actions"
                    onClick={() => {
                      setThreadMenuOpen((open) => !open)
                      setConfirmDeleteConversation(false)
                    }}
                    style={{
                      width: 36,
                      height: 36,
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
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Messages are small acts of trust</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 2 }}>Choose someone from your knot or start a new thread.</div>
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
              padding: isMobile ? '16px 14px 18px' : '22px clamp(14px, 4vw, 46px)',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 10 : 6,
              background: 'linear-gradient(180deg, rgba(250,247,240,0.98) 0%, rgba(244,239,230,0.74) 100%)',
            }}
          >
            {!selectedId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ width: 'min(100%, 560px)', display: 'grid', gap: 14 }}>
                  {upcomingMeetings.length > 0 && (
                    <div style={{ padding: '18px 18px 16px', borderRadius: 22, background: 'rgba(255,252,246,0.82)', border: '0.5px solid rgba(26,24,21,0.08)', boxShadow: '0 14px 40px rgba(26,24,21,0.07)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>
                          Upcoming coffees
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>
                          {upcomingMeetings.length}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 7 }}>
                        {upcomingMeetings.map((meeting) => (
                          <button
                            key={meeting.id}
                            type="button"
                            onClick={() => meeting.peer?.id && openOrCreate(meeting.peer.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 14, border: '0.5px solid rgba(26,24,21,0.07)', background: 'rgba(244,239,230,0.5)', textAlign: 'left', cursor: meeting.peer?.id ? 'pointer' : 'default' }}
                          >
                            <KAvatar name={meeting.peer?.full_name} src={meeting.peer?.avatar_url} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {meeting.peer?.full_name ?? 'Coffee meeting'}
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {formatMeetingTime(meeting.scheduled_at)} · {meeting.cafe?.name ?? meeting.location_text ?? 'Location pending'}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: meeting.status === 'confirmed' ? 'var(--verd)' : 'var(--signal)' }}>
                              {meeting.status === 'confirmed' ? 'Confirmed' : 'Proposed'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center', padding: '30px 32px', borderRadius: 24, background: 'rgba(255,252,246,0.78)', border: '0.5px solid rgba(26,24,21,0.08)', boxShadow: '0 14px 40px rgba(26,24,21,0.07)' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 18, margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: 'var(--signal-soft)', color: 'var(--signal)' }}>
                      <KnotifyMark size={25} color="var(--signal)" />
                    </div>
                    <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 500, color: 'var(--ink)', marginBottom: 7 }}>
                      Pick up a thread
                    </div>
                    <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-muted)', margin: 0 }}>
                      Follow up, ask for an intro, or turn a useful connection into coffee.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null)
                        searchInputRef.current?.focus()
                      }}
                      style={{ marginTop: 18, padding: '9px 16px', borderRadius: 999, border: 'none', background: 'var(--ink)', color: 'var(--paper)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}
                    >
                      Search people
                    </button>
                  </div>
                </div>
              </div>
            ) : loadingMsgs && !displayMessages.length ? (
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13.5, color: 'var(--ink-faint)' }}>
                Loading…
              </p>
            ) : displayMessages.length === 0 ? (
              <div style={{ maxWidth: 420, margin: 'auto', textAlign: 'center', padding: '28px 30px', borderRadius: 24, background: 'rgba(255,252,246,0.78)', border: '0.5px solid rgba(26,24,21,0.08)', boxShadow: '0 14px 40px rgba(26,24,21,0.07)' }}>
                {selectedConv?.peer && !selectedHistoryCleared && (
                  <KAvatar name={selectedConv.peer.full_name} src={selectedConv.peer.avatar_url} size={52} style={{ margin: '0 auto 12px' }} />
                )}
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 15.5, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                  {selectedHistoryCleared
                    ? 'History cleared. New messages will appear here.'
                    : `Start the conversation with ${selectedConv?.peer?.full_name?.split(' ')[0] ?? 'them'}.`}
                </p>
                {!selectedHistoryCleared && (
                  <p style={{ margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}>
                    A small, specific ask is the easiest way to make the knot stronger.
                  </p>
                )}
                {selectedHistoryCleared ? (
                  <p style={{ marginTop: 7, fontSize: 12, lineHeight: 1.45, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
                    This only affects your side of the conversation.
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setComposer(`Hi ${selectedConv?.peer?.full_name?.split(' ')[0] ?? ''}, great to be connected! What are you working on at the moment?`)}
                      style={{ padding: '8px 15px', borderRadius: 999, border: 'none', background: 'var(--ink)', color: 'var(--paper)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}
                    >
                      👋 Say hi
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoffeeOpen(true)}
                      style={{ padding: '8px 15px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}
                    >
                      ☕ Plan coffee
                    </button>
                  </div>
                )}
              </div>
            ) : (
              displayMessages.map((msg, i) => {
                const prev = displayMessages[i - 1]
                const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(msg.created_at)
                const isDeletedMessage = !isOpt(msg) && Boolean(msg.deleted_at)
                const askCard = !isDeletedMessage && !isOpt(msg) && msg.message_kind === 'ask' && Boolean(msg.ask_id)
                const coffeeEvent = isDeletedMessage || askCard ? null : coffeeTimelineEventFromContent(msg.content)
                const showAuthor = !coffeeEvent && !askCard && !msg.is_mine && (!prev || prev.sender_id !== msg.sender_id)

                const msgReactions = (!coffeeEvent && !askCard && !isDeletedMessage && !isOpt(msg) && msg.reactions) ? msg.reactions : []
                // Last couple of messages open their popovers upward so they don't
                // overflow behind the composer / quick-actions.
                const nearBottom = i >= displayMessages.length - 2
                const popoverVertical: React.CSSProperties = nearBottom
                  ? { bottom: 'calc(100% + 6px)' }
                  : { top: 'calc(100% + 6px)' }
                return (
                  <div key={msg.id} style={isMobile ? MOBILE_MESSAGE_LANE_STYLE : MESSAGE_LANE_STYLE}>
                    {showDay && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', background: 'rgba(255,252,246,0.86)', border: '0.5px solid var(--rule-soft)', borderRadius: 999, padding: '4px 11px', fontFamily: "'IBM Plex Sans'" }}>
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
                    ) : askCard ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/asks?ask=${msg.ask_id}`)}
                        style={{
                          width: 'min(100%, 470px)',
                          margin: msg.is_mine ? '0 0 6px auto' : '0 auto 6px 0',
                          padding: '13px 14px',
                          display: 'grid',
                          gridTemplateColumns: '34px minmax(0, 1fr) 24px',
                          alignItems: 'center',
                          gap: 11,
                          color: 'var(--ink)',
                          textAlign: 'left',
                          background: 'linear-gradient(135deg, rgba(216,68,43,0.10), rgba(255,252,246,0.96))',
                          border: '0.5px solid rgba(216,68,43,0.28)',
                          borderRadius: 16,
                          boxShadow: '0 10px 24px rgba(26,24,21,0.07)',
                          cursor: 'pointer',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                        aria-label="Open Ask ticket"
                      >
                        <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', color: 'var(--signal)', background: 'rgba(216,68,43,0.10)', borderRadius: 11 }}>
                          <CircleHelp size={18} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', fontSize: 12.5, color: 'var(--signal)' }}>Ask for help</strong>
                          <span style={{ display: '-webkit-box', marginTop: 3, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, fontSize: 13.5, lineHeight: 1.4 }}>
                            {msg.content}
                          </span>
                          <small style={{ display: 'block', marginTop: 5, color: 'var(--ink-faint)', fontSize: 10.5 }}>
                            {messageTime(msg.created_at)} · Open ticket
                          </small>
                        </span>
                        <ArrowUpRight size={16} style={{ color: 'var(--signal)' }} />
                      </button>
                    ) : (
                      <>
                    {showAuthor && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 3, marginLeft: 12 }}>
                        {msg.sender?.full_name ?? 'Unknown'}
                      </div>
                    )}
                    <div
                      style={{ display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', marginBottom: 4, paddingLeft: msg.is_mine ? 44 : 0, paddingRight: msg.is_mine ? 0 : 44 }}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                    >
                      <div
                        style={{ maxWidth: 'min(76%, 560px)', position: 'relative' }}
                        onContextMenu={(event) => {
                          if (!isOpt(msg) && !isDeletedMessage) {
                            event.preventDefault()
                            setHoveredMsgId(msg.id)
                            setMessageDeleteConfirm({ id: msg.id, scope: msg.is_mine ? 'for-everyone' : 'for-me' })
                          }
                        }}
                      >
                        {/* Hover actions — absolutely positioned so hover never resizes the bubble */}
                        {hoveredMsgId === msg.id && !isOpt(msg) && !isDeletedMessage && (
                          <div style={{ position: 'absolute', top: 2, [msg.is_mine ? 'left' : 'right']: -60, display: 'flex', gap: 4, zIndex: 4 }}>
                            <button
                              type="button"
                              onClick={() => { setPickerOpenMsgId(pickerOpenMsgId === msg.id ? null : msg.id); setActionMenuMsgId(null) }}
                              aria-label="Add reaction"
                              style={MSG_ICON_BTN}
                            >
                              <SmilePlus size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setActionMenuMsgId(actionMenuMsgId === msg.id ? null : msg.id); setPickerOpenMsgId(null) }}
                              aria-label="Message actions"
                              style={MSG_ICON_BTN}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                        {/* Delete menu */}
                        {actionMenuMsgId === msg.id && !isOpt(msg) && !isDeletedMessage && (
                          <>
                            <div onClick={() => setActionMenuMsgId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                            <div style={{ position: 'absolute', ...popoverVertical, [msg.is_mine ? 'right' : 'left']: 0, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12, boxShadow: '0 8px 24px rgba(26,24,21,0.18)', zIndex: 10, padding: 6, minWidth: 160 }}>
                              <button type="button" onClick={() => { void deleteMessage(msg, 'for-me'); setActionMenuMsgId(null) }} disabled={deletingMessageId === msg.id} style={MSG_MENU_ITEM}>Delete for me</button>
                              {msg.is_mine && (
                                <button type="button" onClick={() => { void deleteMessage(msg, 'for-everyone'); setActionMenuMsgId(null) }} disabled={deletingMessageId === msg.id} style={{ ...MSG_MENU_ITEM, color: 'var(--signal)' }}>Delete for everyone</button>
                              )}
                            </div>
                          </>
                        )}
                        {/* Bubble */}
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: msg.is_mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
                            background: isDeletedMessage ? 'transparent' : msg.is_mine ? 'var(--ink)' : 'rgba(238,231,216,0.92)',
                            color: isDeletedMessage ? 'var(--ink-faint)' : msg.is_mine ? 'var(--paper)' : 'var(--ink)',
                            border: isDeletedMessage ? '0.5px dashed var(--rule-soft)' : 'none',
                            fontSize: 14,
                            lineHeight: 1.5,
                            fontStyle: isDeletedMessage ? 'italic' : 'normal',
                            boxShadow: isDeletedMessage ? 'none' : msg.is_mine ? '0 10px 22px rgba(26,24,21,0.12)' : '0 8px 18px rgba(26,24,21,0.06)',
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{isDeletedMessage ? 'Message deleted' : msg.content}</div>
                          <div style={{ marginTop: 3, fontSize: 10.5, color: msg.is_mine ? 'rgba(244,239,230,0.5)' : 'var(--ink-faint)', textAlign: msg.is_mine ? 'right' : 'left', display: 'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 4 }}>
                            <span title={new Date(msg.created_at).toLocaleString()}>{messageTime(msg.created_at)} · {relativeTime(msg.created_at)}{isOpt(msg) && msg.pending ? ' · Sending…' : ''}{isOpt(msg) && msg.failed ? ' · Failed' : ''}</span>
                            {/* Status ticks for own messages */}
                            {msg.is_mine && !isOpt(msg) && !isDeletedMessage && (
                              <span style={{ color: msg.read_at ? 'var(--verd)' : 'rgba(244,239,230,0.5)', fontSize: 11 }}>
                                {msg.read_at || msg.delivered_at ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                          {isOpt(msg) && msg.failed && (
                            <button type="button" onClick={() => { setOptimistic((prev) => ({ ...prev, [selectedId!]: (prev[selectedId!] ?? []).filter((m) => m.id !== msg.id) })); void sendMessage(msg.content) }} style={{ fontSize: 10.5, color: 'var(--signal)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3, padding: 0, fontFamily: "'IBM Plex Sans'" }}>Retry</button>
                          )}
                        </div>
                        {/* Reaction picker, drops BELOW the bubble when icon clicked */}
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
                                ...popoverVertical,
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
                padding: isMobile ? '6px 14px 4px' : '9px clamp(14px, 4vw, 46px)',
                borderTop: '0.5px solid rgba(26,24,21,0.07)',
                scrollbarWidth: 'none',
                background: 'rgba(255,252,246,0.78)',
              }}
            >
              <div style={{ ...(isMobile ? MOBILE_MESSAGE_LANE_STYLE : MESSAGE_LANE_STYLE), display: 'flex', gap: isMobile ? 6 : 7, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
                {QUICK_ACTIONS.map(({ label, message }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void sendMessage(message)}
                    style={{
                      padding: isMobile ? '6px 11px' : '6px 12px',
                      borderRadius: 999,
                      border: '0.5px solid rgba(26,24,21,0.1)',
                      background: 'rgba(255,255,255,0.9)',
                      fontSize: isMobile ? 11.25 : 12,
                      color: 'var(--ink-soft)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      transition: 'all 0.12s ease',
                      flexShrink: 0,
                      boxShadow: '0 5px 14px rgba(26,24,21,0.04)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.9)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <div
            data-tour="message-compose"
            style={{
              padding: isMobile ? '5px 14px calc(7px + env(safe-area-inset-bottom))' : '12px clamp(14px, 4vw, 46px) 14px',
              borderTop: '0.5px solid rgba(26,24,21,0.07)',
              background: 'rgba(255,252,246,0.96)',
              display: selectedId ? 'block' : 'none',
            }}
          >
            <div style={isMobile ? MOBILE_MESSAGE_LANE_STYLE : MESSAGE_LANE_STYLE}>
              {!isMobile && lastMineLabel && (
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', textAlign: 'right', marginBottom: 4, paddingRight: 4, fontFamily: "'IBM Plex Mono'" }}>
                  {lastMineLabel}
                </div>
              )}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: isMobile ? 8 : 10 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={composer}
                  onChange={(e) => {
                    setComposer(e.target.value.slice(0, 4000))
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedId ? (isMobile ? 'Type a message…' : 'Type a message… (Enter to send, Shift+Enter for newline)') : 'Select a conversation first'}
                  disabled={!selectedId || sendLoading}
                  rows={1}
                  style={{
                    width: '100%',
                    minHeight: isMobile ? 46 : 44,
                    maxHeight: 120,
                    resize: 'none',
                    borderRadius: isMobile ? 22 : 22,
                    border: '0.5px solid rgba(26,24,21,0.1)',
                    background: isMobile ? 'rgba(255,255,255,0.94)' : 'rgba(238,231,216,0.7)',
                    padding: isMobile ? '12px 42px 10px 15px' : '11px 42px 11px 16px',
                    fontSize: isMobile ? 13.5 : 14,
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
                <div style={{ position: 'absolute', right: isMobile ? 9 : 8, top: isMobile ? 9 : undefined, bottom: isMobile ? undefined : 9 }}>
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen((p) => !p)}
                    style={{ width: isMobile ? 28 : 'auto', height: isMobile ? 28 : 'auto', borderRadius: 999, background: isMobile ? 'rgba(244,239,230,0.95)' : 'none', border: isMobile ? '0.5px solid rgba(26,24,21,0.08)' : 'none', fontSize: isMobile ? 15 : 16, cursor: 'pointer', padding: isMobile ? 0 : 2, color: isMobile ? 'var(--ink-muted)' : 'var(--ink-faint)', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
                  style={{ flexShrink: 0, alignSelf: 'stretch', minHeight: isMobile ? 46 : 44, minWidth: isMobile ? 76 : 84, borderRadius: 22, padding: isMobile ? '0 18px' : '0 20px', fontSize: isMobile ? 13.5 : undefined, boxShadow: '0 10px 24px rgba(216,68,43,0.16)' }}
              >
                Send
              </KBtn>
            </div>
            </div>
          </div>
        </div>
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

  const title = isConfirmed ? 'Coffee confirmed' : isOutgoing ? 'Coffee proposal sent' : 'Coffee proposed'
  const status = isConfirmed
    ? 'Both of you confirmed. This is now a real plan, not networking theater.'
    : isIncoming
      ? 'Review the time and place, then accept or decline.'
      : 'Waiting for their response. The card is live in this chat.'

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
        {isConfirmed && meeting.am_initiator && meeting.cafe?.deal_code && (
          <div style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 9, background: 'var(--paper)', border: '0.5px solid rgba(200, 148, 31, 0.36)', color: 'var(--ochre)', fontSize: 12.5 }}>
            <span style={{ fontWeight: 600 }}>Partner deal code</span>
            <code style={{ fontSize: 13, fontWeight: 700, userSelect: 'all' }}>{meeting.cafe.deal_code}</code>
          </div>
        )}
      </div>

      {isIncoming ? (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <KBtn variant="ghost" size="sm" onClick={onDecline} disabled={busy}>{busy ? 'Saving…' : 'Decline'}</KBtn>
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
  const [locationMode, setLocationMode] = useState<'partner' | 'custom'>(() => (cafes.length ? 'partner' : 'custom'))
  const [cafeId, setCafeId] = useState<string>('')
  const [locationText, setLocationText] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const usingPartnerCafe = locationMode === 'partner'
  const canUsePartnerCafe = cafes.length > 0

  async function submit() {
    if (busy) return

    const normalizedCafeId = usingPartnerCafe ? cafeId || null : null
    const normalizedLocationText = usingPartnerCafe ? '' : locationText.trim()
    const normalizedNote = note.trim()
    const scheduledAt = new Date(date + 'T' + time + ':00')

    if (Number.isNaN(scheduledAt.getTime())) {
      setFormError('Pick a valid date and time.')
      return
    }

    if (scheduledAt.getTime() <= Date.now() + 5 * 60 * 1000) {
      setFormError('Pick a time at least a few minutes from now.')
      return
    }

    if (usingPartnerCafe && !normalizedCafeId) {
      setFormError('Choose a partner café or switch to custom location.')
      return
    }

    if (!usingPartnerCafe && !normalizedLocationText) {
      setFormError('Add a custom location or switch to partner café.')
      return
    }

    setFormError(null)
    setBusy(true)

    try {
      await onSchedule({
        inviteeId: peerId,
        scheduledAt: scheduledAt.toISOString(),
        cafeId: normalizedCafeId,
        locationText: normalizedCafeId ? null : normalizedLocationText,
        note: normalizedNote || null,
      })
    } catch (err) {
      setFormError(coffeeErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={() => {
        if (!busy) onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(26,24,21,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 500,
          background: 'var(--paper)',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 28px 90px rgba(26,24,21,0.28)',
          border: '0.5px solid var(--rule-soft)',
        }}
      >
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ochre)', fontWeight: 700, marginBottom: 7 }}>
          Coffee proposal
        </div>

        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, marginBottom: 5, letterSpacing: -0.35, color: 'var(--ink)' }}>
          Plan coffee with <span style={{ fontStyle: 'italic' }}>{peerName}</span>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 18px', lineHeight: 1.45 }}>
          Send a clear time and place. They respond from the coffee card in this chat.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Date</label>
            <input disabled={busy} type="date" value={date} onChange={(e) => { setDate(e.target.value); setFormError(null) }} style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
          <div>
            <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Time</label>
            <input disabled={busy} type="time" value={time} onChange={(e) => { setTime(e.target.value); setFormError(null) }} style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 7 }}>Place</label>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              disabled={busy || !canUsePartnerCafe}
              onClick={() => {
                setLocationMode('partner')
                setFormError(null)
              }}
              style={{
                flex: 1,
                padding: '9px 11px',
                borderRadius: 999,
                border: usingPartnerCafe ? '0.5px solid var(--ochre)' : '0.5px solid var(--rule)',
                background: usingPartnerCafe ? 'var(--ochre-soft)' : 'var(--paper-soft)',
                color: usingPartnerCafe ? 'var(--ochre)' : 'var(--ink-muted)',
                cursor: busy || !canUsePartnerCafe ? 'not-allowed' : 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "'IBM Plex Sans', sans-serif",
                opacity: canUsePartnerCafe ? 1 : 0.45,
              }}
            >
              Partner café
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setLocationMode('custom')
                setFormError(null)
              }}
              style={{
                flex: 1,
                padding: '9px 11px',
                borderRadius: 999,
                border: !usingPartnerCafe ? '0.5px solid var(--ochre)' : '0.5px solid var(--rule)',
                background: !usingPartnerCafe ? 'var(--ochre-soft)' : 'var(--paper-soft)',
                color: !usingPartnerCafe ? 'var(--ochre)' : 'var(--ink-muted)',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              Custom location
            </button>
          </div>

          {usingPartnerCafe ? (
            <select disabled={busy} value={cafeId} onChange={(e) => { setCafeId(e.target.value); setFormError(null) }} style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              <option value="">Choose a café</option>
              {cafes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.address ? ', ' + c.address : ''}</option>
              ))}
            </select>
          ) : (
            <input disabled={busy} value={locationText} onChange={(e) => { setLocationText(e.target.value); setFormError(null) }} placeholder="e.g. Tortoise on Türkenstraße" style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Optional note</label>
          <textarea disabled={busy} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="What you want to chat about" style={{ width: '100%', minHeight: 68, padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: "'IBM Plex Sans', sans-serif" }} />
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'right' }}>
            {note.length}/200
          </div>
        </div>

        {(formError || busy) && (
          <div
            aria-live="polite"
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 12,
              border: busy ? '0.5px solid rgba(200, 148, 31, 0.25)' : '0.5px solid rgba(181, 83, 63, 0.28)',
              background: busy ? 'rgba(200, 148, 31, 0.09)' : 'rgba(181, 83, 63, 0.08)',
              color: busy ? 'var(--ochre)' : 'var(--signal-deep)',
              fontSize: 12.5,
              lineHeight: 1.35,
            }}
          >
            {busy ? 'Sending proposal… creating the coffee card now.' : formError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <KBtn variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={submit} disabled={busy}>
            {busy ? 'Sending proposal…' : 'Send proposal'}
          </KBtn>
        </div>
      </div>
    </div>
  )
}
