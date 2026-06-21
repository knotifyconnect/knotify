import { useEffect, useState, useCallback } from 'react'
import { api } from './api'

const C = {
  signal: '#D8442B', ink: '#1a1410', inkMuted: '#6b5f55', inkFaint: '#a09287',
  paper: '#f5f0e8', paperSoft: '#ede8df', rule: 'rgba(84,72,58,0.14)', white: '#fff', verd: '#2d7d46',
}

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: `0.5px solid ${C.rule}`,
  background: C.paper, fontSize: 14, color: C.ink, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'IBM Plex Sans, sans-serif',
}
const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none', background: C.signal, color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
}
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: `0.5px solid ${C.rule}`, background: 'transparent',
  color: C.inkMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
}
const cardWrap: React.CSSProperties = {
  background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 14, padding: 18, marginBottom: 16,
}
const rowCard: React.CSSProperties = {
  background: C.white, border: `0.5px solid ${C.rule}`, borderRadius: 12, padding: '14px 16px',
  display: 'flex', alignItems: 'center', gap: 14,
}
const h2: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 14px',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Events ──────────────────────────────────────────────────────────────────
export function EventsAdmin() {
  const [events, setEvents] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', startsAt: '', location: '', url: '', hostLabel: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setEvents((await api.events()).events) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await api.createEvent(form)
      setForm({ title: '', startsAt: '', location: '', url: '', hostLabel: '', description: '' })
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!confirm('Delete this event?')) return
    await api.deleteEvent(id); await load()
  }

  return (
    <div>
      <h2 style={h2}>Curate a Munich event</h2>
      <form onSubmit={create} style={{ ...cardWrap, display: 'grid', gap: 10 }}>
        <input required placeholder="Title" style={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input required type="datetime-local" style={{ ...input, flex: 1, minWidth: 180 }} value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} />
          <input placeholder="Location" style={{ ...input, flex: 1, minWidth: 180 }} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input placeholder="Source / host label (e.g. Stadt München)" style={{ ...input, flex: 1, minWidth: 180 }} value={form.hostLabel} onChange={e => setForm({ ...form, hostLabel: e.target.value })} />
          <input placeholder="Link (optional)" style={{ ...input, flex: 1, minWidth: 180 }} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
        </div>
        <textarea placeholder="Description" rows={2} style={{ ...input, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...primaryBtn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add event'}</button>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        {events.map(ev => (
          <div key={ev.id} style={rowCard}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{ev.title}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                {fmtDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ''}
                <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 999, background: ev.source === 'curated' ? 'rgba(216,68,43,0.1)' : C.paperSoft, color: ev.source === 'curated' ? C.signal : C.inkMuted, fontSize: 10.5 }}>
                  {ev.source === 'curated' ? 'Curated' : 'Peer'}
                </span>
              </div>
            </div>
            <button style={ghostBtn} onClick={() => remove(ev.id)}>Delete</button>
          </div>
        ))}
        {events.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No events yet.</div>}
      </div>
    </div>
  )
}

// ── Gigs ────────────────────────────────────────────────────────────────────
export function GigsAdmin() {
  const [gigs, setGigs] = useState<any[]>([])
  const load = useCallback(async () => { setGigs((await api.gigs()).gigs) }, [])
  useEffect(() => { void load() }, [load])

  async function toggle(g: any) { await api.updateGig(g.id, g.status === 'open' ? 'closed' : 'open'); await load() }
  async function remove(id: string) { if (!confirm('Delete this gig?')) return; await api.deleteGig(id); await load() }

  return (
    <div>
      <h2 style={h2}>Gigs</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {gigs.map(g => (
          <div key={g.id} style={rowCard}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{g.title}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                {g.provider_name} · {g.provider_credibility} cred · {g.reward_type}{g.price_eur ? ` €${g.price_eur}` : ''} · {g.status}
              </div>
            </div>
            <button style={ghostBtn} onClick={() => toggle(g)}>{g.status === 'open' ? 'Close' : 'Reopen'}</button>
            <button style={ghostBtn} onClick={() => remove(g.id)}>Delete</button>
          </div>
        ))}
        {gigs.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No gigs yet.</div>}
      </div>
    </div>
  )
}

// ── Quests ──────────────────────────────────────────────────────────────────
const ICON_OPTIONS = ['sparkles', 'coffee', 'heart-handshake', 'party', 'map', 'languages', 'croissant', 'gift', 'target', 'camera', 'palette', 'globe', 'handshake', 'users']
const CAT_OPTIONS = ['social', 'explore', 'give', 'profile', 'network']

export function QuestsAdmin() {
  const [quests, setQuests] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', description: '', points: 20, category: 'social', icon: 'sparkles', startsAt: '', endsAt: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => { setQuests((await api.quests()).quests) }, [])
  useEffect(() => { void load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await api.createQuest(form)
      setForm({ title: '', description: '', points: 20, category: 'social', icon: 'sparkles', startsAt: '', endsAt: '' })
      await load()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function toggle(q: any) { await api.updateQuest(q.id, { active: !q.active }); await load() }
  async function remove(id: string) { if (!confirm('Delete this quest?')) return; await api.deleteQuest(id); await load() }

  return (
    <div>
      <h2 style={h2}>Create a side quest</h2>
      <form onSubmit={create} style={{ ...cardWrap, display: 'grid', gap: 10 }}>
        <input required placeholder="Title (e.g. Try a new biergarten)" style={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <textarea placeholder="Description" rows={2} style={{ ...input, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="number" min={0} placeholder="Points" style={{ ...input, width: 100 }} value={form.points} onChange={e => setForm({ ...form, points: Number(e.target.value) })} />
          <select style={{ ...input, flex: 1, minWidth: 120 }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...input, flex: 1, minWidth: 120 }} value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
            {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: C.inkMuted }}>Starts (optional) <input type="datetime-local" style={{ ...input, width: 'auto' }} value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label style={{ fontSize: 12, color: C.inkMuted }}>Ends (optional) <input type="datetime-local" style={{ ...input, width: 'auto' }} value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
        </div>
        {err && <div style={{ color: C.signal, fontSize: 13 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ ...primaryBtn, justifySelf: 'start' }}>{busy ? 'Creating…' : 'Create quest'}</button>
      </form>

      <div style={{ display: 'grid', gap: 10 }}>
        {quests.map(q => (
          <div key={q.id} style={{ ...rowCard, opacity: q.active ? 1 : 0.55 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{q.title} <span style={{ color: C.signal, fontWeight: 600 }}>+{q.points}</span></div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{q.category} · {q.icon}{q.active ? '' : ' · inactive'}</div>
            </div>
            <button style={ghostBtn} onClick={() => toggle(q)}>{q.active ? 'Disable' : 'Enable'}</button>
            <button style={ghostBtn} onClick={() => remove(q.id)}>Delete</button>
          </div>
        ))}
        {quests.length === 0 && <div style={{ color: C.inkFaint, fontSize: 13 }}>No quests yet.</div>}
      </div>
    </div>
  )
}
