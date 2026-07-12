import { useEffect, useState } from 'react'
import { T } from '../../lib/desk'
import { useTour } from './TourProvider'

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8
const FIND_TIMEOUT_MS = 2000

function findTargetRect(selector: string): Rect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
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
      const next = findTargetRect(activeStep!.target)
      if (!cancelled) setRect(next)
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

  const tooltipTop = rect ? Math.min(rect.top + rect.height + 14, window.innerHeight - 220) : window.innerHeight / 2 - 90
  const tooltipLeft = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 336)) : Math.max(16, window.innerWidth / 2 - 160)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} onClick={skip}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={12} fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(26,24,21,0.55)" mask="url(#tour-mask)" />
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
          />
        )}
      </svg>

      <div
        role="dialog"
        aria-label={activeStep.title}
        style={{
          position: 'absolute',
          top: tooltipTop,
          left: tooltipLeft,
          width: 320,
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
        </div>
      </div>
    </div>
  )
}
