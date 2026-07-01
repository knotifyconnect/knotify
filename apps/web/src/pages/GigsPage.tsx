import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Star } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { trackEvent } from '@/lib/analytics'

// ── Types (mirror /api/gigs responses) ──────────────────────────────────────
type RewardType = 'coffee' | 'paid' | 'free'
type RequestStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'

type Gig = {
  id: string
  gig_type: string
  title: string
  description: string | null
  reward_type: RewardType
  price_eur: number | null
  status: 'open' | 'closed'
  is_featured: boolean
  provider_id: string
  provider_name: string
  provider_avatar: string | null
  provider_credibility: number
  is_mine: boolean
  my_request_status: RequestStatus | null
  active_request_count: number
}

type IncomingRequest = {
  id: string
  gig_id: string
  status: RequestStatus
  message: string | null
  created_at: string
  seeker_id: string
  seeker_name: string
  seeker_avatar: string | null
}

type MyGig = Gig & { requests: IncomingRequest[] }

type OutgoingRequest = {
  id: string
  gig_id: string
  status: RequestStatus
  message: string | null
  conversation_id: string | null
  provider_id: string
  provider_name: string
  provider_avatar: string | null
  gig_title: string
  gig_type: string
  reward_type: RewardType
  price_eur: number | null
  can_review: boolean
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
const typeLabel = (v: string) => GIG_TYPES.find(t => t.value === v)?.label ?? 'Other'

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 10, border: '0.5px solid var(--rule)',
  background: '#fffdf9', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'IBM Plex Sans', sans-serif",
}

function rewardLabel(reward: RewardType, price: number | null) {
  if (reward === 'coffee') return 'For a coffee'
  if (reward === 'paid') return price ? `€${price}` : 'Paid'
  return 'Free'
}

const STATUS_TONE: Record<RequestStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: 'var(--paper-soft,#ede8df)', fg: 'var(--ink-muted)', label: 'Pending' },
  accepted: { bg: 'rgba(31,107,94,0.12)', fg: 'var(--verd,#1F6B5E)', label: 'Accepted' },
  completed: { bg: 'rgba(31,107,94,0.12)', fg: 'var(--verd,#1F6B5E)', label: 'Completed' },
  declined: { bg: 'rgba(216,68,43,0.10)', fg: 'var(--signal)', label: 'Declined' },
  cancelled: { bg: 'var(--paper-soft,#ede8df)', fg: 'var(--ink-faint)', label: 'Cancelled' },
}

function StatusChip({ status }: { status: RequestStatus }) {
  const t = STATUS_TONE[status]
  return (
    <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  )
}

const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 9, border: 'none', background: bg, color: fg,
  fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
})
const ghost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 9, border: '0.5px solid var(--rule)', background: 'transparent',
  color: 'var(--ink-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
}

