/**
 * Cafés · IRL, real partner café list with check-in (discount-code) flow.
 */
import { useEffect, useState } from 'react'
import { Coffee, Copy, MapPin, Clock, Pin } from 'lucide-react'
import { KBtn, KCard, KPill } from '@/lib/knotify'
import { apiGet, apiPost } from '@/lib/api'
import { T, DeskPage, DeskHeader, SectionLabel, Chip, RailCard } from '@/lib/desk'

type Cafe = {
  id: string
  slug: string
  name: string
  address: string | null
  city: string
  perk_text: string | null
  photo_url: string | null
  hours_text: string | null
  lat: number | null
  lng: number | null
  current_checkins: number
}

type Checkin = {
  id: string
  discount_code: string
  created_at: string
  redeemed_at: string | null
}

export function CafesPage() {
  const [cafes, setCafes] = useState<Cafe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkinFor, setCheckinFor] = useState<{ cafe: Cafe; checkin: Checkin } | null>(null)
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestAddress, setSuggestAddress] = useState('')
  const [suggestNotes, setSuggestNotes] = useState('')
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestDone, setSuggestDone] = useState(false)

  useEffect(() => {
    let mounted = true
    apiGet<{ cafes: Cafe[] }>('/api/cafes')
      .then((d) => { if (mounted) setCafes(d.cafes ?? []) })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed loading cafés') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  async function checkin(cafe: Cafe) {
    setCheckingInId(cafe.id)
    setError(null)
    try {
      const res = await apiPost<{ checkin: Checkin; cafe: Cafe; reused: boolean }>(`/api/cafes/${cafe.id}/checkin`, {})
      setCheckinFor({ cafe: res.cafe, checkin: res.checkin })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed')
    } finally {
      setCheckingInId(null)
    }
  }

  const featured = cafes.find((c) => c.current_checkins > 0) ?? cafes[0]
  const rest = cafes.filter((c) => c.id !== featured?.id)
  const busiest = [...cafes].filter((c) => c.current_checkins > 0).sort((a, b) => b.current_checkins - a.current_checkins).slice(0, 3)

  const rail = (
    <>
      <RailCard tone="signal">
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9, fontWeight: 600 }}>Your café pass</div>
        <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, marginTop: 6 }}>Member · 2026</div>
        <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6, lineHeight: 1.45 }}>Check in at any partner café to unlock your member perk. Bring a friend from your knot.</div>
      </RailCard>

      <div>
        <SectionLabel>Busiest right now</SectionLabel>
        {busiest.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {busiest.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: T.paper, border: `0.5px solid ${T.ruleSoft}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: c.photo_url ? `center/cover url(${c.photo_url})` : T.verdSoft, color: T.verd, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{!c.photo_url && <Coffee size={15} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{c.name}</div><div style={{ fontSize: 10.5, color: T.verd, fontWeight: 600 }}>{c.current_checkins} here now</div></div>
                <KBtn variant="ghost" size="sm" onClick={() => checkin(c)}>Join</KBtn>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>Quiet everywhere right now. Be the first to check in.</div>
        )}
      </div>
    </>
  )

  return (
    <div style={{ paddingBottom: 40, fontFamily: T.text }}>
      <DeskHeader
        kicker="Cafés · IRL · Munich"
        title={<span style={{ fontStyle: 'italic' }}>Rooms to sit in.</span>}
        right={<button onClick={() => { setSuggestOpen(true); setSuggestDone(false); setSuggestName(''); setSuggestAddress(''); setSuggestNotes('') }} style={{ padding: '9px 16px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: T.paperSoft, fontSize: 13, cursor: 'pointer', fontFamily: T.text, color: T.ink }}>Suggest a café</button>}
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: T.signalSoft, border: '0.5px solid rgba(216,68,43,0.2)', color: T.signal, fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: T.display, fontStyle: 'italic', color: T.inkMuted }}>Loading cafés…</div>
      ) : cafes.length === 0 ? (
        <KCard style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: T.signalSoft, color: T.signal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Coffee size={26} />
          </div>
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, fontWeight: 500, marginBottom: 8 }}>Cafés roll out next.</div>
          <p style={{ fontSize: 13.5, color: T.inkMuted, lineHeight: 1.5, maxWidth: 380, margin: '0 auto 16px' }}>
            We're partnering with independent cafés around Munich for member perks, drop-in check-ins, and event tickets.
          </p>
          <KPill color="signal">Coming soon</KPill>
        </KCard>
      ) : (
        <DeskPage rail={rail}>
          {/* Featured café */}
          {featured && (
            <div style={{ borderRadius: 18, overflow: 'hidden', border: `0.5px solid ${T.rule}`, display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', background: T.paperSoft, marginBottom: 22 }}>
              <div style={{ position: 'relative', minHeight: 240, background: featured.photo_url ? `center/cover url(${featured.photo_url})` : `linear-gradient(135deg, ${T.signal} 0%, ${T.signalDeep} 100%)` }}>
                <div style={{ position: 'absolute', top: 14, left: 14 }}><Chip color="signal">Partner · flagship</Chip></div>
              </div>
              <div style={{ padding: 26, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em' }}>{featured.name}</div>
                <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 4 }}>{[featured.address, featured.hours_text].filter(Boolean).join(' · ')}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {featured.perk_text && <Chip color="ochre">{featured.perk_text}</Chip>}
                  <Chip color={featured.current_checkins > 0 ? 'verd' : 'paper'}>{featured.current_checkins > 0 ? `${featured.current_checkins} here now` : 'Quiet now'}</Chip>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                  <KBtn variant="signal" size="md" onClick={() => checkin(featured)} disabled={checkingInId === featured.id}>
                    <Pin size={13} style={{ marginRight: 5 }} />{checkingInId === featured.id ? 'Generating…' : 'Check in'}
                  </KBtn>
                  {featured.lat && featured.lng && (
                    <a href={`https://www.google.com/maps?q=${featured.lat},${featured.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.signal, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> View on map</a>
                  )}
                </div>
              </div>
            </div>
          )}

          <SectionLabel>{cafes.length} partner café{cafes.length === 1 ? '' : 's'} in Munich</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
            {rest.map((c) => <CafeCard key={c.id} cafe={c} onCheckin={() => checkin(c)} busy={checkingInId === c.id} />)}
          </div>
        </DeskPage>
      )}

      {checkinFor && (
        <CheckinModal
          cafe={checkinFor.cafe}
          checkin={checkinFor.checkin}
          onClose={() => setCheckinFor(null)}
        />
      )}

      {/* Suggest café modal */}
      {suggestOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600 }}>Suggest a café</div>
              <button onClick={() => setSuggestOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--ink-faint)' }}>✕</button>
            </div>
            {suggestDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🙌</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Thanks for the suggestion!</div>
                <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>We'll review it and add it soon.</div>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault()
                setSuggestLoading(true)
                try {
                  await apiPost('/api/cafes/suggest', { name: suggestName, address: suggestAddress, notes: suggestNotes || undefined })
                  setSuggestDone(true)
                } catch { setError('Failed to submit suggestion') }
                finally { setSuggestLoading(false) }
              }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Café name *</label>
                  <input required value={suggestName} onChange={(e) => setSuggestName(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 14, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Address *</label>
                  <input required value={suggestAddress} onChange={(e) => setSuggestAddress(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 14, boxSizing: 'border-box' as const }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                  <textarea value={suggestNotes} onChange={(e) => setSuggestNotes(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' as const, minHeight: 80 }} />
                </div>
                <button type="submit" disabled={suggestLoading} style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--ink)', color: 'var(--paper)', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'IBM Plex Sans'" }}>
                  {suggestLoading ? 'Submitting…' : 'Submit suggestion'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CafeCard({ cafe, onCheckin, busy }: { cafe: Cafe; onCheckin: () => void; busy: boolean }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: T.paper, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', height: 120, background: cafe.photo_url ? `center/cover url(${cafe.photo_url})` : `linear-gradient(135deg, ${T.signalSoft} 0%, ${T.paperDeep} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.signal }}>
        {!cafe.photo_url && <Coffee size={32} />}
      </div>
      <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 17, fontWeight: 600 }}>{cafe.name}</div>
          {cafe.hours_text && <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.inkMuted, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={10} />{cafe.hours_text}</div>}
        </div>
        {cafe.address && <div style={{ fontSize: 11.5, color: T.inkMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{cafe.address}</div>}
        {cafe.perk_text && <div style={{ fontSize: 11, color: '#7A5A0F', background: T.ochreSoft, border: `0.5px solid ${T.ochre}`, borderRadius: 8, padding: '5px 8px', marginTop: 2, lineHeight: 1.3 }}>{cafe.perk_text}</div>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 10.5, color: cafe.current_checkins > 0 ? T.verd : T.inkFaint, fontWeight: 600 }}>{cafe.current_checkins > 0 ? `${cafe.current_checkins} here now` : 'Quiet'}</span>
          <KBtn variant="ghost" size="sm" disabled={busy} onClick={onCheckin}>{busy ? '…' : 'Check in'}</KBtn>
        </div>
      </div>
    </div>
  )
}

function CheckinModal({ cafe, checkin, onClose }: { cafe: Cafe; checkin: Checkin; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(checkin.discount_code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--paper)', borderRadius: 18, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--signal-soft)', color: 'var(--signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <Coffee size={26} />
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, marginBottom: 6, letterSpacing: -0.2 }}>
          Show this at <span style={{ fontStyle: 'italic' }}>{cafe.name}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 18, lineHeight: 1.5 }}>
          Hand the barista this code to redeem your member perk.
        </p>
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 14,
            background: 'var(--ink)',
            color: 'var(--paper)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 28,
            letterSpacing: 4,
            marginBottom: 14,
            fontWeight: 600,
          }}
        >
          {checkin.discount_code}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <KBtn variant="ink" size="sm" fullWidth onClick={copy}>
            <Copy size={12} style={{ marginRight: 4 }} />
            {copied ? 'Copied!' : 'Copy code'}
          </KBtn>
          <KBtn variant="ghost" size="sm" onClick={onClose}>Close</KBtn>
        </div>
        {cafe.perk_text && (
          <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 14, fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>
            {cafe.perk_text}
          </p>
        )}
      </div>
    </div>
  )
}
