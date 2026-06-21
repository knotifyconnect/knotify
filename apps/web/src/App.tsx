import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthPage } from './pages/AuthPage'
import { LandingPage } from './pages/LandingPage'
import { RelationshipHomePage } from './pages/RelationshipHomePage'
import { MapPage } from './pages/MapPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ProfilePage } from './pages/ProfilePage'
import { JobsPage } from './pages/JobsPage'
import { MessagesPage } from './pages/MessagesPage'
import { AdminPage } from './pages/AdminPage'
import { supabase } from './lib/supabase'
import { useSessionStore } from './store/session'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { PrivacyPage } from './pages/PrivacyPage'
import { ImpressumPage } from './pages/ImpressumPage'
import { EmployersPage } from './pages/EmployersPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { apiGet } from './lib/api'

const LAST_ACTIVE_AT_KEY = 'knotify:lastActiveAt'
const INACTIVITY_REENTRY_MS = 2 * 24 * 60 * 60 * 1000
const ACTIVE_WRITE_THROTTLE_MS = 60 * 1000
const ACTIVITY_EVENTS = ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const

const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.15 } },
}

type ReentryState = {
  token: string | null
  ready: boolean
  showLanding: boolean
}

function readLastActiveAt() {
  try {
    const value = window.localStorage.getItem(LAST_ACTIVE_AT_KEY)
    if (!value) return null

    const timestamp = Number(value)
    return Number.isFinite(timestamp) ? timestamp : null
  } catch {
    return null
  }
}

function writeLastActiveAt(timestamp = Date.now()) {
  try {
    window.localStorage.setItem(LAST_ACTIVE_AT_KEY, String(timestamp))
  } catch {
    // If localStorage is unavailable, do nothing. Supabase remains the auth source of truth.
  }
}

function shouldShowInactivityLanding(now = Date.now()) {
  const lastActiveAt = readLastActiveAt()

  if (!lastActiveAt) return false

  return now - lastActiveAt > INACTIVITY_REENTRY_MS
}

type OnboardingStatus = {
  complete: boolean
  missing: string[]
  skillsCount: number
  minSkills: number
}

function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [status, setStatus] = useState<'loading' | 'complete' | 'incomplete' | 'error'>('loading')

  useEffect(() => {
    let mounted = true

    async function checkProfileCompletion() {
      setStatus('loading')

      try {
        const result = await apiGet<OnboardingStatus>('/api/users/me/onboarding-status')
        if (!mounted) return
        setStatus(result.complete ? 'complete' : 'incomplete')
      } catch {
        if (!mounted) return
        setStatus('error')
      }
    }

    void checkProfileCompletion()

    return () => {
      mounted = false
    }
  }, [location.pathname])

  if (status === 'loading') {
    return <div className="min-h-screen bg-bg-base" />
  }

  if (status === 'incomplete') {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }

  if (status === 'error') {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}

function ProtectedAppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<RelationshipHomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/auth" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppLayout>
  )
}

function ProtectedRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/*"
        element={
          <ProfileCompletionGate>
            <ProtectedAppRoutes />
          </ProfileCompletionGate>
        }
      />
    </Routes>
  )
}
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route path="/forgot-password" element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/employers" element={<EmployersPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ReentryContinue({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    onContinue()
  }, [onContinue])

  return <Navigate to="/home" replace />
}

function ReentryLandingRoutes({ onContinue }: { onContinue: () => void }) {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/auth" element={<ReentryContinue onContinue={onContinue} />} />
      <Route path="/login" element={<ReentryContinue onContinue={onContinue} />} />
      <Route path="/signup" element={<ReentryContinue onContinue={onContinue} />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  )
}

function AnimatedRoutes({
  token,
  showReentryLanding,
  onReentryContinue,
}: {
  token: string | null
  showReentryLanding: boolean
  onReentryContinue: () => void
}) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        {token ? (
          showReentryLanding ? (
            <ReentryLandingRoutes onContinue={onReentryContinue} />
          ) : (
            <ProtectedRoutes />
          )
        ) : (
          <PublicRoutes />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const token = useSessionStore((s) => s.token)
  const setToken = useSessionStore((s) => s.setToken)
  const [hydrating, setHydrating] = useState(true)
  const [reentryState, setReentryState] = useState<ReentryState>({
    token: null,
    ready: false,
    showLanding: false,
  })

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount with the
    // existing session (or null). This is the single source of truth â€”
    // no separate getSession() call that can race and wipe a valid token.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      const emailConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at)
      setToken(session && emailConfirmed ? session.access_token : null)
      setHydrating(false)
    })

    return () => subscription.unsubscribe()
  }, [setToken])

  useEffect(() => {
    if (!token) {
      setReentryState({
        token: null,
        ready: true,
        showLanding: false,
      })
      return
    }

    const showLanding = shouldShowInactivityLanding()

    // Update immediately after checking. This makes the landing page a one-time
    // re-entry surface for the current return, not an annoying loop.
    writeLastActiveAt()

    setReentryState({
      token,
      ready: true,
      showLanding,
    })
  }, [token])

  useEffect(() => {
    if (!token || reentryState.showLanding) return

    let lastWrite = 0

    const recordActivity = () => {
      const now = Date.now()

      if (now - lastWrite < ACTIVE_WRITE_THROTTLE_MS) return

      lastWrite = now
      writeLastActiveAt(now)
    }

    const recordVisibilityReturn = () => {
      if (!document.hidden) recordActivity()
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true })
    })
    document.addEventListener('visibilitychange', recordVisibilityReturn)

    recordActivity()

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity)
      })
      document.removeEventListener('visibilitychange', recordVisibilityReturn)
    }
  }, [token, reentryState.showLanding])

  const onReentryContinue = useCallback(() => {
    writeLastActiveAt()

    setReentryState({
      token,
      ready: true,
      showLanding: false,
    })
  }, [token])

  if (hydrating || !reentryState.ready || reentryState.token !== token) {
    return <div className="min-h-screen bg-bg-base" />
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AnimatedRoutes
          token={token}
          showReentryLanding={reentryState.showLanding}
          onReentryContinue={onReentryContinue}
        />
        <ToastContainer />
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
