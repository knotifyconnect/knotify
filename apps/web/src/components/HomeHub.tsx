import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Plus, MapPin, Users, Lock, ChevronRight } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'
import { useNavigate } from 'react-router-dom'

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

// ── Design tokens shorthand ──────────────────────────────────────────────────
const T = {
  paper: '#F4EFE6', paperDeep: '#EBE4D6', paperSoft: '#FAF6EE',
  ink: '#1A1815', inkSoft: '#3A352D', inkMuted: '#6B6358', inkFaint: '#A29A8C',
  rule: '#D9D1BF', ruleSoft: '#E5DCC8',
  signal: '#D8442B', signalDeep: '#A8331F', signalSoft: '#F4D7CD',
  verd: '#1F6B5E', verdSoft: '#C8DDD7',
  ochre: '#C8941F', ochreSoft: '#F0E0B5',
  plum: '#5C2A4F', plumSoft: '#E5D2DD',
  display: "'Fraunces', Georgia, serif",
  text: "'IBM Plex Sans', system-ui, sans-serif",
}

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
  if (g.reward_type === 'coffee') return 'Coffee'
  if (g.reward_type === 'paid') return g.price_eur ? `€${g.price_eur}` : 'Paid'
  return 'Free'
}
function prevFloor(score: number, nextAt: number) {
  const floors = [0, 30, 70, 120]; let f = 0
  for (const x of floors) if (x <= score && x < nextAt) f = x
  return f
}

// ── Shared primitives ────────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontFamily: T.text }}>
      <span>{children}</span>{right}
    </div>
  )
}
function Chip({ children, color = 'paper' }: { children: React.ReactNode; color?: 'paper' | 'signal' | 'verd' | 'ochre' | 'plum' }) {
  const map = {
    paper: { bg: T.paperDeep, fg: T.inkSoft, bd: T.rule },
    signal: { bg: T.signalSoft, fg: T.signalDeep, bd: T.signal },
    verd: { bg: T.verdSoft, fg: T.verd, bd: T.verd },
    ochre: { bg: T.ochreSoft, fg: '#7A5A0F', bd: T.ochre },
    plum: { bg: T.plumSoft, fg: T.plum, bd: T.plum },
  }
  const c = map[color]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: c.bg, color: c.fg, border: `0.5px solid ${c.bd}`, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', fontFamily: T.text }}>
      {children}
    </span>
  )
}
function CredRing({ score }: { score: number }) {
  const size = 60; const r = (size - 6) / 2; const circ = 2 * Math.PI * r; const pct = Math.min(score / 120, 1)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.ochre} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: 20, fontWeight: 500, color: T.paperSoft }}>{score}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `0.5px solid ${T.rule}`,
  background: T.paperSoft, fontSize: 13, color: T.ink, outline: 'none', boxSizing: 'border-box', fontFamily: T.text,
}
const GIG_TYPES = [
  { value: 'cv_review', label: 'CV review' }, { value: 'referral', label: 'Referral' },
  { value: 'mentorship', label: 'Mentorship' }, { value: 'tour', label: 'City / campus tour' },
  { value: 'advice', label: 'Advice' }, { value: 'other', label: 'Other' },
]

