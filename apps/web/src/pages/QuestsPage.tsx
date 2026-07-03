import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion'
import { Camera, Check, Clock, Hourglass, Users, Volume2, VolumeX, X } from 'lucide-react'
import { apiGet, apiPost, apiPostForm } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'
import { KNOT_RANKS, KnotGlyph, nextRankForScore, rankByName, rankForScore } from '@/lib/knots'
import { cascade, cascadeItem, spring } from '@/lib/motion'
import { playThunk, setSoundEnabled, soundEnabled } from '@/lib/sound'
import { useCelebrationStore } from '@/store/celebrations'
import { TiltCard } from '@/components/ui/TiltCard'

type Quest = {
  key: string
  title: string
  description: string
  points: number
  category: 'profile' | 'network' | 'social' | 'explore' | 'give'
  type: 'verified' | 'self'
  icon: string
  progress?: number
  target?: number
  status: 'completed' | 'claimable' | 'locked'
  how_to?: string | null
  where_to_go?: string | null
  estimated_minutes?: number | null
  difficulty?: 'easy' | 'medium' | 'hard' | null
  partner_required?: boolean
  completed_at?: string | null
  photo_url?: string | null
  ends_at?: string | null
  signature?: Signature | null
}

type Person = { id: string; full_name: string | null; username: string | null; avatar_url: string | null }

type Signature = {
  id: string
  status: 'pending' | 'signed' | 'declined'
  signed_at: string | null
  signer: Person | null
}

type IncomingSignatureRequest = {
  id: string
  quest_key: string
  quest_title: string
  created_at: string
  requester: Person | null
}

type QuestsResponse = {
  credibility_score: number
  tier: string
  next_tier: { name: string; at: number } | null
  gig_unlocked: boolean
  gig_unlock_at: number
  weekly_delta: number
  percentile: number | null
  streak: number
  quests: Quest[]
  incoming_signature_requests?: IncomingSignatureRequest[]
}

const CATEGORY_ORDER: Quest['category'][] = ['profile', 'network', 'social', 'explore', 'give']
const CATEGORY_LABEL: Record<Quest['category'], string> = {
  profile: 'Profile',
  network: 'Network',
  social: 'Social',
  explore: 'Explore',
  give: 'Give back',
}

const GRADE_COLOR: Record<string, string> = {
  easy: 'var(--seal-bronze)',
  medium: 'var(--seal-silver)',
  hard: 'var(--seal-gold)',
}

const serif = 'var(--font-display)'

