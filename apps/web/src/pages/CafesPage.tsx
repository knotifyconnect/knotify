/**
 * Cafés · IRL — active admin-managed places and real coffee invitations.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Coffee, Copy, MapPin, Search, Users, X } from 'lucide-react'
import { KBtn, KCard, KPill } from '@/lib/knotify'
import { apiGetCached, apiPost, getApiCacheSnapshot } from '@/lib/api'
import { T, DeskPage, DeskHeader, SectionLabel, Chip, RailCard } from '@/lib/desk'

type VenueType = 'cafe' | 'restaurant' | 'bar'

type Cafe = {
  id: string
  slug: string
  name: string
  venue_type: VenueType
  address: string | null
  city: string
  area: string | null
  description: string | null
  perk_text: string | null
  photo_url: string | null
  hours_text: string | null
  lat: number | null
  lng: number | null
  current_checkins: number
  is_partnered: boolean
  deal_title: string | null
  deal_details: string | null
  deal_code: string | null
  deal_code_enabled: boolean
  featured_priority: number
}

type Connection = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  user: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

const CAFES_PATH = '/api/cafes'
const CONNECTIONS_PATH = '/api/connections'

function defaultMeetingTime() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(18, 0, 0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function CafesPage() {
  const [cafes, setCafes] = useState<Cafe[]>(() => getApiCacheSnapshot<{ cafes: Cafe[] }>(CAFES_PATH)?.cafes ?? [])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(() => !getApiCacheSnapshot<{ cafes: Cafe[] }>(CAFES_PATH))
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [inviteCafe, setInviteCafe] = useState<Cafe | null>(null)
  const [selectedCafe, setSelectedCafe] = useState<Cafe | null>(null)
  const [inviteeId, setInviteeId] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultMeetingTime)
  const [note, setNote] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteSent, setInviteSent] = useState<string | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestAddress, setSuggestAddress] = useState('')
  const [suggestNotes, setSuggestNotes] = useState('')
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestDone, setSuggestDone] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      apiGetCached<{ cafes: Cafe[] }>(CAFES_PATH, { ttlMs: 60_000 }),
      apiGetCached<{ connections: Connection[] }>(CONNECTIONS_PATH, { ttlMs: 30_000 }),
    ])
      .then(([cafeData, connectionData]) => {
        if (!mounted) return
        setCafes(cafeData.cafes ?? [])
        setConnections((connectionData.connections ?? []).filter((connection) => connection.status === 'accepted' && connection.user))
      })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed loading places') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const visibleCafes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return cafes
    return cafes.filter((cafe) => [cafe.name, cafe.venue_type, cafe.area].some((value) => value?.toLowerCase().includes(query)))
  }, [cafes, search])

  function openInvite(cafe: Cafe) {
    setInviteCafe(cafe)
    setInviteeId('')
    setScheduledAt(defaultMeetingTime())
    setNote('')
    setInviteSent(null)
    setError(null)
  }

  async function sendInvite() {
    if (!inviteCafe || !inviteeId || !scheduledAt) return
    setSendingInvite(true)
    setError(null)
    try {
      await apiPost('/api/meetings', {
        inviteeId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        cafeId: inviteCafe.id,
        locationText: null,
        note: note.trim() || null,
      })
      const invitee = connections.find((connection) => connection.user?.id === inviteeId)?.user
      setInviteSent(`Invitation sent to ${invitee?.full_name ?? 'your connection'} through Messages.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation')
    } finally {
      setSendingInvite(false)
    }
  }

  const partneredCount = cafes.filter((cafe) => cafe.is_partnered).length
  const rail = (
    <>
      <RailCard tone="signal">
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9, fontWeight: 600 }}>IRL directory</div>
        <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, marginTop: 6 }}>{cafes.length} places · {partneredCount} partners</div>
        <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6, lineHeight: 1.45 }}>Choose a place, invite someone from your knot, and the proposal lands in their Messages.</div>
      </RailCard>
      <div>
        <SectionLabel>How it works</SectionLabel>
        <div style={{ display: 'grid', gap: 9, fontSize: 12.5, color: T.inkMuted, lineHeight: 1.45 }}>
          <div><Users size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Pick at least one person.</div>
          <div><CalendarClock size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Choose a date and send a proposal.</div>
        </div>
      </div>
    </>
  )

  return (
    <div style={{ paddingBottom: 40, fontFamily: T.text }}>
      <DeskHeader
        kicker="Cafés · Restaurants · Bars · Munich"
        title={<span style={{ fontStyle: 'italic' }}>Rooms to meet in.</span>}
        right={<button onClick={() => { setSuggestOpen(true); setSuggestDone(false); setSuggestName(''); setSuggestAddress(''); setSuggestNotes('') }} style={{ padding: '9px 16px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: T.paperSoft, fontSize: 13, cursor: 'pointer', fontFamily: T.text, color: T.ink }}>Suggest a place</button>}
      />

      {error && <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, background: T.signalSoft, border: '0.5px solid rgba(216,68,43,0.2)', color: T.signal, fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ position: 'relative', marginBottom: 18 }}>
        <Search size={16} style={{ position: 'absolute', left: 13, top: 12, color: T.inkFaint }} />
        <input aria-label="Search places" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, type, or area" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 12, border: `0.5px solid ${T.rule}`, background: T.paperSoft, color: T.ink, fontSize: 13.5, outline: 'none' }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: T.display, fontStyle: 'italic', color: T.inkMuted }}>Loading places…</div>
      ) : cafes.length === 0 ? (
        <KCard style={{ padding: 40, textAlign: 'center' }}><Coffee size={26} /><div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, marginTop: 12 }}>Places roll out next.</div></KCard>
      ) : (
        <DeskPage rail={rail}>
          <SectionLabel>{visibleCafes.length} active place{visibleCafes.length === 1 ? '' : 's'} · partners first</SectionLabel>
          {visibleCafes.length === 0 ? (
            <KCard style={{ padding: 28, textAlign: 'center', color: T.inkMuted }}>No places match “{search}”.</KCard>
          ) : (
            <div data-tour="cafe-directory" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
              {visibleCafes.map((cafe) => <CafeCard key={cafe.id} cafe={cafe} onInvite={() => openInvite(cafe)} onOpen={() => setSelectedCafe(cafe)} />)}
            </div>
          )}
        </DeskPage>
      )}

      {selectedCafe && <CafeDetailModal cafe={selectedCafe} onClose={() => setSelectedCafe(null)} onInvite={() => { setSelectedCafe(null); openInvite(selectedCafe) }} />}

      {inviteCafe && (
        <div onClick={() => !sendingInvite && setInviteCafe(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,24,21,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div role="dialog" aria-modal="true" aria-label={`Plan at ${inviteCafe.name}`} onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: T.paper, borderRadius: 18, padding: 22 }}>
            <div style={{ fontFamily: T.display, fontSize: 24, fontStyle: 'italic' }}>Meet at {inviteCafe.name}</div>
            <p style={{ margin: '7px 0 18px', color: T.inkMuted, fontSize: 13, lineHeight: 1.5 }}>A place can only be selected with at least one invitee. The invitation is delivered as a real coffee proposal in Messages.</p>
            {inviteSent ? (
              <div style={{ padding: 14, borderRadius: 12, background: T.verdSoft, color: T.verd, fontSize: 13 }}>{inviteSent}</div>
            ) : connections.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 12, background: T.ochreSoft, color: T.ochre, fontSize: 13 }}>You need an accepted connection before you can choose this place. <a href="/discover" style={{ color: 'inherit', fontWeight: 700 }}>Find people</a></div>
            ) : (
              <div style={{ display: 'grid', gap: 13 }}>
                <label style={{ fontSize: 12, color: T.inkMuted }}>Invitee (required)
                  <select value={inviteeId} onChange={(event) => setInviteeId(event.target.value)} style={inputStyle}>
                    <option value="">Choose someone from your knot</option>
                    {connections.map((connection) => <option key={connection.id} value={connection.user!.id}>{connection.user!.full_name} · @{connection.user!.username}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: T.inkMuted }}>Date and time (required)
                  <input type="datetime-local" value={scheduledAt} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduledAt(event.target.value)} style={inputStyle} />
                </label>
                <label style={{ fontSize: 12, color: T.inkMuted }}>Optional note
                  <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} placeholder="What would you like to talk about?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <KBtn variant="ghost" size="sm" onClick={() => setInviteCafe(null)} disabled={sendingInvite}>{inviteSent ? 'Done' : 'Cancel'}</KBtn>
              {!inviteSent && connections.length > 0 && <KBtn variant="signal" size="sm" onClick={sendInvite} disabled={sendingInvite || !inviteeId || !scheduledAt}>{sendingInvite ? 'Sending…' : 'Send invitation'}</KBtn>}
            </div>
          </div>
        </div>
      )}

      {suggestOpen && (
        <div onClick={() => setSuggestOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,24,21,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: T.paper, borderRadius: 18, padding: 22 }}>
            <div style={{ fontFamily: T.display, fontSize: 23, fontStyle: 'italic', marginBottom: 14 }}>Suggest a place</div>
            {suggestDone ? <div style={{ color: T.verd, fontSize: 13.5 }}>Thanks — the team will review it.</div> : <div style={{ display: 'grid', gap: 10 }}>
              <input value={suggestName} onChange={(event) => setSuggestName(event.target.value)} placeholder="Name" style={inputStyle} />
              <input value={suggestAddress} onChange={(event) => setSuggestAddress(event.target.value)} placeholder="Address" style={inputStyle} />
              <textarea value={suggestNotes} onChange={(event) => setSuggestNotes(event.target.value)} placeholder="Why it belongs here (optional)" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <KBtn variant="ghost" size="sm" onClick={() => setSuggestOpen(false)}>{suggestDone ? 'Done' : 'Cancel'}</KBtn>
              {!suggestDone && <KBtn variant="signal" size="sm" disabled={suggestLoading || !suggestName.trim() || !suggestAddress.trim()} onClick={async () => { setSuggestLoading(true); try { await apiPost('/api/cafes/suggest', { name: suggestName, address: suggestAddress, notes: suggestNotes || undefined }); setSuggestDone(true) } catch (err) { setError(err instanceof Error ? err.message : 'Could not send suggestion'); setSuggestOpen(false) } finally { setSuggestLoading(false) } }}>{suggestLoading ? 'Sending…' : 'Send suggestion'}</KBtn>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CafeCard({ cafe, onInvite, onOpen }: { cafe: Cafe; onInvite: () => void; onOpen: () => void }) {
  const typeLabel = cafe.venue_type === 'cafe' ? 'Café' : cafe.venue_type === 'restaurant' ? 'Restaurant' : 'Bar'

  return (
    <KCard onClick={onOpen} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 210, cursor: 'pointer' }}>
      <div style={{ height: 96, background: cafe.photo_url ? `center/cover url(${cafe.photo_url})` : `linear-gradient(135deg, ${cafe.is_partnered ? T.signal : T.inkMuted}, ${cafe.is_partnered ? T.signalDeep : T.ink})`, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}><Chip color={cafe.is_partnered ? 'signal' : 'paper'}>{cafe.is_partnered ? 'Partner' : typeLabel}</Chip>{cafe.is_partnered && <Chip color="paper">{typeLabel}</Chip>}</div>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500 }}>{cafe.name}</div>
        <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 12.5 }}>{[cafe.area, cafe.address, cafe.hours_text].filter(Boolean).join(' · ')}</div>
        <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <KBtn variant="signal" size="sm" onClick={(event) => { event.stopPropagation(); onInvite() }}><Users size={13} style={{ marginRight: 5 }} />Plan here</KBtn>
          {cafe.lat != null && cafe.lng != null && <a onClick={(event) => event.stopPropagation()} href={`https://www.google.com/maps?q=${cafe.lat},${cafe.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: T.signal, fontSize: 12.5, textDecoration: 'none' }}><MapPin size={13} style={{ verticalAlign: 'text-bottom' }} /> Map</a>}
          {!cafe.is_partnered && <KPill color="default">Listed place</KPill>}
        </div>
      </div>
    </KCard>
  )
}

function CafeDetailModal({ cafe, onClose, onInvite }: { cafe: Cafe; onClose: () => void; onInvite: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close) }
  }, [onClose])
  const typeLabel = cafe.venue_type === 'cafe' ? 'Café' : cafe.venue_type === 'restaurant' ? 'Restaurant' : 'Bar'
  const mapUrl = cafe.lat != null && cafe.lng != null ? `https://www.google.com/maps?q=${cafe.lat},${cafe.lng}` : null
  return createPortal(<div className="k-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="k-modal-card" role="dialog" aria-modal="true" aria-label={cafe.name}>
      <div style={{ margin: '-28px -24px 0', height: 220, background: cafe.photo_url ? `center/cover no-repeat url(${cafe.photo_url})` : `linear-gradient(135deg, ${cafe.is_partnered ? T.signal : T.inkMuted}, ${cafe.is_partnered ? T.signalDeep : T.ink})`, borderRadius: '20px 20px 0 0', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,24,21,.78), transparent 58%)', borderRadius: '20px 20px 0 0' }} />
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, border: 0, borderRadius: 99, background: 'rgba(26,24,21,.48)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={15} /></button>
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18, color: '#fff' }}><div style={{ fontSize: 11.5 }}>{[cafe.area, cafe.city].filter(Boolean).join(' · ')}</div><div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 28, lineHeight: 1.1 }}>{cafe.name}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '20px 0 16px' }}><Chip color={cafe.is_partnered ? 'signal' : 'paper'}>{cafe.is_partnered ? 'Partner' : typeLabel}</Chip>{cafe.is_partnered && <Chip color="paper">{typeLabel}</Chip>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
        <div style={detailBox}><b style={detailLabel}>Location</b><div><MapPin size={13} color={T.signal} /> {[cafe.address, cafe.city].filter(Boolean).join(', ')}</div></div>
        {cafe.hours_text && <div style={detailBox}><b style={detailLabel}>Hours</b><div><CalendarClock size={13} color={T.ochre} /> {cafe.hours_text}</div></div>}
      </div>
      {cafe.description && <p style={{ color: T.inkSoft, fontSize: 14, lineHeight: 1.7 }}>{cafe.description}</p>}
      {cafe.is_partnered && (cafe.deal_title || cafe.deal_details || cafe.perk_text) && <div data-tour="cafe-partner-deals" style={{ ...detailBox, margin: '16px 0', background: T.ochreSoft }}><b style={{ color: T.ochre }}>{cafe.deal_title || cafe.perk_text || 'Partner deal'}</b>{cafe.deal_details && <div style={{ marginTop: 5 }}>{cafe.deal_details}</div>}{cafe.deal_code_enabled && cafe.deal_code && <button onClick={async () => { await navigator.clipboard.writeText(cafe.deal_code!); setCopied(true) }} style={{ marginTop: 9, border: 0, borderRadius: 8, padding: '7px 10px', background: T.paper, color: T.ochre, cursor: 'pointer' }}><Copy size={12} /> {copied ? 'Copied' : cafe.deal_code}</button>}</div>}
      <div style={{ display: 'flex', gap: 10 }}><button onClick={onInvite} style={{ flex: 1, padding: 14, border: 0, borderRadius: 999, background: T.signal, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Plan here</button>{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" style={{ padding: 14, color: T.signal, textDecoration: 'none' }}>Map</a>}</div>
    </div>
  </div>, document.body)
}

const detailBox = { padding: '12px 14px', borderRadius: 12, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}`, fontSize: 13, lineHeight: 1.5 }
const detailLabel = { display: 'block', fontSize: 10, color: T.inkMuted, letterSpacing: '.07em', textTransform: 'uppercase' as const, marginBottom: 5 }

const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '9px 11px', marginTop: 4, borderRadius: 10, border: `0.5px solid ${T.rule}`, background: T.paperSoft, color: T.ink, fontSize: 13.5, fontFamily: T.text, outline: 'none' }
