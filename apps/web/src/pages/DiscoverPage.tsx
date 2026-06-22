import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '../lib/knotify'
import { T, DeskPage, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'

type Skill = {
  skill_id?: number
  id?: number
  name: string
  category?: string | null
}

type DiscoverUser = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline?: string | null
  bio?: string | null
  location_city?: string | null
  university: string | null
  current_company: string | null
  status: string
  skills?: Skill[]
  mutual_connections_count?: number
  match_reason?: string
  match_reasons?: string[]
  match_score?: number
  profile_signal?: number
}

type Me = {
  id: string
  full_name: string
  username: string
  headline?: string | null
  location_city?: string | null
  university?: string | null
  current_company?: string | null
  status?: string | null
}

type ConnectionUser = {
  id: string
  full_name?: string | null
  username?: string | null
  avatar_url?: string | null
  headline?: string | null
  location_city?: string | null
  university?: string | null
  current_company?: string | null
  status?: string | null
}

type Connection = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  user: ConnectionUser | null
}

type RelationState = 'none' | 'pending_outgoing' | 'pending_incoming' | 'connected'

const DISCOVER_TABS = ['Recommended', 'Same city', 'Shared skills', 'Students', 'Open to work'] as const
type DiscoverTab = typeof DISCOVER_TABS[number]

const MANAGER_TABS = ['Incoming', 'Sent', 'Connected'] as const
type ManagerTab = typeof MANAGER_TABS[number]

function normalise(value?: string | null) {
  return value?.trim().toLowerCase() ?? ''
}

function statusPill(status: string) {
  if (status === 'employed') return { label: 'Employed', color: 'verd' as const }
  if (status === 'open_to_work') return { label: 'Open to work', color: 'ochre' as const }
  return { label: 'Student', color: 'default' as const }
}

function profileContext(user: DiscoverUser | ConnectionUser) {
  return [user.location_city, user.current_company, user.university].filter(Boolean).join(' - ') || 'More context needed'
}

function skillKey(skill: Skill) {
  return normalise(skill.name)
}

function sharedSkillNames(user: DiscoverUser, mySkills: Skill[]) {
  const mine = new Set(mySkills.map(skillKey).filter(Boolean))
  return (user.skills ?? []).filter((s) => mine.has(skillKey(s))).map((s) => s.name)
}

function fallbackReason(user: DiscoverUser, me: Me | null, mySkills: Skill[]) {
  const shared = sharedSkillNames(user, mySkills)
  const sameCity = me?.location_city && user.location_city && normalise(me.location_city) === normalise(user.location_city)
  const sameUniversity = me?.university && user.university && normalise(me.university) === normalise(user.university)

  if (sameCity && shared.length) return `Also in ${user.location_city} and shares ${shared[0]}.`
  if (sameUniversity) return `Also connected to ${user.university}.`
  if (shared.length) return `Shares ${shared.slice(0, 2).join(' and ')} with you.`
  if (sameCity) return `Also based in ${user.location_city}.`
  if ((user.mutual_connections_count ?? 0) > 0) return `${user.mutual_connections_count} mutual connection${user.mutual_connections_count === 1 ? '' : 's'} in your knot.`
  if ((user.skills ?? []).length > 0) return `Shows ${(user.skills ?? [])[0].name} and related skills.`
  return 'Has enough context to explore intentionally.'
}

function buildRelationState(connections: Connection[], meId: string) {
  const relations: Record<string, RelationState> = {}
  const ids: Record<string, string> = {}
  const incoming: Connection[] = []
  const outgoing: Connection[] = []
  const accepted: Connection[] = []

  for (const c of connections) {
    const otherUserId = c.requester_id === meId ? c.addressee_id : c.requester_id
    ids[otherUserId] = c.id

    if (c.status === 'accepted') {
      relations[otherUserId] = 'connected'
      accepted.push(c)
    }

    if (c.status === 'pending' && c.requester_id === meId) {
      relations[otherUserId] = 'pending_outgoing'
      outgoing.push(c)
    }

    if (c.status === 'pending' && c.addressee_id === meId) {
      relations[otherUserId] = 'pending_incoming'
      incoming.push(c)
    }
  }

  return { relations, ids, incoming, outgoing, accepted }
}

