import { cn } from '@/lib/utils'

type BackgroundBeamsProps = {
  className?: string
}

export function BackgroundBeams({ className }: BackgroundBeamsProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute -top-24 left-1/4 h-72 w-[1px] bg-gradient-to-b from-transparent via-brand-500/40 to-transparent" />
      <div className="absolute -top-32 left-1/2 h-80 w-[1px] bg-gradient-to-b from-transparent via-accent-teal/30 to-transparent" />
      <div className="absolute -top-20 right-1/3 h-64 w-[1px] bg-gradient-to-b from-transparent via-brand-300/30 to-transparent" />
    </div>
  )
}
