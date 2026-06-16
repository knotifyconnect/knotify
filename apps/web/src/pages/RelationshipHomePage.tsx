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
        state === 'cold' ? `You haven't spoken with ${firstName} in ${daysSince} days — this connection is at risk.` :
        state === 'cooling' ? `${daysSince} days since last contact with ${firstName} — worth a message soon.` :
        `${firstName} is warm — last contact ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`
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
        // Engine returned empty (maybe 0 connections) — still set it
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

  const allWarm = ranked.length > 0 && coldCount === 0 && coolingCount === 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 60px' }}>
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 28, fontWeight: 400, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
          {greeting()}{firstName ? `, ${firstName}` : ''}.
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 9, flexWrap: 'wrap' }}>
          {allWarm ? (
            <span style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}>
              Your knot is warm. Nothing urgent today.
            </span>
          ) : ranked.length === 0 ? (
            <span style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}>
              Who needs attention today.
            </span>
          ) : (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {coldCount > 0 && (
                <span style={{ fontSize: 13, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 5, color: '#D84428', fontWeight: 500 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D84428', display: 'inline-block' }} />
                  {coldCount} going cold
                </span>
              )}
              {coolingCount > 0 && (
                <span style={{ fontSize: 13, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 5, color: '#c9922a' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9922a', display: 'inline-block' }} />
                  {coolingCount} cooling
                </span>
              )}
              {milestoneWeek > 0 && (
                <span style={{ fontSize: 13, fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-muted)' }}>
                  {milestoneWeek} milestone{milestoneWeek !== 1 ? 's' : ''} this week
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
                · {ranked.length} in your knot
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Pending banner ──────────────────────────────────────────────────── */}
      {pendingForMe.length > 0 && (
        <div style={{ marginBottom: 24, padding: '14px 18px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
              {pendingForMe.length === 1
                ? `${pendingForMe[0].peer.full_name} wants to connect with you`
                : `${pendingForMe.length} people want to connect with you`}
            </div>
          </div>
          <KBtn variant="signal" size="sm" onClick={() => navigate('/map')}>Review</KBtn>
        </div>
      )}

      {/* ── Empty (no connections) ──────────────────────────────────────────── */}
      {ranked.length === 0 ? (
        <KCard style={{ padding: '48px 32px', textAlign: 'center' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--ink)', margin: '0 0 10px' }}>
            Your knot is empty.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.5 }}>
            Connect with people and Knotify will tell you who to reach out to, when, and why — based on your actual relationship cadence.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/map')}>View your knot</KBtn>
          </div>
        </KCard>
      ) : (
        /* ── Two-column layout ──────────────────────────────────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', gap: 28, alignItems: 'start' }}>

          {/* LEFT — Today queue (60%) */}
          <div>
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              Today
            </div>

            {allWarm ? (
              <KCard style={{ padding: '20px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0, fontFamily: "'Fraunces', serif" }}>
                  Nothing overdue. Your relationships are warm.
                </p>
              </KCard>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ranked.map((entry) => {
                  const sc = STATE_COLOR[entry.state]
                  const isNew = entry.state === 'new'
                  const pillBg =
                    entry.state === 'cold'    ? 'rgba(216,68,40,0.07)'  :
                    entry.state === 'cooling' ? 'rgba(201,146,42,0.07)' :
                    'rgba(76,175,125,0.07)'
                  const accentBorder = sc

                  return (
                    <KCard key={entry.connectionId} style={{ padding: '16px 18px' }}>
                      {/* Peer row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/profile/${entry.peer.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                        >
                          <KAvatar name={entry.peer.full_name} src={entry.peer.avatar_url} size={40} />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.peer.full_name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.peer.headline ?? entry.peer.current_company ?? `@${entry.peer.username}`}
                          </div>
                        </div>
                        {/* State badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, display: 'inline-block' }} />
                          <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                            {STATE_LABEL[entry.state]}
                          </span>
                        </div>
                      </div>

                      {/* Reason pill */}
                      <div style={{
                        margin: '12px 0 12px',
                        padding: '8px 11px',
                        borderRadius: 8,
                        background: pillBg,
                        borderLeft: `2.5px solid ${accentBorder}`,
                        fontSize: 12.5,
                        color: 'var(--ink-muted)',
                        fontFamily: "'IBM Plex Sans'",
                        lineHeight: 1.5,
                      }}>
                        {entry.reason}
                      </div>

                      {/* CTAs */}
                      <div style={{ display: 'flex', gap: 7 }}>
                        {/* Primary CTA — Ink dark */}
                        <button
                          type="button"
                          onClick={() => {
                            logAndAct(entry, 'acted')
                            if (entry.suggestedAction === 'welcome' || entry.suggestedAction === 'reconnect' ||
                                entry.suggestedAction === 'message' || entry.suggestedAction === 'congratulate' ||
                                entry.suggestedAction === 'meet' || entry.suggestedAction === 'ask') {
                              openMessage(entry.peer.id, entry.draftOpener)
                            }
                          }}
                          disabled={messagingPeer === entry.peer.id}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: messagingPeer === entry.peer.id ? 'var(--ink-faint)' : 'var(--ink)',
                            color: '#fff',
                            fontSize: 12.5,
                            fontFamily: "'IBM Plex Sans'",
                            fontWeight: 500,
                            cursor: messagingPeer === entry.peer.id ? 'default' : 'pointer',
                          }}
                        >
                          {messagingPeer === entry.peer.id ? 'Opening…' : CTA_LABEL[entry.suggestedAction]}
                        </button>

                        {/* Secondary: Ask… — only for connections older than 7 days */}
                        {!isNew && (
                          <button
                            type="button"
                            onClick={() => setAskMenuPeer(entry.peer)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '0.5px solid var(--rule)',
                              background: 'none',
                              fontSize: 12.5,
                              color: 'var(--ink-muted)',
                              fontFamily: "'IBM Plex Sans'",
                              cursor: 'pointer',
                            }}
                          >
                            Ask…
                          </button>
                        )}
                      </div>
                    </KCard>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT — Network feed (40%) */}
          <div>
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
              From your network
            </div>

            {/* Milestones sub-section */}
            {milestones.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Milestones
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {milestones.slice(0, 5).map((m) => (
                    <KCard key={m.id} style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        {m.user && (
                          <button type="button" onClick={() => navigate(`/profile/${m.user!.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1 }}>
                            <KAvatar name={m.user.full_name} src={m.user.avatar_url} size={28} />
                          </button>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {m.user && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", marginBottom: 2 }}>{m.user.full_name}</div>}
                          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.45 }}>{m.content}</div>
                          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'", marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                        </div>
                      </div>
                      {m.user && (
                        <button type="button" onClick={() => openMessage(m.user!.id)}
                          style={{ marginTop: 8, width: '100%', padding: '6px', borderRadius: 7, border: '0.5px solid var(--rule)', background: 'none', fontSize: 12, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", cursor: 'pointer' }}>
                          Congratulate
                        </button>
                      )}
                    </KCard>
                  ))}
                </div>
              </div>
            )}

            {milestones.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontStyle: 'italic', marginBottom: 20 }}>
                No milestones from your network yet.
              </div>
            )}

            {/* Open asks sub-section */}
            {openAsks.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Open asks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {openAsks.slice(0, 5).map((a) => (
                    <KCard key={a.id} style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        {a.user && (
                          <button type="button" onClick={() => navigate(`/profile/${a.user!.id}`)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1 }}>
                            <KAvatar name={a.user.full_name} src={a.user.avatar_url} size={28} />
                          </button>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.user && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", marginBottom: 2 }}>{a.user.full_name}</div>}
                          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.45 }}>{a.content}</div>
                          <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'", marginTop: 4 }}>{timeAgo(a.created_at)}</div>
                        </div>
                      </div>
                      {a.user && (
                        <button type="button" onClick={() => openMessage(a.user!.id)}
                          style={{ marginTop: 8, width: '100%', padding: '6px', borderRadius: 7, border: '0.5px solid var(--rule)', background: 'none', fontSize: 12, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", cursor: 'pointer' }}>
                          Offer to help
                        </button>
                      )}
                    </KCard>
                  ))}
                </div>
              </div>
            )}

            {openAsks.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontStyle: 'italic', marginBottom: 20 }}>
                No open asks from your network right now.
              </div>
            )}

            {/* Recently added */}
            {ranked.filter((r) => r.state === 'new').length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Recently added
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ranked.filter((r) => r.state === 'new').slice(0, 4).map((r) => (
                    <div key={r.connectionId}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)', cursor: 'pointer' }}
                      onClick={() => navigate(`/profile/${r.peer.id}`)}>
                      <KAvatar name={r.peer.full_name} src={r.peer.avatar_url} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.peer.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>{r.peer.headline ?? r.peer.current_company ?? ''}</div>
                      </div>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4caf7d', display: 'inline-block', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ranked.filter((r) => r.state === 'new').length === 0 && networkFeed.length === 0 && milestones.length === 0 && openAsks.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'", fontStyle: 'italic' }}>
                Activity from your knot will appear here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
