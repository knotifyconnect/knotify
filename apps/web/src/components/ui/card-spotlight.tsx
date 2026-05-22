import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function CardSpotlight({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-border-subtle bg-bg-surface p-5', className)}>
      <div className="pointer-events-none absolute -inset-10 bg-[radial-gradient(circle_at_top_right,rgba(124,92,252,0.2),transparent_45%)]" />
      <div className="relative">{children}</div>
    </div>
  )
}
