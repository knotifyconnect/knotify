import type { Transition, Variants } from 'framer-motion'

// ─────────────────────────────────────────────────────────────
// knotify motion — one vocabulary for the whole app.
// Springs carry the "game feel": nothing eases linearly,
// everything settles with weight.
// ─────────────────────────────────────────────────────────────

export const spring = {
  /** UI feedback: presses, toggles, chips. Fast, barely bouncy. */
  snap: { type: 'spring', stiffness: 560, damping: 34, mass: 0.7 } as Transition,
  /** Cards, panels, list items settling into place. */
  settle: { type: 'spring', stiffness: 280, damping: 26 } as Transition,
  /** Celebratory: stamps, seals, ceremony elements. Visible overshoot. */
  stamp: { type: 'spring', stiffness: 340, damping: 17, mass: 0.9 } as Transition,
  /** Big slow-weight elements (ceremony backdrop, hero blocks). */
  heavy: { type: 'spring', stiffness: 120, damping: 22, mass: 1.2 } as Transition,
}

/** Staggered container: children cascade in like dealt cards. */
export const cascade: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

export const cascadeItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.settle },
}

/** Section entrance for page-level blocks. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: spring.settle },
}

/** Interactive card affordance: lift on hover, compress on press. */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: spring.snap,
}

/** Buttons: compress and rebound. */
export const pushable = {
  whileTap: { scale: 0.95 },
  transition: spring.snap,
}
