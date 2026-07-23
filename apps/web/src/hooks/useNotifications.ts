import { useSyncExternalStore } from 'react'
import { apiGet, invalidateApiCache } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/session'
import { useToastStore } from '../store/toasts'

type NotificationUnreadResponse = {
  count: number
}

type NotificationRow = {
  id: string
  type: 'connection_request' | 'connection_accepted' | 'message' | 'event_rsvp' | 'job_referral_request' | 'ask_reply' | 'ask_created' | 'ask_activity'
  title: string
  body: string | null
  read_at: string | null
}

const NOTIFICATIONS_UNREAD_PATH = '/api/notifications/unread-count'
// Realtime is the primary path. While it is healthy, this is only a low-rate
// consistency check. If the channel reports a fault, temporarily restore the
// previous 30-second repair cadence until it reconnects.
const REALTIME_HEALTHY_RECONCILE_MS = 5 * 60_000
const REALTIME_DEGRADED_RECONCILE_MS = 30_000

const listeners = new Set<() => void>()
let snapshot = 0
let started = false
let authToken: string | null = null
let unsubscribeSession: (() => void) | null = null
let channel: ReturnType<typeof supabase.channel> | null = null
let pollInterval: number | null = null
let refreshTimer: number | null = null
let refreshInFlight = false
let refreshQueued = false
let realtimeHealthy = false

function canUseBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function emit() {
  for (const listener of listeners) listener()
}

function setSnapshot(nextCount: number) {
  const next = Math.max(0, nextCount)
  if (snapshot === next) return
  snapshot = next
  emit()
}

function setReconcileInterval(intervalMs: number) {
  if (!canUseBrowser()) return

  if (pollInterval !== null) {
    window.clearInterval(pollInterval)
  }

  pollInterval = window.setInterval(() => {
    void refreshUnreadCount()
  }, intervalMs)
}

function scheduleRefresh(delay = 0) {
  if (!canUseBrowser() || !started || !authToken) return

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer)
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void refreshUnreadCount()
  }, delay)
}

async function refreshUnreadCount() {
  if (!canUseBrowser() || !started || !authToken || document.hidden) return
  if (refreshInFlight) {
    refreshQueued = true
    return
  }

  const requestToken = authToken
  refreshInFlight = true

  try {
    const data = await apiGet<NotificationUnreadResponse>(NOTIFICATIONS_UNREAD_PATH)
    if (!started || authToken !== requestToken) return
    setSnapshot(data.count ?? 0)
  } catch {
    // Badge refresh should never break navigation.
  } finally {
    refreshInFlight = false
    if (refreshQueued && started && authToken && !document.hidden) {
      refreshQueued = false
      scheduleRefresh(0)
    }
  }
}

function setAuthToken(nextToken: string | null) {
  if (authToken === nextToken) return

  authToken = nextToken
  if (!authToken) {
    setSnapshot(0)
    return
  }

  invalidateApiCache(NOTIFICATIONS_UNREAD_PATH)
  scheduleRefresh(0)
}

function onFocus() {
  scheduleRefresh(0)
}

function onVisibilityChange() {
  if (!document.hidden) scheduleRefresh(0)
}

function toastForNotification(row: NotificationRow) {
  useToastStore.getState().pushToast({
    type: row.type,
    title: row.title,
    body: row.body ?? '',
  })
}

function onRealtimeStatus(status: string) {
  if (!started) return

  if (status === 'SUBSCRIBED') {
    const recovered = !realtimeHealthy
    realtimeHealthy = true
    setReconcileInterval(REALTIME_HEALTHY_RECONCILE_MS)
    if (recovered) scheduleRefresh(0)
    return
  }

  if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
    realtimeHealthy = false
    setReconcileInterval(REALTIME_DEGRADED_RECONCILE_MS)
    scheduleRefresh(0)
  }
}

function startNotificationsStore() {
  if (!canUseBrowser() || started) return

  started = true
  setAuthToken(useSessionStore.getState().token)
  unsubscribeSession = useSessionStore.subscribe((state) => setAuthToken(state.token))

  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)

  setReconcileInterval(REALTIME_DEGRADED_RECONCILE_MS)

  // RLS scopes `notifications` SELECT to the current user's own rows, so a
  // broad, unfiltered subscription here only ever delivers this user's events.
  channel = supabase
    .channel('notifications:global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      const row = payload.new as NotificationRow
      invalidateApiCache('/api/notifications')
      invalidateApiCache(NOTIFICATIONS_UNREAD_PATH)
      if (!row.read_at) {
        setSnapshot(snapshot + 1)
        toastForNotification(row)
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, (payload) => {
      const previous = payload.old as Partial<NotificationRow>
      const next = payload.new as NotificationRow
      invalidateApiCache('/api/notifications')
      invalidateApiCache(NOTIFICATIONS_UNREAD_PATH)
      if (Object.prototype.hasOwnProperty.call(previous, 'read_at')) {
        if (!previous.read_at && next.read_at) setSnapshot(snapshot - 1)
        if (previous.read_at && !next.read_at) setSnapshot(snapshot + 1)
      } else {
        // Defensive fallback for databases that have not yet applied replica
        // identity FULL. Normal production events take the local delta above.
        scheduleRefresh(0)
      }
    })
    .subscribe(onRealtimeStatus)
}

function stopNotificationsStore() {
  if (!canUseBrowser() || !started) return

  started = false

  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }

  if (pollInterval !== null) {
    window.clearInterval(pollInterval)
    pollInterval = null
  }

  window.removeEventListener('focus', onFocus)
  window.removeEventListener('online', onFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)

  unsubscribeSession?.()
  unsubscribeSession = null
  authToken = null
  refreshInFlight = false
  refreshQueued = false
  realtimeHealthy = false

  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  startNotificationsStore()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopNotificationsStore()
  }
}

function getSnapshot() {
  return snapshot
}

export function useNotificationsUnreadCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
