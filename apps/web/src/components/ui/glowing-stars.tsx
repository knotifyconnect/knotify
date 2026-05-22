import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function GlowingStarsBackgroundCard({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(124,92,252,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(20,184,166,0.12),transparent_45%)]" />
      <div className="relative">{children}</div>
    </div>
  )
}

export function GlowingStarsTitle({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <h3 className={cn('text-lg font-semibold text-text-primary mb-2', className)}>{children}</h3>
}

export function GlowingStarsDescription({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <p className={cn('text-sm text-text-secondary', className)}>{children}</p>
}
