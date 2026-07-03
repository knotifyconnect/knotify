/**
 * knotify · desktop "desk" primitives
 * Faithful port of the Customer Journey design system shared components
 * (DeskHeader, SectionLabel, Chip, CredRing, CredRingDark, Toggle, EditCard,
 *  DeskPage shell with right rail). Used by stages 6-11.
 *
 * Colors come straight from the design tokens (tokens.css mirrors these).
 */
import type { CSSProperties, ReactNode } from 'react'

export const T = {
  paper: '#F4EFE6', paperDeep: '#EBE4D6', paperSoft: '#FAF6EE',
  ink: '#1A1815', inkSoft: '#3A352D', inkMuted: '#6B6358', inkFaint: '#A29A8C',
  rule: '#D9D1BF', ruleSoft: '#E5DCC8',
  signal: '#D8442B', signalDeep: '#A8331F', signalSoft: '#F4D7CD',
  verd: '#1F6B5E', verdSoft: '#C8DDD7',
  ochre: '#C8941F', ochreSoft: '#F0E0B5',
  plum: '#5C2A4F', plumSoft: '#E5D2DD',
  display: "'Fraunces', Georgia, serif",
  text: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
}

export type ChipColor = 'paper' | 'signal' | 'verd' | 'ochre' | 'plum'

// ── Page shell: main content + optional 320px right rail ─────────────────────
export function DeskPage({ children, rail, maxWidth = 1100 }: { children: ReactNode; rail?: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', width: '100%' }}>
      <div className="k-page-content" style={{ flex: 1, minWidth: 0, maxWidth: rail ? '100%' : maxWidth, margin: rail ? 0 : '0 auto' }}>
        {children}
      </div>
      {rail && (
        <aside
          className="hidden lg:flex k-rail"
          style={{ width: 320, flexShrink: 0, flexDirection: 'column', gap: 18, position: 'sticky', top: 16 }}
        >
          {rail}
        </aside>
      )}
    </div>
  )
}

// ── Header: uppercase kicker + italic serif title + right slot ───────────────
// Finished with a newspaper masthead rule: one strong ink line over a hairline.
export function DeskHeader({ kicker, title, right }: { kicker: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: T.inkMuted, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: T.text }}>{kicker}</div>
          <div style={{ fontFamily: T.display, fontSize: 'clamp(24px, 3vw, 30px)', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.05 }}>{title}</div>
        </div>
        {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
      </div>
      <div aria-hidden style={{ borderTop: `2px solid ${T.ink}`, marginBottom: 2 }} />
      <div aria-hidden style={{ borderTop: `0.5px solid ${T.rule}` }} />
    </div>
  )
}

// Editorial section label: small caps, then a hairline leader running to the
// right slot — the newspaper "section rule" instead of a floating caption.
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', fontWeight: 600, fontFamily: T.text, gap: 10 }}>
      <span style={{ flexShrink: 0 }}>{children}</span>
      <span aria-hidden style={{ flex: 1, minWidth: 12, height: 1, background: T.ruleSoft }} />
      {right && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{right}</span>}
    </div>
  )
}

export function Chip({ children, color = 'paper', active = false, onClick, style }: { children: ReactNode; color?: ChipColor; active?: boolean; onClick?: () => void; style?: CSSProperties }) {
  const map: Record<ChipColor, { bg: string; fg: string; bd: string }> = {
    paper: { bg: T.paperDeep, fg: T.inkSoft, bd: T.rule },
    signal: { bg: T.signalSoft, fg: T.signalDeep, bd: T.signal },
    verd: { bg: T.verdSoft, fg: T.verd, bd: T.verd },
    ochre: { bg: T.ochreSoft, fg: '#7A5A0F', bd: T.ochre },
    plum: { bg: T.plumSoft, fg: T.plum, bd: T.plum },
  }
  const c = active ? { bg: T.ink, fg: T.paperSoft, bd: T.ink } : map[color]
  return (
    <span
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999, background: c.bg, color: c.fg, border: `0.5px solid ${c.bd}`, fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap', fontFamily: T.text, cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      {children}
    </span>
  )
}

