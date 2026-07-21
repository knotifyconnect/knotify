import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from './api'
import { LiveUsersPanel, type LiveUsersSnapshot } from './LiveUsersPanel'
import { ActivityAnalyticsPanel, type ActivityPeriod, type ActivityTrendSnapshot, type MetricInsight } from './ActivityAnalyticsPanel'
import { KpiInsightDrawer } from './KpiInsightDrawer'
import type { DashboardActivity, DashboardKpis, DashboardPoint } from './dashboardTypes'

const C = {
  signal: '#D8442B', ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287',
  paper: '#f5f0e8', paperSoft: '#ede8df', rule: 'rgba(84,72,58,0.14)',
  white: '#fff', verd: '#2d7d46', ochre: '#b8820f', blue: '#386a8a',
}

const card: CSSProperties = { background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14 }
const ghostButton: CSSProperties = {
  padding: '7px 12px', borderRadius: 7, border: `0.5px solid ${C.rule}`, background: 'transparent',
  color: C.inkMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
}

const MetricInsightContext = createContext<((insight: MetricInsight) => void) | null>(null)

const KPI_RANGES = [7, 14, 30, 90] as const

function pct(value: number, total: number) {
  return total ? Math.round(value / total * 100) : 0
}

function SectionTitle({ title, subtitle, accent = C.signal, action }: { title: string; subtitle?: string; accent?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, margin: '30px 0 11px', flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        </div>
        {subtitle && <div style={{ margin: '4px 0 0 16px', fontSize: 12, color: C.inkFaint }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

function Delta({ current, previous, label = 'vs yesterday' }: { current: number; previous: number; label?: string }) {
  const difference = current - previous
  const percent = previous ? Math.round(Math.abs(difference) / previous * 100) : null
  const color = difference > 0 ? C.verd : difference < 0 ? C.signal : C.inkFaint
  const text = difference === 0
    ? `No change ${label}`
    : `${difference > 0 ? '+' : ''}${difference}${percent === null ? '' : ` (${percent}%)`} ${label}`
  return <span style={{ fontSize: 11.5, color }}>{text}</span>
}

function MetricCard({ id, label, value, detail, current, previous, color, large = false }: {
  id: string; label: string; value: number | string; detail?: ReactNode; current?: number; previous?: number; color?: string; large?: boolean
}) {
  const openInsight = useContext(MetricInsightContext)
  return (
    <button type="button" onClick={() => openInsight?.({ id, label, value, detail, current, previous, color })} style={{ ...card, padding: large ? '21px 22px' : '17px 18px', minWidth: 0, width: '100%', textAlign: 'left', fontFamily: 'IBM Plex Sans, sans-serif', cursor: 'pointer', transition: 'transform .15s ease, box-shadow .15s ease' }} title={`Open detailed ${label} insight`}>
      <div style={{ color: C.inkFaint, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.075em', marginBottom: 9 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: large ? 36 : 29, lineHeight: 1, letterSpacing: '-0.03em', color: color ?? C.ink }}>{value}</div>
      <div style={{ marginTop: 9, minHeight: 17, fontSize: 11.5, color: C.inkFaint }}>
        {current !== undefined && previous !== undefined ? <Delta current={current} previous={previous} /> : detail}
      </div>
      <div style={{ marginTop: 8, color: C.blue, fontSize: 9.5, fontWeight: 650 }}>Open details →</div>
    </button>
  )
}

function RangePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {KPI_RANGES.map(range => (
        <button key={range} onClick={() => onChange(range)} style={{
          ...ghostButton, padding: '4px 10px', borderRadius: 999,
          borderColor: value === range ? C.signal : C.rule,
          background: value === range ? C.signal : 'transparent', color: value === range ? C.white : C.inkMuted,
        }}>{range}d</button>
      ))}
    </div>
  )
}

function TrendChart({ series }: { series: { label: string; color: string; points: DashboardPoint[] }[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 760, height = 190, left = 30, right = 10, top = 10, bottom = 25
  const visibleSeries = series.filter(item => !hidden.has(item.label))
  const values = visibleSeries.flatMap(item => item.points.map(point => point.count))
  const max = Math.max(1, ...values)
  const count = Math.max(1, ...series.map(item => item.points.length))
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (width - left - right)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const path = (points: DashboardPoint[]) => points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.count).toFixed(1)}`).join(' ')
  const dates = series[0]?.points ?? []
  const middle = Math.floor((dates.length - 1) / 2)
  return (
    <div style={{ ...card, padding: '18px 18px 12px', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
        {series.map(item => (
          <button key={item.label} type="button" onClick={() => setHidden(current => { const next = new Set(current); if (next.has(item.label)) next.delete(item.label); else if (next.size < series.length - 1) next.add(item.label); return next })} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', opacity: hidden.has(item.label) ? .35 : 1 }} title="Toggle series">
            <span style={{ width: 18, height: 2, background: item.color }} />
            <span style={{ color: C.inkMuted }}>{item.label}</span>
            <strong style={{ color: C.ink }}>{item.points.reduce((sum, point) => sum + point.count, 0)}</strong>
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', height: 190, cursor: 'crosshair' }} role="img" aria-label="Interactive growth and activity trend" onMouseLeave={() => setHoverIndex(null)} onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const svgX = (event.clientX - rect.left) / rect.width * width
        setHoverIndex(Math.max(0, Math.min(count - 1, Math.round((svgX - left) / (width - left - right) * Math.max(1, count - 1)))))
      }}>
        {[0, .5, 1].map(fraction => (
          <g key={fraction}>
            <line x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} stroke={C.rule} />
            <text x={left - 7} y={y(max * fraction) + 4} textAnchor="end" fontSize="9" fill={C.inkFaint}>{Math.round(max * fraction)}</text>
          </g>
        ))}
        {visibleSeries.map(item => <path key={item.label} d={path(item.points)} fill="none" stroke={item.color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />)}
        {hoverIndex !== null && <>
          <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={top} y2={height - bottom} stroke={C.inkFaint} strokeDasharray="3 3" />
          {visibleSeries.map(item => item.points[hoverIndex] ? <circle key={item.label} cx={x(hoverIndex)} cy={y(item.points[hoverIndex].count)} r="4" fill={C.white} stroke={item.color} strokeWidth="2" /> : null)}
          <g transform={`translate(${Math.min(width - 150, Math.max(left, x(hoverIndex) - 65))},${top + 4})`}>
            <rect width="140" height={24 + visibleSeries.length * 15} rx="7" fill={C.ink} opacity="0.94" />
            <text x="9" y="15" fontSize="9.5" fill={C.white}>{dates[hoverIndex]?.date ?? ''}</text>
            {visibleSeries.map((item, index) => <text key={item.label} x="9" y={31 + index * 15} fontSize="9.5" fill={item.color}>{item.label}: {item.points[hoverIndex]?.count ?? 0}</text>)}
          </g>
        </>}
        {dates.length > 0 && [0, middle, dates.length - 1].map((index, position) => (
          <text key={`${index}-${position}`} x={x(index)} y={height - 5} textAnchor={position === 0 ? 'start' : position === 2 ? 'end' : 'middle'} fontSize="9.5" fill={C.inkFaint}>
            {dates[index]?.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function Breakdown({ id, title, rows, total }: { id: string; title: string; rows: { label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  const openInsight = useContext(MetricInsightContext)
  return (
    <button type="button" onClick={() => openInsight?.({ id, label: title, value: total, detail: `${rows.length} visible segments` })} style={{ ...card, padding: 18, width: '100%', textAlign: 'left', fontFamily: 'IBM Plex Sans, sans-serif', cursor: 'pointer' }} title={`Open detailed ${title} insight`}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 15 }}>{title}</div>
      <div style={{ display: 'grid', gap: 11 }}>
        {rows.map(row => (
          <div key={row.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, marginBottom: 5 }}>
              <span style={{ color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <span style={{ color: C.ink, fontWeight: 700 }}>{row.count} <span style={{ color: C.inkFaint, fontWeight: 400 }}>· {pct(row.count, total)}%</span></span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: C.paperSoft, overflow: 'hidden' }}>
              <div style={{ width: `${row.count / max * 100}%`, height: '100%', borderRadius: 999, background: C.signal }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, color: C.blue, fontSize: 9.5, fontWeight: 650 }}>Open details →</div>
    </button>
  )
}

function Initials({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: C.paperSoft, color: C.inkMuted, fontSize: 11, fontWeight: 700 }}>
      {name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?'}
    </span>
  )
}

function LatestMembers({ users, timeZone }: { users: DashboardKpis['latestUsers']; timeZone: string }) {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: C.paperSoft }}>
              {['Member', 'Joined', 'Persona & location', 'Source', 'Profile', 'Last seen'].map(label => (
                <th key={label} style={{ padding: '10px 14px', textAlign: 'left', color: C.inkFaint, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderTop: `0.5px solid ${C.rule}` }}>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Initials name={user.fullName} src={user.avatarUrl} />
                    <div><div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{user.fullName}</div><div style={{ fontSize: 11, color: C.inkFaint }}>@{user.username}</div></div>
                  </div>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 11.5, color: C.inkMuted, whiteSpace: 'nowrap' }}>{formatter.format(new Date(user.createdAt))}</td>
                <td style={{ padding: '11px 14px', fontSize: 11.5 }}><div style={{ color: C.ink }}>{user.persona || 'Persona not set'}</div><div style={{ color: C.inkFaint }}>{user.locationCity || 'Location not set'}</div></td>
                <td style={{ padding: '11px 14px', fontSize: 11.5, color: user.source === 'Invite' ? C.verd : C.inkMuted }}>{user.source}</td>
                <td style={{ padding: '11px 14px', minWidth: 105 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><div style={{ width: 55, height: 5, background: C.paperSoft, borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${user.profileCompletion}%`, height: '100%', background: user.onboardingComplete ? C.verd : C.ochre }} /></div><span style={{ fontSize: 11, color: C.inkMuted }}>{user.profileCompletion}%</span></div>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 11.5, color: C.inkMuted, whiteSpace: 'nowrap' }}>{user.lastSeenAt ? formatter.format(new Date(user.lastSeenAt)) : 'Never'}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: C.inkFaint, fontSize: 12 }}>No members yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MostEngagedMembers({ users }: { users: DashboardKpis['engagement']['topUsers'] }) {
  const maxMinutes = Math.max(1, ...users.map(user => user.minutes))
  const openInsight = useContext(MetricInsightContext)
  return (
    <button type="button" onClick={() => openInsight?.({ id: 'engaged-members', label: 'Most engaged members', value: users.length, detail: 'Members ranked by foreground active time in the selected range' })} style={{ ...card, padding: 18, width: '100%', textAlign: 'left', fontFamily: 'IBM Plex Sans, sans-serif', cursor: 'pointer' }} title="Open detailed Most engaged members insight">
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 13 }}>Most engaged members · selected range</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {users.map((user, index) => (
          <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(130px,1fr) minmax(90px,1.4fr) auto', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: C.inkFaint }}>{index + 1}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: C.ink, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.fullName}</div><div style={{ fontSize: 10.5, color: user.online ? C.verd : C.inkFaint }}>{user.online ? '● online now' : user.username ? `@${user.username}` : 'Member'}</div></div>
            <div style={{ height: 7, borderRadius: 99, background: C.paperSoft, overflow: 'hidden' }}><div style={{ width: `${user.minutes / maxMinutes * 100}%`, height: '100%', borderRadius: 99, background: C.blue }} /></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>{user.minutes}m</div><div style={{ fontSize: 10, color: C.inkFaint }}>{user.sessions} opens</div></div>
          </div>
        ))}
        {!users.length && <div style={{ color: C.inkFaint, fontSize: 12 }}>Usage telemetry will appear after members open the updated app.</div>}
      </div>
      <div style={{ marginTop: 12, color: C.blue, fontSize: 9.5, fontWeight: 650 }}>Open details →</div>
    </button>
  )
}

