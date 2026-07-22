/**
 * NotificationsBell — the app's single notification surface.
 *
 * A bell with an unread badge; clicking opens a dropdown panel that aggregates
 * everything that needs the user's attention:
 *   · Connection requests (accept / decline inline)
 *   · Unread messages  → /messages
 *   · Referral updates  → /jobs
 *
 * Kept deliberately self-contained so it can live in the sidebar (desktop) or
 * a floating button (mobile) without prop wiring.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, MessageSquare, Briefcase, Check, X, Inbox, ClipboardList, UserRoundPlus, Plus, MessageCircle, UserPlus, CalendarCheck } from 'lucide-react'
import { apiGetCached, apiPatch, apiPost } from '../lib/api'
import { KAvatar } from '../lib/knotify'
import { runWhenIdle } from '../lib/schedule'
import { closeDeliveredNotifications } from '../lib/push'
import { AskDrawer, type Ask } from './asks/AskDrawer'
import { CreateAskModal } from './asks/CreateAskModal'
import { useNotificationsUnreadCount } from '../hooks/useNotifications'

type Peer = { id: string; full_name: string; username: string; avatar_url: string | null }
type RawConn = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  user: Peer | null
}
type Request = { id: string; peer: Peer }
type NotificationActor = { id: string; full_name: string; username: string; avatar_url: string | null }
type NotificationItem = {
  id: string
  type: 'connection_request' | 'connection_accepted' | 'message' | 'event_rsvp' | 'job_referral_request' | 'ask_reply'
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
  actor: NotificationActor | null
}
type BellTab = 'activity' | 'for-you' | 'your-asks' | 'requests'

const NOTIFICATION_ICONS: Record<NotificationItem['type'], typeof UserPlus> = {
  connection_request: UserPlus,
  connection_accepted: UserRoundPlus,
  message: MessageSquare,
  event_rsvp: CalendarCheck,
  job_referral_request: Briefcase,
  ask_reply: MessageCircle,
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

const T = {
  paper: '#F4EFE6', paperSoft: '#FAF6EE', ink: '#1A1815', inkMuted: '#6B6358',
  inkFaint: '#A29A8C', rule: '#D9D1BF', ruleSoft: '#E5DCC8', signal: '#D8442B', verd: '#1F6B5E',
  display: "'Fraunces', Georgia, serif", text: "'IBM Plex Sans', system-ui, sans-serif",
}

export function NotificationsBell({ variant = 'sidebar', messageUnread = 0, referralUnread = 0 }: { variant?: 'sidebar' | 'floating'; messageUnread?: number; referralUnread?: number }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [requests, setRequests] = useState<Request[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [feedAsks, setFeedAsks] = useState<Ask[]>([])
  const [myAsks, setMyAsks] = useState<Ask[]>([])
  const [askUnread, setAskUnread] = useState(0)
  const [activeTab, setActiveTab] = useState<BellTab>('activity')
  const [selectedAsk, setSelectedAsk] = useState<Ask | null>(null)
  const [creatingAsk, setCreatingAsk] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<React.CSSProperties | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const notificationsUnread = useNotificationsUnreadCount()

  const loadNotifications = useCallback(async () => {
    if (document.hidden) return
    try {
      const data = await apiGetCached<{ notifications: NotificationItem[] }>('/api/notifications', { ttlMs: 10_000 })
      setNotifications(data.notifications ?? [])
      // Covers reads that happened elsewhere (another device, or in-app
      // earlier this session) — their tray notification here is now stale.
      const alreadyRead = (data.notifications ?? []).filter((n) => n.read_at).map((n) => n.id)
      if (alreadyRead.length) void closeDeliveredNotifications(alreadyRead)
    } catch {
      /* silent — notifications degrade gracefully */
    }
  }, [])

  const load = useCallback(async () => {
    if (document.hidden) return
    try {
      const [me, conns, feed] = await Promise.all([
        apiGetCached<{ user: { id: string } }>('/api/users/me', { ttlMs: 30_000 }),
        apiGetCached<{ connections: RawConn[] }>('/api/connections', { ttlMs: 10_000 }),
        apiGetCached<{ asks: Ask[]; unseen?: number }>('/api/asks/feed?limit=12', { ttlMs: 30_000 }),
      ])
      const myId = me.user?.id
      setCurrentUserId(myId ?? null)
      setFeedAsks(feed.asks ?? [])
      setAskUnread(feed.unseen ?? 0)
      if (myId) {
        const mine = await apiGetCached<{ asks: Ask[] }>(`/api/asks/by-user/${myId}`, { ttlMs: 15_000 })
        setMyAsks(mine.asks ?? [])
      }
      const pending = (conns.connections ?? [])
        .filter((c) => c.status === 'pending' && c.addressee_id === myId && c.user)
        .map((c) => ({ id: c.id, peer: c.user! }))
      setRequests(pending)
    } catch {
      /* silent — notifications degrade gracefully */
    }
  }, [])

  useEffect(() => {
    const cancelInitialLoad = runWhenIdle(() => { void load(); void loadNotifications() }, 10_000)
    const reconcile = () => {
      if (!document.hidden) { void load(); void loadNotifications() }
    }
    window.addEventListener('focus', reconcile)
    const interval = window.setInterval(reconcile, 10 * 60_000)
    return () => {
      cancelInitialLoad()
      window.removeEventListener('focus', reconcile)
      window.clearInterval(interval)
    }
  }, [load, loadNotifications])

  const total = requests.length + askUnread + messageUnread + referralUnread + notificationsUnread
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      if (variant === 'floating') {
        // Bottom FAB → open the panel upward, right-aligned to the button.
        setPos({ bottom: Math.round(window.innerHeight - r.top + 8), right: Math.max(12, Math.round(window.innerWidth - r.right)) })
      } else {
        const left = Math.min(r.left, window.innerWidth - 348)
        setPos({ top: r.bottom + 8, left: Math.max(12, left) })
      }
      void load()
      void loadNotifications()
    }
    setOpen((o) => !o)
  }

  async function respond(id: string, status: 'accepted' | 'declined') {
    setBusyId(id)
    try {
      await apiPatch(`/api/connections/${id}`, { status })
      setRequests((rs) => rs.filter((r) => r.id !== id))
    } catch {
      /* keep the item; user can retry */
    } finally {
      setBusyId(null)
    }
  }

  async function openNotification(n: NotificationItem) {
    setOpen(false)
    if (!n.read_at) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item)))
      void closeDeliveredNotifications([n.id])
      try {
        await apiPatch(`/api/notifications/${n.id}/read`, {})
      } catch {
        /* count will reconcile on next poll */
      }
    }
    if (n.url) navigate(n.url)
  }

  async function markAllNotificationsRead() {
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id)
    setNotifications((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })))
    if (unreadIds.length) void closeDeliveredNotifications(unreadIds)
    try {
      await apiPost('/api/notifications/read-all', {})
    } catch {
      /* count will reconcile on next poll */
    }
  }

  const bellButton = (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label="Notifications"
      style={
        variant === 'floating'
          ? { position: 'relative', width: 40, height: 40, borderRadius: '50%', border: `0.5px solid ${T.rule}`, background: T.paperSoft, color: T.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 6px 20px rgba(26,24,21,0.12)' }
          : { position: 'relative', width: 34, height: 34, borderRadius: 10, border: 'none', background: open ? T.paper : 'transparent', color: T.ink, cursor: 'pointer', display: 'grid', placeItems: 'center' }
      }
    >
      <Bell size={variant === 'floating' ? 16 : 17} />
      {total > 0 && (
        <span style={{ position: 'absolute', top: variant === 'floating' ? 4 : 2, right: variant === 'floating' ? 4 : 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: T.signal, color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box', lineHeight: 1 }}>
          {total > 9 ? '9+' : total}
        </span>
      )}
    </button>
  )

  return (
    <>
      {creatingAsk && <CreateAskModal onClose={() => setCreatingAsk(false)} onCreated={() => void load()} />}
      {selectedAsk && <AskDrawer ask={selectedAsk} currentUserId={currentUserId} onClose={() => setSelectedAsk(null)} onChanged={() => void load()} />}
      {variant === 'floating' ? (
        <div style={{ position: 'fixed', bottom: 'var(--mobile-notifications-bottom)', right: 'var(--mobile-floating-action-right)', zIndex: 9991 }}>{bellButton}</div>
      ) : (
        bellButton
      )}

      {open && pos && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            style={{
              position: 'fixed', ...pos, width: 'min(336px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto',
              background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(26,24,21,0.22)', zIndex: 9999, padding: 8,
              fontFamily: T.text,
            }}
          >
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, color: T.ink }}>Notifications</span>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, display: 'flex', padding: 2 }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '0 8px 8px', borderBottom: `0.5px solid ${T.ruleSoft}` }}>
              {([
                { id: 'activity' as const, label: 'Activity', icon: Bell, count: notificationsUnread },
                { id: 'for-you' as const, label: 'For you', icon: Inbox, count: askUnread },
                { id: 'your-asks' as const, label: 'Your asks', icon: ClipboardList, count: myAsks.filter((ask) => ask.status === 'open').length },
                { id: 'requests' as const, label: 'Requests', icon: UserRoundPlus, count: requests.length },
              ]).map(({ id, label, icon: Icon, count }) => {
                const active = activeTab === id
                return <button key={id} type="button" onClick={() => setActiveTab(id)} style={{ border: `0.5px solid ${active ? 'rgba(216,68,43,0.30)' : 'transparent'}`, background: active ? 'rgba(216,68,43,0.08)' : 'transparent', borderRadius: 10, padding: '7px 3px', color: active ? T.signal : T.inkMuted, cursor: 'pointer', fontFamily: T.text, display: 'grid', placeItems: 'center', gap: 3 }}><Icon size={14} /><span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600 }}>{label}{count ? ` · ${count}` : ''}</span></button>
              })}
            </div>

            {activeTab === 'activity' && (
              <div style={{ padding: '4px 4px 8px' }}>
                {notificationsUnread > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px' }}>
                    <button type="button" onClick={() => void markAllNotificationsRead()} style={{ border: 'none', background: 'none', color: T.signal, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.text }}>Mark all read</button>
                  </div>
                )}
                {notifications.length === 0 ? (
                  <div style={{ padding: '20px 12px 24px', textAlign: 'center', color: T.inkMuted, fontSize: 13.5 }}>
                    You're all caught up.
                  </div>
                ) : (
                  notifications.map((n) => {
                    const Icon = NOTIFICATION_ICONS[n.type]
                    return (
                      <button key={n.id} type="button" onClick={() => void openNotification(n)} style={{ ...rowStyle, padding: '9px 6px', background: n.read_at ? 'none' : 'rgba(216,68,43,0.05)' }}>
                        {n.actor ? (
                          <KAvatar name={n.actor.full_name} src={n.actor.avatar_url} size={30} />
                        ) : (
                          <span style={iconWrap(T.signal)}><Icon size={15} /></span>
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: n.read_at ? 500 : 650, color: T.ink }}>{n.title}</span>
                          <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: T.inkFaint }}>{timeAgo(n.created_at)}</span>
                        </span>
                        {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.signal, flexShrink: 0 }} />}
                      </button>
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'for-you' && feedAsks.length === 0 && messageUnread === 0 && referralUnread === 0 && (
              <div style={{ padding: '20px 12px 24px', textAlign: 'center', color: T.inkMuted, fontSize: 13.5 }}>
                You're all caught up.
              </div>
            )}

            {activeTab === 'for-you' && feedAsks.length > 0 && (
              <div style={{ padding: '8px 8px 4px' }}>
                <div style={{ fontSize: 11, color: T.inkFaint, fontWeight: 700, padding: '4px 4px 7px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Asks for you</div>
                {feedAsks.slice(0, 4).map((ask) => (
                  <button key={ask.id} type="button" onClick={() => { setOpen(false); setSelectedAsk(ask) }} style={{ ...rowStyle, padding: '9px 6px' }}>
                    <span style={iconWrap(T.verd)}><MessageCircle size={15} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.ink }}>{ask.author?.full_name ?? 'Someone'} needs help</span><span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: T.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ask.content}</span></span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'your-asks' && (
              <div style={{ padding: '8px' }}>
                <button type="button" onClick={() => setCreatingAsk(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', borderRadius: 10, border: 'none', background: T.ink, color: T.paper, cursor: 'pointer', fontFamily: T.text, fontSize: 12.5, fontWeight: 700 }}><Plus size={15} /> Send an ask</button>
                {myAsks.length === 0 ? <div style={{ padding: '18px 8px 14px', textAlign: 'center', fontSize: 12.5, color: T.inkMuted }}>Your asks and their replies will live here.</div> : myAsks.slice(0, 5).map((ask) => (
                  <button key={ask.id} type="button" onClick={() => { setOpen(false); setSelectedAsk(ask) }} style={{ ...rowStyle, padding: '11px 6px', borderBottom: `0.5px solid ${T.ruleSoft}` }}>
                    <span style={iconWrap(ask.status === 'resolved' ? T.verd : T.signal)}><ClipboardList size={15} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 12.5, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ask.content}</span><span style={{ display: 'block', marginTop: 2, fontSize: 11, color: T.inkFaint }}>{ask.status === 'resolved' ? 'Resolved' : 'Open'} · {ask.reply_count ?? 0} replies</span></span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'requests' && requests.length > 0 && (
              <div style={{ padding: '4px 4px 8px' }}>
                <div style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600, padding: '4px 8px' }}>Connection requests</div>
                {requests.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px' }}>
                    <button type="button" onClick={() => { setOpen(false); navigate(`/profile/${r.peer.id}`) }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                      <KAvatar name={r.peer.full_name} src={r.peer.avatar_url} size={36} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.peer.full_name}</div>
                      <div style={{ fontSize: 11.5, color: T.inkFaint }}>wants to connect</div>
                    </div>
                    <button type="button" disabled={busyId === r.id} onClick={() => void respond(r.id, 'accepted')} aria-label="Accept" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.verd, color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check size={15} /></button>
                    <button type="button" disabled={busyId === r.id} onClick={() => void respond(r.id, 'declined')} aria-label="Decline" style={{ width: 30, height: 30, borderRadius: '50%', border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'requests' && requests.length === 0 && <div style={{ padding: '20px 12px 24px', textAlign: 'center', color: T.inkMuted, fontSize: 13 }}>No connection requests right now.</div>}

            {activeTab === 'for-you' && (messageUnread > 0 || referralUnread > 0) && (
              <div style={{ borderTop: requests.length > 0 ? `0.5px solid ${T.ruleSoft}` : 'none', padding: '6px 4px' }}>
                {messageUnread > 0 && (
                  <button type="button" onClick={() => { setOpen(false); navigate('/messages') }} style={rowStyle}>
                    <span style={iconWrap(T.signal)}><MessageSquare size={15} /></span>
                    <span style={{ flex: 1, fontSize: 13.5, color: T.ink }}>{messageUnread} new message{messageUnread === 1 ? '' : 's'}</span>
                  </button>
                )}
                {referralUnread > 0 && (
                  <button type="button" onClick={() => { setOpen(false); navigate('/jobs') }} style={rowStyle}>
                    <span style={iconWrap(T.verd)}><Briefcase size={15} /></span>
                    <span style={{ flex: 1, fontSize: 13.5, color: T.ink }}>{referralUnread} referral update{referralUnread === 1 ? '' : 's'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

const rowStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 10, fontFamily: T.text,
}
function iconWrap(color: string): React.CSSProperties {
  return { width: 30, height: 30, borderRadius: 8, background: `${color}18`, color, display: 'grid', placeItems: 'center', flexShrink: 0 }
}
