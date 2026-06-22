import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Plus, MapPin, Users, Lock, ChevronRight, Flame, ImagePlus } from 'lucide-react'
import { apiGet, apiPost, apiPostForm } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'
import { KAvatar } from '@/lib/knotify'
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
  gig_unlocked: boolean; gig_unlock_at: number
  weekly_delta?: number; percentile?: number | null; streak?: number
  quests: Quest[]
}
type EventItem = {
  id: string; title: string; description: string | null; location: string | null
  starts_at: string; host_name: string; is_host: boolean; rsvp_count: number; rsvped: boolean
  source: string; url: string | null; image_url?: string | null; interests?: string[]
}
type Gig = {
  id: string; gig_type: string; title: string; description: string | null
  reward_type: 'coffee' | 'paid' | 'free'; price_eur: number | null
  provider_name: string; provider_credibility: number; is_mine: boolean
}
type Eligibility = { credibility_score: number; can_offer: boolean; unlock_at: number }
type Me = { id: string; interests?: string[] }
type Person = {
  id: string; full_name: string; username: string; avatar_url: string | null
  headline?: string | null; current_company?: string | null; university?: string | null
  interests?: string[]; mutual_connections_count?: number; match_reason?: string
}

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
function overlap(a: string[] = [], b: string[] = []) {
  if (!a.length || !b.length) return 0
  const setB = new Set(b.map((x) => x.toLowerCase()))
  return a.reduce((n, x) => n + (setB.has(x.toLowerCase()) ? 1 : 0), 0)
}
// Stable accent per event for the gradient fallback (when no image)
function accentFor(seed: string): 'signal' | 'verd' | 'ochre' | 'plum' {
  const order = ['signal', 'verd', 'ochre', 'plum'] as const
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return order[h % order.length]
}
const EVENT_GRAD: Record<string, string> = {
  signal: `linear-gradient(135deg, ${T.signal} 0%, ${T.signalDeep} 100%)`,
  verd: `linear-gradient(135deg, ${T.verd} 0%, #134840 100%)`,
  ochre: `linear-gradient(135deg, ${T.ochre} 0%, #9a6f10 100%)`,
  plum: `linear-gradient(135deg, ${T.plum} 0%, #3d1c36 100%)`,
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
type Filter = 'all' | 'events' | 'quests' | 'gigs' | 'people'

// ── Shared primitives ────────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontFamily: T.text, gap: 8 }}>
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
function CredRing({ score, max }: { score: number; max: number }) {
  const size = 60; const r = (size - 6) / 2; const circ = 2 * Math.PI * r; const pct = Math.min(score / max, 1)
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

// ── Main component ───────────────────────────────────────────────────────────
export function HomeHub({ maintenance }: { maintenance?: React.ReactNode } = {}) {
  const navigate = useNavigate()
  const [quests, setQuests] = useState<QuestsResp | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [claiming, setClaiming] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<Record<string, 'idle' | 'busy' | 'sent'>>({})
  const [activeFilter, setActiveFilter] = useState<Filter>('all')

  const loadQuests = useCallback(() => { apiGet<QuestsResp>('/api/quests').then(setQuests).catch(() => {}) }, [])
  const loadEvents = useCallback(() => { apiGet<{ events: EventItem[] }>('/api/events?limit=12').then(r => setEvents(r.events)).catch(() => {}) }, [])
  const loadGigs = useCallback(() => { apiGet<{ gigs: Gig[] }>('/api/gigs?limit=6').then(r => setGigs(r.gigs)).catch(() => {}) }, [])

  useEffect(() => {
    loadQuests(); loadEvents(); loadGigs()
    apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {})
    apiGet<{ user: Me }>('/api/users/me').then(r => setMe(r.user)).catch(() => {})
    apiGet<{ suggestions: Person[] }>('/api/users/suggestions').then(r => setPeople(r.suggestions ?? [])).catch(() => {})
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

  async function askIntro(p: Person) {
    setConnecting(s => ({ ...s, [p.id]: 'busy' }))
    try {
      await apiPost('/api/connections', { addresseeId: p.id })
      setConnecting(s => ({ ...s, [p.id]: 'sent' }))
    } catch {
      setConnecting(s => ({ ...s, [p.id]: 'idle' }))
    }
  }

  const interests = me?.interests ?? []
  const score = quests?.credibility_score ?? 0
  const next = quests?.next_tier ?? null
  const floor = next ? prevFloor(score, next.at) : score
  const pct = next ? Math.min(100, Math.round(((score - floor) / (next.at - floor)) * 100)) : 100
  const claimable = (quests?.quests ?? []).filter(q => q.status === 'claimable')
  const inProgress = (quests?.quests ?? []).filter(q => q.status === 'locked' && q.progress != null && q.target != null)

  // Interest-ranked events (most relevant to the user first)
  const rankedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const ov = overlap(b.interests, interests) - overlap(a.interests, interests)
      if (ov !== 0) return ov
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    })
  }, [events, interests])

  const showEvents = activeFilter === 'all' || activeFilter === 'events'
  const showQuests = activeFilter === 'all' || activeFilter === 'quests'
  const showGigs = activeFilter === 'all' || activeFilter === 'gigs'
  const showPeople = activeFilter === 'all' || activeFilter === 'people'

  const FILTERS: Array<{ k: Filter; label: string }> = [
    { k: 'all', label: 'All' }, { k: 'events', label: 'Events' },
    { k: 'people', label: 'People' }, { k: 'quests', label: 'Quests' }, { k: 'gigs', label: 'Gigs' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

      {/* ── Top row: maintenance + credibility + side quests ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: maintenance ? 'minmax(0,1.6fr) minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 20 }}>

        {maintenance}

        <div style={{ display: maintenance ? 'flex' : 'contents', flexDirection: 'column', gap: 16 }}>

          {/* Credibility dark card */}
          <div style={{ padding: 22, borderRadius: 18, background: T.ink, color: T.paperSoft, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, rgba(216,68,43,0.3) 0%, transparent 70%)` }} />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CredRing score={score} max={next?.at ?? 120} />
                <div>
                  <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.1 }}>{quests?.tier ?? 'Newcomer'}</div>
                  <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.55)', marginTop: 3, fontFamily: T.text }}>
                    Credibility{quests?.percentile != null ? ` · top ${quests.percentile}%` : ''}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: 'rgba(250,246,238,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: T.text }}>This week</div>
                <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.ochre, lineHeight: 1.2 }}>{(quests?.weekly_delta ?? 0) > 0 ? `+${quests?.weekly_delta}` : '0'}</div>
                {(quests?.streak ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(250,246,238,0.6)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>
                    <Flame size={11} color={T.ochre} />{quests?.streak}d
                  </div>
                )}
              </div>
            </div>

            {next && (
              <div style={{ marginTop: 16, position: 'relative' }}>
                <div style={{ height: 5, borderRadius: 999, background: 'rgba(250,246,238,0.1)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: T.ochre, transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(250,246,238,0.55)', fontFamily: T.text, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{next.at - score} pts to {next.name}</span>
                  <span style={{ color: quests?.gig_unlocked ? '#8fe0ab' : 'rgba(250,246,238,0.45)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {!quests?.gig_unlocked && <Lock size={10} />}{quests?.gig_unlocked ? 'Gigs unlocked' : `Gigs at ${quests?.gig_unlock_at ?? 70}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Side quests ochre card */}
          <div style={{ padding: 20, borderRadius: 18, background: T.ochreSoft, border: `0.5px solid ${T.ochre}` }}>
            <SectionLabel right={<button onClick={() => navigate('/quests')} style={{ background: 'none', border: 'none', fontSize: 11, color: T.ochre, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>All <ChevronRight size={11} /></button>}>Side quests · earn cred</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {claimable.slice(0, 3).map((q, i) => (
                <motion.div key={q.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid rgba(200,148,31,0.3)` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(200,148,31,0.18)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A5A0F' }}>
                      <QuestIcon name={q.icon} size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: '#5A3F0E', fontWeight: 600, lineHeight: 1.25 }}>{q.title}</div>
                      <div style={{ fontSize: 11, color: '#8A6A1A', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.description}</div>
                    </div>
                    <button onClick={() => claim(q)} disabled={claiming === q.key} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, border: 'none', background: T.ochre, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.display, fontStyle: 'italic' }}>
                      {claiming === q.key ? '...' : `+${q.points}`}
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* In-progress (locked w/ measurable progress) */}
              {claimable.length < 3 && inProgress.slice(0, 3 - claimable.length).map((q) => (
                <div key={q.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `0.5px solid rgba(200,148,31,0.3)`, opacity: 0.85 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(200,148,31,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A7A2A' }}>
                    <QuestIcon name={q.icon} size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: '#5A3F0E', fontWeight: 600, lineHeight: 1.25 }}>{q.title}</div>
                    <div style={{ height: 4, borderRadius: 999, background: 'rgba(200,148,31,0.2)', marginTop: 5 }}>
                      <div style={{ width: `${Math.round(((q.progress ?? 0) / (q.target || 1)) * 100)}%`, height: '100%', borderRadius: 999, background: T.ochre }} />
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11, color: '#8A6A1A', fontFamily: T.text }}>{q.progress}/{q.target}</span>
                </div>
              ))}

              {claimable.length === 0 && inProgress.length === 0 && (
                <div style={{ fontSize: 13, color: '#9A7020', fontStyle: 'italic', fontFamily: T.display, padding: '8px 0' }}>
                  Complete quests to earn credibility.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── "For you" section ─────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, fontFamily: T.text, marginRight: 4 }}>For you</span>
          {FILTERS.map(f => (
            <button key={f.k} onClick={() => setActiveFilter(f.k)} style={{ padding: '5px 12px', borderRadius: 999, border: `0.5px solid ${activeFilter === f.k ? T.ink : T.rule}`, background: activeFilter === f.k ? T.ink : 'transparent', color: activeFilter === f.k ? T.paperSoft : T.inkSoft, fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: T.text, transition: 'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>
        {interests.length > 0 && (
          <div style={{ fontSize: 11.5, color: T.inkFaint, marginBottom: 14, fontFamily: T.text }}>
            Tuned to your interests · {interests.slice(0, 4).join(' · ')}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
          <AnimatePresence mode="popLayout">
            {showEvents && rankedEvents.slice(0, activeFilter === 'all' ? 3 : 12).map((e, i) => (
              <EventCard key={`ev-${e.id}`} event={e} onRsvp={toggleRsvp} index={i} matched={overlap(e.interests, interests) > 0} />
            ))}
            {showPeople && people.slice(0, activeFilter === 'all' ? 2 : 12).map((p, i) => (
              <PersonCard key={`p-${p.id}`} person={p} index={i} state={connecting[p.id] ?? 'idle'} onAsk={() => askIntro(p)} onView={() => navigate(`/profile/${p.id}`)} interests={interests} />
            ))}
            {showQuests && claimable.slice(0, activeFilter === 'all' ? 1 : 12).map((q, i) => (
              <QuestCard key={`q-${q.key}`} quest={q} onClaim={claim} busy={claiming === q.key} index={i} />
            ))}
            {showGigs && gigs.slice(0, activeFilter === 'all' ? 2 : 12).map((g, i) => (
              <GigCard key={`g-${g.id}`} gig={g} index={i} />
            ))}
          </AnimatePresence>
        </div>

        {((showEvents && rankedEvents.length === 0) && (showPeople && people.length === 0) && (showQuests && claimable.length === 0) && (showGigs && gigs.length === 0)) && (
          <div style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 14, border: `0.5px solid ${T.rule}`, background: T.paperSoft }}>
            <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 18, color: T.inkMuted }}>Nothing here yet.</div>
            <div style={{ fontSize: 13, color: T.inkFaint, marginTop: 6, fontFamily: T.text }}>Events, people, quests and gigs will show up as they are added.</div>
          </div>
        )}
      </div>

      {/* ── Host event / Offer gig inline ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12, marginTop: 20 }}>
        <CreateEventInline onCreated={loadEvents} />
        {elig?.can_offer && <CreateGigInline onCreated={() => { loadGigs(); apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {}) }} />}
        {elig && !elig.can_offer && (
          <div style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Lock size={16} color={T.inkFaint} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: T.text }}>Offer gigs at {elig.unlock_at} credibility</div>
              <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2, fontFamily: T.text }}>You are at {elig.credibility_score}. Browse offers or earn more through quests.</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Card components ──────────────────────────────────────────────────────────
function EventCard({ event: e, onRsvp, index, matched }: { event: EventItem; onRsvp: (id: string) => void; index: number; matched: boolean }) {
  const color = accentFor(e.id)
  return (
    <motion.div key={e.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ borderRadius: 14, overflow: 'hidden', background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 110, position: 'relative', background: e.image_url ? `center/cover no-repeat url(${e.image_url})` : EVENT_GRAD[color], display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.28)', padding: '3px 9px', borderRadius: 999, fontFamily: T.text }}>Event</span>
        {matched && <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.28)', padding: '3px 8px', borderRadius: 999, fontFamily: T.text }}>For you</span>}
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontSize: 11.5, color: T.signal, fontWeight: 600, fontFamily: T.text }}>{whenLabel(e.starts_at)}</div>
        <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 500, letterSpacing: -0.2, color: T.ink, lineHeight: 1.15 }}>{e.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: T.inkFaint, flexWrap: 'wrap', fontFamily: T.text }}>
          {e.location && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{e.location}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={11} />{e.rsvp_count}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => onRsvp(e.id)} disabled={e.is_host} style={{ marginTop: 4, padding: '8px 16px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer', border: 'none', background: e.is_host ? T.rule : e.rsvped ? T.verd : T.ink, color: e.is_host ? T.inkFaint : '#fff', alignSelf: 'flex-start', fontFamily: T.text, transition: 'all 0.15s' }}>
          {e.is_host ? 'You are hosting' : e.rsvped ? 'Going' : 'RSVP'}
        </button>
      </div>
    </motion.div>
  )
}

function PersonCard({ person: p, index, state, onAsk, onView, interests }: { person: Person; index: number; state: 'idle' | 'busy' | 'sent'; onAsk: () => void; onView: () => void; interests: string[] }) {
  const shared = (p.interests ?? []).filter(x => interests.map(i => i.toLowerCase()).includes(x.toLowerCase()))
  const reason = p.match_reason
    || (shared.length ? `Shares ${shared.slice(0, 2).join(', ')}` : null)
    || ((p.mutual_connections_count ?? 0) > 0 ? `${p.mutual_connections_count} mutual connection${p.mutual_connections_count === 1 ? '' : 's'}` : null)
    || p.headline || p.current_company || p.university || 'In the knotify network'
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <button onClick={onView} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
          <KAvatar name={p.full_name} src={p.avatar_url} size={42} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
          <div style={{ fontSize: 11.5, color: T.inkFaint, fontFamily: T.text }}>{(p.mutual_connections_count ?? 0) > 0 ? '2nd degree' : 'Suggested'}</div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.4, fontFamily: T.text, flex: 1 }}>{reason}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onAsk} disabled={state !== 'idle'} style={{ flex: 1, padding: '8px', borderRadius: 999, border: 'none', background: state === 'sent' ? T.verdSoft : T.ink, color: state === 'sent' ? T.verd : '#fff', fontSize: 12.5, fontWeight: 600, cursor: state === 'idle' ? 'pointer' : 'default', fontFamily: T.text }}>
          {state === 'busy' ? '...' : state === 'sent' ? 'Request sent' : 'Ask for intro'}
        </button>
        <button onClick={onView} style={{ padding: '8px 12px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: T.text }}>View</button>
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
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  function pickImage(file: File | null) {
    setImage(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('title', f.title)
      fd.append('startsAt', new Date(f.startsAt).toISOString())
      if (f.location) fd.append('location', f.location)
      if (f.description) fd.append('description', f.description)
      if (image) fd.append('image', image)
      await apiPostForm('/api/events', fd)
      setF({ title: '', startsAt: '', location: '', description: '' }); pickImage(null); setOpen(false); onCreated()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 18, borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
      <SectionLabel>Host an event</SectionLabel>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Create event, earn credibility
        </button>
      ) : (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Cover photo */}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: preview ? 110 : 'auto', padding: preview ? 0 : '12px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: preview ? `center/cover no-repeat url(${preview})` : T.paper, cursor: 'pointer', overflow: 'hidden', color: T.inkMuted, fontSize: 12.5, fontFamily: T.text }}>
            {!preview && <><ImagePlus size={15} /> Add a cover photo</>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
          </label>
          <input required placeholder="Event title" style={inputStyle} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <input required type="datetime-local" style={inputStyle} value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })} />
          <input placeholder="Location (optional)" style={inputStyle} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <input placeholder="What is it about?" style={inputStyle} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, padding: '9px', borderRadius: 999, border: 'none', background: T.signal, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.text }}>{busy ? 'Creating...' : 'Create'}</button>
            <button type="button" onClick={() => { setOpen(false); pickImage(null) }} style={{ padding: '9px 14px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function CreateGigInline({ onCreated }: { onCreated: () => void }) {
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
