import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { T } from '../../lib/desk'
import { useTour } from './TourProvider'
import { TOUR_DEMOS } from './demos'
import { TOUR_STEPS } from './steps'

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8
// Only the FIRST spotlight step on a freshly-loaded page (right after
// start() or a 'navigate' step's route change) genuinely needs to wait on a
// lazy route chunk + async data fetch. Every other step-to-step move stays
// on a page that's already fully rendered, so searching should resolve in a
// frame or two — treating those the same as a fresh page load was the "still
// feels slow" complaint, and also let already-mounted elements (the Map
// search box, stats bar, legend, the Messages list) get mistaken for
// missing/empty just because the check gave up too early right after a page
// transition while they were still finishing their first render.
const JUST_ARRIVED_TIMEOUT_MS = 3000
const SAME_PAGE_TIMEOUT_MS = 350

// Multiple elements can share a data-tour id (e.g. the desktop sidebar and
// the mobile tab bar both tag their "Messages" link) — only one is visible
// at a time, so pick the first with a real rect instead of just the first
// DOM match.
function findTargetRect(selector: string): Rect | null {
  const candidates = document.querySelectorAll(selector)
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 || r.height > 0) {
      return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
    }
  }
  return null
}

function rectsEqual(a: Rect | null, b: Rect | null) {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

export function TourOverlay() {
  const { isRunning, activeStep, activeIndex, totalSteps, canGoBack, next, back, skip } = useTour()
  const navigate = useNavigate()
  const [rect, setRect] = useState<Rect | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const autoSkippedRef = useRef(false)
  const rectRef = useRef<Rect | null>(null)

  useEffect(() => {
    setTimedOut(false)
    autoSkippedRef.current = false

    if (!isRunning || !activeStep) {
      setRect(null)
      rectRef.current = null
      return
    }

    let cancelled = false
    let rafId: number | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const prevStep = TOUR_STEPS[activeIndex - 1]
    const justArrivedOnPage = activeIndex === 0 || prevStep?.kind === 'navigate'
    const timeoutMs = justArrivedOnPage ? JUST_ARRIVED_TIMEOUT_MS : SAME_PAGE_TIMEOUT_MS

    // Poll every frame instead of only on resize/scroll/DOM-mutation: a lot
    // of target cards animate in with framer-motion (opacity/y offset), so a
    // rect captured the instant the element mounts is its pre-animation
    // position — a one-off resize/mutation listener misses that settling
    // motion entirely, which read as the spotlight "lagging" behind.
    function tick() {
      if (cancelled) return
      const found = findTargetRect(activeStep!.target)
      if (!rectsEqual(found, rectRef.current)) {
        rectRef.current = found
        setRect(found)
      }
      rafId = requestAnimationFrame(tick)
    }

    tick()
    timeoutId = setTimeout(() => {
      if (!cancelled && !rectRef.current) setTimedOut(true)
    }, timeoutMs)

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isRunning, activeStep, activeIndex])

  const demo = activeStep && TOUR_DEMOS[activeStep.id]
  const stuck = timedOut && !rect

  // A step with no illustration and nothing real to point at can't teach
  // anything — skip it rather than leave a dangling, arrow-less dialog.
  useEffect(() => {
    if (stuck && !demo && activeStep?.kind === 'spotlight' && !autoSkippedRef.current) {
      autoSkippedRef.current = true
      next()
    }
  }, [stuck, demo, activeStep, next])

  if (!isRunning || !activeStep) return null
  if (stuck && !demo && activeStep.kind === 'spotlight') return null

  const isNavigate = activeStep.kind === 'navigate'
  const showSpotlight = Boolean(rect)
  const tooltipTop = rect ? Math.min(rect.top + rect.height + 14, window.innerHeight - 220) : window.innerHeight / 2 - 90
  const tooltipLeft = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 336)) : Math.max(16, window.innerWidth / 2 - 160)
  const tooltipWidth = 320

  // Straight connecting line from the tooltip's top edge to the target's
  // center — makes it unambiguous which on-screen box the tooltip describes.
  const lineFrom = rect ? { x: tooltipLeft + tooltipWidth / 2, y: tooltipTop } : null
  const lineTo = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null

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
          <rect
            x={rect.left}
            y={rect.top}
            width={rect.width}
            height={rect.height}
            rx={12}
            fill="none"
            stroke={T.signal}
            strokeWidth={2}
          >
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
            left: rect.left,
            background: T.ink,
            color: T.paperSoft,
            fontFamily: T.text,
            fontSize: 11.5,
            fontWeight: 600,
            padding: '3px 9px',
            borderRadius: 999,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {activeStep.title}
        </div>
      )}

      <div
        role="dialog"
        aria-label={activeStep.title}
        style={{
          position: 'absolute',
          top: tooltipTop,
          left: tooltipLeft,
          width: tooltipWidth,
          maxWidth: 'calc(100vw - 32px)',
          background: T.paperSoft,
          border: `0.5px solid ${T.rule}`,
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 12px 32px rgba(26,24,21,0.22)',
          pointerEvents: 'auto',
          fontFamily: T.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, color: T.inkFaint }}>
            Step {activeIndex + 1} of {totalSteps}
          </div>
          <button
            onClick={skip}
            aria-label="Close tour"
            title="Close tour"
            style={{
              background: 'none', border: 0, cursor: 'pointer', padding: 2, lineHeight: 1,
              color: T.inkFaint, fontSize: 15, fontWeight: 600, marginTop: -4, marginRight: -4,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: T.ink, marginBottom: 8, letterSpacing: '-0.01em' }}>
          {activeStep.title}
        </div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 12px' }}>{activeStep.body}</p>
        {stuck && demo && (
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
            style={{ background: 'none', border: 0, fontSize: 12.5, color: T.inkMuted, cursor: 'pointer', padding: '6px 4px' }}
          >
            Skip for now
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canGoBack && (
              <button
                onClick={back}
                aria-label="Previous step"
                style={{
                  background: 'none', border: `0.5px solid ${T.rule}`, borderRadius: 999, width: 34, height: 34,
                  color: T.inkMuted, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ←
              </button>
            )}
            {isNavigate && !stuck ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.display }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: T.signal, display: 'inline-block' }} />
                Waiting for you to click…
              </div>
            ) : isNavigate && stuck ? (
              <button
                onClick={() => navigate(activeStep.toPath)}
                style={{ background: T.ink, color: T.paperSoft, border: 0, borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
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
                  padding: '9px 18px',
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
      </div>
    </div>
  )
}
