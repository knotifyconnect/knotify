/**
 * knotify · App Sidebar, matches web-app.jsx design exactly
 * Active = ink (black) background, signal-soft icon, paper-soft text
 * Includes Quest banner + self profile card at bottom
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
import { NotificationsBell } from '@/components/NotificationsBell'
import { nextRankForScore, rankForScore } from '@/lib/knots'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/store/session'
import { apiGetCached } from '@/lib/api'
import { useReferralUnreadCount } from '@/hooks/useReferralUnreadCount'
import { useMessageUnreadCount } from '@/hooks/useMessageUnreadCount'
import { useConnectionCount } from '@/hooks/useConnectionCount'
import { runWhenIdle } from '@/lib/schedule'

type Me = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  is_hr: boolean
  is_admin: boolean
  credibility_score?: number | null
}

type NavItem = {
  title: string
  sub?: string
  href: string
  icon: React.ReactNode
  badge?: 'jobs' | 'messages' | 'connections'
  newBadge?: boolean
}

const NAV_TOUR_TARGET: Record<string, string> = {
  '/home': 'nav-home',
  '/map': 'nav-map',
  '/messages': 'nav-messages',
  '/jobs': 'nav-jobs',
  '/cafes': 'nav-cafes',
}

// Mobile bottom tab bar only has room for five items comfortably. Discover
// and Profile move to a small top bar instead (logo + search + avatar, the
// same shape as most mobile-first social apps) so Cafés — previously
// unreachable from mobile nav at all — gets a real slot at the bottom
// alongside the other core sections.
const MOBILE_TAB_ITEMS: Array<{ title: string; href: string; icon: React.ReactNode; badge?: NavItem['badge'] }> = [
  { title: 'Home',     href: '/home',     icon: <Home size={18} /> },
  { title: 'Knot',     href: '/map',      icon: <Network size={18} />, badge: 'connections' },
  { title: 'Jobs',     href: '/jobs',     icon: <BriefcaseBusiness size={18} />, badge: 'jobs' },
  { title: 'Messages', href: '/messages', icon: <MessageSquare size={18} />, badge: 'messages' },
  { title: 'Cafés',    href: '/cafes',    icon: <Coffee size={18} /> },
]

const MOBILE_PAGE_TITLES: Record<string, string> = {
  '/home': 'Home',
  '/map': 'Your Knot',
  '/discover': 'Discover',
  '/jobs': 'Jobs & Gigs',
  '/messages': 'Messages',
  '/cafes': 'Cafés',
  '/profile': 'Profile',
}

const BASE_ITEMS: NavItem[] = [
  { title: 'Home',         href: '/home',     icon: <Home              size={15} /> },
  { title: 'Your Knot',    href: '/map',      icon: <Network           size={15} />, badge: 'connections' },
  { title: 'Discover',     href: '/discover', icon: <Search            size={15} /> },
  { title: 'Jobs & Gigs',  href: '/jobs',     icon: <BriefcaseBusiness size={15} />, badge: 'jobs', newBadge: true },
  { title: 'Cafes',        sub: 'IRL',        href: '/cafes',          icon: <Coffee            size={15} /> },
  { title: 'Messages',     href: '/messages', icon: <MessageSquare     size={15} />, badge: 'messages' },
]

// Thin credibility ring around the avatar: progress toward the next knot rank.
function RankRing({ score, children }: { score: number; children: React.ReactNode }) {
  const rank = rankForScore(score)
  const next = nextRankForScore(score)
  const pct = next ? Math.min(1, Math.max(0.04, (score - rank.min) / (next.min - rank.min))) : 1
  const R = 19
  const C = 2 * Math.PI * R
  return (
    <div
      title={next ? `${rank.name} · ${next.min - score} to ${next.name}` : rank.name}
      style={{ position: 'relative', width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center' }}
    >
      <svg width={42} height={42} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={21} cy={21} r={R} fill="none" stroke="var(--rule)" strokeWidth={2} />
        <circle
          cx={21}
          cy={21}
          r={R}
          fill="none"
          stroke="var(--foil)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      {children}
    </div>
  )
}

export function AppSidebar() {
  const setToken = useSessionStore((s) => s.setToken)
  const referralUnreadCount = useReferralUnreadCount()
  const messageUnreadCount = useMessageUnreadCount()
  const connectionCount = useConnectionCount()
  const [me, setMe] = useState<Me | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const mobilePageTitle = MOBILE_PAGE_TITLES[location.pathname] ?? 'knotify'
  const isDiscoverPage = location.pathname === '/discover'

  useEffect(() => {
    return runWhenIdle(() => {
      apiGetCached<{ user: Me }>('/api/users/me', { ttlMs: 30_000 })
        .then((data) => setMe(data.user ?? null))
        .catch(() => setMe(null))
    })
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
        {/* Logo (mark + wordmark) + notifications bell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 4px 24px' }}>
          <button
            type="button"
            onClick={() => navigate('/home')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
            aria-label="Go to home"
          >
            <KnotifyLogoImg variant="wordmark" height={24} />
          </button>
          <NotificationsBell variant="sidebar" messageUnread={messageUnreadCount} referralUnread={referralUnreadCount} />
        </div>

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
                  data-tour={NAV_TOUR_TARGET[item.href]}
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
            <RankRing score={me.credibility_score ?? 0}>
              <KAvatar name={me.full_name} src={me.avatar_url} size={32} />
            </RankRing>
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {rankForScore(me.credibility_score ?? 0).name} · @{me.username}
              </div>
            </div>
            <ChevronRight size={11} color="var(--ink-muted)" />
          </div>
        )}

        {/* Settings + logout (subtle, below profile) */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-muted)',
            fontSize: 11.5,
            fontFamily: "'IBM Plex Sans', sans-serif",
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-deep)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <Settings size={12} />
          Settings
        </button>
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

      {/* Mobile notifications sit directly above the shared feedback action. */}
      <div className="md:hidden">
        <div className="k-mobile-attention-action">
          <NotificationsBell variant="floating" messageUnread={messageUnreadCount} referralUnread={referralUnreadCount} />
        </div>
      </div>

      {/* ── Mobile top bar: logo + Discover + Profile ─────────────── */}
      <div
        className="flex md:hidden"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          minHeight: 'var(--mobile-topbar-height)',
          background: 'rgba(244,239,230,0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '0.5px solid var(--rule-soft)',
          zIndex: 45,
          display: 'grid',
          gridTemplateColumns: '72px minmax(0, 1fr) 72px',
          alignItems: 'center',
          padding: 'env(safe-area-inset-top) 14px 0',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/home')}
          aria-label="Go to home"
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 4, margin: '0 0 0 -4px' }}
        >
          <KnotifyLogoImg variant="mark" height={22} />
        </button>
        <div aria-current="page" style={{ minWidth: 0, textAlign: 'center', fontSize: 12.5, lineHeight: 1.2, fontWeight: 600, color: 'var(--ink-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {mobilePageTitle}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
          <button
            type="button"
            aria-label={isDiscoverPage ? 'Focus people search' : 'Find people'}
            onClick={() => {
              if (isDiscoverPage) document.getElementById('discover-people-search')?.focus()
              else navigate('/discover')
            }}
            style={{ display: 'flex', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
          >
            <Search size={19} color={isDiscoverPage ? 'var(--signal)' : 'var(--ink-soft)'} />
          </button>
          <NavLink to="/profile" aria-label="Your profile" style={{ display: 'flex', textDecoration: 'none' }}>
            {me
              ? <KAvatar name={me.full_name} src={me.avatar_url} size={28} />
              : <div style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--rule)' }} />}
          </NavLink>
        </div>
      </div>

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
        {MOBILE_TAB_ITEMS.map((item) => {
          const count = item.badge ? badgeFor(item as NavItem) : 0
          return (
          <NavLink
            key={item.href + item.title}
            to={item.href}
            style={{ textDecoration: 'none', position: 'relative', flex: 1 }}
          >
            {({ isActive }) => (
              <div
                data-tour={NAV_TOUR_TARGET[item.href]}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '7px 0 6px',
                  color: isActive ? 'var(--signal)' : 'var(--ink-faint)',
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  {item.icon}
                  {count > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -5,
                        minWidth: 7,
                        height: 7,
                        borderRadius: 999,
                        background: 'var(--signal)',
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontWeight: isActive ? 500 : 400,
                    letterSpacing: 0,
                  }}
                >
                  {item.title}
                </span>
              </div>
            )}
          </NavLink>
          )
        })}
      </nav>
    </>
  )

  if (typeof document === 'undefined') return sidebar
  return createPortal(sidebar, document.body)
}
