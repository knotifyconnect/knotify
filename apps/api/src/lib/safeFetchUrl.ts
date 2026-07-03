import dns from 'node:dns/promises'
import net from 'node:net'

export class UnsafeUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}

// Rejects localhost, private/link-local ranges, and cloud metadata addresses
// so user-supplied URLs can't be used to probe internal network services.
async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http/https links are allowed')
  }
  if (url.hostname.toLowerCase() === 'localhost') {
    throw new UnsafeUrlError('That host is not allowed')
  }

  const records = await dns.lookup(url.hostname, { all: true }).catch(() => [])
  if (records.length === 0) throw new UnsafeUrlError('Could not resolve that host')
  if (records.some((r) => isPrivateIp(r.address))) {
    throw new UnsafeUrlError('That host is not allowed')
  }
  return url
}

const MAX_BODY_BYTES = 3_000_000
// Kept tight because the whole handler (fetch + redirects + Claude extraction)
// has to finish inside Vercel's function execution limit. A slow ATS site or a
// long redirect chain used to be able to blow past that limit, which kills the
// function mid-request — the browser then reports a bare "Failed to fetch"
// instead of a clean error message.
const FETCH_TIMEOUT_MS = 6000

// Many corporate ATS pages (SuccessFactors, Workday, etc.) block obvious bot
// user-agents outright. A normal browser UA gets us the same page a human
// pasting the link would see.
const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchUrlSafely(rawUrl: string, maxRedirects = 2): Promise<{ html: string; finalUrl: string }> {
  let current = await assertSafeExternalUrl(rawUrl)

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await fetch(current.toString(), {
      headers: { 'User-Agent': FETCH_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirected with no location header')
      current = await assertSafeExternalUrl(new URL(location, current).toString())
      continue
    }

    if (!response.ok) throw new Error(`Could not fetch that link (status ${response.status})`)

    const buf = await response.arrayBuffer()
    if (buf.byteLength > MAX_BODY_BYTES) throw new Error('That page is too large to read')

    return { html: Buffer.from(buf).toString('utf-8'), finalUrl: current.toString() }
  }

  throw new Error('Too many redirects')
}

export async function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}
