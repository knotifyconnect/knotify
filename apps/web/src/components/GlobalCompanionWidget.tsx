import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { KnotifyMark } from '../lib/knotify'
import type { PeerLite, Suggestion } from './CompanionHero'
import { useIsMobile } from '../hooks/useIsMobile'

const CompanionHero = lazy(() => import('./CompanionHero').then((m) => ({ default: m.CompanionHero })))

const STORAGE_KEY_DESKTOP = 'knotify_companion_pos_desktop_v2'
const STORAGE_KEY_MOBILE_Y = 'knotify_companion_pos_mobile_y_v1'
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
// A touch naturally jitters a few pixels even on a plain tap — anything under
// this counts as "didn't drag" so the button still opens. Without this,
// mobile taps were frequently misread as micro-drags and silently did nothing.
const DRAG_THRESHOLD_PX = 8
// Keep the tab clear of any top status/notch chrome and the bottom tab bar
// (~64px min-height + safe-area inset) with a comfortable margin either side.
const MOBILE_Y_TOP_MARGIN = 90
const MOBILE_Y_BOTTOM_MARGIN = 140
const clampMobileY = (y: number) => clamp(y, MOBILE_Y_TOP_MARGIN, Math.max(MOBILE_Y_TOP_MARGIN, window.innerHeight - MOBILE_Y_BOTTOM_MARGIN))

