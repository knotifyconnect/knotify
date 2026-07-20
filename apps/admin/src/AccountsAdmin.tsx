import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api } from './api'
import type { LiveUser, LiveUsersSnapshot } from './LiveUsersPanel'

const C = {
  signal: '#D8442B', signalSoft: 'rgba(216,68,43,0.08)', ink: '#1a1410', inkMuted: '#6b5f55',
  inkFaint: '#a09287', paper: '#f5f0e8', paperSoft: '#ede8df', white: '#fff',
  rule: 'rgba(84,72,58,0.14)', ruleSoft: 'rgba(84,72,58,0.08)', verd: '#2d7d46',
  verdSoft: 'rgba(45,125,70,0.10)', amber: '#b45309', amberSoft: 'rgba(180,83,9,0.10)',
  blue: '#2563a8', blueSoft: 'rgba(37,99,168,0.09)', plum: '#71406f', plumSoft: 'rgba(113,64,111,0.10)',
}

type AccountStatus = 'active' | 'deactivated' | 'profile_only'
type Account = {
  id: string
  authId: string
  profileId: string | null
  email: string | null
  phone: string | null
  fullName: string | null
  username: string | null
  avatarUrl: string | null
  headline: string | null
  locationCity: string | null
  university: string | null
  currentCompany: string | null
  memberStatus: string | null
  persona: string | null
  interests: string[]
  goals: string[]
  isInternational: boolean
  homeCountry: string | null
  isAdmin: boolean
  isHr: boolean
  isPremium: boolean
  isOnline: boolean
  lastSeenAt: string | null
  usage30d: { minutes: number; sessions: number; pageViews: number }
  termsAcceptedAt: string | null
  termsVersion: string | null
  profileCreatedAt: string | null
  profileUpdatedAt: string | null
  authCreatedAt: string
  authUpdatedAt: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  phoneConfirmedAt: string | null
  invitedAt: string | null
  providers: string[]
  isSso: boolean
  isAnonymous: boolean
  bannedUntil: string | null
  accountStatus: AccountStatus
  authAvailable: boolean
  profileCompletion: number
  onboardingComplete: boolean
}

type AccountStats = { total: number; active: number; deactivated: number; profileOnly: number; unverified: number; admins: number; hr: number; onlineNow: number; active30d: number }
type Activity = { connections: number; posts: number; messages: number; eventRsvps: number; gigs: number }
type AccountsResponse = {
  accounts: Account[]
  stats: AccountStats
  pagination: { total: number; loaded: number }
  authAvailable: boolean
  activityAvailable: boolean
  warning: string | null
}
type AccountDetailResponse = { account: Account; activity: Activity; activityAvailable?: boolean; warning?: string | null }
type StatusFilter = 'all' | 'active' | 'deactivated' | 'unverified' | 'incomplete'
type RoleFilter = 'all' | 'admin' | 'hr' | 'premium' | 'member'
type Sort = 'newest' | 'last-seen' | 'usage' | 'name' | 'completion'

const buttonBase: CSSProperties = {
  border: 'none', borderRadius: 9, padding: '9px 13px', fontSize: 12.5, fontWeight: 600,
  fontFamily: 'IBM Plex Sans, sans-serif', cursor: 'pointer', transition: 'all 0.15s ease',
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'Just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function fullDate(iso: string | null) {
  if (!iso) return 'Not available'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function sessionDuration(iso: string) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function initials(account: Account) {
  const source = account.fullName || account.email || '?'
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

function roleLabel(account: Account) {
  if (account.isAdmin) return 'Admin'
  if (account.isHr) return 'HR'
  if (account.isPremium) return 'Premium'
  return 'Member'
}

function roleColors(account: Account) {
  if (account.isAdmin) return { color: C.signal, background: C.signalSoft }
  if (account.isHr) return { color: C.plum, background: C.plumSoft }
  if (account.isPremium) return { color: C.amber, background: C.amberSoft }
  return { color: C.inkMuted, background: C.paperSoft }
}

function Pill({ children, color, background }: { children: React.ReactNode; color: string; background: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, color, background, fontSize: 10.5, fontWeight: 650, whiteSpace: 'nowrap' }}>{children}</span>
}

function Avatar({ account, size = 38 }: { account: Account; size?: number }) {
  if (account.avatarUrl) {
    return <img src={account.avatarUrl} alt="" style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', border: `0.5px solid ${C.rule}`, flex: '0 0 auto' }} />
  }
  return <div style={{ width: size, height: size, borderRadius: 12, background: C.paperSoft, color: C.inkMuted, display: 'grid', placeItems: 'center', fontSize: size * 0.31, fontWeight: 700, flex: '0 0 auto' }}>{initials(account)}</div>
}

function StatCard({ label, value, sub, tone = C.ink }: { label: string; value: number; sub: string; tone?: string }) {
  return (
    <div className="account-stat" style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14, padding: '17px 18px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 650 }}>{label}</span>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: tone }} />
      </div>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 29, lineHeight: 1, color: tone, margin: '10px 0 6px' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10.5, color: C.inkFaint }}>{sub}</div>
    </div>
  )
}

