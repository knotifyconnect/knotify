import type { NextFunction, Request, Response } from 'express'
import { supabase } from '../lib.js'

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

  // Try SDK first (fastest path when it works)
  const { data: { user: sdkUser } } = await supabase.auth.getUser(token)

  const authId = sdkUser?.id ?? (await validateTokenHttp(token))?.id

  if (!authId) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Build the minimal user object expected downstream
  const authUser = sdkUser ?? { id: authId, email: undefined, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' }

  const lookup = await supabase.from('users').select('id, is_admin, is_hr').eq('auth_id', authId).maybeSingle()

  req.authUser = authUser as typeof req.authUser
  req.appUserId = lookup.data?.id
  req.isAdmin = Boolean(lookup.data?.is_admin)
  req.isHr = Boolean(lookup.data?.is_hr)
  next()
}

/** Gate that requires the caller's profile row to have is_admin = true. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.appUserId) return res.status(401).json({ error: 'Unauthorized' })
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' })
  next()
}
