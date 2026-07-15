import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from './api'
import { BulkImport } from './BulkImport'
import { DEFAULT_EVENT_TYPES } from './eventTypes'

const C = {
  signal: '#D8442B', ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287',
  paper: '#f5f0e8', paperSoft: '#ede8df', rule: 'rgba(84,72,58,0.14)',
  white: '#fff', verd: '#2d7d46', ochre: '#b8820f',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: `0.5px solid ${C.rule}`,
  background: C.paper, fontSize: 13.5, color: C.ink, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'IBM Plex Sans, sans-serif',
}
const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none', background: C.signal, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 6, border: `0.5px solid ${C.rule}`, background: 'transparent',
  color: C.inkMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
}
const editBtn: React.CSSProperties = { ...ghostBtn, color: C.ochre, borderColor: C.ochre }
const cardWrap: React.CSSProperties = {
  background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14, padding: 18, marginBottom: 16,
}
const rowCard: React.CSSProperties = {
  background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 12, padding: '14px 16px',
}
const h2: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 14px',
}
const fieldLabel: React.CSSProperties = {
  fontSize: 11, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
  fontWeight: 600, marginBottom: 4, display: 'block', fontFamily: 'IBM Plex Sans, sans-serif',
}
const fieldGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function toLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Image upload widget ───────────────────────────────────────────────────────
function ImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  async function pick(file: File) {
    setUploading(true); setErr('')
    try {
      const { url } = await api.uploadImage(file)
      onChange(url)
    } catch (e: any) { setErr(e.message) }
    finally { setUploading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...inp, flex: 1 }}
          placeholder="https://… paste image URL or upload below"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <button type="button" onClick={() => ref.current?.click()}
          style={{ ...ghostBtn, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
      </div>
      {err && <div style={{ fontSize: 12, color: C.signal }}>{err}</div>}
      {value && (
        <img src={value} alt="preview"
          style={{ height: 80, width: 'auto', borderRadius: 8, objectFit: 'cover', border: `0.5px solid ${C.rule}` }}
          onError={() => {}} />
      )}
    </div>
  )
}

// ── Events ────────────────────────────────────────────────────────────────────
type CafeRow = {
  id: string; slug: string; name: string; venue_type: 'cafe' | 'restaurant' | 'bar'
  address: string | null; city: string; area: string | null; description: string | null
  perk_text: string | null; photo_url: string | null; hours_text: string | null
  lat: number | null; lng: number | null; is_partnered: boolean; is_active: boolean
  deal_title: string | null; deal_details: string | null; deal_code: string | null
  deal_code_enabled: boolean; featured_priority: number; archived_at: string | null
}
function toDate(iso: string | null | undefined) { return toLocal(iso).slice(0, 10) }
function toTime(iso: string | null | undefined) { return toLocal(iso).slice(11, 16) }

type CafeForm = {
  name: string; venueType: CafeRow['venue_type']; address: string; city: string
  area: string; description: string; perkText: string; photoUrl: string; hoursText: string
  isPartnered: boolean; isActive: boolean; dealTitle: string
  dealDetails: string; dealCode: string; dealCodeEnabled: boolean; featuredPriority: string
}

const emptyCafe: CafeForm = {
  name: '', venueType: 'cafe', address: '', city: 'Munich', area: '', description: '',
  perkText: '', photoUrl: '', hoursText: '', isPartnered: false, isActive: true,
  dealTitle: '', dealDetails: '', dealCode: '', dealCodeEnabled: false, featuredPriority: '0',
}

function cafeToForm(cafe: CafeRow): CafeForm {
  return {
    name: cafe.name, venueType: cafe.venue_type, address: cafe.address ?? '', city: cafe.city,
    area: cafe.area ?? '', description: cafe.description ?? '', perkText: cafe.perk_text ?? '', photoUrl: cafe.photo_url ?? '',
    hoursText: cafe.hours_text ?? '',
    isPartnered: cafe.is_partnered, isActive: cafe.is_active, dealTitle: cafe.deal_title ?? '', dealDetails: cafe.deal_details ?? '',
    dealCode: cafe.deal_code ?? '', dealCodeEnabled: cafe.deal_code_enabled, featuredPriority: String(cafe.featured_priority ?? 0),
  }
}

function cafePayload(form: CafeForm) { return { ...form, featuredPriority: Math.max(0, Number(form.featuredPriority) || 0) } }