export function QuestsPage() {
  const [data, setData] = useState<QuestsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selfClaim, setSelfClaim] = useState<Quest | null>(null)
  const [signQuest, setSignQuest] = useState<Quest | null>(null)
  const [justClaimed, setJustClaimed] = useState<string | null>(null)
  const [sound, setSound] = useState(soundEnabled())
  const pushUnlock = useCelebrationStore((s) => s.pushUnlock)
  const openCeremony = useCelebrationStore((s) => s.openCeremony)
  const reduced = useReducedMotion()

  const load = useCallback(async () => {
    try {
      setData(await apiGet<QuestsResponse>('/api/quests'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const claim = useCallback(
    async (quest: Quest, photo?: File, shareToFeed?: boolean) => {
      if (quest.type === 'self' && !photo) {
        setSelfClaim(quest)
        return
      }
      setClaiming(quest.key)
      setError(null)
      try {
        const form = new FormData()
        if (photo) form.append('photo', photo)
        form.append('shareToFeed', shareToFeed ? 'true' : 'false')
        const res = await apiPostForm<{ ok: boolean; credibility_score: number; awarded: number }>(
          `/api/quests/${quest.key}/claim`,
          form
        )
        setSelfClaim(null)
        setJustClaimed(quest.key)
        playThunk()
        pushUnlock({ title: quest.title, points: res.awarded, grade: quest.difficulty })

        const oldScore = data?.credibility_score ?? 0
        const oldRank = rankForScore(oldScore)
        const newRank = rankForScore(res.credibility_score)
        if (newRank.min > oldRank.min) {
          setTimeout(() => {
            openCeremony({
              rank: newRank.key,
              rankName: newRank.name,
              line: newRank.line,
              gigUnlocked: oldScore < 70 && res.credibility_score >= 70,
            })
          }, 1100)
        }
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not claim quest')
      } finally {
        setClaiming(null)
      }
    },
    [data?.credibility_score, load, openCeremony, pushUnlock]
  )

  const requestSignature = useCallback(
    async (quest: Quest, signerId: string) => {
      setError(null)
      try {
        await apiPost(`/api/quests/${quest.key}/signature-request`, { signer_id: signerId })
        setSignQuest(null)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the request')
      }
    },
    [load]
  )

  const respondSignature = useCallback(
    async (req: IncomingSignatureRequest, action: 'sign' | 'decline') => {
      setError(null)
      try {
        await apiPost(`/api/quests/signatures/${req.id}/respond`, { action })
        if (action === 'sign') playThunk()
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not answer the request')
      }
    },
    [load]
  )

  const { chapters, byCategory } = useMemo(() => {
    const quests = data?.quests ?? []
    const chapters = quests.filter((q) => q.ends_at)
    const rest = quests.filter((q) => !q.ends_at)
    const byCategory = new Map<Quest['category'], Quest[]>()
    for (const c of CATEGORY_ORDER) byCategory.set(c, [])
    for (const q of rest) {
      if (!byCategory.has(q.category)) byCategory.set(q.category, [])
      byCategory.get(q.category)!.push(q)
    }
    return { chapters, byCategory }
  }, [data?.quests])

  if (loading) return <JournalSkeleton />
  if (!data) {
    return (
      <div style={{ padding: 48, color: 'var(--signal)', fontSize: 14 }}>
        {error ?? 'Something went wrong.'}
      </div>
    )
  }

  const claimableCount = data.quests.filter((q) => q.status === 'claimable').length

  return (
    <motion.div
      key={justClaimed ?? 'steady'}
      animate={justClaimed && !reduced ? { x: [0, -4, 4, -2, 2, 0] } : {}}
      transition={{ duration: 0.35 }}
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: 'clamp(20px, 4vw, 40px)',
        fontFamily: 'var(--font-text)',
        color: 'var(--ink)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
            Quests
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14.5, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
            Real-world things worth doing. Each one you complete builds your credibility and ties your knot a little tighter.
          </p>
        </div>
        <button
          onClick={() => {
            setSoundEnabled(!sound)
            setSound(!sound)
          }}
          aria-label={sound ? 'Mute celebration sounds' : 'Unmute celebration sounds'}
          title={sound ? 'Sound on' : 'Sound off'}
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
            border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', color: 'var(--ink-muted)',
            display: 'grid', placeItems: 'center',
          }}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      <RankPassport data={data} />

      {(data.incoming_signature_requests ?? []).length > 0 && (
        <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          {data.incoming_signature_requests!.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.settle}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                background: 'var(--paper-soft)', border: '0.5px solid var(--foil)',
                borderRadius: 14, padding: '12px 16px', boxShadow: 'var(--lift-1)',
              }}
            >
              <PersonBadge person={r.requester} />
              <div style={{ flex: 1, minWidth: 180, fontSize: 13.5, color: 'var(--ink-soft)' }}>
                <strong>{r.requester?.full_name ?? 'Someone'}</strong> asks you to countersign{' '}
                <span style={{ fontFamily: serif, fontStyle: 'italic' }}>{r.quest_title}</span>. Were you there?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => void respondSignature(r, 'sign')}
                  style={{ padding: '7px 16px', borderRadius: 999, border: 'none', background: 'var(--verd)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-text)' }}
                >
                  Sign it
                </motion.button>
                <button
                  onClick={() => void respondSignature(r, 'decline')}
                  style={{ padding: '7px 14px', borderRadius: 999, border: '0.5px solid var(--rule)', background: 'transparent', color: 'var(--ink-muted)', fontSize: 12.5, cursor: 'pointer' }}
                >
                  I was not
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ margin: '16px 0', border: '0.5px solid rgba(216,68,43,0.3)', background: 'rgba(216,68,43,0.07)', color: 'var(--signal)', borderRadius: 12, padding: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {claimableCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ margin: '18px 0 0', fontSize: 13.5, color: 'var(--verd)', fontWeight: 600 }}
        >
          {claimableCount} quest{claimableCount === 1 ? '' : 's'} ready to complete
        </motion.div>
      )}

      {chapters.length > 0 && (
        <ChapterSection quests={chapters} claiming={claiming} claim={claim} expanded={expanded} setExpanded={setExpanded} justClaimed={justClaimed} askSignature={setSignQuest} />
      )}

      {CATEGORY_ORDER.map((cat) => {
        const quests = byCategory.get(cat) ?? []
        if (quests.length === 0) return null
        return (
          <CategorySection
            key={cat}
            category={cat}
            quests={quests}
            claiming={claiming}
            claim={claim}
            expanded={expanded}
            setExpanded={setExpanded}
            justClaimed={justClaimed}
            askSignature={setSignQuest}
          />
        )
      })}

      <CityFog />

      <AnimatePresence>
        {selfClaim && (
          <SelfClaimModal
            quest={selfClaim}
            busy={claiming === selfClaim.key}
            onClose={() => setSelfClaim(null)}
            onSubmit={(photo, share) => void claim(selfClaim, photo, share)}
          />
        )}
        {signQuest && (
          <SignerPickerModal
            quest={signQuest}
            onClose={() => setSignQuest(null)}
            onPick={(signerId) => void requestSignature(signQuest, signerId)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ── Rank passport: the dark card with the knot journey ─────────────────── */

function AnimatedNumber({ value, style }: { value: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced || prev.current === value) {
      el.textContent = String(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        el.textContent = String(Math.round(v))
      },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, reduced])

  return (
    <span ref={ref} style={style}>
      {value}
    </span>
  )
}

function RankPassport({ data }: { data: QuestsResponse }) {
  const score = data.credibility_score
  const rank = rankByName(data.tier)
  const next = nextRankForScore(score)
  const cap = KNOT_RANKS[KNOT_RANKS.length - 1].min

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.settle}
      style={{
        background: 'var(--ink)', color: 'var(--paper)', borderRadius: 20,
        padding: 'clamp(20px, 3vw, 28px)', boxShadow: 'var(--lift-2)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', right: -40, top: -40, width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,148,31,0.18) 0%, transparent 70%)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(244,239,230,0.55)' }}>
            Credibility
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
            <AnimatedNumber value={score} style={{ fontFamily: serif, fontSize: 54, lineHeight: 1 }} />
            <div>
              <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 20, color: 'var(--foil-bright)' }}>{rank.name}</div>
              {data.percentile != null && (
                <div style={{ fontSize: 11.5, color: 'rgba(244,239,230,0.5)' }}>top {data.percentile}% in Munich</div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.weekly_delta > 0 && (
            <div style={{ padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(244,239,230,0.1)', color: 'rgba(244,239,230,0.75)' }}>
              +{data.weekly_delta} this week
            </div>
          )}
          <div
            style={{
              padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: data.gig_unlocked ? 'rgba(31,107,94,0.35)' : 'rgba(244,239,230,0.1)',
              color: data.gig_unlocked ? '#7fd6a0' : 'rgba(244,239,230,0.75)',
            }}
          >
            {data.gig_unlocked ? 'Holds weight: gigs open' : `${data.gig_unlock_at - score} to Bowline, gigs open there`}
          </div>
        </div>
      </div>

      {/* Knot journey */}
      <div style={{ marginTop: 26, position: 'relative', height: 74 }}>
        <div style={{ position: 'absolute', top: 26, left: 0, right: 0, height: 3, background: 'rgba(244,239,230,0.14)', borderRadius: 2 }} />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (score / cap) * 100)}%` }}
          transition={{ ...spring.heavy, delay: 0.3 }}
          style={{ position: 'absolute', top: 26, left: 0, height: 3, background: 'var(--foil)', borderRadius: 2 }}
        />
        {KNOT_RANKS.map((r) => {
          const reached = score >= r.min
          const pos = (r.min / cap) * 100
          return (
            <div
              key={r.key}
              style={{
                position: 'absolute', top: 0,
                left: `${pos}%`,
                transform: pos === 0 ? 'none' : pos === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                textAlign: pos === 0 ? 'left' : pos === 100 ? 'right' : 'center',
              }}
            >
              <div style={{ color: reached ? 'var(--foil)' : 'rgba(244,239,230,0.35)', display: 'flex', justifyContent: pos === 0 ? 'flex-start' : pos === 100 ? 'flex-end' : 'center' }}>
                <KnotGlyph rank={r.key} width={54} strokeWidth={4.5} />
              </div>
              <div style={{ fontSize: 11, marginTop: 2, color: reached ? 'var(--paper)' : 'rgba(244,239,230,0.45)', whiteSpace: 'nowrap' }}>
                {r.name}
                <span style={{ color: 'rgba(244,239,230,0.4)' }}> · {r.min}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12.5, color: 'rgba(244,239,230,0.6)', position: 'relative' }}>
        {next
          ? `${next.min - score} points until your rope ties a ${next.name.toLowerCase()}.`
          : 'Masthead. The whole harbour is tied to you.'}
      </div>
    </motion.div>
  )
}

/* ── Sections ────────────────────────────────────────────────────────────── */

type SectionProps = {
  quests: Quest[]
  claiming: string | null
  claim: (q: Quest) => void | Promise<void>
  expanded: string | null
  setExpanded: (k: string | null) => void
  justClaimed: string | null
  askSignature: (q: Quest) => void
}

function ChapterSection({ quests, ...rest }: SectionProps) {
  const soonest = quests
    .map((q) => q.ends_at)
    .filter(Boolean)
    .sort()[0]
  const daysLeft = soonest ? Math.max(0, Math.ceil((new Date(soonest).getTime() - Date.now()) / 86400000)) : null

  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Hourglass size={15} color="var(--signal)" />
          <span style={{ fontFamily: serif, fontSize: 19, fontWeight: 500 }}>Limited time</span>
        </div>
        {daysLeft != null && (
          <span style={{ fontSize: 12, color: 'var(--signal)', fontWeight: 600 }}>
            {daysLeft === 0 ? 'Last day' : `Closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-muted)' }}>
        These quests close when the season ends and can't be earned again.
      </p>
      <QuestGrid quests={quests} {...rest} />
    </section>
  )
}

