import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { useReferralUnreadCount } from '../hooks/useReferralUnreadCount'
import { useMessageUnreadCount } from '../hooks/useMessageUnreadCount'

const items = [
  { to: '/map', label: 'Your Knot' },
  { to: '/messages', label: 'Messages' },
  { to: '/discover', label: 'Discover' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/profile', label: 'Profile' },
]

export function MobileTabs() {
  const referralUnreadCount = useReferralUnreadCount()
  const messageUnreadCount = useMessageUnreadCount()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-elevated border-t border-border-subtle grid grid-cols-5 z-50">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn('text-[11px] py-3 text-center uppercase tracking-widest', isActive ? 'text-brand-300' : 'text-text-muted')
          }
        >
          <span className="relative inline-flex items-center justify-center">
            {item.label}
            {item.to === '/messages' && messageUnreadCount > 0 ? (
              <span className="absolute -top-2 -right-5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium bg-brand-500/20 text-brand-300 border border-brand-500/40">
                {messageUnreadCount > 9 ? '9+' : messageUnreadCount}
              </span>
            ) : null}
            {item.to === '/jobs' && referralUnreadCount > 0 ? (
              <span className="absolute -top-2 -right-5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-medium bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
                {referralUnreadCount > 9 ? '9+' : referralUnreadCount}
              </span>
            ) : null}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
