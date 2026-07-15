/**
 * Café detail: full info for a single place from the Cafés directory.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Check, MapPin, Search, Users } from 'lucide-react'
import { KBtn, KPill } from '@/lib/knotify'
import { apiGet, apiPost } from '@/lib/api'
import { T, DeskPage, RailCard } from '@/lib/desk'

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
}

type Connection = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  user: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '9px 11px', marginTop: 4, borderRadius: 10, border: `0.5px solid ${T.rule}`, background: T.paperSoft, color: T.ink, fontSize: 13.5, fontFamily: T.text, outline: 'none' }

function defaultMeetingTime() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(18, 0, 0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function CafeDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [cafe, setCafe] = useState<Cafe | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteeIds, setInviteeIds] = useState<string[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [scheduledAt, setScheduledAt] = useState(defaultMeetingTime)
  const [note, setNote] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteSent, setInviteSent] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let mounted = true
    Promise.all([
      apiGet<{ cafe: Cafe }>(`/api/cafes/${slug}`),
      apiGet<{ connections: Connection[] }>('/api/connections'),
    ])
      .then(([cafeData, connectionData]) => {
        if (!mounted) return
        setCafe(cafeData.cafe)
        setConnections((connectionData.connections ?? []).filter((c) => c.status === 'accepted' && c.user))
      })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Could not load this place') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [slug])

  const typeLabel = useMemo(() => {
    if (!cafe) return ''
    return cafe.venue_type === 'cafe' ? 'Café' : cafe.venue_type === 'restaurant' ? 'Restaurant' : 'Bar'
  }, [cafe])

  const visibleConnections = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase()
    if (!query) return connections
    return connections.filter(({ user }) => user && `${user.full_name} @${user.username}`.toLowerCase().includes(query))
  }, [connections, inviteSearch])

  function openInvite() {
    setInviteeIds([])
    setInviteSearch('')
    setScheduledAt(defaultMeetingTime())
    setNote('')
    setInviteSent(null)
    setInviteOpen(true)
  }

  async function sendInvite() {
    if (!cafe || inviteeIds.length === 0 || !scheduledAt) return
    setSendingInvite(true)
    try {
      await Promise.all(inviteeIds.map((inviteeId) => apiPost('/api/meetings', {
        inviteeId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        cafeId: cafe.id,
        locationText: null,
        note: note.trim() || null,
      })))
      setInviteSent(`${inviteeIds.length} invitation${inviteeIds.length === 1 ? '' : 's'} sent through Messages.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation')
    } finally {
      setSendingInvite(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: T.display, fontStyle: 'italic', color: T.inkMuted }}>Loading…</div>
  }

  if (error || !cafe) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.inkMuted, marginBottom: 14 }}>{error ?? 'Place not found.'}</p>
        <KBtn variant="ghost" size="sm" onClick={() => navigate('/cafes')}>Back to Cafés</KBtn>
      </div>
    )
  }

  const mapsQuery = [cafe.name, cafe.address, cafe.city].filter(Boolean).join(', ')
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null

  const rail = (
    <RailCard tone="signal">
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9, fontWeight: 600 }}>Plan a visit</div>
      <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, marginTop: 6 }}>{cafe.name}</div>
      <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6, lineHeight: 1.45 }}>Invite a connection and it lands as a real coffee proposal in Messages.</div>
      <KBtn variant="signal" size="sm" onClick={openInvite} style={{ marginTop: 12, background: 'rgba(255,255,255,0.18)' }}>
        <Users size={13} style={{ marginRight: 5 }} />Plan here
      </KBtn>
    </RailCard>
  )

  return (
    <div style={{ paddingBottom: 40, fontFamily: T.text }}>
      <button onClick={() => navigate('/cafes')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.inkMuted, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Cafés
      </button>

      <DeskPage rail={rail}>
        <div style={{ borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: 'var(--lift-1)' }}>
          <div
            style={{
              height: 220,
              background: cafe.photo_url
                ? `center/cover url(${cafe.photo_url})`
                : `linear-gradient(135deg, ${cafe.is_partnered ? T.signal : T.inkMuted}, ${cafe.is_partnered ? T.signalDeep : T.ink})`,
            }}
          />
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <KPill color={cafe.is_partnered ? 'signal' : 'default'}>{cafe.is_partnered ? 'Partner' : typeLabel}</KPill>
              {cafe.is_partnered && <KPill color="default">{typeLabel}</KPill>}
              {cafe.current_checkins > 0 && <KPill color="verd">{cafe.current_checkins} checked in recently</KPill>}
            </div>
            <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 500 }}>{cafe.name}</div>
            <div style={{ marginTop: 6, color: T.inkMuted, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(cafe.area || cafe.address) && (
                <div><MapPin size={13} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} />{[cafe.area, cafe.address].filter(Boolean).join(' · ')}</div>
              )}
              {cafe.hours_text && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}><CalendarClock size={13} style={{ marginTop: 3, flexShrink: 0 }} /><span>{cafe.hours_text.split(';').map((hours) => <span key={hours} style={{ display: 'block' }}>{hours.trim()}</span>)}</span></div>
              )}
            </div>
            {cafe.description && <p style={{ margin: '16px 0 0', color: T.inkSoft, fontSize: 14, lineHeight: 1.6 }}>{cafe.description}</p>}

            {cafe.is_partnered && (cafe.deal_title || cafe.deal_details || cafe.perk_text) && (
              <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: T.ochreSoft }}>
                <div style={{ color: T.ochre, fontSize: 14, fontWeight: 700 }}>{cafe.deal_title || cafe.perk_text || 'Partner deal'}</div>
                {cafe.deal_details && <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 13, lineHeight: 1.5 }}>{cafe.deal_details}</div>}
                {cafe.deal_code_enabled && <div style={{ marginTop: 8, color: T.inkMuted, fontSize: 12 }}>The organiser receives the deal code in Messages after an invitee accepts.</div>}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <KBtn variant="signal" size="sm" onClick={openInvite}><Users size={13} style={{ marginRight: 5 }} />Plan here</KBtn>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.signal, fontSize: 13, textDecoration: 'none' }}>
                  <MapPin size={13} style={{ verticalAlign: 'text-bottom' }} /> Open in Maps
                </a>
              )}
            </div>
          </div>
        </div>
      </DeskPage>

      {inviteOpen && (
        <div onClick={() => !sendingInvite && setInviteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,24,21,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div role="dialog" aria-modal="true" aria-label={`Plan at ${cafe.name}`} onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: T.paper, borderRadius: 18, padding: 22 }}>
            <div style={{ fontFamily: T.display, fontSize: 24, fontStyle: 'italic' }}>Meet at {cafe.name}</div>
            <p style={{ margin: '7px 0 18px', color: T.inkMuted, fontSize: 13, lineHeight: 1.5 }}>The invitation is delivered as a real coffee proposal in Messages.</p>
            {inviteSent ? (
              <div style={{ padding: 14, borderRadius: 12, background: T.verdSoft, color: T.verd, fontSize: 13 }}>{inviteSent}</div>
            ) : connections.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 12, background: T.ochreSoft, color: T.ochre, fontSize: 13 }}>
                You need an accepted connection before you can choose this place. <a href="/discover" style={{ color: 'inherit', fontWeight: 700 }}>Find people</a>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 13 }}>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: 12, color: T.inkMuted, marginBottom: 5 }}>Invite people (required)</legend>
                  <div style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 12, top: 14, color: T.inkFaint }} /><input aria-label="Search people" value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder="Search by name or username" style={{ ...inputStyle, marginTop: 0, paddingLeft: 35 }} /></div>
                  <div style={{ marginTop: 7, maxHeight: 190, overflowY: 'auto', border: `0.5px solid ${T.rule}`, borderRadius: 10, background: T.paperSoft }}>
                    {visibleConnections.map((connection) => { const user = connection.user!; const selected = inviteeIds.includes(user.id); return <button key={connection.id} type="button" aria-pressed={selected} onClick={() => setInviteeIds((current) => selected ? current.filter((id) => id !== user.id) : [...current, user.id])} style={{ width: '100%', border: 0, borderBottom: `0.5px solid ${T.ruleSoft}`, background: selected ? T.verdSoft : 'transparent', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', color: T.ink, cursor: 'pointer', fontFamily: T.text }}><span style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${selected ? T.verd : T.rule}`, background: selected ? T.verd : T.paper, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{selected && <Check size={12} />}</span><span><b style={{ fontSize: 13 }}>{user.full_name}</b><span style={{ color: T.inkMuted, fontSize: 12 }}> @{user.username}</span></span></button> })}
                    {visibleConnections.length === 0 && <div style={{ padding: 14, color: T.inkMuted, fontSize: 12.5 }}>No people match this search.</div>}
                  </div>
                  {inviteeIds.length > 0 && <div style={{ marginTop: 6, color: T.verd, fontSize: 12 }}>{inviteeIds.length} selected</div>}
                </fieldset>
                <label style={{ fontSize: 12, color: T.inkMuted }}>Date and time (required)
                  <input type="datetime-local" value={scheduledAt} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduledAt(event.target.value)} style={inputStyle} />
                </label>
                <label style={{ fontSize: 12, color: T.inkMuted }}>Optional note
                  <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} placeholder="What would you like to talk about?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <KBtn variant="ghost" size="sm" onClick={() => setInviteOpen(false)} disabled={sendingInvite}>{inviteSent ? 'Done' : 'Cancel'}</KBtn>
              {!inviteSent && connections.length > 0 && (
                <KBtn variant="signal" size="sm" onClick={sendInvite} disabled={sendingInvite || inviteeIds.length === 0 || !scheduledAt}>{sendingInvite ? 'Sending…' : `Send ${inviteeIds.length || ''} invitation${inviteeIds.length === 1 ? '' : 's'}`.trim()}</KBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
