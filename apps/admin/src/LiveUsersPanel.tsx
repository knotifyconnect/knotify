import { useEffect, useState } from 'react'

export type LiveUser = {
  id: string
  profileId: string
  fullName: string
  username: string | null
  avatarUrl: string | null
  headline: string | null
  currentCompany: string | null
  locationCity: string | null
  currentPath: string
  currentSection: string
  deviceTypes: string[]
  sessionStartedAt: string
  lastSeenAt: string
  activeSeconds: number
  pageViews: number
  openSessions: number
}

export type LiveUsersSnapshot = {
  available: boolean
  generatedAt: string
  onlineWindowSeconds: number
  refreshAfterSeconds: number
  users: LiveUser[]
}

const P = {
  ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287', paperSoft: '#ede8df',
  white: '#fff', verd: '#2d7d46', verdSoft: 'rgba(45,125,70,.09)',
  blue: '#386a8a', blueSoft: 'rgba(56,106,138,.09)', ochre: '#b8820f',
  rule: 'rgba(84,72,58,.14)',
}

function duration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remainder = safe % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${remainder}s`
  return `${remainder}s`
}

function heartbeatAge(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  return seconds < 2 ? 'now' : `${seconds}s ago`
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
}

function Avatar({ user }: { user: LiveUser }) {
  if (user.avatarUrl) return <img src={user.avatarUrl} alt="" style={{ width: 38, height: 38, borderRadius: 11, objectFit: 'cover', border: `0.5px solid ${P.rule}` }} />
  return <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: P.paperSoft, color: P.inkMuted, fontSize: 11, fontWeight: 750 }}>{initials(user.fullName)}</span>
}

export function LiveUsersPanel({ snapshot, error }: { snapshot: LiveUsersSnapshot | null; error?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const users = snapshot?.users ?? []
  const syncAge = snapshot ? heartbeatAge(snapshot.generatedAt, now) : 'connecting…'

  return (
    <div style={{ background: P.white, border: `0.5px solid ${P.rule}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: `0.5px solid ${P.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ position: 'relative', width: 10, height: 10, borderRadius: 99, background: P.verd, boxShadow: '0 0 0 4px rgba(45,125,70,.12)' }} />
          <div>
            <div style={{ fontSize: 13, color: P.ink, fontWeight: 750 }}>Live members</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: P.inkFaint }}>Foreground sessions, current section and device</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, lineHeight: 1, color: P.verd }}>{users.length}</div>
          <div style={{ marginTop: 3, fontSize: 10, color: P.inkFaint }}>3s refresh · synced {syncAge}</div>
        </div>
      </div>

      {error && <div style={{ padding: '9px 14px', color: P.ochre, background: 'rgba(184,130,15,.08)', fontSize: 11.5 }}>{error} Keeping the last successful live snapshot.</div>}
      {snapshot && !snapshot.available ? (
        <div style={{ padding: 22, color: P.ochre, fontSize: 12 }}>Live presence is waiting for the product-activity schema.</div>
      ) : !snapshot ? (
        <div style={{ padding: 22, color: P.inkFaint, fontSize: 12 }}>Connecting to live presence…</div>
      ) : users.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}><div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: P.ink }}>No one is in the foreground right now</div><div style={{ marginTop: 5, color: P.inkFaint, fontSize: 11.5 }}>A member appears here within about 20 seconds of opening Knotify.</div></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            {users.map((user, index) => {
              const sessionSeconds = Math.max(0, Math.floor((now - new Date(user.sessionStartedAt).getTime()) / 1000))
              const identityDetail = user.headline || user.currentCompany || user.locationCity || 'Member'
              return (
                <div key={user.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.4fr) minmax(150px,.8fr) minmax(130px,.7fr) minmax(140px,.75fr)', gap: 14, alignItems: 'center', padding: '12px 15px', borderTop: index ? `0.5px solid ${P.rule}` : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar user={user} />
                    <div style={{ minWidth: 0 }}><div style={{ color: P.ink, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div><div style={{ color: P.inkFaint, fontSize: 10.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username ? `@${user.username} · ` : ''}{identityDetail}</div></div>
                  </div>
                  <div><div style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 999, color: P.blue, background: P.blueSoft, fontSize: 10.5, fontWeight: 700 }}>{user.currentSection}</div><div title={user.currentPath} style={{ color: P.inkFaint, fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.currentPath}</div></div>
                  <div><div style={{ color: P.ink, fontSize: 11.5 }}>{user.deviceTypes.map(device => device[0]?.toUpperCase() + device.slice(1)).join(' · ')}</div><div style={{ color: P.inkFaint, fontSize: 10, marginTop: 3 }}>{user.openSessions} open session{user.openSessions === 1 ? '' : 's'} · {user.pageViews} views</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ color: P.ink, fontSize: 11.5, fontWeight: 700 }}>{duration(sessionSeconds)} current</div><div style={{ color: P.verd, fontSize: 10, marginTop: 3 }}>heartbeat {heartbeatAge(user.lastSeenAt, now)}</div><div style={{ color: P.inkFaint, fontSize: 9.5, marginTop: 2 }}>{duration(user.activeSeconds)} active</div></div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
