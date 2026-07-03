import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
// LandingPage stays eager: it is the public LCP page and must paint fast.
import { LandingPage } from './pages/LandingPage'
import { supabase } from './lib/supabase'
import { useSessionStore } from './store/session'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { CelebrationLayer } from './components/celebrations/CelebrationLayer'
import { ToastContainer } from './components/ui/Toast'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { ApiError, apiGet } from './lib/api'
import { identifyUser, initAnalytics, resetAnalyticsUser, trackPageview } from './lib/analytics'

// Everything below is code-split so it does not ship in the landing-page bundle.
// Logged-out visitors and crawlers only load LandingPage + its deps.
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })))
const RelationshipHomePage = lazy(() => import('./pages/RelationshipHomePage').then((m) => ({ default: m.RelationshipHomePage })))
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const JobsPage = lazy(() => import('./pages/JobsPage').then((m) => ({ default: m.JobsPage })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const QuestsPage = lazy(() => import('./pages/QuestsPage').then((m) => ({ default: m.QuestsPage })))
const EventsPage = lazy(() => import('./pages/EventsPage').then((m) => ({ default: m.EventsPage })))
const GigsPage = lazy(() => import('./pages/GigsPage').then((m) => ({ default: m.GigsPage })))
const CafesPage = lazy(() => import('./pages/CafesPage').then((m) => ({ default: m.CafesPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const ImpressumPage = lazy(() => import('./pages/ImpressumPage').then((m) => ({ default: m.ImpressumPage })))
const EmployersPage = lazy(() => import('./pages/EmployersPage').then((m) => ({ default: m.EmployersPage })))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })))
const AsksPage = lazy(() => import('./pages/AsksPage').then((m) => ({ default: m.AsksPage })))

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
  const [status, setStatus] = useState<'loading' | 'complete' | 'incomplete' | 'beta_closed' | 'error'>('loading')
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function checkProfileCompletion() {
      setStatus('loading')
      setBlockedEmail(null)

      try {
        const result = await apiGet<OnboardingStatus>('/api/users/me/onboarding-status')
        if (!mounted) return
        setStatus(result.complete ? 'complete' : 'incomplete')
      } catch (err) {
        if (!mounted) return

        if (err instanceof ApiError && err.status === 403 && err.code === 'beta_closed') {
          const { data: { session } } = await supabase.auth.getSession()
          if (!mounted) return
          setBlockedEmail(session?.user.email ?? null)
          setStatus('beta_closed')
          return
        }

        setStatus('error')
      }
    }

    void checkProfileCompletion()

    return () => { mounted = false }
  }, [location.pathname])

  if (status === 'loading') {
    return <div className="min-h-screen bg-bg-base" />
  }

  if (status === 'beta_closed') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: '#1a1815', marginBottom: 12 }}>
            You're on the list.
          </div>
          <p style={{ fontSize: 15, color: '#6B6358', lineHeight: 1.6, marginBottom: 24 }}>
            knotify is currently invite-only. We'll reach out {blockedEmail ? <>to <strong style={{ color: '#1a1815' }}>{blockedEmail}</strong></> : 'by email'} when your spot opens up.
          </p>
          <p style={{ fontSize: 13, color: '#A29A8C' }}>
            Know someone already inside? Ask them to share their invite link with you.
          </p>
          <button
            onClick={() => { void import('./lib/supabase').then(m => m.supabase.auth.signOut()).then(() => window.location.href = '/') }}
            style={{ marginTop: 32, background: 'none', border: '0.5px solid #D9D1BF', borderRadius: 8, padding: '10px 20px', fontSize: 13, color: '#6B6358', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (status === 'incomplete') {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 700, color: '#1a1815', marginBottom: 12 }}>
            We couldn't verify your access.
          </div>
          <p style={{ fontSize: 15, color: '#6B6358', lineHeight: 1.6, marginBottom: 24 }}>
            This is a temporary verification problem, not a rejection. Try again before changing any account details.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#1a1815', border: 0, borderRadius: 8, padding: '11px 20px', fontSize: 13, color: '#fff', cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={() => { void supabase.auth.signOut().then(() => { window.location.href = '/' }) }}
            style={{ marginLeft: 8, background: 'none', border: '0.5px solid #D9D1BF', borderRadius: 8, padding: '10px 20px', fontSize: 13, color: '#6B6358', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
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
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/gigs" element={<Navigate to="/jobs" replace />} />
        <Route path="/cafes" element={<CafesPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/asks" element={<AsksPage />} />
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

  useEffect(() => {
    trackPageview(location.pathname)
  }, [location.pathname])

  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Suspense fallback={<div className="min-h-screen bg-bg-base" />}>
          {token ? (
            showReentryLanding ? (
              <ReentryLandingRoutes onContinue={onReentryContinue} />
            ) : (
              <ProtectedRoutes />
            )
          ) : (
            <PublicRoutes />
          )}
        </Suspense>
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
    initAnalytics()
  }, [])

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
      if (user && emailConfirmed) identifyUser(user)
      else resetAnalyticsUser()
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
        <CelebrationLayer />
        <CookieConsentBanner />
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
