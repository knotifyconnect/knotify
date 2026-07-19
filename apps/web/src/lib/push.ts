import { apiDelete, apiGet, apiPost } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function registerServiceWorker(): Promise<void> {
  if (!isPushSupported()) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch (error) {
    console.error('Service worker registration failed', error)
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  const { key } = await apiGet<{ key: string }>('/api/push/vapid-public-key')

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  })

  await apiPost('/api/push/subscribe', subscription.toJSON())
  return true
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await apiDelete(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`)
}

export async function getPushSubscriptionState(): Promise<'unsupported' | 'default' | 'denied' | 'granted-subscribed' | 'granted-unsubscribed'> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'default') return 'default'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription ? 'granted-subscribed' : 'granted-unsubscribed'
}

const AUTO_PROMPT_KEY = 'knotify:push-auto-prompted'

// Requests push permission automatically once per browser, right after login,
// instead of gating it behind a manual opt-in control. Guarded by localStorage
// so a user who dismisses the native browser prompt isn't re-asked every session.
export async function maybeAutoSubscribeToPush(): Promise<void> {
  if (!isPushSupported()) return
  if (window.localStorage.getItem(AUTO_PROMPT_KEY) === '1') return
  window.localStorage.setItem(AUTO_PROMPT_KEY, '1')

  if (Notification.permission !== 'default') return
  try {
    await subscribeToPush()
  } catch (error) {
    console.error('Auto push subscribe failed', error)
  }
}
