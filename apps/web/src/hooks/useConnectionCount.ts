import { useEffect, useState } from 'react'
import { apiGetCached } from '../lib/api'

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
        const data = await apiGetCached<ConnectionsResponse>('/api/connections', { ttlMs: 10_000 })
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