function Toggle({ checked, disabled, onChange, label, description }: { checked: boolean; disabled: boolean; onChange: () => void; label: string; description: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onChange} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '11px 0', border: 'none', borderBottom: `0.5px solid ${C.ruleSoft}`, background: 'transparent', textAlign: 'left', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      <span style={{ width: 34, height: 20, borderRadius: 99, padding: 2, boxSizing: 'border-box', background: checked ? C.verd : C.paperSoft, border: `0.5px solid ${checked ? C.verd : C.rule}`, transition: 'all .15s', flex: '0 0 auto' }}>
        <span style={{ display: 'block', width: 14, height: 14, borderRadius: 99, background: C.white, transform: checked ? 'translateX(14px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,.16)', transition: 'transform .15s' }} />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, color: C.ink, fontWeight: 600 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>{description}</span>
      </span>
    </button>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0,1fr)', gap: 12, padding: '8px 0', borderBottom: `0.5px solid ${C.ruleSoft}` }}>
      <span style={{ fontSize: 10.5, color: C.inkFaint }}>{label}</span>
      <span style={{ fontSize: 11.5, color: C.ink, overflowWrap: 'anywhere', fontFamily: mono ? 'IBM Plex Mono, monospace' : undefined }}>{value || '—'}</span>
    </div>
  )
}

