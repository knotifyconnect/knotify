import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiGetCached, apiPatch } from '../../lib/api'
import { TOUR_STEPS } from './steps'
import type { TourStep } from './steps'

type TourContextValue = {
  isRunning: boolean
  activeIndex: number
  activeStep: TourStep | null
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
  const location = useLocation()
  const [isRunning, setIsRunning] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const finishedRef = useRef(false)

  // Explicit kickoff only: the very first step's page is loaded once, as a
  // direct result of the user clicking "start"/"show me around". Every step
  // after that either stays on the same page or is a 'navigate' step the
  // tour waits on — the tour itself never hops pages mid-run.
  const start = useCallback(() => {
    finishedRef.current = false
    setActiveIndex(0)
    setIsRunning(true)
    const first = TOUR_STEPS[0]
    if (first && first.kind === 'spotlight') navigate(first.path)
  }, [navigate])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    setIsRunning(false)
    persistTourCompleted()
  }, [])

  const advance = useCallback(() => {
    setActiveIndex((current) => {
      const nextIndex = current + 1
      if (!TOUR_STEPS[nextIndex]) {
        finish()
        return current
      }
      return nextIndex
    })
  }, [finish])

  const next = useCallback(() => {
    advance()
  }, [advance])

  const skip = useCallback(() => {
    finish()
  }, [finish])

  // Auto-advance past a 'navigate' step once the user has actually clicked
  // through to the target page themselves. Also a safety net: if the user
  // wanders off-script mid-spotlight-step (clicks something else entirely),
  // end the tour instead of leaving a spotlight pointing at a page that's no
  // longer there. Index 0 is exempt — it's mid-flight from start()'s own
  // kickoff navigate, which hasn't landed yet on the first render.
  useEffect(() => {
    if (!isRunning) return
    const step = TOUR_STEPS[activeIndex]
    if (!step) return

    if (step.kind === 'navigate') {
      if (location.pathname === step.toPath) advance()
      return
    }

    if (activeIndex === 0) return
    if (location.pathname !== step.path) finish()
  }, [location.pathname, isRunning, activeIndex, advance, finish])

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
