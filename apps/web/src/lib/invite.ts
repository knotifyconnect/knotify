// Where we stash an invite code between landing on a link and finishing signup
// (it has to survive the email-confirmation redirect). Stored with a timestamp
// so a stale code from a past visit can't falsely show "X invited you".

const KEY = 'knotify:pendingInvite'
const TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export function writePendingInvite(code: string) {
  const clean = code.trim()
  if (!clean) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, ts: Date.now() }))
  } catch { /* ignore */ }
}

export function readPendingInvite(): string {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return ''
    // Legacy bare-string values (no timestamp) are discarded — they were the
    // source of stale "invited by" banners.
    if (raw[0] !== '{') { localStorage.removeItem(KEY); return '' }
    const parsed = JSON.parse(raw) as { code?: unknown; ts?: unknown }
    if (typeof parsed.code !== 'string' || typeof parsed.ts !== 'number') return ''
    if (Date.now() - parsed.ts > TTL_MS) { localStorage.removeItem(KEY); return '' }
    return parsed.code
  } catch {
    return ''
  }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
