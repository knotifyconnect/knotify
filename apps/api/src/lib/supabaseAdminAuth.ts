import type { User } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

type AdminAuthError = Error & { status?: number; code?: string }

export type AuthUsersPage = {
  users: User[]
  total: number
  nextPage: number | null
  lastPage: number
}

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw adminAuthError('Supabase Auth administration is not configured.', 503, 'admin_auth_not_configured')
  }
  return { url: SUPABASE_URL, key: SUPABASE_SECRET_KEY }
}

function adminAuthError(message: string, status = 500, code = 'admin_auth_failed') {
  const error = new Error(message) as AdminAuthError
  error.status = status
  error.code = code
  return error
}

function readableError(payload: unknown, status: number) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>
    for (const key of ['message', 'msg', 'error_description', 'error']) {
      const value = body[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return `Supabase Auth Admin API returned ${status} without an error message.`
}

function authHeaders(key: string, includeBearer: boolean, withJson: boolean) {
  const headers: Record<string, string> = { apikey: key }
  if (includeBearer) headers.Authorization = `Bearer ${key}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

async function parseBody(response: Response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) as unknown }
  catch { return text }
}

async function adminAuthRequest(path: string, init: RequestInit = {}) {
  const { url, key } = requireConfig()
  const isSecretKey = key.startsWith('sb_secret_')
  const withJson = init.body !== undefined

  // New sb_secret_* values are API keys, not JWTs. Sending one as a Bearer
  // token is rejected by newer Supabase gateways. Legacy service_role JWTs
  // still require the Authorization header.
  let response = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: { ...authHeaders(key, !isSecretKey, withJson), ...init.headers },
    signal: AbortSignal.timeout(15_000),
  })

  // Some older hosted Auth gateways still expect both headers. Retrying only
  // an authorization failure keeps this compatible during key migrations.
  if (isSecretKey && (response.status === 401 || response.status === 403)) {
    response = await fetch(`${url}/auth/v1${path}`, {
      ...init,
      headers: { ...authHeaders(key, true, withJson), ...init.headers },
      signal: AbortSignal.timeout(15_000),
    })
  }

  const body = await parseBody(response)
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : response.status
    const code = response.status === 401 || response.status === 403
      ? 'admin_auth_permission_denied'
      : 'admin_auth_failed'
    throw adminAuthError(readableError(body, response.status), status, code)
  }
  return { body, headers: response.headers }
}

export async function listAuthUsers(page = 1, perPage = 1000): Promise<AuthUsersPage> {
  const result = await adminAuthRequest(`/admin/users?page=${page}&per_page=${perPage}`)
  const payload = result.body as { users?: User[] } | User[] | null
  const users = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : []
  const totalHeader = Number(result.headers.get('x-total-count'))
  const total = Number.isFinite(totalHeader) && totalHeader >= 0 ? totalHeader : users.length
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  return { users, total, nextPage: page < lastPage ? page + 1 : null, lastPage }
}

export async function getAuthUser(authId: string): Promise<User> {
  const result = await adminAuthRequest(`/admin/users/${encodeURIComponent(authId)}`)
  const payload = result.body as { user?: User } | User | null
  const user = payload && 'user' in payload ? payload.user : payload
  if (!user || typeof user !== 'object' || !('id' in user)) {
    throw adminAuthError('Supabase returned an invalid Auth user response.', 502, 'admin_auth_invalid_response')
  }
  return user as User
}

export async function getAuthUsersByIds(authIds: string[], concurrency = 8) {
  const uniqueIds = [...new Set(authIds.filter(Boolean))]
  const users = new Map<string, User>()
  const failures: { authId: string; message: string; code: string }[] = []
  const batchSize = Math.max(1, Math.min(concurrency, 16))

  for (let start = 0; start < uniqueIds.length; start += batchSize) {
    const batch = uniqueIds.slice(start, start + batchSize)
    const results = await Promise.allSettled(batch.map((authId) => getAuthUser(authId)))
    for (let index = 0; index < results.length; index++) {
      const result = results[index]
      const authId = batch[index]
      if (result.status === 'fulfilled') {
        users.set(authId, result.value)
      } else {
        const detail = describeAdminAuthError(result.reason)
        failures.push({ authId, message: detail.message, code: detail.code })
      }
    }
  }

  return { users, failures, checked: uniqueIds.length }
}

export async function setAuthUserBan(authId: string, banDuration: string): Promise<User> {
  const result = await adminAuthRequest(`/admin/users/${encodeURIComponent(authId)}`, {
    method: 'PUT', body: JSON.stringify({ ban_duration: banDuration }),
  })
  const payload = result.body as { user?: User } | User | null
  const user = payload && 'user' in payload ? payload.user : payload
  if (!user || typeof user !== 'object' || !('id' in user)) {
    throw adminAuthError('Supabase returned an invalid Auth update response.', 502, 'admin_auth_invalid_response')
  }
  return user as User
}

export async function deleteAuthUser(authId: string): Promise<void> {
  await adminAuthRequest(`/admin/users/${encodeURIComponent(authId)}`, {
    method: 'DELETE', body: JSON.stringify({ should_soft_delete: false }),
  })
}

export function describeAdminAuthError(error: unknown) {
  if (error instanceof Error) {
    const typed = error as AdminAuthError
    return {
      message: typed.message || 'Supabase Auth administration failed.',
      status: typed.status ?? 500,
      code: typed.code ?? 'admin_auth_failed',
    }
  }
  return { message: 'Supabase Auth administration failed.', status: 500, code: 'admin_auth_failed' }
}