function userFromDiscoverUser(user?: DiscoverUser | null): ConnectionUser | null {
  if (!user) return null

  return {
    id: user.id,
    full_name: user.full_name,
    username: user.username,
    avatar_url: user.avatar_url,
    headline: user.headline,
    location_city: user.location_city,
    university: user.university,
    current_company: user.current_company,
    status: user.status,
  }
}

export function DiscoverPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<DiscoverTab>('Recommended')
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<ManagerTab>('Incoming')
  const [managerQuery, setManagerQuery] = useState('')
  const [me, setMe] = useState<Me | null>(null)
  const [meSkills, setMeSkills] = useState<Skill[]>([])
  const [users, setUsers] = useState<DiscoverUser[]>([])
  const [suggestions, setSuggestions] = useState<DiscoverUser[]>([])
  const [relations, setRelations] = useState<Record<string, RelationState>>({})
  const [connectionIds, setConnectionIds] = useState<Record<string, string>>({})
  const [incomingRequests, setIncomingRequests] = useState<Connection[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<Connection[]>([])
  const [acceptedConnections, setAcceptedConnections] = useState<Connection[]>([])
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadInitial() {
    setLoadingInitial(true)
    setError(null)

    try {
      const [meResult, extendedResult, connectionsResult] = await Promise.all([
        apiGet<{ user: Me }>('/api/users/me'),
        apiGet<{ skills: Skill[] }>('/api/users/me/profile-extended'),
        apiGet<{ connections: Connection[] }>('/api/connections'),
      ])

      const state = buildRelationState(connectionsResult.connections ?? [], meResult.user.id)

      setMe(meResult.user)
      setMeSkills(extendedResult.skills ?? [])
      setRelations(state.relations)
      setConnectionIds(state.ids)
      setIncomingRequests(state.incoming)
      setOutgoingRequests(state.outgoing)
      setAcceptedConnections(state.accepted)
      setSuggestions([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Discover')
    } finally {
      setLoadingInitial(false)
    }
  }

  useEffect(() => {
    void loadInitial()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setUsers([])
      setLoadingSearch(false)
      return
    }

    setLoadingSearch(true)

    const id = window.setTimeout(async () => {
      try {
        const data = await apiGet<{ users: DiscoverUser[] }>(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
        setUsers(data.users ?? [])
        setError(null)
      } catch (err) {
        setUsers([])
        setError(err instanceof Error ? err.message : 'Failed to search')
      } finally {
        setLoadingSearch(false)
      }
    }, 250)

    return () => window.clearTimeout(id)
  }, [query])

  function openManager(tab: ManagerTab) {
    setQuery('')
    setManagerQuery('')
    setManagerTab(tab)
    setManagerOpen(true)
  }

  function findKnownUser(userId: string) {
    return [...users, ...suggestions].find((u) => u.id === userId) ?? null
  }

  async function connect(addresseeId: string, knownUser?: DiscoverUser) {
    setPending((prev) => ({ ...prev, [addresseeId]: true }))
    setError(null)

    try {
      const result = await apiPost<{
        connection: Connection
        autoAccepted?: boolean
        alreadyConnected?: boolean
      }>('/api/connections', { addresseeId })

      const user = knownUser ?? findKnownUser(addresseeId)
      const optimisticConnection: Connection = {
        ...result.connection,
        user: result.connection.user ?? userFromDiscoverUser(user),
      }

      setConnectionIds((prev) => ({ ...prev, [addresseeId]: result.connection.id }))

      const nextState =
        result.connection.status === 'accepted' || result.autoAccepted || result.alreadyConnected
          ? 'connected'
          : 'pending_outgoing'

      setRelations((prev) => ({ ...prev, [addresseeId]: nextState }))
      setIncomingRequests((prev) => prev.filter((c) => c.requester_id !== addresseeId))
      setOutgoingRequests((prev) => prev.filter((c) => c.addressee_id !== addresseeId && c.requester_id !== addresseeId))
      setAcceptedConnections((prev) => prev.filter((c) => c.addressee_id !== addresseeId && c.requester_id !== addresseeId))

      if (nextState === 'connected') {
        setAcceptedConnections((prev) => [optimisticConnection, ...prev])
      } else {
        setOutgoingRequests((prev) => [optimisticConnection, ...prev])
      }

      setSuggestions((prev) => prev.filter((u) => u.id !== addresseeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setPending((prev) => ({ ...prev, [addresseeId]: false }))
    }
  }

  async function acceptIncoming(userId: string) {
    const existing = incomingRequests.find((c) => c.requester_id === userId)
    const connId = connectionIds[userId] ?? existing?.id

    if (!connId) {
      setError('Incoming request not found. Refresh and try again.')
      return
    }

    setPending((prev) => ({ ...prev, [userId]: true }))
    setError(null)

    try {
      await apiPatch(`/api/connections/${connId}`, { status: 'accepted' })
      setIncomingRequests((prev) => prev.filter((c) => c.id !== connId))
      setRelations((prev) => ({ ...prev, [userId]: 'connected' }))

      if (existing) {
        setAcceptedConnections((prev) => [{ ...existing, status: 'accepted' }, ...prev])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request')
    } finally {
      setPending((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const showResults = !managerOpen && query.trim().length >= 2
  const sourceUsers = showResults ? users : suggestions

  const visibleUsers = useMemo(() => {
    const list = sourceUsers.filter((u) => u.id !== me?.id)

    const filtered = list.filter((u) => {
      if (activeTab === 'Recommended') return true
      if (activeTab === 'Same city') {
        return Boolean(me?.location_city && u.location_city && normalise(me.location_city) === normalise(u.location_city))
      }
      if (activeTab === 'Shared skills') return sharedSkillNames(u, meSkills).length > 0
      if (activeTab === 'Students') return u.status === 'studying'
      if (activeTab === 'Open to work') return u.status === 'open_to_work'
      return true
    })

    return [...filtered].sort((a, b) => {
      const aIncoming = relations[a.id] === 'pending_incoming' ? 1000 : 0
      const bIncoming = relations[b.id] === 'pending_incoming' ? 1000 : 0
      return (bIncoming + (b.match_score ?? 0)) - (aIncoming + (a.match_score ?? 0))
    })
  }, [activeTab, me, meSkills, relations, sourceUsers])

  const contextBits = [
    me?.location_city,
    meSkills.length ? `${meSkills.length} skills` : null,
    me?.status ? statusPill(me.status).label : null,
  ].filter(Boolean)

  function otherUserId(connection: Connection) {
    if (!me?.id) return connection.user?.id ?? connection.requester_id
    return connection.requester_id === me.id ? connection.addressee_id : connection.requester_id
  }

  function peer(connection: Connection) {
    const fallbackId = otherUserId(connection)
    return connection.user ?? {
      id: fallbackId,
      full_name: 'Someone',
      username: 'user',
      avatar_url: null,
    }
  }

  function relationSearchText(connection: Connection) {
    const p = peer(connection)
    return [
      p.full_name,
      p.username,
      p.headline,
      p.location_city,
      p.university,
      p.current_company,
    ].filter(Boolean).join(' ').toLowerCase()
  }

  function managerRows() {
    const rows =
      managerTab === 'Incoming'
        ? incomingRequests
        : managerTab === 'Sent'
          ? outgoingRequests
          : acceptedConnections

    const q = managerQuery.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((connection) => relationSearchText(connection).includes(q))
  }

  function ConnectionAction({ user }: { user: DiscoverUser }) {
    const relation = relations[user.id] ?? 'none'

    if (relation === 'connected') {
      return <KBtn variant="ghost" size="sm" disabled>Connected</KBtn>
    }

    if (relation === 'pending_outgoing') {
      return <KBtn variant="ghost" size="sm" disabled>Request sent</KBtn>
    }

    if (relation === 'pending_incoming') {
      return (
        <KBtn variant="verd" size="sm" disabled={pending[user.id]} onClick={(e) => { e.stopPropagation(); void acceptIncoming(user.id) }}>
          {pending[user.id] ? 'Accepting...' : 'Accept request'}
        </KBtn>
      )
    }

    return (
      <KBtn variant="signal" size="sm" disabled={pending[user.id]} onClick={(e) => { e.stopPropagation(); void connect(user.id, user) }}>
        {pending[user.id] ? 'Sending...' : 'Connect'}
      </KBtn>
    )
  }

  function PersonCard({ user }: { user: DiscoverUser }) {
    const pill = statusPill(user.status)
    const skills = user.skills ?? []
    const reason = user.match_reason || fallbackReason(user, me, meSkills)
    const shared = sharedSkillNames(user, meSkills)
    const reasonTags = user.match_reasons?.length ? user.match_reasons : shared

    return (
      <KCard
        style={{ padding: '18px 18px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={() => navigate(`/profile/${user.id}`)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          <KAvatar name={user.full_name} src={user.avatar_url} size={50} style={{ flexShrink: 0 }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name}
              </span>
              <VerifiedBadge size={13} />
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 6 }}>
              @{user.username}
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.35 }}>
              {user.headline || profileContext(user)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <KPill color={pill.color}>{pill.label}</KPill>
          {user.location_city && <KPill>{user.location_city}</KPill>}
          {typeof user.profile_signal === 'number' && user.profile_signal >= 70 && <KPill color="verd">Strong signal</KPill>}
          {(user.mutual_connections_count ?? 0) > 0 && <KPill>{user.mutual_connections_count} mutual</KPill>}
        </div>

        {(user.current_company || user.university) && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', borderTop: '0.5px solid var(--rule)', paddingTop: 10 }}>
            {[user.current_company, user.university].filter(Boolean).join(' - ')}
          </div>
        )}

        <div style={{ border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', borderRadius: 12, padding: '10px 11px' }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--ink-faint)', marginBottom: 4 }}>
            Why this person
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.35 }}>
            {reason}
          </div>
          {reasonTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {reasonTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-muted)',
                    background: 'var(--paper)',
                    border: '0.5px solid var(--rule)',
                    borderRadius: 999,
                    padding: '3px 7px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skills.slice(0, 3).map((skill) => (
              <span
                key={`${user.id}-${skill.skill_id ?? skill.id ?? skill.name}`}
                style={{
                  fontSize: 11.5,
                  color: shared.includes(skill.name) ? 'var(--signal)' : 'var(--ink-muted)',
                  border: `0.5px solid ${shared.includes(skill.name) ? 'rgba(216,68,43,0.25)' : 'var(--rule)'}`,
                  background: shared.includes(skill.name) ? 'var(--signal-soft)' : 'transparent',
                  borderRadius: 999,
                  padding: '4px 8px',
                }}
              >
                {skill.name}
              </span>
            ))}
            {skills.length > 3 && (
              <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', padding: '4px 2px' }}>
                +{skills.length - 3}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
          <KBtn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${user.id}`) }}>
            View profile
          </KBtn>
          <ConnectionAction user={user} />
        </div>
      </KCard>
    )
  }

  function IncomingActionRow({ connection }: { connection: Connection }) {
    const p = peer(connection)
    const id = otherUserId(connection)
    const name = p.full_name ?? 'Someone'
    const username = p.username ?? 'user'

    return (
      <div
        onClick={() => navigate(`/profile/${id}`)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 0',
          borderTop: '0.5px solid var(--rule)',
          cursor: 'pointer',
        }}
      >
        <KAvatar name={name} src={p.avatar_url ?? null} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
            @{username} - {p.headline || profileContext(p)}
          </div>
        </div>

        <KBtn
          variant="verd"
          size="sm"
          disabled={pending[id]}
          onClick={(e) => {
            e.stopPropagation()
            void acceptIncoming(id)
          }}
        >
          Accept
        </KBtn>
      </div>
    )
  }

  function RelationshipCard({ connection, kind }: { connection: Connection; kind: ManagerTab }) {
    const p = peer(connection)
    const id = otherUserId(connection)
    const name = p.full_name ?? 'Someone'
    const username = p.username ?? 'user'
    const statusTone = kind === 'Incoming' ? 'verd' : kind === 'Sent' ? 'ochre' : 'default'
    const statusLabel = kind === 'Incoming' ? 'Needs decision' : kind === 'Sent' ? 'Request sent' : 'In your knot'

    return (
      <KCard
        style={{ padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
        onClick={() => navigate(`/profile/${id}`)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <KAvatar name={name} src={p.avatar_url ?? null} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
              @{username}
            </div>
          </div>
          <KPill color={statusTone}>{statusLabel}</KPill>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.4, minHeight: 38 }}>
          {p.headline || profileContext(p)}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.location_city && <KPill>{p.location_city}</KPill>}
          {p.status && <KPill color={statusPill(p.status).color}>{statusPill(p.status).label}</KPill>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
          <KBtn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${id}`) }}>
            View profile
          </KBtn>

          {kind === 'Incoming' ? (
            <KBtn
              variant="verd"
              size="sm"
              disabled={pending[id]}
              onClick={(e) => {
                e.stopPropagation()
                void acceptIncoming(id)
              }}
            >
              Accept
            </KBtn>
          ) : (
            <KBtn variant="ghost" size="sm" disabled>
              {statusLabel}
            </KBtn>
          )}
        </div>
      </KCard>
    )
  }

  function QueueCountButton({
    label,
    count,
    tab,
    tone,
  }: {
    label: string
    count: number
    tab: ManagerTab
    tone: 'neutral' | 'incoming' | 'sent'
  }) {
    const active = count > 0
    const background =
      tone === 'incoming' && active
        ? 'var(--verd-soft)'
        : tone === 'sent' && active
          ? 'var(--signal-soft)'
          : 'var(--paper)'

    const color =
      tone === 'incoming' && active
        ? 'var(--verd)'
        : tone === 'sent' && active
          ? 'var(--signal)'
          : 'var(--ink-faint)'

    return (
      <button
        type="button"
        onClick={() => openManager(tab)}
        style={{
          border: '0.5px solid var(--rule)',
          borderRadius: 999,
          background,
          color,
          padding: '4px 9px',
          fontSize: 11,
          fontFamily: "'IBM Plex Mono', monospace",
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {count} {label}
      </button>
    )
  }

  function ConnectionQueuePreview() {
    const hasAny = incomingRequests.length + outgoingRequests.length + acceptedConnections.length > 0
    if (!hasAny) return null

    if (incomingRequests.length > 0) {
      return (
        <KCard
          style={{
            padding: 16,
            marginBottom: 22,
            background: 'linear-gradient(180deg, var(--paper), var(--paper-soft))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 5 }}>
                Action inbox
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                New requests need your decision
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                Incoming requests stay on top. Sent and connected lists live in the manager.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
              <QueueCountButton label="incoming" count={incomingRequests.length} tab="Incoming" tone="incoming" />
              <QueueCountButton label="sent" count={outgoingRequests.length} tab="Sent" tone="sent" />
              <QueueCountButton label="in knot" count={acceptedConnections.length} tab="Connected" tone="neutral" />
              <KBtn variant="ghost" size="sm" onClick={() => openManager('Incoming')}>
                Manage
              </KBtn>
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid var(--rule)' }}>
            {incomingRequests.slice(0, 3).map((connection) => (
              <IncomingActionRow key={connection.id} connection={connection} />
            ))}
          </div>

          {incomingRequests.length > 3 && (
            <button
              type="button"
              onClick={() => openManager('Incoming')}
              style={{
                width: '100%',
                marginTop: 8,
                border: '0.5px solid var(--rule)',
                borderRadius: 12,
                background: 'var(--paper)',
                color: 'var(--ink-muted)',
                padding: '8px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Review {incomingRequests.length - 3} more incoming request{incomingRequests.length - 3 === 1 ? '' : 's'}
            </button>
          )}
        </KCard>
      )
    }

    return (
      <KCard
        style={{
          padding: '13px 15px',
          marginBottom: 22,
          background: 'var(--paper-soft)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 4 }}>
              Connection hub
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
              No incoming requests need action. Sent requests and people in your knot live in the manager.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
            <QueueCountButton label="sent" count={outgoingRequests.length} tab="Sent" tone="sent" />
            <QueueCountButton label="in knot" count={acceptedConnections.length} tab="Connected" tone="neutral" />
            <KBtn variant="ghost" size="sm" onClick={() => openManager(outgoingRequests.length ? 'Sent' : 'Connected')}>
              Open manager
            </KBtn>
          </div>
        </div>
      </KCard>
    )
  }

  function ConnectionManager() {
    const rows = managerRows()
    const total =
      managerTab === 'Incoming'
        ? incomingRequests.length
        : managerTab === 'Sent'
          ? outgoingRequests.length
          : acceptedConnections.length

    return (
      <div>
        <KCard style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 5 }}>
                Connection manager
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                Manage requests and people in your knot
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45, maxWidth: 620 }}>
                Review incoming requests, track sent requests, and open people already in your knot as cards.
              </div>
            </div>

            <KBtn
              variant="ghost"
              size="sm"
              onClick={() => {
                setManagerOpen(false)
                setManagerQuery('')
              }}
            >
              Back to Discover
            </KBtn>
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            {MANAGER_TABS.map((tab) => {
              const count = tab === 'Incoming' ? incomingRequests.length : tab === 'Sent' ? outgoingRequests.length : acceptedConnections.length
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setManagerTab(tab)}
                  style={{
                    padding: '6px 13px',
                    borderRadius: 999,
                    border: managerTab === tab ? 'none' : '0.5px solid var(--rule)',
                    background: managerTab === tab ? 'var(--ink)' : 'transparent',
                    color: managerTab === tab ? 'var(--paper)' : 'var(--ink-muted)',
                    fontSize: 12,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab === 'Connected' ? 'In your knot' : tab} ({count})
                </button>
              )
            })}
          </div>

          <div style={{ position: 'relative' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              value={managerQuery}
              onChange={(e) => setManagerQuery(e.target.value)}
              placeholder={`Search ${managerTab.toLowerCase()} connections...`}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: 13,
                border: '0.5px solid var(--rule)',
                background: 'var(--paper-soft)',
                fontSize: 13.5,
                fontFamily: "'IBM Plex Sans', sans-serif",
                color: 'var(--ink)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </KCard>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 4 }}>
              {managerTab}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              {rows.length} shown out of {total}
            </div>
          </div>
        </div>

        {rows.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
            {rows.map((connection) => (
              <RelationshipCard key={`${managerTab}-${connection.id}`} connection={connection} kind={managerTab} />
            ))}
          </div>
        ) : (
          <KCard style={{ padding: 36, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 18, color: 'var(--ink)', margin: '0 0 8px' }}>
              Nothing here.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 auto 16px', maxWidth: 440, lineHeight: 1.5 }}>
              {managerQuery
                ? 'No relationship matches that search.'
                : managerTab === 'Incoming'
                  ? 'No one needs your decision right now.'
                  : managerTab === 'Sent'
                    ? 'No sent requests are waiting right now.'
                    : 'No one is in your knot yet.'}
            </p>
            <KBtn
              variant="signal"
              size="sm"
              onClick={() => {
                setManagerOpen(false)
                setManagerQuery('')
              }}
            >
              Discover people
            </KBtn>
          </KCard>
        )}
      </div>
    )
  }

  function DiscoverContent() {
    return (
      <>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, university, company, city, or headline..."
            style={{
              width: '100%',
              padding: '12px 16px 12px 40px',
              borderRadius: 14,
              border: '0.5px solid var(--rule)',
              background: 'var(--paper-soft)',
              fontSize: 14,
              fontFamily: "'IBM Plex Sans', sans-serif",
              color: 'var(--ink)',
              outline: 'none',
              boxSizing: 'border-box',
              boxShadow: '0 1px 3px rgba(26,24,21,0.05)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--signal)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule)' }}
          />

          {(loadingSearch || (showResults && visibleUsers.length > 0)) && (
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {loadingSearch ? '...' : visibleUsers.length}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 18, overflowX: 'auto', scrollbarWidth: 'none' }}>

            {DISCOVER_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 13px',
                  borderRadius: 999,
                  border: activeTab === tab ? 'none' : '0.5px solid var(--rule)',
                  background: activeTab === tab ? 'var(--ink)' : 'transparent',
                  color: activeTab === tab ? 'var(--paper)' : 'var(--ink-muted)',
                  fontSize: 12,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {tab}
              </button>
            ))}

          </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 4 }}>
              {showResults ? 'Search results' : 'Recommended'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              {showResults
                ? `People matching "${query.trim()}"`
                : 'People with a visible reason to connect.'}
            </div>
          </div>

          {!showResults && (
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/profile')}>
              Improve my signal
            </KBtn>
          )}
        </div>

        {loadingInitial ? (
          <KCard style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--ink-muted)', margin: 0 }}>
              Loading...
            </p>
          </KCard>
        ) : !showResults ? (
          <KCard style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--ink)', margin: '0 0 8px' }}>
              Search for someone specific.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, maxWidth: 380, marginInline: 'auto', lineHeight: 1.5 }}>
              Type a name, company, or skill above to find people in the network.
            </p>
          </KCard>
        ) : visibleUsers.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
            {visibleUsers.map((user) => (
              <PersonCard key={user.id} user={user} />
            ))}
          </div>
        ) : (
          <KCard style={{ padding: 36, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 18, color: 'var(--ink)', margin: '0 0 8px' }}>
              {`No results for "${query.trim()}".`}
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, maxWidth: 400, marginInline: 'auto', lineHeight: 1.5 }}>
              Try a different name, company, or skill.
            </p>
          </KCard>
        )}
      </>
    )
  }

  const discoverRail = !managerOpen ? (
    <>
      <div>
        <DeskSectionLabel right={
          <button type="button" onClick={() => openManager('Incoming')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.signal, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>Manage</button>
        }>Connection requests</DeskSectionLabel>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['Incoming', incomingRequests.length, T.verd] as const, ['Sent', outgoingRequests.length, T.ochre] as const, ['In knot', acceptedConnections.length, T.ink] as const].map(([k, n, c]) => (
            <div key={k} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, textAlign: 'center' }}>
              <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, fontWeight: 500, color: c }}>{n}</div>
              <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
        {incomingRequests.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incomingRequests.slice(0, 4).map((c) => <IncomingActionRow key={c.id} connection={c} />)}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>No one is waiting on your decision.</div>
        )}
      </div>
    </>
  ) : undefined

  return (
    <div style={{ paddingBottom: 40 }}>
      <DeskHeader
        kicker="Discover · Munich"
        title={<span style={{ fontStyle: 'italic' }}>People worth knowing.</span>}
        right={<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><KPill color="verd">Based on {contextBits.length ? contextBits.join(' · ') : 'your profile'}</KPill></div>}
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {managerOpen ? (
        <div style={{ maxWidth: 1040, margin: '0 auto' }}><ConnectionManager /></div>
      ) : (
        <DeskPage rail={discoverRail}>{DiscoverContent()}</DeskPage>
      )}
    </div>
  )
}
