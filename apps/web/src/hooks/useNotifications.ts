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
  type: 'connection_request' | 'connection_accepted' | 'message' | 'event_rsvp'
  title: string
  body: string | null
}

const NOTIFICATIONS_UNREAD_PATH = '/api/notifications/unread-count'
// Realtime is the primary path (instant on INSERT/UPDATE below); this poll is
// only a repair loop for missed events, so it doesn't need to be sub-second.
const NOTIFICATIONS_VISIBLE_POLL_MS = 30_000

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

function startNotificationsStore() {
  if (!canUseBrowser() || started) return

  started = true
  setAuthToken(useSessionStore.getState().token)
  unsubscribeSession = useSessionStore.subscribe((state) => setAuthToken(state.token))

  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)

  pollInterval = window.setInterval(() => {
    void refreshUnreadCount()
  }, NOTIFICATIONS_VISIBLE_POLL_MS)

  // RLS scopes `notifications` SELECT to the current user's own rows, so a
  // broad, unfiltered subscription here only ever delivers this user's events.
  channel = supabase
    .channel('notifications:global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      invalidateApiCache('/api/notifications')
      invalidateApiCache(NOTIFICATIONS_UNREAD_PATH)
      scheduleRefresh(0)
      toastForNotification(payload.new as NotificationRow)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, () => {
      invalidateApiCache('/api/notifications')
      invalidateApiCache(NOTIFICATIONS_UNREAD_PATH)
      scheduleRefresh(0)
    })
    .subscribe()
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
