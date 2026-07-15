import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MapPin, Users, Lock, ChevronRight, Flame, ImagePlus, X, ExternalLink, Camera, Share2, ChevronLeft } from 'lucide-react'
import { apiGet, apiPost, apiPostForm } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'
import { KAvatar } from '@/lib/knotify'
import { useNavigate } from 'react-router-dom'

// ── Types ───────────────────────────────────────────────────────────────────
type Quest = {
  key: string; title: string; description: string; points: number
  category: string; type: 'verified' | 'self'; icon: string
  progress?: number; target?: number; status: 'completed' | 'claimable' | 'locked'
  how_to?: string | null; where_to_go?: string | null
  estimated_minutes?: number | null; difficulty?: 'easy' | 'medium' | 'hard' | null
  partner_required?: boolean
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
  starts_at: string; ends_at?: string | null
  host_name: string; is_host: boolean; rsvp_count: number; rsvped: boolean
  source: string; url: string | null; image_url?: string | null; interests?: string[]
  host_label?: string | null; capacity?: number | null
  price_eur?: number | null; event_type?: string | null
  time_tba?: boolean
  reason?: string
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

// ── Design tokens ────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function whenLabel(iso: string, timeTba = false) {
  const d = new Date(iso); const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString()
  if (timeTba) {
    if (sameDay) return 'Today · Time TBA'
    if (tomorrow) return 'Tomorrow · Time TBA'
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · Time TBA'
  }
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  if (tomorrow) return `Tomorrow, ${time}`
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + `, ${time}`
}
function timeOnly(iso: string, timeTba = false) {
  if (timeTba) return 'Time TBA'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function minuteLabel(m: number) {
  if (m < 60) return `~${m} min`
  const h = Math.floor(m / 60); const rem = m % 60
  return rem ? `~${h}h ${rem}min` : `~${h}h`
}
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const DIFFICULTY_COLOR: Record<string, string> = { easy: T.verd, medium: T.ochre, hard: T.signal }
const EVENT_TYPE_LABEL: Record<string, string> = {
  networking: 'Networking', social: 'Social', sports: 'Sports', music: 'Music',
  career: 'Career', workshop: 'Workshop', outdoor: 'Outdoor', party: 'Party',
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
function accentFor(seed: string): 'signal' | 'verd' | 'ochre' | 'plum' {
  const order = ['signal', 'verd', 'ochre', 'plum'] as const
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return order[h % order.length]
}
const EVENT_GRAD: Record<string, string> = {
  signal: `linear-gradient(135deg, ${T.signal} 0%, ${T.signalDeep} 100%)`,
  verd:   `linear-gradient(135deg, ${T.verd} 0%, #134840 100%)`,
  ochre:  `linear-gradient(135deg, ${T.ochre} 0%, #9a6f10 100%)`,
  plum:   `linear-gradient(135deg, ${T.plum} 0%, #3d1c36 100%)`,
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

// ── Shared primitives ─────────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontFamily: T.display, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: T.ink }}>{children}</span>
      {right && <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{right}</span>}
    </div>
  )
}
function Chip({ children, color = 'paper' }: { children: React.ReactNode; color?: 'paper' | 'signal' | 'verd' | 'ochre' | 'plum' }) {
  const map = {
    paper:  { bg: T.paperDeep, fg: T.inkSoft,    bd: T.rule },
    signal: { bg: T.signalSoft, fg: T.signalDeep, bd: T.signal },
    verd:   { bg: T.verdSoft,  fg: T.verd,        bd: T.verd },
    ochre:  { bg: T.ochreSoft, fg: '#7A5A0F',     bd: T.ochre },
    plum:   { bg: T.plumSoft,  fg: T.plum,        bd: T.plum },
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
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.ochre} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: 20, fontWeight: 500, color: T.paperSoft }}>{score}</div>
    </div>
  )
}

