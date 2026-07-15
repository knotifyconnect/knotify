import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDelete, apiGet, apiGetCached, apiPatch, apiPost, getApiCacheSnapshot } from '../lib/api'
import { runWhenIdle } from '../lib/schedule'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { ShareInviteButton } from '../components/ShareInviteButton'
import type { KnotGraphNode, KnotGraphPeerEdge, KnotHealthState } from '../components/knot/KnotForceGraph'
import { KnotMobileGraph, MobileBottomSheet, MobileNodeOverlay, type MeNode } from '../components/knot/KnotMobileGraph'
import 'leaflet/dist/leaflet.css'

const KnotForceGraph = lazy(() => import('../components/knot/KnotForceGraph').then((m) => ({ default: m.KnotForceGraph })))

type UserStatus = 'studying' | 'open_to_work' | 'employed' | string
type ConnectionStatus = 'pending' | 'accepted' | 'declined'

type ConnectionUser = {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  headline?: string | null
  location_city?: string | null
  university?: string | null
  current_company?: string | null
  status?: UserStatus | null
}

type Connection = {
  id: string
  requester_id: string
  addressee_id: string
  status: ConnectionStatus
  created_at: string
  updated_at: string
  user: ConnectionUser | null
}

type MeResponse = {
  user: ConnectionUser
}

type ConnectionsResponse = {
  connections: Connection[]
}

type PeerEdge = {
  id: string
  source_id: string
  target_id: string
  status: 'accepted'
}

type ConnectionMapResponse = {
  firstDegreeNodes: Array<{
    id: string
    full_name: string | null
    username: string | null
    avatar_url: string | null
    current_company?: string | null
  }>
  peerEdges?: PeerEdge[]
}

type ExpandedKnotNode = {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  headline?: string | null
  location_city?: string | null
  university?: string | null
  current_company?: string | null
  status?: UserStatus | null
}

type ExpandedKnotResponse = {
  rootUserId: string
  secondDegreeNodes: ExpandedKnotNode[]
  secondDegreeEdges: PeerEdge[]
  peerEdges: PeerEdge[]
}

type ConnectionMutationResponse = {
  connection: Connection
  autoAccepted?: boolean
  alreadyConnected?: boolean
}

/** Per-connection signals from the Relationship OS engine, rendered on graph nodes. */
type KnotSignals = {
  health: KnotHealthState
  daysSince: number
  hasOpenAsk: boolean
  hasCoffee: boolean
  needsFollowUp: boolean
}

type RelationshipTab = 'Connected' | 'Incoming' | 'Sent'
type StatusFilter = 'All' | 'open_to_work' | 'studying' | 'employed'

const RELATIONSHIP_TABS: RelationshipTab[] = ['Connected', 'Incoming', 'Sent']
const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'Any status' },
  { value: 'open_to_work', label: 'Open' },
  { value: 'studying', label: 'Studying' },
  { value: 'employed', label: 'Employed' },
]

function clean(value?: string | null) {
  return value?.trim() || ''
}

function firstName(value?: string | null) {
  return clean(value).split(' ')[0] || 'Someone'
}

function statusLabel(status?: UserStatus | null) {
  if (status === 'open_to_work') return 'Open to work'
  if (status === 'employed') return 'Employed'
  if (status === 'studying') return 'Studying'
  return clean(status) || 'Profile'
}

