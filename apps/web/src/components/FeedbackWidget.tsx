import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { Bug, Lightbulb, MessageCircle, X } from 'lucide-react'
import { apiPost } from '../lib/api'
import { KnotifyMark } from '../lib/knotify'
import { useIsMobile } from '../hooks/useIsMobile'

type FeedbackType = 'bug' | 'suggestion' | 'other'

const TYPES: { value: FeedbackType; label: string; icon: typeof Bug; hint: string }[] = [
  { value: 'bug', label: 'Bug', icon: Bug, hint: 'Something is broken or behaving oddly' },
  { value: 'suggestion', label: 'Idea', icon: Lightbulb, hint: 'Something we could add or improve' },
  { value: 'other', label: 'Other', icon: MessageCircle, hint: 'Anything else on your mind' },
]

export function FeedbackWidget() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // Reset to a clean slate whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setMessage(''); setType('bug'); setDone(false); setError('') }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function submit() {
    if (message.trim().length < 2) { setError('Add a little more detail.'); return }
    setSending(true)
    setError('')
    try {
      await apiPost('/api/feedback', { type, message: message.trim(), page: location.pathname })
      setDone(true)
      setTimeout(() => setOpen(false), 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  if (typeof document === 'undefined') return null

  // Bottom-left, clear of the mobile tab bar and the desktop sidebar.
  const buttonPos: React.CSSProperties = isMobile
    ? { left: 16, bottom: 'max(84px, calc(72px + env(safe-area-inset-bottom)))' }
    : { left: 236, bottom: 20 }

  const fab = (
    <button
      type="button"
      aria-label="Send feedback"
      onClick={() => setOpen(true)}
      style={{
        position: 'fixed',
        ...buttonPos,
        zIndex: 60,
        width: 46,
        height: 46,
        borderRadius: 999,
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
        boxShadow: '0 8px 24px rgba(35,31,28,0.16)',
        cursor: 'pointer',
        display: open ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <KnotifyMark size={24} color="var(--signal)" />
    </button>
  )

  const panel = open && (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210,
        background: 'rgba(26,24,21,0.42)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'flex-end',
        justifyContent: isMobile ? 'stretch' : 'flex-start',
        padding: isMobile ? 0 : 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 380,
          maxWidth: '100%',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: isMobile ? '20px 20px 0 0' : 18,
          padding: 20,
          marginLeft: isMobile ? 0 : 216,
          boxShadow: '0 24px 80px rgba(26,24,21,0.28)',
          fontFamily: "'IBM Plex Sans', sans-serif",
          paddingBottom: isMobile ? 'max(20px, env(safe-area-inset-bottom))' : 20,
        }}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Thank you 🙏
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>
              Your feedback helps shape knotify.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KnotifyMark size={18} color="var(--signal)" />
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Send feedback</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4, display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '0 0 14px' }}>
              You're a beta tester — tell us what's working and what isn't.
            </p>

            {/* Type chips */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {TYPES.map((t) => {
                const active = type === t.value
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 5,
                      padding: '11px 6px',
                      borderRadius: 12,
                      border: `1px solid ${active ? 'var(--signal)' : 'var(--rule)'}`,
                      background: active ? 'var(--signal-soft, rgba(216,68,43,0.08))' : 'transparent',
                      color: active ? 'var(--signal)' : 'var(--ink-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <Icon size={17} />
                    <span style={{ fontSize: 12, fontWeight: active ? 600 : 500 }}>{t.label}</span>
                  </button>
                )
              })}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder={TYPES.find((t) => t.value === type)?.hint}
              rows={4}
              autoFocus={!isMobile}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: 92,
                padding: '11px 12px',
                borderRadius: 10,
                border: '1px solid var(--rule)',
                background: 'var(--paper-soft)',
                fontSize: 14,
                color: 'var(--ink)',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />

            {error && <div style={{ fontSize: 12.5, color: 'var(--signal)', marginTop: 8 }}>{error}</div>}

            <button
              onClick={submit}
              disabled={sending}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--ink)',
                color: 'var(--paper)',
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send feedback'}
            </button>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(<>{fab}{panel}</>, document.body)
}
