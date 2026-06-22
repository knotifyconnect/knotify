/**
 * RelationshipHomePage
 *
 * Data source: /api/relationship-home (engine output)
 * Fallback:    /api/connections (if engine route unavailable)
 *
 * Design tokens: Fraunces headings · IBM Plex Sans body · Paper #F4EFE6
 * Signal Red (#D84428) used ONLY on: Review button, cold dot, cold pill accent, cold count.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { HomeHub } from '../components/HomeHub'
import { KAvatar, KBtn, KCard } from '../lib/knotify'
import { ReferralAskModal } from '../components/ReferralAskModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type Peer = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline: string | null
  current_company: string | null
}

type SuggestedAction = 'reconnect' | 'message' | 'congratulate' | 'welcome' | 'meet' | 'ask'
type RelState = 'warm' | 'cooling' | 'cold' | 'new'

type RankedEntry = {
  connectionId:    string
  peerId:          string
  peer:            Peer
  priorityScore:   number
  dominantFactor:  string
  state:           RelState
  reason:          string
  suggestedAction: SuggestedAction
  draftOpener?:    string
  signals:         { daysSince: number; expectedInterval: number }
}

type NetworkItem = {
  id:         string
  type:       'milestone' | 'ask'
  content:    string
  created_at: string
  user:       Peer | null
}

type PendingEntry = {
  id:         string
  peer:       Peer
  created_at: string
}

type HomeData = {
  ranked:      RankedEntry[]
  milestones:  NetworkItem[]
  openAsks:    NetworkItem[]
  pendingForMe: PendingEntry[]
}

// ── Fallback: build from /api/connections ────────────────────────────────────

type RawConn = {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  updated_at: string
  created_at: string
  user: Peer | null
}

function buildFallbackData(
  connections: RawConn[],
  userId: string
): HomeData {
  const now = Date.now()
  const accepted = connections.filter((c) => c.status === 'accepted')
  const pending = connections.filter((c) => c.status === 'pending')

  const ranked: RankedEntry[] = accepted
    .flatMap((c) => {
      const u = c.user
      if (!u) return []
      const peer: Peer = {
        id: u.id, full_name: u.full_name ?? 'Unknown',
        username: u.username ?? u.id, avatar_url: u.avatar_url ?? null,
        headline: u.headline ?? null, current_company: u.current_company ?? null,
      }
      const connectionAgeDays = Math.floor((now - new Date(c.created_at).getTime()) / 86400000)
      const daysSince = Math.floor((now - new Date(c.updated_at).getTime()) / 86400000)
      const expectedInterval = 45
      const overdueRatio = daysSince / expectedInterval
      const state: RelState =
        connectionAgeDays <= 7 ? 'new' :
        overdueRatio >= 1.5 ? 'cold' :
        overdueRatio >= 0.8 ? 'cooling' : 'warm'
      const priorityScore = Math.round(Math.min(overdueRatio * 50, 100))
      const firstName = peer.full_name.split(' ')[0]
      const reason =
        state === 'new' ? `You connected with ${firstName} recently. Send a note while it's fresh.` :
        state === 'cold' ? `You haven't spoken with ${firstName} in ${daysSince} days, this connection is at risk.` :
        state === 'cooling' ? `${daysSince} days since last contact with ${firstName}, worth a message soon.` :
        `${firstName} is warm, last contact ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`
      const suggestedAction: SuggestedAction =
        state === 'new' ? 'welcome' :
        state === 'cold' ? 'reconnect' : 'message'
      const entry: RankedEntry = {
        connectionId: c.id, peerId: peer.id, peer, priorityScore,
        dominantFactor: state === 'new' ? 'new' : 'maintenance',
        state, reason, suggestedAction,
        signals: { daysSince, expectedInterval },
      }
      return [entry]
    })
    .sort((a, b) => {
      const sr: Record<RelState, number> = { cold: 0, cooling: 1, new: 2, warm: 3 }
      return sr[a.state] !== sr[b.state] ? sr[a.state] - sr[b.state] : b.signals.daysSince - a.signals.daysSince
    })

  const pendingForMe: PendingEntry[] = pending
    .filter((c) => c.addressee_id === userId && c.user)
    .map((c) => ({ id: c.id, peer: c.user!, created_at: c.created_at }))

  return { ranked, milestones: [], openAsks: [], pendingForMe }
}

// ── Design constants ──────────────────────────────────────────────────────────

const STATE_COLOR: Record<RelState, string> = {
  warm:    '#4caf7d',
  cooling: '#c9922a',
  cold:    '#D84428',
  new:     '#4caf7d',
}
const STATE_LABEL: Record<RelState, string> = {
  warm: 'Warm', cooling: 'Cooling', cold: 'Cold', new: 'New'
}

const CTA_LABEL: Record<SuggestedAction, string> = {
  reconnect:    'Reconnect',
  message:      'Message',
  congratulate: 'Congratulate',
  welcome:      'Say hi',
  meet:         'Suggest a meet',
  ask:          'Message',
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7)  return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Ask menu ─────────────────────────────────────────────────────────────────

function AskMenu({ peer, onReferral, onClose }: { peer: Peer; onReferral: () => void; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--paper)', borderRadius: 16, padding: '20px 20px 16px',
        maxWidth: 320, width: '100%', boxShadow: '0 16px 48px rgba(26,24,21,0.16)',
        border: '0.5px solid var(--rule)',
      }}>
        <div style={{ fontFamily: "'IBM Plex Sans'", fontSize: 12, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          Ask {peer.full_name.split(' ')[0]}…
        </div>
        {[
          { label: 'Ask for a referral', action: onReferral },
          { label: 'Request an intro', action: onClose },
          { label: 'Ask for advice', action: onClose },
        ].map(({ label, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px', borderRadius: 8, border: 'none',
              background: 'none', fontSize: 13.5, color: 'var(--ink)',
              fontFamily: "'IBM Plex Sans'", cursor: 'pointer',
              marginBottom: 4,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--paper-soft)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            {label}
          </button>
        ))}
        <div style={{ borderTop: '0.5px solid var(--rule-soft)', marginTop: 8, paddingTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 12, color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RelationshipHomePage() {
  const navigate = useNavigate()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [userId, setUserId] = useState('')
  const [messagingPeer, setMessagingPeer] = useState<string | null>(null)
  const [referralPeer, setReferralPeer] = useState<Peer | null>(null)
  const [askMenuPeer, setAskMenuPeer] = useState<Peer | null>(null)

  useEffect(() => {
    apiGet<{ user: { full_name: string; id: string } }>('/api/users/me')
      .then((r) => { setFirstName(r.user?.full_name?.split(' ')[0] ?? ''); setUserId(r.user?.id ?? '') })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let mounted = true

    // Primary: engine route
    apiGet<HomeData>('/api/relationship-home')
      .then((d) => {
        if (!mounted) return
        // If engine returned ranked data, use it; otherwise fall through
        if (d.ranked && d.ranked.length > 0) {
          setData(d)
          setLoading(false)
          return
        }
        // Engine returned empty (maybe 0 connections), still set it
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        // Fallback: /api/connections (always works)
        apiGet<{ connections: RawConn[] }>('/api/connections')
          .then(({ connections }) => {
            if (!mounted) return
            setData(buildFallbackData(connections, userId))
          })
          .catch(() => { if (mounted) setData({ ranked: [], milestones: [], openAsks: [], pendingForMe: [] }) })
          .finally(() => { if (mounted) setLoading(false) })
      })

    return () => { mounted = false }
  }, [userId])

  async function openMessage(peerId: string, draftOpener?: string) {
    setMessagingPeer(peerId)
    try {
      const result = await apiPost<{ conversation: { id: string } }>('/api/conversations', { peerId })
      const url = `/messages?conversation=${result.conversation.id}` + (draftOpener ? `&draft=${encodeURIComponent(draftOpener)}` : '')
      navigate(url)
    } catch {
      navigate('/messages')
    } finally {
      setMessagingPeer(null)
    }
  }

  function logAndAct(entry: RankedEntry, outcome: 'acted' | 'dismissed') {
    apiPost('/api/relationship-home/feedback', {
      connectionId:    entry.connectionId,
      priorityScore:   entry.priorityScore,
      dominantFactor:  entry.dominantFactor,
      suggestedAction: entry.suggestedAction,
      signals:         entry.signals,
      outcome,
    }).catch(() => {})
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

  const ranked      = data?.ranked ?? []
  const milestones  = data?.milestones ?? []
  const openAsks    = data?.openAsks ?? []
  const pendingForMe = data?.pendingForMe ?? []

  const coldCount     = ranked.filter((r) => r.state === 'cold').length
  const coolingCount  = ranked.filter((r) => r.state === 'cooling').length
  const milestoneWeek = milestones.filter((m) => {
    return (Date.now() - new Date(m.created_at).getTime()) / 86400000 <= 7
  }).length

  const networkFeed: NetworkItem[] = [
    ...milestones.map((m) => ({ ...m, type: 'milestone' as const })),
    ...openAsks.map((a) => ({ ...a, type: 'ask' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)

  const newCount = ranked.filter((r) => r.state === 'new').length
  const allWarm = ranked.length > 0 && coldCount === 0 && coolingCount === 0 && newCount === 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 80px' }}>
      {referralPeer && (
        <ReferralAskModal peer={referralPeer} onClose={() => setReferralPeer(null)} />
      )}
      {askMenuPeer && (
        <AskMenu
          peer={askMenuPeer}
          onReferral={() => { setReferralPeer(askMenuPeer); setAskMenuPeer(null) }}
          onClose={() => setAskMenuPeer(null)}
        />
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 4 }}>
          Home · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          <span style={{ fontStyle: 'italic' }}>Welcome back{firstName ? `, ${firstName}` : ''}.</span>
        </h1>
      </div>

      {/* ── Pending connection requests banner ──────────────────────────────── */}
      {pendingForMe.length > 0 && (
        <div style={{ marginBottom: 20, padding: '13px 18px', borderRadius: 12, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--signal-deep)', fontFamily: "'IBM Plex Sans'" }}>
              {pendingForMe.length === 1
                ? `${pendingForMe[0].peer.full_name} wants to connect`
                : `${pendingForMe.length} people want to connect with you`}
            </div>
          </div>
          <KBtn variant="signal" size="sm" onClick={() => navigate('/map')}>Review</KBtn>
        </div>
      )}

      {/* ── Network maintenance — Keep your knot warm ───────────────────────── */}
      {ranked.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600, fontFamily: "'IBM Plex Sans'", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Keep your knot warm</span>
            <span style={{ fontSize: 11, color: coldCount > 0 ? 'var(--signal)' : coolingCount > 0 ? 'var(--ochre)' : 'var(--verd)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>
              {allWarm ? 'All warm' : coldCount > 0 ? `${coldCount} going cold` : coolingCount > 0 ? `${coolingCount} cooling` : ''}
            </span>
          </div>

          {allWarm ? (
            <div style={{ padding: '18px 20px', borderRadius: 14, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', fontSize: 13.5, color: 'var(--ink-muted)', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>
              Nothing overdue. Your relationships are warm.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ranked.slice(0, 5).map((entry) => {
                const sc = STATE_COLOR[entry.state]
                const isNew = entry.state === 'new'
                return (
                  <div key={entry.connectionId} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderRadius: 14, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)', borderLeft: `3px solid ${sc}` }}>
                    <button type="button" onClick={() => navigate(`/profile/${entry.peer.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                      <KAvatar name={entry.peer.full_name} src={entry.peer.avatar_url} size={40} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>{entry.peer.full_name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: sc }}>{STATE_LABEL[entry.state]}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {entry.reason}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => { logAndAct(entry, 'acted'); openMessage(entry.peer.id, entry.draftOpener) }}
                        disabled={messagingPeer === entry.peer.id}
                        style={{ padding: '8px 15px', borderRadius: 999, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontFamily: "'IBM Plex Sans'", fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'opacity 0.15s' }}
                      >
                        {messagingPeer === entry.peer.id ? 'Opening...' : CTA_LABEL[entry.suggestedAction]}
                      </button>
                      {!isNew && (
                        <button
                          type="button"
                          onClick={() => setAskMenuPeer(entry.peer)}
                          style={{ padding: '8px 12px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'none', fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", cursor: 'pointer' }}
                        >
                          Ask
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Milestones + new connections compact feed */}
          {(milestones.length > 0 || ranked.filter(r => r.state === 'new').length > 0) && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 8 }}>
              {ranked.filter(r => r.state === 'new').slice(0, 3).map(r => (
                <div key={r.connectionId} onClick={() => navigate(`/profile/${r.peer.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)', cursor: 'pointer' }}>
                  <KAvatar name={r.peer.full_name} src={r.peer.avatar_url} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.peer.full_name}</div>
                    <div style={{ fontSize: 11, color: '#4caf7d', fontFamily: "'IBM Plex Sans'", fontWeight: 600 }}>New connection</div>
                  </div>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf7d', flexShrink: 0 }} />
                </div>
              ))}
              {milestones.slice(0, 2).map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                  {m.user && <button type="button" onClick={() => navigate(`/profile/${m.user!.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}><KAvatar name={m.user.full_name} src={m.user.avatar_url} size={30} /></button>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.user && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>{m.user.full_name}</div>}
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.content}</div>
                  </div>
                  {m.user && <button type="button" onClick={() => openMessage(m.user!.id)} style={{ padding: '6px 10px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'none', fontSize: 11, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", cursor: 'pointer', flexShrink: 0 }}>Say congrats</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {ranked.length === 0 && (
        <div style={{ padding: '40px 32px', textAlign: 'center', borderRadius: 18, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', marginBottom: 24 }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 22, color: 'var(--ink)', margin: '0 0 10px' }}>
            Your knot is empty.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.55, fontFamily: "'IBM Plex Sans'" }}>
            Connect with people and knotify will tell you who to reach out to, when, and why.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/map')}>View your knot</KBtn>
          </div>
        </div>
      )}

      {/* ── Hub: quests · events · gigs ─────────────────────────────────────── */}
      <HomeHub />
    </div>
  )
}
