/**
 * RelationshipHomePage — the Relationship OS.
 *
 * Data source: /api/relationship-home (engine output)
 * Fallback:    /api/connections (if engine route unavailable)
 *
 * One prioritized "Today's moves" queue fuses every live occasion per person
 * (shared event, milestone, open ask, coffee follow-up, booked meeting,
 * overdue cadence) into a single card with real, wired actions:
 *   · Message / Congratulate / Offer help / Follow up → conversation with draft
 *   · Coffee → /messages?to=X&action=coffee (real meeting planner)
 *   · Snooze → durable server-side feedback, gone on every device
 *
 * The Companion chat is a deliberately SEPARATE surface from this queue, not
 * a replacement for it — the tiles and the AI chat are two independent
 * surfaces over the same engine data, by explicit request.
 *
 * Design tokens: Fraunces headings · IBM Plex Sans body · Paper #F4EFE6
 * Signal Red (#D84428) used ONLY on: Review button, cold dot, cold accents.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiGetCached, apiPost, getApiCacheSnapshot } from '../lib/api'
import { runWhenIdle } from '../lib/schedule'
import { HomeHub } from '../components/HomeHub'
import { KAvatar, KBtn } from '../lib/knotify'
import { ReferralAskModal } from '../components/ReferralAskModal'
import { CreateAskModal } from '../components/asks/CreateAskModal'
import { AskDrawer, type Ask } from '../components/asks/AskDrawer'
import { T, DeskPage, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'
import { MessageSquare, Coffee, X, MoreHorizontal } from 'lucide-react'

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

const EMPTY_HOME_DATA: HomeData = {
  ranked: [],
  milestones: [],
  openAsks: [],
  pendingForMe: [],
  sharedEvents: [],
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
const STATE_LABEL: Record<RelState, string> = {
  warm: 'Warm', cooling: 'Cooling', cold: 'Cold', new: 'New'
}

const CTA_LABEL: Record<SuggestedAction, string> = {
  reconnect:    'Reconnect',
  message:      'Message',
  congratulate: 'Congratulate',
  welcome:      'Say hi',
  meet:         'Plan to meet',
  ask:          'Offer help',
  follow_up:    'Send follow-up',
}

const OCCASION_STYLE: Record<Occasion['type'], { bg: string; fg: string }> = {
  follow_up:        { bg: T.verdSoft,   fg: T.verd },
  upcoming_meeting: { bg: T.verdSoft,   fg: T.verd },
  shared_event:     { bg: T.plumSoft,   fg: T.plum },
  milestone:        { bg: T.ochreSoft,  fg: '#7A5A0F' },
  open_ask:         { bg: T.ochreSoft,  fg: '#7A5A0F' },
  new_connection:   { bg: T.verdSoft,   fg: T.verd },
  overdue:          { bg: T.paperDeep,  fg: T.inkMuted },
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

function shortWhen(iso: string, timeTba = false) {
  const d = new Date(iso)
  if (timeTba) return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · Time TBA'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Default message drafts per action (used when Layer 2 has no opener) ──────

function draftFor(entry: RankedEntry, extras: { milestone?: string; ask?: string }): string | undefined {
  if (entry.draftOpener) return entry.draftOpener
  const first = entry.peer.full_name.split(' ')[0]
  const sharedEvent = (entry.occasions ?? []).find((o) => o.type === 'shared_event')
  switch (entry.suggestedAction) {
    case 'welcome':      return `Hi ${first}, great to be connected! What are you working on at the moment?`
    case 'reconnect':    return `Hi ${first}, it's been a while! How have things been on your side?`
    case 'message':      return `Hi ${first}, was just thinking of you. How's everything going?`
    case 'congratulate': return extras.milestone
      ? `Congratulations, ${first}! Just saw your update: "${extras.milestone.slice(0, 80)}"`
      : `Saw your news. Congratulations, ${first}!`
    case 'ask':          return extras.ask
      ? `Hi ${first}, saw your ask: "${extras.ask.slice(0, 80)}". I might be able to help.`
      : `Hi ${first}, saw your ask. Happy to help if I can.`
    case 'follow_up':    return `Great meeting you, ${first}! Really enjoyed the conversation and wanted to follow up while it's fresh.`
    case 'meet':         return sharedEvent?.title
      ? `Hey ${first}! Saw we're both going to ${sharedEvent.title}. Want to meet there?`
      : undefined
  }
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
  const [data, setData] = useState<HomeData | null>(() => getApiCacheSnapshot<HomeData>('/api/relationship-home') ?? EMPTY_HOME_DATA)
  const [loading, setLoading] = useState(() => !getApiCacheSnapshot<HomeData>('/api/relationship-home'))
  const [firstName, setFirstName] = useState('')
  const [userId, setUserId] = useState('')
  const [messagingPeer, setMessagingPeer] = useState<string | null>(null)
  const [showAllMoves, setShowAllMoves] = useState(false)
  const [actedIds, setActedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('knotify:acted') ?? '[]')) } catch { return new Set() }
  })
  const [referralPeer, setReferralPeer] = useState<Peer | null>(null)
  const [askMenuPeer, setAskMenuPeer] = useState<Peer | null>(null)
  const [railEvents, setRailEvents] = useState<Array<{ id: string; title: string; starts_at: string; time_tba?: boolean; location: string | null; rsvp_count: number }>>([])
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
    return runWhenIdle(() => {
      apiGetCached<{ events: Array<{ id: string; title: string; starts_at: string; time_tba?: boolean; location: string | null; rsvp_count: number }> }>('/api/events?limit=3', { ttlMs: 30_000 })
        .then((r) => setRailEvents(r.events ?? [])).catch(() => {})
    })
  }, [])

  useEffect(() => {
    return runWhenIdle(() => {
      apiGetCached<{ credibility_score: number; tier: string; quests: Array<{ key: string; title: string; points: number; status: string; description?: string }> }>('/api/quests', { ttlMs: 30_000 })
        .then((r) => {
          setCredMini({ score: r.credibility_score, tier: r.tier })
          setSideQuests((r.quests ?? []).filter((q) => q.status === 'claimable').map((q) => ({ key: q.key, title: q.title, points: q.points, description: q.description })).slice(0, 3))
        }).catch(() => {})
    })
  }, [])

  const loadMyAsks = useCallback((uid: string) => {
    if (!uid) return
    apiGetCached<{ asks: Ask[] }>(`/api/asks/by-user/${uid}`, { ttlMs: 10_000 })
      .then((r) => setMyAsks(r.asks ?? [])).catch(() => {})
  }, [])

  const loadFeedAsks = useCallback(() => {
    apiGetCached<{ asks: Ask[] }>('/api/asks/feed?limit=4', { ttlMs: 10_000 })
      .then((r) => setFeedAsks(r.asks ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    return runWhenIdle(() => loadMyAsks(userId))
  }, [userId, loadMyAsks])
  useEffect(() => runWhenIdle(loadFeedAsks), [loadFeedAsks])

  function refreshAsks() {
    if (userId) loadMyAsks(userId)
    loadFeedAsks()
  }

  useEffect(() => {
    if (inviteDismissed) return
    return runWhenIdle(() => {
      apiGetCached<{ url: string }>('/api/invites/me', { ttlMs: 60_000 }).then((r) => setInviteUrl(r.url)).catch(() => {})
    })
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

    async function loadHome() {
      const cachedMe = getApiCacheSnapshot<{ user: { full_name: string; id: string } }>('/api/users/me')
      if (cachedMe?.user) {
        setFirstName(cachedMe.user.full_name?.split(' ')[0] ?? '')
        setUserId(cachedMe.user.id ?? '')
      }

      const mePromise = apiGetCached<{ user: { full_name: string; id: string } }>('/api/users/me', { ttlMs: 30_000 })
        .catch(() => null)

      try {
        const [meResult, homeData] = await Promise.all([
          mePromise,
          apiGetCached<HomeData>('/api/relationship-home', { ttlMs: 10_000 }),
        ])
        if (!mounted) return
        setFirstName(meResult?.user?.full_name?.split(' ')[0] ?? '')
        setUserId(meResult?.user?.id ?? '')
        setData(homeData)
        setLoading(false)
      } catch {
        if (!mounted) return
        const meResult = await mePromise
        if (!mounted) return
        const fallbackUserId = meResult?.user?.id ?? ''
        setFirstName(meResult?.user?.full_name?.split(' ')[0] ?? '')
        setUserId(fallbackUserId)

        // Fallback: /api/connections (always works)
        apiGetCached<{ connections: RawConn[] }>('/api/connections', { ttlMs: 10_000 })
          .then(({ connections }) => {
            if (!mounted) return
            setData(buildFallbackData(connections, fallbackUserId))
          })
          .catch(() => { if (mounted) setData({ ranked: [], milestones: [], openAsks: [], pendingForMe: [], sharedEvents: [] }) })
          .finally(() => { if (mounted) setLoading(false) })
      }
    }

    void loadHome()

    return () => { mounted = false }
  }, [])

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

  const rankedRaw        = data?.ranked ?? []
  const ranked           = rankedRaw.filter(r => !actedIds.has(r.connectionId))
  const milestones       = data?.milestones ?? []
  const openAsks         = data?.openAsks ?? []
  const pendingForMe     = data?.pendingForMe ?? []
  const upcomingMeetings = data?.upcomingMeetings ?? []

  // Draft context lookups: latest milestone / ask content per peer
  const milestoneByPeer = new Map<string, string>()
  for (const m of milestones) { if (m.user && !milestoneByPeer.has(m.user.id)) milestoneByPeer.set(m.user.id, m.content) }
  const askByPeer = new Map<string, string>()
  for (const a of openAsks) { if (a.user && !askByPeer.has(a.user.id)) askByPeer.set(a.user.id, a.content) }

  const stats: HomeStats = data?.stats ?? {
    total:   rankedRaw.length,
    warm:    rankedRaw.filter((r) => r.state === 'warm').length,
    cooling: rankedRaw.filter((r) => r.state === 'cooling').length,
    cold:    rankedRaw.filter((r) => r.state === 'cold').length,
    fresh:   rankedRaw.filter((r) => r.state === 'new').length,
    needsFollowUp: 0, upcomingMeetings: 0, handled: 0,
  }

  // The queue: anything with a live occasion or a non-warm state is a "move".
  const moves = ranked.filter((r) =>
    (r.occasions ?? []).length > 0 || r.state !== 'warm'
  )
  const allWarm = ranked.length > 0 && moves.length === 0
  const coldCount    = moves.filter((r) => r.state === 'cold').length
  const coolingCount = moves.filter((r) => r.state === 'cooling').length

  const MOVES_PREVIEW = 4
  const visibleMoves = showAllMoves ? moves : moves.slice(0, MOVES_PREVIEW)

  // Pulse shows network milestones only — asks live in their own clickable
  // "Asks for you" section (openAsks feeds the targeted /api/asks/feed instead).
  const networkFeed: NetworkItem[] = [
    ...milestones.map((m) => ({ ...m, type: 'milestone' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)

  // ── Companion — a separate chat card, not fused into the queue below ────────
  // ── "Today's moves" — the unified queue ────────────────────────────────────
  const maintenanceNode = (stats.total > 0 || moves.length > 0) ? (
    <div data-tour="today-moves-queue" style={{ padding: 20, borderRadius: 18, background: '#fff', boxShadow: 'var(--lift-1)' }}>
      <HealthStrip stats={stats} onOpenMap={() => navigate('/map')} />
      <DeskSectionLabel right={
        moves.length > 0 ? <span style={{ color: coldCount > 0 ? T.signal : coolingCount > 0 ? T.ochre : T.verd, textTransform: 'none', letterSpacing: 0, fontWeight: 700 }}>
          {coldCount > 0 ? `${coldCount} going cold` : coolingCount > 0 ? `${coolingCount} cooling` : `${moves.length} move${moves.length === 1 ? '' : 's'}`}
        </span> : undefined
      }>Today's moves</DeskSectionLabel>

      {allWarm || moves.length === 0 ? (
        <div style={{ fontSize: 13.5, color: T.inkMuted, fontFamily: T.display, fontStyle: 'italic', padding: '6px 0' }}>
          Nothing needs you today. Your relationships are warm.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleMoves.map((entry) => {
            const sc = STATE_COLOR[entry.state]
            const occasions = entry.occasions ?? []
            const hasBookedCoffee = entry.signals.hasUpcomingMeeting || occasions.some((o) => o.type === 'upcoming_meeting')
            const ctaLabel = hasBookedCoffee ? 'Open chat' : CTA_LABEL[entry.suggestedAction]
            const draft = hasBookedCoffee ? undefined : draftFor(entry, {
              milestone: milestoneByPeer.get(entry.peerId),
              ask:       askByPeer.get(entry.peerId),
            })
            return (
              <div key={entry.connectionId} style={{ borderRadius: 12, background: T.paperSoft, borderLeft: `3px solid ${sc}`, overflow: 'hidden' }}>
                {/* Top row: avatar + name/state + snooze */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 0' }}>
                  <button type="button" onClick={() => navigate(`/profile/${entry.peer.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                    <KAvatar name={entry.peer.full_name} src={entry.peer.avatar_url} size={38} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: T.text }}>{entry.peer.full_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: sc }}>{STATE_LABEL[entry.state]}</span>
                    </div>
                    {(entry.peer.headline || entry.peer.current_company) && (
                      <div style={{ fontSize: 11, color: T.inkFaint, fontFamily: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.peer.headline ?? entry.peer.current_company}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => logAndAct(entry, 'snoozed')}
                    aria-label="Snooze for a week"
                    title="Snooze for a week"
                    style={{ flexShrink: 0, background: 'none', border: 'none', padding: '4px 6px', cursor: 'pointer', color: T.inkFaint, display: 'flex', alignItems: 'center' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Occasion chips — why this person, today */}
                {occasions.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '8px 12px 0' }}>
                    {occasions.slice(0, 3).map((o, i) => {
                      const os = o.type === 'overdue'
                        ? { bg: `${sc}22`, fg: entry.state === 'cold' ? T.signalDeep : '#7A5A0F' }
                        : OCCASION_STYLE[o.type]
                      return (
                        <span key={`${o.type}-${i}`} style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: os.bg, color: os.fg, fontFamily: T.text, whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.label}
                        </span>
                      )
                    })}
                  </div>
                )}
                {/* Reason text — full width, not truncated */}
                <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, padding: '6px 12px 10px', fontFamily: T.text }}>
                  {entry.reason}
                </div>
                {/* Action buttons row */}
                <div style={{ display: 'flex', gap: 6, padding: '0 10px 10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { logAndAct(entry, 'acted'); openMessage(entry.peer.id, draft) }}
                    disabled={messagingPeer === entry.peer.id}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, border: 'none', background: T.ink, color: T.paperSoft, fontSize: 12.5, fontFamily: T.text, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0 }}
                  >
                    <MessageSquare size={13} />{messagingPeer === entry.peer.id ? 'Opening...' : ctaLabel}
                  </button>
                  {!hasBookedCoffee && (
                    <button
                      type="button"
                      onClick={() => { logAndAct(entry, 'acted'); openCoffeePlanner(entry.peer.id) }}
                      title={`Plan a coffee with ${entry.peer.full_name.split(' ')[0]}`}
                      style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: T.paperDeep, color: T.ink, fontSize: 12.5, fontFamily: T.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <Coffee size={13} /><span style={{ fontSize: 12 }}>Coffee</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAskMenuPeer(entry.peer)}
                    aria-label={`Ask ${entry.peer.full_name.split(' ')[0]} for something`}
                    title="Ask for a referral, intro or advice"
                    style={{ padding: '8px 10px', borderRadius: 999, border: 'none', background: T.paperDeep, color: T.inkMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>
            )
          })}
          {moves.length > MOVES_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllMoves((s) => !s)}
              style={{ width: '100%', padding: '8px 0', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 12, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}
            >
              {showAllMoves ? 'Show fewer' : `Show all ${moves.length} moves`}
            </button>
          )}
        </div>
      )}
    </div>
  ) : (
    <div style={{ padding: '40px 32px', textAlign: 'center', borderRadius: 18, background: '#fff', boxShadow: 'var(--lift-1)' }}>
      <p style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, color: T.ink, margin: '0 0 10px' }}>Your knot is empty</p>
      <p style={{ fontSize: 13.5, color: T.inkMuted, margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.55, fontFamily: T.text }}>
        Connect with people and knotify will tell you who to reach out to, when, and why.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <KBtn className="k-desktop-only-action" variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
        <KBtn variant="ghost" size="sm" onClick={() => navigate('/map')}>View your knot</KBtn>
      </div>
    </div>
  )

  // ── Asks block: targeted "for you" feed + your own. Clickable → AskDrawer.
  // Reused in the desktop rail and the mobile main column (rail is desktop-only).
  // Content is hard-truncated in JS (not just CSS ellipsis) so a long ask
  // can never push the row wider than the rail, regardless of flex sizing.
  const myOpenAsks = myAsks.filter((a) => a.status === 'open')
  const ROW_TEXT_BUDGET = 46
  const compactRow = (a: Ask, opts: { showAuthor: boolean }) => {
    const authorPrefix = opts.showAuthor && a.author ? `${a.author.full_name.split(' ')[0]} · ` : ''
    const contentBudget = Math.max(20, ROW_TEXT_BUDGET - authorPrefix.length)
    const content = a.content.length > contentBudget ? `${a.content.slice(0, contentBudget).trimEnd()}…` : a.content
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => setAskDetail(a)}
        style={{ textAlign: 'left', cursor: 'pointer', width: '100%', minWidth: 0, padding: '8px 10px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.text }}
      >
        <div style={{ width: 5, height: 5, borderRadius: 3, background: T.ochre, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {authorPrefix && <span style={{ fontWeight: 600, color: T.ink }}>{authorPrefix}</span>}
          <span style={{ color: T.inkMuted }}>{content}</span>
        </div>
        <span style={{ fontSize: 10, color: T.inkFaint, flexShrink: 0 }}>{a.reply_count ? `${a.reply_count}↩` : ''}</span>
      </button>
    )
  }

  const RAIL_FEED_LIMIT = 4
  const asksBlock = (
    <div className="k-home-asks-group" data-tour="asks-for-you">
      <section className="k-home-rail-section">
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
      </section>

      <section className="k-home-rail-section">
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
      </section>
    </div>
  )

  // ── Upcoming coffees (real meetings from the planner) ─────────────────────
  const coffeesBlock = upcomingMeetings.length > 0 ? (
    <div data-tour="coffees-booked">
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
  // Each block is a standalone const (not inlined) so it can be reused
  // verbatim in the mobile stack below — that rail is `hidden` under the lg
  // breakpoint, so mobile needs its own visible copy of the same content
  // rather than losing these sections entirely.
  const pulseKnotBlock = (
    <section className="k-home-rail-section" data-tour="pulse-knot">
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
    </section>
  )

  const sideQuestsBlock = sideQuests.length > 0 ? (
    <div data-tour="side-quests">
      <DeskSectionLabel right={<button type="button" data-tour="nav-quests" onClick={() => navigate('/quests')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.ochre, fontWeight: 600, cursor: 'pointer', fontFamily: T.text, padding: 0 }}>All →</button>}>Side quests</DeskSectionLabel>
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
  ) : null

  const nextIrlBlock = (
    <section className="k-home-rail-section" data-tour="next-irl">
      <DeskSectionLabel>Next · IRL</DeskSectionLabel>
      {railEvents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {railEvents.map((ev, i) => (
            <button key={ev.id} type="button" onClick={() => navigate('/events')} style={{ textAlign: 'left', cursor: 'pointer', padding: 14, borderRadius: 12, background: i === 0 ? T.signal : T.paper, color: i === 0 ? '#fff' : T.ink, border: i === 0 ? 'none' : `0.5px solid ${T.rule}` }}>
              <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: i === 0 ? 'rgba(255,255,255,0.85)' : T.inkMuted }}>{shortWhen(ev.starts_at, ev.time_tba)}{ev.location ? ` · ${ev.location}` : ''}</div>
              <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 400, marginTop: 3, lineHeight: 1.15 }}>{ev.title}</div>
              <div style={{ fontSize: 11, color: i === 0 ? 'rgba(255,255,255,0.85)' : T.inkMuted, marginTop: 4 }}>{ev.rsvp_count} going</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>No upcoming events yet.</div>
      )}
    </section>
  )

  const rail = (
    <>
      {coffeesBlock}
      {pulseKnotBlock}
      {asksBlock}
      {sideQuestsBlock}
      {nextIrlBlock}
    </>
  )

  return (
    <div className="k-relationship-home-page" style={{ paddingBottom: 60 }}>
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
        kicker={`Home · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${loading ? ' · updating' : ''}`}
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
          <KBtn className="k-desktop-only-action" variant="signal" size="sm" onClick={() => navigate('/discover')}>Find people</KBtn>
        </>}
      />

      {/* Mobile-only: the desktop rail is `hidden` under lg, so mobile gets its
          own visible copy of the same content instead of losing it outright. */}
      <div className="k-mobile-stack">
        {coffeesBlock}
        {asksBlock}
        {pulseKnotBlock}
        {nextIrlBlock}
        {sideQuestsBlock}
      </div>

      <DeskPage rail={rail}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <HomeHub maintenance={maintenanceNode} />
        </div>
      </DeskPage>
    </div>
  )
}
