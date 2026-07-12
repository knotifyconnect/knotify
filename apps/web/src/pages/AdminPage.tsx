/**
 * knotify · Admin
 * Knotify-team-only console.
 *  - Role requests: approve/reject HR or company-owner requests
 *  - Users: toggle is_hr / is_admin
 *
 * Café management moved to the separate admin.knotify.pro app (apps/admin) —
 * see apps/admin/src/AdminPanels.tsx CafesAdmin/CafeSuggestionsAdmin. This
 * embedded /admin route is for team members signed in as regular users;
 * café listings shouldn't be manageable from inside the consumer app.
 */
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { ShieldCheck, Users as UsersIcon, ClipboardList } from 'lucide-react'
import { KAvatar, KBtn, KCard, KPill } from '../lib/knotify'
import { apiGet, apiPatch, apiPost } from '../lib/api'

type RoleRequest = {
  id: string
  user_id: string
  requested_role: 'hr' | 'company_owner'
  company_name: string | null
  email_domain: string | null
  email_verified: boolean
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  user: { id: string; full_name: string; username: string; email: string; avatar_url: string | null } | null
}

type AdminUser = {
  id: string
  email: string
  full_name: string
  username: string
  is_admin: boolean
  is_hr: boolean
  created_at: string
}

type Tab = 'requests' | 'users' | 'waitlist'

type BetaSignup = {
  id: string
  email: string
  name: string | null
  role: string | null
  is_international: boolean | null
  marketing_consent: boolean
  beta_risk_consent: boolean
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('requests')
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  // Detect 403 once on mount
  useEffect(() => {
    apiGet<{ requests: RoleRequest[] }>('/api/admin/role-requests')
      .then(() => setForbidden(false))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('[403]')) setForbidden(true)
        else setError(msg)
      })
  }, [])

  if (forbidden) {
    return (
      <div style={{ maxWidth: 480, margin: '60px auto' }}>
        <KCard style={{ padding: 28, textAlign: 'center' }}>
          <ShieldCheck size={36} color="var(--ink-faint)" style={{ marginBottom: 12 }} />
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 400, marginBottom: 6 }}>
            Admin only
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
            This area is restricted to the knotify team.
          </p>
        </KCard>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: 6,
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          knotify · admin
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(26px, 3vw, 36px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            margin: '0 0 4px',
          }}
        >
          Operations console.
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0 }}>
          Approve roles, manage partner cafés, toggle access.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--signal-soft)',
            border: '0.5px solid rgba(216,68,43,0.2)',
            color: 'var(--signal)',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '0.5px solid var(--rule-soft)' }}>
        {([
          { id: 'requests', label: 'Role requests', icon: <ShieldCheck size={13} /> },
          { id: 'users', label: 'Users', icon: <UsersIcon size={13} /> },
          { id: 'waitlist', label: 'Waitlist', icon: <ClipboardList size={13} /> },
        ] as Array<{ id: Tab; label: string; icon: ReactNode }>).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: tab === t.id ? '2px solid var(--signal)' : '2px solid transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink-muted)',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'IBM Plex Sans', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: -1,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'requests' && <RoleRequestsTab onError={setError} />}
      {tab === 'users' && <UsersTab onError={setError} />}
      {tab === 'waitlist' && <WaitlistTab onError={setError} />}
    </div>
  )
}

