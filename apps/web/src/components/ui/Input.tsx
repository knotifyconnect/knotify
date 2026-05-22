import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-2xl border border-border-default bg-bg-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted shadow-inner shadow-white/80 transition-all duration-200',
        'focus:outline-none focus:border-brand-500/70 focus:ring-4 focus:ring-brand-500/20'
      )}
      {...props}
    />
  )
}
