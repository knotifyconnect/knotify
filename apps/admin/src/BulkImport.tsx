import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

type Kind = 'events' | 'cafes'
type Mode = 'create' | 'update'
type Issue = { field: string; message: string; severity: 'error' | 'warning' }
type PreviewRow = { row: number; data: Record<string, unknown>; issues: Issue[] }

const EVENT_COLUMNS = ['title', 'description', 'location', 'start_date', 'start_time', 'end_date', 'end_time', 'url', 'host_label', 'image_url', 'event_type', 'capacity', 'price_eur']
const CAFE_COLUMNS = ['slug', 'name', 'venue_type', 'address', 'city', 'area', 'description', 'perk_text', 'photo_url', 'hours_text', 'lat', 'lng', 'is_partnered', 'is_active', 'deal_title', 'deal_details', 'deal_code', 'deal_code_enabled', 'featured_priority']
const EVENT_TYPES = new Set(['networking', 'social', 'sports', 'music', 'career', 'workshop', 'outdoor', 'party'])

function key(value: unknown) { return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
function value(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const text = String(row[name] ?? '').trim()
    if (text && !['n/a', 'na', 'null', 'none', 'undefined', '-', 'tba', 'tbd'].includes(text.toLowerCase())) return text
  }
  return ''
}
function emptyOrText(v: string) { return v || null }
function urlOrIssue(v: string, field: string, issues: Issue[]) {
  if (!v) return null
  try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); return u.toString() }
  catch { issues.push({ field, message: 'must be an http(s) URL', severity: 'error' }); return null }
}
function wholeNumber(v: string, field: string, issues: Issue[], minimum = 0) {
  if (!v) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < minimum) { issues.push({ field, message: `must be a whole number${minimum ? ` of at least ${minimum}` : ''}`, severity: 'error' }); return null }
  return n
}
function decimal(v: string, field: string, issues: Issue[], min: number, max: number) {
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) { issues.push({ field, message: `must be between ${min} and ${max}`, severity: 'error' }); return null }
  return n
}
function bool(v: string, field: string, issues: Issue[], fallback: boolean) {
  if (!v) return fallback
  if (['true', 'yes', '1'].includes(v.toLowerCase())) return true
  if (['false', 'no', '0'].includes(v.toLowerCase())) return false
  issues.push({ field, message: 'must be true/false, yes/no, or 1/0', severity: 'error' })
  return fallback
}
function isoDate(v: string, field: string, issues: Issue[], occurrence = 0) {
  if (!v) return ''
  const matches = [...v.matchAll(/(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4}))/g)]
  const match = matches[occurrence]
  if (!match) {
    const parsed = new Date(v)
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
    issues.push({ field, message: 'must be a valid date (YYYY-MM-DD, DD.MM.YYYY, or an English month name)', severity: 'error' }); return ''
  }
  const year = Number(match[1] ?? match[6]); const month = Number(match[2] ?? match[5]); const day = Number(match[3] ?? match[4])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    issues.push({ field, message: 'must be a real calendar date', severity: 'error' }); return ''
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function time(v: string, field: string, issues: Issue[]) {
  if (!v) return ''
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(v.trim())
  if (!match || Number(match[1]) > 23) { issues.push({ field, message: 'must use HH:MM (24-hour)', severity: 'error' }); return '' }
  return `${match[1].padStart(2, '0')}:${match[2]}`
}
function embeddedTime(v: string) {
  const match = /(?:T|\s)(\d{1,2}:\d{2})(?::\d{2})?/.exec(v.trim())
  return match?.[1] ?? ''
}
function asWarning<T>(issues: Issue[], parse: () => T) {
  const firstIssue = issues.length
  const parsed = parse()
  for (let index = firstIssue; index < issues.length; index += 1) issues[index].severity = 'warning'
  return parsed
}

