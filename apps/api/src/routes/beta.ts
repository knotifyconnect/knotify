import { Router } from 'express'
import { supabase } from '../lib.js'

export const betaRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = ['student', 'professional', 'professor', 'investor', 'company']

betaRouter.post('/', async (req, res) => {
  const { email, marketing_consent, beta_risk_consent, name, role, interests, is_international } = req.body

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' })
  }

  if (marketing_consent !== true) {
    return res.status(400).json({ error: 'Consent is required to join the beta.' })
  }

  const riskAccepted = beta_risk_consent === true

  const cleanRole = typeof role === 'string' && ROLES.includes(role) ? role : null
  const cleanInterests = Array.isArray(interests)
    ? interests.filter((i: unknown) => typeof i === 'string').slice(0, 20)
    : []

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    null

  const { error } = await supabase.from('beta_signups').upsert(
    {
      email: email.toLowerCase().trim(),
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null,
      role: cleanRole,
      interests: cleanInterests,
      is_international: typeof is_international === 'boolean' ? is_international : null,
      marketing_consent: true,
      consent_version: 'v1',
      consent_given_at: new Date().toISOString(),
      beta_risk_consent: riskAccepted,
      beta_risk_version: riskAccepted ? 'v1' : null,
      beta_risk_given_at: riskAccepted ? new Date().toISOString() : null,
      ip_address: ip,
      source: 'landing',
    },
    { onConflict: 'email', ignoreDuplicates: true }
  )

  if (error) {
    console.error('beta signup error', error)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }

  res.json({ ok: true })
})
