/**
 * Cafés · IRL — real partner café list with check-in (discount-code) flow.
 */
import { useEffect, useState } from 'react'
import { Coffee, Copy, MapPin, Clock } from 'lucide-react'
import { KBtn, KCard, KPill } from '@/lib/knotify'
import { apiGet, apiPost } from '@/lib/api'

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

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
          knotify · cafés
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 'clamp(28px, 3vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: '0 0 8px',
          }}
        >
          Real meetings, <span style={{ fontStyle: 'italic', color: 'var(--signal)' }}>real coffee.</span>
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, lineHeight: 1.5 }}>
          Check in at a partner café to unlock your member discount. Bring a friend from your knot for the best experience.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--signal-soft)',
            border: '0.5px solid rgba(216,68,43,0.2)',
            color: 'var(--signal)',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Section heading + suggest button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 18, fontWeight: 500 }}>
          Partner cafés · {cafes.length}
        </div>
        <button onClick={() => { setSuggestOpen(true); setSuggestDone(false); setSuggestName(''); setSuggestAddress(''); setSuggestNotes('') }} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--rule)', background: 'var(--paper-soft)', fontSize: 13, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          + Suggest a café
        </button>
      </div>

      {loading ? (
        <KCard style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', color: 'var(--ink-muted)' }}>Loading cafés…</p>
        </KCard>
      ) : cafes.length === 0 ? (
        <KCard style={{ padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--signal-soft)',
              color: 'var(--signal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <Coffee size={26} />
          </div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 22, fontWeight: 500, marginBottom: 8, letterSpacing: -0.2 }}>
            Cafés roll out next.
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.5, maxWidth: 380, margin: '0 auto 16px' }}>
            We're partnering with independent cafés around Munich for member perks, drop-in check-ins, and event tickets.
          </p>
          <KPill color="signal">Coming soon</KPill>
        </KCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {cafes.map((c) => <CafeCard key={c.id} cafe={c} onCheckin={() => checkin(c)} busy={checkingInId === c.id} />)}
        </div>
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
    <KCard style={{ padding: 0, overflow: 'hidden' }}>
      {cafe.photo_url ? (
        <div
          style={{
            height: 120,
            backgroundImage: `url(${cafe.photo_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : (
        <div
          style={{
            height: 120,
            background: 'linear-gradient(135deg, var(--signal-soft) 0%, var(--paper-deep) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--signal)',
          }}
        >
          <Coffee size={36} />
        </div>
      )}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, fontWeight: 500, color: 'var(--ink)', marginBottom: 4, letterSpacing: -0.2 }}>
          {cafe.name}
        </div>
        {cafe.address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 4 }}>
            <MapPin size={11} /> {cafe.address}
          </div>
        )}
        {cafe.hours_text && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 6 }}>
            <Clock size={11} /> {cafe.hours_text}
          </div>
        )}
        <div style={{ fontSize: 12, color: cafe.current_checkins > 0 ? 'var(--verd)' : 'var(--ink-faint)', marginBottom: 10 }}>
          {cafe.current_checkins > 0
            ? `🟢 ${cafe.current_checkins} ${cafe.current_checkins === 1 ? 'person' : 'people'} here now`
            : '🔴 Empty right now'}
        </div>
        {cafe.lat && cafe.lng && (
          <div style={{ marginBottom: 6 }}>
            <a href={`https://www.google.com/maps?q=${cafe.lat},${cafe.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--signal)', textDecoration: 'none' }}>
              📍 View on map
            </a>
          </div>
        )}
        {cafe.perk_text && (
          <div
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              background: 'var(--ochre-soft)',
              border: '0.5px solid rgba(200,148,31,0.22)',
              fontSize: 12,
              color: 'var(--ochre)',
              marginBottom: 12,
              lineHeight: 1.35,
            }}
          >
            {cafe.perk_text}
          </div>
        )}
        <KBtn variant="signal" size="sm" fullWidth disabled={busy} onClick={onCheckin}>
          {busy ? 'Generating code…' : 'Check in & get code'}
        </KBtn>
      </div>
    </KCard>
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