function formatDate(value?: string | null) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function searchableText(connection: Connection) {
  const user = connection.user
  return [
    user?.full_name,
    user?.username,
    user?.headline,
    user?.location_city,
    user?.university,
    user?.current_company,
    user?.status,
    connection.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function relationLabel(tab: RelationshipTab) {
  if (tab === 'Incoming') return 'Needs decision'
  if (tab === 'Sent') return 'Waiting'
  return 'In your knot'
}

function relationTone(tab: RelationshipTab) {
  if (tab === 'Incoming') {
    return {
      background: 'var(--verd-soft)',
      color: 'var(--verd)',
      border: 'rgba(31,107,94,0.28)',
    }
  }

  if (tab === 'Sent') {
    return {
      background: 'var(--signal-soft)',
      color: 'var(--signal)',
      border: 'rgba(216,68,43,0.28)',
    }
  }

  return {
    background: 'var(--paper-soft)',
    color: 'var(--ink-muted)',
    border: 'var(--rule)',
  }
}

function userContext(user?: ConnectionUser | null) {
  if (!user) return 'No profile context yet'
  return (
    clean(user.headline) ||
    clean(user.current_company) ||
    clean(user.university) ||
    clean(user.location_city) ||
    statusLabel(user.status)
  )
}

function relationshipReason(connection: Connection, tab: RelationshipTab) {
  const user = connection.user
  const name = firstName(user?.full_name)
  const context = userContext(user)

  if (tab === 'Incoming') return `${name} asked to connect. Accept only if the context is real.`
  if (tab === 'Sent') return `You reached out to ${name}. Waiting for them to respond.`

  if (clean(user?.headline)) return clean(user?.headline)
  if (clean(user?.current_company)) return `Connected through ${clean(user?.current_company)} context.`
  if (clean(user?.university)) return `Connected through ${clean(user?.university)} context.`
  if (clean(user?.location_city)) return `Connected through ${clean(user?.location_city)} context.`
  if (context !== 'Profile') return `Connected profile: ${context}.`

  return 'Connected, but profile context is still thin. Open the profile before asking for help.'
}

function nextAction(connection: Connection, tab: RelationshipTab) {
  const user = connection.user
  const hasRealContext =
    Boolean(clean(user?.headline)) ||
    Boolean(clean(user?.current_company)) ||
    Boolean(clean(user?.university)) ||
    Boolean(clean(user?.location_city))

  if (tab === 'Incoming') return 'Open the profile first. Accept only if this relationship can become useful.'
  if (tab === 'Sent') return 'Do not spam. Wait unless you have a specific reason to follow up.'
  if (!hasRealContext) return 'This connection is weakly contextualized. Add memory before asking for help.'
  return 'Keep this person warm with a specific reason: advice, referral path, project overlap, or local context.'
}

function emptyMessage(tab: RelationshipTab, hasQuery: boolean) {
  if (hasQuery) {
    return {
      title: 'No match found.',
      body: 'Try searching by name, username, headline, city, university, company, or status.',
    }
  }

  if (tab === 'Incoming') {
    return {
      title: 'No requests need your decision.',
      body: 'Nothing is waiting on you right now.',
    }
  }

  if (tab === 'Sent') {
    return {
      title: 'No requests waiting.',
      body: 'When you send connection requests from Discover, they will appear here.',
    }
  }

  return {
    title: 'No one is in your knot yet.',
    body: 'Start from Discover and connect with people who have real context.',
  }
}

function otherUserId(connection: Connection, meId: string | null) {
  return connection.user?.id ?? (connection.requester_id === meId ? connection.addressee_id : connection.requester_id)
}

const ME_PATH = '/api/users/me'
const CONNECTIONS_PATH = '/api/connections'
const CONNECTION_MAP_PATH = '/api/connections/map'
const RELATIONSHIP_HOME_PATH = '/api/relationship-home'

function measureDev<T>(label: string, fn: () => T): T {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return fn()
  const startedAt = performance.now()
  const value = fn()
  console.debug(`[perf] ${label}: ${Math.round(performance.now() - startedAt)}ms`)
  return value
}

export function MapPage() {
  const navigate = useNavigate()
  const cachedMe = getApiCacheSnapshot<MeResponse>(ME_PATH)
  const cachedConnections = getApiCacheSnapshot<ConnectionsResponse>(CONNECTIONS_PATH)
  const cachedMap = getApiCacheSnapshot<ConnectionMapResponse>(CONNECTION_MAP_PATH)
  const [meId, setMeId] = useState<string | null>(() => cachedMe?.user.id ?? null)
  const [meUser, setMeUser] = useState<ConnectionUser | null>(() => cachedMe?.user ?? null)
  const [connections, setConnections] = useState<Connection[]>(() => cachedConnections?.connections ?? [])
  const [peerEdges, setPeerEdges] = useState<PeerEdge[]>(() => cachedMap?.peerEdges ?? [])
  const [expandedRootUserId, setExpandedRootUserId] = useState<string | null>(null)
  const [expandedSecondDegreeNodes, setExpandedSecondDegreeNodes] = useState<ExpandedKnotNode[]>([])
  const [expandedSecondDegreeEdges, setExpandedSecondDegreeEdges] = useState<PeerEdge[]>([])
  const [expandedPeerEdges, setExpandedPeerEdges] = useState<PeerEdge[]>([])
  const [expandingUserId, setExpandingUserId] = useState<string | null>(null)
  const [expandError, setExpandError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RelationshipTab>('Connected')
  const [query, setQuery] = useState('')
  const [graphResetToken, setGraphResetToken] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [selectedSecondDegreeUserId, setSelectedSecondDegreeUserId] = useState<string | null>(null)
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null)
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => !cachedConnections)
  const [error, setError] = useState<string | null>(null)
  const [isMobileTop, setIsMobileTop] = useState(() => window.innerWidth < 768)
  const [networkSheetOpen, setNetworkSheetOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const h = (e: MediaQueryListEvent) => setIsMobileTop(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  const [signalsByUserId, setSignalsByUserId] = useState<Map<string, KnotSignals>>(new Map())
  const [accepting, setAccepting] = useState<Record<string, boolean>>({})
  const [removing, setRemoving] = useState<Record<string, boolean>>({})

  async function loadRelationships() {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setLoading(true)
    setError(null)

    try {
      const [meResult, connectionResult, mapResult] = await Promise.all([
        apiGetCached<MeResponse>(ME_PATH, { ttlMs: 30_000 }),
        apiGetCached<ConnectionsResponse>(CONNECTIONS_PATH, { ttlMs: 10_000 }),
        apiGetCached<ConnectionMapResponse>(CONNECTION_MAP_PATH, { ttlMs: 10_000 }),
      ])

      setMeId(meResult.user.id)
      setMeUser(meResult.user)
      setConnections(connectionResult.connections ?? [])
      setPeerEdges(mapResult.peerEdges ?? [])

      // Load engine signals separately, never blocks knot from rendering.
      // The graph reflects the Relationship OS: warmth, open asks, booked
      // coffees and pending follow-ups all render on the nodes.
      runWhenIdle(() => {
        apiGetCached<{
          ranked: Array<{
            peerId: string
            state: 'warm' | 'cooling' | 'cold' | 'new'
            signals: { daysSince: number; hasOpenAsk?: boolean; hasUpcomingMeeting?: boolean; needsFollowUp?: boolean }
          }>
        }>(RELATIONSHIP_HOME_PATH, { ttlMs: 10_000 })
          .then((homeResult) => {
            const map = new Map<string, KnotSignals>()
            for (const entry of homeResult.ranked ?? []) {
              map.set(entry.peerId, {
                health:        entry.state,
                daysSince:     entry.signals?.daysSince ?? 0,
                hasOpenAsk:    !!entry.signals?.hasOpenAsk,
                hasCoffee:     !!entry.signals?.hasUpcomingMeeting,
                needsFollowUp: !!entry.signals?.needsFollowUp,
              })
            }
            setSignalsByUserId(map)
            if (import.meta.env.DEV && typeof performance !== 'undefined') {
              console.debug(`[perf] Your Knot signals loaded: ${Math.round(performance.now() - startedAt)}ms`)
            }
          })
          .catch(() => { /* engine signals are non-critical */ })
      })
      setExpandedRootUserId(null)
      setExpandedSecondDegreeNodes([])
      setExpandedSecondDegreeEdges([])
      setExpandedPeerEdges([])
      setExpandError(null)
      setSelectedSecondDegreeUserId(null)
      setRequestFeedback(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Your Knot')
      setConnections([])
      setPeerEdges([])
      setExpandedRootUserId(null)
      setExpandedSecondDegreeNodes([])
      setExpandedSecondDegreeEdges([])
      setExpandedPeerEdges([])
      setExpandError(null)
    } finally {
      setLoading(false)
      if (import.meta.env.DEV && typeof performance !== 'undefined') {
        console.debug(`[perf] Your Knot critical data loaded: ${Math.round(performance.now() - startedAt)}ms`)
      }
    }
  }

  useEffect(() => {
    void loadRelationships()
  }, [])

  const incoming = useMemo(() => {
    if (!meId) return []
    return connections.filter((c) => c.status === 'pending' && c.addressee_id === meId)
  }, [connections, meId])

  const sent = useMemo(() => {
    if (!meId) return []
    return connections.filter((c) => c.status === 'pending' && c.requester_id === meId)
  }, [connections, meId])

  const connected = useMemo(() => connections.filter((c) => c.status === 'accepted'), [connections])

  const selectedConnection = useMemo(() => {
    return connections.find((connection) => connection.id === selectedConnectionId) ?? null
  }, [connections, selectedConnectionId])

  const selectedSecondDegreeUser = useMemo(() => {
    if (!selectedSecondDegreeUserId) return null
    return expandedSecondDegreeNodes.find((user) => user.id === selectedSecondDegreeUserId) ?? null
  }, [expandedSecondDegreeNodes, selectedSecondDegreeUserId])

  const expandedRootConnection = useMemo(() => {
    if (!expandedRootUserId) return null
    return connected.find((connection) => otherUserId(connection, meId) === expandedRootUserId) ?? null
  }, [connected, expandedRootUserId, meId])

  const expandedRootName = clean(expandedRootConnection?.user?.full_name) || 'this knot'

  const selectedTab: RelationshipTab = selectedConnection
    ? selectedConnection.status === 'accepted'
      ? 'Connected'
      : selectedConnection.addressee_id === meId
        ? 'Incoming'
        : 'Sent'
    : activeTab

  const activeRows = useMemo(() => {
    const rows = activeTab === 'Incoming' ? incoming : activeTab === 'Sent' ? sent : connected
    const q = query.trim().toLowerCase()

    return rows.filter((connection) => {
      const matchesQuery = !q || searchableText(connection).includes(q)
      const matchesStatus = statusFilter === 'All' || connection.user?.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [activeTab, connected, incoming, query, sent, statusFilter])

  const maintenanceItems = useMemo(() => {
    const weak = connected
      .filter((connection) => userContext(connection.user) === 'Profile')
      .slice(0, 2)
      .map((connection) => ({ connection, label: 'Weak context', body: 'Open profile before asking for help.' }))

    const bridged = connected
      .filter((connection) =>
        peerEdges.some((edge) => edge.source_id === otherUserId(connection, meId) || edge.target_id === otherUserId(connection, meId))
      )
      .slice(0, 2)
      .map((connection) => ({ connection, label: 'Mutual bridge', body: 'This person shares ties inside your knot.' }))

    return [...bridged, ...weak].slice(0, 3)
  }, [connected, meId, peerEdges])

  const hasAnyRelationship = incoming.length + sent.length + connected.length > 0
  const hasQuery = query.trim().length > 0 || statusFilter !== 'All'
  const empty = emptyMessage(activeTab, hasQuery)

  async function acceptIncoming(connection: Connection) {
    if (!meId || connection.addressee_id !== meId) return

    setAccepting((prev) => ({ ...prev, [connection.id]: true }))
    setError(null)

    try {
      await apiPatch(`/api/connections/${connection.id}`, { status: 'accepted' })
      setConnections((prev) =>
        prev.map((item) =>
          item.id === connection.id
            ? { ...item, status: 'accepted', updated_at: new Date().toISOString() }
            : item
        )
      )
      setSelectedConnectionId(connection.id)
      setActiveTab('Connected')
      void loadRelationships()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request')
    } finally {
      setAccepting((prev) => ({ ...prev, [connection.id]: false }))
    }
  }

  async function declineIncoming(connection: Connection) {
    if (!meId || connection.addressee_id !== meId) return

    setRemoving((prev) => ({ ...prev, [connection.id]: true }))
    setError(null)

    try {
      await apiPatch(`/api/connections/${connection.id}`, { status: 'declined' })
      setConnections((prev) => prev.filter((item) => item.id !== connection.id))
      if (selectedConnectionId === connection.id) setSelectedConnectionId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline request')
    } finally {
      setRemoving((prev) => ({ ...prev, [connection.id]: false }))
    }
  }

  async function removeRelationship(connection: Connection) {
    const tab = connection.status === 'accepted' ? 'Connected' : connection.addressee_id === meId ? 'Incoming' : 'Sent'
    const label = tab === 'Connected' ? 'Remove this person from your knot?' : tab === 'Sent' ? 'Cancel this request?' : 'Decline this request?'
    if (!window.confirm(label)) return

    if (tab === 'Incoming') {
      await declineIncoming(connection)
      return
    }

    setRemoving((prev) => ({ ...prev, [connection.id]: true }))
    setError(null)

    try {
      await apiDelete(`/api/connections/${connection.id}`)
      setConnections((prev) => prev.filter((item) => item.id !== connection.id))
      setPeerEdges((prev) => prev.filter((edge) => edge.id !== connection.id))
      if (expandedRootUserId === otherUserId(connection, meId)) clearExpandedKnot()
      if (selectedConnectionId === connection.id) setSelectedConnectionId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove relationship')
    } finally {
      setRemoving((prev) => ({ ...prev, [connection.id]: false }))
    }
  }

  function clearExpandedKnot() {
    setExpandedRootUserId(null)
    setExpandedSecondDegreeNodes([])
    setExpandedSecondDegreeEdges([])
    setExpandedPeerEdges([])
    setExpandError(null)
    setSelectedSecondDegreeUserId(null)
    setRequestFeedback(null)
  }

  function resetGraphState() {
    clearExpandedKnot()
    setSelectedConnectionId(null)
    setQuery('')
    setStatusFilter('All')
    setActiveTab('Connected')
    setGraphResetToken((value) => value + 1)
  }

  async function toggleExpandKnot(connection: Connection) {
    const userId = otherUserId(connection, meId)

    if (!userId || connection.status !== 'accepted') return

    if (expandedRootUserId === userId) {
      clearExpandedKnot()
      return
    }

    setExpandingUserId(userId)
    setExpandError(null)

    try {
      const result = await apiGet<ExpandedKnotResponse>(`/api/connections/map/expand/${userId}`)
      setExpandedRootUserId(result.rootUserId)
      setExpandedSecondDegreeNodes(result.secondDegreeNodes ?? [])
      setExpandedSecondDegreeEdges(result.secondDegreeEdges ?? [])
      setExpandedPeerEdges(result.peerEdges ?? [])
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : 'Failed to expand this knot')
      setExpandedRootUserId(null)
      setExpandedSecondDegreeNodes([])
      setExpandedSecondDegreeEdges([])
      setExpandedPeerEdges([])
    } finally {
      setExpandingUserId(null)
    }
  }

  function focusConnection(connection: Connection, tab: RelationshipTab) {
    setQuery('')
    setActiveTab(tab)
    setSelectedSecondDegreeUserId(null)
    setRequestFeedback(null)
    setSelectedConnectionId(connection.id)
  }

  function clearFocus() {
    setSelectedConnectionId(null)
    setSelectedSecondDegreeUserId(null)
    setRequestFeedback(null)
  }

  function selectSecondDegreeUser(userId: string) {
    setQuery('')
    setSelectedConnectionId(null)
    setSelectedSecondDegreeUserId(userId)
    setRequestFeedback(null)
  }

  function messageUser(userId: string) {
    navigate(`/messages?to=${userId}`)
  }

  function inviteCoffee(userId: string) {
    navigate(`/messages?to=${userId}&action=coffee`)
  }

  async function requestSecondDegreeConnection(user: ExpandedKnotNode) {
    if (!user.id || requestingUserId) return

    setRequestingUserId(user.id)
    setRequestFeedback(null)
    setError(null)

    try {
      const result = await apiPost<ConnectionMutationResponse>('/api/connections', { addresseeId: user.id })
      const message = result.autoAccepted
        ? 'Request accepted automatically.'
        : result.alreadyConnected
          ? 'Already in your knot.'
          : 'Request sent.'

      setRequestFeedback(message)
      await loadRelationships()
      setActiveTab(result.autoAccepted || result.alreadyConnected ? 'Connected' : 'Sent')
      setSelectedSecondDegreeUserId(null)
    } catch (err) {
      setRequestFeedback(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setRequestingUserId(null)
    }
  }

  // Shared content rendered in both desktop inline section and mobile bottom sheet
  function NetworkSectionContent() {
    return (
      <div style={{ padding: isMobileTop ? '0 12px 16px' : undefined }}>
        {maintenanceItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10, paddingTop: isMobileTop ? 4 : 0 }}>
              Network maintenance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {maintenanceItems.map((item) => {
                const user = item.connection.user
                const name = clean(user?.full_name) || 'Unknown person'
                return (
                  <KCard
                    key={`maintenance-${item.label}-${item.connection.id}`}
                    style={{ padding: 11, display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => focusConnection(item.connection, 'Connected')}
                  >
                    <KAvatar name={name} src={user?.avatar_url ?? null} size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}: {name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {item.body}
                      </div>
                    </div>
                  </KCard>
                )
              })}
            </div>
          </div>
        )}
        <KCard style={{ padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {RELATIONSHIP_TABS.map((tab) => {
                  const count = tab === 'Incoming' ? incoming.length : tab === 'Sent' ? sent.length : connected.length
                  const sel = activeTab === tab
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => { setSelectedConnectionId(null); setActiveTab(tab) }}
                      style={{
                        border: sel ? '0.5px solid var(--ink)' : '0.5px solid var(--rule)',
                        background: sel ? 'var(--ink)' : 'var(--paper)',
                        color: sel ? 'var(--paper)' : 'var(--ink-muted)',
                        borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {tab === 'Connected' ? 'In your knot' : tab} ({count})
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                Showing {activeRows.length} result{activeRows.length === 1 ? '' : 's'}
              </div>
            </div>
            {/* Search + filters — simplified for mobile */}
            <div style={{
              padding: '7px 10px', borderRadius: 12, border: '0.5px solid var(--rule)',
              background: 'var(--paper-soft)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Search</span>
              <input
                value={query}
                onChange={(e) => { setSelectedConnectionId(null); setQuery(e.target.value) }}
                placeholder="Name, city, university..."
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}
              />
            </div>
          </div>
        </KCard>
        {activeRows.length === 0 ? (
          <KCard style={{ padding: 36, textAlign: 'center', color: 'var(--ink-faint)', fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic' }}>
            No {activeTab === 'Connected' ? 'connections' : activeTab === 'Incoming' ? 'requests' : 'sent requests'} yet.
          </KCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeRows.map((connection) => (
              <RelationshipCard key={connection.id} connection={connection} tab={activeTab} />
            ))}
          </div>
        )}
      </div>
    )
  }

  function RelationshipCard({ connection, tab }: { connection: Connection; tab: RelationshipTab }) {
    const user = connection.user
    const userId = otherUserId(connection, meId)
    const name = clean(user?.full_name) || 'Unknown person'
    const username = clean(user?.username) || 'user'
    const city = clean(user?.location_city)
    const university = clean(user?.university)
    const company = clean(user?.current_company)
    const tone = relationTone(tab)
    const selected = connection.id === selectedConnectionId

    return (
      <KCard
        style={{
          padding: 15,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 190,
          border: selected ? '0.5px solid var(--signal)' : '0.5px solid var(--rule)',
          boxShadow: selected ? '0 18px 48px rgba(216,68,43,0.14)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <KAvatar name={name} src={user?.avatar_url ?? null} size={46} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontSize: 18,
                  color: 'var(--ink)',
                  letterSpacing: -0.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                @{username}
              </div>
            </div>
          </div>

          <span
            style={{
              padding: '4px 9px',
              borderRadius: 999,
              background: tone.background,
              color: tone.color,
              border: `0.5px solid ${tone.border}`,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {relationLabel(tab)}
          </span>
        </div>

        <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.45 }}>
          {relationshipReason(connection, tab)}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
          <MetaPill label={statusLabel(user?.status)} />
          {city && <MetaPill label={city} />}
          {university && <MetaPill label={university} />}
          {company && <MetaPill label={company} />}
        </div>

        <div
          style={{
            paddingTop: 12,
            borderTop: '0.5px solid var(--rule-soft)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            {tab === 'Connected' ? 'Added' : tab === 'Incoming' ? 'Requested' : 'Sent'} {formatDate(connection.updated_at || connection.created_at)}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {tab === 'Connected' && (
              <>
                <KBtn variant="ghost" size="sm" onClick={() => messageUser(userId)}>
                  Message
                </KBtn>
                <KBtn variant="signal" size="sm" onClick={() => inviteCoffee(userId)}>
                  Coffee
                </KBtn>
              </>
            )}

            <KBtn variant="ghost" size="sm" onClick={() => navigate(`/profile/${userId}`)}>
              Profile
            </KBtn>

            {tab === 'Incoming' && (
              <KBtn
                variant="verd"
                size="sm"
                disabled={Boolean(accepting[connection.id])}
                onClick={() => void acceptIncoming(connection)}
              >
                {accepting[connection.id] ? 'Accepting...' : 'Accept'}
              </KBtn>
            )}
          </div>
        </div>
      </KCard>
    )
  }

  return (
    <div
      className="your-knot-page"
      style={{
        minHeight: '100%',
        height: isMobileTop ? '100%' : undefined,
        overflow: isMobileTop ? 'hidden' : undefined,
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <div className="your-knot-page-inner" style={{ maxWidth: 'none', margin: '0 auto', padding: isMobileTop ? '2px 0 0' : '2px 0 24px', height: isMobileTop ? '100%' : undefined, display: isMobileTop ? 'flex' : undefined, flexDirection: isMobileTop ? 'column' : undefined, overflow: isMobileTop ? 'hidden' : undefined }}>
        <TopCommandBar
          connectedCount={connected.length}
          incomingCount={incoming.length}
          sentCount={sent.length}
          loading={loading}
          compact={isMobileTop}
          onDiscover={() => navigate('/discover')}
          onRefresh={() => void loadRelationships()}
        />

        {error && (
          <KCard
            style={{
              marginTop: 14,
              padding: 14,
              border: '0.5px solid rgba(216,68,43,0.35)',
              background: 'var(--signal-soft)',
              color: 'var(--signal)',
              fontSize: 13,
            }}
          >
            {error}
          </KCard>
        )}

        <KnotStage
          meId={meId}
          meName={meUser?.full_name ?? 'You'}
          meAvatar={meUser?.avatar_url ?? null}
          connected={connected}
          incoming={incoming}
          sent={sent}
          peerEdges={peerEdges}
          expandedRootUserId={expandedRootUserId}
          expandedSecondDegreeNodes={expandedSecondDegreeNodes}
          expandedSecondDegreeEdges={expandedSecondDegreeEdges}
          expandedPeerEdges={expandedPeerEdges}
          expandingUserId={expandingUserId}
          expandError={expandError}
          selectedConnection={selectedConnection}
          selectedTab={selectedTab}
          query={query}
          onQueryChange={(value) => {
            setSelectedConnectionId(null)
            setQuery(value)
          }}
          accepting={accepting}
          removing={removing}
          onSelect={focusConnection}
          onClear={clearFocus}
          onToggleExpand={(connection) => void toggleExpandKnot(connection)}
          onAccept={(connection) => void acceptIncoming(connection)}
          onRemove={(connection) => void removeRelationship(connection)}
          onViewProfile={(userId) => navigate(`/profile/${userId}`)}
          onMessage={messageUser}
          onInviteCoffee={inviteCoffee}
          selectedSecondDegreeUser={selectedSecondDegreeUser}
          expandedRootName={expandedRootName}
          onSelectSecondDegreeUser={selectSecondDegreeUser}
          onRequestSecondDegree={requestSecondDegreeConnection}
          requestingUserId={requestingUserId}
          requestFeedback={requestFeedback}
          onResetGraphState={resetGraphState}
          graphResetToken={graphResetToken}
          onCollapseExpanded={clearExpandedKnot}
          signalsByUserId={signalsByUserId}
        />

        {/* Network list — bottom sheet on mobile, inline section on desktop */}
        {isMobileTop ? (
          <MobileBottomSheet peekHeight={26} defaultHeight={Math.round(window.innerHeight * 0.55)}>
            <NetworkSectionContent />
          </MobileBottomSheet>
        ) : (
          <section style={{ marginTop: 18 }}>
            <NetworkSectionContent />
          </section>
        )}

      </div>
    </div>
  )
}

function TopCommandBar({
  connectedCount,
  incomingCount,
  sentCount,
  loading,
  compact,
  onDiscover,
  onRefresh,
}: {
  connectedCount: number
  incomingCount: number
  sentCount: number
  loading: boolean
  compact?: boolean
  onDiscover: () => void
  onRefresh: () => void
}) {
  // Compact (mobile): title gets its own full-width row (same size as every other
  // page's DeskHeader title), metrics + Discover sit together underneath.
  if (compact) {
    return (
      <KCard
        style={{
          padding: '14px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'rgba(244,239,230,0.66)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 3.2vw, 34px)', fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.05, color: 'var(--ink)' }}>
          Keep your <span style={{ color: 'var(--signal, #D8442B)' }}>knot</span> warm.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b style={{ color: 'var(--ink)' }}>{connectedCount}</b> in knot
            {incomingCount > 0 && <> · <b style={{ color: 'var(--verd)' }}>{incomingCount}</b> to decide</>}
            {sentCount > 0 && <> · <b style={{ color: 'var(--signal)' }}>{sentCount}</b> waiting</>}
          </div>
          <ShareInviteButton variant="ghost" size="sm" label="Invite" />
        </div>
      </KCard>
    )
  }

  return (
    <KCard
      style={{
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        background: 'rgba(244,239,230,0.66)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          Your Knot
        </div>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(24px, 3.2vw, 30px)', fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.05, color: 'var(--ink)' }}>
          Keep your <span style={{ color: 'var(--signal, #D8442B)' }}>knot</span> warm.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <MiniMetric label="In knot" value={connectedCount} tone="neutral" />
        <MiniMetric label="Decide" value={incomingCount} tone="incoming" />
        <MiniMetric label="Waiting" value={sentCount} tone="sent" />
        <KBtn variant="signal" size="sm" onClick={onDiscover}>
          Discover
        </KBtn>
        <KBtn variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </KBtn>
        <ShareInviteButton variant="ghost" size="sm" label="Invite" />
      </div>
    </KCard>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'incoming' | 'sent' }) {
  const color = tone === 'incoming' ? 'var(--verd)' : tone === 'sent' ? 'var(--signal)' : 'var(--ink)'

  return (
    <div
      style={{
        minWidth: 62,
        padding: '6px 9px',
        borderRadius: 999,
        border: '0.5px solid var(--rule)',
        background: 'var(--paper)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
      }}
    >
      <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, lineHeight: 1, color }}>
        {value}
      </span>
    </div>
  )
}

function KnotStage({
  meId,
  meName,
  meAvatar,
  connected,
  incoming,
  sent,
  peerEdges,
  expandedRootUserId,
  expandedSecondDegreeNodes,
  expandedSecondDegreeEdges,
  expandedPeerEdges,
  expandingUserId,
  expandError,
  selectedConnection,
  selectedTab,
  query,
  onQueryChange,
  accepting,
  removing,
  onSelect,
  onClear,
  onToggleExpand,
  onAccept,
  onRemove,
  onViewProfile,
  onMessage,
  signalsByUserId,
  onInviteCoffee,
  selectedSecondDegreeUser,
  expandedRootName,
  onSelectSecondDegreeUser,
  onRequestSecondDegree,
  requestingUserId,
  requestFeedback,
  onResetGraphState,
  graphResetToken,
  onCollapseExpanded,
}: {
  meId: string | null
  meName: string
  meAvatar: string | null
  connected: Connection[]
  incoming: Connection[]
  sent: Connection[]
  peerEdges: PeerEdge[]
  expandedRootUserId: string | null
  expandedSecondDegreeNodes: ExpandedKnotNode[]
  expandedSecondDegreeEdges: PeerEdge[]
  expandedPeerEdges: PeerEdge[]
  expandingUserId: string | null
  expandError: string | null
  selectedConnection: Connection | null
  selectedTab: RelationshipTab
  query: string
  onQueryChange: (value: string) => void
  accepting: Record<string, boolean>
  removing: Record<string, boolean>
  onSelect: (connection: Connection, tab: RelationshipTab) => void
  onClear: () => void
  onToggleExpand: (connection: Connection) => void
  onAccept: (connection: Connection) => void
  onRemove: (connection: Connection) => void
  onViewProfile: (userId: string) => void
  onMessage: (userId: string) => void
  onInviteCoffee: (userId: string) => void
  selectedSecondDegreeUser: ExpandedKnotNode | null
  expandedRootName: string
  onSelectSecondDegreeUser: (userId: string) => void
  onRequestSecondDegree: (user: ExpandedKnotNode) => void
  requestingUserId: string | null
  requestFeedback: string | null
  onResetGraphState: () => void
  graphResetToken: number
  onCollapseExpanded: () => void
  signalsByUserId: Map<string, KnotSignals>
}) {
  const normalizedGraphQuery = query.trim().toLowerCase()
  const hasGraphQuery = normalizedGraphQuery.length > 0

  // Clicking empty canvas should drop the selection AND collapse any expanded
  // second-degree cluster — otherwise the wheel's child nodes stay stranded
  // on screen with nothing selected to explain why they're there.
  function onBoardClear() {
    onClear()
    onCollapseExpanded()
  }

  // Mobile detection — used to keep the mobile graph clean (direct ties only)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const nodes = useMemo(() => measureDev('Your Knot node derivation', () => {
    const candidates: Array<{ connection: Connection; tab: RelationshipTab; priority: number; index: number }> = [
      ...connected.map((connection, index) => ({ connection, tab: 'Connected' as const, priority: 0, index })),
      ...incoming.map((connection, index) => ({ connection, tab: 'Incoming' as const, priority: 1, index })),
      ...sent.map((connection, index) => ({ connection, tab: 'Sent' as const, priority: 2, index })),
    ]

    // One real person must render as one graph node. Accepted relationships win
    // over incoming/pending/outgoing state when stale or overlapping data exists.
    const directByUserId = new Map<string, { connection: Connection; tab: RelationshipTab; priority: number; index: number }>()
    for (const candidate of candidates) {
      const userId = otherUserId(candidate.connection, meId)
      if (!userId) continue
      const existing = directByUserId.get(userId)
      if (!existing || candidate.priority < existing.priority || (candidate.priority === existing.priority && candidate.index < existing.index)) {
        directByUserId.set(userId, candidate)
      }
    }

    const ordered = [...directByUserId.values()].sort((a, b) => a.priority - b.priority || a.index - b.index)

    const directNodes = ordered.map(({ connection, tab }) => {
      const user = connection.user
      const name = clean(user?.full_name) || 'Unknown person'
      const userId = otherUserId(connection, meId)
      const signals = tab === 'Connected' ? signalsByUserId.get(userId) : undefined
      const health = tab === 'Connected' ? (signals?.health ?? 'warm') : undefined

      return {
        id: `person:${userId}`,
        userId,
        connectionId: connection.id,
        connection,
        tab,
        degree: 'direct' as const,
        name,
        avatarUrl: user?.avatar_url ?? null,
        context: userContext(user),
        matchesQuery: !normalizedGraphQuery || searchableText(connection).includes(normalizedGraphQuery),
        healthState: health,
        hasOpenAsk: signals?.hasOpenAsk,
        hasCoffee: signals?.hasCoffee,
        needsFollowUp: signals?.needsFollowUp,
      }
    })

    const directUserIds = new Set(directNodes.map((node) => node.userId))

    const secondDegreeNodes = expandedSecondDegreeNodes
      .filter((user) => user.id !== meId && !directUserIds.has(user.id))
      .map((user) => {
        const name = clean(user.full_name) || clean(user.username) || 'Unknown person'
        const searchable = [
          user.full_name,
          user.username,
          user.headline,
          user.location_city,
          user.university,
          user.current_company,
          user.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return {
          id: `second:${expandedRootUserId}:${user.id}`,
          userId: user.id,
          connectionId: `second:${expandedRootUserId}:${user.id}`,
          tab: 'Connected' as const,
          degree: 'second' as const,
          expandedViaUserId: expandedRootUserId ?? undefined,
          name,
          avatarUrl: user.avatar_url ?? null,
          context:
            clean(user.headline) ||
            clean(user.current_company) ||
            clean(user.university) ||
            clean(user.location_city) ||
            'Warm path',
          matchesQuery: !normalizedGraphQuery || searchable.includes(normalizedGraphQuery),
        }
      })

    return [...directNodes, ...secondDegreeNodes]
  }), [connected, expandedRootUserId, expandedSecondDegreeNodes, signalsByUserId, incoming, meId, normalizedGraphQuery, sent])

  const selectedNode =
    selectedConnection
      ? nodes.find((node) => node.degree === 'direct' && node.connection.id === selectedConnection.id) ?? null
      : null

  const nodesByUserId = useMemo(() => new Map(nodes.map((node) => [node.userId, node])), [nodes])

  const knotColdCount = useMemo(
    () => connected.filter((c) => signalsByUserId.get(otherUserId(c, meId))?.health === 'cold').length,
    [connected, signalsByUserId, meId]
  )

  const visiblePeerEdges = useMemo(() => measureDev('Your Knot peer edge derivation', () => {
    const combinedEdges = [...peerEdges, ...expandedSecondDegreeEdges, ...expandedPeerEdges]
    const seenPairs = new Set<string>()
    const result: Array<PeerEdge & { source: (typeof nodes)[number]; target: (typeof nodes)[number] }> = []

    for (const edge of combinedEdges) {
      const source = nodesByUserId.get(edge.source_id)
      const target = nodesByUserId.get(edge.target_id)
      if (!source || !target) continue
      if (source.id === target.id || source.userId === target.userId) continue

      const pairKey = [source.userId, target.userId].sort().join(':')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      result.push({ ...edge, id: pairKey, source, target })
    }

    return result
  }), [expandedPeerEdges, expandedSecondDegreeEdges, nodesByUserId, peerEdges])

  const graphPeerEdges: KnotGraphPeerEdge[] = useMemo(() => {
    return visiblePeerEdges.map((edge) => ({
      id: edge.id,
      sourceId: edge.source.id,
      targetId: edge.target.id,
    }))
  }, [visiblePeerEdges])

  const selectedPeerNames = useMemo(() => {
    if (!selectedNode) return []
    return visiblePeerEdges
      .filter((edge) => edge.source.userId === selectedNode.userId || edge.target.userId === selectedNode.userId)
      .map((edge) => (edge.source.userId === selectedNode.userId ? edge.target.name : edge.source.name))
      .slice(0, 4)
  }, [selectedNode, visiblePeerEdges])

  const hasRelationships = nodes.length > 0

  return (
    <KCard
      style={{
        marginTop: 5,
        flex: isMobile ? '1 1 auto' : undefined,
        minHeight: isMobile ? 0 : undefined,
        padding: 0,
        overflow: 'hidden',
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        borderRadius: 0,
      }}
    >
      <div data-tour="knot-graph" className="k-knot-stage your-knot-stage">
        <div className="k-knot-bg">
          <div data-tour="knot-search" className="k-knot-search-box">
            <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
              Find
            </span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search your knot..."
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--ink)',
                fontSize: 13,
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink-faint)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            )}
            {isMobile && hasRelationships && (
              <button
                type="button"
                onClick={onResetGraphState}
                style={{
                  border: '0.5px solid rgba(84,72,58,0.18)',
                  background: 'rgba(244,239,230,0.92)',
                  color: 'var(--ink)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  flexShrink: 0,
                }}
              >
                Reset
              </button>
            )}
          </div>

          {!hasRelationships ? (
            <div
              style={{
                height: 'calc(100vh - 78px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 24,
                color: 'var(--ink-muted)',
                lineHeight: 1.5,
              }}
            >
              Start from Discover. Once relationships exist, the knot becomes visible here.
            </div>
          ) : isMobile ? (
            /* ── Mobile: SVG graph + node overlay card ── */
            <>
              <KnotMobileGraph
                key={graphResetToken}
                me={{ id: 'me', name: meName, avatarUrl: meAvatar }}
                nodes={nodes}
                selectedNodeId={selectedNode?.id ?? null}
                query={query}
                onSelectNode={(node: KnotGraphNode) => {
                  const match = nodes.find((item) => item.id === node.id)
                  if (!match) return
                  if (match.degree === 'second') { onSelectSecondDegreeUser(match.userId); return }
                  onSelect(match.connection, match.tab)
                }}
                onClearSelection={onBoardClear}
                expandedRootId={expandedRootUserId ? `person:${expandedRootUserId}` : null}
                expandedRootName={expandedRootUserId ? expandedRootName : null}
                onCollapse={onCollapseExpanded}
                resetToken={graphResetToken}
              />
              {/* Mobile never hit the desktop-only knot-stats/knot-legend
                  pills below (different JSX branch entirely) — they simply
                  didn't exist here, not just hidden. Compact versions,
                  stacked bottom-left, sitting just above the collapsed
                  bottom sheet handle rather than floating mid-screen. */}
              <div
                style={{
                  position: 'absolute', left: 10, bottom: 'calc(64px + env(safe-area-inset-bottom) + 6px)',
                  zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                  maxWidth: 'calc(100% - 20px)',
                }}
              >
                <div
                  data-tour="knot-legend"
                  style={{ padding: '4px 8px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'rgba(244,239,230,0.88)', backdropFilter: 'blur(10px)', maxWidth: '100%', overflowX: 'auto' }}
                >
                  <WebLegendRow compact />
                </div>
                <div
                  data-tour="knot-stats"
                  style={{ padding: '4px 8px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'rgba(244,239,230,0.88)', backdropFilter: 'blur(10px)', color: 'var(--ink-muted)', fontSize: 9.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {connected.length} connected{knotColdCount > 0 ? ` · ${knotColdCount} going cold` : ''}
                </div>
              </div>
              <MobileNodeOverlay
                open={!!(selectedConnection || selectedSecondDegreeUser)}
                onClose={onClear}
              >
                {selectedConnection ? (
                  <SelectedRelationshipPanel
                    connection={selectedConnection}
                    tab={selectedTab}
                    mutualNames={selectedPeerNames}
                    accepting={Boolean(accepting[selectedConnection.id])}
                    removing={Boolean(removing[selectedConnection.id])}
                    expanding={expandingUserId === otherUserId(selectedConnection, meId)}
                    expanded={expandedRootUserId === otherUserId(selectedConnection, meId)}
                    expandedCount={expandedRootUserId === otherUserId(selectedConnection, meId) ? expandedSecondDegreeNodes.length : 0}
                    expandError={expandedRootUserId === otherUserId(selectedConnection, meId) ? expandError : null}
                    onClear={onClear}
                    onToggleExpand={selectedTab === 'Connected' ? () => { onToggleExpand(selectedConnection); onClear() } : undefined}
                    onAccept={() => onAccept(selectedConnection)}
                    onRemove={() => onRemove(selectedConnection)}
                    onMessage={() => onMessage(otherUserId(selectedConnection, meId))}
                    onInviteCoffee={() => onInviteCoffee(otherUserId(selectedConnection, meId))}
                    signals={signalsByUserId.get(otherUserId(selectedConnection, meId))}
                    onViewProfile={() => onViewProfile(otherUserId(selectedConnection, meId))}
                  />
                ) : selectedSecondDegreeUser ? (
                  <SecondDegreeProfilePanel
                    user={selectedSecondDegreeUser}
                    rootName={expandedRootName}
                    requesting={requestingUserId === selectedSecondDegreeUser.id}
                    feedback={requestFeedback}
                    onClear={onClear}
                    onRequest={() => onRequestSecondDegree(selectedSecondDegreeUser)}
                    onViewProfile={() => onViewProfile(selectedSecondDegreeUser.id)}
                  />
                ) : null}
              </MobileNodeOverlay>
            </>
          ) : (
            /* ── Desktop: original force graph ── */
            <>
              <Suspense fallback={null}>
                <KnotForceGraph
                  me={{ id: 'me', name: meName, avatarUrl: meAvatar }}
                  nodes={nodes}
                  peerEdges={graphPeerEdges}
                  selectedNodeId={selectedNode?.id ?? null}
                  query={query}
                  onClearQuery={() => onQueryChange('')}
                  onResetGraph={onResetGraphState}
                  onSelectNode={(node: KnotGraphNode) => {
                    const match = nodes.find((item) => item.id === node.id)
                    if (!match) return
                    if (match.degree === 'second') { onSelectSecondDegreeUser(match.userId); return }
                    onSelect(match.connection, match.tab)
                  }}
                  onClearSelection={onBoardClear}
                />
              </Suspense>
              <div data-tour="knot-stats" className="k-knot-stats-bar">
                {connected.length} connected{knotColdCount > 0 ? ` · ${knotColdCount} going cold` : ''} · {visiblePeerEdges.length} inner ties · {expandedSecondDegreeNodes.length} expanded · {incoming.length} decisions · {sent.length} waiting
              </div>
              <div data-tour="knot-legend" className="k-knot-legend-box">
                <WebLegendRow />
              </div>
              {(selectedConnection || selectedSecondDegreeUser) && (
                <div className="k-knot-detail-panel">
                  {selectedConnection ? (
                    <SelectedRelationshipPanel
                      connection={selectedConnection}
                      tab={selectedTab}
                      mutualNames={selectedPeerNames}
                      accepting={Boolean(accepting[selectedConnection.id])}
                      removing={Boolean(removing[selectedConnection.id])}
                      expanding={expandingUserId === otherUserId(selectedConnection, meId)}
                      expanded={expandedRootUserId === otherUserId(selectedConnection, meId)}
                      expandedCount={expandedRootUserId === otherUserId(selectedConnection, meId) ? expandedSecondDegreeNodes.length : 0}
                      expandError={expandedRootUserId === otherUserId(selectedConnection, meId) ? expandError : null}
                      onClear={onClear}
                      onToggleExpand={selectedTab === 'Connected' ? () => onToggleExpand(selectedConnection) : undefined}
                      onAccept={() => onAccept(selectedConnection)}
                      onRemove={() => onRemove(selectedConnection)}
                      onMessage={() => onMessage(otherUserId(selectedConnection, meId))}
                      onInviteCoffee={() => onInviteCoffee(otherUserId(selectedConnection, meId))}
                      signals={signalsByUserId.get(otherUserId(selectedConnection, meId))}
                      onViewProfile={() => onViewProfile(otherUserId(selectedConnection, meId))}
                    />
                  ) : selectedSecondDegreeUser ? (
                    <SecondDegreeProfilePanel
                      user={selectedSecondDegreeUser}
                      rootName={expandedRootName}
                      requesting={requestingUserId === selectedSecondDegreeUser.id}
                      feedback={requestFeedback}
                      onClear={onClear}
                      onRequest={() => onRequestSecondDegree(selectedSecondDegreeUser)}
                      onViewProfile={() => onViewProfile(selectedSecondDegreeUser.id)}
                    />
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </KCard>
  )
}

function WebLegendRow({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, whiteSpace: 'nowrap' }}>
      <WebLegend label="Warm" color="#4caf7d" compact={compact} />
      <WebLegend label="Cooling" color="#d4a017" compact={compact} />
      <WebLegend label="Cold" color="#e05c3a" compact={compact} />
      <span style={{ width: 1, height: compact ? 8 : 10, background: 'var(--rule)' }} />
      <WebLegend label="Coffee" glyph="☕" color="#1F6B5E" compact={compact} />
      <WebLegend label="Ask" glyph="?" color="#C8941F" compact={compact} />
    </div>
  )
}

function WebLegend({ label, color, glyph, compact = false }: { label: string; color: string; glyph?: string; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 5, fontSize: compact ? 9.5 : 10.8, color: 'var(--ink-muted)' }}>
      {glyph ? (
        <span style={{
          width: compact ? 10 : 12, height: compact ? 10 : 12, borderRadius: '50%', background: color, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: compact ? 6.5 : 7.5, fontWeight: 700, lineHeight: 1,
        }}>{glyph}</span>
      ) : (
        <span style={{ width: compact ? 6 : 7, height: compact ? 6 : 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      )}
      {label}
    </div>
  )
}

function SecondDegreeProfilePanel({
  user,
  rootName,
  requesting,
  feedback,
  onClear,
  onRequest,
  onViewProfile,
}: {
  user: ExpandedKnotNode
  rootName: string
  requesting: boolean
  feedback: string | null
  onClear: () => void
  onRequest: () => void
  onViewProfile: () => void
}) {
  const name = clean(user.full_name) || clean(user.username) || 'Unknown person'
  const username = clean(user.username) || 'user'
  const detail = clean(user.headline) || clean(user.current_company) || clean(user.university) || clean(user.location_city) || 'Warm path'

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 20,
        background: 'var(--paper)',
        border: '0.5px solid var(--rule)',
        boxShadow: '0 18px 50px rgba(26,24,21,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <KAvatar name={name} src={user.avatar_url ?? null} size={54} />
        <button
          type="button"
          onClick={onClear}
          style={{
            border: '0.5px solid var(--rule)',
            background: 'var(--paper-soft)',
            color: 'var(--ink-faint)',
            borderRadius: 999,
            width: 28,
            height: 28,
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Clear selected profile"
        >
          ×
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 23, color: 'var(--ink)', letterSpacing: -0.35, lineHeight: 1.05 }}>
          {name}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink-muted)' }}>
          @{username}
        </div>
      </div>

      <div
        style={{
          display: 'inline-flex',
          marginTop: 12,
          padding: '5px 9px',
          borderRadius: 999,
          background: 'rgba(84,72,58,0.08)',
          color: 'var(--ink)',
          border: '0.5px dashed rgba(84,72,58,0.28)',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        Second-degree
      </div>

      <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)' }}>
        Connected through {firstName(rootName)}. {detail}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 14,
          border: '0.5px dashed rgba(84,72,58,0.24)',
          background: 'rgba(255,252,246,0.58)',
        }}
      >
        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
          Warm path
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
          This person is not in your knot yet. Send a request if the path is useful.
        </div>
      </div>

      {feedback && (
        <div
          style={{
            marginTop: 12,
            padding: 11,
            borderRadius: 14,
            border: '0.5px solid rgba(84,72,58,0.20)',
            background: 'var(--paper-soft)',
            color: feedback.toLowerCase().includes('failed') ? 'var(--signal)' : 'var(--ink)',
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          {feedback}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <KBtn variant="ink" size="sm" disabled={requesting} onClick={onRequest}>
          {requesting ? 'Sending...' : 'Send request'}
        </KBtn>
        <KBtn variant="ghost" size="sm" onClick={onViewProfile}>
          View profile
        </KBtn>
      </div>
    </div>
  )
}

function SelectedRelationshipPanel({
  connection,
  tab,
  mutualNames,
  accepting,
  removing,
  expanding,
  expanded,
  expandedCount,
  expandError,
  onClear,
  onToggleExpand,
  onAccept,
  onRemove,
  onMessage,
  onInviteCoffee,
  onViewProfile,
  expandLabel,
  signals,
}: {
  connection: Connection
  tab: RelationshipTab
  mutualNames: string[]
  accepting: boolean
  removing: boolean
  expanding: boolean
  expanded: boolean
  expandedCount: number
  expandError: string | null
  onClear: () => void
  onToggleExpand?: () => void
  onAccept: () => void
  onRemove: () => void
  onMessage: () => void
  onInviteCoffee: () => void
  onViewProfile: () => void
  // Optional custom labels for the expand toggle button (mobile vs desktop wording)
  expandLabel?: { open: string; close: string }
  // Live Relationship OS signals for this person (warmth, asks, coffees)
  signals?: KnotSignals
}) {
  const user = connection.user
  const name = clean(user?.full_name) || 'Unknown person'
  const username = clean(user?.username) || 'user'
  const tone = relationTone(tab)

  const destructiveLabel = tab === 'Connected' ? 'Remove from knot' : tab === 'Sent' ? 'Cancel request' : 'Decline'

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 20,
        background: 'var(--paper)',
        border: '0.5px solid var(--rule)',
        boxShadow: '0 18px 50px rgba(26,24,21,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <KAvatar name={name} src={user?.avatar_url ?? null} size={54} />
        <button
          type="button"
          onClick={onClear}
          style={{
            border: '0.5px solid var(--rule)',
            background: 'var(--paper-soft)',
            color: 'var(--ink-faint)',
            borderRadius: 999,
            width: 28,
            height: 28,
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Clear selected relationship"
        >
          ×
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 23, color: 'var(--ink)', letterSpacing: -0.35, lineHeight: 1.05 }}>
          {name}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink-muted)' }}>
          @{username}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <div
          style={{
            display: 'inline-flex',
            padding: '5px 9px',
            borderRadius: 999,
            background: tone.background,
            color: tone.color,
            border: `0.5px solid ${tone.border}`,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {relationLabel(tab)}
        </div>
        {signals && tab === 'Connected' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              borderRadius: 999,
              background: 'var(--paper-soft)',
              border: '0.5px solid var(--rule)',
              fontSize: 11,
              fontWeight: 700,
              color:
                signals.health === 'cold' ? '#c04a2c' :
                signals.health === 'cooling' ? '#9a7314' :
                'var(--verd)',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background:
                signals.health === 'cold' ? '#e05c3a' :
                signals.health === 'cooling' ? '#d4a017' :
                signals.health === 'new' ? '#1F6B5E' : '#4caf7d',
            }} />
            {signals.health === 'new' ? 'New' : signals.health === 'cold' ? 'Cold' : signals.health === 'cooling' ? 'Cooling' : 'Warm'}
            {' · '}{signals.daysSince}d since contact
          </div>
        )}
        {signals?.hasCoffee && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 999, background: 'var(--verd-soft)', border: '0.5px solid rgba(31,107,94,0.28)', fontSize: 11, fontWeight: 700, color: 'var(--verd)' }}>
            ☕ Coffee booked
          </div>
        )}
        {signals?.hasOpenAsk && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 999, background: 'var(--ochre-soft)', border: '0.5px solid rgba(200,148,31,0.4)', fontSize: 11, fontWeight: 700, color: '#7A5A0F' }}>
            Has an open ask
          </div>
        )}
        {signals?.needsFollowUp && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 999, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.28)', fontSize: 11, fontWeight: 700, color: 'var(--signal-deep)' }}>
            Follow-up pending
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)' }}>
        {relationshipReason(connection, tab)}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 14,
          border: '0.5px solid var(--rule)',
          background: 'var(--paper-soft)',
        }}
      >
        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
          Next best action
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
          {nextAction(connection, tab)}
        </div>
      </div>

      {mutualNames.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: 11,
            borderRadius: 14,
            border: '0.5px solid var(--rule)',
            background: 'rgba(244,239,230,0.62)',
          }}
        >
          <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>
            Inner ties
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
            Also connected to {mutualNames.join(', ')}.
          </div>
        </div>
      )}

      {expanded && (
        <div
          style={{
            marginTop: 12,
            padding: 11,
            borderRadius: 14,
            border: '0.5px dashed rgba(84,72,58,0.26)',
            background: 'rgba(255,252,246,0.56)',
          }}
        >
          <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>
            Expanded knot
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45 }}>
            Showing {expandedCount} second-degree {expandedCount === 1 ? 'person' : 'people'} through {firstName(name)}.
          </div>
        </div>
      )}

      {expandError && (
        <div
          style={{
            marginTop: 12,
            padding: 11,
            borderRadius: 14,
            border: '0.5px solid rgba(216,68,43,0.28)',
            background: 'var(--signal-soft)',
            color: 'var(--signal)',
            fontSize: 12.5,
            lineHeight: 1.45,
          }}
        >
          {expandError}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        <MetaPill label={statusLabel(user?.status)} />
        {clean(user?.location_city) && <MetaPill label={clean(user?.location_city)} />}
        {clean(user?.university) && <MetaPill label={clean(user?.university)} />}
        {clean(user?.current_company) && <MetaPill label={clean(user?.current_company)} />}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {tab === 'Connected' && (
          <>
            <KBtn variant="ink" size="sm" onClick={onMessage}>
              Message
            </KBtn>
            <KBtn variant="signal" size="sm" onClick={onInviteCoffee}>
              Invite coffee
            </KBtn>
          </>
        )}

        {tab === 'Incoming' && (
          <KBtn variant="verd" size="sm" disabled={accepting} onClick={onAccept}>
            {accepting ? 'Accepting...' : 'Accept'}
          </KBtn>
        )}

        <KBtn variant="ghost" size="sm" onClick={onViewProfile}>
          View profile
        </KBtn>

        {tab === 'Connected' && onToggleExpand && (
          <KBtn variant={expanded ? 'ghost' : 'ink'} size="sm" disabled={expanding} onClick={onToggleExpand}>
            {expanding
              ? 'Loading...'
              : expanded
                ? expandLabel?.close ?? 'Collapse knot'
                : expandLabel?.open ?? 'Expand knot'}
          </KBtn>
        )}
      </div>

      <button
        type="button"
        disabled={removing}
        onClick={onRemove}
        style={{
          marginTop: 12,
          border: 'none',
          background: 'transparent',
          color: 'var(--signal)',
          fontSize: 12,
          cursor: removing ? 'not-allowed' : 'pointer',
          opacity: removing ? 0.55 : 0.82,
          padding: 0,
        }}
      >
        {removing ? 'Updating...' : destructiveLabel}
      </button>
    </div>
  )
}

function MetaPill({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '4px 8px',
        borderRadius: 999,
        border: '0.5px solid var(--rule)',
        background: 'var(--paper-soft)',
        color: 'var(--ink-muted)',
        fontSize: 11,
        lineHeight: 1,
        maxWidth: 190,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
