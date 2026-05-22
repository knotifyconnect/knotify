/**
 * knotify · Button component
 */
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'default' | 'outline' | 'destructive'
type Size = 'sm' | 'md' | 'lg' | 'default'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary:
    'rounded-[10px] bg-signal text-white border-none shadow-sm transition-all duration-150 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-signal/30 disabled:opacity-50 disabled:cursor-not-allowed',
  default:
    'rounded-[10px] bg-signal text-white border-none shadow-sm transition-all duration-150 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-signal/30 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'rounded-[10px] border border-rule bg-white text-ink transition-all duration-150 hover:bg-paper-soft hover:border-rule',
  outline:
    'rounded-[10px] border border-rule bg-white text-ink transition-all duration-150 hover:bg-paper-soft',
  ghost:
    'rounded-[10px] bg-transparent text-ink-muted transition-colors duration-150 hover:bg-paper-soft hover:text-ink',
  danger:
    'rounded-[10px] border border-signal/35 bg-signal-soft text-signal-deep transition-all duration-150 hover:bg-signal hover:text-white',
  destructive:
    'rounded-[10px] border border-signal/35 bg-signal-soft text-signal-deep transition-all duration-150 hover:bg-signal hover:text-white',
}

const sizeClasses: Record<Size, string> = {
  sm:      'px-3 py-1.5 text-[12.5px] font-medium',
  md:      'px-4 py-2 text-[13.5px] font-medium',
  lg:      'px-5 py-2.5 text-[15px] font-medium',
  default: 'px-4 py-2 text-[13.5px] font-medium',
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: Props) {
  return (
    <button
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      className={cn(variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  )
}