function eventRow(row: Record<string, unknown>, rowNumber: number): PreviewRow {
  const issues: Issue[] = []
  const title = value(row, 'title', 'event_name', 'event_title', 'name')
  if (title.length < 2) issues.push({ field: 'title', message: 'is required (at least 2 characters)', severity: 'error' })
  const startDateValue = value(row, 'start_date', 'starts_at', 'event_date', 'date', 'start', 'begin_date', 'datum')
  const endDateValue = value(row, 'end_date', 'ends_at', 'end', 'finish_date', 'until', 'enddatum')
  const startDate = isoDate(startDateValue, 'start_date', issues)
  if (!startDate) issues.push({ field: 'start_date', message: 'is required', severity: 'error' })
  const startTime = asWarning(issues, () => time(value(row, 'start_time', 'starts_at_time', 'time', 'starttime') || embeddedTime(startDateValue), 'start_time', issues))
  let endDate = asWarning(issues, () => isoDate(endDateValue, 'end_date', issues, endDateValue === startDateValue ? 1 : 0))
  let endTime = asWarning(issues, () => time(value(row, 'end_time', 'ends_at_time', 'endtime') || embeddedTime(endDateValue), 'end_time', issues))
  if (endTime && !endDate) { issues.push({ field: 'end_time', message: 'was omitted because end_date is unavailable', severity: 'warning' }); endTime = '' }
  const rawEventType = value(row, 'event_type', 'type', 'category', 'event_category').toLowerCase()
  const eventType = EVENT_TYPES.has(rawEventType) ? rawEventType : ''
  if (rawEventType && !eventType) issues.push({ field: 'event_type', message: 'will be imported without a type because it is not one of the admin categories', severity: 'warning' })
  const startsAt = startDate ? `${startDate}T${startTime || '00:00'}:00` : ''
  let endsAt = endDate ? `${endDate}T${endTime || '00:00'}:00` : null
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) { issues.push({ field: 'end_date', message: 'was omitted because it is before start_date', severity: 'warning' }); endDate = ''; endTime = ''; endsAt = null }
  let interests = value(row, 'interests') ? value(row, 'interests').split(/[|,]/).map(x => x.trim()).filter(Boolean) : []
  if (interests.some(x => x.length > 60) || interests.length > 10) { issues.push({ field: 'interests', message: 'were omitted because there are more than 10 values or a value is too long', severity: 'warning' }); interests = [] }
  const url = asWarning(issues, () => urlOrIssue(value(row, 'url'), 'url', issues))
  const imageUrl = asWarning(issues, () => urlOrIssue(value(row, 'image_url'), 'image_url', issues))
  const capacity = asWarning(issues, () => wholeNumber(value(row, 'capacity'), 'capacity', issues))
  const priceEur = asWarning(issues, () => wholeNumber(value(row, 'price_eur'), 'price_eur', issues))
  return { row: rowNumber, issues, data: {
    title, description: emptyOrText(value(row, 'description')), location: emptyOrText(value(row, 'location')),
    startsAt, endsAt, timeTba: !startTime && !endTime, url,
    hostLabel: emptyOrText(value(row, 'host_label')), imageUrl,
    eventType: eventType || null, capacity, priceEur, interests,
  } }
}

function cafeRow(row: Record<string, unknown>, rowNumber: number): PreviewRow {
  const issues: Issue[] = []
  const slug = value(row, 'slug').toLowerCase()
  const name = value(row, 'name')
  if (!/^[a-z0-9-]{2,64}$/.test(slug)) issues.push({ field: 'slug', message: 'is required; use 2–64 lowercase letters, numbers, or hyphens', severity: 'error' })
  if (name.length < 2) issues.push({ field: 'name', message: 'is required (at least 2 characters)', severity: 'error' })
  const venueType = (value(row, 'venue_type') || 'cafe').toLowerCase()
  if (!['cafe', 'restaurant', 'bar'].includes(venueType)) issues.push({ field: 'venue_type', message: 'must be cafe, restaurant, or bar', severity: 'error' })
  const isPartnered = bool(value(row, 'is_partnered'), 'is_partnered', issues, false)
  const dealCode = emptyOrText(value(row, 'deal_code'))
  const dealCodeEnabled = bool(value(row, 'deal_code_enabled'), 'deal_code_enabled', issues, false)
  if (dealCodeEnabled && (!isPartnered || !dealCode)) issues.push({ field: 'deal_code_enabled', message: 'requires a partnered listing with a deal_code', severity: 'error' })
  return { row: rowNumber, issues, data: {
    slug, name, venueType, address: emptyOrText(value(row, 'address')), city: value(row, 'city') || 'Munich',
    area: emptyOrText(value(row, 'area')), description: emptyOrText(value(row, 'description')), perkText: emptyOrText(value(row, 'perk_text')),
    photoUrl: urlOrIssue(value(row, 'photo_url'), 'photo_url', issues), hoursText: emptyOrText(value(row, 'hours_text')),
    lat: decimal(value(row, 'lat'), 'lat', issues, -90, 90), lng: decimal(value(row, 'lng'), 'lng', issues, -180, 180),
    isPartnered, isActive: bool(value(row, 'is_active'), 'is_active', issues, true), dealTitle: emptyOrText(value(row, 'deal_title')),
    dealDetails: emptyOrText(value(row, 'deal_details')), dealCode, dealCodeEnabled,
    featuredPriority: wholeNumber(value(row, 'featured_priority'), 'featured_priority', issues),
  } }
}

function template(kind: Kind, csv: boolean) {
  const columns = kind === 'events' ? EVENT_COLUMNS : CAFE_COLUMNS
  const examples = kind === 'events'
    ? ['TUM x Industry Night', 'Meet local founders and students.', 'Audimax', '2026-09-20', '', '', '', 'https://example.com/event', 'TUM', '', 'networking', '100', '0']
    : ['example-cafe', 'Example Cafe', 'cafe', 'Sample street 1', 'Munich', 'Maxvorstadt', '', '', 'https://example.com/image.jpg', '', '', '', 'false', 'true', '', '', '', 'false', '0']
  const worksheet = XLSX.utils.aoa_to_sheet([columns, examples])
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, worksheet, kind === 'events' ? 'Events' : 'Cafes')
  XLSX.writeFile(book, `knotify-${kind}-import-template.${csv ? 'csv' : 'xlsx'}`, { bookType: csv ? 'csv' : 'xlsx' })
}

