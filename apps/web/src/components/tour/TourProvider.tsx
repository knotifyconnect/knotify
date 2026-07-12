import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGetCached, apiPatch } from '../../lib/api'
import { TOUR_STEPS } from './steps'

type TourContextValue = {
  isRunning: boolean
  activeIndex: number
  activeStep: (typeof TOUR_STEPS)[number] | null
  totalSteps: number
  start: () => void
  next: () => void
  skip: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

function persistTourCompleted() {
  void apiPatch('/api/users/me', { tourCompletedAt: new Date().toISOString() }).catch(() => {
    // Best-effort — worst case the tour offers itself again next session.
  })
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [isRunning, setIsRunning] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const finishedRef = useRef(false)

  const start = useCallback(() => {
    finishedRef.current = false
    setActiveIndex(0)
    setIsRunning(true)
    const first = TOUR_STEPS[0]
    if (first) navigate(first.path)
  }, [navigate])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    setIsRunning(false)
    persistTourCompleted()
  }, [])

  const next = useCallback(() => {
    setActiveIndex((current) => {
      const nextIndex = current + 1
      const nextStep = TOUR_STEPS[nextIndex]
      if (!nextStep) {
        finish()
        return current
      }
      navigate(nextStep.path)
      return nextIndex
    })
  }, [navigate, finish])

  const skip = useCallback(() => {
    finish()
  }, [finish])

  const value = useMemo<TourContextValue>(
    () => ({
      isRunning,
      activeIndex,
      activeStep: isRunning ? TOUR_STEPS[activeIndex] ?? null : null,
      totalSteps: TOUR_STEPS.length,
      start,
      next,
      skip,
    }),
    [isRunning, activeIndex, start, next, skip]
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within a TourProvider')
  return ctx
}

const AUTO_START_DELAY_MS = 600

// Auto-launches the tour once for a first-time user landing on Home after
// onboarding. Reuses the same cached onboarding-status endpoint the profile
// gate already calls, so this is a cache hit in the common case, not an
// extra request.
export function AutoStartTour() {
  const location = useLocation()
  const tour = useTour()
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current) return
    if (location.pathname !== '/home') return
    attemptedRef.current = true

    let cancelled = false
    apiGetCached<{ tourCompleted?: boolean }>('/api/users/me/onboarding-status', { ttlMs: 60_000 })
      .then((status) => {
        if (cancelled || status.tourCompleted) return
        setTimeout(() => {
          if (!cancelled) tour.start()
        }, AUTO_START_DELAY_MS)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [location.pathname, tour])

  return null
}
