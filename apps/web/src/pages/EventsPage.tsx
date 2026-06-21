import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'

type EventItem = {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  interests: string[]
  host_name: string
  is_host: boolean
  rsvp_count: number
  rsvped: boolean
}

function whenLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '0.5px solid var(--rule)',
  background: '#fffdf9', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

export function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    try { setEvents((await apiGet<{ events: EventItem[] }>('/api/events')).events) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggleRsvp(id: string) {
    setEvents(evs => evs.map(e => e.id === id ? { ...e, rsvped: !e.rsvped, rsvp_count: e.rsvp_count + (e.rsvped ? -1 : 1) } : e))
    try { await apiPost(`/api/events/${id}/rsvp`, {}) } catch { void load() }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiPost('/api/events', { title, startsAt: new Date(startsAt).toISOString(), location: location || null, description: description || null })
      setTitle(''); setStartsAt(''); setLocation(''); setDescription(''); setShowForm(false)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create event') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(20px,4vw,40px)', fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Events</div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(28px,4vw,38px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '6px 0 0' }}>
            What's happening.
          </h1>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--signal)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          {showForm ? 'Close' : 'Host an event'}
        </button>
      </div>

      {error && <div style={{ marginBottom: 16, color: 'var(--signal)', fontSize: 13 }}>{error}</div>}

      {showForm && (
        <form onSubmit={createEvent} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, marginBottom: 24 }}>
          <input required placeholder="Event title (e.g. International coffee meetup)" value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={{ ...field, flex: 1, minWidth: 180 }} />
            <input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} style={{ ...field, flex: 1, minWidth: 180 }} />
          </div>
          <textarea placeholder="What's it about? Who should come?" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
          <button type="submit" disabled={busy} style={{ justifySelf: 'start', padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--signal)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Creating…' : 'Create event'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--ink-muted)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, marginBottom: 8 }}>No events yet.</div>
          <div style={{ fontSize: 13.5 }}>Be the first to host something.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {events.map(e => (
            <div key={e.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{e.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3 }}>
                  {whenLabel(e.starts_at)}{e.location ? ` · ${e.location}` : ''}
                </div>
                {e.description && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>{e.description}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>Hosted by {e.host_name} · {e.rsvp_count} going</div>
              </div>
              <button
                onClick={() => toggleRsvp(e.id)}
                disabled={e.is_host}
                style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer',
                  border: `0.5px solid ${e.rsvped ? 'var(--verd, #1f6b5e)' : 'var(--rule)'}`,
                  background: e.rsvped ? 'var(--verd-soft, rgba(31,107,94,0.12))' : 'transparent',
                  color: e.is_host ? 'var(--ink-faint)' : e.rsvped ? 'var(--verd, #1f6b5e)' : 'var(--ink-muted)',
                }}
              >
                {e.is_host ? 'Hosting' : e.rsvped ? '✓ Going' : 'RSVP'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