function CategorySection({ category, quests, ...rest }: SectionProps & { category: Quest['category'] }) {
  const done = quests.filter((q) => q.status === 'completed').length
  const complete = done === quests.length

  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: serif, fontSize: 19, fontWeight: 500 }}>{CATEGORY_LABEL[category]}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            {done} of {quests.length}
          </span>
          {complete && (
            <motion.div
              initial={{ scale: 2, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: -8 }}
              transition={spring.stamp}
              title={`${CATEGORY_LABEL[category]} seal earned`}
              style={{
                width: 30, height: 30, borderRadius: '50%', background: 'var(--verd)',
                display: 'grid', placeItems: 'center', color: 'var(--paper)',
                boxShadow: 'var(--lift-1)',
              }}
            >
              <Check size={15} />
            </motion.div>
          )}
        </div>
      </div>
      <QuestGrid quests={quests} {...rest} />
    </section>
  )
}

function QuestGrid({ quests, claiming, claim, expanded, setExpanded, justClaimed, askSignature }: SectionProps) {
  return (
    <motion.div
      variants={cascade}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}
    >
      {quests.map((q) => (
        <motion.div key={q.key} variants={cascadeItem}>
          <QuestCard
            quest={q}
            busy={claiming === q.key}
            onClaim={() => void claim(q)}
            expanded={expanded === q.key}
            onToggle={() => setExpanded(expanded === q.key ? null : q.key)}
            justClaimed={justClaimed === q.key}
            onAskSignature={() => askSignature(q)}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── Quest card ──────────────────────────────────────────────────────────── */

function QuestCard({
  quest: q,
  busy,
  onClaim,
  expanded,
  onToggle,
  justClaimed,
  onAskSignature,
}: {
  quest: Quest
  busy: boolean
  onClaim: () => void
  expanded: boolean
  onToggle: () => void
  justClaimed: boolean
  onAskSignature: () => void
}) {
  const completed = q.status === 'completed'
  const claimable = q.status === 'claimable'

  return (
    <TiltCard
      maxTilt={completed ? 0 : 6}
      style={{
        background: 'var(--paper-soft)',
        border: `0.5px solid ${claimable ? 'var(--foil)' : 'var(--rule)'}`,
        borderRadius: 16,
        boxShadow: claimable ? 'var(--lift-2)' : 'var(--lift-1)',
        position: 'relative',
        overflow: 'hidden',
        opacity: q.status === 'locked' ? 0.92 : 1,
        height: '100%',
      }}
    >
      <div onClick={onToggle} style={{ cursor: 'pointer', padding: 16, position: 'relative', transformStyle: 'preserve-3d', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, transform: 'translateZ(18px)' }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: q.difficulty ? GRADE_COLOR[q.difficulty] : 'var(--foil)',
              color: 'var(--paper)', display: 'grid', placeItems: 'center',
              fontFamily: serif, fontSize: 12,
            }}
            title={q.difficulty ? `${q.difficulty} quest` : undefined}
          >
            +{q.points}
          </div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, color: q.type === 'verified' ? 'var(--verd)' : 'var(--plum)' }}>
            {q.type === 'verified' ? 'Verified' : 'On your honour'}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-faint)' }}>
            {q.partner_required && <Users size={13} aria-label="Needs another person" />}
            {q.estimated_minutes != null && (
              <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Clock size={11} /> {q.estimated_minutes}m
              </span>
            )}
            <span style={{ color: 'var(--ink-faint)' }}>
              <QuestIcon name={q.icon} size={15} />
            </span>
          </div>
        </div>

        <div style={{ fontFamily: serif, fontSize: 18.5, margin: '10px 0 4px', letterSpacing: '-0.01em', transform: 'translateZ(14px)' }}>
          {q.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.5, transform: 'translateZ(8px)' }}>
          {q.description}
        </div>

        {typeof q.progress === 'number' && typeof q.target === 'number' && !completed && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--paper-deep)' }}>
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(q.progress / q.target) * 100}%` }}
                viewport={{ once: true }}
                transition={{ ...spring.heavy, delay: 0.2 }}
                style={{ height: '100%', borderRadius: 999, background: 'var(--foil)' }}
              />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
              {q.progress}/{q.target}
            </span>
          </div>
        )}

        {/* expandable field notes */}
        <AnimatePresence initial={false}>
          {expanded && (q.how_to || q.where_to_go) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--rule)', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                {q.how_to && <p style={{ margin: 0 }}>{q.how_to}</p>}
                {q.where_to_go && (
                  <p style={{ margin: '8px 0 0', color: 'var(--ink-muted)' }}>
                    <span style={{ fontWeight: 600 }}>Where:</span> {q.where_to_go}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* footer */}
        <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, transform: 'translateZ(12px)' }}>
          {completed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, flexWrap: 'wrap' }}>
              {q.photo_url && (
                <img
                  src={q.photo_url}
                  alt="Your evidence photo"
                  style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', border: '2px solid var(--paper)', boxShadow: 'var(--lift-1)', transform: 'rotate(-3deg)' }}
                />
              )}
              <span style={{ fontSize: 12, color: 'var(--verd)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Check size={13} /> Completed {q.completed_at ? new Date(q.completed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : ''}
              </span>
              {q.partner_required && (
                q.signature?.status === 'signed' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Check size={12} color="var(--verd)" />
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 500 }}>
                      Verified by {q.signature.signer?.full_name ?? 'a friend'}
                    </span>
                  </span>
                ) : q.signature?.status === 'pending' ? (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                    Awaiting {q.signature.signer?.full_name ?? 'their'} signature…
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onAskSignature()
                    }}
                    style={{
                      padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                      border: '1px dashed var(--rule)', background: 'transparent', color: 'var(--ink-muted)',
                    }}
                  >
                    Ask for a countersignature
                  </button>
                )
              )}
            </div>
          ) : claimable ? (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={(e) => {
                e.stopPropagation()
                onClaim()
              }}
              disabled={busy}
              style={{
                padding: '8px 18px', borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer',
                background: 'var(--signal)', color: '#fff', fontSize: 12.5, fontWeight: 600,
                fontFamily: 'var(--font-text)', boxShadow: 'var(--lift-1)',
              }}
            >
              {busy ? 'Completing…' : q.type === 'self' ? 'Add photo & complete' : 'Complete'}
            </motion.button>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink-faint)', minHeight: 34, display: 'inline-flex', alignItems: 'center' }}>
              In progress. Tap for field notes.
            </span>
          )}
        </div>

        {/* completed badge */}
        {completed && (
          <motion.div
            initial={justClaimed ? { scale: 1.8, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.stamp}
            aria-hidden
            style={{
              position: 'absolute', top: 12, right: 12, width: 30, height: 30,
              borderRadius: '50%', background: 'var(--verd)', color: '#fff',
              display: 'grid', placeItems: 'center', boxShadow: 'var(--lift-1)',
            }}
          >
            <Check size={16} />
          </motion.div>
        )}
      </div>
    </TiltCard>
  )
}

/* ── District progress: the city clears as you actually go ───────────────── */

type DistrictInfo = { key: string; name: string; visited: boolean; via: string | null }
type DistrictsResponse = { total: number; visited_count: number; districts: DistrictInfo[] }

function CityFog() {
  const [data, setData] = useState<DistrictsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiGet<DistrictsResponse>('/api/quests/districts')
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  if (failed) return null

  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: serif, fontSize: 19, fontWeight: 500 }}>Districts explored</span>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
            {data.visited_count} of {data.total} districts
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-muted)', maxWidth: 560 }}>
        Munich clears district by district, but only when you actually go: a café check-in, a meeting, an event. No shortcuts.
      </p>
      {!data ? (
        <div className="bg-skeleton-gradient animate-skeleton-loading" style={{ height: 170, borderRadius: 16, backgroundSize: '200% 100%' }} />
      ) : (
        <motion.div
          variants={cascade}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 7 }}
        >
          {data.districts.map((d) => (
            <motion.div
              key={d.key}
              variants={cascadeItem}
              title={d.visited ? `${d.name} · cleared. ${d.via ?? ''}` : 'Still under fog. Go there.'}
              style={{
                aspectRatio: '1.6', borderRadius: 10, padding: 8,
                display: 'flex', alignItems: 'flex-end',
                background: d.visited ? 'var(--verd-soft)' : 'var(--paper-deep)',
                border: `0.5px solid ${d.visited ? 'var(--verd)' : 'var(--rule)'}`,
                color: d.visited ? 'var(--verd)' : 'var(--ink-faint)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {!d.visited && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0, opacity: 0.5,
                    backgroundImage: 'radial-gradient(rgba(84,72,58,0.35) 1px, transparent 1px)',
                    backgroundSize: '6px 6px',
                  }}
                />
              )}
              <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25, position: 'relative' }}>
                {d.visited ? d.name : '???'}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  )
}

/* ── People: avatar badge + signer picker ────────────────────────────────── */

function PersonBadge({ person }: { person: Person | null }) {
  const initials = (person?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return person?.avatar_url ? (
    <img src={person.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--paper-deep)', color: 'var(--ink-muted)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>
      {initials}
    </div>
  )
}

function SignerPickerModal({
  quest,
  onClose,
  onPick,
}: {
  quest: Quest
  onClose: () => void
  onPick: (signerId: string) => void
}) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ connections: Array<{ status: string; user: Person | null }> }>('/api/connections')
      .then((r) =>
        setPeople(
          r.connections
            .filter((c) => c.status === 'accepted' && c.user)
            .map((c) => c.user!)
        )
      )
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load your knot'))
  }, [])

  return (
    <motion.div className="k-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="k-modal-card"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={spring.settle}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', maxWidth: 440 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--verd)', fontWeight: 600 }}>
              Countersignature
            </div>
            <div style={{ fontFamily: serif, fontSize: 21, margin: '4px 0 6px' }}>Who was there with you?</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
          They confirm <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{quest.title}</span> happened, and their name is recorded on your profile.
        </p>
        {loadError && <div style={{ color: 'var(--signal)', fontSize: 13, marginBottom: 10 }}>{loadError}</div>}
        {people == null && !loadError && <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading your knot…</div>}
        {people != null && people.length === 0 && (
          <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            No one in your knot yet. Connect with the person first, then ask for their signature.
          </div>
        )}
        <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {(people ?? []).map((p) => (
            <button
              key={p.id}
              disabled={busy != null}
              onClick={() => {
                setBusy(p.id)
                onPick(p.id)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
                border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', borderRadius: 12, padding: '9px 12px',
                fontFamily: 'var(--font-text)', color: 'var(--ink)',
              }}
            >
              <PersonBadge person={p} />
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.full_name ?? p.username ?? 'Member'}</span>
              {busy === p.id && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-faint)' }}>Asking…</span>}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Self-quest claim modal: honour + photo evidence ─────────────────────── */

function SelfClaimModal({
  quest,
  busy,
  onClose,
  onSubmit,
}: {
  quest: Quest
  busy: boolean
  onClose: () => void
  onSubmit: (photo: File, shareToFeed: boolean) => void
}) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [share, setShare] = useState(true)

  useEffect(() => {
    if (!photo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  return (
    <motion.div
      className="k-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="k-modal-card"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={spring.settle}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', maxWidth: 480 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--plum)', fontWeight: 600 }}>
              On your honour
            </div>
            <div style={{ fontFamily: serif, fontSize: 22, margin: '4px 0 6px' }}>{quest.title}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.55, margin: '0 0 16px' }}>
          Credibility on knotify is built on trust. Add a photo from the moment to complete this quest.
        </p>

        <label
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            border: '1.5px dashed var(--rule)', borderRadius: 14, padding: preview ? 10 : 28,
            cursor: 'pointer', background: 'var(--paper-soft)', textAlign: 'center',
          }}
        >
          {preview ? (
            <img src={preview} alt="Selected evidence" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10 }} />
          ) : (
            <>
              <Camera size={22} color="var(--ink-faint)" />
              <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Add your photo evidence</span>
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Share this moment to the community feed
        </label>

        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={!photo || busy}
          onClick={() => photo && onSubmit(photo, share)}
          style={{
            marginTop: 18, width: '100%', padding: '12px 0', borderRadius: 999, border: 'none',
            background: photo ? 'var(--signal)' : 'var(--rule)', color: photo ? '#fff' : 'var(--ink-faint)',
            fontSize: 14, fontWeight: 600, cursor: photo ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-text)',
          }}
        >
          {busy ? 'Completing…' : `Complete quest · +${quest.points}`}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function JournalSkeleton() {
  const block = (h: number, w: string, r = 12) => (
    <div className="bg-skeleton-gradient animate-skeleton-loading" style={{ height: h, width: w, borderRadius: r, backgroundSize: '200% 100%' }} />
  )
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)', display: 'grid', gap: 16 }}>
      {block(14, '90px', 4)}
      {block(38, 'min(320px, 60%)', 8)}
      {block(190, '100%', 20)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14, marginTop: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-skeleton-gradient animate-skeleton-loading" style={{ height: 150, borderRadius: 16, backgroundSize: '200% 100%' }} />
        ))}
      </div>
    </div>
  )
}
