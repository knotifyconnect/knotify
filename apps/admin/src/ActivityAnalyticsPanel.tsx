import { useState, type ReactNode } from 'react'

export type ActivityPeriod = 'day' | 'week' | 'month' | 'year'
export type ActivityTotals = { activeUsers: number; sessions: number; activeMinutes: number; pageViews: number; heartbeats: number; exits: number }
export type ActivityPoint = ActivityTotals & { key: string; label: string; start: string }
export type ActivityTrendSnapshot = {
  available: boolean
  period: ActivityPeriod
  generatedAt: string
  timeZone: string
  source?: 'hourly' | 'mixed' | 'session-estimate'
  window?: { start: string; end: string; previousStart: string; previousEnd: string }
  summary?: { current: ActivityTotals; previous: ActivityTotals }
  points?: ActivityPoint[]
  timeOfDay?: (ActivityTotals & { hour: number; label: string })[]
  weekdays?: (ActivityTotals & { day: number; label: string })[]
  devices?: { label: string; count: number }[]
  sections?: { label: string; count: number }[]
  peak?: ActivityPoint | null
}

export type MetricInsight = {
  id: string
  label: string
  value: number | string
  detail?: ReactNode
  current?: number
  previous?: number
  color?: string
}

const C = {
  signal: '#D8442B', ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287', paper: '#f5f0e8',
  paperSoft: '#ede8df', white: '#fff', rule: 'rgba(84,72,58,.14)', verd: '#2d7d46', blue: '#386a8a', ochre: '#b8820f',
}
const card = { background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14 }
const PERIODS: { value: ActivityPeriod; label: string; detail: string }[] = [
  { value: 'day', label: 'Day', detail: 'hour by hour' },
  { value: 'week', label: 'Week', detail: 'last 7 days' },
  { value: 'month', label: 'Month', detail: 'last 30 days' },
  { value: 'year', label: 'Year', detail: 'last 12 months' },
]
const METRICS: { key: keyof Pick<ActivityPoint, 'activeUsers' | 'sessions' | 'activeMinutes' | 'pageViews'>; label: string; color: string }[] = [
  { key: 'activeUsers', label: 'Active people', color: C.verd },
  { key: 'sessions', label: 'Sessions', color: C.blue },
  { key: 'activeMinutes', label: 'Active minutes', color: C.signal },
  { key: 'pageViews', label: 'Page views', color: C.ochre },
]

function delta(current = 0, previous = 0) {
  if (!previous) return current ? { text: 'New activity', color: C.verd } : { text: 'No activity', color: C.inkFaint }
  const change = Math.round((current - previous) / previous * 100)
  return { text: `${change >= 0 ? '+' : ''}${change}% vs prior period`, color: change >= 0 ? C.verd : C.signal }
}

