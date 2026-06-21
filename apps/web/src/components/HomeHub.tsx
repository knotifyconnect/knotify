import { useEffect, useState, useCallback } from 'react'
import { CalendarDays, HandHeart, Trophy, Check, Plus, MapPin, Users, Lock } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'

// ── Types ───────────────────────────────────────────────────────────────────
type Quest = {
  key: string; title: string; description: string; points: number
  category: string; type: 'verified' | 'self'; icon: string
  progress?: number; target?: number; status: 'completed' | 'claimable' | 'locked'
}
type QuestsResp = {
  credibility_score: number; tier: string
  next_tier: { name: string; at: number } | null
  gig_unlocked: boolean; gig_unlock_at: number; quests: Quest[]
}
type EventItem = {
  id: string; title: string; description: string | null; location: string | null
  starts_at: string; host_name: string; is_host: boolean; rsvp_count: number; rsvped: boolean
  source: string; url: string | null
}
type Gig = {
  id: string; gig_type: string; title: string; description: string | null
  reward_type: 'coffee' | 'paid' | 'free'; price_eur: number | null
  provider_name: string; provider_credibility: number; is_mine: boolean
}
type Eligibility = { credibility_score: number; can_offer: boolean; unlock_at: number }

// ── Helpers ─────────────────────────────────────────────────────────────────
function whenLabel(iso: string) {
  const d = new Date(iso); const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  if (tomorrow) return `Tomorrow, ${time}`
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + `, ${time}`
}
function rewardLabel(g: Gig) {
  if (g.reward_type === 'coffee') return 'For a coffee'
  if (g.reward_type === 'paid') return g.price_eur ? `€${g.price_eur}` : 'Paid'
  return 'Free'
}
function prevFloor(score: number, nextAt: number) {
  const floors = [0, 30, 70, 120]; let f = 0
  for (const x of floors) if (x <= score && x < nextAt) f = x
  return f
}

const sectionHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14,
}
const sectionTitle: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)',
}
const linkBtn: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 12.5, color: 'var(--signal)', fontWeight: 600, cursor: 'pointer',
  background: 'none', border: 'none', fontFamily: "'IBM Plex Sans', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 4,
}
const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '0.5px solid var(--rule)',
  background: '#fffdf9', fontSize: 13.5, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'IBM Plex Sans', sans-serif",
}
const smallBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--signal)', color: '#fff',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
}

