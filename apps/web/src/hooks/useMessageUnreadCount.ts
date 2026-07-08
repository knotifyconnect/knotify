import { useEffect, useRef, useState } from 'react'
import { apiGet, invalidateApiCache } from '../lib/api'
import { supabase } from '../lib/supabase'

type MessageUnreadResponse = {
  count: number
}

const MESSAGE_UNREAD_TOTAL_EVENT = 'knotify:message-unread-total'
const LOCAL_UNREAD_RECONCILE_GRACE_MS = 15_000

export function useMessageUnreadCount() {
  const [count, setCount] = useState(0)
  const inFlightRef = useRef(false)
  const disposedRef = useRef(false)
  const refreshTimerRef = useRef<number | null>(null)
  const localUnreadUpdatedAtRef = useRef(0)

  useEffect(() => {
    disposedRef.current = false
    let interval: number | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      if (inFlightRef.current) return
      if (document.hidden) return

      const requestStartedAt = Date.now()
      inFlightRef.current = true
      try {
        const data = await apiGet<MessageUnreadResponse>('/api/conversations/unread')
        if (!disposedRef.current) {
          const shouldKeepLocal =
            localUnreadUpdatedAtRef.current > requestStartedAt ||
            Date.now() - localUnreadUpdatedAtRef.current < LOCAL_UNREAD_RECONCILE_GRACE_MS

          setCount((current) =>
            shouldKeepLocal
              ? current
              : Math.max(0, data.count ?? 0)
          )
        }
      } catch {
        // Badge refresh should never break navigation.
      } finally {
        inFlightRef.current = false
      }
    }

    function scheduleRefresh(delay = 250) {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void refresh()
      }, delay)
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
        localUnreadUpdatedAtRef.current = Date.now()
        setCount(Math.max(0, detail.count))
      }
    }

    void refresh()

    interval = window.setInterval(() => {
      void refresh()
    }, 60_000)

    window.addEventListener('focus', onFocus)
    window.addEventListener(MESSAGE_UNREAD_TOTAL_EVENT, onUnreadTotal)
    document.addEventListener('visibilitychange', onVisibilityChange)

    channel = supabase
      .channel('message-unread-count:any')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        invalidateApiCache('/api/conversations')
        scheduleRefresh(0)
      })
      .subscribe()

    return () => {
      disposedRef.current = true

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }

      if (interval !== null) {
        window.clearInterval(interval)
      }
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(MESSAGE_UNREAD_TOTAL_EVENT, onUnreadTotal)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [])

  return count
}