// ─── Waitlist tab ─────────────────────────────────────────────────────────────
function WaitlistTab({ onError }: { onError: (m: string | null) => void }) {
  const [signups, setSignups] = useState<BetaSignup[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await apiGet<{ signups: BetaSignup[] }>('/api/admin/beta-signups')
      setSignups(r.signups ?? [])
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load waitlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function setStatus(id: string, status: BetaSignup['status']) {
    setBusyId(id)
    try {
      await apiPatch(`/api/admin/beta-signups/${id}`, { status })
      setSignups((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '20px 0' }}>Loading…</div>

  if (!signups.length) {
    return <div style={{ fontSize: 13.5, color: 'var(--ink-muted)', padding: '20px 0' }}>No waitlist signups yet.</div>
  }

  const cell: CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--ink)', borderBottom: '0.5px solid var(--rule-soft)', verticalAlign: 'top' }
  const head: CSSProperties = { padding: '8px 12px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', textAlign: 'left', borderBottom: '0.5px solid var(--rule)' }
  const yesNo = (v: boolean) => (
    <span style={{ fontSize: 11, fontWeight: 600, color: v ? 'var(--verd)' : 'var(--signal)' }}>{v ? 'Yes' : 'No'}</span>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 12 }}>
        {signups.length} signup{signups.length === 1 ? '' : 's'} ·{' '}
        {signups.filter((s) => s.beta_risk_consent).length} accepted the beta-risk notice
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={head}>Email</th>
            <th style={head}>Name</th>
            <th style={head}>Role</th>
            <th style={head}>Beta risk</th>
            <th style={head}>Marketing</th>
            <th style={head}>Joined</th>
            <th style={head}>Status</th>
          </tr>
        </thead>
        <tbody>
          {signups.map((s) => (
            <tr key={s.id}>
              <td style={cell}>{s.email}</td>
              <td style={cell}>{s.name ?? '—'}</td>
              <td style={cell}>{s.role ?? '—'}</td>
              <td style={cell}>{yesNo(s.beta_risk_consent)}</td>
              <td style={cell}>{yesNo(s.marketing_consent)}</td>
              <td style={{ ...cell, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                {new Date(s.created_at).toLocaleDateString()}
              </td>
              <td style={cell}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: s.status === 'approved' ? 'var(--verd-soft)' : s.status === 'rejected' ? 'var(--signal-soft)' : 'var(--paper-deep)',
                      color: s.status === 'approved' ? 'var(--verd)' : s.status === 'rejected' ? 'var(--signal)' : 'var(--ink-muted)',
                    }}
                  >
                    {s.status}
                  </span>
                  {s.status !== 'approved' && (
                    <button type="button" disabled={busyId === s.id} onClick={() => setStatus(s.id, 'approved')} style={miniBtn}>Approve</button>
                  )}
                  {s.status !== 'rejected' && (
                    <button type="button" disabled={busyId === s.id} onClick={() => setStatus(s.id, 'rejected')} style={miniBtn}>Reject</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const miniBtn: CSSProperties = {
  padding: '3px 9px', borderRadius: 7, border: '0.5px solid var(--rule)',
  background: 'white', color: 'var(--ink-muted)', fontSize: 11, cursor: 'pointer',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

// ─── Role requests tab ───────────────────────────────────────────────────────
function RoleRequestsTab({ onError }: { onError: (m: string | null) => void }) {
  const [requests, setRequests] = useState<RoleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await apiGet<{ requests: RoleRequest[] }>('/api/admin/role-requests')
      setRequests(r.requests ?? [])
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed loading requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function review(id: string, status: 'approved' | 'rejected') {
    setActionId(id)
    try {
      await apiPatch(`/api/admin/role-requests/${id}`, { status })
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed reviewing')
    } finally {
      setActionId(null)
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const reviewed = requests.filter((r) => r.status !== 'pending').slice(0, 30)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KCard style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
          Pending · {pending.length}
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
        ) : pending.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No pending requests.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((r) => (
              <div key={r.id} style={{ padding: '13px 15px', borderRadius: 12, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <KAvatar name={r.user?.full_name ?? '?'} src={r.user?.avatar_url ?? null} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                      {r.user?.full_name ?? 'Unknown'}{' '}
                      <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>· @{r.user?.username ?? '?'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                      {r.user?.email ?? '-'} · wants{' '}
                      <strong style={{ color: 'var(--signal)' }}>{roleLabel(r.requested_role)}</strong>
                      {r.company_name && <> at <strong>{r.company_name}</strong></>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {r.email_verified && <KPill color="verd">Email matches</KPill>}
                      {r.email_domain && <KPill color="default">{r.email_domain}</KPill>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KBtn variant="verd" size="sm" disabled={actionId === r.id} onClick={() => review(r.id, 'approved')}>
                    {actionId === r.id ? '…' : 'Approve'}
                  </KBtn>
                  <KBtn variant="ghost" size="sm" disabled={actionId === r.id} onClick={() => review(r.id, 'rejected')}>
                    Reject
                  </KBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </KCard>

      {reviewed.length > 0 && (
        <KCard style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
            Recently reviewed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reviewed.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '0.5px solid var(--rule-soft)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                  {r.user?.full_name ?? 'Unknown'} <span style={{ color: 'var(--ink-faint)' }}>· {roleLabel(r.requested_role)}</span>
                </div>
                <KPill color={r.status === 'approved' ? 'verd' : 'default'}>{r.status}</KPill>
              </div>
            ))}
          </div>
        </KCard>
      )}
    </div>
  )
}

function roleLabel(r: 'hr' | 'company_owner') {
  if (r === 'hr') return 'HR access'
  return 'Company owner'
}

// ─── Users tab ──────────────────────────────────────────────────────────────
function UsersTab({ onError }: { onError: (m: string | null) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await apiGet<{ users: AdminUser[] }>('/api/admin/users')
      setUsers(r.users ?? [])
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed loading users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function toggle(u: AdminUser, key: 'is_admin' | 'is_hr') {
    setBusyId(u.id)
    try {
      const next = !u[key]
      await apiPatch(`/api/admin/users/${u.id}`, key === 'is_admin' ? { isAdmin: next } : { isHr: next })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, [key]: next } : x)))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed updating')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  })

  return (
    <KCard style={{ padding: '18px 20px' }}>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users by name, username, email…"
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: 10,
          border: '0.5px solid var(--rule)',
          background: 'var(--paper-soft)',
          fontSize: 13.5,
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: 'var(--ink)',
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 14,
        }}
      />
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, borderBottom: '0.5px solid var(--rule-soft)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{u.full_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>@{u.username} · {u.email}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                <input type="checkbox" checked={u.is_hr} disabled={busyId === u.id} onChange={() => toggle(u, 'is_hr')} />
                HR
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                <input type="checkbox" checked={u.is_admin} disabled={busyId === u.id} onChange={() => toggle(u, 'is_admin')} />
                Admin
              </label>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No matches.</p>}
        </div>
      )}
    </KCard>
  )
}
