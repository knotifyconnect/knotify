import { useEffect, useState, useCallback } from 'react'
import { Lock } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'

type Gig = {
  id: string
  gig_type: string
  title: string
  description: string | null
  reward_type: 'coffee' | 'paid' | 'free'
  price_eur: number | null
  provider_name: string
  provider_credibility: number
  is_mine: boolean
}
type Eligibility = { credibility_score: number; can_offer: boolean; unlock_at: number }

const GIG_TYPES = [
  { value: 'cv_review', label: 'CV review' },
  { value: 'referral', label: 'Referral' },
  { value: 'mentorship', label: 'Mentorship' },
  { value: 'tour', label: 'City / campus tour' },
  { value: 'advice', label: 'Advice' },
  { value: 'other', label: 'Other' },
]

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '0.5px solid var(--rule)',
  background: '#fffdf9', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

function rewardLabel(g: Gig) {
  if (g.reward_type === 'coffee') return 'For a coffee'
  if (g.reward_type === 'paid') return g.price_eur ? `€${g.price_eur}` : 'Paid'
  return 'Free'
}

export function GigsPage() {
  const [gigs, setGigs] = useState<Gig[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [gigType, setGigType] = useState('cv_review')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rewardType, setRewardType] = useState<'coffee' | 'paid' | 'free'>('coffee')
  const [priceEur, setPriceEur] = useState('')

  const load = useCallback(async () => {
    try {
      const [g, e] = await Promise.all([
        apiGet<{ gigs: Gig[] }>('/api/gigs'),
        apiGet<Eligibility>('/api/gigs/eligibility'),
      ])
      setGigs(g.gigs); setElig(e)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function createGig(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await apiPost('/api/gigs', {
        gigType, title, description: description || null, rewardType,
        priceEur: rewardType === 'paid' && priceEur ? Number(priceEur) : null,
      })
      setTitle(''); setDescription(''); setShowForm(false)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create gig') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(20px,4vw,40px)', fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Gigs</div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(28px,4vw,38px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '6px 0 0' }}>
            Help, and be helped.
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.5 }}>
            CV reviews, referrals, mentorship and tours from people the community trusts — for a coffee or a fee.
          </p>
        </div>
        {elig?.can_offer && (
          <button onClick={() => setShowForm(s => !s)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--signal)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {showForm ? 'Close' : 'Offer a gig'}
          </button>
        )}
      </div>

      {/* Eligibility banner */}
      {elig && !elig.can_offer && (
        <div style={{ marginBottom: 20, background: 'var(--paper-soft, #ede8df)', border: '0.5px solid var(--rule)', borderRadius: 12, padding: '14px 16px', fontSize: 13.5, color: 'var(--ink-muted)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>You can request gigs now. To <strong>offer</strong> gigs, reach <strong>{elig.unlock_at} credibility</strong> (Trusted) — you're at {elig.credibility_score}. Complete quests to get there.</span>
        </div>
      )}

      {error && <div style={{ marginBottom: 16, color: 'var(--signal)', fontSize: 13 }}>{error}</div>}

      {showForm && elig?.can_offer && (
        <form onSubmit={createGig} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, marginBottom: 24 }}>
          <select value={gigType} onChange={e => setGigType(e.target.value)} style={field}>
            {GIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input required placeholder="Title (e.g. I'll review your CV for a tech role)" value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <textarea placeholder="Details — what you offer, who it's for" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={rewardType} onChange={e => setRewardType(e.target.value as any)} style={{ ...field, flex: 1, minWidth: 160 }}>
              <option value="coffee">For a coffee</option>
              <option value="paid">Paid</option>
              <option value="free">Free</option>
            </select>
            {rewardType === 'paid' && (
              <input type="number" min={0} placeholder="€" value={priceEur} onChange={e => setPriceEur(e.target.value)} style={{ ...field, width: 120 }} />
            )}
          </div>
          <button type="submit" disabled={busy} style={{ justifySelf: 'start', padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--signal)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Posting…' : 'Post gig'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--ink-muted)' }}>Loading…</div>
      ) : gigs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, marginBottom: 8 }}>No open gigs yet.</div>
          <div style={{ fontSize: 13.5 }}>As members build credibility, their offers show up here.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {gigs.map(g => (
            <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{g.title}</span>
                <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--signal)' }}>{rewardLabel(g)}</span>
              </div>
              {g.description && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>{g.description}</div>}
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 8 }}>
                {g.provider_name} · {g.provider_credibility} credibility{g.is_mine ? ' · your gig' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