export function BulkImport({ kind, onImport }: { kind: Kind; onImport: (rows: Array<{ row: number; data: Record<string, unknown> }>, mode: Mode) => Promise<{ results?: Array<{ row: number; status: string; error?: string }> }> }) {
  const ref = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [mode, setMode] = useState<Mode>('create')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const label = kind === 'events' ? 'Events' : 'Cafes'
  const valid = rows.filter(row => !row.issues.some(issue => issue.severity === 'error'))

  async function choose(file: File) {
    setMessage(''); setRows([])
    if (!/\.(xlsx|csv)$/i.test(file.name)) { setMessage('Choose an .xlsx or .csv file.'); return }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
      if (!rawRows.length) { setMessage('The first sheet has no data rows.'); return }
      if (rawRows.length > 500) { setMessage('Import files may contain up to 500 rows.'); return }
      const parsed = rawRows.map((source, index) => {
        const normalized = Object.fromEntries(Object.entries(source).map(([header, cell]) => [key(header), cell]))
        return kind === 'events' ? eventRow(normalized, index + 2) : cafeRow(normalized, index + 2)
      })
      setRows(parsed)
    } catch { setMessage('Could not read this workbook. Use a standard .xlsx or UTF-8 .csv file.'); }
    if (ref.current) ref.current.value = ''
  }

  async function save() {
    if (!valid.length || !confirm(`Import ${valid.length} valid ${label.toLowerCase()} row(s)? ${rows.length - valid.length} invalid row(s) will be skipped.`)) return
    setBusy(true); setMessage('')
    try {
      const response = await onImport(valid.map(({ row, data }) => ({ row, data })), mode)
      const results = response.results ?? []
      const created = results.filter(result => result.status === 'created').length
      const updated = results.filter(result => result.status === 'updated').length
      const problems = results.filter(result => result.status === 'error' || result.status === 'skipped')
      setMessage(`${created} created, ${updated} updated.${problems.length ? ` ${problems.map(result => `Row ${result.row}: ${result.error ?? result.status}`).join(' · ')}` : ''}`)
      setRows([])
    }
    catch (e: any) { setMessage(e.message ?? 'Import failed.') } finally { setBusy(false) }
  }

  return <section style={cardStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <div><strong>Import {label}</strong><div style={{ fontSize: 12, color: '#6b5f55', marginTop: 3 }}>Preview required fields and errors before saving. Blank optional values stay unavailable.</div></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button type="button" style={buttonStyle} onClick={() => template(kind, false)}>Template .xlsx</button><button type="button" style={buttonStyle} onClick={() => template(kind, true)}>Template .csv</button><button type="button" style={buttonStyle} onClick={() => ref.current?.click()}>Choose file</button></div>
    </div>
    <input ref={ref} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (file) void choose(file) }} />
    {rows.length > 0 && <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>{valid.length} valid of {rows.length} rows. Invalid rows will never be sent.</div>
      <label style={{ fontSize: 12, marginRight: 10 }}><input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} /> Create only (skip duplicates)</label>
      <label style={{ fontSize: 12 }}><input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} /> Update likely duplicates</label>
      <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 10, border: '1px solid rgba(84,72,58,.14)', borderRadius: 7 }}>
        {rows.map(row => <div key={row.row} style={{ padding: '7px 9px', borderBottom: '1px solid rgba(84,72,58,.1)', fontSize: 12 }}><strong>Row {row.row}</strong> · {String(row.data.title ?? row.data.name ?? 'Untitled')}{row.issues.length > 0 && <div style={{ marginTop: 2 }}>{row.issues.map(issue => <span key={`${issue.field}-${issue.message}`} style={{ color: issue.severity === 'error' ? '#D8442B' : '#b8820f' }}>{issue.field}: {issue.message} · </span>)}</div>}</div>)}
      </div>
      <button type="button" disabled={busy || !valid.length} style={{ ...importBtnStyle, marginTop: 10, opacity: busy || !valid.length ? .55 : 1 }} onClick={() => void save()}>{busy ? 'Importing…' : `Import ${valid.length} valid row(s)`}</button>
    </div>}
    {message && <div style={{ fontSize: 12, marginTop: 9, color: '#6b5f55' }}>{message}</div>}
  </section>
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '0.5px solid rgba(84,72,58,.14)', borderRadius: 14, padding: 14, marginBottom: 16 }
const buttonStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(84,72,58,.14)', background: 'transparent', color: '#6b5f55', fontSize: 12, cursor: 'pointer' }
const importBtnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 7, border: 'none', background: '#D8442B', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
