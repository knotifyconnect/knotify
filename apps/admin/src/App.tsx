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

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  signal:    '#D8442B',
  signalSoft:'rgba(216,68,43,0.08)',
  ink:       '#1a1410',
  inkMuted:  '#6b5f55',
  inkFaint:  '#a09287',
  paper:     '#f5f0e8',
  paperSoft: '#ede8df',
  white:     '#ffffff',
  rule:      'rgba(84,72,58,0.14)',
  ruleSoft:  'rgba(84,72,58,0.08)',
  verd:      '#2d7d46',
  verdSoft:  'rgba(45,125,70,0.1)',
  amber:     '#b45309',
  amberSoft: 'rgba(180,83,9,0.1)',
  radius:    '14px',
  radiusSm:  '8px',
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function KnotifyMark({ size = 24, color = T.signal }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 4 C 22 4, 26 8, 26 14 C 26 20, 22 24, 16 24 C 10 24, 6 20, 6 14
           M 16 4 C 12 8, 12 14, 16 18 C 20 22, 26 22, 28 18
           M 6 14 C 10 14, 14 18, 14 22"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Logo({ size = 20, light = false }: { size?: number; light?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, lineHeight: 1 }}>
      <KnotifyMark size={size} color={light ? T.signal : T.signal} />
      <span style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontStyle: 'italic',
        fontSize: size,
        fontWeight: 400,
        letterSpacing: '-0.03em',
        color: light ? '#fff' : T.ink,
        lineHeight: 1,
        userSelect: 'none',
      }}>
        knotify
      </span>
    </span>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function Badge({ status }: { status: BetaSignup['status'] }) {
  const map = {
    pending:  { bg: T.amberSoft, color: T.amber,  label: 'Pending' },
    approved: { bg: T.verdSoft,  color: T.verd,   label: 'Approved' },
    rejected: { bg: T.signalSoft,color: T.signal, label: 'Rejected' },
  }
  const s = map[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }: { label: string; value: number; color?: string; sub?: string }) {
  return (
    <div style={{
      background: T.white,
      border: `0.5px solid ${T.rule}`,
      borderRadius: T.radius,
      padding: '22px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ fontSize: 10.5, color: T.inkFaint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Fraunces', Georgia, serif",
        fontSize: 42,
        fontWeight: 400,
        color: color ?? T.ink,
        lineHeight: 1,
        letterSpacing: '-0.03em',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.inkFaint }}>{sub}</div>}
    </div>
  )
}

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
    <div style={{
      minHeight: '100vh',
      background: T.paper,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Logo above card */}
      <div style={{ marginBottom: 32 }}>
        <Logo size={22} />
      </div>

      <div style={{
        width: '100%',
        maxWidth: 380,
        background: T.white,
        borderRadius: 20,
        border: `0.5px solid ${T.rule}`,
        boxShadow: '0 12px 40px rgba(40,30,20,0.07)',
        padding: '36px 32px',
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 24,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: T.ink,
            marginBottom: 6,
          }}>
            Admin access
          </div>
          <div style={{ fontSize: 13, color: T.inkMuted }}>
            Enter your admin password to continue.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              autoFocus
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 44px 11px 14px',
                borderRadius: T.radiusSm,
                border: `0.5px solid ${error ? T.signal : T.rule}`,
                fontSize: 14,
                fontFamily: 'IBM Plex Sans, sans-serif',
                outline: 'none',
                background: T.paper,
                color: T.ink,
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: T.inkFaint, fontFamily: 'IBM Plex Sans, sans-serif',
                padding: 0,
              }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: T.signal, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>✕</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              padding: '11px',
              borderRadius: T.radiusSm,
              background: loading || !password ? T.inkFaint : T.signal,
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Sans, sans-serif',
              transition: 'background 0.15s',
              marginTop: 4,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: T.inkFaint }}>
        knotify · Munich · Admin only
      </div>
    </div>
  )
}

