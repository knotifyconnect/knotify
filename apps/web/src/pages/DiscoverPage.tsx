import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '../lib/knotify'

type DiscoverUser = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  university: string | null
  current_company: string | null
  status: string
  bio?: string | null
}

type Suggestion = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  university: string | null
  mutual_connections_count: number
}

type Connection = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  user: { id: string } | null
}

type RelationState = 'none' | 'pending_outgoing' | 'pending_incoming' | 'connected'

function statusPill(status: string) {
  if (status === 'employed') return { label: 'Employed', color: 'verd' as const }
  if (status === 'open_to_work') return { label: 'Open to work', color: 'ochre' as const }
  return { label: 'Studying', color: 'default' as const }
}

const FILTERS = ['All', 'Open to work', 'Employed', 'Students']

export function DiscoverPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<DiscoverUser[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [relations, setRelations] = useState<Record<string, RelationState>>({})
  const [connectionIds, setConnectionIds] = useState<Record<string, string>>({}) // userId → connectionId
  const [activeFilter, setActiveFilter] = useState('All')
  const [meId, setMeId] = useState<string | null>(null)

  async function loadRelations() {
    try {
      const meResult = await apiGet<{ user: { id: string } }>('/api/users/me')
      const connectionsResult = await apiGet<{ connections: Connection[] }>('/api/connections')
      setMeId(meResult.user.id)
      const map: Record<string, RelationState> = {}
      const ids: Record<string, string> = {}
      for (const c of connectionsResult.connections) {
        const otherUserId = c.requester_id === meResult.user.id ? c.addressee_id : c.requester_id
        ids[otherUserId] = c.id
        if (c.status === 'accepted') map[otherUserId] = 'connected'
        if (c.status === 'pending' && c.requester_id === meResult.user.id) map[otherUserId] = 'pending_outgoing'
        if (c.status === 'pending' && c.addressee_id === meResult.user.id) map[otherUserId] = 'pending_incoming'
      }
      setRelations(map)
      setConnectionIds(ids)
    } catch {
      // keep usable
    }
  }

  async function loadSuggestions() {
    try {
      const data = await apiGet<{ suggestions: Suggestion[] }>('/api/users/suggestions')
      setSuggestions(data.suggestions ?? [])
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    void loadRelations()
    void loadSuggestions()
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setUsers([])
      return
    }
    const id = window.setTimeout(async () => {
      try {
        const data = await apiGet<{ users: DiscoverUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`)
        setUsers(data.users)
        setError(null)
      } catch (err) {
        setUsers([])
        setError(err instanceof Error ? err.message : 'Failed to load')
      }
    }, 300)
    return () => window.clearTimeout(id)
  }, [query])

  async function connect(addresseeId: string) {
    setPending((prev) => ({ ...prev, [addresseeId]: true }))
    try {
      await apiPost('/api/connections', { addresseeId })
      setRelations((prev) => ({ ...prev, [addresseeId]: 'pending_outgoing' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setPending((prev) => ({ ...prev, [addresseeId]: false }))
    }
  }

  async function disconnect(userId: string) {
    const connId = connectionIds[userId]
    if (!connId) return
    setPending((prev) => ({ ...prev, [userId]: true }))
    try {
      await apiPatch(`/api/connections/${connId}`, { status: 'declined' })
      setRelations((prev) => ({ ...prev, [userId]: 'none' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setPending((prev) => ({ ...prev, [userId]: false }))
    }
  }

  async function acceptIncoming(connectionUserId: string) {
    setPending((prev) => ({ ...prev, [connectionUserId]: true }))
    try {
      const [me, connections] = await Promise.all([
        apiGet<{ user: { id: string } }>('/api/users/me'),
        apiGet<{ connections: Connection[] }>('/api/connections'),
      ])
      const incoming = connections.connections.find(
        (c) => c.status === 'pending' && c.requester_id === connectionUserId && c.addressee_id === me.user.id
      )
      if (!incoming) throw new Error('Incoming request not found')
      await apiPatch(`/api/connections/${incoming.id}`, { status: 'accepted' })
      setRelations((prev) => ({ ...prev, [connectionUserId]: 'connected' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept')
    } finally {
      setPending((prev) => ({ ...prev, [connectionUserId]: false }))
    }
  }

  const filtered = users.filter((u) => {
    if (u.id === meId) return false
    if (activeFilter === 'Open to work') return u.status === 'open_to_work'
    if (activeFilter === 'Employed') return u.status === 'employed'
    if (activeFilter === 'Students') return u.status !== 'employed' && u.status !== 'open_to_work'
    return true
  })

  const showResults = query.length >= 2
  const showSuggestions = !showResults

  function ConnectButton({ userId }: { userId: string }) {
    const relation = relations[userId] ?? 'none'
    const [hovered, setHovered] = useState(false)

    if (relation === 'connected') {
      return (
        <KBtn
          variant={hovered ? 'signal' : 'ghost'}
          size="sm"
          disabled={pending[userId]}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); void disconnect(userId) }}
        >
          {hovered ? 'Disconnect' : '✓ Connected'}
        </KBtn>
      )
    }
    if (relation === 'pending_outgoing') {
      return <KBtn variant="ghost" size="sm" disabled>Pending</KBtn>
    }
    if (relation === 'pending_incoming') {
      return (
        <KBtn variant="verd" size="sm" disabled={pending[userId]} onClick={(e) => { e.stopPropagation(); void acceptIncoming(userId) }}>
          Accept
        </KBtn>
      )
    }
    return (
      <KBtn variant="signal" size="sm" disabled={pending[userId]} onClick={(e) => { e.stopPropagation(); void connect(userId) }}>
        {pending[userId] ? '…' : 'Connect'}
      </KBtn>
    )
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          knotify · discover
        </div>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 6px' }}>
          Find your next{' '}
          <span style={{ fontStyle: 'italic', color: 'var(--verd)' }}>meaningful</span> connection.
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
          Munich students, builders & professionals — filtered by warmth, not noise.
        </p>
      </div>

      {/* ─── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type at least 2 chars to search by name, username, university…"
          style={{
            width: '100%',
            padding: '11px 16px 11px 38px',
            borderRadius: 12,
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
        {showResults && filtered.length > 0 && (
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {filtered.length}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ─── "People you may know" (shown when no search) ───────────────── */}
      {showSuggestions && suggestions.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 12 }}>
            People you may know
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {suggestions.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/profile/${s.id}`)}
                style={{
                  flexShrink: 0,
                  width: 140,
                  background: 'var(--paper-soft)',
                  border: '0.5px solid var(--rule)',
                  borderRadius: 14,
                  padding: '16px 12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <KAvatar name={s.full_name} src={s.avatar_url} size={52} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{s.full_name}</div>
                {s.university && <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>{s.university}</div>}
                {s.mutual_connections_count > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>{s.mutual_connections_count} mutual</div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); void connect(s.id) }}
                  disabled={pending[s.id] || (relations[s.id] ?? 'none') !== 'none'}
                  style={{
                    width: '100%',
                    padding: '5px 0',
                    borderRadius: 8,
                    border: 'none',
                    background: (relations[s.id] ?? 'none') !== 'none' ? 'var(--paper)' : 'var(--ink)',
                    color: (relations[s.id] ?? 'none') !== 'none' ? 'var(--ink-faint)' : 'var(--paper)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {(relations[s.id] ?? 'none') === 'pending_outgoing' ? 'Pending' : (relations[s.id] ?? 'none') === 'connected' ? 'Connected' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filter strip (shown only when searching) ────────────────────── */}
      {showResults && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFilter(f)}
              style={{
                padding: '5px 13px',
                borderRadius: 999,
                border: activeFilter === f ? 'none' : '0.5px solid var(--rule)',
                background: activeFilter === f ? 'var(--ink)' : 'transparent',
                color: activeFilter === f ? 'var(--paper)' : 'var(--ink-muted)',
                fontSize: 12,
                fontFamily: "'IBM Plex Sans', sans-serif",
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* ─── Search results grid ─────────────────────────────────────────── */}
      {showResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map((user) => {
            const pill = statusPill(user.status)
            return (
              <KCard
                key={user.id}
                style={{ padding: '16px 18px', cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${user.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <KAvatar name={user.full_name} src={user.avatar_url} size={46} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.full_name}
                      </span>
                      <VerifiedBadge size={13} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>@{user.username}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.current_company ?? user.university ?? 'Munich'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <KPill color={pill.color}>{pill.label}</KPill>
                      <ConnectButton userId={user.id} />
                    </div>
                  </div>
                </div>
              </KCard>
            )
          })}
        </div>
      )}

      {showResults && filtered.length === 0 && !error && (
        <KCard style={{ padding: 32 }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--ink-muted)', margin: 0, textAlign: 'center' }}>
            No results for &ldquo;{query}&rdquo;.
          </p>
        </KCard>
      )}

      {showSuggestions && suggestions.length === 0 && (
        <KCard style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--ink-muted)', margin: 0 }}>
            Start typing to find people in Munich.
          </p>
        </KCard>
      )}
    </div>
  )
}
