import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiGet } from '../lib/api'

/** Number of asks targeting the viewer that they haven't seen yet. */
export function useAskUnreadCount() {
  const [count, setCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    async function load() {
      // On the asks page the feed is being viewed/marked seen, so show nothing.
      if (location.pathname === '/asks') { if (!cancelled) setCount(0); return }
      try {
        const data = await apiGet<{ count: number }>('/api/asks/unread-count')
        if (!cancelled) setCount(data.count ?? 0)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    load()
    const interval = window.setInterval(load, 20000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [location.pathname])

  return count
}
