import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { KnotifyMark } from '../lib/knotify'
import type { PeerLite, Suggestion } from './CompanionHero'

const CompanionHero = lazy(() => import('./CompanionHero').then((m) => ({ default: m.CompanionHero })))

const STORAGE_KEY = 'knotify_companion_pos_v1'
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function GlobalCompanionWidget() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 18, y: 180 }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as { x: number; y: number } | null
      if (saved) return saved
    } catch { /* ignore */ }
    return { x: window.innerWidth - 74, y: window.innerHeight - 214 }
  })
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const peers = useMemo(() => new Map<string, PeerLite>(), [])

  useEffect(() => {
    const keepInView = () => {
      setPos((p) => ({ x: clamp(p.x, 10, window.innerWidth - 58), y: clamp(p.y, 74, window.innerHeight - 154) }))
    }
    keepInView()
    window.addEventListener('resize', keepInView)
    return () => window.removeEventListener('resize', keepInView)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* ignore */ }
  }, [pos])

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
      {!open && (
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
            drag.moved = true
            setPos({ x: clamp(e.clientX - drag.dx, 10, window.innerWidth - 58), y: clamp(e.clientY - drag.dy, 74, window.innerHeight - 154) })
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
        <div style={{ position: 'fixed', right: 12, bottom: 'max(92px, calc(78px + env(safe-area-inset-bottom)))', zIndex: 10002, width: 'min(430px, calc(100vw - 24px))' }}>
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