function exportAccounts(accounts: Account[]) {
  const header = ['Name', 'Username', 'Email', 'Status', 'Role', 'Verified', 'Provider', 'Profile completion', 'Last seen', 'Active minutes (30d)', 'Sessions (30d)', 'Created', 'Auth ID', 'Profile ID']
  const rows = accounts.map((a) => [
    a.fullName ?? '', a.username ?? '', a.email ?? '', a.accountStatus, roleLabel(a),
    a.emailConfirmedAt || a.phoneConfirmedAt ? 'Yes' : 'No', a.providers.join('; '), `${a.profileCompletion}%`,
    a.lastSeenAt ?? '', a.usage30d.minutes, a.usage30d.sessions, a.authCreatedAt, a.authId, a.profileId ?? '',
  ])
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `knotify-accounts-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AccountsAdmin() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<AccountStats>({ total: 0, active: 0, deactivated: 0, profileOnly: 0, unverified: 0, admins: 0, hr: 0, onlineNow: 0, active30d: 0 })
  const [loaded, setLoaded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [serverWarning, setServerWarning] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [role, setRole] = useState<RoleFilter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AccountDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [confirmMode, setConfirmMode] = useState<'deactivate' | 'delete' | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [liveByProfileId, setLiveByProfileId] = useState<Record<string, LiveUser>>({})

  const selected = accounts.find((account) => account.authId === selectedId) ?? null

  async function load(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const response = await api.accounts() as AccountsResponse
      setAccounts(response.accounts ?? [])
      setStats(response.stats)
      setLoaded(response.pagination.loaded)
      setServerWarning([
        response.warning,
        !response.activityAvailable ? 'Account management is available, but usage analytics are paused until the product-activity database migration is applied.' : null,
      ].filter(Boolean).join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load accounts.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    let disposed = false
    let inFlight = false

    const refreshPresence = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const snapshot = await api.liveUsers() as LiveUsersSnapshot
        if (disposed) return
        const users = snapshot.available ? snapshot.users : []
        const next = Object.fromEntries(users.map((user) => [user.profileId, user]))
        setLiveByProfileId(next)
        setAccounts((current) => current.map((account) => {
          const live = account.profileId ? next[account.profileId] : undefined
          return { ...account, isOnline: Boolean(live), lastSeenAt: live?.lastSeenAt ?? account.lastSeenAt }
        }))
        setStats((current) => ({ ...current, onlineNow: users.length }))
      } catch {
        // Keep the last successful presence snapshot during a transient refresh failure.
      } finally {
        inFlight = false
      }
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshPresence() }
    void refreshPresence()
    const timer = window.setInterval(() => void refreshPresence(), 5_000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDetailLoading(true)
    api.account(selectedId)
      .then((response) => setDetail(response as AccountDetailResponse))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load account details.'))
      .finally(() => setDetailLoading(false))
  }, [selectedId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result = accounts.filter((account) => {
      const matchesQuery = !query || [account.fullName, account.username, account.email, account.authId, account.currentCompany, account.university]
        .some((value) => value?.toLowerCase().includes(query))
      const matchesStatus = status === 'all' ||
        (status === 'active' && account.accountStatus === 'active') ||
        (status === 'deactivated' && account.accountStatus === 'deactivated') ||
        (status === 'unverified' && !account.emailConfirmedAt && !account.phoneConfirmedAt) ||
        (status === 'incomplete' && !account.onboardingComplete)
      const matchesRole = role === 'all' ||
        (role === 'admin' && account.isAdmin) ||
        (role === 'hr' && account.isHr) ||
        (role === 'premium' && account.isPremium) ||
        (role === 'member' && !account.isAdmin && !account.isHr && !account.isPremium)
      return matchesQuery && matchesStatus && matchesRole
    })
    return result.sort((a, b) => {
      if (sort === 'name') return (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '')
      if (sort === 'last-seen') return new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime()
      if (sort === 'usage') return b.usage30d.minutes - a.usage30d.minutes || b.usage30d.sessions - a.usage30d.sessions
      if (sort === 'completion') return b.profileCompletion - a.profileCompletion
      return new Date(b.authCreatedAt).getTime() - new Date(a.authCreatedAt).getTime()
    })
  }, [accounts, search, status, role, sort])

  async function updateRole(key: 'isAdmin' | 'isHr' | 'isPremium', value: boolean) {
    if (!selected) return
    setBusy(key)
    setError('')
    try {
      await api.updateAccountRoles(selected.authId, { [key]: value })
      setAccounts((current) => current.map((account) => account.authId === selected.authId ? { ...account, [key]: value } : account))
      setDetail((current) => current ? { ...current, account: { ...current.account, [key]: value } } : current)
      if (key === 'isAdmin') setStats((current) => ({ ...current, admins: current.admins + (value ? 1 : -1) }))
      if (key === 'isHr') setStats((current) => ({ ...current, hr: current.hr + (value ? 1 : -1) }))
      setNotice(`${selected.fullName || selected.email || 'Account'} access updated.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update access.')
    } finally { setBusy('') }
  }

  async function runAction(action: 'deactivate' | 'reactivate' | 'delete') {
    if (!selected) return
    setBusy(action)
    setError('')
    try {
      const response = await api.accountAction(selected.authId, action, action === 'delete' ? confirmation : undefined) as { warning?: string; bannedUntil?: string | null }
      if (action === 'delete') {
        setAccounts((current) => current.filter((account) => account.authId !== selected.authId))
        setStats((current) => ({
          ...current,
          total: Math.max(0, current.total - 1),
          active: Math.max(0, current.active - (selected.accountStatus === 'active' ? 1 : 0)),
          deactivated: Math.max(0, current.deactivated - (selected.accountStatus === 'deactivated' ? 1 : 0)),
          profileOnly: Math.max(0, current.profileOnly - (selected.accountStatus === 'profile_only' ? 1 : 0)),
          unverified: Math.max(0, current.unverified - (!selected.emailConfirmedAt && !selected.phoneConfirmedAt ? 1 : 0)),
          admins: Math.max(0, current.admins - (selected.isAdmin ? 1 : 0)),
          hr: Math.max(0, current.hr - (selected.isHr ? 1 : 0)),
        }))
        setLoaded((current) => Math.max(0, current - 1))
        setSelectedId(null)
        setNotice(response.warning || 'Account permanently deleted.')
      } else {
        const accountStatus: AccountStatus = action === 'deactivate' ? 'deactivated' : 'active'
        const bannedUntil = action === 'deactivate' ? response.bannedUntil ?? null : null
        setAccounts((current) => current.map((account) => account.authId === selected.authId ? { ...account, accountStatus, bannedUntil, isOnline: false } : account))
        setDetail((current) => current ? { ...current, account: { ...current.account, accountStatus, bannedUntil, isOnline: false } } : current)
        setStats((current) => ({ ...current, active: current.active + (action === 'reactivate' ? 1 : -1), deactivated: current.deactivated + (action === 'deactivate' ? 1 : -1) }))
        setNotice(action === 'deactivate' ? 'Account deactivated. The user can no longer sign in.' : 'Account reactivated. Sign-in access is restored.')
      }
      setConfirmMode(null)
      setConfirmation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} account.`)
    } finally { setBusy('') }
  }

  function copy(value: string) {
    void navigator.clipboard.writeText(value)
    setNotice('ID copied to clipboard.')
  }

  const shownAccount = detail?.account ?? selected
  const shownLive = shownAccount?.profileId ? liveByProfileId[shownAccount.profileId] : undefined
  const isVerified = shownAccount ? Boolean(shownAccount.emailConfirmedAt || shownAccount.phoneConfirmedAt) : false

  return (
    <div className="accounts-admin">
      <style>{`
        .accounts-admin button:hover:not(:disabled) { filter: brightness(.97); transform: translateY(-1px); }
        .accounts-admin input:focus, .accounts-admin select:focus { border-color: rgba(216,68,43,.55) !important; box-shadow: 0 0 0 3px rgba(216,68,43,.08); }
        .account-row:hover { background: rgba(255,255,255,.7) !important; }
        .account-stat { transition: transform .16s ease, box-shadow .16s ease; }
        .account-stat:hover { transform: translateY(-2px); box-shadow: 0 7px 18px rgba(40,30,20,.05); }
        @media (max-width: 850px) {
          .account-stats-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
          .account-toolbar { grid-template-columns: 1fr 1fr !important; }
          .account-search { grid-column: 1 / -1; }
        }
        @media (max-width: 560px) {
          .account-stats-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
          .account-toolbar { grid-template-columns: 1fr !important; }
          .account-search { grid-column: auto; }
          .account-drawer { width: 100% !important; }
          .accounts-title-actions { width: 100%; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 32, lineHeight: 1, fontWeight: 400, letterSpacing: '-0.035em', color: C.ink, margin: 0 }}>Users & accounts</h1>
            <Pill color={C.verd} background={C.verdSoft}>● Live Auth</Pill>
          </div>
          <p style={{ fontSize: 12.5, color: C.inkMuted, margin: 0 }}>Identity, access, profile health, and account lifecycle in one place.</p>
        </div>
        <div className="accounts-title-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportAccounts(filtered)} disabled={!filtered.length} style={{ ...buttonBase, color: C.inkMuted, background: C.white, border: `0.5px solid ${C.rule}` }}>Export {filtered.length}</button>
          <button onClick={() => void load(true)} disabled={refreshing} style={{ ...buttonBase, color: C.white, background: C.ink }}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>
        </div>
      </div>

      {notice && <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 120, maxWidth: 360, borderRadius: 11, padding: '11px 14px', background: C.ink, color: C.white, fontSize: 12, boxShadow: '0 12px 34px rgba(20,15,10,.2)' }}>✓ {notice}</div>}
      {error && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 14px', borderRadius: 10, color: C.signal, background: C.signalSoft, border: '0.5px solid rgba(216,68,43,.18)', fontSize: 12, marginBottom: 15 }}><span>{error}</span><button onClick={() => setError('')} style={{ border: 'none', background: 'none', color: C.signal, cursor: 'pointer' }}>×</button></div>}
      {serverWarning && <div style={{ padding: '11px 14px', borderRadius: 10, color: C.amber, background: C.amberSoft, border: '0.5px solid rgba(180,83,9,.18)', fontSize: 12, lineHeight: 1.45, marginBottom: 15 }}>⚠ {serverWarning}</div>}

      <div className="account-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
        <StatCard label="Total accounts" value={stats.total} sub={`${loaded} loaded`} />
        <StatCard label="Online now" value={stats.onlineNow} sub="Live · refreshes every 5s" tone={C.verd} />
        <StatCard label="Used in 30 days" value={stats.active30d} sub={`${stats.total ? Math.round(stats.active30d / stats.total * 100) : 0}% of accounts`} tone={C.blue} />
        <StatCard label="Deactivated" value={stats.deactivated} sub={stats.profileOnly ? `${stats.profileOnly} profile only` : 'Sign-in blocked'} tone={C.signal} />
        <StatCard label="Access grants" value={stats.admins + stats.hr} sub={`${stats.admins} admin · ${stats.hr} HR`} tone={C.plum} />
      </div>

      {stats.total > loaded && <div style={{ padding: '9px 12px', borderRadius: 9, background: C.amberSoft, color: C.amber, fontSize: 11.5, marginBottom: 12 }}>Showing the first {loaded.toLocaleString()} of {stats.total.toLocaleString()} Auth accounts. Export and filters apply to loaded accounts.</div>}

      <div className="account-toolbar" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1fr) 150px 145px 150px', gap: 8, padding: 10, borderRadius: '13px 13px 0 0', border: `0.5px solid ${C.rule}`, background: C.white }}>
        <input className="account-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, username, company, or ID…" style={{ padding: '9px 11px', border: `0.5px solid ${C.rule}`, borderRadius: 8, outline: 'none', background: C.paper, color: C.ink, fontSize: 12.5, fontFamily: 'IBM Plex Sans, sans-serif' }} />
        <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} style={{ padding: '9px 10px', border: `0.5px solid ${C.rule}`, borderRadius: 8, outline: 'none', background: C.white, color: C.inkMuted, fontSize: 11.5 }}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option><option value="unverified">Unverified</option><option value="incomplete">Incomplete profile</option>
        </select>
        <select value={role} onChange={(event) => setRole(event.target.value as RoleFilter)} style={{ padding: '9px 10px', border: `0.5px solid ${C.rule}`, borderRadius: 8, outline: 'none', background: C.white, color: C.inkMuted, fontSize: 11.5 }}>
          <option value="all">All access</option><option value="admin">Admins</option><option value="hr">HR</option><option value="premium">Premium</option><option value="member">Members</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} style={{ padding: '9px 10px', border: `0.5px solid ${C.rule}`, borderRadius: 8, outline: 'none', background: C.white, color: C.inkMuted, fontSize: 11.5 }}>
          <option value="newest">Newest first</option><option value="last-seen">Last seen</option><option value="usage">Most used · 30d</option><option value="name">Name A–Z</option><option value="completion">Profile health</option>
        </select>
      </div>

      <div style={{ border: `0.5px solid ${C.rule}`, borderTop: 'none', borderRadius: '0 0 13px 13px', overflowX: 'auto', overflowY: 'hidden', background: 'rgba(255,255,255,.38)' }}>
        <div style={{ padding: '8px 13px', color: C.inkFaint, fontSize: 10.5, borderBottom: `0.5px solid ${C.ruleSoft}`, display: 'flex', justifyContent: 'space-between' }}><span>{filtered.length} account{filtered.length === 1 ? '' : 's'}</span><span>Click a row for full controls</span></div>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.inkFaint, fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic' }}>Loading Auth accounts…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}><div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 19, color: C.ink, marginBottom: 5 }}>No accounts match</div><div style={{ fontSize: 12, color: C.inkFaint }}>Try clearing a filter or using a broader search.</div></div>
        ) : filtered.map((account) => {
          const verified = Boolean(account.emailConfirmedAt || account.phoneConfirmedAt)
          const colors = roleColors(account)
          const live = account.profileId ? liveByProfileId[account.profileId] : undefined
          return (
            <button key={account.authId} className="account-row" onClick={() => { setSelectedId(account.authId); setConfirmMode(null); setConfirmation('') }} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(240px,1.4fr) minmax(150px,.8fr) minmax(150px,.8fr) 130px 26px', alignItems: 'center', gap: 14, padding: '13px 15px', border: 'none', borderBottom: `0.5px solid ${C.ruleSoft}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', minWidth: 820 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <div style={{ position: 'relative' }}><Avatar account={account} /><span title={account.isOnline ? 'Online now' : 'Offline'} style={{ position: 'absolute', right: -2, bottom: -1, width: 9, height: 9, borderRadius: 99, background: account.isOnline ? C.verd : C.inkFaint, border: `2px solid ${C.paper}` }} /></div>
                <div style={{ minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: C.ink, fontSize: 12.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.fullName || 'Profile not completed'}</span>{!account.profileId && <Pill color={C.amber} background={C.amberSoft}>No profile</Pill>}</div><div style={{ color: C.inkMuted, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{account.email || account.phone || account.authId}</div></div>
              </div>
              <div><div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}><Pill {...colors}>{roleLabel(account)}</Pill>{!account.authAvailable ? <Pill color={C.amber} background={C.amberSoft}>Profile only</Pill> : account.accountStatus === 'deactivated' ? <Pill color={C.signal} background={C.signalSoft}>● Deactivated</Pill> : <Pill color={C.verd} background={C.verdSoft}>● Active</Pill>}</div><div style={{ marginTop: 5, color: verified ? C.inkFaint : C.amber, fontSize: 10.5 }}>{account.authAvailable ? (verified ? '✓ Identity verified' : '⚠ Not verified') : 'Auth metadata unavailable'}</div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.inkMuted, marginBottom: 5 }}><span>Profile health</span><strong style={{ color: account.profileCompletion >= 75 ? C.verd : account.profileCompletion >= 40 ? C.amber : C.signal }}>{account.profileCompletion}%</strong></div><div style={{ height: 4, background: C.paperSoft, borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${account.profileCompletion}%`, background: account.profileCompletion >= 75 ? C.verd : account.profileCompletion >= 40 ? C.amber : C.signal, borderRadius: 99 }} /></div><div style={{ marginTop: 5, fontSize: 10, color: C.inkFaint }}>{account.providers.join(', ') || 'Unknown provider'}</div></div>
              <div><div style={{ fontSize: 11.5, color: live ? C.verd : C.ink }}>{live ? `Online · ${live.currentSection}` : timeAgo(account.lastSeenAt)}</div><div style={{ fontSize: 10, color: C.inkFaint, marginTop: 3 }}>{live ? `${live.deviceTypes.join(', ') || 'Unknown device'} · ${live.openSessions} session${live.openSessions === 1 ? '' : 's'}` : `${account.usage30d.minutes}m · ${account.usage30d.sessions} opens (30d)`}</div></div>
              <span style={{ color: C.inkFaint, fontSize: 17 }}>›</span>
            </button>
          )
        })}
      </div>

      {shownAccount && (
        <div onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null) }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(26,20,16,.26)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end' }}>
          <aside className="account-drawer" style={{ width: 480, height: '100%', overflowY: 'auto', background: C.paper, boxShadow: '-16px 0 48px rgba(25,18,12,.12)', borderLeft: `0.5px solid ${C.rule}` }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 17px', background: 'rgba(245,240,232,.94)', backdropFilter: 'blur(10px)', borderBottom: `0.5px solid ${C.rule}` }}><span style={{ fontSize: 10.5, color: C.inkFaint, letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 650 }}>Account control</span><button onClick={() => setSelectedId(null)} aria-label="Close" style={{ width: 29, height: 29, borderRadius: 8, border: `0.5px solid ${C.rule}`, background: C.white, color: C.inkMuted, cursor: 'pointer', fontSize: 17 }}>×</button></div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}><Avatar account={shownAccount} size={58} /><div style={{ flex: 1, minWidth: 0 }}><h2 style={{ margin: '2px 0 3px', fontFamily: 'Fraunces, Georgia, serif', fontSize: 23, lineHeight: 1.08, fontWeight: 400, color: C.ink }}>{shownAccount.fullName || 'Incomplete profile'}</h2><div style={{ fontSize: 11.5, color: C.inkMuted, overflowWrap: 'anywhere' }}>{shownAccount.email || shownAccount.phone || 'No contact identity'}</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}><Pill {...roleColors(shownAccount)}>{roleLabel(shownAccount)}</Pill>{shownAccount.accountStatus === 'deactivated' ? <Pill color={C.signal} background={C.signalSoft}>● Deactivated</Pill> : <Pill color={C.verd} background={C.verdSoft}>● Active</Pill>}<Pill color={isVerified ? C.blue : C.amber} background={isVerified ? C.blueSoft : C.amberSoft}>{isVerified ? '✓ Verified' : '⚠ Unverified'}</Pill></div></div></div>

              {detailLoading && <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 12 }}>Loading live activity…</div>}
              {detail?.activity && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5, marginBottom: 17 }}>{Object.entries(detail.activity).map(([key, value]) => <div key={key} style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 9, textAlign: 'center', padding: '9px 3px' }}><div style={{ fontFamily: 'Fraunces, Georgia, serif', color: C.ink, fontSize: 18 }}>{value}</div><div style={{ color: C.inkFaint, fontSize: 8.5, textTransform: 'capitalize', marginTop: 2 }}>{key === 'eventRsvps' ? 'RSVPs' : key}</div></div>)}</div>}

              <section style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 13, padding: '14px 15px', marginBottom: 12 }}><div style={{ fontSize: 12.5, fontWeight: 650, color: C.ink, marginBottom: 4 }}>Access & entitlements</div><div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 5 }}>Changes apply immediately to the profile.</div><Toggle checked={shownAccount.isAdmin} disabled={Boolean(busy)} onChange={() => void updateRole('isAdmin', !shownAccount.isAdmin)} label="Administrator" description="Full signed-in admin access" /><Toggle checked={shownAccount.isHr} disabled={Boolean(busy)} onChange={() => void updateRole('isHr', !shownAccount.isHr)} label="HR workspace" description="Company and recruiting capabilities" /><Toggle checked={shownAccount.isPremium} disabled={Boolean(busy)} onChange={() => void updateRole('isPremium', !shownAccount.isPremium)} label="Premium member" description="Premium product entitlement" /></section>

              <section style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 13, padding: '14px 15px', marginBottom: 12 }}><div style={{ fontSize: 12.5, fontWeight: 650, color: C.ink, marginBottom: 6 }}>Identity & profile</div><DetailRow label="Username" value={shownAccount.username ? `@${shownAccount.username}` : null} /><DetailRow label="Headline" value={shownAccount.headline} /><DetailRow label="Company" value={shownAccount.currentCompany} /><DetailRow label="University" value={shownAccount.university} /><DetailRow label="Location" value={[shownAccount.locationCity, shownAccount.homeCountry].filter(Boolean).join(' · ')} /><DetailRow label="Persona" value={shownAccount.persona} /><DetailRow label="Interests" value={shownAccount.interests.length ? shownAccount.interests.join(', ') : null} /><DetailRow label="Profile health" value={`${shownAccount.profileCompletion}% · ${shownAccount.onboardingComplete ? 'Onboarding complete' : 'Onboarding incomplete'}`} /><DetailRow label="Terms" value={shownAccount.termsAcceptedAt ? `${shownAccount.termsVersion || 'Accepted'} · ${fullDate(shownAccount.termsAcceptedAt)}` : 'Not recorded'} /></section>

              <section style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 13, padding: '14px 15px', marginBottom: 12 }}><div style={{ fontSize: 12.5, fontWeight: 650, color: C.ink, marginBottom: 6 }}>Live presence & usage</div><DetailRow label="Presence" value={shownLive ? <span style={{ color: C.verd }}>● Online now · {shownLive.currentSection}</span> : timeAgo(shownAccount.lastSeenAt)} />{shownLive && <><DetailRow label="Current page" value={shownLive.currentPath} mono /><DetailRow label="Device" value={shownLive.deviceTypes.join(', ') || 'Unknown'} /><DetailRow label="Current session" value={sessionDuration(shownLive.sessionStartedAt)} /><DetailRow label="Heartbeat" value={timeAgo(shownLive.lastSeenAt)} /><DetailRow label="Open sessions" value={shownLive.openSessions} /></>}<DetailRow label="Active time · 30d" value={`${shownAccount.usage30d.minutes} minutes`} /><DetailRow label="App opens · 30d" value={shownAccount.usage30d.sessions} /><DetailRow label="Page views · 30d" value={shownAccount.usage30d.pageViews} /></section>

              <section style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 13, padding: '14px 15px', marginBottom: 12 }}><div style={{ fontSize: 12.5, fontWeight: 650, color: C.ink, marginBottom: 6 }}>Authentication</div><DetailRow label="Provider" value={shownAccount.providers.join(', ') || 'Unknown'} /><DetailRow label="Last sign-in" value={fullDate(shownAccount.lastSignInAt)} /><DetailRow label="Last seen" value={fullDate(shownAccount.lastSeenAt)} /><DetailRow label="Account created" value={fullDate(shownAccount.authCreatedAt)} /><DetailRow label="Email verified" value={fullDate(shownAccount.emailConfirmedAt)} /><DetailRow label="Auth ID" value={<span>{shownAccount.authId} <button onClick={() => copy(shownAccount.authId)} style={{ border: 'none', background: 'none', color: C.blue, padding: 0, marginLeft: 5, cursor: 'pointer', fontSize: 10 }}>Copy</button></span>} mono /><DetailRow label="Profile ID" value={shownAccount.profileId ? <span>{shownAccount.profileId} <button onClick={() => copy(shownAccount.profileId!)} style={{ border: 'none', background: 'none', color: C.blue, padding: 0, marginLeft: 5, cursor: 'pointer', fontSize: 10 }}>Copy</button></span> : null} mono /></section>

              <section style={{ background: C.white, border: `0.5px solid ${shownAccount.accountStatus === 'deactivated' ? 'rgba(45,125,70,.2)' : 'rgba(216,68,43,.2)'}`, borderRadius: 13, padding: '14px 15px' }}><div style={{ fontSize: 12.5, fontWeight: 650, color: C.ink, marginBottom: 4 }}>Account lifecycle</div><p style={{ margin: '0 0 12px', color: C.inkMuted, fontSize: 10.5, lineHeight: 1.5 }}>{!shownAccount.authAvailable ? 'Lifecycle controls are safely disabled because Supabase Auth metadata could not be verified. Profile and role administration remain available.' : shownAccount.accountStatus === 'deactivated' ? 'This account is blocked from signing in. Reactivation is immediate and keeps all user data.' : 'Deactivation blocks sign-in and is reversible. Permanent deletion removes the Auth identity and profile data.'}</p>{shownAccount.accountStatus === 'deactivated' ? <button disabled={Boolean(busy) || !shownAccount.authAvailable} onClick={() => void runAction('reactivate')} style={{ ...buttonBase, width: '100%', background: C.verd, color: C.white, opacity: shownAccount.authAvailable ? 1 : .45 }}>{busy === 'reactivate' ? 'Reactivating…' : 'Reactivate account'}</button> : <button disabled={Boolean(busy) || !shownAccount.authAvailable} onClick={() => setConfirmMode('deactivate')} style={{ ...buttonBase, width: '100%', background: C.amberSoft, color: C.amber, border: '0.5px solid rgba(180,83,9,.16)', opacity: shownAccount.authAvailable ? 1 : .45 }}>Deactivate account</button>}<button disabled={Boolean(busy) || !shownAccount.authAvailable} onClick={() => { setConfirmMode('delete'); setConfirmation('') }} style={{ ...buttonBase, width: '100%', marginTop: 8, background: 'transparent', color: C.signal, border: `0.5px solid ${C.rule}`, opacity: shownAccount.authAvailable ? 1 : .45 }}>Permanently delete…</button></section>
            </div>
          </aside>
        </div>
      )}

      {shownAccount && confirmMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(20,14,10,.48)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 410, borderRadius: 16, background: C.white, padding: 22, boxShadow: '0 22px 60px rgba(20,12,8,.25)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: confirmMode === 'delete' ? C.signalSoft : C.amberSoft, color: confirmMode === 'delete' ? C.signal : C.amber, fontSize: 19, marginBottom: 13 }}>!</div>
            <h3 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 400, color: C.ink }}>{confirmMode === 'delete' ? 'Permanently delete account?' : 'Deactivate this account?'}</h3>
            <p style={{ color: C.inkMuted, fontSize: 12, lineHeight: 1.55, margin: '8px 0 15px' }}>{confirmMode === 'delete' ? 'This cannot be undone. The Auth identity and connected knotify profile will be deleted. Related data follows the database cascade rules.' : 'The user will be unable to sign in until an administrator reactivates the account. Their profile and data remain intact.'}</p>
            {confirmMode === 'delete' && <><label style={{ display: 'block', fontSize: 10.5, color: C.inkMuted, marginBottom: 6 }}>Type <strong style={{ color: C.ink }}>{shownAccount.email || shownAccount.authId}</strong> to confirm</label><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 8, border: `0.5px solid ${C.rule}`, background: C.paper, outline: 'none', fontSize: 12, color: C.ink, marginBottom: 12 }} /></>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button disabled={Boolean(busy)} onClick={() => { setConfirmMode(null); setConfirmation('') }} style={{ ...buttonBase, color: C.inkMuted, background: C.paperSoft }}>Cancel</button><button disabled={Boolean(busy) || (confirmMode === 'delete' && confirmation.toLowerCase() !== (shownAccount.email || shownAccount.authId).toLowerCase())} onClick={() => void runAction(confirmMode)} style={{ ...buttonBase, color: C.white, background: confirmMode === 'delete' ? C.signal : C.amber, opacity: Boolean(busy) || (confirmMode === 'delete' && confirmation.toLowerCase() !== (shownAccount.email || shownAccount.authId).toLowerCase()) ? .5 : 1 }}>{busy ? 'Working…' : confirmMode === 'delete' ? 'Delete permanently' : 'Deactivate account'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
