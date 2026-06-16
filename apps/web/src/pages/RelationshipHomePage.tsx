import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { ReferralAskModal } from '../components/ReferralAskModal'

type ConnectionUser = {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  headline?: string | null
  current_company?: string | null
}

type RawConnection = {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  updated_at: string
  created_at: string
  user: ConnectionUser | null
}

type Peer = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline: string | null
  current_company: string | null
}

type HealthEntry = {
  peer: Peer
  connectionId: string
  lastContact: string
  daysSince: number
  health: 'warm' | 'cooling' | 'cold'
}

type NetworkItem = {
  id: string
  type: 'milestone' | 'ask'
  content: string
  created_at: string
  user: Peer | null
}

function computeHealth(updatedAt: string): { daysSince: number; health: 'warm' | 'cooling' | 'cold' } {
  const daysSince = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)
  const health = daysSince >= 60 ? 'cold' : daysSince >= 30 ? 'cooling' : 'warm'
  return { daysSince, health }
}

const HEALTH_COLOR = { warm: '#4caf7d', cooling: '#d4a017', cold: '#e05c3a' }
const HEALTH_LABEL = { warm: 'Warm', cooling: 'Cooling', cold: 'Cold' }

function reachOutReason(entry: HealthEntry): string {
  const name = entry.peer.full_name.split(' ')[0]
  const d = entry.daysSince
  if (d === 0) return `You connected with ${name} today`
  if (d < 7) return `Last contact ${d}d ago — still fresh`
  if (d < 14) return `${d} days since last contact — a quick check-in keeps things warm`
  if (d < 30) return `${d} days of no contact — worth reaching out soon`
  if (d < 60) return `${d} days of silence — this relationship is cooling down`
  return `${d} days with no contact — this connection is going cold`
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function RelationshipHomePage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<HealthEntry[] | null>(null)
  const [pending, setPending] = useState<RawConnection[]>([])
  const [networkFeed, setNetworkFeed] = useState<NetworkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [messagingPeer, setMessagingPeer] = useState<string | null>(null)
  const [referralPeer, setReferralPeer] = useState<Peer | null>(null)
  const [firstName, setFirstName] = useState('')

  useEffect(() => {
    apiGet<{ user: { full_name: string } }>('/api/users/me')
      .then((r) => setFirstName(r.user?.full_name?.split(' ')[0] ?? ''))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let mounted = true

    apiGet<{ connections: RawConnection[] }>('/api/connections')
      .then(({ connections }) => {
        if (!mounted) return

        const accepted = connections.filter((c) => c.status === 'accepted')
        const pendingForMe = connections.filter((c) => c.status === 'pending' && c.user !== null)

        const built: HealthEntry[] = accepted
          .map((c) => {
            const u = c.user
            if (!u) return null
            const peer: Peer = {
              id: u.id,
              full_name: u.full_name ?? 'Unknown',
              username: u.username ?? u.id,
              avatar_url: u.avatar_url ?? null,
              headline: u.headline ?? null,
              current_company: u.current_company ?? null,
            }
            const { daysSince, health } = computeHealth(c.updated_at)
            return { peer, connectionId: c.id, lastContact: c.updated_at, daysSince, health }
          })
          .filter((x): x is HealthEntry => x !== null)
          .sort((a, b) => {
            const rank = { cold: 0, cooling: 1, warm: 2 }
            if (rank[a.health] !== rank[b.health]) return rank[a.health] - rank[b.health]
            return b.daysSince - a.daysSince
          })

        setEntries(built)
        setPending(pendingForMe)

        // Load secondary network feed (non-blocking, won't affect main list)
        const peerIds = built.map((e) => e.peer.id)
        if (peerIds.length) {
          type FeedUser = { id: string; full_name: string; username: string; avatar_url: string | null; headline: string | null; current_company: string | null }
          type FeedItem = { id: string; content: string; created_at: string; user: FeedUser | null }
          apiGet<{ milestones?: FeedItem[]; openAsks?: FeedItem[] }>('/api/relationship-home')
            .then((d) => {
              if (!mounted) return
              const items: NetworkItem[] = [
                ...((d.milestones ?? []).map((m) => ({ ...m, type: 'milestone' as const }))),
                ...((d.openAsks ?? []).map((a) => ({ ...a, type: 'ask' as const }))),
              ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)
              setNetworkFeed(items)
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        if (mounted) setEntries([])
      })
      .finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [])

  async function openMessage(peerId: string) {
    setMessagingPeer(peerId)
    try {
      const result = await apiPost<{ conversation: { id: string } }>('/api/conversations', { peerId })
      navigate(`/messages?conversation=${result.conversation.id}`)
    } catch {
      navigate('/messages')
    } finally {
      setMessagingPeer(null)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 16, color: 'var(--ink-muted)' }}>
          Loading your relationships…
        </p>
      </div>
    )
  }

  const totalConnections = entries?.length ?? 0
  const warmCount = entries?.filter((e) => e.health === 'warm').length ?? 0
  const coolingCount = entries?.filter((e) => e.health === 'cooling').length ?? 0
  const coldCount = entries?.filter((e) => e.health === 'cold').length ?? 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 60px' }}>
      {referralPeer && (
        <ReferralAskModal peer={referralPeer} onClose={() => setReferralPeer(null)} />
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
          {greeting()}{firstName ? `, ${firstName}` : ''}.
        </h1>
        {totalConnections > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}>
              {totalConnections} connection{totalConnections !== 1 ? 's' : ''} in your knot
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {warmCount > 0 && (
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-faint)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: HEALTH_COLOR.warm, display: 'inline-block' }} />
                  {warmCount} warm
                </span>
              )}
              {coolingCount > 0 && (
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-faint)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: HEALTH_COLOR.cooling, display: 'inline-block' }} />
                  {coolingCount} cooling
                </span>
              )}
              {coldCount > 0 && (
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 4, color: HEALTH_COLOR.cold }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: HEALTH_COLOR.cold, display: 'inline-block' }} />
                  {coldCount} cold
                </span>
              )}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '6px 0 0', fontFamily: "'IBM Plex Sans'" }}>
            Who needs attention today.
          </p>
        )}
      </div>

      {/* Pending decisions banner */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
              {pending.length === 1
                ? `${pending[0].user?.full_name} wants to connect`
                : `${pending.length} people want to connect with you`}
            </div>
          </div>
          <KBtn variant="signal" size="sm" onClick={() => navigate('/map')}>Review</KBtn>
        </div>
      )}

      {totalConnections === 0 ? (
        <KCard style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--ink)', margin: '0 0 10px' }}>
            Your knot is empty.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.5 }}>
            Connect with people and Knotify will tell you who to reach out to, when, and why.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/map')}>View your knot</KBtn>
          </div>
        </KCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 28, alignItems: 'start' }}>

          {/* Reach out column */}
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Reach out today
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3, fontFamily: "'IBM Plex Sans'" }}>
                {coldCount + coolingCount > 0
                  ? `${coldCount + coolingCount} relationship${coldCount + coolingCount !== 1 ? 's' : ''} need${coldCount + coolingCount === 1 ? 's' : ''} attention`
                  : 'All relationships are warm'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(entries ?? []).map((entry) => {
                const hc = HEALTH_COLOR[entry.health]
                return (
                  <KCard key={entry.connectionId} style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/profile/${entry.peer.id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                      >
                        <KAvatar name={entry.peer.full_name} src={entry.peer.avatar_url} size={38} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.peer.full_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.peer.headline ?? entry.peer.current_company ?? `@${entry.peer.username}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: hc, display: 'inline-block' }} />
                          {HEALTH_LABEL[entry.health]}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {entry.daysSince === 0 ? 'today' : `${entry.daysSince}d`}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      margin: '10px 0',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: entry.health === 'cold' ? 'rgba(224,92,58,0.06)' : entry.health === 'cooling' ? 'rgba(212,160,23,0.06)' : 'rgba(76,175,125,0.06)',
                      fontSize: 12,
                      color: 'var(--ink-muted)',
                      fontFamily: "'IBM Plex Sans'",
                      lineHeight: 1.5,
                      borderLeft: `2.5px solid ${hc}`,
                    }}>
                      {reachOutReason(entry)}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <KBtn
                        variant="ghost"
                        size="sm"
                        onClick={() => openMessage(entry.peer.id)}
                        disabled={messagingPeer === entry.peer.id}
                        style={{ flex: 1 }}
                      >
                        {messagingPeer === entry.peer.id ? 'Opening…' : 'Message'}
                      </KBtn>
                      <KBtn
                        variant="signal"
                        size="sm"
                        onClick={() => setReferralPeer(entry.peer)}
                        style={{ flex: 1 }}
                      >
                        Ask for referral
                      </KBtn>
                    </div>
                  </KCard>
                )
              })}
            </div>
          </div>

          {/* Network feed column */}
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                From your network
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3, fontFamily: "'IBM Plex Sans'" }}>
                Milestones and open asks
              </div>
            </div>
            {networkFeed.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {networkFeed.map((item) => (
                  <KCard key={`${item.type}-${item.id}`} style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {item.user && (
                        <button
                          type="button"
                          onClick={() => navigate(`/profile/${item.user!.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                        >
                          <KAvatar name={item.user.full_name} src={item.user.avatar_url} size={32} />
                        </button>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          {item.user && (
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
                              {item.user.full_name}
                            </span>
                          )}
                          <span style={{
                            fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                            padding: '2px 6px', borderRadius: 4,
                            background: item.type === 'milestone' ? 'rgba(76,175,125,0.1)' : 'rgba(99,102,241,0.1)',
                            color: item.type === 'milestone' ? '#4caf7d' : '#6366f1',
                          }}>
                            {item.type === 'milestone' ? 'milestone' : 'open ask'}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.45 }}>
                          {item.content}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 6 }}>
                          {timeAgo(item.created_at)}
                        </div>
                      </div>
                    </div>
                    {item.user && (
                      <div style={{ marginTop: 10 }}>
                        <KBtn variant="ghost" size="sm" onClick={() => openMessage(item.user!.id)} style={{ width: '100%' }}>
                          {item.type === 'milestone' ? 'Congratulate' : 'Offer to help'}
                        </KBtn>
                      </div>
                    )}
                  </KCard>
                ))}
              </div>
            ) : (
              <KCard style={{ padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0, fontFamily: "'Fraunces', serif" }}>
                  As people in your knot share updates and asks, they'll appear here.
                </p>
              </KCard>
            )}

            {totalConnections < 5 && (
              <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                <div style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.5, marginBottom: 10 }}>
                  Add more people to see relationship health patterns across your knot.
                </div>
                <KBtn variant="ghost" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
