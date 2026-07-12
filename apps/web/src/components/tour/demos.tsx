import { motion } from 'framer-motion'
import { T } from '../../lib/desk'

// Illustrative mock-data previews shown by TourOverlay when a step's real
// target doesn't exist yet (a brand-new account has no connections, so
// several sections genuinely have nothing to spotlight). These render fake
// data on purpose — never touch real API state — and carry a "Preview" chip
// so nobody mistakes them for the genuine article.

function PreviewChip() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        background: T.paperDeep,
        color: T.inkMuted,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      Preview
    </div>
  )
}

function fadeUpItem(i: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: i * 0.12, duration: 0.35, ease: 'easeOut' as const },
  }
}

function AvatarDot({ color }: { color: string }) {
  return <div style={{ width: 26, height: 26, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

export function TodayMovesDemo() {
  const rows = [
    { name: 'Sophie N.', tag: 'Reply needed', color: T.signal },
    { name: 'Max E.', tag: 'Cooling off', color: T.ochre },
    { name: 'Jay G.', tag: 'Say hi', color: T.verd },
  ]
  return (
    <div>
      <PreviewChip />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            {...fadeUpItem(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, background: T.paperSoft, borderLeft: `3px solid ${r.color}` }}
          >
            <AvatarDot color={r.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.inkMuted }}>{r.tag}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function CoffeesBookedDemo() {
  return (
    <div>
      <PreviewChip />
      <motion.div
        {...fadeUpItem(0)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}`, borderLeft: `3px solid ${T.verd}` }}
      >
        <AvatarDot color={T.verd} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>Priya S.</div>
          <div style={{ fontSize: 11, color: T.inkMuted }}>Thu, 2:00pm · Cafe Reitschule</div>
        </div>
      </motion.div>
    </div>
  )
}

export function SideQuestsDemo() {
  const rows = [
    { title: 'Complete your profile', points: 10 },
    { title: 'Say hi to a connection', points: 5 },
  ]
  return (
    <div>
      <PreviewChip />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((q, i) => (
          <motion.div
            key={q.title}
            {...fadeUpItem(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}` }}
          >
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.ink }}>{q.title}</div>
            <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 14, color: T.ochre }}>+{q.points}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function KnotGraphDemo() {
  const nodes = [
    { x: 90, y: 30, color: T.verd },
    { x: 30, y: 80, color: T.ochre },
    { x: 150, y: 80, color: T.signal },
    { x: 90, y: 120, color: T.verd },
  ]
  const center = { x: 90, y: 78 }
  return (
    <div>
      <PreviewChip />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <svg width="180" height="150" viewBox="0 0 180 150">
          {nodes.map((n, i) => (
            <line key={`line-${i}`} x1={center.x} y1={center.y} x2={n.x} y2={n.y} stroke={T.rule} strokeWidth={1.5} />
          ))}
          <circle cx={center.x} cy={center.y} r={9} fill={T.ink} />
          {nodes.map((n, i) => (
            <motion.circle
              key={`node-${i}`}
              cx={n.x}
              cy={n.y}
              r={7}
              fill={n.color}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

export const TOUR_DEMOS: Record<string, () => React.ReactNode> = {
  'today-moves-queue': TodayMovesDemo,
  'coffees-booked': CoffeesBookedDemo,
  'side-quests': SideQuestsDemo,
  'knot-graph': KnotGraphDemo,
}
