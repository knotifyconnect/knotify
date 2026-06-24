import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from './api'

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
const EVENT_TYPES = ['networking', 'social', 'sports', 'music', 'career', 'workshop', 'outdoor', 'party']

type EventForm = {
  title: string; description: string; location: string; startsAt: string; endsAt: string
  url: string; hostLabel: string; imageUrl: string; eventType: string
  capacity: string; priceEur: string
}

const emptyEvent: EventForm = {
  title: '', description: '', location: '', startsAt: '', endsAt: '',
  url: '', hostLabel: '', imageUrl: '', eventType: '', capacity: '', priceEur: '',
}

function eventToForm(ev: any): EventForm {
  return {
    title: ev.title ?? '',
    description: ev.description ?? '',
    location: ev.location ?? '',
    startsAt: toLocal(ev.starts_at),
    endsAt: toLocal(ev.ends_at),
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
    startsAt: f.startsAt,
    endsAt: f.endsAt || undefined,
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
  const [form, setForm] = useState<EventForm>(emptyEvent)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setEvents((await api.events()).events) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

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

  const f = form
  const set = (k: keyof EventForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div>
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

        {/* Row 2: starts / ends */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Starts *</label>
            <input required type="datetime-local" style={inp} value={f.startsAt} onChange={set('startsAt')} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>Ends</label>
            <input type="datetime-local" style={inp} value={f.endsAt} onChange={set('endsAt')} />
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
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

      <div style={{ display: 'grid', gap: 10 }}>
        {events.map(ev => (
          <div key={ev.id} style={rowCard}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {ev.image_url && (
                <img src={ev.image_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{ev.title}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {fmtDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ''}
                  {ev.event_type && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: C.paperSoft, fontSize: 10.5 }}>{ev.event_type}</span>}
                  {ev.price_eur != null && <span style={{ marginLeft: 6 }}>{ev.price_eur === 0 ? 'Free' : `€${ev.price_eur}`}</span>}
                </div>
                {ev.description && <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4, lineHeight: 1.4 }}>{ev.description.slice(0, 120)}{ev.description.length > 120 ? '…' : ''}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={editBtn} onClick={() => startEdit(ev)}>Edit</button>
                <button style={ghostBtn} onClick={() => remove(ev.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No events yet.</div>}
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
