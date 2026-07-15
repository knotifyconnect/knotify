import { trackEvent } from './analytics'

export type EventCtaInfo = { id: string; url?: string | null; rsvped: boolean; is_host: boolean }

// Curated events point at a real registration site outside knotify — there's no
// way to know who actually attends, so clicking through to register is the
// signal we treat as "going". Peer-hosted events (no url) keep the plain toggle.
export function eventCtaLabel(e: EventCtaInfo, hostLabel: string): string {
  if (e.is_host) return hostLabel
  if (e.url) return e.rsvped ? 'Going ↗' : 'Register ↗'
  return e.rsvped ? 'Going' : "I'm in"
}

export function fireEventCta(e: EventCtaInfo, toggleRsvp: (id: string) => void) {
  if (e.is_host) return
  if (e.url) {
    window.open(e.url, '_blank', 'noopener,noreferrer')
    trackEvent('event_register_click', { event_id: e.id })
    if (!e.rsvped) toggleRsvp(e.id)
  } else {
    toggleRsvp(e.id)
  }
}