export function CafesAdmin() {
  const [cafes, setCafes] = useState<CafeRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<CafeForm>(emptyCafe)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setCafes((await api.cafes()).cafes ?? []); setErr('') } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

  const set = (key: keyof CafeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  function startEdit(cafe: CafeRow) { setEditId(cafe.id); setForm(cafeToForm(cafe)); setErr(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function cancelEdit() { setEditId(null); setForm(emptyCafe) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (editId) await api.updateCafe(editId, cafePayload(form)); else await api.createCafe(cafePayload(form))
      cancelEdit(); await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function archive(cafe: CafeRow) {
    if (!confirm(`Archive ${cafe.name}?`)) return
    try { await api.archiveCafe(cafe.id); await load() } catch (e: any) { setErr(e.message) }
  }
  async function restore(cafe: CafeRow) {
    try { await api.updateCafe(cafe.id, { isArchived: false, isActive: true }); await load() } catch (e: any) { setErr(e.message) }
  }
  async function remove(cafe: CafeRow) {
    if (!confirm(`Permanently delete ${cafe.name}? Check-ins will be deleted and past meetings will no longer link to this cafe.`)) return
    try { await api.deleteCafe(cafe.id); if (editId === cafe.id) cancelEdit(); await load() } catch (e: any) { setErr(e.message) }
  }
  async function bulkCafeAction(action: 'archive' | 'delete') {
    const ids = [...selectedIds]
    if (!ids.length) return
    const label = action === 'archive' ? 'Archive' : 'Permanently delete'
    if (!confirm(`${label} ${ids.length} selected place${ids.length === 1 ? '' : 's'}?`)) return
    setBusy(true); setErr('')
    try {
      await Promise.all(ids.map((id) => action === 'archive' ? api.archiveCafe(id) : api.deleteCafe(id)))
      setSelectedIds(new Set()); if (editId && ids.includes(editId)) cancelEdit(); await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <BulkImport kind="cafes" onImport={async (rows, mode) => { const result = await api.importCafes(rows, mode); await load(); return result }} />
      <h2 style={h2}>{editId ? 'Edit place' : 'Create place'}</h2>
      <form onSubmit={submit} style={{ ...cardWrap, display: 'grid', gap: 12 }}>
        {editId && <div style={{ fontSize: 12, color: C.ochre }}>Editing an existing listing. <button type="button" onClick={cancelEdit} style={{ ...ghostBtn, marginLeft: 8 }}>Cancel</button></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          <div style={fieldGroup}><label style={fieldLabel}>Name *</label><input required style={inp} value={form.name} onChange={set('name')} /></div>
          <div style={fieldGroup}><label style={fieldLabel}>Type</label><select style={inp} value={form.venueType} onChange={set('venueType')}><option value="cafe">Cafe</option><option value="restaurant">Restaurant</option><option value="bar">Bar</option></select></div>
          <div style={fieldGroup}><label style={fieldLabel}>Area</label><input style={inp} value={form.area} onChange={set('area')} placeholder="Maxvorstadt" /></div>
          <div style={fieldGroup}><label style={fieldLabel}>City</label><input style={inp} value={form.city} onChange={set('city')} /></div>
          <div style={fieldGroup}><label style={fieldLabel}>Hours</label><input style={inp} value={form.hoursText} onChange={set('hoursText')} /></div>
        </div>
        <div style={fieldGroup}><label style={fieldLabel}>Address *</label><input required style={inp} value={form.address} onChange={set('address')} placeholder="Street, number, postal code" /></div>
        <div style={fieldGroup}><label style={fieldLabel}>Description</label><textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={form.description} onChange={set('description')} /></div>
        <div style={fieldGroup}><label style={fieldLabel}>Image / logo</label><ImageUploader value={form.photoUrl} onChange={photoUrl => setForm(prev => ({ ...prev, photoUrl }))} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ ...fieldGroup, justifyContent: 'end' }}><div style={{ fontSize: 12, color: C.inkMuted }}>Map coordinates are derived from the full address when saved.</div></div>
          <div style={fieldGroup}><label style={fieldLabel}>Featured priority</label><input type="number" min={0} style={inp} value={form.featuredPriority} onChange={set('featuredPriority')} /></div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={form.isActive} onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))} /> Active / visible</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={form.isPartnered} onChange={e => setForm(prev => ({ ...prev, isPartnered: e.target.checked, dealCodeEnabled: e.target.checked ? prev.dealCodeEnabled : false }))} /> Partnered</label>
        </div>
        {form.isPartnered && <div style={{ padding: 14, borderRadius: 10, background: C.paperSoft, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <div style={fieldGroup}><label style={fieldLabel}>Deal title</label><input style={inp} value={form.dealTitle} onChange={set('dealTitle')} /></div>
            <div style={fieldGroup}><label style={fieldLabel}>Short perk label</label><input style={inp} value={form.perkText} onChange={set('perkText')} /></div>
          </div>
          <div style={fieldGroup}><label style={fieldLabel}>Deal details</label><textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={form.dealDetails} onChange={set('dealDetails')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <div style={fieldGroup}><label style={fieldLabel}>Deal code</label><input style={inp} value={form.dealCode} onChange={set('dealCode')} /></div>
            <label style={{ fontSize: 13, paddingBottom: 9 }}><input type="checkbox" disabled={!form.dealCode.trim()} checked={form.dealCodeEnabled} onChange={e => setForm(prev => ({ ...prev, dealCodeEnabled: e.target.checked }))} /> Show code</label>
          </div>
        </div>}
        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <div><button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Create place'}</button></div>
      </form>
      <div style={{ display: 'flex', gap: 8, margin: '20px 0 10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.inkMuted }}><input type="checkbox" checked={cafes.length > 0 && selectedIds.size === cafes.length} onChange={(event) => setSelectedIds(event.target.checked ? new Set(cafes.map((cafe) => cafe.id)) : new Set())} /> Select all</label>
        <span style={{ fontSize: 12, color: C.inkMuted }}>{selectedIds.size} selected</span>
        <button type="button" style={ghostBtn} disabled={busy || selectedIds.size === 0} onClick={() => void bulkCafeAction('archive')}>Archive selected</button>
        <button type="button" style={{ ...ghostBtn, color: C.signal }} disabled={busy || selectedIds.size === 0} onClick={() => void bulkCafeAction('delete')}>Delete selected</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {cafes.map(cafe => <div key={cafe.id} style={{ ...rowCard, opacity: cafe.archived_at ? 0.55 : 1 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input aria-label={`Select ${cafe.name}`} type="checkbox" checked={selectedIds.has(cafe.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(cafe.id); else next.delete(cafe.id); return next })} />
            {cafe.photo_url ? <img src={cafe.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: C.paperSoft }} />}
            <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontWeight: 600 }}>{cafe.name} {cafe.is_partnered ? '· Partner' : ''}</div><div style={{ fontSize: 12, color: C.inkMuted }}>{cafe.venue_type} · {[cafe.area, cafe.city, cafe.address].filter(Boolean).join(' · ')}{cafe.archived_at ? ' · archived' : !cafe.is_active ? ' · hidden' : ''}</div></div>
            <button style={editBtn} onClick={() => startEdit(cafe)}>Edit</button>
            {cafe.archived_at ? <button style={ghostBtn} onClick={() => restore(cafe)}>Restore</button> : <button style={ghostBtn} onClick={() => archive(cafe)}>Archive</button>}
            <button style={{ ...ghostBtn, color: C.signal }} onClick={() => void remove(cafe)}>Delete</button>
          </div>
        </div>)}
        {!cafes.length && !err && <div style={{ color: C.inkFaint, fontSize: 13 }}>No places yet.</div>}
      </div>
    </div>
  )
}

type EventForm = {
  title: string; description: string; location: string; startDate: string; startTime: string; endDate: string; endTime: string
  url: string; hostLabel: string; imageUrl: string; eventType: string
  capacity: string; priceEur: string
}

const emptyEvent: EventForm = {
  title: '', description: '', location: '', startDate: '', startTime: '', endDate: '', endTime: '',
  url: '', hostLabel: '', imageUrl: '', eventType: '', capacity: '', priceEur: '',
}

function eventToForm(ev: any): EventForm {
  return {
    title: ev.title ?? '',
    description: ev.description ?? '',
    location: ev.location ?? '',
    startDate: toDate(ev.starts_at), startTime: ev.time_tba ? '' : toTime(ev.starts_at),
    endDate: toDate(ev.ends_at), endTime: ev.time_tba ? '' : toTime(ev.ends_at),
    url: ev.url ?? '',
    hostLabel: ev.host_label ?? '',
    imageUrl: ev.image_url ?? '',
    eventType: ev.event_type ?? '',
    capacity: ev.capacity != null ? String(ev.capacity) : '',
    priceEur: ev.price_eur != null ? String(ev.price_eur) : '',
  }
}

function formToEventPayload(f: EventForm) {
  return {
    title: f.title,
    description: f.description || undefined,
    location: f.location || undefined,
    startsAt: f.startDate ? `${f.startDate}T${f.startTime || '00:00'}:00` : '',
    endsAt: f.endDate ? `${f.endDate}T${f.endTime || '00:00'}:00` : undefined,
    timeTba: !f.startTime && !f.endTime,
    url: f.url || undefined,
    hostLabel: f.hostLabel || undefined,
    imageUrl: f.imageUrl || undefined,
    eventType: f.eventType || undefined,
    capacity: f.capacity ? Number(f.capacity) : undefined,
    priceEur: f.priceEur !== '' ? Number(f.priceEur) : undefined,
  }
}

export function EventsAdmin() {
  const [events, setEvents] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [eventTypes, setEventTypes] = useState<string[]>(DEFAULT_EVENT_TYPES)
  const [newEventType, setNewEventType] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | 'upcoming' | 'past' | 'tba'>('all')
  const [eventSearch, setEventSearch] = useState('')
  const [form, setForm] = useState<EventForm>(emptyEvent)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setEvents((await api.events()).events) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { api.eventTypes().then(data => setEventTypes(data.types?.length ? data.types : DEFAULT_EVENT_TYPES)).catch(() => {}) }, [])

  function startEdit(ev: any) {
    setEditId(ev.id)
    setForm(eventToForm(ev))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { setEditId(null); setForm(emptyEvent) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (editId) {
        await api.updateEvent(editId, formToEventPayload(form))
        setEditId(null)
      } else {
        await api.createEvent(formToEventPayload(form))
      }
      setForm(emptyEvent)
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this event?')) return
    await api.deleteEvent(id); await load()
  }

  async function bulkEventAction(action: 'archive' | 'delete') {
    const ids = [...selectedIds]
    if (!ids.length) return
    const label = action === 'archive' ? 'Archive' : 'Permanently delete'
    if (!confirm(`${label} ${ids.length} selected event${ids.length === 1 ? '' : 's'}?`)) return
    setBusy(true); setErr('')
    try {
      await Promise.all(ids.map((id) => action === 'archive' ? api.archiveEvent(id) : api.deleteEvent(id)))
      setSelectedIds(new Set()); if (editId && ids.includes(editId)) cancelEdit(); await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const f = form
  const visibleEvents = events.filter((event) => {
    const matchesSearch = !eventSearch.trim() || [event.title, event.location, event.host_label, event.event_type].filter(Boolean).some((value: string) => value.toLowerCase().includes(eventSearch.trim().toLowerCase()))
    if (!matchesSearch) return false
    if (eventFilter === 'tba') return Boolean(event.time_tba)
    if (eventFilter === 'upcoming') return new Date(event.starts_at) >= new Date()
    if (eventFilter === 'past') return new Date(event.starts_at) < new Date()
    return true
  })
  const set = (k: keyof EventForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div>
      <BulkImport kind="events" onImport={async (rows, mode) => { const result = await api.importEvents(rows, mode); await load(); return result }} />
      <h2 style={h2}>{editId ? 'Edit event' : 'Create event'}</h2>

      <form onSubmit={submit} style={{ ...cardWrap, display: 'grid', gap: 12 }}>
        {editId && (
          <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fff3cd', border: '0.5px solid #d4a700', fontSize: 12, color: '#7a5500' }}>
            Editing existing event — save to apply changes.
            <button type="button" onClick={cancelEdit} style={{ marginLeft: 12, background: 'none', border: 'none', color: C.signal, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
          </div>
        )}

        {/* Row 1: title */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Title *</label>
          <input required style={inp} placeholder="TUM x Industry Night" value={f.title} onChange={set('title')} />
        </div>

        {/* Row 2: dates / optional times */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Start date *</label>
            <input required type="date" style={inp} value={f.startDate} onChange={set('startDate')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Start time (optional / TBA)</label>
            <input type="time" style={inp} value={f.startTime} onChange={set('startTime')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>End date (optional)</label>
            <input type="date" style={inp} value={f.endDate} onChange={set('endDate')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>End time (optional)</label>
            <input type="time" style={inp} value={f.endTime} onChange={set('endTime')} />
          </div>
        </div>

        {/* Row 3: location / type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Location</label>
            <input style={inp} placeholder="Audimax, TUM Garching" value={f.location} onChange={set('location')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Event type</label>
            <select style={inp} value={f.eventType} onChange={set('eventType')}>
              <option value="">— select —</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Row 4: host label / URL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Host / organiser</label>
            <input style={inp} placeholder="Stadt München, TU München…" value={f.hostLabel} onChange={set('hostLabel')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Link</label>
            <input style={inp} placeholder="https://eventbrite.com/…" value={f.url} onChange={set('url')} />
          </div>
        </div>

        {/* Row 5: capacity / price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Capacity</label>
            <input type="number" min={0} style={inp} placeholder="e.g. 50" value={f.capacity} onChange={set('capacity')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Price (€) — 0 for free</label>
            <input type="number" min={0} style={inp} placeholder="0" value={f.priceEur} onChange={set('priceEur')} />
          </div>
        </div>

        {/* Row 6: description */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Description</label>
          <textarea rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="What is this event about?" value={f.description} onChange={set('description')} />
        </div>

        {/* Row 7: image */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Cover image</label>
          <ImageUploader value={f.imageUrl} onChange={url => setForm(prev => ({ ...prev, imageUrl: url }))} />
        </div>

        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add event'}</button>
          {editId && <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'flex', gap: 8, margin: '20px 0 10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Search events" style={{ ...inp, width: 220 }} placeholder="Search events" value={eventSearch} onChange={e => setEventSearch(e.target.value)} />
        <select aria-label="Filter events" style={{ ...inp, width: 150 }} value={eventFilter} onChange={e => setEventFilter(e.target.value as typeof eventFilter)}><option value="all">All events</option><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="tba">Time TBA</option></select>
        <span style={{ fontSize: 12, color: C.inkMuted }}>{visibleEvents.length} shown</span>
        <label style={{ fontSize: 12, color: C.inkMuted }}><input type="checkbox" checked={visibleEvents.length > 0 && visibleEvents.every((event) => selectedIds.has(event.id))} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); for (const item of visibleEvents) event.target.checked ? next.add(item.id) : next.delete(item.id); return next })} /> Select shown</label>
        <span style={{ fontSize: 12, color: C.inkMuted }}>{selectedIds.size} selected</span>
        <button type="button" style={ghostBtn} disabled={busy || selectedIds.size === 0} onClick={() => void bulkEventAction('archive')}>Archive selected</button>
        <button type="button" style={{ ...ghostBtn, color: C.signal }} disabled={busy || selectedIds.size === 0} onClick={() => void bulkEventAction('delete')}>Delete selected</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {visibleEvents.map(ev => (
          <div key={ev.id} style={{ ...rowCard, opacity: ev.archived_at ? 0.55 : 1 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <input aria-label={`Select ${ev.title}`} type="checkbox" checked={selectedIds.has(ev.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(ev.id); else next.delete(ev.id); return next })} />
              {ev.image_url && (
                <img src={ev.image_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{ev.title}{ev.archived_at && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5 }}>archived</span>}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {fmtDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ''}
                  {ev.event_type && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5 }}>{ev.event_type}</span>}
                  {ev.price_eur != null && <span style={{ marginLeft: 6 }}>{ev.price_eur === 0 ? 'Free' : `€${ev.price_eur}`}</span>}
                </div>
                {ev.description && <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4, lineHeight: 1.4 }}>{ev.description.slice(0, 120)}{ev.description.length > 120 ? '…' : ''}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={editBtn} onClick={() => startEdit(ev)}>Edit</button>
                {ev.archived_at ? <button style={ghostBtn} onClick={async () => { await api.archiveEvent(ev.id, false); await load() }}>Restore</button> : <button style={ghostBtn} onClick={async () => { await api.archiveEvent(ev.id); await load() }}>Archive</button>}
                <button style={ghostBtn} onClick={() => remove(ev.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No events yet.</div>}
        {events.length > 0 && visibleEvents.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No events match this filter.</div>}
      </div>
      <div style={{ ...cardWrap, marginTop: 20 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Manage event types</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Add a type" value={newEventType} onChange={e => setNewEventType(e.target.value)} /><button type="button" style={primaryBtn} onClick={async () => { const result = await api.addEventType(newEventType); setEventTypes(result.types); setNewEventType('') }}>Add type</button></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{eventTypes.map(type => <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 7px', borderRadius: 7, background: C.paperSoft, fontSize: 12 }}><button type="button" title="Rename" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: C.ink }} onClick={async () => { const next = prompt('Rename event type', type)?.trim(); if (next && next !== type) { const result = await api.renameEventType(type, next); setEventTypes(result.types); setForm(prev => prev.eventType === type ? { ...prev, eventType: next } : prev) } }}>{type}</button><button type="button" title="Delete" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: C.signal }} onClick={async () => { if (confirm(`Remove “${type}” from future choices? Existing events keep their type.`)) { const result = await api.deleteEventType(type); setEventTypes(result.types); setForm(prev => prev.eventType === type ? { ...prev, eventType: '' } : prev) } }}>×</button></span>)}</div>
      </div>
    </div>
  )
}

// ── Gigs ──────────────────────────────────────────────────────────────────────
export function GigsAdmin() {
  const [gigs, setGigs] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [view, setView] = useState<'gigs' | 'requests'>('gigs')
  const load = useCallback(async () => {
    const [g, r] = await Promise.all([api.gigs(), api.gigRequests()])
    setGigs(g.gigs); setRequests(r.requests)
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggle(g: any) { await api.updateGig(g.id, g.status === 'open' ? 'closed' : 'open'); await load() }
  async function feature(g: any) { await api.setGigFeatured(g.id, !g.is_featured); await load() }
  async function remove(id: string) { if (!confirm('Delete this gig? Its requests will also be removed.')) return; await api.deleteGig(id); await load() }

  const statusColor: Record<string, string> = {
    pending: C.ochre, accepted: C.verd, completed: C.verd, declined: C.signal, cancelled: C.inkFaint,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ ...h2, margin: 0 }}>Gigs</h2>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['gigs', 'requests'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              border: `0.5px solid ${view === v ? C.signal : C.rule}`,
              background: view === v ? C.signal : 'transparent',
              color: view === v ? '#fff' : C.inkMuted,
            }}>{v === 'gigs' ? `Offers (${gigs.length})` : `Requests (${requests.length})`}</button>
          ))}
        </div>
      </div>

      {view === 'gigs' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {gigs.map(g => (
            <div key={g.id} style={{ ...rowCard, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>
                  {g.is_featured && <span style={{ color: C.ochre, marginRight: 6 }}>★</span>}{g.title}
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {g.provider_name} · {g.provider_credibility} cred · {g.reward_type}{g.price_eur ? ` €${g.price_eur}` : ''} · {g.status}
                  {' · '}{g.active_request_count ?? 0} active / {g.total_request_count ?? 0} total req
                </div>
              </div>
              <button style={ghostBtn} onClick={() => feature(g)}>{g.is_featured ? 'Unfeature' : 'Feature'}</button>
              <button style={ghostBtn} onClick={() => toggle(g)}>{g.status === 'open' ? 'Close' : 'Reopen'}</button>
              <button style={ghostBtn} onClick={() => remove(g.id)}>Delete</button>
            </div>
          ))}
          {gigs.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No gigs yet.</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} style={{ ...rowCard, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{r.gig_title}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {r.seeker_name} → {r.provider_name}{r.price_eur ? ` · €${r.price_eur}` : ''}
                  {r.message ? ` · "${r.message}"` : ''}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[r.status] ?? C.inkMuted, textTransform: 'capitalize' }}>{r.status}</span>
            </div>
          ))}
          {requests.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No requests yet.</div>}
        </div>
      )}
    </div>
  )
}

// ── Quests ────────────────────────────────────────────────────────────────────
const ICON_OPTIONS = ['sparkles', 'coffee', 'heart-handshake', 'party', 'map', 'languages', 'croissant', 'gift', 'target', 'camera', 'palette', 'globe', 'handshake', 'users']
const CAT_OPTIONS  = ['social', 'explore', 'give', 'profile', 'network']
const DIFF_OPTIONS = ['easy', 'medium', 'hard']

type QuestForm = {
  title: string; description: string; points: string; category: string; icon: string
  startsAt: string; endsAt: string; howTo: string; whereToGo: string
  difficulty: string; estimatedMinutes: string; partnerRequired: boolean
  type: string; active: boolean
}

const emptyQuest: QuestForm = {
  title: '', description: '', points: '20', category: 'social', icon: 'sparkles',
  startsAt: '', endsAt: '', howTo: '', whereToGo: '',
  difficulty: '', estimatedMinutes: '', partnerRequired: false,
  type: 'self', active: true,
}

function questToForm(q: any): QuestForm {
  return {
    title: q.title ?? '',
    description: q.description ?? '',
    points: String(q.points ?? 20),
    category: q.category ?? 'social',
    icon: q.icon ?? 'sparkles',
    startsAt: toLocal(q.starts_at),
    endsAt: toLocal(q.ends_at),
    howTo: q.how_to ?? '',
    whereToGo: q.where_to_go ?? '',
    difficulty: q.difficulty ?? '',
    estimatedMinutes: q.estimated_minutes != null ? String(q.estimated_minutes) : '',
    partnerRequired: !!q.partner_required,
    type: q.type ?? 'self',
    active: q.active !== false,
  }
}

function formToQuestPayload(f: QuestForm) {
  return {
    title: f.title,
    description: f.description || undefined,
    points: Number(f.points) || 10,
    category: f.category,
    icon: f.icon,
    startsAt: f.startsAt || undefined,
    endsAt: f.endsAt || undefined,
    howTo: f.howTo || undefined,
    whereToGo: f.whereToGo || undefined,
    difficulty: f.difficulty || undefined,
    estimatedMinutes: f.estimatedMinutes ? Number(f.estimatedMinutes) : undefined,
    partnerRequired: f.partnerRequired,
    type: f.type,
    active: f.active,
  }
}

export function QuestsAdmin() {
  const [quests, setQuests] = useState<any[]>([])
  const [form, setForm] = useState<QuestForm>(emptyQuest)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => { setQuests((await api.quests()).quests) }, [])
  useEffect(() => { void load() }, [load])

  function startEdit(q: any) {
    setEditId(q.id)
    setForm(questToForm(q))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { setEditId(null); setForm(emptyQuest) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (editId) {
        await api.updateQuest(editId, formToQuestPayload(form))
        setEditId(null)
      } else {
        await api.createQuest(formToQuestPayload(form))
      }
      setForm(emptyQuest)
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function toggle(q: any) { await api.updateQuest(q.id, { active: !q.active }); await load() }
  async function remove(id: string) { if (!confirm('Delete this quest?')) return; await api.deleteQuest(id); await load() }

  const f = form
  const set = (k: keyof QuestForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))
  const setBool = (k: keyof QuestForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.checked }))

  return (
    <div>
      <h2 style={h2}>{editId ? 'Edit quest' : 'Create quest'}</h2>

      <form onSubmit={submit} style={{ ...cardWrap, display: 'grid', gap: 12 }}>
        {editId && (
          <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fff3cd', border: '0.5px solid #d4a700', fontSize: 12, color: '#7a5500' }}>
            Editing existing quest — save to apply changes.
            <button type="button" onClick={cancelEdit} style={{ marginLeft: 12, background: 'none', border: 'none', color: C.signal, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
          </div>
        )}

        {/* Title */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Title *</label>
          <input required style={inp} placeholder="Try a new biergarten" value={f.title} onChange={set('title')} />
        </div>

        {/* Description */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Description</label>
          <textarea rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Short description shown on the quest card" value={f.description} onChange={set('description')} />
        </div>

        {/* Points / category / icon / type */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Points</label>
            <input type="number" min={0} style={inp} value={f.points} onChange={set('points')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Category</label>
            <select style={inp} value={f.category} onChange={set('category')}>
              {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Icon</label>
            <select style={inp} value={f.icon} onChange={set('icon')}>
              {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Type</label>
            <select style={inp} value={f.type} onChange={set('type')}>
              <option value="self">Self (photo proof)</option>
              <option value="verified">Verified (auto)</option>
            </select>
          </div>
        </div>

        {/* Difficulty / time / partner */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Difficulty</label>
            <select style={inp} value={f.difficulty} onChange={set('difficulty')}>
              <option value="">— none —</option>
              {DIFF_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Est. time (min)</label>
            <input type="number" min={0} style={inp} placeholder="e.g. 30" value={f.estimatedMinutes} onChange={set('estimatedMinutes')} />
          </div>
          <div style={{ ...fieldGroup, justifyContent: 'flex-end' }}>
            <label style={fieldLabel}>Options</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.ink, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif' }}>
              <input type="checkbox" checked={f.partnerRequired} onChange={setBool('partnerRequired')} />
              Partner required
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.ink, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', marginTop: 6 }}>
              <input type="checkbox" checked={f.active} onChange={setBool('active')} />
              Active
            </label>
          </div>
        </div>

        {/* How to complete */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>How to complete</label>
          <textarea rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Step-by-step instructions shown in the quest detail modal" value={f.howTo} onChange={set('howTo')} />
        </div>

        {/* Where to go */}
        <div style={fieldGroup}>
          <label style={fieldLabel}>Where to go</label>
          <textarea rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Location guidance or note (e.g. any knotify partner cafe)" value={f.whereToGo} onChange={set('whereToGo')} />
        </div>

        {/* Date window */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Starts (optional)</label>
            <input type="datetime-local" style={inp} value={f.startsAt} onChange={set('startsAt')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Ends (optional)</label>
            <input type="datetime-local" style={inp} value={f.endsAt} onChange={set('endsAt')} />
          </div>
        </div>

        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Create quest'}</button>
          {editId && <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        {quests.map(q => (
          <div key={q.id} style={{ ...rowCard, opacity: q.active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>
                  {q.title} <span style={{ color: C.signal, fontWeight: 600 }}>+{q.points}</span>
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {q.category} · {q.icon} · {q.type ?? 'self'}
                  {q.difficulty && ` · ${q.difficulty}`}
                  {q.estimated_minutes && ` · ~${q.estimated_minutes}min`}
                  {q.partner_required && ' · partner required'}
                  {!q.active && ' · inactive'}
                </div>
                {q.how_to && (
                  <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 4, lineHeight: 1.4 }}>
                    {q.how_to.slice(0, 100)}{q.how_to.length > 100 ? '…' : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={editBtn} onClick={() => startEdit(q)}>Edit</button>
                <button style={ghostBtn} onClick={() => toggle(q)}>{q.active ? 'Disable' : 'Enable'}</button>
                <button style={ghostBtn} onClick={() => remove(q.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {quests.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No quests yet.</div>}
      </div>
    </div>
  )
}

// ── Invites ───────────────────────────────────────────────────────────────────
type InviteRow = {
  id: string
  created_at: string
  code: string
  inviter: { id: string; full_name: string; username: string; email: string } | null
  invitee: { id: string; full_name: string; username: string; email: string; onboarded: boolean } | null
}
type LeaderboardEntry = {
  inviter: { id: string; full_name: string; username: string; email: string }
  total: number
  onboarded: number
}

export function InvitesAdmin() {
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [err, setErr] = useState('')
  const [view, setView] = useState<'leaderboard' | 'all'>('leaderboard')

  const load = useCallback(async () => {
    try {
      const r = await api.invites()
      setInvites(r.invites ?? [])
      setLeaderboard(r.leaderboard ?? [])
    } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div>
      <h2 style={h2}>Invites</h2>

      {err && <div style={{ color: C.signal, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total invites', value: invites.length },
          { label: 'Onboarded', value: invites.filter(i => i.invitee?.onboarded).length },
          { label: 'Unique inviters', value: leaderboard.length },
        ].map(s => (
          <div key={s.label} style={{ ...cardWrap, margin: 0 }}>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 400, color: C.ink, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['leaderboard', 'all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '6px 14px', borderRadius: 999, border: `0.5px solid ${view === v ? C.signal : C.inkFaint}`,
            background: view === v ? C.signal : 'transparent', color: view === v ? '#fff' : C.inkMuted,
            fontSize: 12, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
            fontFamily: 'IBM Plex Sans, sans-serif',
          }}>{v === 'leaderboard' ? 'Top inviters' : 'All invites'}</button>
        ))}
      </div>

      {view === 'leaderboard' && (
        <div style={cardWrap}>
          {leaderboard.length === 0
            ? <div style={{ color: C.inkFaint, fontSize: 13 }}>No invites yet.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                    {['#', 'Member', 'Email', 'Invited', 'Onboarded'].map(h => (
                      <th key={h} style={{ ...fieldLabel, padding: '6px 10px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((e, i) => (
                    <tr key={e.inviter.id} style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                      <td style={{ padding: '10px', color: C.inkFaint, fontFamily: 'IBM Plex Mono, monospace' }}>{i + 1}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 500, color: C.ink }}>{e.inviter.full_name}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint }}>@{e.inviter.username}</div>
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'IBM Plex Mono, monospace', color: C.inkMuted, fontSize: 12 }}>{e.inviter.email}</td>
                      <td style={{ padding: '10px', fontWeight: 600, color: C.ink }}>{e.total}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ color: e.onboarded > 0 ? C.verd : C.inkFaint, fontWeight: e.onboarded > 0 ? 600 : 400 }}>
                          {e.onboarded}
                        </span>
                        <span style={{ color: C.inkFaint, fontSize: 11 }}> / {e.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {view === 'all' && (
        <div style={cardWrap}>
          {invites.length === 0
            ? <div style={{ color: C.inkFaint, fontSize: 13 }}>No invites yet.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                    {['Inviter', 'Invitee', 'Onboarded', 'Date'].map(h => (
                      <th key={h} style={{ ...fieldLabel, padding: '6px 10px', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invites.map(inv => (
                    <tr key={inv.id} style={{ borderBottom: `0.5px solid ${C.rule}` }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 500, color: C.ink }}>{inv.inviter?.full_name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint }}>@{inv.inviter?.username}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 500, color: C.ink }}>{inv.invitee?.full_name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint }}>@{inv.invitee?.username}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: inv.invitee?.onboarded ? 'rgba(45,125,70,0.1)' : 'rgba(84,72,58,0.08)',
                          color: inv.invitee?.onboarded ? C.verd : C.inkFaint,
                        }}>
                          {inv.invitee?.onboarded ? 'Yes' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: C.inkMuted }}>{fmtDate(inv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  )
}

// ── Feedback ──────────────────────────────────────────────────────────────────
type FeedbackRow = {
  id: string
  type: 'bug' | 'suggestion' | 'other'
  message: string
  page: string | null
  user_agent: string | null
  status: 'open' | 'resolved'
  created_at: string
  resolved_at: string | null
  user: { id: string; full_name: string; username: string; email: string } | null
}

const FB_META: Record<FeedbackRow['type'], { label: string; bg: string; color: string }> = {
  bug: { label: 'Bug', bg: 'rgba(216,68,43,0.1)', color: '#D8442B' },
  suggestion: { label: 'Idea', bg: 'rgba(184,130,15,0.12)', color: '#b8820f' },
  other: { label: 'Other', bg: 'rgba(84,72,58,0.08)', color: '#6b5f55' },
}

export function FeedbackAdmin() {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.feedback(filter === 'all' ? undefined : filter)
      setRows(r.feedback ?? [])
      setOpenCount(r.openCount ?? 0)
    } catch (e: any) { setErr(e.message) }
  }, [filter])
  useEffect(() => { void load() }, [load])

  async function toggle(row: FeedbackRow) {
    const next = row.status === 'resolved' ? 'open' : 'resolved'
    try {
      await api.resolveFeedback(row.id, next)
      void load()
    } catch (e: any) { setErr(e.message) }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <h2 style={h2}>Feedback {openCount > 0 && <span style={{ fontSize: 13, color: C.signal }}>· {openCount} open</span>}</h2>
      {err && <div style={{ color: C.signal, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['open', 'resolved', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 999, border: `0.5px solid ${filter === f ? C.signal : C.inkFaint}`,
            background: filter === f ? C.signal : 'transparent', color: filter === f ? '#fff' : C.inkMuted,
            fontSize: 12, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
            fontFamily: 'IBM Plex Sans, sans-serif',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>Nothing here.</div>}
        {rows.map(r => {
          const meta = FB_META[r.type]
          const resolved = r.status === 'resolved'
          return (
            <div key={r.id} style={{ ...rowCard, opacity: resolved ? 0.62 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 12, color: C.inkMuted }}>
                  {r.user ? `${r.user.full_name} · ${r.user.email}` : 'Unknown user'}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: C.inkFaint }}>{fmtDate(r.created_at)}</span>
              </div>
              <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.message}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                {r.page && (
                  <span style={{ fontSize: 11.5, color: C.inkFaint, fontFamily: 'IBM Plex Mono, monospace' }}>{r.page}</span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => toggle(r)} style={{
                  padding: '6px 12px', borderRadius: 8, border: `0.5px solid ${resolved ? C.inkFaint : C.verd}`,
                  background: resolved ? 'transparent' : 'rgba(45,125,70,0.08)', color: resolved ? C.inkMuted : C.verd,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
                }}>
                  {resolved ? 'Reopen' : 'Mark resolved'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cafés ─────────────────────────────────────────────────────────────────────
const VENUE_TYPES = ['cafe', 'restaurant', 'bar']

type LegacyCafeForm = {
  slug: string; name: string; venueType: string; address: string; city: string; area: string
  description: string; photoUrl: string; hoursText: string; lat: string; lng: string
  isPartnered: boolean; isActive: boolean; dealTitle: string; dealDetails: string; dealCode: string
  dealCodeEnabled: boolean; featuredPriority: string
}

const legacyEmptyCafe: LegacyCafeForm = {
  slug: '', name: '', venueType: 'cafe', address: '', city: 'Munich', area: '',
  description: '', photoUrl: '', hoursText: '', lat: '', lng: '',
  isPartnered: false, isActive: true, dealTitle: '', dealDetails: '', dealCode: '',
  dealCodeEnabled: false, featuredPriority: '0',
}

function legacyCafeToForm(c: any): LegacyCafeForm {
  return {
    slug: c.slug ?? '',
    name: c.name ?? '',
    venueType: c.venue_type ?? 'cafe',
    address: c.address ?? '',
    city: c.city ?? 'Munich',
    area: c.area ?? '',
    description: c.description ?? '',
    photoUrl: c.photo_url ?? '',
    hoursText: c.hours_text ?? '',
    lat: c.lat != null ? String(c.lat) : '',
    lng: c.lng != null ? String(c.lng) : '',
    isPartnered: Boolean(c.is_partnered),
    isActive: Boolean(c.is_active),
    dealTitle: c.deal_title ?? '',
    dealDetails: c.deal_details ?? '',
    dealCode: c.deal_code ?? '',
    dealCodeEnabled: Boolean(c.deal_code_enabled),
    featuredPriority: c.featured_priority != null ? String(c.featured_priority) : '0',
  }
}

function legacyCafePayload(f: LegacyCafeForm) {
  return {
    slug: f.slug.trim(),
    name: f.name.trim(),
    venueType: f.venueType,
    address: f.address || undefined,
    city: f.city || 'Munich',
    area: f.area || undefined,
    description: f.description || undefined,
    photoUrl: f.photoUrl || undefined,
    hoursText: f.hoursText || undefined,
    lat: f.lat !== '' ? Number(f.lat) : undefined,
    lng: f.lng !== '' ? Number(f.lng) : undefined,
    isPartnered: f.isPartnered,
    isActive: f.isActive,
    dealTitle: f.dealTitle || undefined,
    dealDetails: f.dealDetails || undefined,
    dealCode: f.dealCode || undefined,
    dealCodeEnabled: f.dealCodeEnabled,
    featuredPriority: f.featuredPriority !== '' ? Number(f.featuredPriority) : undefined,
  }
}

function LegacyCafesAdmin() {
  const [cafes, setCafes] = useState<any[]>([])
  const [form, setForm] = useState<LegacyCafeForm>(legacyEmptyCafe)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setCafes((await api.cafes()).cafes) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

  function startEdit(c: any) {
    setEditId(c.id)
    setForm(legacyCafeToForm(c))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { setEditId(null); setForm(legacyEmptyCafe) }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      if (editId) {
        await api.updateCafe(editId, legacyCafePayload(form))
        setEditId(null)
      } else {
        await api.createCafe(legacyCafePayload(form))
      }
      setForm(legacyEmptyCafe)
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function archive(id: string) {
    if (!confirm('Archive this café? It disappears from the member Cafés page.')) return
    await api.archiveCafe(id); await load()
  }
  async function restore(c: any) {
    await api.updateCafe(c.id, { isArchived: false, isActive: true }); await load()
  }

  const f = form
  const set = (k: keyof LegacyCafeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))
  const setBool = (k: keyof LegacyCafeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.checked }))

  return (
    <div>
      <h2 style={h2}>{editId ? 'Edit café' : 'Add café'}</h2>

      <form onSubmit={submit} style={{ ...cardWrap, display: 'grid', gap: 12 }}>
        {editId && (
          <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fff3cd', border: '0.5px solid #d4a700', fontSize: 12, color: '#7a5500' }}>
            Editing existing café — save to apply changes.
            <button type="button" onClick={cancelEdit} style={{ marginLeft: 12, background: 'none', border: 'none', color: C.signal, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Name *</label>
            <input required style={inp} placeholder="Café Reitschule" value={f.name} onChange={set('name')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Slug *</label>
            <input required style={inp} placeholder="cafe-reitschule" value={f.slug} onChange={set('slug')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Venue type</label>
            <select style={inp} value={f.venueType} onChange={set('venueType')}>
              {VENUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Area</label>
            <input style={inp} placeholder="Glockenbach" value={f.area} onChange={set('area')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>City</label>
            <input style={inp} value={f.city} onChange={set('city')} />
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={fieldLabel}>Address</label>
          <input style={inp} placeholder="Reichenbachstraße 13, 80469 München" value={f.address} onChange={set('address')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Hours</label>
            <input style={inp} placeholder="Mon-Fri 8-18" value={f.hoursText} onChange={set('hoursText')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Lat</label>
            <input type="number" style={inp} value={f.lat} onChange={set('lat')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Lng</label>
            <input type="number" style={inp} value={f.lng} onChange={set('lng')} />
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={fieldLabel}>Description</label>
          <textarea rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="What makes this place good for a first coffee?" value={f.description} onChange={set('description')} />
        </div>

        <div style={fieldGroup}>
          <label style={fieldLabel}>Photo</label>
          <ImageUploader value={f.photoUrl} onChange={url => setForm(prev => ({ ...prev, photoUrl: url }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.ink, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif' }}>
            <input type="checkbox" checked={f.isActive} onChange={setBool('isActive')} />
            Active (visible on the member Cafés page)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.ink, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif' }}>
            <input type="checkbox" checked={f.isPartnered} onChange={setBool('isPartnered')} />
            Partnered
          </label>
        </div>

        {f.isPartnered && (
          <div style={{ padding: 14, borderRadius: 10, background: C.paperSoft, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 11, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Partner deal — kept off the live app until you enable the code below
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>Deal title</label>
              <input style={inp} placeholder="15% off your first coffee" value={f.dealTitle} onChange={set('dealTitle')} />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>Deal details</label>
              <textarea rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Show your knotify profile at the counter" value={f.dealDetails} onChange={set('dealDetails')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <div style={fieldGroup}>
                <label style={fieldLabel}>Discount code</label>
                <input style={inp} placeholder="KNOTIFY15" value={f.dealCode} onChange={set('dealCode')} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.ink, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif', paddingBottom: 9 }}>
                <input type="checkbox" checked={f.dealCodeEnabled} onChange={setBool('dealCodeEnabled')} />
                Show this code to members
              </label>
            </div>
          </div>
        )}

        <div style={fieldGroup}>
          <label style={fieldLabel}>Featured priority</label>
          <input type="number" min={0} style={inp} value={f.featuredPriority} onChange={set('featuredPriority')} />
        </div>

        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add café'}</button>
          {editId && <button type="button" onClick={cancelEdit} style={ghostBtn}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        {cafes.map(c => (
          <div key={c.id} style={rowCard}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {c.photo_url && (
                <img src={c.photo_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>
                  {c.name}
                  {c.is_partnered && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5, color: C.signal }}>partner</span>}
                  {c.archived_at ? <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5 }}>archived</span> : !c.is_active && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5 }}>hidden</span>}
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {c.venue_type} · /{c.slug} · {[c.area, c.city].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={editBtn} onClick={() => startEdit(c)}>Edit</button>
                {c.archived_at
                  ? <button style={ghostBtn} onClick={() => restore(c)}>Restore</button>
                  : <button style={ghostBtn} onClick={() => archive(c.id)}>Archive</button>}
              </div>
            </div>
          </div>
        ))}
        {cafes.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No cafés yet.</div>}
      </div>
    </div>
  )
}

// ── Café suggestions ─────────────────────────────────────────────────────────
export function CafeSuggestionsAdmin() {
  const [pending, setPending] = useState<any[]>([])
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setPending((await api.pendingCafes()).pending) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function review(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)
    try {
      await api.updatePendingCafe(id, status)
      setPending(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    } catch (e: any) { setErr(e.message) } finally { setBusyId(null) }
  }

  const awaiting = pending.filter(p => p.status === 'pending')
  const reviewed = pending.filter(p => p.status !== 'pending')

  return (
    <div>
      <h2 style={h2}>Café suggestions</h2>
      {err && <div style={{ color: C.signal, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ fontSize: 12.5, color: C.inkMuted, marginBottom: 10 }}>{awaiting.length} awaiting review</div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {awaiting.map(p => (
          <div key={p.id} style={rowCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{p.address}</div>
                {p.notes && <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4, fontStyle: 'italic' }}>"{p.notes}"</div>}
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 6 }}>
                  Suggested by {p.suggester?.full_name ?? 'a member'} · {fmtDate(p.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button disabled={busyId === p.id} style={{ ...primaryBtn, background: C.verd }} onClick={() => review(p.id, 'approved')}>Approve</button>
                <button disabled={busyId === p.id} style={ghostBtn} onClick={() => review(p.id, 'rejected')}>Reject</button>
              </div>
            </div>
          </div>
        ))}
        {awaiting.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>Nothing pending.</div>}
      </div>

      {reviewed.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginBottom: 10 }}>Reviewed</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {reviewed.map(p => (
              <div key={p.id} style={{ ...rowCard, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink }}>{p.name} · {p.address}</div>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: C.paperSoft, color: p.status === 'approved' ? C.verd : C.signal }}>{p.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── KPI Dashboard ─────────────────────────────────────────────────────────────
interface Kpis {
  generatedAt: string
  users: { total: number; newToday: number; new7d: number; new30d: number; active7d: number; activeToday: number; onlineNow: number; premium: number; hr: number }
  betaFunnel: { total: number; pending: number; approved: number; rejected: number }
  growth: { usersPerDay: { date: string; count: number }[]; signupsPerDay: { date: string; count: number }[] }
  engagement: { connectionsTotal: number; connectionsAccepted: number; conversationsTotal: number; messagesTotal: number; messagesToday: number }
  content: {
    eventsTotal: number; eventsUpcoming: number; eventRsvpsTotal: number
    gigsOpen: number; gigsClosed: number; gigRequestsTotal: number; gigRequestsPending: number
    cafesActive: number; cafeCheckinsTotal: number
    questsPublished: number; questCompletionsTotal: number; questCompletersUnique: number
  }
  feedback: { total: number; open: number; bugs: number }
  invites: { total: number }
}

function KpiCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 400, color: color ?? C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.inkFaint }}>{sub}</div>}
    </div>
  )
}

function KpiSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>{children}</div>
    </div>
  )
}

function GrowthChart({ series, label }: { series: { date: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...series.map(d => d.count))
  return (
    <div style={cardWrap}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 14 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
        {series.map(d => (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${d.count}`}>
            <div style={{
              width: '100%', minHeight: 2, height: `${Math.round((d.count / max) * 70)}px`,
              background: d.count > 0 ? C.signal : C.paperSoft, borderRadius: 3,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {series.map((d, i) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: C.inkFaint }}>
            {i % 2 === 0 ? d.date.slice(5) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardAdmin() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setErr('')
    try {
      const r = await api.kpis()
      setKpis(r)
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>Loading…</div>
  if (err) return <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>
  if (!kpis) return null

  const { users, betaFunnel, growth, engagement, content, feedback, invites } = kpis

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={h2}>Dashboard</h2>
        <button onClick={() => { setLoading(true); void load() }} style={ghostBtn}>Refresh</button>
      </div>
      <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 20 }}>
        Updated {new Date(kpis.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </div>

      <KpiSection title="Users">
        <KpiCard label="Total users" value={users.total} />
        <KpiCard label="New today" value={users.newToday} color={C.verd} />
        <KpiCard label="New, 7 days" value={users.new7d} sub={`${users.new30d} in 30d`} />
        <KpiCard label="Active, 7 days" value={users.active7d} sub={`${users.activeToday} today`} />
        <KpiCard label="Online now" value={users.onlineNow} />
        <KpiCard label="Premium" value={users.premium} />
      </KpiSection>

      <GrowthChart series={growth.usersPerDay} label="New users per day (14d)" />
      <GrowthChart series={growth.signupsPerDay} label="Beta signups per day (14d)" />

      <KpiSection title="Beta waitlist">
        <KpiCard label="Total signups" value={betaFunnel.total} />
        <KpiCard label="Pending review" value={betaFunnel.pending} color={C.ochre} />
        <KpiCard label="Approved" value={betaFunnel.approved} color={C.verd} />
        <KpiCard label="Rejected" value={betaFunnel.rejected} color={C.signal} />
      </KpiSection>

      <KpiSection title="Engagement">
        <KpiCard label="Connections" value={engagement.connectionsTotal} sub={`${engagement.connectionsAccepted} accepted`} />
        <KpiCard label="Conversations" value={engagement.conversationsTotal} />
        <KpiCard label="Messages sent" value={engagement.messagesTotal} sub={`${engagement.messagesToday} today`} />
      </KpiSection>

      <KpiSection title="Content & activity">
        <KpiCard label="Events" value={content.eventsTotal} sub={`${content.eventsUpcoming} upcoming`} />
        <KpiCard label="Event RSVPs" value={content.eventRsvpsTotal} />
        <KpiCard label="Gigs open" value={content.gigsOpen} sub={`${content.gigsClosed} closed`} />
        <KpiCard label="Gig requests" value={content.gigRequestsTotal} sub={`${content.gigRequestsPending} pending`} />
        <KpiCard label="Active cafés" value={content.cafesActive} sub={`${content.cafeCheckinsTotal} check-ins`} />
        <KpiCard label="Quests published" value={content.questsPublished} />
        <KpiCard label="Quest completions" value={content.questCompletionsTotal} sub={`${content.questCompletersUnique} unique members`} />
        <KpiCard label="Successful invites" value={invites.total} />
      </KpiSection>

      <KpiSection title="Feedback">
        <KpiCard label="Total" value={feedback.total} />
        <KpiCard label="Open" value={feedback.open} color={C.ochre} />
        <KpiCard label="Bug reports" value={feedback.bugs} color={C.signal} />
      </KpiSection>
    </div>
  )
}
