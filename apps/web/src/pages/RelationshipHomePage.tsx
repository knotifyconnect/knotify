/**
 * RelationshipHomePage — the Relationship OS.
 *
 * Data source: /api/relationship-home (engine output, ranked connections + occasions)
 * Fallback:    /api/connections (if engine route unavailable)
 *
 * The hero is the Companion chat (CompanionHero) — it talks through what the
 * engine surfaces (occasions, cadence, milestones) instead of a static card
 * queue. Ranked-connection data is still fetched here to resolve suggestion
 * pills (peer lookups) and to log feedback via `logAndAct`; the deep-link
 * actions (message w/ draft, coffee planner, snooze feedback) are unchanged.
 *
 * Design tokens: Fraunces headings · IBM Plex Sans body · Paper #F4EFE6
 * Signal Red (#D84428) used ONLY on: Review button, cold dot, cold accents.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api'
import { HomeHub } from '../components/HomeHub'
import { CompanionHero, type Suggestion, type PeerLite } from '../components/CompanionHero'
import { KAvatar, KBtn } from '../lib/knotify'
import { ReferralAskModal } from '../components/ReferralAskModal'
import { CreateAskModal } from '../components/asks/CreateAskModal'
import { AskDrawer, type Ask } from '../components/asks/AskDrawer'
import { T, DeskPage, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'

// ── Types ─────────────────────────────────────────────────────────────────────

type Peer = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline: string | null
  current_company: string | null
}

type SuggestedAction = 'reconnect' | 'message' | 'congratulate' | 'welcome' | 'meet' | 'ask' | 'follow_up'
type RelState = 'warm' | 'cooling' | 'cold' | 'new'

type Occasion = {
  type: 'shared_event' | 'milestone' | 'open_ask' | 'follow_up' | 'upcoming_meeting' | 'new_connection' | 'overdue'
  label: string
  eventId?: string
  title?: string
  starts_at?: string
  location?: string | null
  meetingId?: string
  scheduled_at?: string
  met_at?: string
}

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
  occasions?:      Occasion[]
  signals:         { daysSince: number; expectedInterval: number; hasUpcomingMeeting?: boolean; needsFollowUp?: boolean }
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

type SharedEvent = {
  eventId:   string
  title:     string
  starts_at: string
  location:  string | null
  peerId:    string
  peer:      Peer | null
}

type HomeStats = {
  total: number; warm: number; cooling: number; cold: number; fresh: number
  needsFollowUp: number; upcomingMeetings: number; handled: number
}

type UpcomingMeeting = {
  id: string; scheduled_at: string; status: string; location_text: string | null
  peerId: string; peer: Peer | null; am_initiator: boolean
}

type HomeData = {
  ranked:            RankedEntry[]
  stats?:            HomeStats
  upcomingMeetings?: UpcomingMeeting[]
  milestones:        NetworkItem[]
  openAsks:          NetworkItem[]
  pendingForMe:      PendingEntry[]
  sharedEvents:      SharedEvent[]
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
      const occasions: Occasion[] =
        state === 'new' ? [{ type: 'new_connection', label: 'New connection' }] :
        (state === 'cold' || state === 'cooling') ? [{ type: 'overdue', label: `${daysSince}d since contact` }] : []
      const entry: RankedEntry = {
        connectionId: c.id, peerId: peer.id, peer, priorityScore,
        dominantFactor: state === 'new' ? 'new' : 'maintenance',
        state, reason, suggestedAction, occasions,
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

  return { ranked, milestones: [], openAsks: [], pendingForMe, sharedEvents: [] }
}

// ── Design constants ──────────────────────────────────────────────────────────

const STATE_COLOR: Record<RelState, string> = {
  warm:    '#4caf7d',
  cooling: '#c9922a',
  cold:    '#D84428',
  new:     '#4caf7d',
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

function shortWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Network health strip ──────────────────────────────────────────────────────

function HealthStrip({ stats, onOpenMap }: { stats: HomeStats; onOpenMap: () => void }) {
  if (stats.total === 0) return null
  const segments = [
    { key: 'warm',    label: 'Warm',    count: stats.warm,    color: STATE_COLOR.warm },
    { key: 'fresh',   label: 'New',     count: stats.fresh,   color: T.verd },
    { key: 'cooling', label: 'Cooling', count: stats.cooling, color: STATE_COLOR.cooling },
    { key: 'cold',    label: 'Cold',    count: stats.cold,    color: STATE_COLOR.cold },
  ].filter((s) => s.count > 0)

  return (
    <button
      type="button"
      onClick={onOpenMap}
      title="Open your knot"
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginBottom: 16, fontFamily: T.text }}
    >
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2, background: T.paperDeep }}>
        {segments.map((s) => (
          <div key={s.key} style={{ flex: s.count, background: s.color, minWidth: 6 }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {segments.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.inkMuted }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: s.color, display: 'inline-block' }} />
            {s.count} {s.label.toLowerCase()}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.inkMuted, fontWeight: 600 }}>
          {stats.total} relationship{stats.total === 1 ? '' : 's'} · view your knot →
        </span>
      </div>
    </button>
  )
}

// ── Ask menu ─────────────────────────────────────────────────────────────────

function AskMenu({ peer, onReferral, onMessage, onClose }: {
  peer: Peer
  onReferral: () => void
  onMessage: (draft: string) => void
  onClose: () => void
}) {
  const first = peer.full_name.split(' ')[0]
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
          Ask {first}…
        </div>
        {[
          { label: 'Ask for a referral', action: onReferral },
          { label: 'Request an intro', action: () => onMessage(`Hi ${first}, quick ask: is there someone in your network you think I should meet? Happy to share more context.`) },
          { label: 'Ask for advice', action: () => onMessage(`Hi ${first}, could I pick your brain on something? Would love your advice.`) },
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
  const [actedIds, setActedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('knotify:acted') ?? '[]')) } catch { return new Set() }
  })
  const [referralPeer, setReferralPeer] = useState<Peer | null>(null)
  const [askMenuPeer, setAskMenuPeer] = useState<Peer | null>(null)
  const [railEvents, setRailEvents] = useState<Array<{ id: string; title: string; starts_at: string; location: string | null; rsvp_count: number }>>([])
  const [credMini, setCredMini] = useState<{ score: number; tier: string } | null>(null)
  const [sideQuests, setSideQuests] = useState<Array<{ key: string; title: string; points: number; description?: string }>>([])
  const [myAsks, setMyAsks] = useState<Ask[]>([])
  const [feedAsks, setFeedAsks] = useState<Ask[]>([])
  const [askOpen, setAskOpen] = useState(false)
  const [askDetail, setAskDetail] = useState<Ask | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteDismissed, setInviteDismissed] = useState(() => {
    try { return localStorage.getItem('knotify:inviteDismissed') === '1' } catch { return false }
  })

  useEffect(() => {
    apiGet<{ events: Array<{ id: string; title: string; starts_at: string; location: string | null; rsvp_count: number }> }>('/api/events?limit=3')
      .then((r) => setRailEvents(r.events ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    apiGet<{ credibility_score: number; tier: string; quests: Array<{ key: string; title: string; points: number; status: string; description?: string }> }>('/api/quests')
      .then((r) => {
        setCredMini({ score: r.credibility_score, tier: r.tier })
        setSideQuests((r.quests ?? []).filter((q) => q.status === 'claimable').map((q) => ({ key: q.key, title: q.title, points: q.points, description: q.description })).slice(0, 3))
      }).catch(() => {})
  }, [])

  const loadMyAsks = useCallback((uid: string) => {
    if (!uid) return
    apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${uid}`)
      .then((r) => setMyAsks(r.asks ?? [])).catch(() => {})
  }, [])

  const loadFeedAsks = useCallback(() => {
    apiGet<{ asks: Ask[] }>('/api/asks/feed?limit=4')
      .then((r) => setFeedAsks(r.asks ?? [])).catch(() => {})
  }, [])

  useEffect(() => { if (userId) loadMyAsks(userId) }, [userId, loadMyAsks])
  useEffect(() => { loadFeedAsks() }, [loadFeedAsks])

  function refreshAsks() {
    if (userId) loadMyAsks(userId)
    loadFeedAsks()
  }

  useEffect(() => {
    apiGet<{ user: { full_name: string; id: string } }>('/api/users/me')
      .then((r) => { setFirstName(r.user?.full_name?.split(' ')[0] ?? ''); setUserId(r.user?.id ?? '') })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (inviteDismissed) return
    apiGet<{ url: string }>('/api/invites/me').then((r) => setInviteUrl(r.url)).catch(() => {})
  }, [inviteDismissed])

  async function copyInviteLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {/* ignore */}
  }

  function dismissInviteCard() {
    setInviteDismissed(true)
    try { localStorage.setItem('knotify:inviteDismissed', '1') } catch {/* ignore */}
  }

  useEffect(() => {
    let mounted = true

    // Primary: engine route
    apiGet<HomeData>('/api/relationship-home')
      .then((d) => {
        if (!mounted) return
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
          .catch(() => { if (mounted) setData({ ranked: [], milestones: [], openAsks: [], pendingForMe: [], sharedEvents: [] }) })
          .finally(() => { if (mounted) setLoading(false) })
      })

    return () => { mounted = false }
  }, [userId])

  async function openMessage(peerId: string, draftOpener?: string) {
    try {
      const result = await apiPost<{ conversation: { id: string } }>('/api/conversations', { peerId })
      const url = `/messages?conversation=${result.conversation.id}` + (draftOpener ? `&draft=${encodeURIComponent(draftOpener)}` : '')
      navigate(url)
    } catch {
      navigate('/messages')
    }
  }

  /** Coffee → the real meeting planner in Messages (deep link opens the modal). */
  function openCoffeePlanner(peerId: string) {
    navigate(`/messages?to=${peerId}&action=coffee`)
  }

  function logAndAct(entry: RankedEntry, outcome: 'acted' | 'dismissed' | 'snoozed') {
    setActedIds(prev => {
      const next = new Set(prev)
      next.add(entry.connectionId)
      try { sessionStorage.setItem('knotify:acted', JSON.stringify([...next])) } catch {/* ignore */}
      return next
    })
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

  const rankedRaw        = data?.ranked ?? []
  const ranked           = rankedRaw.filter(r => !actedIds.has(r.connectionId))
  const milestones       = data?.milestones ?? []
  const openAsks         = data?.openAsks ?? []
  const pendingForMe     = data?.pendingForMe ?? []
  const upcomingMeetings = data?.upcomingMeetings ?? []

  const stats: HomeStats = data?.stats ?? {
    total:   rankedRaw.length,
    warm:    rankedRaw.filter((r) => r.state === 'warm').length,
    cooling: rankedRaw.filter((r) => r.state === 'cooling').length,
    cold:    rankedRaw.filter((r) => r.state === 'cold').length,
    fresh:   rankedRaw.filter((r) => r.state === 'new').length,
    needsFollowUp: 0, upcomingMeetings: 0, handled: 0,
  }

  // Pulse shows network milestones only — asks live in their own clickable
  // "Asks for you" section (openAsks feeds the targeted /api/asks/feed instead).
  const networkFeed: NetworkItem[] = [
    ...milestones.map((m) => ({ ...m, type: 'milestone' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)

  // ── Companion — the conversational Home hero ────────────────────────────────
  const companionPeers = new Map<string, PeerLite>(
    ranked.map((r) => [r.peerId, { id: r.peer.id, full_name: r.peer.full_name, avatar_url: r.peer.avatar_url }])
  )
  const rankedByPeer = new Map(ranked.map((r) => [r.peerId, r]))

  function handleCompanionSuggestion(s: Suggestion) {
    const entry = s.peerId ? rankedByPeer.get(s.peerId) : undefined
    switch (s.action) {
      case 'open_message':
        if (!s.peerId) return
        if (entry) logAndAct(entry, 'acted')
        openMessage(s.peerId, s.draft)
        return
      case 'open_coffee':
        if (!s.peerId) return
        if (entry) logAndAct(entry, 'acted')
        openCoffeePlanner(s.peerId)
        return
      case 'open_profile':
        if (s.peerId) navigate(`/profile/${s.peerId}`)
        return
      case 'open_quests':
        navigate('/quests')
        return
      case 'open_events':
        navigate('/events')
        return
    }
  }

  const maintenanceNode = (
    <CompanionHero
      peers={companionPeers}
      healthStrip={<HealthStrip stats={stats} onOpenMap={() => navigate('/map')} />}
      onSuggestion={handleCompanionSuggestion}
    />
  )

  // ── Asks block: targeted "for you" feed + your own. Clickable → AskDrawer.
  // Reused in the desktop rail and the mobile main column (rail is desktop-only).
  const myOpenAsks = myAsks.filter((a) => a.status === 'open')
  const compactRow = (a: Ask, opts: { showAuthor: boolean }) => (
    <button
      key={a.id}
      type="button"
      onClick={() => setAskDetail(a)}
      style={{ textAlign: 'left', cursor: 'pointer', width: '100%', padding: '8px 10px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.text }}
    >
      <div style={{ width: 5, height: 5, borderRadius: 3, background: T.ochre, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {opts.showAuthor && a.author && <span style={{ fontWeight: 600, color: T.ink }}>{a.author.full_name.split(' ')[0]} · </span>}
        <span style={{ color: T.inkMuted }}>{a.content}</span>
      </div>
      <span style={{ fontSize: 10, color: T.inkFaint, flexShrink: 0 }}>{a.reply_count ? `${a.reply_count}↩` : ''}</span>
    </button>
  )

  const RAIL_FEED_LIMIT = 4
  const asksBlock = (
    <>
      <div>
        <DeskSectionLabel right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {feedAsks.length > RAIL_FEED_LIMIT && (
              <button type="button" onClick={() => navigate('/asks')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, padding: 0 }}>See all →</button>
            )}
            <button type="button" onClick={() => setAskOpen(true)} style={{ background: 'none', border: 'none', fontSize: 11, color: T.signal, fontWeight: 600, cursor: 'pointer', fontFamily: T.text, padding: 0 }}>+ Ask</button>
          </div>
        }>{feedAsks.length > 0 ? `Asks for you · ${feedAsks.length}` : 'Asks for you'}</DeskSectionLabel>
        {feedAsks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feedAsks.slice(0, RAIL_FEED_LIMIT).map((a) => compactRow(a, { showAuthor: true }))}
            {feedAsks.length > RAIL_FEED_LIMIT && (
              <button type="button" onClick={() => navigate('/asks')} style={{ textAlign: 'center', width: '100%', padding: '6px 0', borderRadius: 8, border: 'none', background: 'transparent', fontSize: 11.5, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}>
                +{feedAsks.length - RAIL_FEED_LIMIT} more asks →
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => navigate('/asks')} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 12, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, textAlign: 'center' }}>
            No targeted asks yet — view all →
          </button>
        )}
      </div>

      <div>
        <DeskSectionLabel right={
          myOpenAsks.length > 0
            ? <button type="button" onClick={() => navigate('/asks')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, padding: 0 }}>Manage →</button>
            : undefined
        }>Your asks</DeskSectionLabel>
        {myOpenAsks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myOpenAsks.slice(0, 3).map((a) => compactRow(a, { showAuthor: false }))}
          </div>
        ) : (
          <button type="button" onClick={() => setAskOpen(true)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 12, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}>
            Need something? Ask for help.
          </button>
        )}
      </div>
    </>
  )

  // ── Upcoming coffees (real meetings from the planner) ─────────────────────
  const coffeesBlock = upcomingMeetings.length > 0 ? (
    <div>
      <DeskSectionLabel>Coffees · booked</DeskSectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {upcomingMeetings.slice(0, 3).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => navigate(`/messages?to=${m.peerId}`)}
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%', padding: '10px 12px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, borderLeft: `3px solid ${T.verd}`, display: 'flex', alignItems: 'center', gap: 10, fontFamily: T.text }}
          >
            {m.peer && <KAvatar name={m.peer.full_name} src={m.peer.avatar_url} size={28} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.peer?.full_name ?? 'Coffee'}
              </div>
              <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>
                {shortWhen(m.scheduled_at)}{m.location_text ? ` · ${m.location_text}` : ''}
              </div>
            </div>
            {m.status === 'proposed' && (
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: '#7A5A0F', background: T.ochreSoft, padding: '3px 8px', borderRadius: 999 }}>
                {m.am_initiator ? 'awaiting reply' : 'reply needed'}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null

  // ── Right rail: Coffees + Pulse + Asks + Next IRL ──────────────────────────
  const rail = (
    <>
      {coffeesBlock}

      <div>
        <DeskSectionLabel right={networkFeed.length > 0 ? <span style={{ color: T.signal }}>● live</span> : undefined}>Pulse · your knot</DeskSectionLabel>
        {networkFeed.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {networkFeed.slice(0, 5).map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => it.user && navigate(`/profile/${it.user.id}`)}
                style={{ textAlign: 'left', cursor: it.user ? 'pointer' : 'default', width: '100%', padding: 10, borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, display: 'flex', alignItems: 'center', gap: 10, fontFamily: T.text }}
              >
                <div style={{ width: 6, height: 6, borderRadius: 3, background: T.verd, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.3 }}>
                  {it.user && <span style={{ fontWeight: 500 }}>{it.user.full_name} · </span>}
                  <span style={{ color: T.inkMuted }}>{it.content}</span>
                </div>
                <div style={{ fontSize: 10, color: T.inkFaint, flexShrink: 0 }}>{timeAgo(it.created_at)}</div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>Activity from your knot will appear here.</div>
        )}
      </div>

      {asksBlock}

      {sideQuests.length > 0 && (
        <div>
          <DeskSectionLabel right={<button type="button" onClick={() => navigate('/quests')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.ochre, fontWeight: 600, cursor: 'pointer', fontFamily: T.text, padding: 0 }}>All →</button>}>Side quests</DeskSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sideQuests.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => navigate('/quests')}
                style={{ textAlign: 'left', cursor: 'pointer', width: '100%', padding: '10px 12px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, display: 'flex', alignItems: 'center', gap: 10, fontFamily: T.text }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, lineHeight: 1.25 }}>{q.title}</div>
                  {q.description && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.description}</div>}
                </div>
                <span style={{ flexShrink: 0, fontFamily: T.display, fontStyle: 'italic', fontSize: 15, color: T.ochre }}>+{q.points}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <DeskSectionLabel>Next · IRL</DeskSectionLabel>
        {railEvents.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {railEvents.map((ev, i) => (
              <button key={ev.id} type="button" onClick={() => navigate('/events')} style={{ textAlign: 'left', cursor: 'pointer', padding: 14, borderRadius: 12, background: i === 0 ? T.signal : T.paper, color: i === 0 ? '#fff' : T.ink, border: i === 0 ? 'none' : `0.5px solid ${T.rule}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: i === 0 ? 'rgba(255,255,255,0.85)' : T.inkMuted }}>{shortWhen(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ''}</div>
                <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 400, marginTop: 3, lineHeight: 1.15 }}>{ev.title}</div>
                <div style={{ fontSize: 11, color: i === 0 ? 'rgba(255,255,255,0.85)' : T.inkMuted, marginTop: 4 }}>{ev.rsvp_count} going</div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>No upcoming events yet.</div>
        )}
      </div>
    </>
  )

  return (
    <div style={{ paddingBottom: 60 }}>
      {referralPeer && (
        <ReferralAskModal peer={referralPeer} onClose={() => setReferralPeer(null)} />
      )}
      {askMenuPeer && (
        <AskMenu
          peer={askMenuPeer}
          onReferral={() => { setReferralPeer(askMenuPeer); setAskMenuPeer(null) }}
          onMessage={(draft) => { const p = askMenuPeer; setAskMenuPeer(null); if (p) openMessage(p.id, draft) }}
          onClose={() => setAskMenuPeer(null)}
        />
      )}
      {askOpen && (
        <CreateAskModal onClose={() => setAskOpen(false)} onCreated={refreshAsks} />
      )}
      {askDetail && (
        <AskDrawer ask={askDetail} currentUserId={userId || null} onClose={() => setAskDetail(null)} onChanged={refreshAsks} />
      )}

      <DeskHeader
        kicker={`Home · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title={<span style={{ fontStyle: 'italic' }}>Welcome back{firstName ? `, ${firstName}` : ''}.</span>}
        right={<>
          {credMini && (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              title="Your credibility"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, border: 'none', background: T.ink, color: T.paperSoft, cursor: 'pointer', fontFamily: T.text }}
            >
              <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 14, lineHeight: 1 }}>{credMini.tier}</span>
              <span style={{ fontSize: 12.5, color: T.ochre, fontWeight: 700 }}>{credMini.score}</span>
            </button>
          )}
          <KBtn variant="ghost" size="sm" onClick={() => setAskOpen(true)}>Ask your knot</KBtn>
          <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
        </>}
      />

      {/* Mobile-only: coffees + asks (the desktop rail is hidden under lg) */}
      <div className="k-mobile-stack">
        {coffeesBlock}
        {asksBlock}
      </div>

      <DeskPage rail={rail}>
        <HomeHub maintenance={maintenanceNode} />
      </DeskPage>
    </div>
  )
}