export function HomeHub() {
  const [quests, setQuests] = useState<QuestsResp | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  const loadQuests = useCallback(() => { apiGet<QuestsResp>('/api/quests').then(setQuests).catch(() => {}) }, [])
  const loadEvents = useCallback(() => { apiGet<{ events: EventItem[] }>('/api/events?limit=6').then(r => setEvents(r.events)).catch(() => {}) }, [])
  const loadGigs = useCallback(() => { apiGet<{ gigs: Gig[] }>('/api/gigs?limit=6').then(r => setGigs(r.gigs)).catch(() => {}) }, [])

  useEffect(() => {
    loadQuests(); loadEvents(); loadGigs()
    apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {})
  }, [loadQuests, loadEvents, loadGigs])

  async function claim(q: Quest) {
    if (q.type === 'self') {
      if (!window.confirm('On your honour, did you really do this? Credibility on knotify is built on trust.')) return
    }
    setClaiming(q.key)
    try { await apiPost(`/api/quests/${q.key}/claim`, {}); loadQuests() }
    finally { setClaiming(null) }
  }

  async function toggleRsvp(id: string) {
    setEvents(evs => evs.map(e => e.id === id ? { ...e, rsvped: !e.rsvped, rsvp_count: e.rsvp_count + (e.rsvped ? -1 : 1) } : e))
    try { await apiPost(`/api/events/${id}/rsvp`, {}) } catch { loadEvents() }
  }

  const score = quests?.credibility_score ?? 0
  const next = quests?.next_tier ?? null
  const floor = next ? prevFloor(score, next.at) : score
  const pct = next ? Math.min(100, Math.round(((score - floor) / (next.at - floor)) * 100)) : 100

  const claimable = (quests?.quests ?? []).filter(q => q.status === 'claimable')
  const completed = (quests?.quests ?? []).filter(q => q.status === 'completed')
  const questDeck = [...claimable, ...completed].slice(0, 8)

  return (
    <div style={{ marginBottom: 36, display: 'grid', gap: 30 }}>

      {/* ── Credibility hero + quests ─────────────────────────────────────── */}
      <div>
        <div style={{
          background: 'linear-gradient(135deg, var(--ink) 0%, #2a211a 100%)', color: 'var(--paper)',
          borderRadius: 20, padding: 'clamp(20px, 3vw, 26px)', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(216,68,43,0.25), transparent 70%)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.6)' }}>Your credibility</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 48, lineHeight: 1 }}>{score}</span>
                <span style={{ fontSize: 15, color: 'var(--signal)', fontWeight: 600 }}>{quests?.tier ?? 'Newcomer'}</span>
              </div>
            </div>
            <div style={{
              padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: quests?.gig_unlocked ? 'rgba(45,125,70,0.3)' : 'rgba(245,240,232,0.12)',
              color: quests?.gig_unlocked ? '#8fe0ab' : 'rgba(245,240,232,0.7)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {!quests?.gig_unlocked && <Lock size={12} />}
              {quests?.gig_unlocked ? 'Gigs unlocked' : `Offer gigs at ${quests?.gig_unlock_at ?? 70}`}
            </div>
          </div>
          <div style={{ marginTop: 18, position: 'relative' }}>
            <div style={{ height: 7, borderRadius: 999, background: 'rgba(245,240,232,0.14)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--signal)', transition: 'width 0.4s' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'rgba(245,240,232,0.7)' }}>
              {next ? `${next.at - score} points to ${next.name}` : 'Top tier reached. You are a Pillar of the community.'}
            </div>
          </div>
        </div>

        {/* Quest deck (horizontal, game-like, claim inline) */}
        <div style={{ ...sectionHead, marginTop: 20 }}>
          <Trophy size={18} color="var(--signal)" />
          <span style={sectionTitle}>Side quests</span>
          {claimable.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--verd, #1f6b5e)', fontWeight: 600 }}>{claimable.length} ready</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'thin' }}>
          {questDeck.map(q => {
            const done = q.status === 'completed'
            return (
              <div key={q.key} style={{
                flex: '0 0 200px', background: 'white', border: `0.5px solid ${done ? 'var(--rule)' : 'var(--signal)'}`,
                borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                opacity: done ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
                    background: done ? 'var(--verd-soft, rgba(31,107,94,0.12))' : 'var(--paper-soft, #ede8df)',
                    color: done ? 'var(--verd, #1f6b5e)' : 'var(--ink-muted)',
                  }}>
                    {done ? <Check size={18} /> : <QuestIcon name={q.icon} size={18} />}
                  </div>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, color: 'var(--signal)' }}>+{q.points}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{q.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.4 }}>{q.description}</div>
                </div>
                {done ? (
                  <span style={{ fontSize: 12, color: 'var(--verd, #1f6b5e)', fontWeight: 600 }}>Completed</span>
                ) : (
                  <button onClick={() => claim(q)} disabled={claiming === q.key} style={{ ...smallBtn, padding: '8px 0' }}>
                    {claiming === q.key ? '...' : q.type === 'self' ? 'Mark done' : 'Claim'}
                  </button>
                )}
              </div>
            )
          })}
          {questDeck.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No quests right now. Check back soon.</div>
          )}
        </div>
      </div>

      {/* ── Events (RSVP + host inline) ───────────────────────────────────── */}
      <EventsSection events={events} onRsvp={toggleRsvp} onCreated={loadEvents} />

      {/* ── Gigs (browse + offer inline) ──────────────────────────────────── */}
      <GigsSection gigs={gigs} elig={elig} onCreated={() => { loadGigs(); apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {}) }} rewardLabel={rewardLabel} />
    </div>
  )
}

