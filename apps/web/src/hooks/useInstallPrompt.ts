import { useCallback, useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari never adopted the display-mode media query for this — it
    // has always exposed it as navigator.standalone instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  )
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports its UA as a plain Mac — multi-touch is the standard
  // way to tell an iPad apart from an actual Mac from the UA alone.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// Android/Chrome/Edge fire beforeinstallprompt once their own engagement
// heuristics are met — there's no way to force it, only capture and defer
// it so it can be triggered from our own "Install" button instead of
// whatever moment the browser would have shown it natively. iOS never
// fires this at all; there is no programmatic install API there, only the
// manual Share -> Add to Home Screen path (isIOS tells callers to show
// those instructions instead of a button).
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(detectStandalone)
  const [isIOS] = useState(detectIOS)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable'
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return choice.outcome
  }, [deferredPrompt])

  return {
    isStandalone,
    isIOS,
    canPromptInstall: Boolean(deferredPrompt),
    promptInstall,
  }
}