// ── Main component ───────────────────────────────────────────────────────────
export function HomeHub() {
  const navigate = useNavigate()
  const [quests, setQuests] = useState<QuestsResp | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'events' | 'quests' | 'gigs'>('all')

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

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

      {/* ── Credibility + quests row ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, marginBottom: 20 }}>

        {/* Credibility dark card */}
        <div style={{ padding: 22, borderRadius: 18, background: T.ink, color: T.paperSoft, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, rgba(216,68,43,0.3) 0%, transparent 70%)` }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(250,246,238,0.55)', fontFamily: T.text, marginBottom: 6 }}>Your credibility</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CredRing score={score} />
                <div>
                  <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.1 }}>{quests?.tier ?? 'Newcomer'}</div>
                  <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.5)', marginTop: 3, fontFamily: T.text }}>
                    {claimable.length > 0 ? `${claimable.length} quest${claimable.length > 1 ? 's' : ''} ready` : 'Keep going'}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: quests?.gig_unlocked ? 'rgba(31,107,94,0.35)' : 'rgba(250,246,238,0.1)', color: quests?.gig_unlocked ? '#8fe0ab' : 'rgba(250,246,238,0.55)', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: T.text, flexShrink: 0 }}>
              {!quests?.gig_unlocked && <Lock size={10} />}
              {quests?.gig_unlocked ? 'Gigs unlocked' : `Gigs at ${quests?.gig_unlock_at ?? 70}`}
            </div>
          </div>
          {next && (
            <div style={{ marginTop: 16, position: 'relative' }}>
              <div style={{ height: 5, borderRadius: 999, background: 'rgba(250,246,238,0.1)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: T.ochre, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(250,246,238,0.55)', fontFamily: T.text }}>
                {next.at - score} pts to {next.name}
              </div>
            </div>
          )}
        </div>

        {/* Side quests ochre card */}
        <div style={{ padding: 22, borderRadius: 18, background: T.ochreSoft, border: `0.5px solid ${T.ochre}` }}>
          <SectionLabel right={<button onClick={() => navigate('/quests')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.ochre, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>All <ChevronRight size={11} /></button>}>Side quests</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {claimable.slice(0, 3).map((q, i) => (
              <motion.div key={q.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < Math.min(claimable.length, 3) - 1 ? `0.5px solid rgba(200,148,31,0.3)` : 'none' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${T.ochre}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ochre }}>
                    <QuestIcon name={q.icon} size={12} />
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: '#6A4E12', lineHeight: 1.35 }}>{q.title}</div>
                  <button onClick={() => claim(q)} disabled={claiming === q.key} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 999, border: 'none', background: T.ochre, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>
                    {claiming === q.key ? '...' : `+${q.points}`}
                  </button>
                </div>
              </motion.div>
            ))}
            {claimable.length === 0 && (
              <div style={{ fontSize: 13, color: '#9A7020', fontStyle: 'italic', fontFamily: T.display, padding: '8px 0' }}>
                Complete quests to earn credibility.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── "For you" section with filter chips ──────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, fontFamily: T.text, marginRight: 4 }}>For you</span>
          {(['all', 'events', 'quests', 'gigs'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} style={{ padding: '5px 12px', borderRadius: 999, border: `0.5px solid ${activeFilter === f ? T.ink : T.rule}`, background: activeFilter === f ? T.ink : 'transparent', color: activeFilter === f ? T.paperSoft : T.inkSoft, fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: T.text, transition: 'all 0.15s' }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate('/events')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.signal, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>See all <ChevronRight size={11} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
          <AnimatePresence mode="popLayout">

            {/* Events */}
            {(activeFilter === 'all' || activeFilter === 'events') && events.slice(0, activeFilter === 'all' ? 3 : 6).map((e, i) => (
              <EventCard key={`ev-${e.id}`} event={e} onRsvp={toggleRsvp} index={i} />
            ))}

            {/* Claimable quests */}
            {(activeFilter === 'all' || activeFilter === 'quests') && claimable.slice(0, activeFilter === 'all' ? 2 : 6).map((q, i) => (
              <QuestCard key={`q-${q.key}`} quest={q} onClaim={claim} busy={claiming === q.key} index={i} />
            ))}

            {/* Gigs */}
            {(activeFilter === 'all' || activeFilter === 'gigs') && gigs.slice(0, activeFilter === 'all' ? 2 : 6).map((g, i) => (
              <GigCard key={`g-${g.id}`} gig={g} index={i} />
            ))}

          </AnimatePresence>
        </div>

        {events.length === 0 && claimable.length === 0 && gigs.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 14, border: `0.5px solid ${T.rule}`, background: T.paperSoft }}>
            <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 18, color: T.inkMuted }}>Nothing here yet.</div>
            <div style={{ fontSize: 13, color: T.inkFaint, marginTop: 6, fontFamily: T.text }}>Events, quests and gigs will show up as they are added.</div>
          </div>
        )}
      </div>

      {/* ── Host event / Offer gig inline ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12, marginTop: 20 }}>
        <CreateEventInline onCreated={loadEvents} />
        {elig?.can_offer && <CreateGigInline elig={elig} onCreated={() => { loadGigs(); apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {}) }} />}
        {elig && !elig.can_offer && (
          <div style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Lock size={16} color={T.inkFaint} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: T.text }}>Offer gigs at {elig.unlock_at} credibility</div>
              <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2, fontFamily: T.text }}>You are at {elig.credibility_score}. Browse offers below or earn more through quests.</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Gig browse ───────────────────────────────────────────────────── */}
      {gigs.length > 0 && (activeFilter === 'all' || activeFilter === 'gigs') && (
        <div style={{ marginTop: 20 }}>
          <SectionLabel right={<button onClick={() => navigate('/gigs')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.signal, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>See all <ChevronRight size={11} /></button>}>Help, and be helped</SectionLabel>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            {gigs.map((g, i) => <GigCard key={g.id} gig={g} index={i} />)}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ── Card components ──────────────────────────────────────────────────────────
function EventCard({ event: e, onRsvp, index }: { event: EventItem; onRsvp: (id: string) => void; index: number }) {
  const colors: Array<'signal' | 'verd' | 'ochre' | 'plum'> = ['signal', 'verd', 'ochre', 'plum']
  const color = colors[index % colors.length]
  const gradients = { signal: `linear-gradient(135deg, ${T.signalSoft} 0%, ${T.paperDeep} 100%)`, verd: `linear-gradient(135deg, ${T.verdSoft} 0%, ${T.paperDeep} 100%)`, ochre: `linear-gradient(135deg, ${T.ochreSoft} 0%, ${T.paperDeep} 100%)`, plum: `linear-gradient(135deg, ${T.plumSoft} 0%, ${T.paperDeep} 100%)` }
  return (
    <motion.div key={e.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ borderRadius: 14, overflow: 'hidden', background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 72, background: gradients[color], position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '10px 14px' }}>
        <Chip color={color}>Event</Chip>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontSize: 11.5, color: T.signal, fontWeight: 600, fontFamily: T.text }}>{whenLabel(e.starts_at)}</div>
        <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 500, letterSpacing: -0.2, color: T.ink }}>{e.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: T.inkFaint, flexWrap: 'wrap', fontFamily: T.text }}>
          {e.location && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{e.location}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={11} />{e.rsvp_count}</span>
        </div>
        <button onClick={() => onRsvp(e.id)} disabled={e.is_host} style={{ marginTop: 4, padding: '8px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer', border: `0.5px solid ${e.rsvped ? T.verd : T.rule}`, background: e.rsvped ? T.verdSoft : 'transparent', color: e.is_host ? T.inkFaint : e.rsvped ? T.verd : T.inkSoft, alignSelf: 'flex-start', fontFamily: T.text, transition: 'all 0.15s' }}>
          {e.is_host ? 'You are hosting' : e.rsvped ? 'Going' : 'RSVP'}
        </button>
      </div>
    </motion.div>
  )
}

function QuestCard({ quest: q, onClaim, busy, index }: { quest: Quest; onClaim: (q: Quest) => void; busy: boolean; index: number }) {
  return (
    <motion.div key={q.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ padding: 18, borderRadius: 14, background: T.ochreSoft, border: `0.5px solid ${T.ochre}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${T.ochre}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ochre }}>
          <QuestIcon name={q.icon} size={18} />
        </div>
        <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 18, color: '#7A5A0F' }}>+{q.points}</span>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#4A3008', fontFamily: T.text }}>{q.title}</div>
        <div style={{ fontSize: 12, color: '#7A6030', marginTop: 3, lineHeight: 1.45, fontFamily: T.text }}>{q.description}</div>
      </div>
      <button onClick={() => onClaim(q)} disabled={busy} style={{ padding: '8px 0', borderRadius: 999, border: 'none', background: T.ochre, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>
        {busy ? '...' : q.type === 'self' ? 'Mark done' : 'Claim'}
      </button>
    </motion.div>
  )
}

