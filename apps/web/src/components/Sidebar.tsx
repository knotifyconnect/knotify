import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/session'
import { apiGet } from '../lib/api'
import { useReferralUnreadCount } from '../hooks/useReferralUnreadCount'
import { useMessageUnreadCount } from '../hooks/useMessageUnreadCount'

const baseItems = [
  { to: '/map', label: 'Map', icon: 'M' },
  { to: '/messages', label: 'Messages', icon: 'C' },
  { to: '/discover', label: 'Discover', icon: 'S' },
  { to: '/jobs', label: 'Jobs', icon: 'J' },
  { to: '/profile', label: 'Profile', icon: 'P' },
]

export function Sidebar() {
  const setToken = useSessionStore((s) => s.setToken)
  const [isHr, setIsHr] = useState(false)
  const referralUnreadCount = useReferralUnreadCount()
  const messageUnreadCount = useMessageUnreadCount()

  useEffect(() => {
    apiGet<{ user: { is_hr: boolean } }>('/api/users/me')
      .then((data) => setIsHr(Boolean(data.user?.is_hr)))
      .catch(() => setIsHr(false))
  }, [])

  const items = useMemo(
    () => (isHr ? [...baseItems, { to: '/hr', label: 'HR', icon: 'H' }] : baseItems),
    [isHr]
  )

  async function logout() {
    await supabase.auth.signOut()
    setToken(null)
    window.location.href = '/'
  }

  return (
    <aside className="hidden md:flex h-screen sticky top-0 border-r border-border-subtle bg-bg-surface/90 backdrop-blur w-16 xl:w-[220px] flex-col p-3">
      <div className="h-10 w-10 rounded-md bg-brand-500 text-white grid place-items-center text-sm font-medium">N</div>
      <nav className="mt-5 flex-1 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150',
                isActive ? 'bg-bg-hover text-text-primary border border-border-default' : 'text-text-secondary hover:bg-bg-hover'
              )
            }
          >
            <span className="w-5 text-center font-mono text-text-mono">{item.icon}</span>
            <span className="hidden xl:block">{item.label}</span>
            {item.to === '/messages' && messageUnreadCount > 0 ? (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium bg-brand-500/20 text-brand-300 border border-brand-500/40">
                {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
              </span>
            ) : null}
            {item.to === '/jobs' && referralUnreadCount > 0 ? (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
                {referralUnreadCount > 99 ? '99+' : referralUnreadCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2">
        <div className="h-10 w-10 rounded-full bg-bg-hover border border-border-default" />
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <span className="font-mono text-text-mono w-5 text-center">O</span>
          <span className="hidden xl:block">Log out</span>
        </Button>
      </div>
    </aside>
  )
}
