import type { PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { FeedbackWidget } from '../components/FeedbackWidget'
import { GlobalCompanionWidget } from '../components/GlobalCompanionWidget'
import { TourProvider, AutoStartTour } from '../components/tour/TourProvider'
import { TourOverlay } from '../components/tour/TourOverlay'
import { useIsMobile } from '../hooks/useIsMobile'

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation()
  const isMapPage = location.pathname === '/map'
  const isMessagesPage = location.pathname === '/messages'
  const lockViewport = isMapPage || isMessagesPage
  const isMobile = useIsMobile()
  const topClearance = isMobile ? 'var(--mobile-topbar-height)' : '0px'

  return (
    <TourProvider>
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <AppSidebar />
      <main
        // Mobile (default): leave room at top for the logo/Discover/Profile bar
        // and at bottom for the 64px tab bar (+ safe area).
        // Desktop: shift right by sidebar width, generous padding, no top bar
        // to clear (topClearance resolves to 0 there) and no extra bottom space.
        style={
          lockViewport
            ? { height: `calc(100dvh - ${topClearance})`, marginTop: topClearance, overflow: 'hidden', paddingBottom: 0 }
            : { paddingBottom: 'max(88px, calc(64px + env(safe-area-inset-bottom)))', paddingTop: isMobile ? `calc(${topClearance} + 16px)` : 32 }
        }
        className={
          isMapPage
            ? 'p-0 md:ml-[220px] md:pb-6 md:pl-2 md:pr-2 md:pt-2'
            : isMessagesPage
              ? 'p-0 md:ml-[220px] md:px-8 md:py-8'
              : 'px-4 md:ml-[220px] md:pb-8 md:px-8 md:py-8'
        }
      >
        {children}
      </main>
      <GlobalCompanionWidget />
      <FeedbackWidget />
      <AutoStartTour />
      <TourOverlay />
    </div>
    </TourProvider>
  )
}
