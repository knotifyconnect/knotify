import { useEffect, useState } from 'react'
import { apiGetCached } from '../lib/api'
import { runWhenIdle } from '../lib/schedule'

type ReferralUnreadResponse = {
  count: number
  breakdown: {
    referrerPending: number
    referrerInProgress: number
    applicantUpdates: number
    offersForYou: number
    hrInbox: number
  }
}

export function useReferralUnreadCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (document.hidden) return
      try {
        const data = await apiGetCached<ReferralUnreadResponse>('/api/referrals/unread', { ttlMs: 5_000 })
        if (!cancelled) setCount(data.count ?? 0)
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
