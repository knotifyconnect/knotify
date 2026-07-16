import './instrument.js'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import { globalRateLimit, aiRateLimit } from './middleware/rateLimit.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { connectionsRouter } from './routes/connections.js'
import { cvRouter } from './routes/cv.js'
import { cvProfileImportRouter } from './routes/cvProfileImport.js'
import { jobsRouter } from './routes/jobs.js'
import { companiesRouter } from './routes/companies.js'
import { referralsRouter } from './routes/referrals.js'
import { conversationsRouter } from './routes/conversations.js'
import { updatesRouter } from './routes/updates.js'
import { skillsRouter } from './routes/skills.js'
import { adminRouter } from './routes/admin.js'
import { cafesRouter } from './routes/cafes.js'
import { meetingsRouter } from './routes/meetings.js'
import { postsRouter } from './routes/posts.js'
import { channelsRouter } from './routes/channels.js'
import { ogRouter } from './routes/og.js'
import { asksRouter } from './routes/asks.js'
import { relationshipHomeRouter } from './routes/relationshipHome.js'
import { companionRouter } from './routes/companion.js'
import { betaRouter } from './routes/beta.js'
import { adminPanelRouter } from './routes/adminPanel.js'
import { describeAdminAuthError, listAuthUsers } from './lib/supabaseAdminAuth.js'
import { questsRouter } from './routes/quests.js'
import { eventsRouter } from './routes/events.js'
import { forYouRouter } from './routes/forYou.js'
import { gigsRouter } from './routes/gigs.js'
import { invitesRouter } from './routes/invites.js'
import { feedbackRouter } from './routes/feedback.js'
import { intelligenceHealthRouter } from './routes/intelligenceHealth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { supabase } from './lib.js'
import { getAccessConfig, resolveInviteCode, isApprovedEmail } from './lib/access.js'
import {
  deploymentConfig,
  isRequestOriginAllowed,
} from './config/deployment.js'

export const app = express()

if (deploymentConfig.nodeEnv === 'production') {
  app.set('trust proxy', 1)
}

// Baseline security headers. Conservative set that is safe for a JSON API and
// the SPA it serves (no strict CSP here, which would need per-page tuning).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (deploymentConfig.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

app.use(cors({
  origin(origin, callback) {
    callback(
      null,
      isRequestOriginAllowed(origin, deploymentConfig)
    )
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}))
app.use(express.json({ limit: '15mb' }))
app.use(globalRateLimit)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Public: drives the auth page. Tells the client which access mode we're in and,
// if an invite code is present, whether it's valid, who it's from, and (for a
// verified email invite) the address it must be redeemed with.
app.get('/api/access/context', async (req, res) => {
  const { mode } = await getAccessConfig()
  const raw = String(req.query.invite ?? '').trim()

  let invite:
    | { valid: boolean; kind: 'team' | 'member' | 'email' | 'waitlist' | null; inviterName: string | null; lockedEmail: string | null }
    | null = null

  if (raw) {
    const resolved = await resolveInviteCode(raw)
    invite = resolved
      ? { valid: true, kind: resolved.kind, inviterName: resolved.inviterName, lockedEmail: resolved.email }
      : { valid: false, kind: null, inviterName: null, lockedEmail: null }
  }

  // No invite code, but the visitor arrived via an approval email link
  // (?email=...): let them straight into the signup form instead of the
  // waitlist screen. The actual account-creation gate re-checks this
  // server-side (evaluateNewUserAccess), so trusting the query param here
  // only affects which UI renders, not who can actually sign up.
  if ((!invite || !invite.valid) && mode === 'invite_only') {
    const email = String(req.query.email ?? '').trim().toLowerCase()
    if (email && (await isApprovedEmail(email))) {
      invite = { valid: true, kind: 'waitlist', inviterName: null, lockedEmail: email }
    }
  }

  return res.json({ mode, invite })
})

app.get('/health/db', async (_req, res) => {
  try {
    const result = await supabase.from('users').select('id').limit(1)
    if (result.error) {
      throw result.error
    }
    res.json({ ok: true, db: 'supabase' })
  } catch (error) {
    console.error('[health/db] check failed:', error)
    res.status(500).json({ ok: false, error: 'DB health check failed' })
  }
})

// Read-only deployment probe for the separate Supabase Auth Admin boundary.
// Database health alone cannot catch a missing/invalid secret-key permission.
app.get('/health/admin-auth', async (_req, res) => {
  try {
    await listAuthUsers(1, 1)
    return res.json({ ok: true, adminAuth: 'available' })
  } catch (error) {
    const detail = describeAdminAuthError(error)
    console.error(`[health/admin-auth] ${detail.code}: ${detail.message}`)
    return res.status(503).json({ ok: false, adminAuth: 'unavailable', code: detail.code })
  }
})

app.use('/health/ai', intelligenceHealthRouter)

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/cv', aiRateLimit, cvProfileImportRouter)
app.use('/api/cv', aiRateLimit, cvRouter)
app.use('/api/skills', skillsRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/referrals', referralsRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/updates', updatesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/cafes', cafesRouter)
app.use('/api/meetings', meetingsRouter)
app.use('/api/posts', postsRouter)
app.use('/api/channels', channelsRouter)
app.use('/api/og', ogRouter)
app.use('/api/asks', asksRouter)
app.use('/api/relationship-home', relationshipHomeRouter)
app.use('/api/companion', aiRateLimit, companionRouter)
app.use('/api/beta', betaRouter)
app.use('/api/admin-panel', adminPanelRouter)
app.use('/api/quests', questsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/for-you', forYouRouter)
app.use('/api/gigs', gigsRouter)
app.use('/api/invites', invitesRouter)
app.use('/api/feedback', feedbackRouter)

// Sentry captures the error, then our handler sends the (redacted) response.
// No-op when SENTRY_DSN isn't configured.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app)
}

app.use(errorHandler)
