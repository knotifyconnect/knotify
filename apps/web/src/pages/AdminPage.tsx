/**
 * knotify · Admin
 * Knotify-team-only console.
 *  - Role requests: approve/reject HR or company-owner requests
 *  - Cafés: CRUD partner cafés
 *  - Users: toggle is_hr / is_admin
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Coffee, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { KAvatar, KBtn, KCard, KPill } from '../lib/knotify'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api'

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

type Cafe = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string
  perk_text: string | null
  photo_url: string | null
  hours_text: string | null
  lat: number | null
  lng: number | null
  is_active: boolean
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

type Tab = 'requests' | 'cafes' | 'users'

const EMPTY_CAFE: Omit<Cafe, 'id'> = {
  slug: '',
  name: '',
  address: '',
  city: 'Munich',
  perk_text: '',
  photo_url: '',
  hours_text: '',
  lat: null,
  lng: null,
  is_active: true,
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
          { id: 'cafes', label: 'Cafés', icon: <Coffee size={13} /> },
          { id: 'users', label: 'Users', icon: <UsersIcon size={13} /> },
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
      {tab === 'cafes' && <CafesTab onError={setError} />}
      {tab === 'users' && <UsersTab onError={setError} />}
    </div>
  )
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
                      {r.user?.email ?? '—'} · wants{' '}
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

// ─── Cafés tab ───────────────────────────────────────────────────────────────
function CafesTab({ onError }: { onError: (m: string | null) => void }) {
  const [cafes, setCafes] = useState<Cafe[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Cafe | (Omit<Cafe, 'id'> & { id?: string }) | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await apiGet<{ cafes: Cafe[] }>('/api/admin/cafes')
      setCafes(r.cafes ?? [])
      onError(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed loading cafés')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        slug: editing.slug,
        name: editing.name,
        address: editing.address,
        city: editing.city,
        perkText: editing.perk_text,
        photoUrl: editing.photo_url || null,
        hoursText: editing.hours_text,
        lat: editing.lat,
        lng: editing.lng,
        isActive: editing.is_active,
      }
      if ('id' in editing && editing.id) {
        await apiPatch(`/api/admin/cafes/${editing.id}`, payload)
      } else {
        await apiPost('/api/admin/cafes', payload)
      }
      setEditing(null)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed saving')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this café? This cannot be undone.')) return
    try {
      await apiDelete(`/api/admin/cafes/${id}`)
      await load()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed deleting')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <KBtn variant="signal" size="sm" onClick={() => setEditing({ ...EMPTY_CAFE })}>
          + Add café
        </KBtn>
      </div>

      <KCard style={{ padding: '18px 20px' }}>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces'" }}>Loading…</p>
        ) : cafes.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No cafés yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cafes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--signal-soft)', color: 'var(--signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Coffee size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                    {c.name} {!c.is_active && <KPill color="default">inactive</KPill>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                    /{c.slug} · {c.city}{c.address ? ` · ${c.address}` : ''}
                  </div>
                </div>
                <KBtn variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</KBtn>
                <KBtn variant="ghost" size="sm" onClick={() => remove(c.id)}>Delete</KBtn>
              </div>
            ))}
          </div>
        )}
      </KCard>

      {editing && (
        <CafeEditor
          cafe={editing}
          saving={saving}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function CafeEditor({
  cafe,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  cafe: Cafe | (Omit<Cafe, 'id'> & { id?: string })
  saving: boolean
  onChange: (c: typeof cafe) => void
  onCancel: () => void
  onSave: () => void
}) {
  const isNew = !('id' in cafe) || !cafe.id
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 580, background: 'var(--paper)', borderRadius: 18, padding: 22, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 400, marginBottom: 16, letterSpacing: '-0.02em' }}>
          {isNew ? 'New café' : 'Edit café'}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field label="Name" value={cafe.name} onChange={(v) => onChange({ ...cafe, name: v })} />
          <Field label="Slug" value={cafe.slug} onChange={(v) => onChange({ ...cafe, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
          <Field label="City" value={cafe.city} onChange={(v) => onChange({ ...cafe, city: v })} />
          <Field label="Hours" value={cafe.hours_text ?? ''} onChange={(v) => onChange({ ...cafe, hours_text: v })} />
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="Address" value={cafe.address ?? ''} onChange={(v) => onChange({ ...cafe, address: v })} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="Perk text" value={cafe.perk_text ?? ''} onChange={(v) => onChange({ ...cafe, perk_text: v })} placeholder="e.g. Free filter coffee for members" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="Photo URL (optional)" value={cafe.photo_url ?? ''} onChange={(v) => onChange({ ...cafe, photo_url: v })} placeholder="https://…" />
          </div>
          <Field label="Lat" value={cafe.lat?.toString() ?? ''} onChange={(v) => onChange({ ...cafe, lat: v ? Number(v) : null })} />
          <Field label="Lng" value={cafe.lng?.toString() ?? ''} onChange={(v) => onChange({ ...cafe, lng: v ? Number(v) : null })} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={cafe.is_active} onChange={(e) => onChange({ ...cafe, is_active: e.target.checked })} />
          Active (visible to members)
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <KBtn variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={onSave} disabled={saving || !cafe.name || !cafe.slug}>
            {saving ? 'Saving…' : 'Save café'}
          </KBtn>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 11px',
          borderRadius: 9,
          border: '0.5px solid var(--rule)',
          background: 'var(--paper-soft)',
          fontSize: 13.5,
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: 'var(--ink)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
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
