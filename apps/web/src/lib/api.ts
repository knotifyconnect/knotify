import { useSessionStore } from '../store/session'

const EXPLICIT_API_URL = (
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL
)?.trim()
const IS_DEVELOPMENT = import.meta.env.DEV
let resolvedApiBase: string | null = EXPLICIT_API_URL ? normalizeBase(EXPLICIT_API_URL) : null

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly url: string

  constructor({ status, code, url, message }: { status: number; code: string | null; url: string; message: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.url = url
  }
}

function normalizeBase(base: string) {
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function candidateApiBases() {
  const bases: string[] = []
  const browserOrigin =
    typeof window !== 'undefined'
      ? normalizeBase(window.location.origin)
      : null

  // In development, same-origin /api requests go through Vite's proxy.
  // This avoids CORS drift and makes the local API target deterministic.
  if (IS_DEVELOPMENT && browserOrigin) bases.push(browserOrigin)

  if (resolvedApiBase) bases.push(resolvedApiBase)
  if (EXPLICIT_API_URL) bases.push(normalizeBase(EXPLICIT_API_URL))

  if (browserOrigin && !IS_DEVELOPMENT) {
    bases.push(browserOrigin)
  }

  if (IS_DEVELOPMENT) {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol
      const host = window.location.hostname

      bases.push(`${protocol}//${host}:3002`)
      bases.push(`${protocol}//${host}:3001`)
      if (host !== 'localhost') {
        bases.push(`${protocol}//localhost:3002`)
        bases.push(`${protocol}//localhost:3001`)
      }
      if (host !== '127.0.0.1') {
        bases.push(`${protocol}//127.0.0.1:3002`)
        bases.push(`${protocol}//127.0.0.1:3001`)
      }
    } else {
      bases.push('http://localhost:3002')
      bases.push('http://localhost:3001')
    }
  }

  return Array.from(new Set(bases.map(normalizeBase)))
}

function isHtmlResponse(res: Response) {
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
  return contentType.includes('text/html')
}

function isIdempotentMethod(method: string) {
  return method === 'GET' || method === 'HEAD'
}

function shouldFallback(
  res: Response,
  index: number,
  total: number,
  path: string,
  base: string,
  method: string
) {
  if (index >= total - 1) return false
  if (!path.startsWith('/api/')) return false

  if (res.ok && isHtmlResponse(res)) return true
  if (res.status >= 500 && isIdempotentMethod(method)) return true
  // Vercel platform 404 (NOT_FOUND HTML page), try next candidate.
  // Do NOT fallback on plain-JSON 404 from the real API (legitimate "not found").
  if (
    res.status === 404 &&
    (
      isHtmlResponse(res) ||
      (
        IS_DEVELOPMENT &&
        typeof window !== 'undefined' &&
        normalizeBase(base) === normalizeBase(window.location.origin)
      )
    )
  ) return true
  // 405 from static-host SPA rejecting POST on /api/* path
  if (res.status === 405) return true

  return false
}

type ApiRequestOptions = {
  timeoutMs?: number
}

const DEFAULT_API_TIMEOUT_MS = 15_000
const DEFAULT_STALE_TTL_MS = 5 * 60_000
const responseCache = new Map<string, { expiresAt: number; staleUntil: number; value: unknown }>()
const inFlightGets = new Map<string, Promise<unknown>>()
let cacheGeneration = 0

function cacheKey(path: string) {
  const token = useSessionStore.getState().token
  return token ? `${token}:${path}` : `public:${path}`
}

function cacheKeyPath(key: string) {
  const separatorIndex = key.indexOf(':')
  return separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key
}

export function invalidateApiCache(pathPrefix?: string) {
  cacheGeneration += 1

  if (!pathPrefix) {
    responseCache.clear()
    inFlightGets.clear()
    return
  }

  for (const key of responseCache.keys()) {
    if (cacheKeyPath(key).startsWith(pathPrefix)) responseCache.delete(key)
  }

  for (const key of inFlightGets.keys()) {
    if (cacheKeyPath(key).startsWith(pathPrefix)) inFlightGets.delete(key)
  }
}

export function getApiCacheSnapshot<T>(
  path: string,
  { allowStale = true }: { allowStale?: boolean } = {}
): T | null {
  const cached = responseCache.get(cacheKey(path))
  if (!cached) return null

  const now = Date.now()
  if (cached.expiresAt > now || (allowStale && cached.staleUntil > now)) {
    return cached.value as T
  }

  return null
}

