import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { KBtn } from '../lib/knotify'
import { useIsMobile } from '../hooks/useIsMobile'
import { getConsent, setConsent } from '../lib/analyticsConsent'

export function CookieConsentBanner() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(getConsent() === null)
  }, [])

  if (typeof document === 'undefined' || !visible) return null

  function choose(choice: 'granted' | 'denied') {
    setConsent(choice)
    if (choice === 'granted') {
      void import('../lib/analytics').then((m) => m.initAnalytics()).catch(() => {})
    }
    setVisible(false)
  }

  return createPortal(
    <div
      role="dialog"
      aria-label="Cookie preferences"
      style={{
        position: 'fixed',
        left: isMobile ? 12 : 'auto',
        right: isMobile ? 12 : 20,
        bottom: isMobile ? 'max(80px, calc(72px + env(safe-area-inset-bottom)))' : 20,
        width: isMobile ? 'auto' : 380,
        maxWidth: '100%',
        zIndex: 9995,
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
        borderRadius: 16,
        padding: 18,
        boxShadow: '0 12px 36px rgba(35,31,28,0.18)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 6px', fontWeight: 600 }}>
        We use cookies to improve knotify
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Beyond the essentials needed to keep you signed in, we'd like to use analytics cookies to see
        which pages and features are useful, so we can improve the beta. Read our{' '}
        <button
          onClick={() => navigate('/privacy')}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--signal)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
        >
          privacy policy
        </button>
        .
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <KBtn variant="ghost" size="sm" onClick={() => choose('denied')} style={{ flex: 1 }}>
          Decline
        </KBtn>
        <KBtn variant="signal" size="sm" onClick={() => choose('granted')} style={{ flex: 1 }}>
          Accept
        </KBtn>
      </div>
    </div>,
    document.body
  )
}
