import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { ReferralAskModal } from '../components/ReferralAskModal'

type Peer = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline: string | null
  current_company: string | null
}

type ColdEntry = {
  peer: Peer
  lastContact: string
  daysSince: number
}

type MilestoneEntry = {
  id: string
  content: string
  created_at: string
  user: Peer | null
}

type AskEntry = {
  id: string
  content: string
  created_at: string
  user: Peer | null
}

type HomeData = {
  goingCold: ColdEntry[]
  milestones: MilestoneEntry[]
  openAsks: AskEntry[]
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

function Column({ title, subtitle, children, empty }: { title: string; subtitle: string; children: React.ReactNode; empty: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--ink)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2, fontFamily: "'IBM Plex Sans'" }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children ?? (
          <KCard style={{ padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0, fontFamily: "'Fraunces', serif" }}>
              {empty}
            </p>
          </KCard>
        )}
      </div>
    </div>
  )
}

export function RelationshipHomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagingPeer, setMessagingPeer] = useState<string | null>(null)
  const [referralPeer, setReferralPeer] = useState<Peer | null>(null)

  useEffect(() => {
    let mounted = true
    const timeout = window.setTimeout(() => {
      if (mounted) { setError('Took too long to load. Try refreshing.'); setLoading(false) }
    }, 10000)
    apiGet<HomeData>('/api/relationship-home')
      .then((d) => { if (mounted) setData(d) })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (mounted) { setLoading(false); clearTimeout(timeout) } })
    return () => { mounted = false; clearTimeout(timeout) }
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
          Loading your relationships...
        </p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>{error ?? 'Something went wrong.'}</p>
      </div>
    )
  }

  const hasAnything = data.goingCold.length > 0 || data.milestones.length > 0 || data.openAsks.length > 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      {referralPeer && (
        <ReferralAskModal peer={referralPeer} onClose={() => setReferralPeer(null)} />
      )}
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
          Relationships
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '6px 0 0', fontFamily: "'IBM Plex Sans'" }}>
          Who needs attention today.
        </p>
      </div>

      {!hasAnything ? (
        <KCard style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--ink)', margin: '0 0 10px' }}>
            Your knot is quiet.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.5 }}>
            Connect with more people and start conversations — your relationship dashboard fills in as your knot grows.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/map')}>View your knot</KBtn>
          </div>
        </KCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
          {/* Going Cold */}
          <Column
            title="Going cold"
            subtitle="Haven't connected recently"
            empty="All your connections are warm."
          >
            {data.goingCold.length > 0 ? data.goingCold.map((entry) => (
              <KCard key={entry.peer.id} style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${entry.peer.id}`)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                  >
                    <KAvatar name={entry.peer.full_name} src={entry.peer.avatar_url} size={36} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.peer.full_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginTop: 1 }}>
                      {entry.peer.headline ?? entry.peer.current_company ?? `@${entry.peer.username}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
                    {entry.daysSince}d
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <KBtn
                    variant="ghost"
                    size="sm"
                    onClick={() => openMessage(entry.peer.id)}
                    disabled={messagingPeer === entry.peer.id}
                    style={{ flex: 1 }}
                  >
                    {messagingPeer === entry.peer.id ? 'Opening...' : 'Message'}
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
            )) : null}
          </Column>

          {/* Milestones */}
          <Column
            title="Milestones"
            subtitle="Recent updates from your knot"
            empty="No recent updates from your network."
          >
            {data.milestones.length > 0 ? data.milestones.map((m) => (
              <KCard key={m.id} style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {m.user && (
                    <button
                      type="button"
                      onClick={() => navigate(`/profile/${m.user!.id}`)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                    >
                      <KAvatar name={m.user.full_name} src={m.user.avatar_url} size={30} />
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.user && (
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", marginBottom: 3 }}>
                        {m.user.full_name}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.45 }}>
                      {m.content}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 6 }}>
                      {timeAgo(m.created_at)}
                    </div>
                  </div>
                </div>
                {m.user && (
                  <div style={{ marginTop: 10 }}>
                    <KBtn variant="ghost" size="sm" onClick={() => openMessage(m.user!.id)} style={{ width: '100%' }}>
                      Congratulate
                    </KBtn>
                  </div>
                )}
              </KCard>
            )) : null}
          </Column>

          {/* Open Asks */}
          <Column
            title="Open asks"
            subtitle="Things your connections need help with"
            empty="No open asks from your network right now."
          >
            {data.openAsks.length > 0 ? data.openAsks.map((a) => (
              <KCard key={a.id} style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {a.user && (
                    <button
                      type="button"
                      onClick={() => navigate(`/profile/${a.user!.id}`)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                    >
                      <KAvatar name={a.user.full_name} src={a.user.avatar_url} size={30} />
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {a.user && (
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", marginBottom: 3 }}>
                        {a.user.full_name}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.45 }}>
                      {a.content}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 6 }}>
                      {timeAgo(a.created_at)}
                    </div>
                  </div>
                </div>
                {a.user && (
                  <div style={{ marginTop: 10 }}>
                    <KBtn variant="ghost" size="sm" onClick={() => openMessage(a.user!.id)} style={{ width: '100%' }}>
                      Offer to help
                    </KBtn>
                  </div>
                )}
              </KCard>
            )) : null}
          </Column>
        </div>
      )}
    </div>
  )
}
