import { useEffect, useState } from 'react'
import { T } from '../../lib/desk'
import { useTour } from './TourProvider'

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8
const FIND_TIMEOUT_MS = 2000

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

export function TourOverlay() {
  const { isRunning, activeStep, activeIndex, totalSteps, next, skip } = useTour()
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!isRunning || !activeStep) {
      setRect(null)
      return
    }

    let cancelled = false
    let observer: MutationObserver | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function update() {
      const found = findTargetRect(activeStep!.target)
      if (!cancelled) setRect(found)
    }

    function waitForTarget() {
      const found = findTargetRect(activeStep!.target)
      if (found) {
        setRect(found)
        return
      }
      observer = new MutationObserver(() => {
        const foundNow = findTargetRect(activeStep!.target)
        if (foundNow) {
          setRect(foundNow)
          observer?.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      timeoutId = setTimeout(() => observer?.disconnect(), FIND_TIMEOUT_MS)
    }

    waitForTarget()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      cancelled = true
      observer?.disconnect()
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isRunning, activeStep])

  if (!isRunning || !activeStep) return null

  const isNavigate = activeStep.kind === 'navigate'
  const tooltipTop = rect ? Math.min(rect.top + rect.height + 14, window.innerHeight - 220) : window.innerHeight / 2 - 90
  const tooltipLeft = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 336)) : Math.max(16, window.innerWidth / 2 - 160)
  const tooltipWidth = 320

  // Straight connecting line from the tooltip's top edge to the target's
  // center — makes it unambiguous which on-screen box the tooltip describes.
  const lineFrom = rect ? { x: tooltipLeft + tooltipWidth / 2, y: tooltipTop } : null
  const lineTo = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} onClick={skip}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={12} fill="black" />}
          </mask>
          <marker id="tour-arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={T.signal} />
          </marker>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(26,24,21,0.55)" mask="url(#tour-mask)" />
        {rect && lineFrom && lineTo && (
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
        {rect && (
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

      {rect && (
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
        <div style={{ fontSize: 11.5, color: T.inkFaint, marginBottom: 6 }}>
          Step {activeIndex + 1} of {totalSteps}
        </div>
        <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: T.ink, marginBottom: 8, letterSpacing: '-0.01em' }}>
          {activeStep.title}
        </div>
        <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 16px' }}>{activeStep.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button
            onClick={skip}
            style={{ background: 'none', border: 0, fontSize: 12.5, color: T.inkMuted, cursor: 'pointer', padding: '6px 4px' }}
          >
            Skip tour
          </button>
          {isNavigate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.display }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: T.signal, display: 'inline-block' }} />
              Waiting for you to click…
            </div>
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
  )
}
