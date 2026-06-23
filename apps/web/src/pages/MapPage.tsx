import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { KnotForceGraph, type KnotGraphNode, type KnotGraphPeerEdge, type KnotHealthState } from '../components/knot/KnotForceGraph'

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

export function MapPage() {
  const navigate = useNavigate()
  const [meId, setMeId] = useState<string | null>(null)
  const [meUser, setMeUser] = useState<ConnectionUser | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [peerEdges, setPeerEdges] = useState<PeerEdge[]>([])
  const [expandedRootUserId, setExpandedRootUserId] = useState<string | null>(null)
  const [expandedSecondDegreeNodes, setExpandedSecondDegreeNodes] = useState<ExpandedKnotNode[]>([])
  const [expandedSecondDegreeEdges, setExpandedSecondDegreeEdges] = useState<PeerEdge[]>([])
  const [expandedPeerEdges, setExpandedPeerEdges] = useState<PeerEdge[]>([])
  const [expandingUserId, setExpandingUserId] = useState<string | null>(null)
  const [expandError, setExpandError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RelationshipTab>('Connected')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [selectedSecondDegreeUserId, setSelectedSecondDegreeUserId] = useState<string | null>(null)
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null)
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthByUserId, setHealthByUserId] = useState<Map<string, KnotHealthState>>(new Map())
  const [accepting, setAccepting] = useState<Record<string, boolean>>({})
  const [removing, setRemoving] = useState<Record<string, boolean>>({})

  async function loadRelationships() {
    setLoading(true)
    setError(null)

    try {
      const [meResult, connectionResult, mapResult] = await Promise.all([
        apiGet<MeResponse>('/api/users/me'),
        apiGet<ConnectionsResponse>('/api/connections'),
        apiGet<ConnectionMapResponse>('/api/connections/map'),
      ])

      setMeId(meResult.user.id)
      setMeUser(meResult.user)
      setConnections(connectionResult.connections ?? [])
      setPeerEdges(mapResult.peerEdges ?? [])

      // Load health data separately, never blocks knot from rendering
      apiGet<{ connections: Array<{ peer: { id: string }; daysSince: number; health: KnotHealthState }> }>('/api/relationship-home')
        .then((homeResult) => {
          const healthMap = new Map<string, KnotHealthState>()
          for (const entry of homeResult.connections ?? []) {
            healthMap.set(entry.peer.id, entry.health)
          }
          setHealthByUserId(healthMap)
        })
        .catch(() => { /* health colors are non-critical */ })
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
      style={{
        minHeight: '100%',
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 'none', margin: '0 auto', padding: '2px 0 24px' }}>
        <TopCommandBar
          connectedCount={connected.length}
          incomingCount={incoming.length}
          sentCount={sent.length}
          loading={loading}
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
          healthByUserId={healthByUserId}
        />

        <section style={{ marginTop: 18 }}>
          <KCard style={{ padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {RELATIONSHIP_TABS.map((tab) => {
                    const count = tab === 'Incoming' ? incoming.length : tab === 'Sent' ? sent.length : connected.length
                    const selected = activeTab === tab

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setSelectedConnectionId(null)
                          setActiveTab(tab)
                        }}
                        style={{
                          border: selected ? '0.5px solid var(--ink)' : '0.5px solid var(--rule)',
                          background: selected ? 'var(--ink)' : 'var(--paper)',
                          color: selected ? 'var(--paper)' : 'var(--ink-muted)',
                          borderRadius: 999,
                          padding: '7px 11px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
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

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div
                  style={{
                    minWidth: 260,
                    flex: '1 1 360px',
                    padding: '7px 10px',
                    borderRadius: 12,
                    border: '0.5px solid var(--rule)',
                    background: 'var(--paper-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Search</span>
                  <input
                    value={query}
                    onChange={(event) => {
                      setSelectedConnectionId(null)
                      setQuery(event.target.value)
                    }}
                    placeholder="Name, city, university, company, status..."
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
                </div>

                {STATUS_FILTERS.map((filter) => {
                  const selected = statusFilter === filter.value

                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => {
                        setSelectedConnectionId(null)
                        setStatusFilter(filter.value)
                      }}
                      style={{
                        border: selected ? '0.5px solid var(--ink)' : '0.5px solid var(--rule)',
                        background: selected ? 'var(--ink)' : 'var(--paper)',
                        color: selected ? 'var(--paper)' : 'var(--ink-muted)',
                        borderRadius: 999,
                        padding: '7px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {filter.label}
                    </button>
                  )
                })}

                {(query || selectedConnectionId || statusFilter !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConnectionId(null)
                      setQuery('')
                      setStatusFilter('All')
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--ink-faint)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </KCard>

          {loading ? (
            <KCard style={{ padding: 38, textAlign: 'center', color: 'var(--ink-faint)', fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic' }}>
              Loading Your Knot...
            </KCard>
          ) : activeRows.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14, alignItems: 'stretch' }}>
              {activeRows.map((connection) => (
                <RelationshipCard key={`${activeTab}-${connection.id}`} connection={connection} tab={activeTab} />
              ))}
            </div>
          ) : (
            <KCard style={{ padding: 42, textAlign: 'center' }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, fontStyle: 'italic', color: 'var(--ink)', marginBottom: 8 }}>
                {empty.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.55 }}>
                {empty.body}
              </div>

              {!hasAnyRelationship && activeTab === 'Connected' && (
                <div style={{ marginTop: 18 }}>
                  <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>
                    Start from Discover
                  </KBtn>
                </div>
              )}
            </KCard>
          )}
        </section>

        {maintenanceItems.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Network maintenance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {maintenanceItems.map((item) => {
                const user = item.connection.user
                const name = clean(user?.full_name) || 'Unknown person'
                return (
                  <KCard
                    key={`maintenance-${item.label}-${item.connection.id}`}
                    style={{ padding: 13, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => focusConnection(item.connection, 'Connected')}
                  >
                    <KAvatar name={name} src={user?.avatar_url ?? null} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}: {name}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {item.body}
                      </div>
                    </div>
                  </KCard>
                )
              })}
            </div>
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
  onDiscover,
  onRefresh,
}: {
  connectedCount: number
  incomingCount: number
  sentCount: number
  loading: boolean
  onDiscover: () => void
  onRefresh: () => void
}) {
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
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 3 }}>
          Your Knot
        </div>
        <div
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(16px, 1.55vw, 21px)',
            lineHeight: 1,
            color: 'var(--ink)',
            letterSpacing: -0.28,
          }}
        >
          Maintain the relationships worth keeping.
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
  healthByUserId,
  onInviteCoffee,
  selectedSecondDegreeUser,
  expandedRootName,
  onSelectSecondDegreeUser,
  onRequestSecondDegree,
  requestingUserId,
  requestFeedback,
  onResetGraphState,
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
  healthByUserId: Map<string, KnotHealthState>
}) {
  const normalizedGraphQuery = query.trim().toLowerCase()
  const hasGraphQuery = normalizedGraphQuery.length > 0

  const nodes = useMemo(() => {
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
      const health = tab === 'Connected' ? (healthByUserId.get(userId) ?? 'warm') : undefined

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
  }, [connected, expandedRootUserId, expandedSecondDegreeNodes, healthByUserId, incoming, meId, normalizedGraphQuery, sent])

  const selectedNode =
    selectedConnection
      ? nodes.find((node) => node.degree === 'direct' && node.connection.id === selectedConnection.id) ?? null
      : null

  const nodesByUserId = useMemo(() => new Map(nodes.map((node) => [node.userId, node])), [nodes])

  const visiblePeerEdges = useMemo(() => {
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
  }, [expandedPeerEdges, expandedSecondDegreeEdges, nodesByUserId, peerEdges])

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

  // Mobile compact bubbles + drag-to-expand panel
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Panel drag state — tracks translated Y offset (negative = expanded upward)
  const [panelExpandY, setPanelExpandY] = useState(0)
  const panelDragRef = useRef<{ startY: number; startOffset: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function onPanelPointerDown(e: React.PointerEvent) {
    panelDragRef.current = { startY: e.clientY, startOffset: panelExpandY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPanelPointerMove(e: React.PointerEvent) {
    if (!panelDragRef.current) return
    const dy = panelDragRef.current.startY - e.clientY
    const newY = Math.max(0, Math.min(window.innerHeight * 0.55, panelDragRef.current.startOffset + dy))
    setPanelExpandY(newY)
  }
  function onPanelPointerUp() {
    if (!panelDragRef.current) return
    // Snap: if dragged more than 30% of max, snap to fully expanded; else snap to peek
    const maxY = window.innerHeight * 0.55
    setPanelExpandY(panelExpandY > maxY * 0.3 ? maxY : 0)
    panelDragRef.current = null
  }

  // Reset panel position when selection changes
  useEffect(() => { setPanelExpandY(0) }, [selectedConnection, selectedSecondDegreeUser])

  return (
    <KCard
      style={{
        marginTop: 5,
        padding: 0,
        overflow: 'hidden',
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        borderRadius: 0,
      }}
    >
      <div className="k-knot-stage your-knot-stage">
        <div className="k-knot-bg">
          <div className="k-knot-search-box">
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
          ) : (
            <>
              <KnotForceGraph
                me={{ id: 'me', name: meName, avatarUrl: meAvatar }}
                nodes={nodes}
                peerEdges={graphPeerEdges}
                selectedNodeId={selectedNode?.id ?? null}
                query={query}
                compact={isMobile}
                onClearQuery={() => onQueryChange('')}
                onResetGraph={onResetGraphState}
                onSelectNode={(node: KnotGraphNode) => {
                  const match = nodes.find((item) => item.id === node.id)
                  if (!match) return

                  if (match.degree === 'second') {
                    onSelectSecondDegreeUser(match.userId)
                    return
                  }

                  onSelect(match.connection, match.tab)
                }}
                onClearSelection={onClear}
              />


              <div className="k-knot-stats-bar">
                {connected.length} connected · {visiblePeerEdges.length} inner ties · {expandedSecondDegreeNodes.length} expanded · {incoming.length} decisions · {sent.length} waiting
              </div>

              <div className="k-knot-legend-box">
                <WebLegendRow />
              </div>

              {(selectedConnection || selectedSecondDegreeUser) && (
                <div
                  ref={panelRef}
                  className="k-knot-detail-panel"
                  style={isMobile ? { transform: `translateY(${-panelExpandY}px)`, transition: panelDragRef.current ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)' } : undefined}
                >
                  {isMobile && (
                    <div
                      onPointerDown={onPanelPointerDown}
                      onPointerMove={onPanelPointerMove}
                      onPointerUp={onPanelPointerUp}
                      onPointerCancel={onPanelPointerUp}
                      style={{
                        padding: '12px 0 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        touchAction: 'none',
                        cursor: 'grab',
                        userSelect: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ width: 40, height: 5, borderRadius: 999, background: 'rgba(26,24,21,0.22)' }} />
                    </div>
                  )}
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

function WebLegendRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
      <WebLegend label="Knot" color="var(--ink)" />
      <WebLegend label="Tie" color="rgba(84,72,58,0.45)" />
      <WebLegend label="Decide" color="var(--verd)" />
      <WebLegend label="Waiting" color="var(--signal)" />
    </div>
  )
}

function WebLegend({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.8, color: 'var(--ink-muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
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

      <div
        style={{
          display: 'inline-flex',
          marginTop: 12,
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
            {expanding ? 'Expanding...' : expanded ? 'Collapse knot' : 'Expand knot'}
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
