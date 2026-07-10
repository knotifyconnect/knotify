import * as Sentry from '@sentry/node'

// Initialize Sentry as early as possible — this module is imported first in
// app.ts so it can auto-instrument HTTP and capture unhandled errors. When
// SENTRY_DSN is not set (e.g. local dev), init is skipped and the app runs
// exactly as before.
const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  })
}

export const sentryEnabled = Boolean(dsn)
