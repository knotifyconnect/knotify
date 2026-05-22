import { cn } from '@/lib/utils'

type SpotlightProps = {
  className?: string
  fill?: string
}

export function Spotlight({ className, fill = '#7c5cfc' }: SpotlightProps) {
  return (
    <div
      className={cn('pointer-events-none absolute h-[60vh] w-[60vw] rounded-full blur-3xl opacity-40 animate-spotlight', className)}
      style={{ background: `radial-gradient(circle at center, ${fill} 0%, transparent 70%)` }}
      aria-hidden
    />
  )
}
