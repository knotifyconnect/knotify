import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

type MessageUnreadResponse = {
  count: number
}

export function useMessageUnreadCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await apiGet<MessageUnreadResponse>('/api/conversations/unread')
        if (!cancelled) setCount(data.count ?? 0)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    load()
    const interval = window.setInterval(load, 10000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return count
}
