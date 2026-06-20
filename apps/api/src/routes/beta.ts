import { Router } from 'express'
import { supabase } from '../lib.js'

export const betaRouter = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

betaRouter.post('/', async (req, res) => {
  const { email, marketing_consent } = req.body

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' })
  }

  if (marketing_consent !== true) {
    return res.status(400).json({ error: 'Consent is required to join the beta.' })
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    null

  const { error } = await supabase.from('beta_signups').upsert(
    {
      email: email.toLowerCase().trim(),
      marketing_consent: true,
      consent_version: 'v1',
      consent_given_at: new Date().toISOString(),
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
