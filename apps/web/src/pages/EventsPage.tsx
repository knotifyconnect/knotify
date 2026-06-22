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

  const EVENT_GRADIENTS = [
    'linear-gradient(135deg, #D8442B 0%, #A8331F 100%)',
    'linear-gradient(135deg, #1F6B5E 0%, #134840 100%)',
    'linear-gradient(135deg, #5C2A4F 0%, #3d1c36 100%)',
    'linear-gradient(135deg, #C8941F 0%, #9a6f10 100%)',
    'linear-gradient(135deg, #1A1815 0%, #2d2820 100%)',
  ]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
            Events · Munich
          </div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
            <span style={{ fontStyle: 'italic' }}>What's happening.</span>
          </h1>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: showForm ? 'var(--rule)' : 'var(--ink)', color: showForm ? 'var(--ink-muted)' : '#fff', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}
        >
          {showForm ? 'Cancel' : 'Host an event'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', color: 'var(--signal)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={createEvent} style={{ background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', borderRadius: 18, padding: 22, display: 'grid', gap: 12, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 17, marginBottom: 4 }}>Tell people about it</div>
          <input required placeholder="Event title (e.g. International coffee meetup)" value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={field} />
            <input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} style={field} />
          </div>
          <textarea placeholder="What's it about? Who should come?" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
          <button type="submit" disabled={busy} style={{ justifySelf: 'start', padding: '10px 22px', borderRadius: 999, border: 'none', background: 'var(--signal)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', fontFamily: "'IBM Plex Sans'" }}>
            {busy ? 'Creating...' : 'Create event'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-muted)', fontSize: 16 }}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 32px', borderRadius: 18, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)' }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>No events yet.</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Be the first to host something in Munich.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {events.map((e, idx) => (
            <div key={e.id} style={{ borderRadius: 18, overflow: 'hidden', border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', display: 'flex', flexDirection: 'column' }}>
              {/* Image band */}
              <div style={{ height: 130, background: EVENT_GRADIENTS[idx % EVENT_GRADIENTS.length], display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '14px 16px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', background: 'rgba(0,0,0,0.22)', padding: '3px 8px', borderRadius: 999 }}>
                    {whenLabel(e.starts_at)}
                  </span>
                  {e.rsvp_count > 0 && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Mono'" }}>
                      {e.rsvp_count} going
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 4 }}>
                    {e.title}
                  </div>
                  {e.location && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{e.location}</div>
                  )}
                  {e.description && (
                    <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {e.description}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 'auto' }}>
                  Hosted by {e.host_name}
                </div>

                <button
                  onClick={() => toggleRsvp(e.id)}
                  disabled={e.is_host}
                  style={{
                    width: '100%', padding: '9px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer',
                    border: 'none',
                    background: e.is_host ? 'var(--rule)' : e.rsvped ? 'var(--verd)' : 'var(--ink)',
                    color: e.is_host ? 'var(--ink-faint)' : '#fff',
                    fontFamily: "'IBM Plex Sans'",
                    transition: 'background 0.15s',
                  }}
                >
                  {e.is_host ? 'Your event' : e.rsvped ? 'Going' : 'RSVP'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