function SummaryTile({ label, value, previous, color, onClick }: { label: string; value: number; previous: number; color: string; onClick?: () => void }) {
  const comparison = delta(value, previous)
  return <button type="button" onClick={onClick} style={{ ...card, padding: '14px 15px', width: '100%', textAlign: 'left', fontFamily: 'IBM Plex Sans, sans-serif', cursor: onClick ? 'pointer' : 'default' }} title={`Open detailed ${label} insight`}><div style={{ color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.07em', fontSize: 9.5, fontWeight: 700 }}>{label}</div><div style={{ marginTop: 8, fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, color }}>{value.toLocaleString()}</div><div style={{ marginTop: 4, color: comparison.color, fontSize: 10 }}>{comparison.text}</div><div style={{ marginTop: 7, color: C.blue, fontSize: 9.5, fontWeight: 650 }}>Open details →</div></button>
}

function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('activeUsers')
  const [hovered, setHovered] = useState<number | null>(null)
  const selected = METRICS.find(item => item.key === metric) ?? METRICS[0]
  const values = points.map(point => point[metric])
  const max = Math.max(1, ...values)
  const width = 860, height = 220, left = 36, right = 12, top = 14, bottom = 34
  const x = (index: number) => left + index / Math.max(1, points.length - 1) * (width - left - right)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[metric]).toFixed(1)}`).join(' ')
  const labels = points.length > 12 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index)

  return <div style={{ ...card, padding: '16px 16px 10px' }}>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {METRICS.map(item => <button key={item.key} onClick={() => setMetric(item.key)} style={{ border: `0.5px solid ${metric === item.key ? item.color : C.rule}`, borderRadius: 999, padding: '5px 9px', background: metric === item.key ? `${item.color}12` : 'transparent', color: metric === item.key ? item.color : C.inkMuted, fontSize: 10.5, fontWeight: 650, cursor: 'pointer' }}>{item.label}</button>)}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selected.label} activity trend`} style={{ width: '100%', height: 220, display: 'block', cursor: 'crosshair' }} onMouseLeave={() => setHovered(null)} onMouseMove={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      const point = Math.round((((event.clientX - rect.left) / rect.width * width) - left) / (width - left - right) * Math.max(1, points.length - 1))
      setHovered(Math.max(0, Math.min(points.length - 1, point)))
    }}>
      {[0, .5, 1].map(step => <g key={step}><line x1={left} x2={width - right} y1={y(max * step)} y2={y(max * step)} stroke={C.rule} /><text x={left - 7} y={y(max * step) + 4} textAnchor="end" fontSize="9" fill={C.inkFaint}>{Math.round(max * step)}</text></g>)}
      <path d={line} fill="none" stroke={selected.color} strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <circle key={point.key} cx={x(index)} cy={y(point[metric])} r={hovered === index ? 4.5 : 2.3} fill={C.white} stroke={selected.color} strokeWidth="2" />)}
      {hovered !== null && points[hovered] && <g><line x1={x(hovered)} x2={x(hovered)} y1={top} y2={height - bottom} stroke={C.inkFaint} strokeDasharray="3 3" /><g transform={`translate(${Math.min(width - 170, Math.max(left, x(hovered) - 78))},${top + 5})`}><rect width="160" height="70" rx="8" fill={C.ink} opacity=".95" /><text x="10" y="17" fill={C.white} fontSize="10" fontWeight="700">{points[hovered].label}</text><text x="10" y="34" fill={selected.color} fontSize="10">{selected.label}: {points[hovered][metric]}</text><text x="10" y="49" fill={C.white} fontSize="9">{points[hovered].sessions} sessions · {points[hovered].activeMinutes}m</text><text x="10" y="63" fill={C.white} fontSize="9">{points[hovered].pageViews} page views</text></g></g>}
      {labels.map((index, position) => <text key={index} x={x(index)} y={height - 8} textAnchor={position === 0 ? 'start' : position === labels.length - 1 ? 'end' : 'middle'} fontSize="9" fill={C.inkFaint}>{points[index]?.label}</text>)}
    </svg>
  </div>
}

function BarDistribution({ title, rows, metric = 'activeUsers' }: { title: string; rows: (ActivityTotals & { label: string })[]; metric?: keyof ActivityTotals }) {
  const max = Math.max(1, ...rows.map(row => row[metric]))
  return <div style={{ ...card, padding: 16 }}><div style={{ color: C.ink, fontWeight: 700, fontSize: 12.5, marginBottom: 12 }}>{title}</div><div style={{ display: 'flex', height: 115, alignItems: 'flex-end', gap: 4 }}>{rows.map(row => <div key={row.label} title={`${row.label}: ${row[metric]} active people, ${row.activeMinutes} minutes`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}><div style={{ height: `${Math.max(row[metric] ? 7 : 2, row[metric] / max * 88)}%`, borderRadius: '4px 4px 1px 1px', background: row[metric] ? C.blue : C.paperSoft, opacity: .82 }} /><div style={{ marginTop: 5, color: C.inkFaint, fontSize: 8, textAlign: 'center', overflow: 'hidden' }}>{rows.length > 12 ? row.label.slice(0, 2) : row.label}</div></div>)}</div></div>
}

function RankedList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const max = Math.max(1, ...rows.map(row => row.count))
  return <div style={{ ...card, padding: 16 }}><div style={{ fontSize: 12.5, color: C.ink, fontWeight: 700, marginBottom: 12 }}>{title}</div>{rows.length ? <div style={{ display: 'grid', gap: 10 }}>{rows.map(row => <div key={row.label}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5 }}><span style={{ color: C.inkMuted, textTransform: 'capitalize' }}>{row.label}</span><span style={{ color: C.ink, fontWeight: 700 }}>{row.count} · {total ? Math.round(row.count / total * 100) : 0}%</span></div><div style={{ height: 5, borderRadius: 99, marginTop: 5, background: C.paperSoft, overflow: 'hidden' }}><div style={{ width: `${row.count / max * 100}%`, height: '100%', background: C.verd }} /></div></div>)}</div> : <div style={{ color: C.inkFaint, fontSize: 11 }}>No activity in this range.</div>}</div>
}

