import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

type ConnectionsResponse = {
  connections: Array<{ status: 'pending' | 'accepted' | 'declined' }>
}

/** Returns the current user's accepted-connection count. Polls every 30s. */
export function useConnectionCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await apiGet<ConnectionsResponse>('/api/connections')
        if (cancelled) return
        const accepted = (data.connections ?? []).filter((c) => c.status === 'accepted').length
        setCount(accepted)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    load()
    const interval = window.setInterval(load, 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return count
}