// ── Overlay wrapper ────────────────────────────────────────────────────────────
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    // Lock background scroll — set overflow:hidden on both html and body.
    // Never use position:fixed on body: it creates a containing block for
    // fixed descendants and breaks the overlay's viewport anchoring.
    const prevHtml = document.documentElement.style.overflow
    const prevBody = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => {
      document.documentElement.style.overflow = prevHtml
      document.body.style.overflow = prevBody
      document.removeEventListener('keydown', fn)
    }
  }, [onClose])
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }} className="k-overlay">
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="k-modal-card"
        style={{ background: T.paper, position: 'relative', boxShadow: '0 -8px 40px rgba(26,24,21,0.18)' }}
      >
        {/* Drag handle indicator — mobile only */}
        <div className="md:hidden" style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(26,24,21,0.15)', margin: '0 auto 12px' }} />
        {children}
      </motion.div>
    </div>,
    document.body
  )
}

// ── Quest detail + claim modal ─────────────────────────────────────────────────
function QuestDetailModal({ quest: q, onClose, onClaimed }: { quest: Quest; onClose: () => void; onClaimed: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function pickPhoto(file: File | null) {
    setPhoto(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  async function claim() {
    if (q.type === 'self' && !photo) { setErr('Upload a photo to prove you did this.'); return }
    setBusy(true); setErr('')
    try {
      if (q.type === 'self') {
        const fd = new FormData()
        fd.append('shareToFeed', String(shareToFeed))
        if (photo) fd.append('photo', photo)
        await apiPostForm(`/api/quests/${q.key}/claim`, fd)
      } else {
        await apiPost(`/api/quests/${q.key}/claim`, {})
      }
      onClaimed(); onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to claim')
    } finally { setBusy(false) }
  }

  const catColor: Record<string, string> = {
    profile: T.verd, network: T.verd, social: T.ochre, explore: T.plum, give: T.signal,
  }
  const cc = catColor[q.category] ?? T.inkMuted

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `${cc}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cc, flexShrink: 0, border: `1.5px solid ${cc}40` }}>
            <QuestIcon name={q.icon} size={24} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: cc, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: T.text, marginBottom: 2 }}>{q.category}</div>
            <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, fontWeight: 500, letterSpacing: -0.3, color: T.ink, lineHeight: 1.1 }}>{q.title}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, color: T.ochre }}>+{q.points}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, display: 'flex', padding: 4 }}><X size={18} /></button>
        </div>
      </div>

      {/* Meta chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {q.difficulty && <Chip color={q.difficulty === 'easy' ? 'verd' : q.difficulty === 'hard' ? 'signal' : 'ochre'}>{DIFFICULTY_LABEL[q.difficulty]}</Chip>}
        {q.estimated_minutes && <Chip>{minuteLabel(q.estimated_minutes)}</Chip>}
        {q.partner_required && <Chip color="plum"><Users size={10} style={{ marginRight: 3 }} />Needs a partner</Chip>}
        {q.type === 'self' && <Chip color="ochre"><Camera size={10} style={{ marginRight: 3 }} />Photo required</Chip>}
      </div>

      <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.65, fontFamily: T.text, margin: '0 0 18px' }}>{q.description}</p>

      {/* How to complete — from DB */}
      {q.how_to && (
        <div style={{ background: T.paperSoft, borderRadius: 14, padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14, border: `0.5px solid ${T.ruleSoft}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: T.text }}>How to complete</div>
            <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.65, fontFamily: T.text }}>{q.how_to}</div>
          </div>
          {q.where_to_go && (
            <div style={{ borderTop: `0.5px solid ${T.ruleSoft}`, paddingTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: T.text }}>Where</div>
              <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, fontFamily: T.text, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <MapPin size={14} color={T.signal} style={{ marginTop: 2, flexShrink: 0 }} />{q.where_to_go}
              </div>
            </div>
          )}
        </div>
      )}

      {q.status === 'completed' ? (
        <div style={{ padding: '16px 18px', borderRadius: 14, background: T.verdSoft, border: `0.5px solid ${T.verd}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <div>
            <div style={{ fontSize: 13.5, color: T.verd, fontWeight: 700, fontFamily: T.text }}>Quest completed. +{q.points} credibility earned.</div>
            <div style={{ fontSize: 12, color: T.verd, opacity: 0.75, marginTop: 2, fontFamily: T.text }}>This appears on your profile under Quest completions.</div>
          </div>
        </div>
      ) : q.type === 'self' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Where the photo goes — shown upfront */}
          <div style={{ padding: '14px 16px', borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: T.text }}>Photo evidence</div>
            <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, fontFamily: T.text }}>
              Take a real photo to prove you did this. It goes to your knotify profile under "Quest completions" and, if you choose, appears in your connections' activity feed.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <Chip color="verd"><Users size={10} style={{ marginRight: 3 }} />Shown on your profile</Chip>
              <Chip color="ochre"><Share2 size={10} style={{ marginRight: 3 }} />Optional: share to feed</Chip>
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: preview ? 200 : 110, borderRadius: 16, border: `2px dashed ${photo ? T.verd : T.rule}`, background: preview ? `center/cover no-repeat url(${preview})` : T.paperSoft, cursor: 'pointer', overflow: 'hidden', color: T.inkMuted, fontSize: 13, fontFamily: T.text, position: 'relative', transition: 'border-color 0.15s' }}>
            {!preview && <>
              <Camera size={24} color={T.inkFaint} />
              <span style={{ fontWeight: 600, color: T.inkSoft }}>Upload your photo</span>
              <span style={{ fontSize: 11.5, color: T.inkFaint }}>JPG, PNG or WebP · max 8 MB</span>
            </>}
            {preview && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: T.text, background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: 999 }}>Tap to change photo</span>
            </div>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
          </label>

          <button onClick={() => setShareToFeed(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 14, border: `1.5px solid ${shareToFeed ? T.verd : T.rule}`, background: shareToFeed ? T.verdSoft : T.paperSoft, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: shareToFeed ? T.verd : T.ruleSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
              <Share2 size={16} color={shareToFeed ? '#fff' : T.inkFaint} />
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: shareToFeed ? T.verd : T.ink, fontFamily: T.text }}>Share to your connections' feed</div>
              <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.text, marginTop: 2 }}>{shareToFeed ? 'Photo will appear in your knot\'s activity feed' : 'Only visible on your own profile'}</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: 999, background: shareToFeed ? T.verd : T.rule, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {shareToFeed && <span style={{ color: '#fff', fontSize: 13 }}>✓</span>}
            </div>
          </button>

          {err && <div style={{ fontSize: 12.5, color: T.signal, fontFamily: T.text }}>{err}</div>}
          <button onClick={claim} disabled={busy || !photo}
            style={{ padding: '14px', borderRadius: 999, border: 'none', background: photo ? T.ochre : T.ruleSoft, color: photo ? '#fff' : T.inkFaint, fontSize: 14, fontWeight: 700, cursor: photo ? 'pointer' : 'not-allowed', fontFamily: T.text, transition: 'all 0.15s' }}>
            {busy ? 'Claiming...' : photo ? `Claim +${q.points} credibility` : 'Upload photo to claim'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.status === 'locked' && q.progress != null && q.target != null && (
            <div style={{ padding: '14px 16px', borderRadius: 14, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.inkMuted, marginBottom: 8, fontFamily: T.text }}>
                <span>Progress</span><span style={{ fontWeight: 600 }}>{q.progress} / {q.target}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: T.ruleSoft }}>
                <div style={{ width: `${Math.round(((q.progress ?? 0) / (q.target || 1)) * 100)}%`, height: '100%', borderRadius: 999, background: T.ochre, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, fontFamily: T.text }}>{(q.target ?? 0) - (q.progress ?? 0)} more to go</div>
            </div>
          )}
          {err && <div style={{ fontSize: 12.5, color: T.signal, fontFamily: T.text }}>{err}</div>}
          <button onClick={claim} disabled={busy || q.status === 'locked'}
            style={{ padding: '14px', borderRadius: 999, border: 'none', background: q.status === 'claimable' ? T.ochre : T.ruleSoft, color: q.status === 'claimable' ? '#fff' : T.inkFaint, fontSize: 14, fontWeight: 700, cursor: q.status === 'claimable' ? 'pointer' : 'not-allowed', fontFamily: T.text }}>
            {busy ? 'Claiming...' : q.status === 'claimable' ? `Claim +${q.points} credibility` : 'Not ready yet'}
          </button>
        </div>
      )}
    </Overlay>
  )
}

// ── Event detail modal ─────────────────────────────────────────────────────────
function EventDetailModal({ event: e, onClose, onRsvp }: { event: EventItem; onClose: () => void; onRsvp: (id: string) => void }) {
  const color = accentFor(e.id)
  const [rsvped, setRsvped] = useState(e.rsvped)
  const [count, setCount] = useState(e.rsvp_count)

  function handleRsvp() {
    if (e.is_host) return
    const next = !rsvped
    setRsvped(next)
    setCount(c => c + (next ? 1 : -1))
    onRsvp(e.id)
  }

  return (
    <Overlay onClose={onClose}>
      {/* Hero */}
      <div style={{ margin: '-28px -24px 0', height: 220, background: e.image_url ? `center/cover no-repeat url(${e.image_url})` : EVENT_GRAD[color], borderRadius: '20px 20px 0 0', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,24,21,0.75) 0%, transparent 55%)', borderRadius: '20px 20px 0 0' }} />
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(26,24,21,0.45)', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)' }}><X size={15} /></button>
        {e.source === 'curated' && <div style={{ position: 'absolute', top: 14, left: 14, background: T.verd, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, fontFamily: T.text }}>Curated</div>}
        <div style={{ position: 'absolute', bottom: 18, left: 20, right: 20 }}>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)', fontFamily: T.text, marginBottom: 5, fontWeight: 500 }}>{whenLabel(e.starts_at, e.time_tba)}</div>
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 26, fontWeight: 500, color: '#fff', lineHeight: 1.1 }}>{e.title}</div>
        </div>
      </div>

      {/* Meta chips row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '20px 0 16px' }}>
        {e.event_type && <Chip color="plum">{EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}</Chip>}
        {e.price_eur === 0 ? <Chip color="verd">Free entry</Chip> : e.price_eur != null ? <Chip color="ochre">€{e.price_eur}</Chip> : null}
      </div>

      {/* Key info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        {e.location && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, fontFamily: T.text }}>Location</div>
            <div style={{ fontSize: 13, color: T.ink, fontFamily: T.text, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <MapPin size={13} color={T.signal} style={{ marginTop: 1, flexShrink: 0 }} />{e.location}
            </div>
          </div>
        )}
        <div style={{ padding: '12px 14px', borderRadius: 12, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, fontFamily: T.text }}>Time</div>
          <div style={{ fontSize: 13, color: T.ink, fontFamily: T.text }}>
            {timeOnly(e.starts_at, e.time_tba)}{e.ends_at && !e.time_tba ? ` – ${timeOnly(e.ends_at)}` : ''}
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, fontFamily: T.text }}>Going</div>
          <div style={{ fontSize: 13, color: T.ink, fontFamily: T.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={13} color={T.verd} />{count}{e.capacity ? ` / ${e.capacity}` : ''}
          </div>
        </div>
      </div>

      {/* Host */}
      {(e.host_name || e.host_label) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: T.paperSoft, border: `0.5px solid ${T.ruleSoft}`, marginBottom: 18 }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, background: T.plumSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
            {(e.host_name || e.host_label || '?')[0]}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: T.text }}>Organised by</div>
            <div style={{ fontSize: 13, color: T.ink, fontWeight: 600, fontFamily: T.text }}>{e.host_name || e.host_label}</div>
          </div>
          {e.is_host && <span style={{ marginLeft: 'auto', fontSize: 11, color: T.verd, fontWeight: 600, fontFamily: T.text }}>You</span>}
        </div>
      )}

      {/* Description */}
      {e.description ? (
        <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.7, fontFamily: T.text, margin: '0 0 18px' }}>{e.description}</p>
      ) : (
        <p style={{ fontSize: 13.5, color: T.inkFaint, lineHeight: 1.6, fontStyle: 'italic', fontFamily: T.display, margin: '0 0 18px' }}>No description added yet.</p>
      )}

      {/* Interest tags */}
      {(e.interests ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
          {e.interests!.map(i => <Chip key={i}>{i}</Chip>)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleRsvp} disabled={e.is_host}
          style={{ flex: 1, padding: '14px', borderRadius: 999, border: 'none', background: e.is_host ? T.rule : rsvped ? T.verd : T.signal, color: e.is_host ? T.inkFaint : '#fff', fontSize: 14, fontWeight: 700, cursor: e.is_host ? 'default' : 'pointer', fontFamily: T.text, transition: 'background 0.15s' }}>
          {e.is_host ? 'You are hosting' : rsvped ? 'Going · tap to cancel' : 'RSVP · I will be there'}
        </button>
        {e.url && (
          <a href={e.url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '14px 16px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: T.text, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <ExternalLink size={14} />Details
          </a>
        )}
      </div>
    </Overlay>
  )
}

// ── Events Carousel ────────────────────────────────────────────────────────────
function EventsCarousel({ events, interests, onRsvp, onOpen, onSeeAll }: {
  events: EventItem[]
  interests: string[]
  onRsvp: (id: string) => void
  onOpen: (e: EventItem) => void
  onSeeAll: () => void
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  function scroll(dir: 'left' | 'right') {
    const el = rail.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
  }

  function onScroll() {
    const el = rail.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }

  useEffect(() => { onScroll() }, [events])

  if (!events.length) return null

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onSeeAll} style={{ background: 'none', border: 'none', fontSize: 11, color: T.signal, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>
            See all <ChevronRight size={11} />
          </button>
          <div style={{ width: 1, height: 12, background: T.rule }} />
          <button onClick={() => scroll('left')} disabled={!canLeft}
            style={{ width: 28, height: 28, borderRadius: 999, border: `0.5px solid ${T.rule}`, background: canLeft ? T.paperDeep : 'transparent', color: canLeft ? T.ink : T.inkFaint, cursor: canLeft ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll('right')} disabled={!canRight}
            style={{ width: 28, height: 28, borderRadius: 999, border: `0.5px solid ${T.rule}`, background: canRight ? T.paperDeep : 'transparent', color: canRight ? T.ink : T.inkFaint, cursor: canRight ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      }>Events · for you</SectionLabel>
      <div ref={rail} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 8, scrollbarWidth: 'none' }}>
        {events.map((e, i) => {
          const color = accentFor(e.id)
          const reason = e.reason ?? (e.interests ?? []).find((x) => interests.map((i) => i.toLowerCase()).includes(x.toLowerCase()))
          const matched = Boolean(reason)
          return (
            <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => onOpen(e)}
              className="k-event-card"
              style={{ borderRadius: 14, overflow: 'hidden', background: T.paperSoft, border: `0.5px solid ${T.rule}`, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}>
              <div style={{ height: 100, position: 'relative', background: e.image_url ? `center/cover no-repeat url(${e.image_url})` : EVENT_GRAD[color] }}>
                <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.28)', padding: '3px 8px', borderRadius: 999, fontFamily: T.text }}>Event</span>
                  {matched && <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(216,68,43,0.85)', padding: '3px 8px', borderRadius: 999, fontFamily: T.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</span>}
                </div>
              </div>
              <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, color: T.signal, fontWeight: 600, fontFamily: T.text }}>{whenLabel(e.starts_at, e.time_tba)}</div>
                <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 500, color: T.ink, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.title}</div>
                {e.location && <div style={{ fontSize: 11, color: T.inkFaint, display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}><MapPin size={10} />{e.location}</div>}
                <div style={{ flex: 1 }} />
                <button onClick={(ev) => { ev.stopPropagation(); onRsvp(e.id) }} disabled={e.is_host}
                  style={{ marginTop: 6, padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: e.is_host ? 'default' : 'pointer', border: 'none', background: e.is_host ? T.rule : e.rsvped ? T.verd : T.ink, color: e.is_host ? T.inkFaint : '#fff', alignSelf: 'flex-start', fontFamily: T.text }}>
                  {e.is_host ? 'Hosting' : e.rsvped ? 'Going' : 'RSVP'}
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Side quests section ────────────────────────────────────────────────────────
function SideQuestsSection({ quests, onOpen }: { quests: Quest[]; onOpen: (q: Quest) => void }) {
  const claimable = quests.filter(q => q.status === 'claimable')
  const inProgress = quests.filter(q => q.status === 'locked' && q.progress != null)
  const visible = [...claimable, ...inProgress].slice(0, 6)

  if (!visible.length) return null

  const catColor: Record<string, string> = {
    profile: T.verd, network: T.verd, social: T.ochre, explore: T.plum, give: T.signal,
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel right={
        <button onClick={() => window.location.href = '/quests'} style={{ background: 'none', border: 'none', fontSize: 11, color: T.ochre, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: T.text }}>
          All <ChevronRight size={11} />
        </button>
      }>Side quests · earn credibility</SectionLabel>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
        {visible.map((q, i) => {
          const cc = catColor[q.category] ?? T.inkMuted
          const isClaimable = q.status === 'claimable'
          return (
            <motion.div key={q.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              onClick={() => onOpen(q)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: isClaimable ? T.ochreSoft : T.paperSoft, border: `0.5px solid ${isClaimable ? T.ochre : T.ruleSoft}`, cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cc}18`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cc, border: `1px solid ${cc}30` }}>
                <QuestIcon name={q.icon} size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.ink, fontWeight: 600, fontFamily: T.text, lineHeight: 1.2 }}>{q.title}</div>
                <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 2, fontFamily: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.type === 'self' ? 'Photo required · tap to see how' : q.description}
                </div>
                {q.status === 'locked' && q.progress != null && q.target != null && (
                  <div style={{ height: 3, borderRadius: 999, background: T.ruleSoft, marginTop: 6 }}>
                    <div style={{ width: `${Math.round(((q.progress ?? 0) / (q.target || 1)) * 100)}%`, height: '100%', borderRadius: 999, background: cc }} />
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0, fontFamily: T.display, fontStyle: 'italic', fontSize: 16, color: isClaimable ? '#7A5A0F' : T.inkFaint }}>+{q.points}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── People card ────────────────────────────────────────────────────────────────
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
      <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, fontFamily: T.text, flex: 1 }}>{reason}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onAsk} disabled={state !== 'idle'} style={{ flex: 1, padding: '8px', borderRadius: 999, border: 'none', background: state === 'sent' ? T.verdSoft : T.ink, color: state === 'sent' ? T.verd : '#fff', fontSize: 12.5, fontWeight: 600, cursor: state === 'idle' ? 'pointer' : 'default', fontFamily: T.text }}>
          {state === 'busy' ? '...' : state === 'sent' ? 'Request sent' : 'Ask for intro'}
        </button>
        <button onClick={onView} style={{ padding: '8px 12px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: T.text }}>View</button>
      </div>
    </motion.div>
  )
}

