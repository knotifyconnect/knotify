import { useEffect, useState } from 'react'
import { apiGetCached } from '../lib/api'
import { runWhenIdle } from '../lib/schedule'

type ConnectionsResponse = {
  connections: Array<{ status: 'pending' | 'accepted' | 'declined' }>
}

/** Returns the current user's accepted-connection count. Polls every 30s. */
export function useConnectionCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (document.hidden) return
      try {
        const data = await apiGetCached<ConnectionsResponse>('/api/connections', { ttlMs: 10_000 })
        if (cancelled) return
        const accepted = (data.connections ?? []).filter((c) => c.status === 'accepted').length
        setCount(accepted)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    const cancelInitialLoad = runWhenIdle(() => void load(), 3000)
    const interval = window.setInterval(load, 60000)

    return () => {
      cancelled = true
      cancelInitialLoad()
      window.clearInterval(interval)
    }
  }, [])

  return count
}
