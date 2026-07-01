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
const FETCH_TIMEOUT_MS = 8000

export async function fetchUrlSafely(rawUrl: string, maxRedirects = 3): Promise<{ html: string; finalUrl: string }> {
  let current = await assertSafeExternalUrl(rawUrl)

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await fetch(current.toString(), {
      headers: { 'User-Agent': 'NodeNet-Bot/1.0 (+https://knotify.pro)' },
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
