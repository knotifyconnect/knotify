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

export type ResolvedInvite =
  | { kind: 'team'; inviterId: null; inviterName: null; email: null }
  | { kind: 'member'; inviterId: string; inviterName: string; email: null }
  | { kind: 'email'; inviterId: string; inviterName: string; email: string }

/**
 * Figure out what an invite code/token is: the team test code, a member's
 * reusable shareable code, or a verified one-time email-invite token. Email
 * tokens carry the address they were issued to, so the gate can require a match.
 */
export async function resolveInviteCode(code: string | null | undefined): Promise<ResolvedInvite | null> {
  const clean = String(code ?? '').trim().toUpperCase()
  if (!clean) return null

  const { teamCode } = await getAccessConfig()
  if (teamCode && clean === teamCode) return { kind: 'team', inviterId: null, inviterName: null, email: null }

  // Member shareable code (7-char) lives on the user row.
  const member = await supabase.from('users').select('id, full_name').eq('invite_code', clean).maybeSingle()
  if (member.data) {
    const firstName = (member.data.full_name || '').trim().split(/\s+/)[0] || 'A member'
    return { kind: 'member', inviterId: member.data.id, inviterName: firstName, email: null }
  }

  // Verified email-invite token (longer, unguessable, case-sensitive). Matched
  // via parameterized .eq() to avoid any PostgREST filter injection from the
  // user-supplied code.
  const raw = String(code ?? '').trim()
  const ei = await supabase
    .from('email_invites')
    .select('inviter_id, email, status')
    .eq('token', raw)
    .eq('status', 'pending')
    .maybeSingle()
  if (ei.data) {
    const inviter = await supabase.from('users').select('full_name').eq('id', ei.data.inviter_id).maybeSingle()
    const firstName = (inviter.data?.full_name || '').trim().split(/\s+/)[0] || 'A member'
    return { kind: 'email', inviterId: ei.data.inviter_id, inviterName: firstName, email: String(ei.data.email).toLowerCase() }
  }

  return null
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
 * approved waitlist email. A verified email invite only unlocks access for the
 * exact address it was issued to.
 */
export async function evaluateNewUserAccess(opts: {
  email: string | null | undefined
  inviteCode: string | null | undefined
}): Promise<{ allowed: boolean }> {
  const { mode } = await getAccessConfig()
  if (mode === 'open') return { allowed: true }

  const email = (opts.email ?? '').toLowerCase()
  if (ADMIN_EMAILS.includes(email)) return { allowed: true }

  const invite = await resolveInviteCode(opts.inviteCode)
  if (invite) {
    if (invite.kind === 'email') {
      // Verified invite: only the addressed person gets in with it.
      if (email && email === invite.email) return { allowed: true }
    } else {
      return { allowed: true }
    }
  }

  if (await isApprovedEmail(email)) return { allowed: true }

  return { allowed: false }
}