// ── Events section ──────────────────────────────────────────────────────────
function EventsSection({ events, onRsvp, onCreated }: { events: EventItem[]; onRsvp: (id: string) => void; onCreated: () => void }) {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: '', startsAt: '', location: '', description: '' })

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await apiPost('/api/events', { title: f.title, startsAt: new Date(f.startsAt).toISOString(), location: f.location || null, description: f.description || null })
      setF({ title: '', startsAt: '', location: '', description: '' }); setShow(false); onCreated()
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={sectionHead}>
        <CalendarDays size={18} color="var(--signal)" />
        <span style={sectionTitle}>What is happening</span>
        <button style={linkBtn} onClick={() => setShow(s => !s)}><Plus size={14} /> {show ? 'Cancel' : 'Host an event'}</button>
      </div>

      {show && (
        <form onSubmit={create} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: 16, display: 'grid', gap: 10, marginBottom: 14 }}>
          <input required placeholder="Event title" style={field} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input required type="datetime-local" style={{ ...field, flex: 1, minWidth: 170 }} value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })} />
            <input placeholder="Location" style={{ ...field, flex: 1, minWidth: 170 }} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          </div>
          <input placeholder="What is it about?" style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <button type="submit" disabled={busy} style={{ ...smallBtn, justifySelf: 'start' }}>{busy ? 'Creating...' : 'Create event'}</button>
        </form>
      )}

      {events.length === 0 ? (
        <div style={{ background: 'var(--paper-soft, #ede8df)', borderRadius: 14, padding: 24, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>
          No events yet. Be the first to bring people together.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {events.map(e => (
            <div key={e.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--signal)', fontWeight: 600 }}>{whenLabel(e.starts_at)}</div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{e.title}</div>
              {e.description && <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{e.description}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--ink-faint)', flexWrap: 'wrap' }}>
                {e.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {e.location}</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {e.rsvp_count} going</span>
                <span>{e.source === 'curated' ? e.host_name : `by ${e.host_name}`}</span>
              </div>
              <button
                onClick={() => onRsvp(e.id)}
                disabled={e.is_host}
                style={{
                  marginTop: 2, alignSelf: 'flex-start', padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  cursor: e.is_host ? 'default' : 'pointer',
                  border: `0.5px solid ${e.rsvped ? 'var(--verd, #1f6b5e)' : 'var(--rule)'}`,
                  background: e.rsvped ? 'var(--verd-soft, rgba(31,107,94,0.12))' : 'transparent',
                  color: e.is_host ? 'var(--ink-faint)' : e.rsvped ? 'var(--verd, #1f6b5e)' : 'var(--ink-muted)',
                }}
              >
                {e.is_host ? 'You are hosting' : e.rsvped ? 'Going' : 'RSVP'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gigs section ────────────────────────────────────────────────────────────
const GIG_TYPES = [
  { value: 'cv_review', label: 'CV review' }, { value: 'referral', label: 'Referral' },
  { value: 'mentorship', label: 'Mentorship' }, { value: 'tour', label: 'City / campus tour' },
  { value: 'advice', label: 'Advice' }, { value: 'other', label: 'Other' },
]
function GigsSection({ gigs, elig, onCreated, rewardLabel }: { gigs: Gig[]; elig: Eligibility | null; onCreated: () => void; rewardLabel: (g: Gig) => string }) {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ gigType: 'cv_review', title: '', description: '', rewardType: 'coffee', priceEur: '' })

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await apiPost('/api/gigs', { ...f, priceEur: f.rewardType === 'paid' && f.priceEur ? Number(f.priceEur) : null })
      setF({ gigType: 'cv_review', title: '', description: '', rewardType: 'coffee', priceEur: '' }); setShow(false); onCreated()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={sectionHead}>
        <HandHeart size={18} color="var(--signal)" />
        <span style={sectionTitle}>Help, and be helped</span>
        {elig?.can_offer && (
          <button style={linkBtn} onClick={() => setShow(s => !s)}><Plus size={14} /> {show ? 'Cancel' : 'Offer a gig'}</button>
        )}
      </div>

      {elig && !elig.can_offer && (
        <div style={{ background: 'var(--paper-soft, #ede8df)', border: '0.5px solid var(--rule)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <Lock size={15} style={{ flexShrink: 0 }} />
          <span>Reach {elig.unlock_at} credibility (Trusted) to offer gigs. You are at {elig.credibility_score}. Browse what others offer below.</span>
        </div>
      )}

      {show && elig?.can_offer && (
        <form onSubmit={create} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: 16, display: 'grid', gap: 10, marginBottom: 14 }}>
          <select style={field} value={f.gigType} onChange={e => setF({ ...f, gigType: e.target.value })}>
            {GIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input required placeholder="Title (e.g. I will review your CV for a tech role)" style={field} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <input placeholder="Details, who it is for" style={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select style={{ ...field, flex: 1, minWidth: 150 }} value={f.rewardType} onChange={e => setF({ ...f, rewardType: e.target.value })}>
              <option value="coffee">For a coffee</option><option value="paid">Paid</option><option value="free">Free</option>
            </select>
            {f.rewardType === 'paid' && <input type="number" min={0} placeholder="€" style={{ ...field, width: 110 }} value={f.priceEur} onChange={e => setF({ ...f, priceEur: e.target.value })} />}
          </div>
          {err && <div style={{ color: 'var(--signal)', fontSize: 12.5 }}>{err}</div>}
          <button type="submit" disabled={busy} style={{ ...smallBtn, justifySelf: 'start' }}>{busy ? 'Posting...' : 'Post gig'}</button>
        </form>
      )}

      {gigs.length === 0 ? (
        <div style={{ background: 'var(--paper-soft, #ede8df)', borderRadius: 14, padding: 24, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>
          No open gigs yet. As members earn credibility, their offers appear here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {gigs.map(g => (
            <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--rule)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{g.title}</span>
                <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--signal)' }}>{rewardLabel(g)}</span>
              </div>
              {g.description && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.45 }}>{g.description}</div>}
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 8 }}>
                {g.provider_name}, {g.provider_credibility} credibility{g.is_mine ? ', your gig' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