// ── Credibility ring (light, for profile) ───────────────────────────────────
export function CredRing({ score, max = 120, size = 56, label, sub }: { score: number; max?: number; size?: number; label?: string; sub?: string }) {
  const r = (size - 6) / 2, circ = 2 * Math.PI * r, pct = Math.min(score / max, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.rule} strokeWidth="3.5" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.verd} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: size * 0.32, fontWeight: 500 }}>{score}</div>
      </div>
      {(label || sub) && <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div><div style={{ fontSize: 11, color: T.inkMuted }}>{sub}</div></div>}
    </div>
  )
}

// ── Credibility ring (dark card variant, ochre) ─────────────────────────────
export function CredRingDark({ score, max = 120, size = 64, label, sub }: { score: number; max?: number; size?: number; label?: string; sub?: string }) {
  const r = (size - 7) / 2, circ = 2 * Math.PI * r, pct = Math.min(score / max, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3A352D" strokeWidth="4" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.ochre} strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: size * 0.34, fontWeight: 500, color: T.paperSoft }}>{score}</div>
      </div>
      {(label || sub) && <div><div style={{ fontSize: 13, fontWeight: 600, color: T.paperSoft }}>{label}</div><div style={{ fontSize: 11, color: T.inkFaint }}>{sub}</div></div>}
    </div>
  )
}

export function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 30, height: 18, borderRadius: 999, background: on ? T.verd : T.rule, position: 'relative', flexShrink: 0, transition: 'background .15s', cursor: onClick ? 'pointer' : undefined }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left .15s' }} />
    </div>
  )
}

export function EditCard({ title, sub, action, onAction, children }: { title: string; sub?: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <div style={{ padding: 18, borderRadius: 16, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8 }}>
        <div>
          <span style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, fontFamily: T.text }}>{title}</span>
          {sub && <span style={{ fontSize: 11, color: T.inkFaint, marginLeft: 8 }}>{sub}</span>}
        </div>
        {action && <button type="button" onClick={onAction} style={{ background: 'none', border: 'none', fontSize: 11.5, color: T.signal, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>{action}</button>}
      </div>
      {children}
    </div>
  )
}

// ── Rail card wrappers ───────────────────────────────────────────────────────
export function RailCard({ children, tone = 'soft', style }: { children: ReactNode; tone?: 'soft' | 'ink' | 'signal' | 'verd' | 'ochre'; style?: CSSProperties }) {
  const tones: Record<string, CSSProperties> = {
    soft: { background: T.paper, border: `0.5px solid ${T.rule}`, color: T.ink },
    ink: { background: T.ink, color: T.paperSoft },
    signal: { background: T.signal, color: '#fff' },
    verd: { background: T.verd, color: '#fff' },
    ochre: { background: T.ochreSoft, border: `0.5px solid ${T.ochre}`, color: '#6A4E12' },
  }
  return <div style={{ padding: 16, borderRadius: 14, ...tones[tone], ...style }}>{children}</div>
}

// Stable accent color from a string (for gradient fallbacks where no image exists)
export function accentFor(seed: string): ChipColor {
  const order: ChipColor[] = ['signal', 'verd', 'ochre', 'plum']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return order[h % order.length]
}

export function gradientFor(color: ChipColor): string {
  const deep: Record<ChipColor, string> = {
    signal: '#A8331F', verd: '#134840', ochre: '#9a6f10', plum: '#3d1c36', paper: T.inkSoft,
  }
  const base: Record<ChipColor, string> = {
    signal: T.signal, verd: T.verd, ochre: T.ochre, plum: T.plum, paper: T.inkMuted,
  }
  return `linear-gradient(135deg, ${base[color]} 0%, ${deep[color]} 100%)`
}