export function GigsPage({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'browse' | 'requests' | 'mine'>('browse')

  const [gigs, setGigs] = useState<Gig[]>([])
  const [myGigs, setMyGigs] = useState<MyGig[]>([])
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Offer form
  const [showForm, setShowForm] = useState(false)
  const [formBusy, setFormBusy] = useState(false)
  const [gigType, setGigType] = useState('cv_review')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rewardType, setRewardType] = useState<RewardType>('coffee')
  const [priceEur, setPriceEur] = useState('')

  // Modals
  const [requestGig, setRequestGig] = useState<Gig | null>(null)
  const [reviewReq, setReviewReq] = useState<OutgoingRequest | null>(null)

  const load = useCallback(async () => {
    try {
      const [g, e, mine, out] = await Promise.all([
        apiGet<{ gigs: Gig[] }>('/api/gigs'),
        apiGet<Eligibility>('/api/gigs/eligibility'),
        apiGet<{ gigs: MyGig[] }>('/api/gigs/mine'),
        apiGet<{ requests: OutgoingRequest[] }>('/api/gigs/requests/outgoing'),
      ])
      setGigs(g.gigs); setElig(e); setMyGigs(mine.gigs); setOutgoing(out.requests)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function createGig(e: React.FormEvent) {
    e.preventDefault()
    setFormBusy(true); setError(null)
    try {
      await apiPost('/api/gigs', {
        gigType, title, description: description || null, rewardType,
        priceEur: rewardType === 'paid' && priceEur ? Number(priceEur) : null,
      })
      trackEvent('gig_created', { gig_type: gigType, reward_type: rewardType })
      setTitle(''); setDescription(''); setPriceEur(''); setShowForm(false)
      await load()
      setTab('mine')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create gig') }
    finally { setFormBusy(false) }
  }

  async function submitRequest(message: string) {
    if (!requestGig) return
    setBusyId(requestGig.id); setError(null)
    try {
      await apiPost(`/api/gigs/${requestGig.id}/request`, { message: message || null })
      trackEvent('gig_requested')
      setRequestGig(null)
      await load()
      setTab('requests')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send request') }
    finally { setBusyId(null) }
  }

  async function actOnRequest(id: string, action: 'accept' | 'decline' | 'complete' | 'cancel') {
    setBusyId(id); setError(null)
    try {
      await apiPatch(`/api/gigs/requests/${id}`, { action })
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
    finally { setBusyId(null) }
  }

  async function submitReview(rating: number, comment: string) {
    if (!reviewReq) return
    setBusyId(reviewReq.id); setError(null)
    try {
      await apiPost(`/api/gigs/requests/${reviewReq.id}/review`, { rating, comment: comment || null })
      setReviewReq(null)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit review') }
    finally { setBusyId(null) }
  }

  async function closeReopen(g: MyGig) {
    setBusyId(g.id)
    try { await apiPatch(`/api/gigs/${g.id}`, { status: g.status === 'open' ? 'closed' : 'open' }); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setBusyId(null) }
  }
  async function deleteGig(g: MyGig) {
    if (!window.confirm('Delete this gig? Open requests will be removed.')) return
    setBusyId(g.id)
    try { await apiDelete(`/api/gigs/${g.id}`); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setBusyId(null) }
  }

  const openChat = (userId: string) => navigate(`/messages?to=${userId}`)

  const pendingIncoming = myGigs.reduce((n, g) => n + g.requests.filter(r => r.status === 'pending').length, 0)

  const TABS: Array<{ key: typeof tab; label: string; count?: number }> = [
    { key: 'browse', label: 'Browse' },
    { key: 'requests', label: 'My requests', count: outgoing.filter(r => ['pending', 'accepted'].includes(r.status)).length || undefined },
    { key: 'mine', label: 'My gigs', count: pendingIncoming || undefined },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: embedded ? '24px 0 96px' : 'clamp(16px,4vw,40px) clamp(14px,4vw,40px) 96px', fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Gigs</div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px,4vw,38px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '6px 0 0' }}>
            Help, and be helped.
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.5 }}>
            CV reviews, referrals, mentorship and tours from people the community trusts, for a coffee or a fee.
          </p>
        </div>
        {elig?.can_offer && (
          <button onClick={() => setShowForm(s => !s)} style={btn('var(--signal)')}>
            {showForm ? 'Close' : 'Offer a gig'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            border: tab === t.key ? '0.5px solid var(--ink)' : '0.5px solid var(--rule)',
            background: tab === t.key ? 'var(--ink)' : 'transparent',
            color: tab === t.key ? 'var(--paper)' : 'var(--ink-muted)',
          }}>
            {t.label}{t.count ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {elig && !elig.can_offer && tab === 'browse' && (
        <div style={{ marginBottom: 18, background: 'var(--paper-soft,#ede8df)', border: '0.5px solid var(--rule)', borderRadius: 12, padding: '14px 16px', fontSize: 13.5, color: 'var(--ink-muted)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>You can request gigs now. To <strong>offer</strong> gigs, reach <strong>{elig.unlock_at} credibility</strong> (Trusted). You're at {elig.credibility_score}. Complete quests to get there.</span>
        </div>
      )}

      {error && <div style={{ marginBottom: 14, color: 'var(--signal)', fontSize: 13 }}>{error}</div>}

      {showForm && elig?.can_offer && (
        <form onSubmit={createGig} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 16, padding: 20, display: 'grid', gap: 12, marginBottom: 24 }}>
          <select value={gigType} onChange={e => setGigType(e.target.value)} style={field}>
            {GIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input required placeholder="Title (e.g. I'll review your CV for a tech role)" value={title} onChange={e => setTitle(e.target.value)} style={field} />
          <textarea placeholder="Details: what you offer, who it's for" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={rewardType} onChange={e => setRewardType(e.target.value as RewardType)} style={{ ...field, flex: 1, minWidth: 160 }}>
              <option value="coffee">For a coffee</option>
              <option value="paid">Paid</option>
              <option value="free">Free</option>
            </select>
            {rewardType === 'paid' && (
              <input type="number" min={0} placeholder="€" value={priceEur} onChange={e => setPriceEur(e.target.value)} style={{ ...field, width: 120 }} />
            )}
          </div>
          <button type="submit" disabled={formBusy} style={{ ...btn('var(--signal)'), justifySelf: 'start', opacity: formBusy ? 0.6 : 1 }}>
            {formBusy ? 'Posting…' : 'Post gig'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--ink-muted)' }}>Loading…</div>
      ) : tab === 'browse' ? (
        <BrowseTab gigs={gigs} busyId={busyId} onRequest={setRequestGig} />
      ) : tab === 'requests' ? (
        <RequestsTab
          requests={outgoing} busyId={busyId}
          onCancel={(id) => actOnRequest(id, 'cancel')}
          onComplete={(id) => actOnRequest(id, 'complete')}
          onReview={setReviewReq}
          onChat={openChat}
        />
      ) : (
        <MyGigsTab
          gigs={myGigs} busyId={busyId}
          onAccept={(id) => actOnRequest(id, 'accept')}
          onDecline={(id) => actOnRequest(id, 'decline')}
          onComplete={(id) => actOnRequest(id, 'complete')}
          onChat={openChat}
          onCloseReopen={closeReopen}
          onDelete={deleteGig}
          canOffer={!!elig?.can_offer}
          onOffer={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        />
      )}

      {requestGig && (
        <RequestModal gig={requestGig} busy={busyId === requestGig.id} onClose={() => setRequestGig(null)} onSubmit={submitRequest} />
      )}
      {reviewReq && (
        <ReviewModal req={reviewReq} busy={busyId === reviewReq.id} onClose={() => setReviewReq(null)} onSubmit={submitReview} />
      )}
    </div>
  )
}

// ── Browse ──────────────────────────────────────────────────────────────────
function BrowseTab({ gigs, busyId, onRequest }: { gigs: Gig[]; busyId: string | null; onRequest: (g: Gig) => void }) {
  if (gigs.length === 0) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, marginBottom: 8 }}>No open gigs yet.</div>
      <div style={{ fontSize: 13.5 }}>As members build credibility, their offers show up here.</div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {gigs.map(g => (
        <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {g.is_featured && <span style={{ color: 'var(--ochre,#b8820f)', marginRight: 6 }}>★</span>}{g.title}
            </span>
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--signal)' }}>{rewardLabel(g.reward_type, g.price_eur)}</span>
          </div>
          {g.description && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>{g.description}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
              {typeLabel(g.gig_type)} · {g.provider_name} · {g.provider_credibility} credibility
            </div>
            {g.is_mine ? (
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Your gig</span>
            ) : g.my_request_status === 'pending' || g.my_request_status === 'accepted' ? (
              <StatusChip status={g.my_request_status} />
            ) : (
              <button disabled={busyId === g.id} onClick={() => onRequest(g)} style={{ ...btn('var(--signal)'), opacity: busyId === g.id ? 0.6 : 1 }}>
                {g.my_request_status === 'completed' ? 'Request again' : 'Request'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── My requests (outgoing) ──────────────────────────────────────────────────
function RequestsTab({ requests, busyId, onCancel, onComplete, onReview, onChat }: {
  requests: OutgoingRequest[]; busyId: string | null
  onCancel: (id: string) => void; onComplete: (id: string) => void
  onReview: (r: OutgoingRequest) => void; onChat: (userId: string) => void
}) {
  if (requests.length === 0) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, marginBottom: 8 }}>No requests yet.</div>
      <div style={{ fontSize: 13.5 }}>Browse gigs and request one to start a conversation.</div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {requests.map(r => (
        <div key={r.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{r.gig_title}</span>
            <StatusChip status={r.status} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>
            {typeLabel(r.gig_type)} · {r.provider_name} · {rewardLabel(r.reward_type, r.price_eur)}
          </div>
          {r.message && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 8, lineHeight: 1.5 }}>“{r.message}”</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {r.conversation_id && <button style={ghost} onClick={() => onChat(r.provider_id)}>Open chat</button>}
            {r.status === 'accepted' && <button disabled={busyId === r.id} style={btn('var(--verd,#1F6B5E)')} onClick={() => onComplete(r.id)}>Mark complete</button>}
            {(r.status === 'pending' || r.status === 'accepted') && <button disabled={busyId === r.id} style={ghost} onClick={() => onCancel(r.id)}>Cancel</button>}
            {r.can_review && <button style={btn('var(--ochre,#b8820f)')} onClick={() => onReview(r)}>Leave review</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── My gigs (provider) ──────────────────────────────────────────────────────
function MyGigsTab({ gigs, busyId, onAccept, onDecline, onComplete, onChat, onCloseReopen, onDelete, canOffer, onOffer }: {
  gigs: MyGig[]; busyId: string | null
  onAccept: (id: string) => void; onDecline: (id: string) => void; onComplete: (id: string) => void
  onChat: (userId: string) => void; onCloseReopen: (g: MyGig) => void; onDelete: (g: MyGig) => void
  canOffer: boolean; onOffer: () => void
}) {
  if (gigs.length === 0) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-faint)' }}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 20, marginBottom: 8 }}>You haven't offered any gigs.</div>
      {canOffer
        ? <button style={{ ...btn('var(--signal)'), marginTop: 6 }} onClick={onOffer}>Offer a gig</button>
        : <div style={{ fontSize: 13.5 }}>Reach Trusted credibility to start offering.</div>}
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {gigs.map(g => {
        const active = g.requests.filter(r => ['pending', 'accepted'].includes(r.status))
        return (
          <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>
                {g.is_featured && <span style={{ color: 'var(--ochre,#b8820f)', marginRight: 6 }}>★</span>}{g.title}
              </span>
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: g.status === 'open' ? 'var(--signal)' : 'var(--ink-faint)' }}>
                {g.status === 'open' ? rewardLabel(g.reward_type, g.price_eur) : 'Closed'}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>
              {typeLabel(g.gig_type)} · {active.length} active request{active.length === 1 ? '' : 's'}
            </div>

            {/* Incoming requests */}
            {g.requests.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--rule)' }}>
                {g.requests.map(r => (
                  <div key={r.id} style={{ background: 'var(--paper-soft,#f6f1e9)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.seeker_name}</span>
                      <StatusChip status={r.status} />
                    </div>
                    {r.message && <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 5, lineHeight: 1.45 }}>“{r.message}”</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button style={ghost} onClick={() => onChat(r.seeker_id)}>Open chat</button>
                      {r.status === 'pending' && <>
                        <button disabled={busyId === r.id} style={btn('var(--verd,#1F6B5E)')} onClick={() => onAccept(r.id)}>Accept</button>
                        <button disabled={busyId === r.id} style={ghost} onClick={() => onDecline(r.id)}>Decline</button>
                      </>}
                      {r.status === 'accepted' && <button disabled={busyId === r.id} style={btn('var(--verd,#1F6B5E)')} onClick={() => onComplete(r.id)}>Mark complete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button disabled={busyId === g.id} style={ghost} onClick={() => onCloseReopen(g)}>{g.status === 'open' ? 'Close gig' : 'Reopen'}</button>
              <button disabled={busyId === g.id} style={{ ...ghost, color: 'var(--signal)' }} onClick={() => onDelete(g)}>Delete</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Modals ──────────────────────────────────────────────────────────────────
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(26,24,21,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--paper,#fff)', width: '100%', maxWidth: 460, borderRadius: 20, padding: '24px 22px', boxShadow: '0 8px 48px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function RequestModal({ gig, busy, onClose, onSubmit }: { gig: Gig; busy: boolean; onClose: () => void; onSubmit: (msg: string) => void }) {
  const [msg, setMsg] = useState('')
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, marginBottom: 4 }}>Request this gig</div>
      <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 14 }}>
        {gig.title} · {gig.provider_name} · {rewardLabel(gig.reward_type, gig.price_eur)}
      </div>
      <textarea autoFocus placeholder="Add a short note: what you need and when (optional)" value={msg} onChange={e => setMsg(e.target.value)} rows={4} style={{ ...field, resize: 'vertical' }} />
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '8px 0 14px' }}>This opens a chat with {gig.provider_name} so you can coordinate.</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={ghost} onClick={onClose}>Cancel</button>
        <button disabled={busy} style={{ ...btn('var(--signal)'), opacity: busy ? 0.6 : 1 }} onClick={() => onSubmit(msg)}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </ModalShell>
  )
}

function ReviewModal({ req, busy, onClose, onSubmit }: { req: OutgoingRequest; busy: boolean; onClose: () => void; onSubmit: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 20, marginBottom: 4 }}>Review {req.provider_name}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 14 }}>{req.gig_title}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setRating(n)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2 }} aria-label={`${n} star`}>
            <Star size={28} fill={n <= rating ? 'var(--ochre,#b8820f)' : 'none'} color={n <= rating ? 'var(--ochre,#b8820f)' : 'var(--ink-faint)'} />
          </button>
        ))}
      </div>
      <textarea placeholder="How was it? (optional)" value={comment} onChange={e => setComment(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
        <button style={ghost} onClick={onClose}>Cancel</button>
        <button disabled={busy} style={{ ...btn('var(--ochre,#b8820f)'), opacity: busy ? 0.6 : 1 }} onClick={() => onSubmit(rating, comment)}>{busy ? 'Saving…' : 'Submit review'}</button>
      </div>
    </ModalShell>
  )
}