export function setApiCacheSnapshot<T>(
  path: string,
  value: T,
  { ttlMs = 10_000, staleMs = DEFAULT_STALE_TTL_MS }: { ttlMs?: number; staleMs?: number } = {}
) {
  responseCache.set(cacheKey(path), {
    expiresAt: Date.now() + ttlMs,
    staleUntil: Date.now() + Math.max(ttlMs, staleMs),
    value,
  })
}

async function fetchApi(
  path: string,
  init: RequestInit,
  options: ApiRequestOptions = {}
) {
  const candidates = candidateApiBases()
  const method = (init.method ?? 'GET').toUpperCase()
  const canRetryNetworkError = isIdempotentMethod(method)
  let lastNetworkError: Error | null = null

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i]

    const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (
        shouldFallback(
          res,
          i,
          candidates.length,
          path,
          base,
          method
        )
      ) {
        // Bad base, invalidate the cache so subsequent calls re-resolve
        if (resolvedApiBase === base) resolvedApiBase = null
        continue
      }
      resolvedApiBase = base
      return res
    } catch (error) {
      clearTimeout(timer)
      const err =
        error instanceof Error
          ? error
          : new Error('Network request failed')

      if (err.name === 'AbortError') {
        throw new Error(
          `Request to ${base}${path} timed out after ${timeoutMs}ms`
        )
      }

      lastNetworkError = err

      if (
        !canRetryNetworkError ||
        i === candidates.length - 1
      ) {
        throw lastNetworkError
      }
    }
  }

  throw lastNetworkError ?? new Error('API unreachable')
}

async function authHeaders() {
  // Prefer the Zustand store token, it's set synchronously by onAuthStateChange
  // so it's always available immediately after login, with no race condition.
  const zustandToken = useSessionStore.getState().token
  if (zustandToken) {
    return { Authorization: `Bearer ${zustandToken}` } as Record<string, string>
  }

  // Fallback: ask Supabase directly (covers cold-start edge cases) without
  // keeping the Supabase client in the public landing-page entry chunk.
  const { supabase } = await import('./supabase')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function buildError(res: Response) {
  const text = await res.text()
  let code: string | null = null
  let detail = text.slice(0, 300)

  if (text) {
    try {
      const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
      code = typeof payload.error === 'string' ? payload.error : null
      if (typeof payload.message === 'string' && payload.message.trim()) {
        detail = payload.message.trim()
      } else if (code) {
        detail = code
      }
    } catch {
      // Non-JSON responses keep their truncated response text as the detail.
    }
  }

  // Do NOT force sign-out on 401 here, it causes a logout loop right after login
  // because the API call from AppSidebar can race ahead of the session being ready.
  // Token expiry is handled naturally by onAuthStateChange(SIGNED_OUT) from Supabase.
  const prefix = `[${res.status}] ${res.statusText} @ ${res.url}`
  const message = detail ? `${prefix}, ${detail}` : prefix
  return new ApiError({ status: res.status, code, url: res.url, message })
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, { headers })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}

export async function apiGetCached<T>(
  path: string,
  { ttlMs = 10_000, staleMs = DEFAULT_STALE_TTL_MS }: { ttlMs?: number; staleMs?: number } = {}
): Promise<T> {
  const key = cacheKey(path)
  const now = Date.now()
  const cached = responseCache.get(key)

  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  const inFlight = inFlightGets.get(key)
  if (inFlight) return inFlight as Promise<T>

  const requestGeneration = cacheGeneration
  const request = apiGet<T>(path)
    .then((value) => {
      if (ttlMs > 0 && requestGeneration === cacheGeneration) {
        responseCache.set(key, {
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + Math.max(ttlMs, staleMs),
          value,
        })
      }

      return value
    })
    .finally(() => {
      if (inFlightGets.get(key) === request) {
        inFlightGets.delete(key)
      }
    })

  inFlightGets.set(key, request)
  return request
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  const data = await res.json() as T
  invalidateApiCache()
  return data
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  const data = await res.json() as T
  invalidateApiCache()
  return data
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  const data = await res.json() as T
  invalidateApiCache()
  return data
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw await buildError(res)
  invalidateApiCache()
}

export async function apiPostForm<T>(
  path: string,
  formData: FormData,
  options: ApiRequestOptions = {}
): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'POST',
    headers,
    body: formData,
  }, options)
  if (!res.ok) throw await buildError(res)
  const data = await res.json() as T
  invalidateApiCache()
  return data
}
