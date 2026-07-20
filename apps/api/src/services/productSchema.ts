import { supabase } from '../lib.js'

export type ProductSchemaCapabilities = {
  activitySessions: boolean
  jobsVisibility: boolean
  jobReferralRequests: boolean
  checkedAt: string
}

type SchemaError = { code?: string | null; message?: string | null; details?: string | null }

const CACHE_MS = 60_000
let cached: { expiresAt: number; value: ProductSchemaCapabilities } | null = null

export function isMissingSchemaError(error: SchemaError | null | undefined) {
  if (!error) return false
  if (['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return true
  const detail = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return detail.includes('does not exist') || detail.includes('schema cache') || detail.includes('could not find the table') || detail.includes('could not find the column')
}

async function supports(label: string, query: PromiseLike<{ error: SchemaError | null }>) {
  const result = await query
  if (!result.error) return true
  if (isMissingSchemaError(result.error)) return false
  throw new Error(`Could not inspect ${label}: ${result.error.message ?? 'unknown database error'}`)
}

/**
 * Runtime schema negotiation protects the product during rolling deploys.
 * Code and database migrations are released independently on Vercel/Supabase;
 * new features must never make existing sections unusable while the schema is
 * catching up. The short cache also lets a freshly applied migration become
 * active without restarting every serverless instance.
 */
export async function getProductSchemaCapabilities(force = false): Promise<ProductSchemaCapabilities> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value

  const [activitySessions, jobsVisibility, jobReferralRequests] = await Promise.all([
    supports('activity session schema', supabase.from('user_activity_sessions').select('id, user_id, session_key, started_at, last_seen_at, active_seconds, is_active, page_views, last_path, device_type, updated_at').limit(1)),
    supports('job visibility schema', supabase.from('jobs').select('id, visibility').limit(1)),
    supports('job referral request schema', supabase.from('job_referral_requests').select('id, job_id, requester_id, recipient_id, via_user_id, note, status, created_at, updated_at').limit(1)),
  ])

  const value = {
    activitySessions,
    jobsVisibility,
    jobReferralRequests,
    checkedAt: new Date().toISOString(),
  }
  cached = { value, expiresAt: Date.now() + CACHE_MS }
  return value
}

export async function getProductSchemaCapabilitiesSafe(context: string): Promise<ProductSchemaCapabilities> {
  try {
    return await getProductSchemaCapabilities()
  } catch (error) {
    console.warn(`[${context}] product schema capability check failed; using legacy-compatible behavior:`, error)
    return {
      activitySessions: false,
      jobsVisibility: false,
      jobReferralRequests: false,
      checkedAt: new Date().toISOString(),
    }
  }
}
