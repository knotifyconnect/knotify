import { supabase } from './supabase'
import { useSessionStore } from '../store/session'

const EXPLICIT_API_URL = import.meta.env.VITE_API_URL?.trim()
let resolvedApiBase: string | null = EXPLICIT_API_URL ? normalizeBase(EXPLICIT_API_URL) : null

function normalizeBase(base: string) {
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function candidateApiBases() {
  const bases: string[] = []

  if (resolvedApiBase) bases.push(resolvedApiBase)
  if (EXPLICIT_API_URL) bases.push(normalizeBase(EXPLICIT_API_URL))

  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    const protocol = window.location.protocol
    const host = window.location.hostname

    bases.push(origin)
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

  return Array.from(new Set(bases.map(normalizeBase)))
}

function isHtmlResponse(res: Response) {
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? ''
  return contentType.includes('text/html')
}

function shouldFallback(res: Response, index: number, total: number, path: string) {
  if (index >= total - 1) return false
  if (!path.startsWith('/api/')) return false

  if (res.ok && isHtmlResponse(res)) return true
  if (res.status >= 500) return true
  // Vercel platform 404 (NOT_FOUND HTML page) — try next candidate.
  // Do NOT fallback on plain-JSON 404 from the real API (legitimate "not found").
  if (res.status === 404 && isHtmlResponse(res)) return true
  // 405 from static-host SPA rejecting POST on /api/* path
  if (res.status === 405) return true

  return false
}

async function fetchApi(path: string, init: RequestInit) {
  const candidates = candidateApiBases()
  let lastNetworkError: Error | null = null

  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i]

    // 15s timeout via AbortController — prevents hung requests from blocking the UI
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal })
      clearTimeout(timer)
      if (shouldFallback(res, i, candidates.length, path)) {
        // Bad base — invalidate the cache so subsequent calls re-resolve
        if (resolvedApiBase === base) resolvedApiBase = null
        continue
      }
      resolvedApiBase = base
      return res
    } catch (error) {
      clearTimeout(timer)
      const err = error instanceof Error ? error : new Error('Network request failed')
      // Annotate timeout errors clearly
      if (err.name === 'AbortError') {
        lastNetworkError = new Error(`Request to ${base}${path} timed out after 15s`)
      } else {
        lastNetworkError = err
      }
      if (i === candidates.length - 1) throw lastNetworkError
    }
  }

  throw lastNetworkError ?? new Error('API unreachable')
}

async function authHeaders() {
  // Prefer the Zustand store token — it's set synchronously by onAuthStateChange
  // so it's always available immediately after login, with no race condition.
  const zustandToken = useSessionStore.getState().token
  if (zustandToken) {
    return { Authorization: `Bearer ${zustandToken}` } as Record<string, string>
  }

  // Fallback: ask Supabase directly (covers SSR / cold-start edge cases)
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
  // Do NOT force sign-out on 401 here — it causes a logout loop right after login
  // because the API call from AppSidebar can race ahead of the session being ready.
  // Token expiry is handled naturally by onAuthStateChange(SIGNED_OUT) from Supabase.
  const prefix = `[${res.status}] ${res.statusText} @ ${res.url}`
  return new Error(text ? `${prefix} — ${text.slice(0, 300)}` : prefix)
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, { headers })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw await buildError(res)
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const headers = await authHeaders()
  const res = await fetchApi(path, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) throw await buildError(res)
  return res.json() as Promise<T>
}