function GigCard({ gig: g, index }: { gig: Gig; index: number }) {
  const rewardColor = g.reward_type === 'paid' ? T.verd : g.reward_type === 'coffee' ? T.ochre : T.inkMuted
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: index * 0.05 }}
      style={{ padding: 18, borderRadius: 16, background: '#fff', boxShadow: 'var(--lift-1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontFamily: T.display, fontSize: 15, fontWeight: 500, color: T.ink }}>{g.title}</div>
        <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: rewardColor, fontFamily: T.text }}>{rewardLabel(g)}</span>
      </div>
      {g.description && <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.45, fontFamily: T.text }}>{g.description}</div>}
      <div style={{ fontSize: 11.5, color: T.inkFaint, fontFamily: T.text }}>{g.provider_name} · {g.provider_credibility} credibility{g.is_mine ? ' · yours' : ''}</div>
    </motion.div>
  )
}

// ── Create event inline ────────────────────────────────────────────────────────
function CreateEventInline({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: '', startsAt: '', location: '', description: '' })
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  function pickImage(file: File | null) { setImage(file); setPreview(file ? URL.createObjectURL(file) : null) }

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
    <div style={{ padding: 18, borderRadius: 16, background: '#fff', boxShadow: 'var(--lift-1)' }}>
      <SectionLabel>Host an event</SectionLabel>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `0.5px dashed ${T.rule}`, background: 'transparent', fontSize: 13, color: T.inkMuted, cursor: 'pointer', fontFamily: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Create event, earn credibility
        </button>
      ) : (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
    <div style={{ padding: 18, borderRadius: 16, background: '#fff', boxShadow: 'var(--lift-1)' }}>
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

// ── Main component ─────────────────────────────────────────────────────────────
export function HomeHub({ maintenance }: { maintenance?: React.ReactNode } = {}) {
  const navigate = useNavigate()
  const [quests, setQuests] = useState<QuestsResp | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [gigs, setGigs] = useState<Gig[]>([])
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [connecting, setConnecting] = useState<Record<string, 'idle' | 'busy' | 'sent'>>({})
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)

  const loadQuests = useCallback(() => { apiGet<QuestsResp>('/api/quests').then(setQuests).catch(() => {}) }, [])
  // Personalized, server-ranked events (with a "why") from the for-you engine.
  const loadEvents = useCallback(() => {
    apiGet<{ events: EventItem[] }>('/api/for-you')
      .then(r => setEvents((r.events ?? []).map(e => ({ ...e, is_host: e.is_host ?? false, rsvped: e.rsvped ?? false }))))
      .catch(() => { apiGet<{ events: EventItem[] }>('/api/events?limit=20').then(r => setEvents(r.events)).catch(() => {}) })
  }, [])
  const loadGigs   = useCallback(() => { apiGet<{ gigs: Gig[] }>('/api/gigs?limit=6').then(r => setGigs(r.gigs)).catch(() => {}) }, [])

  useEffect(() => {
    loadQuests(); loadEvents(); loadGigs()
    apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {})
    apiGet<{ user: Me }>('/api/users/me').then(r => setMe(r.user)).catch(() => {})
    apiGet<{ suggestions: Person[] }>('/api/users/suggestions').then(r => setPeople(r.suggestions ?? [])).catch(() => {})
  }, [loadQuests, loadEvents, loadGigs])

  async function toggleRsvp(id: string) {
    setEvents(evs => evs.map(e => e.id === id ? { ...e, rsvped: !e.rsvped, rsvp_count: e.rsvp_count + (e.rsvped ? -1 : 1) } : e))
    try { await apiPost(`/api/events/${id}/rsvp`, {}) } catch { loadEvents() }
  }

  async function askIntro(p: Person) {
    setConnecting(s => ({ ...s, [p.id]: 'busy' }))
    try {
      await apiPost('/api/connections', { addresseeId: p.id })
      setConnecting(s => ({ ...s, [p.id]: 'sent' }))
    } catch { setConnecting(s => ({ ...s, [p.id]: 'idle' })) }
  }

  const interests    = me?.interests ?? []
  const score        = quests?.credibility_score ?? 0
  const next         = quests?.next_tier ?? null
  const floor        = next ? prevFloor(score, next.at) : score
  const pct          = next ? Math.min(100, Math.round(((score - floor) / (next.at - floor)) * 100)) : 100
  const claimable    = (quests?.quests ?? []).filter(q => q.status === 'claimable')
  const inProgress   = (quests?.quests ?? []).filter(q => q.status === 'locked' && q.progress != null && q.target != null)
  const allQuests    = quests?.quests ?? []

  const rankedEvents = useMemo(() => (
    [...events].sort((a, b) => {
      const ov = overlap(b.interests, interests) - overlap(a.interests, interests)
      if (ov !== 0) return ov
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    })
  ), [events, interests])

  return (
    <>
      <AnimatePresence>
        {selectedQuest && (
          <QuestDetailModal
            quest={selectedQuest}
            onClose={() => setSelectedQuest(null)}
            onClaimed={() => { loadQuests(); setSelectedQuest(null) }}
          />
        )}
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onRsvp={toggleRsvp}
          />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

        {/* ── Relationship OS hero: the core of knotify ─────────────────── */}
        {maintenance && (
          <div style={{ marginBottom: 30 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: T.ink }}>Your relationships</div>
              <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 2, fontFamily: T.text }}>Who to reconnect with today, and why — knotify keeps your network warm so opportunities find you.</div>
            </div>
            {maintenance}
          </div>
        )}

        {/* ── Events for you (personalized) ─────────────────────────────── */}
        <EventsCarousel events={events} interests={interests} onRsvp={toggleRsvp} onOpen={setSelectedEvent} onSeeAll={() => navigate('/events')} />

        {/* ── Contribute: host an event / offer a gig ───────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <SectionLabel>Contribute</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
            <CreateEventInline onCreated={loadEvents} />
            {elig?.can_offer && <CreateGigInline onCreated={() => { loadGigs(); apiGet<Eligibility>('/api/gigs/eligibility').then(setElig).catch(() => {}) }} />}
            {elig && !elig.can_offer && (
              <div style={{ padding: 18, borderRadius: 16, background: '#fff', boxShadow: 'var(--lift-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Lock size={16} color={T.inkFaint} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, fontFamily: T.text }}>Offer gigs at {elig.unlock_at} credibility</div>
                  <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2, fontFamily: T.text }}>You are at {elig.credibility_score}. Browse offers or earn more through quests.</div>
                </div>
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </>
  )
}
