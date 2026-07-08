const CONSENT_KEY = 'knotify:analytics-consent'

export type ConsentChoice = 'granted' | 'denied'

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
}
