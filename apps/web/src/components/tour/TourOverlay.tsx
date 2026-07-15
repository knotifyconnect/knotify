import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { T } from '../../lib/desk'
import { useTour } from './TourProvider'
import { TOUR_DEMOS } from './demos'

type Rect = { top: number; left: number; width: number; height: number }
type Side = 'below' | 'above' | 'right' | 'left' | 'center'
type Layout = { left: number; top?: number; bottom?: number; maxHeight: number; side: Side }

const PAD = 8
const GAP = 14
const SIDE_MARGIN = 16
const TOP_MARGIN = 16
// Mobile has a fixed bottom tab bar (~64px + safe-area inset) the tooltip
// must never sit under — desktop has no such chrome, so it only needs a
// small breathing-room margin.
const isNarrowViewport = () => window.innerWidth < 768
const bottomMargin = () => (isNarrowViewport() ? 100 : 24)

// A clamp that degrades gracefully instead of throwing nonsense when min > max
// (happens on pathologically short viewports) — falls back to min rather than
// producing an inverted/negative range.
const clamp = (n: number, min: number, max: number) => (min > max ? min : Math.min(max, Math.max(min, n)))

// Multiple elements can share a data-tour id (e.g. the desktop sidebar and
// the mobile tab bar both tag their "Messages" link) — only one is visible
// at a time, so pick the first with a real box instead of just the first
// DOM match.
function findTargetEl(selector: string): Element | null {
  const candidates = document.querySelectorAll(selector)
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 || r.height > 0) return el
  }
  return null
}

function rectFromEl(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

function rectsEqual(a: Rect | null, b: Rect | null) {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

// Centers the tooltip under (or, if there isn't room, above) the target on
// mobile — never left-aligned to it, which on a narrow phone used to pin the
// tooltip to nearly the same spot regardless of where the target actually
// was. On desktop, prefers placing it beside the target (right, or left if
// that has more room) so most steps never require scrolling a tall page at
// all. `maxHeight` is always capped to the room genuinely available on
// whichever side got picked (with internal scroll as a last resort), and the
// final position is clamped so the card can never spill under the mobile tab
// bar or off the top of the screen — even for a target taller than the
// viewport itself, which used to force an impossible minimum height and push
// the card off-screen.
function computeLayout(rect: Rect | null, width: number): Layout {
  const bottomSafe = bottomMargin()
  const maxHeight = clamp(window.innerHeight - TOP_MARGIN - bottomSafe, 120, 420)

  if (!rect) {
    const left = clamp(window.innerWidth / 2 - width / 2, SIDE_MARGIN, window.innerWidth - width - SIDE_MARGIN)
    return { left, top: clamp(window.innerHeight / 2 - maxHeight / 2, TOP_MARGIN, window.innerHeight - bottomSafe - maxHeight), maxHeight, side: 'center' }
  }

  if (!isNarrowViewport()) {
    const spaceRight = window.innerWidth - (rect.left + rect.width + GAP) - SIDE_MARGIN
    const spaceLeft = rect.left - GAP - SIDE_MARGIN
    if (spaceRight >= width || spaceLeft >= width) {
      const onRight = spaceRight >= spaceLeft
      const left = onRight ? rect.left + rect.width + GAP : rect.left - GAP - width
      const top = clamp(rect.top + rect.height / 2 - maxHeight / 2, TOP_MARGIN, window.innerHeight - bottomSafe - maxHeight)
      return { left, top, maxHeight, side: onRight ? 'right' : 'left' }
    }
  }

  const left = clamp(rect.left + rect.width / 2 - width / 2, SIDE_MARGIN, window.innerWidth - width - SIDE_MARGIN)
  const spaceBelow = window.innerHeight - bottomSafe - (rect.top + rect.height + GAP)
  const spaceAbove = rect.top - GAP - TOP_MARGIN

  if (spaceBelow >= spaceAbove) {
    const top = clamp(rect.top + rect.height + GAP, TOP_MARGIN, window.innerHeight - bottomSafe - maxHeight)
    return { left, top, maxHeight, side: 'below' }
  }
  const bottom = clamp(window.innerHeight - rect.top + GAP, bottomSafe, window.innerHeight - TOP_MARGIN - maxHeight)
  return { left, bottom, maxHeight, side: 'above' }
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 1 ? (current / (total - 1)) * 100 : 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: T.ruleSoft, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: T.signal, transition: 'width 0.2s ease' }} />
      </div>
      <span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {current + 1} / {total}
      </span>
    </div>
  )
}

