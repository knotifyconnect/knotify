import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { KnotifyMark } from '../lib/knotify'
import type { PeerLite, Suggestion } from './CompanionHero'
import { useIsMobile } from '../hooks/useIsMobile'

const CompanionHero = lazy(() => import('./CompanionHero').then((m) => ({ default: m.CompanionHero })))

const STORAGE_KEY_DESKTOP = 'knotify_companion_pos_desktop_v2'
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
// A touch naturally jitters a few pixels even on a plain tap — anything under
// this counts as "didn't drag" so the button still opens. Without this,
// mobile taps were frequently misread as micro-drags and silently did nothing.
const DRAG_THRESHOLD_PX = 8
// How far up a real drag has to travel before it counts as "pull up to open".
const PULL_OPEN_THRESHOLD_PX = 16
const TAB_BAR_HEIGHT = 'calc(64px + env(safe-area-inset-bottom))'

// A gentle bell-curve bump sitting centered on top of the mobile tab bar —
// previously a floating circle in the bottom-right corner, which sat right
// on top of the feedback bug-report button (same corner, nearly identical
// offsets) and the two intersected. Centering it on the bar as its own
// silhouette removes the collision entirely rather than just nudging pixels
// around, and reads as "part of the bar" instead of a stray floating chip.
function CompanionBump({ onOpen }: { onOpen: () => void }) {
  const [lift, setLift] = useState(0)
  const dragRef = useRef<{ startY: number; maxLift: number } | null>(null)

  return (
    <button
      type="button"
      aria-label="Open Knotify Companion"
      onPointerDown={(e) => {
        dragRef.current = { startY: e.clientY, maxLift: 0 }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const pulledUp = clamp(drag.startY - e.clientY, 0, 30)
        drag.maxLift = Math.max(drag.maxLift, pulledUp)
        setLift(pulledUp)
      }}
      onPointerUp={() => {
        const drag = dragRef.current
        dragRef.current = null
        setLift(0)
        if (drag && drag.maxLift < DRAG_THRESHOLD_PX) {
          onOpen() // plain tap
        } else if (drag && drag.maxLift >= PULL_OPEN_THRESHOLD_PX) {
          onOpen() // pulled up far enough
        }
      }}
      onPointerCancel={() => { dragRef.current = null; setLift(0) }}
      style={{
        position: 'fixed',
        bottom: TAB_BAR_HEIGHT,
        left: '50%',
        transform: `translate(-50%, ${-lift}px)`,
        transition: lift === 0 ? 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1)' : 'none',
        zIndex: 9992,
        width: 140,
        height: 42,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        touchAction: 'none',
      }}
    >
      <svg width="140" height="42" viewBox="0 0 140 42" style={{ display: 'block', filter: 'drop-shadow(0 -4px 14px rgba(26,24,21,0.18))' }}>
        <path d="M0,42 C22,42 32,2 70,2 C108,2 118,42 140,42 Z" fill="var(--ink)" />
      </svg>
      <span style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', display: 'flex' }}>
        <KnotifyMark size={20} color="var(--paper)" />
      </span>
    </button>
  )
}

export function GlobalCompanionWidget() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  // Draggable positioning is a desktop-only convenience (repositioning to
  // avoid overlapping content with a mouse is easy and low-risk). On mobile
  // it was the actual cause of the flakiness: touch drag-to-reposition and
  // tap-to-open share the same pointer events, so a real tap easily got
  // misread as a micro-drag and silently failed to open anything. Mobile now
  // gets one fixed, reliable spot, no dragging, above the bottom tab bar.
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 18, y: 180 }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_DESKTOP) || 'null') as { x: number; y: number } | null
      if (saved) return saved
    } catch { /* ignore */ }
    return { x: window.innerWidth - 74, y: window.innerHeight - 214 }
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
      {!open && isMobile && <CompanionBump onOpen={() => setOpen(true)} />}

      {!open && !isMobile && (
        <button
          type="button"
          aria-label="Open Knotify Companion"
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
        <div style={{ position: 'fixed', ...(isMobile ? { right: 10, bottom: 'max(74px, calc(62px + env(safe-area-inset-bottom)))', width: 'min(100vw - 20px, 430px)' } : { left: clamp(pos.x, 12, window.innerWidth - 442), top: clamp(pos.y - 10, 12, window.innerHeight - 560), width: 'min(430px, calc(100vw - 24px))' }), zIndex: 10002 }}>
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
