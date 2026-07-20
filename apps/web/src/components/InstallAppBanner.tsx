import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Share, X } from 'lucide-react'
import { KBtn } from '../lib/knotify'
import { useIsMobile } from '../hooks/useIsMobile'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { getConsent } from '../lib/analyticsConsent'

const DISMISSED_KEY = 'knotify:install-prompt-dismissed'

export function InstallAppBanner() {
  const isMobile = useIsMobile()
  const { isStandalone, isIOS, canPromptInstall, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Behind the cookie banner's own decision so a first-time visitor never
    // sees two stacked banners at once — this one only shows once that's
    // been resolved (accepted or declined either way).
    setDismissed(getConsent() === null || window.localStorage.getItem(DISMISSED_KEY) === '1')
  }, [])

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  if (typeof document === 'undefined' || dismissed || isStandalone || !isMobile) return null
  if (!isIOS && !canPromptInstall) return null

  async function handleInstallClick() {
    const outcome = await promptInstall()
    if (outcome !== 'unavailable') dismiss()
  }

  return createPortal(
    <div
      role="dialog"
      aria-label="Install knotify"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(80px, calc(72px + env(safe-area-inset-bottom)))',
        zIndex: 9994,
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 12px 36px rgba(35,31,28,0.18)',
        fontFamily: "'IBM Plex Sans', sans-serif",
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--signal-soft)', color: 'var(--signal)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Download size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 4px', fontWeight: 600 }}>
          Add knotify to your home screen
        </p>
        {isIOS ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Tap <Share size={12} style={{ verticalAlign: '-1px', display: 'inline' }} /> Share below, then "Add to Home Screen" — this also turns on notifications.
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Get the full-screen app experience and notifications, right from your browser — no app store needed.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <KBtn variant="ghost" size="sm" onClick={dismiss}>
            {isIOS ? 'Got it' : 'Not now'}
          </KBtn>
          {!isIOS && (
            <KBtn variant="signal" size="sm" onClick={() => void handleInstallClick()}>
              Install
            </KBtn>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, flexShrink: 0 }}
      >
        <X size={16} />
      </button>
    </div>,
    document.body
  )
}
