import express from 'express'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { connectionsRouter } from './routes/connections.js'
import { cvRouter } from './routes/cv.js'
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
import { errorHandler } from './middleware/errorHandler.js'
import { supabase } from './lib.js'

export const app = express()

app.use(cors())
app.use(express.json({ limit: '15mb' }))
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 10000 : 3000,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/health/db', async (_req, res) => {
  try {
    const result = await supabase.from('users').select('id').limit(1)
    if (result.error) {
      throw result.error
    }
    res.json({ ok: true, db: 'supabase' })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'DB health check failed',
    })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/cv', cvRouter)
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

app.use(errorHandler)
