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
import { Bell, MessageSquare, Briefcase, Check, X } from 'lucide-react'
import { apiGet, apiPatch } from '../lib/api'
import { KAvatar } from '../lib/knotify'
import { useMessageUnreadCount } from '../hooks/useMessageUnreadCount'
import { useReferralUnreadCount } from '../hooks/useReferralUnreadCount'

type Peer = { id: string; full_name: string; username: string; avatar_url: string | null }
type RawConn = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  user: Peer | null
}
type Request = { id: string; peer: Peer }

const T = {
  paper: '#F4EFE6', paperSoft: '#FAF6EE', ink: '#1A1815', inkMuted: '#6B6358',
  inkFaint: '#A29A8C', rule: '#D9D1BF', ruleSoft: '#E5DCC8', signal: '#D8442B', verd: '#1F6B5E',
  display: "'Fraunces', Georgia, serif", text: "'IBM Plex Sans', system-ui, sans-serif",
}

export function NotificationsBell({ variant = 'sidebar' }: { variant?: 'sidebar' | 'floating' }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [requests, setRequests] = useState<Request[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const messageUnread = useMessageUnreadCount()
  const referralUnread = useReferralUnreadCount()

  const load = useCallback(async () => {
    try {
      const [me, conns] = await Promise.all([
        apiGet<{ user: { id: string } }>('/api/users/me'),
        apiGet<{ connections: RawConn[] }>('/api/connections'),
      ])
      const myId = me.user?.id
      const pending = (conns.connections ?? [])
        .filter((c) => c.status === 'pending' && c.addressee_id === myId && c.user)
        .map((c) => ({ id: c.id, peer: c.user! }))
      setRequests(pending)
    } catch {
      /* silent — notifications degrade gracefully */
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 45000)
    return () => window.clearInterval(interval)
  }, [load])

  const total = requests.length + messageUnread + referralUnread

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      // Anchor the panel near the bell; clamp to viewport.
      const left = Math.min(r.left, window.innerWidth - 348)
      setAnchor({ top: r.bottom + 8, left: Math.max(12, left) })
      void load()
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

  const bellButton = (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label="Notifications"
      style={
        variant === 'floating'
          ? { position: 'relative', width: 42, height: 42, borderRadius: '50%', border: `0.5px solid ${T.rule}`, background: T.paperSoft, color: T.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 6px 20px rgba(26,24,21,0.12)' }
          : { position: 'relative', width: 34, height: 34, borderRadius: 10, border: 'none', background: open ? T.paper : 'transparent', color: T.ink, cursor: 'pointer', display: 'grid', placeItems: 'center' }
      }
    >
      <Bell size={variant === 'floating' ? 18 : 17} />
      {total > 0 && (
        <span style={{ position: 'absolute', top: variant === 'floating' ? 4 : 2, right: variant === 'floating' ? 4 : 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: T.signal, color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box', lineHeight: 1 }}>
          {total > 9 ? '9+' : total}
        </span>
      )}
    </button>
  )

  return (
    <>
      {variant === 'floating' ? (
        <div style={{ position: 'fixed', top: 'calc(12px + env(safe-area-inset-top))', right: 14, zIndex: 45 }}>{bellButton}</div>
      ) : (
        bellButton
      )}

      {open && anchor && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div
            style={{
              position: 'fixed', top: anchor.top, left: anchor.left, width: 336, maxHeight: '70vh', overflowY: 'auto',
              background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(26,24,21,0.22)', zIndex: 9999, padding: 8,
              fontFamily: T.text,
            }}
          >
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, color: T.ink }}>Notifications</span>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, display: 'flex', padding: 2 }}><X size={16} /></button>
            </div>

            {total === 0 && (
              <div style={{ padding: '20px 12px 24px', textAlign: 'center', color: T.inkMuted, fontSize: 13.5 }}>
                You're all caught up.
              </div>
            )}

            {requests.length > 0 && (
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

            {(messageUnread > 0 || referralUnread > 0) && (
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
