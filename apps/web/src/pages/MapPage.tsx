import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiDelete, apiGet, apiPatch } from '../lib/api'
import { KAvatar, KBtn, KCard } from '../lib/knotify'

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
  secondDegreeNodes: Array<{
    id: string
    full_name: string | null
    username: string | null
    avatar_url: string | null
    current_company?: string | null
  }>
  peerEdges?: PeerEdge[]
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
  const [activeTab, setActiveTab] = useState<RelationshipTab>('Connected')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Your Knot')
      setConnections([])
      setPeerEdges([])
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
      if (selectedConnectionId === connection.id) setSelectedConnectionId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove relationship')
    } finally {
      setRemoving((prev) => ({ ...prev, [connection.id]: false }))
    }
  }

  function focusConnection(connection: Connection, tab: RelationshipTab) {
    setQuery('')
    setActiveTab(tab)
    setSelectedConnectionId(connection.id)
  }

  function clearFocus() {
    setSelectedConnectionId(null)
  }

  function messageUser(userId: string) {
    navigate(`/messages?to=${userId}`)
  }

  function inviteCoffee(userId: string) {
    navigate(`/messages?to=${userId}&action=coffee`)
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
          onAccept={(connection) => void acceptIncoming(connection)}
          onRemove={(connection) => void removeRelationship(connection)}
          onViewProfile={(userId) => navigate(`/profile/${userId}`)}
          onMessage={messageUser}
          onInviteCoffee={inviteCoffee}
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
  selectedConnection,
  selectedTab,
  query,
  onQueryChange,
  accepting,
  removing,
  onSelect,
  onClear,
  onAccept,
  onRemove,
  onViewProfile,
  onMessage,
  onInviteCoffee,
}: {
  meId: string | null
  meName: string
  meAvatar: string | null
  connected: Connection[]
  incoming: Connection[]
  sent: Connection[]
  peerEdges: PeerEdge[]
  selectedConnection: Connection | null
  selectedTab: RelationshipTab
  query: string
  onQueryChange: (value: string) => void
  accepting: Record<string, boolean>
  removing: Record<string, boolean>
  onSelect: (connection: Connection, tab: RelationshipTab) => void
  onClear: () => void
  onAccept: (connection: Connection) => void
  onRemove: (connection: Connection) => void
  onViewProfile: (userId: string) => void
  onMessage: (userId: string) => void
  onInviteCoffee: (userId: string) => void
}) {
  const normalizedGraphQuery = query.trim().toLowerCase()
  const hasGraphQuery = normalizedGraphQuery.length > 0

  const nodes = useMemo(() => {
    const ordered: Array<{ connection: Connection; tab: RelationshipTab }> = [
      ...incoming.map((connection) => ({ connection, tab: 'Incoming' as const })),
      ...connected.map((connection) => ({ connection, tab: 'Connected' as const })),
      ...sent.map((connection) => ({ connection, tab: 'Sent' as const })),
    ].slice(0, 20)

    if (ordered.length === 0) return []

    const count = ordered.length

    return ordered.map(({ connection, tab }, index) => {
      const angle = ((index / count) * Math.PI * 2) - Math.PI / 2
      const wave = Math.sin(index * 1.73) * 18
      const radius = tab === 'Connected' ? 215 + wave : 285 + wave
      const x = 500 + Math.cos(angle) * radius
      const y = 295 + Math.sin(angle) * radius * 0.55
      const user = connection.user
      const name = clean(user?.full_name) || 'Unknown person'
      const userId = otherUserId(connection, meId)

      return {
        connection,
        tab,
        userId,
        x,
        y,
        name,
        initial: name.charAt(0).toUpperCase(),
        avatarUrl: user?.avatar_url ?? null,
        context: userContext(user),
        matchesQuery: !normalizedGraphQuery || searchableText(connection).includes(normalizedGraphQuery),
      }
    })
  }, [connected, incoming, meId, normalizedGraphQuery, sent])

  const selectedNode = selectedConnection
    ? nodes.find((node) => node.connection.id === selectedConnection.id) ?? null
    : null

  const nodesByUserId = useMemo(() => new Map(nodes.map((node) => [node.userId, node])), [nodes])

  const visiblePeerEdges = useMemo(() => {
    return peerEdges
      .map((edge) => {
        const source = nodesByUserId.get(edge.source_id)
        const target = nodesByUserId.get(edge.target_id)
        if (!source || !target) return null
        return { ...edge, source, target }
      })
      .filter(Boolean) as Array<PeerEdge & { source: (typeof nodes)[number]; target: (typeof nodes)[number] }>
  }, [nodesByUserId, peerEdges])

  const selectedPeerNames = useMemo(() => {
    if (!selectedNode) return []
    return visiblePeerEdges
      .filter((edge) => edge.source.userId === selectedNode.userId || edge.target.userId === selectedNode.userId)
      .map((edge) => (edge.source.userId === selectedNode.userId ? edge.target.name : edge.source.name))
      .slice(0, 4)
  }, [selectedNode, visiblePeerEdges])

  const selectedPeerUserIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()

    return new Set(
      visiblePeerEdges
        .filter((edge) => edge.source.userId === selectedNode.userId || edge.target.userId === selectedNode.userId)
        .map((edge) => (edge.source.userId === selectedNode.userId ? edge.target.userId : edge.source.userId))
    )
  }, [selectedNode, visiblePeerEdges])

  const hasRelationships = nodes.length > 0

  return (
    <KCard
      style={{
        marginTop: 5,
        padding: 0,
        overflow: 'hidden',
        minHeight: 'calc(100vh - 78px)',
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        borderRadius: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          minHeight: 'calc(100vh - 78px)',
        }}
        className="your-knot-stage"
      >
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            minHeight: 'calc(100vh - 78px)',
            borderRadius: 0,
            background:
              'linear-gradient(180deg, rgba(244,239,230,0.88), rgba(244,239,230,0.58)), radial-gradient(rgba(84,72,58,0.10) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 18px 18px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              zIndex: 8,
              width: 'min(390px, calc(100% - 380px))',
              padding: '7px 10px',
              borderRadius: 14,
              border: '0.5px solid var(--rule)',
              background: 'rgba(244,239,230,0.84)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 12px 36px rgba(26,24,21,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
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
              <svg
                viewBox="0 0 1000 590"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                <defs>
                  <radialGradient id="knotCenterGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(84,72,58,0.10)" />
                    <stop offset="58%" stopColor="rgba(84,72,58,0.04)" />
                    <stop offset="100%" stopColor="rgba(84,72,58,0)" />
                  </radialGradient>
                </defs>

                <circle cx="500" cy="295" r="260" fill="url(#knotCenterGlow)" />

                {/* Only real peerEdges draw person-to-person ties. No decorative node rings. */}

                {nodes.map((node, index) => {
                  const selected = selectedConnection?.id === node.connection.id
                  const related = selectedPeerUserIds.has(node.userId)
                  const muted = Boolean(selectedConnection) && !selected && !related
                  const searchHit = hasGraphQuery && node.matchesQuery
                  const searchMuted = hasGraphQuery && !node.matchesQuery

                  const stroke = selected
                    ? 'rgba(26,24,21,0.28)'
                    : searchHit
                      ? 'rgba(26,24,21,0.34)'
                      : related
                        ? 'rgba(84,72,58,0.14)'
                        : muted || searchMuted
                          ? 'rgba(84,72,58,0.035)'
                          : node.tab === 'Incoming'
                          ? 'rgba(31,107,94,0.34)'
                          : node.tab === 'Sent'
                            ? 'rgba(216,68,43,0.28)'
                            : 'rgba(84,72,58,0.20)'

                  const c1x = 500 + (node.x - 500) * 0.34 + Math.sin(index * 2.1) * 38
                  const c1y = 295 + (node.y - 295) * 0.28 - Math.cos(index * 1.4) * 28
                  const c2x = 500 + (node.x - 500) * 0.72 - Math.cos(index * 1.9) * 32
                  const c2y = 295 + (node.y - 295) * 0.74 + Math.sin(index * 1.2) * 24

                  return (
                    <path
                      key={`strand-${node.connection.id}`}
                      d={`M 500 295 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${node.x} ${node.y}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={selected ? 1.2 : searchHit ? 1.25 : related ? 0.85 : muted || searchMuted ? 0.28 : node.tab === 'Connected' ? 0.85 : 1.1}
                      strokeDasharray={node.tab === 'Connected' ? 'none' : '8 8'}
                      strokeLinecap="round"
                    />
                  )
                })}

                {visiblePeerEdges.map((edge, index) => {
                  const selected =
                    selectedConnection?.id === edge.source.connection.id ||
                    selectedConnection?.id === edge.target.connection.id

                  if (selectedConnection && !selected) return null
                  if (hasGraphQuery && !edge.source.matchesQuery && !edge.target.matchesQuery) return null

                  const midX = (edge.source.x + edge.target.x) / 2
                  const midY = (edge.source.y + edge.target.y) / 2
                  const awayX = midX + (midX - 500) * 0.34 + Math.sin(index * 1.7) * 12
                  const awayY = midY + (midY - 295) * 0.52 - Math.cos(index * 1.3) * 10
                  const softX = midX + (midX - 500) * 0.18 + Math.sin(index * 1.7) * 10
                  const softY = midY + (midY - 295) * 0.32 - Math.cos(index * 1.3) * 8
                  const curveX = selected ? awayX : softX
                  const curveY = selected ? awayY : softY
                  const pathD = `M ${edge.source.x} ${edge.source.y} Q ${curveX} ${curveY} ${edge.target.x} ${edge.target.y}`

                  return (
                    <path
                      key={`peer-${edge.source_id}-${edge.target_id}`}
                      d={pathD}
                      fill="none"
                      stroke={selected ? 'rgba(26,24,21,0.38)' : hasGraphQuery ? 'rgba(26,24,21,0.20)' : 'rgba(84,72,58,0.16)'}
                      strokeWidth={selected ? 1.45 : 0.85}
                      strokeDasharray={selected ? 'none' : '6 10'}
                      strokeLinecap="round"
                    />
                  )
                })}

                <circle cx="500" cy="295" r="108" fill="rgba(244,239,230,0.22)" />
                <circle cx="500" cy="295" r="82" fill="rgba(255,252,246,0.22)" />
                <circle cx="500" cy="295" r="82" fill="none" stroke="rgba(84,72,58,0.10)" strokeWidth="1.2" />
                <circle cx="500" cy="295" r="56" fill="rgba(255,252,246,0.30)" />
              </svg>

              <button
                type="button"
                onClick={onClear}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 112,
                  height: 112,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  boxShadow: 'none',
                  zIndex: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0,
                }}
                title={`Clear focus for ${meName}`}
              >
                <KAvatar
                  name={meName}
                  src={meAvatar}
                  size={meAvatar ? 86 : 82}
                  style={{
                    border: meAvatar ? '3px solid rgba(255,252,246,0.96)' : '1px solid rgba(84,72,58,0.16)',
                    background: meAvatar
                      ? 'var(--paper)'
                      : 'linear-gradient(135deg, rgba(238,242,255,0.96), rgba(255,252,246,0.98))',
                    color: 'var(--indigo, #4455c7)',
                    boxShadow: meAvatar
                      ? '0 18px 48px rgba(26,24,21,0.18), 0 0 0 9px rgba(255,252,246,0.42)'
                      : '0 16px 42px rgba(26,24,21,0.10), 0 0 0 9px rgba(255,252,246,0.42)',
                  }}
                />
              </button>

              {nodes.map((node) => {
                const selected = selectedConnection?.id === node.connection.id
                const related = selectedPeerUserIds.has(node.userId)
                const muted = Boolean(selectedConnection) && !selected && !related
                const searchHit = hasGraphQuery && node.matchesQuery
                const searchMuted = hasGraphQuery && !node.matchesQuery
                const statusColor = selected
                  ? 'var(--ink)'
                  : related
                    ? 'rgba(26,24,21,0.68)'
                    : node.tab === 'Incoming'
                      ? 'var(--verd)'
                      : node.tab === 'Sent'
                        ? 'var(--signal)'
                        : 'var(--ink-muted)'
                const border = selected
                  ? 'rgba(26,24,21,0.58)'
                  : searchHit
                    ? 'rgba(26,24,21,0.62)'
                    : related
                      ? 'rgba(84,72,58,0.46)'
                    : node.tab === 'Incoming'
                      ? 'rgba(31,107,94,0.30)'
                      : node.tab === 'Sent'
                        ? 'rgba(216,68,43,0.30)'
                        : 'var(--rule)'

                return (
                  <button
                    key={node.connection.id}
                    type="button"
                    onClick={() => onSelect(node.connection, node.tab)}
                    style={{
                      position: 'absolute',
                      left: `${node.x / 10}%`,
                      top: `${node.y / 5.9}%`,
                      transform: 'translate(-50%, -50%)',
                      width: selected ? 196 : searchHit ? 190 : related ? 180 : 166,
                      minHeight: 54,
                      padding: '8px 10px',
                      borderRadius: 16,
                      border: `0.5px solid ${border}`,
                      borderLeft: selected ? '4px solid var(--ink)' : searchHit ? '4px solid var(--ink)' : related ? '3px solid rgba(84,72,58,0.34)' : `0.5px solid ${border}`,
                      background: selected ? 'linear-gradient(180deg, rgba(255,252,246,0.98), rgba(244,239,230,0.94))' : searchHit ? 'rgba(255,252,246,0.98)' : related ? 'rgba(244,239,230,0.96)' : 'rgba(244,239,230,0.72)',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      boxShadow: selected ? '0 22px 58px rgba(26,24,21,0.16)' : searchHit ? '0 18px 44px rgba(26,24,21,0.13)' : related ? '0 14px 34px rgba(26,24,21,0.08)' : '0 4px 14px rgba(26,24,21,0.02)',
                      display: 'grid',
                      gridTemplateColumns: '30px minmax(0, 1fr)',
                      gap: 8,
                      alignItems: 'center',
                      textAlign: 'left',
                      zIndex: selected ? 5 : searchHit ? 4 : related ? 3 : 2,
                      opacity: muted || searchMuted ? 0.12 : 1,
                    }}
                    title={`${node.name} - ${relationLabel(node.tab)}`}
                  >
                    <KAvatar
                      name={node.name}
                      src={node.avatarUrl}
                      size={30}
                      style={{
                        borderRadius: 10,
                        border: selected ? '0.5px solid rgba(26,24,21,0.24)' : related ? '0.5px solid rgba(84,72,58,0.30)' : '0.5px solid var(--rule)',
                        background: selected ? 'var(--paper-soft)' : related ? 'var(--paper)' : 'var(--paper-soft)',
                        boxShadow: node.avatarUrl ? '0 4px 12px rgba(26,24,21,0.08)' : undefined,
                      }}
                    />

                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12.5,
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {node.name}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          marginTop: 3,
                          fontSize: 10.8,
                          color: selected ? 'var(--ink-muted)' : related ? 'rgba(84,72,58,0.78)' : 'var(--ink-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: statusColor,
                            display: 'inline-block',
                            flex: '0 0 auto',
                          }}
                        />
                        {selected ? node.context : searchHit ? 'Search match' : related ? `Also knows ${firstName(selectedNode?.name)}` : node.tab === 'Connected' ? node.context : relationLabel(node.tab)}
                      </span>
                    </span>
                  </button>
                )
              })}

              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 14,
                  zIndex: 5,
                  padding: '8px 11px',
                  borderRadius: 999,
                  background: 'rgba(244,239,230,0.86)',
                  border: '0.5px solid var(--rule)',
                  color: 'var(--ink-muted)',
                  fontSize: 12,
                  backdropFilter: 'blur(10px)',
                }}
              >
                {connected.length} connected · {visiblePeerEdges.length} inner ties · {incoming.length} decisions · {sent.length} waiting
              </div>

              <div
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 12,
                  zIndex: 6,
                  padding: '6px 8px',
                  borderRadius: 999,
                  border: '0.5px solid var(--rule)',
                  background: 'rgba(244,239,230,0.84)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 12px 36px rgba(26,24,21,0.06)',
                }}
              >
                <WebLegendRow />
              </div>

              {selectedConnection && (
                <div
                  style={{
                    position: 'absolute',
                    right: 18,
                    top: 78,
                    zIndex: 7,
                    width: 336,
                    maxHeight: 'calc(100% - 100px)',
                    overflowY: 'auto',
                    borderRadius: 22,
                    boxShadow: '0 28px 80px rgba(26,24,21,0.16)',
                  }}
                >
                  <SelectedRelationshipPanel
                    connection={selectedConnection}
                    tab={selectedTab}
                    mutualNames={selectedPeerNames}
                    accepting={Boolean(accepting[selectedConnection.id])}
                    removing={Boolean(removing[selectedConnection.id])}
                    onClear={onClear}
                    onAccept={() => onAccept(selectedConnection)}
                    onRemove={() => onRemove(selectedConnection)}
                    onMessage={() => onMessage(otherUserId(selectedConnection, meId))}
                    onInviteCoffee={() => onInviteCoffee(otherUserId(selectedConnection, meId))}
                    onViewProfile={() => onViewProfile(otherUserId(selectedConnection, meId))}
                  />
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

function SelectedRelationshipPanel({
  connection,
  tab,
  mutualNames,
  accepting,
  removing,
  onClear,
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
  onClear: () => void
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
