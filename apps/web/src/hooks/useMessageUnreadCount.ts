import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api'
import { supabase } from '../lib/supabase'

type MessageUnreadResponse = {
  count: number
}

export function useMessageUnreadCount() {
  const [count, setCount] = useState(0)
  const inFlightRef = useRef(false)
  const disposedRef = useRef(false)
  const refreshTimerRef = useRef<number | null>(null)

  useEffect(() => {
    disposedRef.current = false

    async function refresh() {
      if (inFlightRef.current) return

      inFlightRef.current = true
      try {
        const data = await apiGet<MessageUnreadResponse>('/api/conversations/unread')
        if (!disposedRef.current) {
          setCount(Math.max(0, data.count ?? 0))
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

    void refresh()

    const interval = window.setInterval(() => {
      void refresh()
    }, 15_000)

    function onFocus() {
      scheduleRefresh(0)
    }

    function onVisibilityChange() {
      if (!document.hidden) scheduleRefresh(0)
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    const channel = supabase
      .channel('message-unread-count:any')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        scheduleRefresh()
      })
      .subscribe()

    return () => {
      disposedRef.current = true

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }

      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [])

  return count
}