export function TourOverlay() {
  const { isRunning, activeStep, activeIndex, totalSteps, canGoBack, next, back, skip } = useTour()
  const navigate = useNavigate()
  const [rect, setRect] = useState<Rect | null>(null)
  const scrolledForRef = useRef<string | null>(null)

  // No timers, no "give up and skip" logic: every frame we check reality and
  // render whatever's actually true right now. Found -> real spotlight,
  // tracked continuously since target cards can still be settling into
  // place from a framer-motion entrance. Not found -> the tooltip renders
  // the step's illustration (or, if it has none, just its text) with zero
  // wait — nothing here can time out or silently skip a step.
  useLayoutEffect(() => {
    if (!isRunning || !activeStep) {
      setRect(null)
      return
    }

    let cancelled = false
    let rafId: number | null = null

    function tick() {
      if (cancelled) return
      const el = findTargetEl(activeStep!.target)
      const found = el ? rectFromEl(el) : null
      setRect((prev) => (rectsEqual(prev, found) ? prev : found))

      // Bring a freshly-found target into view once per step — critical on
      // mobile where most of a long page starts out of frame, so a spotlight
      // on something below the fold used to just point at nothing visible.
      // A target taller than the viewport (a big list/grid) gets scrolled to
      // its start instead of centered, so its heading lands near the top
      // instead of the tooltip needing a second manual scroll to find it.
      if (el && scrolledForRef.current !== activeStep!.id) {
        scrolledForRef.current = activeStep!.id
        const r = el.getBoundingClientRect()
        const clearTop = 60
        const clearBottom = window.innerHeight - bottomMargin()
        if (r.top < clearTop || r.bottom > clearBottom) {
          const tall = r.height > window.innerHeight * 0.6
          el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center', inline: 'nearest' })
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    tick()

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [isRunning, activeStep])

  if (!isRunning || !activeStep) return null

  const demo = TOUR_DEMOS[activeStep.id]
  const isNavigate = activeStep.kind === 'navigate'
  const showSpotlight = Boolean(rect)
  const tooltipWidth = Math.min(320, window.innerWidth - SIDE_MARGIN * 2)
  const layout = computeLayout(rect, tooltipWidth)

  // Straight connecting line from the tooltip's nearest edge to the target's
  // center — makes it unambiguous which on-screen box the tooltip describes,
  // regardless of which side the tooltip landed on. The "to" point is
  // clamped on-screen so a target much taller than the viewport (its true
  // center could be far below the fold) still gets a sensible-looking arrow
  // instead of one aimed at an off-canvas point.
  const tooltipEdgeY = layout.top != null ? layout.top : window.innerHeight - (layout.bottom ?? 0)
  const lineFrom = rect
    ? layout.side === 'right' || layout.side === 'left'
      ? { x: layout.side === 'right' ? layout.left : layout.left + tooltipWidth, y: layout.top! + Math.min(layout.maxHeight, 200) / 2 }
      : { x: layout.left + tooltipWidth / 2, y: tooltipEdgeY }
    : null
  const lineTo = rect ? { x: clamp(rect.left + rect.width / 2, 0, window.innerWidth), y: clamp(rect.top + rect.height / 2, 0, window.innerHeight) } : null
  const pillLeft = rect ? clamp(rect.left, SIDE_MARGIN, window.innerWidth - SIDE_MARGIN - 20) : 0

  return (
    // No click-to-dismiss anywhere on the backdrop: this whole layer is
    // pointer-events:none so clicks pass straight through to the real page
    // underneath (critical for 'navigate' steps — the user has to be able
    // to actually click the spotlighted sidebar link). Only the tooltip
    // card itself opts back into pointer-events for its own buttons.
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={12} fill="black" />
            )}
          </mask>
          <marker id="tour-arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={T.signal} />
          </marker>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(26,24,21,0.55)" mask="url(#tour-mask)" />
        {showSpotlight && lineFrom && lineTo && (
          <line
            x1={lineFrom.x}
            y1={lineFrom.y}
            x2={lineTo.x}
            y2={lineTo.y}
            stroke={T.signal}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            markerEnd="url(#tour-arrowhead)"
            opacity={0.75}
          />
        )}
        {showSpotlight && rect && (
          <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={12} fill="none" stroke={T.signal} strokeWidth={2}>
            <animate attributeName="stroke-opacity" values="1;0.45;1" dur="1.8s" repeatCount="indefinite" />
          </rect>
        )}
      </svg>

      {showSpotlight && rect && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: Math.max(4, rect.top - 26),
            left: pillLeft,
            maxWidth: window.innerWidth - pillLeft - SIDE_MARGIN,
            background: T.ink,
            color: T.paperSoft,
            fontFamily: T.text,
            fontSize: 11.5,
            fontWeight: 600,
            padding: '3px 9px',
            borderRadius: 999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {activeStep.title}
        </div>
      )}

      <motion.div
        key={activeStep.id}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        role="dialog"
        aria-label={activeStep.title}
        style={{
          position: 'absolute',
          left: layout.left,
          top: layout.top,
          bottom: layout.bottom,
          width: tooltipWidth,
          maxHeight: layout.maxHeight,
          overflowY: 'auto',
          background: T.paperSoft,
          border: `0.5px solid ${T.rule}`,
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 12px 32px rgba(26,24,21,0.22)',
          pointerEvents: 'auto',
          fontFamily: T.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <ProgressBar current={activeIndex} total={totalSteps} />
          </div>
          <button
            onClick={skip}
            aria-label="Close tour"
            title="Close tour"
            style={{
              background: 'none', border: 0, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0,
              color: T.inkFaint, fontSize: 15, fontWeight: 600, marginTop: -8, marginRight: -6,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: T.ink, marginBottom: 8, letterSpacing: '-0.01em' }}>
          {activeStep.title}
        </div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 12px' }}>{activeStep.body}</p>
        {!rect && demo && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: T.inkFaint, fontStyle: 'italic', margin: '0 0 8px' }}>
              You don't have any data here yet — here's what it looks like once you're connected.
            </p>
            {demo()}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button
            onClick={skip}
            style={{ background: 'none', border: 0, fontSize: 13, color: T.inkMuted, cursor: 'pointer', padding: '10px 6px', minHeight: 40 }}
          >
            Skip for now
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canGoBack && (
              <button
                onClick={back}
                aria-label="Previous step"
                style={{
                  background: 'none', border: `0.5px solid ${T.rule}`, borderRadius: 999, width: 40, height: 40,
                  color: T.inkMuted, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                ←
              </button>
            )}
            {isNavigate && rect ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.display, padding: '10px 4px' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: T.signal, display: 'inline-block', flexShrink: 0 }} />
                Waiting for you to click…
              </div>
            ) : isNavigate && !rect ? (
              <button
                onClick={() => navigate(activeStep.toPath)}
                style={{ background: T.ink, color: T.paperSoft, border: 0, borderRadius: 999, padding: '11px 20px', minHeight: 40, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                Open it for me
              </button>
            ) : (
              <button
                onClick={next}
                style={{
                  background: T.ink,
                  color: T.paperSoft,
                  border: 0,
                  borderRadius: 999,
                  padding: '11px 20px',
                  minHeight: 40,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {activeIndex + 1 === totalSteps ? 'Done' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
