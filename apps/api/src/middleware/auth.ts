import type { NextFunction, Request, Response } from 'express'
import { supabase } from '../lib.js'

// Cache beta_open setting for 30s to avoid a DB hit on every request.
let betaOpenCache: { value: boolean; expiresAt: number } | null = null

async function isBetaOpen(): Promise<boolean> {
  const now = Date.now()
  if (betaOpenCache && now < betaOpenCache.expiresAt) return betaOpenCache.value
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'beta_open').maybeSingle()
  const value = data?.value === true || data?.value === 'true' || data?.value == null
  betaOpenCache = { value, expiresAt: now + 30_000 }
  return value
}

// Call this from the admin settings PATCH to invalidate cache immediately.
export function invalidateBetaCache() { betaOpenCache = null }

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Validate a bearer token directly against the Supabase Auth HTTP API.
 * This bypasses the JS SDK entirely, avoiding any version-related quirks
 * with how getUser() handles the new sb_secret_* / sb_publishable_* key formats.
 */
async function validateTokenHttp(token: string): Promise<{ id: string; email?: string } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
    })
    if (!res.ok) {
      console.warn(`[auth] HTTP validation failed: ${res.status}`)
      return null
    }
    const data = await res.json() as { id: string; email?: string }
    return data.id ? data : null
  } catch (err) {
    console.error('[auth] HTTP validation error:', err)
    return null
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: { user: sdkUser } } = await supabase.auth.getUser(token)
  const httpUser = sdkUser ? null : await validateTokenHttp(token)

  const authId = sdkUser?.id ?? httpUser?.id
  const authEmail = sdkUser?.email ?? httpUser?.email

  if (!authId) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const authUser = sdkUser ?? {
    id: authId,
    email: authEmail,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '',
  }

  let lookup = (await supabase
    .from('users')
    .select('id, is_admin, is_hr')
    .eq('auth_id', authId)
    .maybeSingle()).data

  if (!lookup) {
    const email = authEmail ?? `user-${authId.slice(0, 8)}@unknown.app`
    const baseUsername = `user_${authId.replace(/-/g, '').slice(0, 12)}`
    const stem = (email.split('@')[0] ?? 'New user').replace(/[._+-]+/g, ' ')
    const fullName = stem.charAt(0).toUpperCase() + stem.slice(1)

    const ADMIN_EMAILS = ['armen.ter-minasyan@tum.de', 'jaydip.gohil@tum.de']
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase())

    const insert = await supabase
      .from('users')
      .insert({
        auth_id: authId,
        email,
        username: baseUsername,
        full_name: fullName,
        location_city: 'Munich',
        status: 'open_to_work',
        is_admin: isAdmin,
      })
      .select('id, is_admin, is_hr')
      .single()

    if (insert.error) {
      const retry = await supabase
        .from('users')
        .select('id, is_admin, is_hr')
        .eq('auth_id', authId)
        .maybeSingle()

      if (retry.data) {
        lookup = retry.data
      } else {
        console.error('[auth] profile auto-create failed:', insert.error)
        return res.status(500).json({ error: insert.error.message })
      }
    } else {
      lookup = insert.data
    }
  }

  req.authUser = authUser as typeof req.authUser
  req.appUserId = lookup.id
  req.isAdmin = Boolean(lookup.is_admin)
  req.isHr = Boolean(lookup.is_hr)

  // Beta gate: when closed, only admins + approved beta signups can proceed.
  if (!lookup.is_admin) {
    const open = await isBetaOpen()
    if (!open) {
      const email = (authEmail ?? '').toLowerCase()
      const approved = await supabase
        .from('beta_signups')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .eq('status', 'approved')
      if ((approved.count ?? 0) === 0) {
        return res.status(403).json({ error: 'beta_closed', message: 'Access is currently invite-only. You are on the waitlist.' })
      }
    }
  }

  next()
}

/** Gate that requires the caller's profile row to have is_admin = true. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' })
  next()
}
