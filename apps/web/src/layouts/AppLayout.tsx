import type { PropsWithChildren } from 'react'
import { AppSidebar } from '../components/layout/AppSidebar'

export function AppLayout({ children }: PropsWithChildren) {
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
        className="px-4 pt-4 pb-[88px] md:ml-[220px] md:pb-8 md:px-8 md:py-8"
      >
        {children}
      </main>
    </div>
  )
}
