import posthog from 'posthog-js'
import type { User } from '@supabase/supabase-js'

const CONSENT_KEY = 'knotify:analytics-consent'
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

export type ConsentChoice = 'granted' | 'denied'

let initialized = false

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
  else if (initialized) posthog.opt_out_capturing()
}

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return
  if (!POSTHOG_KEY) return
  if (getConsent() !== 'granted') return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
  })
  initialized = true
}

export function trackPageview(path: string) {
  if (!initialized) return
  posthog.capture('$pageview', { $current_url: path })
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (!initialized) return
  posthog.capture(name, properties)
}

export function identifyUser(user: User) {
  if (!initialized) return
  posthog.identify(user.id, { email: user.email })
}

export function resetAnalyticsUser() {
  if (!initialized) return
  posthog.reset()
}
