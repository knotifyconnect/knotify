/**
 * knotify · App Sidebar, matches web-app.jsx design exactly
 * Active = ink (black) background, signal-soft icon, paper-soft text
 * Includes Quest banner + self profile card at bottom
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BriefcaseBusiness,
  ChevronRight,
  Coffee,
  Home,
  LogOut,
  MessageSquare,
  Network,
  Search,
  Settings,
  UserPlus,
} from 'lucide-react'
import { KAvatar, KnotifyLogoImg } from '@/lib/knotify'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import { apiGet } from '@/lib/api'
import { useReferralUnreadCount } from '@/hooks/useReferralUnreadCount'
import { useMessageUnreadCount } from '@/hooks/useMessageUnreadCount'
import { useConnectionCount } from '@/hooks/useConnectionCount'

type Me = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  is_hr: boolean
  is_admin: boolean
}

type NavItem = {
  title: string
  sub?: string
  href: string
  icon: React.ReactNode
  badge?: 'jobs' | 'messages' | 'connections'
  newBadge?: boolean
}

const BASE_ITEMS: NavItem[] = [
  { title: 'Home',         href: '/home',     icon: <Home              size={15} /> },
  { title: 'Your Knot',    href: '/map',      icon: <Network           size={15} />, badge: 'connections' },
  { title: 'Discover',     href: '/discover', icon: <Search            size={15} /> },
  { title: 'Jobs & Gigs',  href: '/jobs',     icon: <BriefcaseBusiness size={15} />, badge: 'jobs', newBadge: true },
  { title: 'Cafes',        sub: 'IRL',        href: '/cafes',          icon: <Coffee            size={15} /> },
  { title: 'Messages',     href: '/messages', icon: <MessageSquare     size={15} />, badge: 'messages' },
  { title: 'Invite',       href: '/invite',   icon: <UserPlus          size={15} /> },
]

export function AppSidebar() {
  const setToken = useSessionStore((s) => s.setToken)
  const referralUnreadCount = useReferralUnreadCount()
  const messageUnreadCount = useMessageUnreadCount()
  const connectionCount = useConnectionCount()
  const [me, setMe] = useState<Me | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    apiGet<{ user: Me }>('/api/users/me')
      .then((data) => setMe(data.user ?? null))
      .catch(() => setMe(null))
  }, [])

  const items: NavItem[] = (() => {
    let arr: NavItem[] = [...BASE_ITEMS]
    if (me?.is_admin) arr = [...arr, { title: 'Admin', href: '/admin', icon: <Settings size={15} /> }]
    return arr
  })()

  async function logout() {
    await supabase.auth.signOut()
    setToken(null)
    window.location.href = '/'
  }

  function badgeFor(item: NavItem): number {
    if (item.badge === 'jobs') return referralUnreadCount
    if (item.badge === 'messages') return messageUnreadCount
    if (item.badge === 'connections') return connectionCount
    return 0
  }

  const sidebar = (
    <>
      {/* ── Desktop sidebar, exact match to web-app.jsx ─────────────── */}
      <aside
        className="hidden md:flex"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          width: 220,
          flexDirection: 'column',
          background: 'var(--paper-soft)',
          borderRight: '0.5px solid var(--rule)',
          padding: '24px 16px',
          boxSizing: 'border-box',
          gap: 4,
          zIndex: 40,
        }}
      >
        {/* Logo (mark + wordmark, design uses size 22), clicks → /home */}
        <button
          type="button"
          onClick={() => navigate('/home')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 8px 24px',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            width: '100%',
          }}
          aria-label="Go to home"
        >
          <KnotifyLogoImg variant="wordmark" height={24} />
        </button>

        {/* Nav items */}
        {items.map((item) => {
          const count = badgeFor(item)
          return (
            <NavLink
              key={item.href + item.title}
              to={item.href}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isActive ? 'var(--ink)' : 'transparent',
                    color: isActive ? 'var(--paper-soft)' : 'var(--ink)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    cursor: 'pointer',
                    transition: 'all 0.13s ease',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      ;(e.currentTarget as HTMLDivElement).style.background = 'var(--paper-deep)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      color: isActive ? 'var(--signal-soft)' : 'var(--ink-soft)',
                    }}
                  >
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    {item.title}
                    {item.sub && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 400,
                          color: isActive ? 'var(--ink-faint)' : 'var(--ink-muted)',
                        }}
                      >
                        · {item.sub}
                      </span>
                    )}
                  </div>
                  {item.newBadge && (
                    <div
                      style={{
                        fontSize: 8.5,
                        fontWeight: 700,
                        padding: '2px 5px',
                        background: 'var(--signal)',
                        color: '#fff',
                        borderRadius: 3,
                        letterSpacing: 0.5,
                        fontFamily: "'IBM Plex Sans', sans-serif",
                      }}
                    >
                      NEW
                    </div>
                  )}
                  {count > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: isActive ? 'var(--ink-faint)' : 'var(--ink-muted)',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      {count}
                    </div>
                  )}
                </div>
              )}
            </NavLink>
          )
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Self profile card */}
        {me && (
          <div
            onClick={() => navigate('/profile')}
            style={{
              padding: 8,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'background 0.13s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background = 'var(--paper-deep)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }}
          >
            <KAvatar name={me.full_name} src={me.avatar_url} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {me.full_name}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--ink-muted)',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                @{me.username}
              </div>
            </div>
            <ChevronRight size={11} color="var(--ink-muted)" />
          </div>
        )}

        {/* Logout (subtle, below profile) */}
        <button
          type="button"
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-faint)',
            fontSize: 11.5,
            fontFamily: "'IBM Plex Sans', sans-serif",
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <LogOut size={12} />
          Log out
        </button>
      </aside>

      {/* ── Mobile bottom tab bar ─────────────────────────────────── */}
      <nav
        className="flex md:hidden k-tab-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(244,239,230,0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '0.5px solid var(--rule-soft)',
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 8px',
        }}
      >
        {[
          { title: 'Home',     href: '/home',     icon: <Home size={18} /> },
          { title: 'Knot',     href: '/map',      icon: <Network size={18} /> },
          { title: 'Messages', href: '/messages', icon: <MessageSquare size={18} /> },
          { title: 'Discover', href: '/discover', icon: <Search size={18} /> },
          {
            title: 'Me',
            href: '/profile',
            icon: me ? <KAvatar name={me.full_name} src={me.avatar_url} size={22} /> : <Search size={18} />,
          },
        ].map((item) => (
          <NavLink
            key={item.href + item.title}
            to={item.href}
            style={{ textDecoration: 'none', position: 'relative', flex: 1 }}
          >
            {({ isActive }) => (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: '6px 0',
                  color: isActive ? 'var(--signal)' : 'var(--ink-faint)',
                }}
              >
                {item.icon}
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {item.title}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )

  if (typeof document === 'undefined') return sidebar
  return createPortal(sidebar, document.body)
}
