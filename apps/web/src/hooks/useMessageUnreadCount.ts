import { useSyncExternalStore } from 'react'
import { apiGet, invalidateApiCache } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useSessionStore } from '../store/session'

type MessageUnreadResponse = {
  count: number
}

const MESSAGE_UNREAD_TOTAL_EVENT = 'knotify:message-unread-total'
const MESSAGE_UNREAD_PATH = '/api/conversations/unread'
const MESSAGE_UNREAD_VISIBLE_POLL_MS = 2_500
const LOCAL_CLEAR_RECONCILE_GRACE_MS = 1_250

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
let localVersion = 0
let localClearAt = 0

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

function applyLocalTotal(nextCount: number) {
  const next = Math.max(0, nextCount)
  localVersion += 1
  if (next < snapshot) localClearAt = Date.now()
  setSnapshot(next)
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
  const requestLocalVersion = localVersion
  refreshInFlight = true

  try {
    const data = await apiGet<MessageUnreadResponse>(MESSAGE_UNREAD_PATH)
    if (!started || authToken !== requestToken) return

    const nextCount = Math.max(0, data.count ?? 0)
    const localChangedDuringRequest = localVersion !== requestLocalVersion
    const clearGraceRemaining = LOCAL_CLEAR_RECONCILE_GRACE_MS - (Date.now() - localClearAt)

    if (localChangedDuringRequest) return

    if (nextCount > snapshot && clearGraceRemaining > 0) {
      scheduleRefresh(clearGraceRemaining)
      return
    }

    setSnapshot(nextCount)
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

  invalidateApiCache(MESSAGE_UNREAD_PATH)
  scheduleRefresh(0)
}

function onFocus() {
  scheduleRefresh(0)
}

function onVisibilityChange() {
  if (!document.hidden) scheduleRefresh(0)
}

function onUnreadTotal(event: Event) {
  const detail = (event as CustomEvent<{ count?: unknown }>).detail
  if (typeof detail?.count === 'number') {
    applyLocalTotal(detail.count)
  }
}

function startUnreadStore() {
  if (!canUseBrowser() || started) return

  started = true
  setAuthToken(useSessionStore.getState().token)
  unsubscribeSession = useSessionStore.subscribe((state) => setAuthToken(state.token))

  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onFocus)
  window.addEventListener(MESSAGE_UNREAD_TOTAL_EVENT, onUnreadTotal)
  document.addEventListener('visibilitychange', onVisibilityChange)

  pollInterval = window.setInterval(() => {
    void refreshUnreadCount()
  }, MESSAGE_UNREAD_VISIBLE_POLL_MS)

  channel = supabase
    .channel('message-unread-count:global')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
      invalidateApiCache('/api/conversations')
      invalidateApiCache(MESSAGE_UNREAD_PATH)
      scheduleRefresh(0)
    })
    .subscribe()
}

function stopUnreadStore() {
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
  window.removeEventListener(MESSAGE_UNREAD_TOTAL_EVENT, onUnreadTotal)
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
  startUnreadStore()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopUnreadStore()
  }
}

function getSnapshot() {
  return snapshot
}

export function useMessageUnreadCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