// ── Admin app ─────────────────────────────────────────────────────────────────
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

  const filters = ['all', 'pending', 'approved', 'rejected']

  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: 'IBM Plex Sans, sans-serif' }}>

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(245,240,232,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `0.5px solid ${T.rule}`,
        padding: '0 32px',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo size={18} />
          <div style={{
            width: 1, height: 16, background: T.rule,
          }} />
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: T.inkFaint,
          }}>
            Admin
          </span>
        </div>

        <button
          onClick={onLogout}
          style={{
            background: 'transparent',
            border: `0.5px solid ${T.rule}`,
            color: T.inkMuted,
            borderRadius: T.radiusSm,
            padding: '5px 14px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'IBM Plex Sans, sans-serif',
          }}
        >
          Sign out
        </button>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px' }}>

        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: T.ink,
            margin: 0,
          }}>
            Beta signups
          </h1>
          <p style={{ fontSize: 13, color: T.inkMuted, marginTop: 6 }}>
            Manage who gets access to the knotify private beta.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
            <StatCard label="Total signups" value={stats.total} />
            <StatCard label="Pending review" value={stats.pending} color={T.amber} sub="awaiting decision" />
            <StatCard label="Approved" value={stats.approved} color={T.verd} sub="have access" />
            <StatCard label="Rejected" value={stats.rejected} color={T.signal} sub="declined" />
          </div>
        )}

        {/* Table */}
        <div style={{
          background: T.white,
          border: `0.5px solid ${T.rule}`,
          borderRadius: T.radius,
          overflow: 'hidden',
        }}>
          {/* Table toolbar */}
          <div style={{
            padding: '18px 24px',
            borderBottom: `0.5px solid ${T.rule}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
              {filter === 'all' ? 'All signups' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} signups`}
              {stats && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: T.inkFaint }}>
                  {filter === 'all' ? stats.total : filter === 'pending' ? stats.pending : filter === 'approved' ? stats.approved : stats.rejected} total
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              {filters.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '5px 13px',
                    borderRadius: 999,
                    border: `0.5px solid ${filter === f ? T.signal : T.rule}`,
                    background: filter === f ? T.signal : 'transparent',
                    color: filter === f ? '#fff' : T.inkMuted,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Sans, sans-serif',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 56, textAlign: 'center', color: T.inkFaint, fontSize: 13 }}>
              Loading…
            </div>
          ) : signups.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 20,
                color: T.inkFaint,
                marginBottom: 8,
              }}>
                No signups yet.
              </div>
              <div style={{ fontSize: 13, color: T.inkFaint }}>
                Share knotify.pro to start collecting requests.
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${T.ruleSoft}` }}>
                  {['Email', 'Status', 'Signed up', 'Consent', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: '10px 24px',
                      textAlign: 'left',
                      fontSize: 10.5,
                      color: T.inkFaint,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 500,
                      background: T.paperSoft,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signups.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: i < signups.length - 1 ? `0.5px solid ${T.ruleSoft}` : 'none',
                      background: updating === s.id ? T.paperSoft : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ padding: '16px 24px', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', color: T.ink }}>
                      {s.email}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <Badge status={s.status} />
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: 13, color: T.inkMuted }}>
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: 13, color: s.marketing_consent ? T.verd : T.inkFaint }}>
                      {s.marketing_consent ? '✓ Yes' : '— No'}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {s.status !== 'approved' && (
                          <button
                            onClick={() => updateStatus(s.id, 'approved')}
                            disabled={updating === s.id}
                            style={{
                              padding: '5px 13px', borderRadius: 6,
                              border: `0.5px solid ${T.verd}`,
                              background: T.verdSoft, color: T.verd,
                              fontSize: 12, fontWeight: 500, cursor: 'pointer',
                              fontFamily: 'IBM Plex Sans, sans-serif',
                            }}
                          >
                            Approve
                          </button>
                        )}
                        {s.status !== 'rejected' && (
                          <button
                            onClick={() => updateStatus(s.id, 'rejected')}
                            disabled={updating === s.id}
                            style={{
                              padding: '5px 13px', borderRadius: 6,
                              border: `0.5px solid ${T.rule}`,
                              background: 'transparent', color: T.inkMuted,
                              fontSize: 12, fontWeight: 500, cursor: 'pointer',
                              fontFamily: 'IBM Plex Sans, sans-serif',
                            }}
                          >
                            Reject
                          </button>
                        )}
                        {s.status !== 'pending' && (
                          <button
                            onClick={() => updateStatus(s.id, 'pending')}
                            disabled={updating === s.id}
                            style={{
                              padding: '5px 13px', borderRadius: 6,
                              border: `0.5px solid ${T.rule}`,
                              background: 'transparent', color: T.inkFaint,
                              fontSize: 12, cursor: 'pointer',
                              fontFamily: 'IBM Plex Sans, sans-serif',
                            }}
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

      {/* Footer */}
      <footer style={{
        borderTop: `0.5px solid ${T.ruleSoft}`,
        padding: '20px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 48,
      }}>
        <Logo size={14} />
        <span style={{ fontSize: 11, color: T.inkFaint }}>
          © 2026 knotify · Munich · Admin panel
        </span>
      </footer>
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
