import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type ConfirmedAuthUser = {
  email_confirmed_at?: string | null
  confirmed_at?: string | null
}

// The SDK's parsed User object (e.g. from signInWithPassword's response) can
// come back with email_confirmed_at/confirmed_at missing under the new
// sb_publishable_/sb_secret_ key format — the same quirk the API server works
// around by bypassing the SDK for getUser() (see apps/api/src/middleware/auth.ts).
// Hit the Auth HTTP API directly instead of trusting the SDK-parsed fields.
export async function fetchConfirmedAuthUser(accessToken: string): Promise<ConfirmedAuthUser | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) return null
    return await res.json() as ConfirmedAuthUser
  } catch {
    return null
  }
}