function WorkQueue({ queue }: { queue: DashboardKpis['workQueue'] }) {
  const openInsight = useContext(MetricInsightContext)
  const rows = [
    ['queue-beta', 'Beta approvals', queue.betaPending, 'Signups waiting for a decision'],
    ['queue-feedback', 'Open feedback', queue.feedbackOpen, `${queue.bugsOpen} marked as bugs`],
    ['queue-gigs', 'Gig requests', queue.gigRequestsPending, 'Providers need to respond'],
    ['queue-roles', 'Role requests', queue.roleRequestsPending, 'HR or company access requests'],
  ] as const
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {rows.map(([id, label, value, note], index) => (
        <button type="button" key={label} onClick={() => openInsight?.({ id, label, value, detail: note })} style={{ padding: '14px 16px', width: '100%', display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto', alignItems: 'center', gap: 12, border: 'none', borderTop: index ? `0.5px solid ${C.rule}` : undefined, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif' }} title={`Open detailed ${label} insight`}>
          <div><div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{label}</div><div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>{note}</div></div>
          <span style={{ minWidth: 30, height: 30, padding: '0 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: value ? 'rgba(216,68,43,.10)' : C.paperSoft, color: value ? C.signal : C.inkFaint, fontWeight: 700, fontSize: 12 }}>{value}</span>
        </button>
      ))}
    </div>
  )
}

function BetaFunnel({ funnel }: { funnel: DashboardKpis['betaFunnel'] }) {
  const openInsight = useContext(MetricInsightContext)
  const rows = [
    ['Approved', funnel.approved, C.verd], ['Pending', funnel.pending, C.ochre], ['Rejected', funnel.rejected, C.signal],
  ] as const
  return (
    <button type="button" onClick={() => openInsight?.({ id: 'beta-waitlist', label: 'Beta waitlist', value: funnel.total, detail: `${funnel.pending} pending · ${funnel.approved} approved · ${funnel.rejected} rejected` })} style={{ ...card, padding: 18, width: '100%', textAlign: 'left', fontFamily: 'IBM Plex Sans, sans-serif', cursor: 'pointer' }} title="Open detailed Beta waitlist insight">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Beta waitlist</span><span style={{ fontSize: 12, color: C.inkMuted }}>{funnel.total} total</span></div>
      <div style={{ height: 12, display: 'flex', overflow: 'hidden', borderRadius: 999, background: C.paperSoft, marginBottom: 14 }}>
        {rows.map(([label, value, color]) => <div key={label} title={`${label}: ${value}`} style={{ width: `${pct(value, funnel.total)}%`, background: color }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {rows.map(([label, value, color]) => <div key={label}><div style={{ color, fontSize: 18, fontFamily: "'Fraunces', Georgia, serif" }}>{value}</div><div style={{ color: C.inkFaint, fontSize: 10.5 }}>{label} · {pct(value, funnel.total)}%</div></div>)}
      </div>
      <div style={{ marginTop: 12, color: C.blue, fontSize: 9.5, fontWeight: 650 }}>Open details →</div>
    </button>
  )
}

function exportDashboard(kpis: DashboardKpis) {
  const rows = [
    ['section', 'metric', 'value'],
    ['Today', 'New members', kpis.users.newToday], ['Today', 'Active members', kpis.users.activeToday],
    ['Today', 'Unique contributors', kpis.today.uniqueContributors], ['Today', 'Messages', kpis.today.messages],
    ['Today', 'Connections accepted', kpis.today.connectionsAccepted], ['Today', 'Event RSVPs', kpis.today.eventRsvps],
    ['Usage', 'Online now', kpis.engagement.onlineNow], ['Usage', 'App opens today', kpis.engagement.opensToday],
    ['Usage', 'Unique users today', kpis.engagement.uniqueUsersToday], ['Usage', 'Active minutes today', kpis.engagement.totalMinutesToday],
    ['Usage', 'Average session minutes', kpis.engagement.averageSessionMinutesToday],
    ['Users', 'Total', kpis.users.total], ['Users', 'Onboarding complete', kpis.users.onboardingComplete],
    ['Users', 'Active 7 days', kpis.users.active7d], ['Users', 'Dormant 30 days', kpis.users.dormant30d],
    ['Users', 'Average profile completion', `${kpis.users.averageProfileCompletion}%`], ['Users', 'Invited', kpis.users.invited],
    ['Work queue', 'Total', kpis.workQueue.total], ['Work queue', 'Beta approvals', kpis.workQueue.betaPending],
    ['Work queue', 'Open feedback', kpis.workQueue.feedbackOpen], ['Work queue', 'Pending gig requests', kpis.workQueue.gigRequestsPending],
  ]
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `knotify-company-dashboard-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function DashboardAdmin() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [liveUsers, setLiveUsers] = useState<LiveUsersSnapshot | null>(null)
  const [liveError, setLiveError] = useState('')
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('week')
  const [activityTrends, setActivityTrends] = useState<ActivityTrendSnapshot | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [selectedInsight, setSelectedInsight] = useState<MetricInsight | null>(null)
  const [range, setRange] = useState(14)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (selectedRange: number) => {
    setError('')
    try {
      setKpis(await api.kpis(selectedRange) as DashboardKpis)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(range) }, [load, range])

  useEffect(() => {
    let disposed = false
    let inFlight = false
    const refreshLiveUsers = async () => {
      if (disposed || inFlight || document.hidden) return
      inFlight = true
      try {
        const snapshot = await api.liveUsers() as LiveUsersSnapshot
        if (!disposed) { setLiveUsers(snapshot); setLiveError('') }
      } catch (caught) {
        if (!disposed) setLiveError(caught instanceof Error ? caught.message : 'Live presence could not be refreshed.')
      } finally { inFlight = false }
    }
    const onVisibility = () => { if (!document.hidden) void refreshLiveUsers() }
    void refreshLiveUsers()
    const timer = window.setInterval(() => { void refreshLiveUsers() }, 3000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let inFlight = false
    const refreshActivity = async () => {
      if (disposed || inFlight || document.hidden) return
      inFlight = true
      try {
        const snapshot = await api.activityTrends(activityPeriod) as ActivityTrendSnapshot
        if (!disposed) { setActivityTrends(snapshot); setActivityError('') }
      } catch (caught) {
        if (!disposed) setActivityError(caught instanceof Error ? caught.message : 'Activity intelligence could not be refreshed.')
      } finally {
        inFlight = false
        if (!disposed) setActivityLoading(false)
      }
    }
    setActivityLoading(true)
    void refreshActivity()
    const timer = window.setInterval(() => void refreshActivity(), 60_000)
    const onVisibility = () => { if (!document.hidden) void refreshActivity() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [activityPeriod])

  if (loading && !kpis) return <div style={{ padding: 48, textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>Loading company dashboard…</div>
  if (error && !kpis) return <div style={{ ...card, padding: 20, color: C.signal, fontSize: 13 }}>{error}</div>
  if (!kpis) return null

  const { users, today, yesterday, growth, engagement } = kpis
  const activityCards: { id: string; label: string; key: keyof DashboardActivity; detail: string }[] = [
    { id: 'activity-messages', label: 'Messages sent', key: 'messages', detail: 'Chat messages sent by members' },
    { id: 'activity-connections-accepted', label: 'Connections made', key: 'connectionsAccepted', detail: 'Requests accepted today' },
    { id: 'activity-connections-requested', label: 'Connection requests', key: 'connectionsRequested', detail: 'New requests between members' },
    { id: 'activity-event-rsvps', label: 'Event RSVPs', key: 'eventRsvps', detail: 'Members joining events' },
    { id: 'activity-quest-completions', label: 'Quest completions', key: 'questCompletions', detail: 'Verified progress signals' },
    { id: 'activity-gig-requests', label: 'Gig requests', key: 'gigRequests', detail: 'Requests sent to providers' },
    { id: 'activity-cafe-checkins', label: 'Café check-ins', key: 'cafeCheckins', detail: 'Member venue activity' },
    { id: 'activity-conversations', label: 'New conversations', key: 'conversations', detail: 'Conversation threads started' },
  ]
  const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: kpis.context.timeZone, hour: '2-digit', minute: '2-digit' })

  return (
    <MetricInsightContext.Provider value={setSelectedInsight}>
    <div className="dashboard-admin">
      <style>{`.dashboard-admin button[title^="Open detailed"]:hover { transform: translateY(-2px); box-shadow: 0 9px 24px rgba(35,25,17,.08); border-color: rgba(56,106,138,.32) !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 25, fontWeight: 400, letterSpacing: '-0.025em', margin: '0 0 4px', color: C.ink }}>Today at Knotify</h2>
          <div style={{ fontSize: 12, color: C.inkFaint }}>Berlin business day · refreshed {timeFormatter.format(new Date(kpis.generatedAt))} · comparisons use {kpis.context.comparisonLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ghostButton} onClick={() => exportDashboard(kpis)}>Export CSV</button>
          <button style={ghostButton} onClick={() => { setLoading(true); void load(range) }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>
      {error && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(216,68,43,.08)', color: C.signal, fontSize: 12 }}>{error} Showing the last successful snapshot.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 19 }}>
        <MetricCard id="new-members" large label="New members" value={users.newToday} current={users.newToday} previous={users.newYesterday} color={C.verd} />
        <MetricCard id="active-members" large label="Active members" value={users.activeToday} detail={`${users.returningToday} returning · ${users.newActiveToday} new`} />
        <MetricCard id="unique-contributors" large label="Unique contributors" value={today.uniqueContributors} current={today.uniqueContributors} previous={yesterday.uniqueContributors} detail="Members who created, joined, messaged or connected" color={C.blue} />
        <MetricCard id="activity-messages" large label="Messages sent" value={today.messages} current={today.messages} previous={yesterday.messages} color={C.signal} />
      </div>

      <SectionTitle title="User health" subtitle="Who is joining, activating and coming back" accent={C.verd} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <MetricCard id="all-members" label="All members" value={users.total} detail={`${users.new7d} joined in the last 7 days`} />
        <MetricCard id="onboarding" label="Onboarded" value={`${users.onboardingRate}%`} detail={`${users.onboardingComplete} members completed core onboarding`} color={C.verd} />
        <MetricCard id="profile-quality" label="Profile quality" value={`${users.averageProfileCompletion}%`} detail="Average completion across member profiles" />
        <MetricCard id="active-7d" label="Active · 7 days" value={users.active7d} detail={`${pct(users.active7d, users.total)}% of all members`} color={C.blue} />
        <MetricCard id="dormant-30d" label="Dormant · 30 days" value={users.dormant30d} detail="Not seen in the last 30 days" color={users.dormant30d ? C.ochre : C.verd} />
        <MetricCard id="invite-acquisition" label="Invite acquisition" value={`${pct(users.invited, users.total)}%`} detail={`${users.invited} invited · ${users.organic} organic`} />
      </div>

      <SectionTitle title="Live usage" subtitle="First-party session telemetry: app opens, active time and who is using Knotify now" accent={C.blue} />
      {!engagement.available ? (
        <div style={{ ...card, padding: 18, color: C.ochre, background: 'rgba(184,130,15,.09)', borderColor: 'rgba(154,103,24,.2)', fontSize: 12.5, lineHeight: 1.55 }}>
          The dashboard remains operational, but live usage analytics are paused until the product-activity Supabase migration is applied. Existing member, activity, work-queue and platform metrics below are unaffected.
        </div>
      ) : <>
        <LiveUsersPanel snapshot={liveUsers} error={liveError} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <MetricCard id="online-now" label="Online now" value={liveUsers?.users.length ?? engagement.onlineNow} detail="Live heartbeat · refreshes every 3 seconds" color={C.verd} />
          <MetricCard id="app-opens" label="App opens today" value={engagement.opensToday} current={engagement.opensToday} previous={engagement.opensYesterday} />
          <MetricCard id="unique-users-today" label="Unique users today" value={engagement.uniqueUsersToday} current={engagement.uniqueUsersToday} previous={engagement.uniqueUsersYesterday} color={C.blue} />
          <MetricCard id="active-minutes-today" label="Active minutes today" value={engagement.totalMinutesToday} current={engagement.totalMinutesToday} previous={engagement.totalMinutesYesterday} />
          <MetricCard id="average-session" label="Avg. session" value={`${engagement.averageSessionMinutesToday}m`} current={engagement.averageSessionMinutesToday} previous={engagement.averageSessionMinutesYesterday} detail="Foreground active time per app open" />
        </div>
        <ActivityAnalyticsPanel data={activityTrends} period={activityPeriod} loading={activityLoading} error={activityError} onPeriodChange={setActivityPeriod} onInsight={setSelectedInsight} />
        <div style={{ marginTop: 12 }}><MostEngagedMembers users={engagement.topUsers} /></div>
      </>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
        <Breakdown id="members-by-persona" title="Members by persona" rows={users.personas} total={users.total} />
        <Breakdown id="members-by-location" title="Members by location" rows={users.locations} total={users.total} />
      </div>

      <SectionTitle title="Latest members" subtitle="The newest accounts and whether they made it through onboarding" />
      <LatestMembers users={kpis.latestUsers} timeZone={kpis.context.timeZone} />

      <SectionTitle title="Activity today" subtitle={`Volume compared with ${kpis.context.comparisonLabel}`} accent={C.blue} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {activityCards.map(item => <MetricCard key={item.key} id={item.id} label={item.label} value={today[item.key]} current={today[item.key]} previous={yesterday[item.key]} detail={item.detail} />)}
      </div>

      <SectionTitle title="Growth & engagement" subtitle="New users, waitlist demand and messages by Berlin calendar day" accent={C.verd} action={<RangePicker value={range} onChange={value => { setLoading(true); setRange(value) }} />} />
      <TrendChart series={[
        { label: 'New members', color: C.verd, points: growth.usersPerDay },
        { label: 'Messages', color: C.blue, points: growth.messagesPerDay },
        { label: 'Waitlist signups', color: C.signal, points: growth.signupsPerDay },
      ]} />

      <SectionTitle title="Needs attention" subtitle={`${kpis.workQueue.total} items currently require an operator`} accent={kpis.workQueue.total ? C.signal : C.verd} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <WorkQueue queue={kpis.workQueue} />
        <BetaFunnel funnel={kpis.betaFunnel} />
      </div>

      <SectionTitle title="Platform footprint" subtitle="Current inventory and all-time network volume" accent={C.inkMuted} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
        {[
          ['platform-messages', 'Messages', kpis.platform.messagesTotal], ['platform-connections', 'Connections', kpis.platform.connectionsAccepted], ['platform-conversations', 'Conversations', kpis.platform.conversationsTotal],
          ['platform-events', 'Upcoming events', kpis.platform.upcomingEvents], ['platform-gigs', 'Open gigs', kpis.platform.openGigs], ['platform-cafes', 'Active cafés', kpis.platform.activeCafes], ['platform-quests', 'Published quests', kpis.platform.publishedQuests],
        ].map(([id, label, value]) => <MetricCard key={id} id={String(id)} label={String(label)} value={value} detail="Current platform inventory or all-time volume" />)}
      </div>
      <KpiInsightDrawer insight={selectedInsight} kpis={kpis} activity={activityTrends} liveUsers={liveUsers} onClose={() => setSelectedInsight(null)} />
    </div>
    </MetricInsightContext.Provider>
  )
}
