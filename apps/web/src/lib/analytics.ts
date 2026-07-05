import type posthog from 'posthog-js'
import type { User } from '@supabase/supabase-js'

const CONSENT_KEY = 'knotify:analytics-consent'
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

export type ConsentChoice = 'granted' | 'denied'

let initialized = false
let posthogClient: typeof posthog | null = null
let initPromise: Promise<void> | null = null

function withPostHog(action: (client: typeof posthog) => void) {
  if (initialized && posthogClient) {
    action(posthogClient)
    return
  }

  initAnalytics()
  initPromise?.then(() => {
    if (initialized && posthogClient) action(posthogClient)
  })
}

export function getConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export function setConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // If localStorage is unavailable, fall back to in-memory only for this tab.
  }
  if (choice === 'granted') initAnalytics()
  else if (initialized) posthogClient?.opt_out_capturing()
}

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return
  if (!POSTHOG_KEY) return
  if (getConsent() !== 'granted') return

  initPromise ??= import('posthog-js').then(({ default: posthog }) => {
    if (initialized || getConsent() !== 'granted') return
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
    })
    posthogClient = posthog
    initialized = true
  }).catch(() => {
    initPromise = null
  })
}

export function trackPageview(path: string) {
  withPostHog((posthog) => posthog.capture('$pageview', { $current_url: path }))
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  withPostHog((posthog) => posthog.capture(name, properties))
}

export function identifyUser(user: User) {
  withPostHog((posthog) => posthog.identify(user.id, { email: user.email }))
}

export function resetAnalyticsUser() {
  if (!initialized || !posthogClient) return
  posthogClient.reset()
}