export function ActivityAnalyticsPanel({ data, period, loading, error, onPeriodChange, onInsight }: { data: ActivityTrendSnapshot | null; period: ActivityPeriod; loading: boolean; error?: string; onPeriodChange: (period: ActivityPeriod) => void; onInsight?: (insight: MetricInsight) => void }) {
  const current = data?.summary?.current
  const previous = data?.summary?.previous
  const points = data?.points ?? []
  const quality = data?.source === 'mixed' ? 'Live hourly data + clearly marked legacy estimate' : data?.source === 'session-estimate' ? 'Legacy session estimate until hourly migration is active' : 'Durable hourly activity records'
  return <section style={{ marginTop: 14 }}>
    <div style={{ ...card, padding: '15px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div><div style={{ color: C.ink, fontSize: 14, fontWeight: 750 }}>When people use Knotify</div><div style={{ marginTop: 3, color: C.inkFaint, fontSize: 10.5 }}>{quality} · Europe/Berlin reporting time</div></div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{PERIODS.map(item => <button key={item.value} onClick={() => onPeriodChange(item.value)} title={item.detail} style={{ border: `0.5px solid ${period === item.value ? C.signal : C.rule}`, borderRadius: 999, background: period === item.value ? C.signal : 'transparent', color: period === item.value ? C.white : C.inkMuted, padding: '6px 11px', cursor: 'pointer', fontSize: 10.5, fontWeight: 650 }}>{item.label}</button>)}</div>
    </div>
    {error && <div style={{ ...card, padding: 13, color: C.signal, background: 'rgba(216,68,43,.06)', marginBottom: 10, fontSize: 11.5 }}>{error}</div>}
    {loading && !data ? <div style={{ ...card, padding: 35, color: C.inkFaint, textAlign: 'center' }}>Loading activity intelligence…</div> : !data?.available ? <div style={{ ...card, padding: 20, color: C.ochre }}>Activity analytics will appear after the product-activity schema is available.</div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8, marginBottom: 10 }}>
        <SummaryTile label="Active people" value={current?.activeUsers ?? 0} previous={previous?.activeUsers ?? 0} color={C.verd} onClick={() => onInsight?.({ id: 'analytics-active-people', label: `Active people · ${period}`, value: current?.activeUsers ?? 0, current: current?.activeUsers, previous: previous?.activeUsers, color: C.verd })} />
        <SummaryTile label="Sessions" value={current?.sessions ?? 0} previous={previous?.sessions ?? 0} color={C.blue} onClick={() => onInsight?.({ id: 'analytics-sessions', label: `Sessions · ${period}`, value: current?.sessions ?? 0, current: current?.sessions, previous: previous?.sessions, color: C.blue })} />
        <SummaryTile label="Active minutes" value={current?.activeMinutes ?? 0} previous={previous?.activeMinutes ?? 0} color={C.signal} onClick={() => onInsight?.({ id: 'analytics-active-minutes', label: `Active minutes · ${period}`, value: current?.activeMinutes ?? 0, current: current?.activeMinutes, previous: previous?.activeMinutes, color: C.signal })} />
        <SummaryTile label="Page views" value={current?.pageViews ?? 0} previous={previous?.pageViews ?? 0} color={C.ochre} onClick={() => onInsight?.({ id: 'analytics-page-views', label: `Page views · ${period}`, value: current?.pageViews ?? 0, current: current?.pageViews, previous: previous?.pageViews, color: C.ochre })} />
      </div>
      <ActivityChart points={points} />
      <div style={{ margin: '8px 2px 10px', fontSize: 10.5, color: C.inkFaint }}>{data.peak ? <>Peak: <strong style={{ color: C.ink }}>{data.peak.label}</strong> with {data.peak.activeUsers} active people and {data.peak.activeMinutes} active minutes.</> : 'No peak yet in this period.'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 10 }}>
        <BarDistribution title="Time-of-day activity" rows={data.timeOfDay ?? []} />
        <BarDistribution title="Activity by weekday" rows={data.weekdays ?? []} />
        <RankedList title="Devices" rows={data.devices ?? []} />
        <RankedList title="Most-used sections" rows={data.sections ?? []} />
      </div>
    </>}
  </section>
}
