import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AuthPage } from './pages/AuthPage'
import { LandingPage } from './pages/LandingPage'
import { HomePage } from './pages/HomePage'
import { MapPage } from './pages/MapPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ProfilePage } from './pages/ProfilePage'
import { JobsPage } from './pages/JobsPage'
import { HrPage } from './pages/HrPage'
import { MessagesPage } from './pages/MessagesPage'
import { CafesPage } from './pages/CafesPage'
import { AdminPage } from './pages/AdminPage'
import { supabase } from './lib/supabase'
import { useSessionStore } from './store/session'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { PrivacyPage } from './pages/PrivacyPage'
import { ImpressumPage } from './pages/ImpressumPage'

const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.15 } },
}

function ProtectedRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/cafes" element={<CafesPage />} />
        <Route path="/hr" element={<HrPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/auth" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppLayout>
  )
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AnimatedRoutes({ token }: { token: string | null }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        {token ? <ProtectedRoutes /> : <PublicRoutes />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const token = useSessionStore((s) => s.token)
  const setToken = useSessionStore((s) => s.setToken)
  const [hydrating, setHydrating] = useState(true)

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount with the
    // existing session (or null). This is the single source of truth —
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

  if (hydrating) {
    return <div className="min-h-screen bg-bg-base" />
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AnimatedRoutes token={token} />
        <ToastContainer />
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
