import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function TracingBeam({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute left-2 top-0 bottom-0 w-px bg-gradient-to-b from-brand-500/10 via-brand-500/60 to-transparent" aria-hidden />
      <div className="pl-8">{children}</div>
    </div>
  )
}
