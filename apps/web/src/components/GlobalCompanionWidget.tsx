import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { KnotifyMark } from '../lib/knotify'
import type { PeerLite, Suggestion } from './CompanionHero'
import { useIsMobile } from '../hooks/useIsMobile'

const CompanionHero = lazy(() => import('./CompanionHero').then((m) => ({ default: m.CompanionHero })))

const STORAGE_KEY_DESKTOP = 'knotify_companion_pos_desktop_v2'
const STORAGE_KEY_MOBILE = 'knotify_companion_pos_mobile_v2'
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function GlobalCompanionWidget() {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const storageKey = isMobile ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 18, y: 180 }
    try {
      const saved = JSON.parse(localStorage.getItem(window.innerWidth <= 767 ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP) || 'null') as { x: number; y: number } | null
      if (saved) return saved
    } catch { /* ignore */ }
    return window.innerWidth <= 767
      ? { x: 16, y: window.innerHeight - 138 }
      : { x: window.innerWidth - 74, y: window.innerHeight - 214 }
  })
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const peers = useMemo(() => new Map<string, PeerLite>(), [])

  useEffect(() => {
    const keepInView = () => {
      setPos((p) => ({
        x: clamp(p.x, isMobile ? 10 : 12, window.innerWidth - (isMobile ? 52 : 58)),
        y: clamp(p.y, isMobile ? 88 : 74, window.innerHeight - (isMobile ? 82 : 154)),
      }))
    }
    keepInView()
    window.addEventListener('resize', keepInView)
    return () => window.removeEventListener('resize', keepInView)
  }, [isMobile])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(pos)) } catch { /* ignore */ }
  }, [pos, storageKey])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

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
            setPos({
              x: clamp(e.clientX - drag.dx, isMobile ? 10 : 12, window.innerWidth - (isMobile ? 52 : 58)),
              y: clamp(e.clientY - drag.dy, isMobile ? 88 : 74, window.innerHeight - (isMobile ? 82 : 154)),
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
            width: isMobile ? 40 : 48,
            height: isMobile ? 40 : 48,
            borderRadius: 999,
            border: '1px solid var(--rule)',
            background: 'var(--ink)',
            color: 'var(--paper)',
            boxShadow: isMobile ? '0 8px 20px rgba(26,24,21,0.18)' : '0 12px 30px rgba(26,24,21,0.22)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <KnotifyMark size={isMobile ? 20 : 24} color="var(--paper)" />
        </button>
      )}

      {open && (
        <div style={{ position: 'fixed', right: isMobile ? 10 : 12, bottom: isMobile ? 'max(74px, calc(62px + env(safe-area-inset-bottom)))' : 'max(92px, calc(78px + env(safe-area-inset-bottom)))', zIndex: 10002, width: isMobile ? 'min(100vw - 20px, 430px)' : 'min(430px, calc(100vw - 24px))' }}>
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
