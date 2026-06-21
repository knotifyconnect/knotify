/**
 * knotify design system — React components
 * Trefoil mark, wordmark, shared primitives
 */
import type { ReactNode, CSSProperties } from 'react'

// ─── KnotifyMark (trefoil knot SVG) ─────────────────────────────────────────
export function KnotifyMark({
  size = 24,
  color = 'currentColor',
  className = '',
}: {
  size?: number
  color?: string
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4 C 22 4, 26 8, 26 14 C 26 20, 22 24, 16 24 C 10 24, 6 20, 6 14
           M 16 4 C 12 8, 12 14, 16 18 C 20 22, 26 22, 28 18
           M 6 14 C 10 14, 14 18, 14 22"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── KnotifyWordmark ─────────────────────────────────────────────────────────
export function KnotifyWordmark({
  size = 20,
  color = 'var(--ink)',
  className = '',
}: {
  size?: number
  color?: string
  className?: string
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontStyle: 'italic',
        fontSize: size,
        fontWeight: 400,
        letterSpacing: '-0.03em',
        color,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      knotify
    </span>
  )
}

// ─── KnotifyLogo (mark + wordmark inline) ───────────────────────────────────
export function KnotifyLogo({
  size = 20,
  markColor = 'var(--signal)',
  textColor = 'var(--ink)',
  gap = 8,
  className = '',
}: {
  size?: number
  markColor?: string
  textColor?: string
  gap?: number
  className?: string
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap, lineHeight: 1 }}
    >
      <KnotifyMark size={size} color={markColor} />
      <KnotifyWordmark size={size} color={textColor} />
    </span>
  )
}

// ─── KnotifyLogoImg (official raster logo) ──────────────────────────────────
// The brand logo is a raster lockup (red knot mark + "knotify." wordmark).
// variant: 'wordmark' = mark + wordmark, 'full' = adds the tagline, 'mark' = mark only.
export function KnotifyLogoImg({
  variant = 'wordmark',
  height = 26,
  className = '',
  style,
}: {
  variant?: 'wordmark' | 'full' | 'mark'
  height?: number
  className?: string
  style?: CSSProperties
}) {
  const src =
    variant === 'full' ? '/logo-full.png' : variant === 'mark' ? '/mark.png' : '/logo.png'
  return (
    <img
      src={src}
      alt="knotify — networks worth keeping"
      className={className}
      style={{ height, width: 'auto', display: 'block', ...style }}
    />
  )
}

// ─── VerifiedBadge ───────────────────────────────────────────────────────────
export function VerifiedBadge({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Verified"
    >
      <path
        d="M8 1.5L9.5 3H11.5V5L13 6.5L11.5 8L13 9.5L11.5 11V13H9.5L8 14.5L6.5 13H4.5V11L3 9.5L4.5 8L3 6.5L4.5 5V3H6.5L8 1.5Z"
        fill="var(--verd)"
        stroke="none"
      />
      <path
        d="M5.5 8L7 9.5L10.5 6"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── KPill — small label tag ─────────────────────────────────────────────────
type PillColor = 'signal' | 'verd' | 'ochre' | 'plum' | 'ink' | 'default'

const PILL_STYLES: Record<PillColor, { bg: string; color: string; border: string }> = {
  signal:  { bg: 'var(--signal-soft)', color: 'var(--signal)',  border: 'rgba(216,68,43,0.20)' },
  verd:    { bg: 'var(--verd-soft)',   color: 'var(--verd)',    border: 'rgba(31,107,94,0.20)' },
  ochre:   { bg: 'var(--ochre-soft)',  color: 'var(--ochre)',   border: 'rgba(200,148,31,0.22)' },
  plum:    { bg: 'var(--plum-soft)',   color: 'var(--plum)',    border: 'rgba(92,42,79,0.22)' },
  ink:     { bg: 'var(--ink)',         color: 'var(--paper)',   border: 'transparent' },
  default: { bg: 'var(--paper-soft)', color: 'var(--ink-muted)', border: 'var(--rule)' },
}

export function KPill({
  color = 'default',
  children,
  className = '',
}: {
  color?: PillColor
  children: ReactNode
  className?: string
}) {
  const s = PILL_STYLES[color]
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        border: `0.5px solid ${s.border}`,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: '18px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ─── KBtn — primary button ───────────────────────────────────────────────────
type BtnVariant = 'signal' | 'ghost' | 'ink' | 'verd' | 'plain' | 'ochre' | 'plum'
type BtnSize = 'sm' | 'md' | 'lg'

const BTN_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.14s ease',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
}

const BTN_VARIANTS: Record<BtnVariant, CSSProperties> = {
  signal: { background: 'var(--signal)', color: '#fff', border: 'none' },
  ghost:  { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--rule)' },
  ink:    { background: 'var(--ink)', color: 'var(--paper)', border: 'none' },
  verd:   { background: 'var(--verd)', color: '#fff', border: 'none' },
  plain:  { background: 'transparent', color: 'var(--ink-muted)', border: 'none' },
  ochre:  { background: 'var(--ochre)', color: '#fff', border: 'none' },
  plum:   { background: 'var(--plum)', color: '#fff', border: 'none' },
}

const BTN_SIZES: Record<BtnSize, CSSProperties> = {
  sm: { fontSize: 12.5, padding: '6px 14px', borderRadius: 8 },
  md: { fontSize: 13.5, padding: '9px 18px', borderRadius: 10 },
  lg: { fontSize: 15,   padding: '12px 24px', borderRadius: 12 },
}

export function KBtn({
  variant = 'signal',
  size = 'md',
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  type = 'button',
  disabled,
  fullWidth,
  className = '',
  style,
}: {
  variant?: BtnVariant
  size?: BtnSize
  children: ReactNode
  onClick?: React.MouseEventHandler<HTMLButtonElement> | (() => void)
  onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>
  onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  fullWidth?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <button
      type={type}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disabled={disabled}
      className={className}
      style={{
        ...BTN_BASE,
        ...BTN_VARIANTS[variant],
        ...BTN_SIZES[size],
        width: fullWidth ? '100%' : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── KCard ───────────────────────────────────────────────────────────────────
export function KCard({
  children,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: 'white',
        border: '0.5px solid var(--rule)',
        borderRadius: 16,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─── KAvatar ─────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: '#E8E0D5', text: '#5C4A36' },
  { bg: '#F5E6D3', text: '#8B4513' },
  { bg: '#E0EAE8', text: '#1F6B5E' },
  { bg: '#F0E8F0', text: '#5C2A4F' },
  { bg: '#FAECD8', text: '#C8941F' },
  { bg: '#F5E8E6', text: '#D8442B' },
  { bg: '#E6EBF5', text: '#2B4ABA' },
  { bg: '#E8F0E8', text: '#2A6B2A' },
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

export function KAvatar({
  name,
  src,
  size = 40,
  className = '',
  style: extraStyle,
}: {
  name?: string | null
  src?: string | null
  size?: number
  className?: string
  style?: CSSProperties
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...extraStyle }}
      />
    )
  }
  const label = name?.charAt(0)?.toUpperCase() ?? '?'
  const palette = AVATAR_COLORS[hashName(name ?? '?') % AVATAR_COLORS.length]
  return (
    <div
      className={className}
      aria-label={name ?? undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: palette.bg,
        color: palette.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontFamily: "'Fraunces', Georgia, serif",
        fontStyle: 'italic',
        fontWeight: 500,
        flexShrink: 0,
        userSelect: 'none',
        ...extraStyle,
      }}
    >
      {label}
    </div>
  )
}
