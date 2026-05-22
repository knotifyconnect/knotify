import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

type DockItem = {
  title: string
  icon: ReactNode
  href: string
}

type FloatingDockProps = {
  items: DockItem[]
  desktopClassName?: string
  mobileClassName?: string
}

export function FloatingDock({ items, desktopClassName, mobileClassName }: FloatingDockProps) {
  const location = useLocation()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface/95 px-3 py-2 backdrop-blur-xl shadow-[0_10px_28px_rgba(36,47,85,0.14)]',
        desktopClassName,
        mobileClassName
      )}
    >
      {items.map((item) => {
        const active = location.pathname === item.href
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full border transition-colors',
              active
                ? 'border-brand-500/30 bg-brand-500/12 text-brand-500'
                : 'border-transparent text-text-secondary hover:border-border-default hover:bg-bg-hover hover:text-text-primary'
            )}
            title={item.title}
          >
            {item.icon}
          </Link>
        )
      })}
    </div>
  )
}
