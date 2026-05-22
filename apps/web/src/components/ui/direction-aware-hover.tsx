import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function DirectionAwareHover({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('group rounded-xl border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-border-default', className)}>{children}</div>
}
