import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCelebrationStore } from '@/store/celebrations'
import { KNOT_PATHS } from '@/lib/knots'
import { spring } from '@/lib/motion'
import { playChime, playFanfare } from '@/lib/sound'

// Mounted once in App. Renders the two celebration surfaces:
//  - trophy-style unlock toasts (top center, self-dismissing)
//  - the full-screen knot ceremony (rank-up / gig unlock)

const GRADE_COLOR: Record<string, string> = {
  easy: 'var(--seal-bronze)',
  medium: 'var(--seal-silver)',
  hard: 'var(--seal-gold)',
}

export function CelebrationLayer() {
  return (
    <>
      <UnlockToasts />
      <KnotCeremony />
    </>
  )
}

function UnlockToasts() {
  const unlocks = useCelebrationStore((s) => s.unlocks)
  const dismiss = useCelebrationStore((s) => s.dismissUnlock)

  useEffect(() => {
    if (unlocks.length > 0) playChime()
  }, [unlocks.length])

  return (
    <div
      style={{
        position: 'fixed', top: 14, left: 0, right: 0, zIndex: 10010,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {unlocks.map((u) => (
          <motion.div
            key={u.id}
            initial={{ y: -84, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -84, opacity: 0, scale: 0.92, transition: { duration: 0.25 } }}
            transition={spring.stamp}
            onClick={() => dismiss(u.id)}
            style={{
              pointerEvents: 'auto', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--ink)', color: 'var(--paper)',
              borderRadius: 14, padding: '11px 18px 11px 12px',
              boxShadow: 'var(--lift-3)',
              position: 'relative', overflow: 'hidden',
              maxWidth: 'min(420px, calc(100vw - 32px))',
            }}
          >
            <div
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: u.grade ? GRADE_COLOR[u.grade] ?? 'var(--foil)' : 'var(--foil)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--paper)',
              }}
            >
              +{u.points}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--foil-bright)', fontWeight: 600 }}>
                Quest complete
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.title}
              </div>
            </div>
            <motion.div
              aria-hidden
              initial={{ left: '-40%' }}
              animate={{ left: '130%' }}
              transition={{ duration: 0.9, delay: 0.35, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: '-30%', width: '26%', height: '160%',
                background: 'rgba(255,255,255,0.16)', transform: 'rotate(20deg)',
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function KnotCeremony() {
  const ceremony = useCelebrationStore((s) => s.ceremony)
  const close = useCelebrationStore((s) => s.closeCeremony)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (ceremony) playFanfare()
  }, [ceremony])

  const dust = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: 6 + ((i * 37) % 88),
        delay: 0.15 + ((i * 13) % 17) / 11,
        size: 3 + ((i * 7) % 5),
        dur: 2 + ((i * 11) % 13) / 9,
      })),
    []
  )

  return (
    <AnimatePresence>
      {ceremony && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          onClick={close}
          role="dialog"
          aria-label={`New rank: ${ceremony.rankName}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 10020, cursor: 'pointer',
            background: 'rgba(20,18,15,0.97)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', padding: 24,
          }}
        >
          {!reduced &&
            dust.map((d, i) => (
              <motion.div
                key={i}
                aria-hidden
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: -320, opacity: [0, 0.9, 0] }}
                transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
                style={{
                  position: 'absolute', bottom: '18%', left: `${d.left}%`,
                  width: d.size, height: d.size, borderRadius: '50%',
                  background: 'var(--foil)',
                }}
              />
            ))}

          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--foil-bright)', fontWeight: 600 }}>
            {ceremony.gigUnlocked ? 'Your knot holds weight now' : 'Your knot grew stronger'}
          </div>

          <svg viewBox="0 0 100 60" style={{ width: 'min(320px, 70vw)', margin: '18px 0 6px' }} aria-hidden>
            <motion.path
              d={KNOT_PATHS[ceremony.rank]}
              fill="none"
              stroke="var(--foil)"
              strokeWidth={3.5}
              strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduced ? 0 : 1.9, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 1.7, ...spring.settle }}
            style={{ textAlign: 'center' }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(34px, 6vw, 52px)', color: 'var(--paper)', letterSpacing: '-0.02em' }}>
              {ceremony.rankName}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(244,239,230,0.72)', marginTop: 8, maxWidth: 420 }}>
              {ceremony.line}
            </div>
            {ceremony.gigUnlocked && (
              <div
                style={{
                  display: 'inline-block', marginTop: 16, padding: '7px 16px', borderRadius: 999,
                  border: '1px solid var(--foil)', color: 'var(--foil-bright)',
                  fontSize: 12.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}
              >
                Gigs unlocked
              </div>
            )}
            <div style={{ marginTop: 26, fontSize: 11.5, color: 'rgba(244,239,230,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tap anywhere to continue
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