// A compact tab docked to the left edge of the screen — deliberately off the
// bottom tab bar entirely (an earlier version sat on top of the bar and
// collided with the feedback bug-report button in the same corner) and away
// from any other fixed UI, so there's nothing left for it to compete with.
// Draggable vertically only (pinned to the left edge, x never changes) using
// the same move-threshold-before-drag trick as the desktop button, so a plain
// tap still reliably opens it instead of being swallowed as a micro-drag.
function CompanionEdgeTab({ y, onOpen, onDragTo }: { y: number; onOpen: () => void; onDragTo: (y: number) => void }) {
  const dragRef = useRef<{ startY: number; originY: number; moved: boolean } | null>(null)

  return (
    <button
      type="button"
      aria-label="Open Knotify Companion"
      data-tour="companion-input"
      onPointerDown={(e) => {
        dragRef.current = { startY: e.clientY, originY: y, moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const delta = e.clientY - drag.startY
        if (!drag.moved) {
          if (Math.abs(delta) < DRAG_THRESHOLD_PX) return
          drag.moved = true
        }
        onDragTo(clampMobileY(drag.originY + delta))
      }}
      onPointerUp={() => {
        const moved = dragRef.current?.moved
        dragRef.current = null
        if (!moved) onOpen()
      }}
      style={{
        position: 'fixed',
        left: 0,
        top: y,
        zIndex: 9992,
        width: 34,
        height: 44,
        padding: 0,
        border: '1px solid var(--rule)',
        borderLeft: 'none',
        borderRadius: '0 14px 14px 0',
        background: 'var(--ink)',
        color: 'var(--paper)',
        boxShadow: '2px 4px 14px rgba(26,24,21,0.18)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <KnotifyMark size={17} color="var(--paper)" />
    </button>
  )
}

export function GlobalCompanionWidget() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  // Desktop can drag the button anywhere (x and y) to dodge content under the
  // mouse. Mobile deliberately stays pinned to the left edge and only moves
  // vertically — earlier free-drag on mobile shared pointer events with
  // tap-to-open and easily misread a real tap as a micro-drag; the fixed x
  // plus the same move-threshold-before-drag trick keeps taps reliable while
  // still letting people slide the tab out from behind content underneath it.
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 18, y: 180 }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_DESKTOP) || 'null') as { x: number; y: number } | null
      if (saved) return saved
    } catch { /* ignore */ }
    return { x: window.innerWidth - 74, y: window.innerHeight - 214 }
  })
  const [mobileY, setMobileY] = useState(() => {
    if (typeof window === 'undefined') return 180
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_MOBILE_Y))
      if (Number.isFinite(saved) && saved > 0) return saved
    } catch { /* ignore */ }
    return window.innerHeight / 2
  })
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const peers = useMemo(() => new Map<string, PeerLite>(), [])

  useEffect(() => {
    if (isMobile) return
    const keepInView = () => {
      setPos((p) => ({
        x: clamp(p.x, 12, window.innerWidth - 58),
        y: clamp(p.y, 74, window.innerHeight - 154),
      }))
    }
    keepInView()
    window.addEventListener('resize', keepInView)
    return () => window.removeEventListener('resize', keepInView)
  }, [isMobile])

  useEffect(() => {
    if (isMobile) return
    try { localStorage.setItem(STORAGE_KEY_DESKTOP, JSON.stringify(pos)) } catch { /* ignore */ }
  }, [pos, isMobile])

  useEffect(() => {
    if (!isMobile) return
    const keepInView = () => setMobileY((y) => clampMobileY(y))
    keepInView()
    window.addEventListener('resize', keepInView)
    return () => window.removeEventListener('resize', keepInView)
  }, [isMobile])

  useEffect(() => {
    if (!isMobile) return
    try { localStorage.setItem(STORAGE_KEY_MOBILE_Y, String(mobileY)) } catch { /* ignore */ }
  }, [mobileY, isMobile])

  function onSuggestion(s: Suggestion) {
    if (s.action === 'open_profile' && s.peerId) navigate(`/profile/${s.peerId}`)
    if (s.action === 'open_message' && s.peerId) navigate(`/messages?to=${s.peerId}${s.draft ? `&draft=${encodeURIComponent(s.draft)}` : ''}`)
    if (s.action === 'open_coffee' && s.peerId) navigate(`/messages?to=${s.peerId}&action=coffee`)
    if (s.action === 'open_quests') navigate('/quests')
    if (s.action === 'open_events') navigate('/events')
    setOpen(false)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {!open && isMobile && <CompanionEdgeTab y={mobileY} onOpen={() => setOpen(true)} onDragTo={setMobileY} />}

      {!open && !isMobile && (
        <button
          type="button"
          aria-label="Open Knotify Companion"
          data-tour="companion-input"
          onPointerDown={(e) => {
            dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current
            if (!drag) return
            const nextX = e.clientX - drag.dx
            const nextY = e.clientY - drag.dy
            if (!drag.moved) {
              const traveled = Math.hypot(nextX - pos.x, nextY - pos.y)
              if (traveled < DRAG_THRESHOLD_PX) return
              drag.moved = true
            }
            setPos({
              x: clamp(nextX, 12, window.innerWidth - 58),
              y: clamp(nextY, 74, window.innerHeight - 154),
            })
          }}
          onPointerUp={() => {
            const moved = dragRef.current?.moved
            dragRef.current = null
            if (!moved) setOpen(true)
          }}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 9992,
            width: 48,
            height: 48,
            borderRadius: 999,
            border: '1px solid var(--rule)',
            background: 'var(--ink)',
            color: 'var(--paper)',
            boxShadow: '0 12px 30px rgba(26,24,21,0.22)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <KnotifyMark size={24} color="var(--paper)" />
        </button>
      )}

      {open && (
        <div style={{ position: 'fixed', ...(isMobile ? { left: 10, bottom: 'max(74px, calc(62px + env(safe-area-inset-bottom)))', width: 'min(100vw - 20px, 430px)' } : { left: clamp(pos.x, 12, window.innerWidth - 442), top: clamp(pos.y - 10, 12, window.innerHeight - 560), width: 'min(430px, calc(100vw - 24px))' }), zIndex: 10002 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimize Companion" style={{ width: 34, height: 34, borderRadius: 999, border: '0.5px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 8px 22px rgba(26,24,21,0.12)' }}>
              <X size={16} />
            </button>
          </div>
          <Suspense fallback={<div style={{ padding: 14, borderRadius: 18, background: '#fff', boxShadow: 'var(--lift-1)', fontFamily: "'Fraunces', serif", fontSize: 13.5 }}>Opening Companion...</div>}>
            <CompanionHero peers={peers} onSuggestion={onSuggestion} />
          </Suspense>
        </div>
      )}
    </>,
    document.body
  )
}
