import { useEffect, type PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { FeedbackWidget } from '../components/FeedbackWidget'
import { GlobalCompanionWidget } from '../components/GlobalCompanionWidget'
import { InstallAppBanner } from '../components/InstallAppBanner'
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

  useEffect(() => {
    if (!lockViewport || !isMobile) return
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    // 'hidden' visually clips scrolling but mobile browsers can still force
    // a scroll past it to bring a focused input into view — which is
    // exactly what was shoving this whole page upward when the message
    // composer's textarea got focus. 'clip' explicitly disallows all
    // scrolling, including that forced kind, which is what this page
    // actually wants (it isn't meant to scroll at all).
    document.body.style.overflow = 'clip'
    document.documentElement.style.overflow = 'clip'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isMobile, lockViewport])

  return (
    <TourProvider>
    <div
      style={{
        minHeight: '100dvh',
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
            ? isMobile
              ? { position: 'fixed', inset: `${topClearance} 0 0`, overflow: 'clip', overscrollBehavior: 'none', paddingBottom: 0 }
              : { height: '100dvh', overflow: 'hidden', paddingBottom: 0 }
            : { paddingBottom: 'max(88px, calc(64px + env(safe-area-inset-bottom)))', paddingTop: isMobile ? `calc(${topClearance} + 8px)` : 32 }
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
      <InstallAppBanner />
      <AutoStartTour />
      <TourOverlay />
    </div>
    </TourProvider>
  )
}
