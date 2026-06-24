import { supabase } from '../lib.js'

// The two admin accounts always bypass the gate, in any mode.
export const ADMIN_EMAILS = ['armen.ter-minasyan@tum.de', 'jaydip.gohil@tum.de']

export type AccessMode = 'open' | 'invite_only'

type AccessConfig = { mode: AccessMode; teamCode: string }

// Cache the access config briefly so we don't hit app_settings on every request.
// invalidateAccessCache() is called whenever the admin changes a setting.
let cache: { value: AccessConfig; expiresAt: number } | null = null

export function invalidateAccessCache() { cache = null }

export async function getAccessConfig(): Promise<AccessConfig> {
  const now = Date.now()
  if (cache && now < cache.expiresAt) return cache.value

  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['access_mode', 'team_invite_code', 'beta_open'])

  const settings = new Map((data ?? []).map((r: any) => [r.key, r.value]))

  // Prefer access_mode; fall back to the legacy beta_open boolean.
  let mode: AccessMode
  const rawMode = settings.get('access_mode')
  if (rawMode === 'open' || rawMode === 'invite_only') {
    mode = rawMode
  } else {
    const betaOpen = settings.get('beta_open')
    mode = betaOpen === false || betaOpen === 'false' ? 'invite_only' : 'open'
  }

  const teamCode = String(settings.get('team_invite_code') ?? '').trim().toUpperCase()

  const value: AccessConfig = { mode, teamCode }
  cache = { value, expiresAt: now + 30_000 }
  return value
}

/** Does this code unlock access? (team code, or any real member's invite code) */
export async function isValidAccessCode(code: string | null | undefined): Promise<boolean> {
  const clean = String(code ?? '').trim().toUpperCase()
  if (!clean) return false

  const { teamCode } = await getAccessConfig()
  if (teamCode && clean === teamCode) return true

  const member = await supabase.from('users').select('id').eq('invite_code', clean).maybeSingle()
  return Boolean(member.data)
}

/** Is this email approved on the waitlist? */
async function isApprovedEmail(email: string): Promise<boolean> {
  if (!email) return false
  const { count } = await supabase
    .from('beta_signups')
    .select('id', { count: 'exact', head: true })
    .eq('email', email.toLowerCase())
    .eq('status', 'approved')
  return (count ?? 0) > 0
}

/**
 * Decide whether a brand-new account may be created. Existing users are never
 * evaluated here — they always pass. Order: open mode > admin > valid invite >
 * approved waitlist email.
 */
export async function evaluateNewUserAccess(opts: {
  email: string | null | undefined
  inviteCode: string | null | undefined
}): Promise<{ allowed: boolean }> {
  const { mode } = await getAccessConfig()
  if (mode === 'open') return { allowed: true }

  const email = (opts.email ?? '').toLowerCase()
  if (ADMIN_EMAILS.includes(email)) return { allowed: true }
  if (await isValidAccessCode(opts.inviteCode)) return { allowed: true }
  if (await isApprovedEmail(email)) return { allowed: true }

  return { allowed: false }
}