function GigCard({ gig: g, index }: { gig: Gig; index: number }) {
  const rewardColor = g.reward_type === 'paid' ? T.verd : g.reward_type === 'coffee' ? T.ochre : T.inkMuted
  return (
    <motion.div key={g.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: T.display, fontSize: 15, fontWeight: 500, color: T.ink }}>{g.title}</div>
        <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: rewardColor, fontFamily: T.text }}>{rewardLabel(g)}</span>
      </div>
      {g.description && <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.45, fontFamily: T.text }}>{g.description}</div>}
      <div style={{ fontSize: 11.5, color: T.inkFaint, fontFamily: T.text }}>{g.provider_name} · {g.provider_credibility} credibility{g.is_mine ? ' · yours' : ''}</div>
    </motion.div>
  )
}

// ── Inline creation panels ───────────────────────────────────────────────────
function CreateEventInline({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: '', startsAt: '', location: '', description: '' })

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      await apiPost('/api/events', { title: f.title, startsAt: new Date(f.startsAt).toISOString(), location: f.location || null, description: f.description || null })
      setF({ title: '', startsAt: '', location: '', description: '' }); setOpen(false); onCreated()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
      <SectionLabel>Host an event</SectionLabel>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Create event, earn +5 credibility
        </button>
      ) : (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input required placeholder="Event title" style={inputStyle} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <input required type="datetime-local" style={inputStyle} value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })} />
          <input placeholder="Location (optional)" style={inputStyle} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <input placeholder="What is it about?" style={inputStyle} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, padding: '9px', borderRadius: 999, border: 'none', background: T.signal, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>{busy ? 'Creating...' : 'Create'}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: '9px 14px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function CreateGigInline({ elig, onCreated }: { elig: Eligibility; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ gigType: 'cv_review', title: '', description: '', rewardType: 'coffee', priceEur: '' })

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await apiPost('/api/gigs', { ...f, priceEur: f.rewardType === 'paid' && f.priceEur ? Number(f.priceEur) : null })
      setF({ gigType: 'cv_review', title: '', description: '', rewardType: 'coffee', priceEur: '' }); setOpen(false); onCreated()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
      <SectionLabel>Offer a gig</SectionLabel>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Post what you can help with
        </button>
      ) : (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select style={inputStyle} value={f.gigType} onChange={e => setF({ ...f, gigType: e.target.value })}>
            {GIG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input required placeholder="What you are offering" style={inputStyle} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <input placeholder="Details" style={inputStyle} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={f.rewardType} onChange={e => setF({ ...f, rewardType: e.target.value })}>
              <option value="coffee">For a coffee</option><option value="paid">Paid</option><option value="free">Free</option>
            </select>
            {f.rewardType === 'paid' && <input type="number" min={0} placeholder="EUR" style={{ ...inputStyle, width: 80 }} value={f.priceEur} onChange={e => setF({ ...f, priceEur: e.target.value })} />}
          </div>
          {err && <div style={{ fontSize: 12, color: T.signal }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, padding: '9px', borderRadius: 999, border: 'none', background: T.verd, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>{busy ? 'Posting...' : 'Post gig'}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: '9px 14px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
