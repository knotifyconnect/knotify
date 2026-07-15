import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { T } from '../../lib/desk'
import { useTour } from './TourProvider'
import { TOUR_DEMOS } from './demos'

type Rect = { top: number; left: number; width: number; height: number }
type Side = 'below' | 'above' | 'right' | 'left' | 'center'
type Layout = { left: number; top?: number; bottom?: number; maxHeight: number; side: Side; width: number }

const PAD = 8
const GAP = 14
const SIDE_MARGIN = 16
const TOP_MARGIN = 16
// A card shorter than this can still read fine — used as the bar for
// "does this side have enough room to avoid touching the target at all".
const MIN_COMFORTABLE_HEIGHT = 160
// Minimum width worth using for a beside-the-target placement; below this
// a squeezed side card reads worse than just stacking above/below instead.
const MIN_SIDE_WIDTH = 240
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

// Picks whichever side genuinely has room to avoid touching the target at
// all, trying beside it first on desktop (an explicit request — also means
// most steps never require scrolling a tall page), then below, then above.
// `cardHeight` is the tooltip's real measured height (see the ref in
// TourOverlay below), not a generic ceiling — sizing placement decisions off
// a worst-case constant is what caused a small target with plenty of open
// screen around it to still get covered: the old code reserved up to 420px
// of "do we have room" even for a two-line step that only needed 160px, so
// it wrongly concluded there wasn't room on the natural side and fell back
// to overlapping the target. Only once literally no side has comfortable
// room does this fall back to whichever side has the most (allowing the
// unavoidable overlap that implies), and even then everything stays clamped
// on-screen — never off the top, never under the mobile tab bar.
function computeLayout(rect: Rect | null, preferredWidth: number, cardHeight: number): Layout {
  const bottomSafe = bottomMargin()
  const ceiling = clamp(window.innerHeight - TOP_MARGIN - bottomSafe, 120, 420)
  const h = clamp(cardHeight, 120, ceiling)

  if (!rect) {
    const left = clamp(window.innerWidth / 2 - preferredWidth / 2, SIDE_MARGIN, window.innerWidth - preferredWidth - SIDE_MARGIN)
    return { left, top: clamp(window.innerHeight / 2 - h / 2, TOP_MARGIN, window.innerHeight - bottomSafe - h), maxHeight: ceiling, side: 'center', width: preferredWidth }
  }

  const spaceBelow = window.innerHeight - bottomSafe - (rect.top + rect.height + GAP)
  const spaceAbove = rect.top - GAP - TOP_MARGIN
  const spaceRight = window.innerWidth - (rect.left + rect.width + GAP) - SIDE_MARGIN
  const spaceLeft = rect.left - GAP - SIDE_MARGIN
  const centeredLeft = clamp(rect.left + rect.width / 2 - preferredWidth / 2, SIDE_MARGIN, window.innerWidth - preferredWidth - SIDE_MARGIN)

  if (!isNarrowViewport() && (spaceRight >= MIN_SIDE_WIDTH || spaceLeft >= MIN_SIDE_WIDTH)) {
    const onRight = spaceRight >= spaceLeft
    const sideWidth = clamp(onRight ? spaceRight : spaceLeft, MIN_SIDE_WIDTH, preferredWidth)
    const left = onRight ? rect.left + rect.width + GAP : rect.left - GAP - sideWidth
    const top = clamp(rect.top + rect.height / 2 - h / 2, TOP_MARGIN, window.innerHeight - bottomSafe - h)
    return { left, top, maxHeight: ceiling, side: onRight ? 'right' : 'left', width: sideWidth }
  }

  if (spaceBelow >= h) {
    return { left: centeredLeft, top: rect.top + rect.height + GAP, maxHeight: ceiling, side: 'below', width: preferredWidth }
  }
  if (spaceAbove >= h) {
    return { left: centeredLeft, bottom: window.innerHeight - rect.top + GAP, maxHeight: ceiling, side: 'above', width: preferredWidth }
  }
  // Neither side has comfortable room — last resort: whichever has more,
  // clamped on-screen even though that means overlapping the target a bit.
  if (spaceBelow >= spaceAbove) {
    const top = clamp(rect.top + rect.height + GAP, TOP_MARGIN, window.innerHeight - bottomSafe - h)
    return { left: centeredLeft, top, maxHeight: ceiling, side: 'below', width: preferredWidth }
  }
  const bottom = clamp(window.innerHeight - rect.top + GAP, bottomSafe, window.innerHeight - TOP_MARGIN - h)
  return { left: centeredLeft, bottom, maxHeight: ceiling, side: 'above', width: preferredWidth }
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

const DEFAULT_CARD_HEIGHT = 220

export function TourOverlay() {
  const { isRunning, activeStep, activeIndex, totalSteps, canGoBack, next, back, skip } = useTour()
  const navigate = useNavigate()
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardHeight, setCardHeight] = useState(DEFAULT_CARD_HEIGHT)
  const cardRef = useRef<HTMLDivElement>(null)
  const scrolledForRef = useRef<string | null>(null)

  // Position decisions need the card's real height, not a guess — a generic
  // worst-case estimate is what caused small steps to get placed as if they
  // needed far more room than they actually did (see computeLayout). Re-measures
  // after every render (no deps array is deliberate) and only updates state
  // when it actually changed, so this settles in 1-2 renders instead of looping.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && Math.abs(h - cardHeight) > 2) setCardHeight(h)
  })

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
    // Stale height from the previous (differently-sized) step would bias the
    // first placement guess for the new one — reset so it starts from the
    // shared estimate and re-measures fresh.
    setCardHeight(DEFAULT_CARD_HEIGHT)

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
  const preferredWidth = Math.min(320, window.innerWidth - SIDE_MARGIN * 2)
  const layout = computeLayout(rect, preferredWidth, cardHeight)

  // Straight connecting line from the tooltip's nearest edge to the target's
  // center — makes it unambiguous which on-screen box the tooltip describes,
  // regardless of which side the tooltip landed on. The "to" point is
  // clamped on-screen so a target much taller than the viewport (its true
  // center could be far below the fold) still gets a sensible-looking arrow
  // instead of one aimed at an off-canvas point.
  const tooltipEdgeY = layout.top != null ? layout.top : window.innerHeight - (layout.bottom ?? 0)
  const lineFrom = rect
    ? layout.side === 'right' || layout.side === 'left'
      ? { x: layout.side === 'right' ? layout.left : layout.left + layout.width, y: layout.top! + Math.min(layout.maxHeight, cardHeight) / 2 }
      : { x: layout.left + layout.width / 2, y: tooltipEdgeY }
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
        ref={cardRef}
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
          width: layout.width,
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
              You don't have any data here yet. Here's what it looks like once you're connected.
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
