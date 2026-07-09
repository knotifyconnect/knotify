import type { PropsWithChildren } from 'react'
import { useLocation } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { FeedbackWidget } from '../components/FeedbackWidget'
import { GlobalCompanionWidget } from '../components/GlobalCompanionWidget'

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation()
  const isMapPage = location.pathname === '/map'

  return (
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
        // Mobile (default): leave room at bottom for the 64px tab bar (+ safe area)
        // Desktop: shift right by sidebar width, generous padding, no extra bottom space
        style={isMapPage ? { height: '100dvh', overflow: 'hidden', paddingBottom: 0 } : { paddingBottom: 'max(88px, calc(64px + env(safe-area-inset-bottom)))' }}
        className={
          isMapPage
            ? 'px-2 pt-2 pb-[88px] md:ml-[220px] md:pb-6 md:pl-2 md:pr-2 md:pt-2'
            : 'px-4 pt-4 md:ml-[220px] md:pb-8 md:px-8 md:py-8'
        }
      >
        {children}
      </main>
      <GlobalCompanionWidget />
      <FeedbackWidget />
    </div>
  )
}
