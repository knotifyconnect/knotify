import { useState, useEffect, useCallback } from 'react'
import { api, getSecret, setSecret, clearSecret } from './api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface BetaSignup {
  id: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  marketing_consent: boolean
  created_at: string
  source: string
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  signal: '#D8442B',
  ink: '#1a1410',
  inkMuted: '#6b5f55',
  inkFaint: '#a09287',
  paper: '#f5f0e8',
  paperSoft: '#ede8df',
  rule: 'rgba(84,72,58,0.15)',
  verd: '#2d7d46',
  amber: '#b45309',
} as const

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSecret(password)
    try {
      await api.stats()
      onLogin()
    } catch {
      clearSecret()
      setError('Incorrect password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.paper }}>
      <div style={{ width: 360, padding: 40, background: 'white', borderRadius: 16, border: `0.5px solid ${S.rule}`, boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: S.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>
          knotify · admin
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              autoFocus
              placeholder="Admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 40px 10px 14px',
                borderRadius: 8,
                border: `0.5px solid ${S.rule}`,
                fontSize: 14,
                fontFamily: 'IBM Plex Sans',
                outline: 'none',
                background: S.paper,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: S.inkFaint,
                fontFamily: 'IBM Plex Sans',
              }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <div style={{ fontSize: 12, color: S.signal }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              padding: '10px',
              borderRadius: 8,
              background: S.signal,
              color: 'white',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'IBM Plex Sans',
            }}
          >
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: 'white', border: `0.5px solid ${S.rule}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: S.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontFamily: 'IBM Plex Mono', fontWeight: 500, color: color ?? S.ink, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: BetaSignup['status'] }) {
  const map = {
    pending:  { bg: '#fef3c7', color: S.amber,   label: 'Pending' },
    approved: { bg: '#dcfce7', color: S.verd,    label: 'Approved' },
    rejected: { bg: '#fee2e2', color: S.signal,  label: 'Rejected' },
  }
  const s = map[status]
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────
function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [signups, setSignups] = useState<BetaSignup[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, b] = await Promise.all([
        api.stats(),
        api.betaSignups(filter === 'all' ? undefined : filter),
      ])
      setStats(s)
      setSignups(b.signups)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
    setUpdating(id)
    try {
      await api.updateSignup(id, status)
      await load()
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: S.paper }}>
      {/* Header */}
      <div style={{ background: S.ink, color: 'white', padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 13, letterSpacing: '0.08em' }}>knotify · admin</div>
        <button
          onClick={onLogout}
          style={{ background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Sans' }}
        >
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
            <StatCard label="Total signups" value={stats.total} />
            <StatCard label="Pending" value={stats.pending} color={S.amber} />
            <StatCard label="Approved" value={stats.approved} color={S.verd} />
            <StatCard label="Rejected" value={stats.rejected} color={S.signal} />
          </div>
        )}

        {/* Beta signups table */}
        <div style={{ background: 'white', border: `0.5px solid ${S.rule}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ padding: '20px 24px', borderBottom: `0.5px solid ${S.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Beta signups</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'pending', 'approved', 'rejected'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: `0.5px solid ${filter === f ? S.signal : S.rule}`,
                    background: filter === f ? S.signal : 'transparent',
                    color: filter === f ? 'white' : S.inkMuted,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Sans',
                    textTransform: 'capitalize',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: S.inkFaint, fontSize: 13 }}>Loading…</div>
          ) : signups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: S.inkFaint, fontSize: 13 }}>No signups yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${S.rule}` }}>
                  {['Email', 'Status', 'Signed up', 'Consent', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 11, color: S.inkFaint, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signups.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < signups.length - 1 ? `0.5px solid ${S.rule}` : 'none', background: updating === s.id ? S.paperSoft : 'transparent' }}>
                    <td style={{ padding: '14px 24px', fontSize: 14, fontFamily: 'IBM Plex Mono' }}>{s.email}</td>
                    <td style={{ padding: '14px 24px' }}><StatusBadge status={s.status} /></td>
                    <td style={{ padding: '14px 24px', fontSize: 13, color: S.inkMuted }}>
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '14px 24px', fontSize: 13, color: s.marketing_consent ? S.verd : S.inkFaint }}>
                      {s.marketing_consent ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '14px 24px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {s.status !== 'approved' && (
                          <button
                            onClick={() => updateStatus(s.id, 'approved')}
                            disabled={updating === s.id}
                            style={{ padding: '4px 12px', borderRadius: 6, border: `0.5px solid ${S.verd}`, background: 'transparent', color: S.verd, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans' }}
                          >
                            Approve
                          </button>
                        )}
                        {s.status !== 'rejected' && (
                          <button
                            onClick={() => updateStatus(s.id, 'rejected')}
                            disabled={updating === s.id}
                            style={{ padding: '4px 12px', borderRadius: 6, border: `0.5px solid ${S.rule}`, background: 'transparent', color: S.inkMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'IBM Plex Sans' }}
                          >
                            Reject
                          </button>
                        )}
                        {s.status !== 'pending' && (
                          <button
                            onClick={() => updateStatus(s.id, 'pending')}
                            disabled={updating === s.id}
                            style={{ padding: '4px 12px', borderRadius: 6, border: `0.5px solid ${S.rule}`, background: 'transparent', color: S.inkFaint, fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Sans' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function App() {
  const [authed, setAuthed] = useState(() => !!getSecret())

  function handleLogout() {
    clearSecret()
    setAuthed(false)
  }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />
  return <AdminApp onLogout={handleLogout} />
}
