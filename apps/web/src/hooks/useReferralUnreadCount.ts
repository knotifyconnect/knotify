import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

type ReferralUnreadResponse = {
  count: number
  breakdown: {
    referrerPending: number
    referrerInProgress: number
    applicantUpdates: number
    hrInbox: number
  }
}

export function useReferralUnreadCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await apiGet<ReferralUnreadResponse>('/api/referrals/unread')
        if (!cancelled) setCount(data.count ?? 0)
      } catch {
        if (!cancelled) setCount(0)
      }
    }

    load()
    const interval = window.setInterval(load, 20000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return count
}
