import { useEffect, useRef, useState } from 'react'
import { apiGetCached } from '../lib/api'
import { supabase } from '../lib/supabase'
import { runWhenIdle } from '../lib/schedule'

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
    let interval: number | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      if (inFlightRef.current) return
      if (document.hidden) return

      inFlightRef.current = true
      try {
        const data = await apiGetCached<MessageUnreadResponse>('/api/conversations/unread', { ttlMs: 5_000 })
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

    function onFocus() {
      scheduleRefresh(0)
    }

    function onVisibilityChange() {
      if (!document.hidden) scheduleRefresh(0)
    }

    const cancelInitialRefresh = runWhenIdle(() => {
      if (disposedRef.current) return

      void refresh()

      interval = window.setInterval(() => {
        void refresh()
      }, 60_000)

      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVisibilityChange)

      channel = supabase
        .channel('message-unread-count:any')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          scheduleRefresh()
        })
        .subscribe()
    }, 3000)

    return () => {
      disposedRef.current = true

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }

      cancelInitialRefresh()
      if (interval !== null) {
        window.clearInterval(interval)
      }
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [])

  return count
}
