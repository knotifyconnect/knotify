import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { T, DeskPage, DeskHeader, SectionLabel, Chip, RailCard, accentFor, gradientFor } from '@/lib/desk'

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
function dayBadge(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' })
}

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: `0.5px solid ${T.rule}`,
  background: '#fffdf9', fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
  fontFamily: T.text,
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

  const featured = events[0]
  const rest = events.slice(1)

  function RsvpButton({ e, dark = false }: { e: EventItem; dark?: boolean }) {
    return (
      <button
        onClick={() => toggleRsvp(e.id)}
        disabled={e.is_host}
        style={{
          padding: '8px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer', border: 'none',
          background: e.is_host ? (dark ? 'rgba(255,255,255,0.18)' : T.rule) : e.rsvped ? T.verd : dark ? T.signal : T.ink,
          color: e.is_host && !dark ? T.inkFaint : '#fff', fontFamily: T.text, whiteSpace: 'nowrap',
        }}
      >
        {e.is_host ? 'Your event' : e.rsvped ? 'Going' : 'RSVP'}
      </button>
    )
  }

  // Right rail: your week (real RSVP'd / upcoming) + hosting card
  const upcoming = events.filter(e => e.rsvped || e.is_host).slice(0, 4)
  const rail = (
    <>
      <RailCard tone="ink">
        <div style={{ fontSize: 11, color: T.signal, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Your week</div>
        {upcoming.length > 0 ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: gradientFor(accentFor(e.id)), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{dayBadge(e.starts_at)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: T.paperSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                  <div style={{ fontSize: 10.5, color: T.inkFaint }}>{whenLabel(e.starts_at)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: T.inkFaint, lineHeight: 1.5 }}>RSVP to events and they will show up here for your week.</div>
        )}
      </RailCard>

      <div>
        <SectionLabel>Hosting? Earn cred</SectionLabel>
        <RailCard tone="ochre">
          <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>Host a study spot, a walk, or a small dinner. Bringing people together earns you credibility.</div>
          <button onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 999, border: 'none', background: T.signal, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>Create an event</button>
        </RailCard>
      </div>
    </>
  )

  return (
    <div style={{ paddingBottom: 40 }}>
      <DeskHeader
        kicker="Discover · Events · Munich"
        title={<span style={{ fontStyle: 'italic' }}>Worth showing up for.</span>}
        right={<button onClick={() => setShowForm(s => !s)} style={{ padding: '9px 16px', borderRadius: 999, border: 'none', background: showForm ? T.rule : T.ink, color: showForm ? T.inkMuted : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: T.text }}>{showForm ? 'Cancel' : 'Host an event'}</button>}
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: T.signalSoft, border: '0.5px solid rgba(216,68,43,0.2)', color: T.signal, fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}

      {showForm && (
        <form onSubmit={createEvent} style={{ background: T.paperSoft, border: `0.5px solid ${T.rule}`, borderRadius: 18, padding: 22, display: 'grid', gap: 12, marginBottom: 22 }}>
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 17 }}>Tell people about it</div>
          <input required placeholder="Event title (e.g. International coffee meetup)" value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input required type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={field} />
            <input placeholder="Location" value={location} onChange={e => setLocation(e.target.value)} style={field} />
          </div>
          <textarea placeholder="What's it about? Who should come?" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
          <button type="submit" disabled={busy} style={{ justifySelf: 'start', padding: '10px 22px', borderRadius: 999, border: 'none', background: T.signal, color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', fontFamily: T.text }}>{busy ? 'Creating...' : 'Create event'}</button>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', fontFamily: T.display, fontStyle: 'italic', color: T.inkMuted, fontSize: 16 }}>Loading...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 32px', borderRadius: 18, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, color: T.ink, marginBottom: 8 }}>No events yet.</div>
          <div style={{ fontSize: 13.5, color: T.inkMuted }}>Be the first to host something in Munich.</div>
        </div>
      ) : (
        <DeskPage rail={rail}>
          {/* Featured hero */}
          {featured && (
            <div style={{ borderRadius: 18, overflow: 'hidden', border: `0.5px solid ${T.rule}`, position: 'relative', minHeight: 230, marginBottom: 22, background: gradientFor(accentFor(featured.id)) }}>
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${T.ink}f0 0%, ${T.ink}80 50%, transparent 100%)` }} />
              <div style={{ position: 'relative', padding: 30, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: T.paperSoft, maxWidth: 560, minHeight: 230 }}>
                <Chip color="signal">Featured · next up</Chip>
                <div>
                  <div style={{ fontFamily: T.display, fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.04 }}>{featured.title}</div>
                  {featured.description && <div style={{ fontSize: 13, color: 'rgba(250,246,238,0.8)', marginTop: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{featured.description}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: T.inkFaint }}>{whenLabel(featured.starts_at)}{featured.location ? ` · ${featured.location}` : ''} · {featured.rsvp_count} going</span>
                    <RsvpButton e={featured} dark />
                  </div>
                </div>
              </div>
            </div>
          )}

          <SectionLabel>Happening around Munich</SectionLabel>
          {rest.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
              {rest.map((e) => {
                const color = accentFor(e.id)
                return (
                  <div key={e.id} style={{ borderRadius: 14, overflow: 'hidden', background: T.paper, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'relative', height: 120, background: gradientFor(color) }}>
                      <div style={{ position: 'absolute', top: 10, left: 10 }}><Chip color="signal" style={{ background: 'rgba(0,0,0,0.25)', color: '#fff', border: 'none' }}>{whenLabel(e.starts_at)}</Chip></div>
                    </div>
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{e.title}</div>
                      {e.location && <div style={{ fontSize: 11.5, color: T.inkSoft }}>{e.location}</div>}
                      {e.description && <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.description}</div>}
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `0.5px solid ${T.ruleSoft}`, paddingTop: 10 }}>
                        <span style={{ fontSize: 10.5, color: T.inkMuted }}>Hosted by {e.host_name} · {e.rsvp_count} going</span>
                        <RsvpButton e={e} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>That is the only event for now. Host another.</div>
          )}
        </DeskPage>
      )}
    </div>
  )
}
