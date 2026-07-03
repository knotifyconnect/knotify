import { forwardRef } from 'react'

// ─────────────────────────────────────────────────────────────
// Knot ranks. Credibility ties your place in the network:
// a loose end becomes an overhand, a bowline (holds weight —
// gigs unlock), and finally a masthead people hold onto.
// Thresholds mirror apps/api/src/routes/quests.ts TIERS.
// ─────────────────────────────────────────────────────────────

export type KnotRankKey = 'loose_end' | 'overhand' | 'bowline' | 'masthead'

export type KnotRank = {
  key: KnotRankKey
  name: string
  min: number
  line: string
}

export const KNOT_RANKS: KnotRank[] = [
  { key: 'loose_end', name: 'Loose end', min: 0, line: 'You arrived. Every rope starts loose.' },
  { key: 'overhand', name: 'Overhand', min: 30, line: 'Your first real ties hold.' },
  { key: 'bowline', name: 'Bowline', min: 70, line: 'The knot that holds weight. Gigs unlocked.' },
  { key: 'masthead', name: 'Masthead', min: 120, line: 'People hold onto you now.' },
]

export function rankForScore(score: number): KnotRank {
  let r = KNOT_RANKS[0]
  for (const x of KNOT_RANKS) if (score >= x.min) r = x
  return r
}

export function rankByName(name: string): KnotRank {
  return KNOT_RANKS.find((r) => r.name === name) ?? KNOT_RANKS[0]
}

export function nextRankForScore(score: number): KnotRank | null {
  return KNOT_RANKS.find((r) => r.min > score) ?? null
}

// Single-stroke rope drawings (viewBox 0 0 100 60). One continuous path per
// knot so ceremonies can draw them with stroke-dashoffset.
export const KNOT_PATHS: Record<KnotRankKey, string> = {
  loose_end: 'M8,32 C30,20 52,42 74,30 C81,26 87,28 92,31',
  overhand: 'M6,34 C28,8 62,6 58,30 C55,48 32,48 37,28 C42,10 68,16 94,32',
  bowline:
    'M5,36 C22,10 48,8 52,28 C55,44 36,50 30,36 C25,24 44,18 56,24 C66,29 62,44 50,42 C40,40 42,28 52,30 C68,33 80,28 95,32',
  masthead:
    'M10,32 C18,8 44,6 46,28 C48,48 22,50 24,30 C26,13 52,11 54,30 C56,47 32,51 34,33 C36,16 62,14 64,31 C66,46 44,49 47,33 C50,17 76,20 92,31',
}

export const KnotPath = forwardRef<
  SVGPathElement,
  { rank: KnotRankKey; stroke?: string; strokeWidth?: number }
>(function KnotPath({ rank, stroke = 'currentColor', strokeWidth = 3.5 }, ref) {
  return (
    <path
      ref={ref}
      d={KNOT_PATHS[rank]}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  )
})

/** Static knot glyph, sized like an icon. */
export function KnotGlyph({
  rank,
  width = 88,
  stroke = 'currentColor',
  strokeWidth = 3.5,
}: {
  rank: KnotRankKey
  width?: number
  stroke?: string
  strokeWidth?: number
}) {
  return (
    <svg viewBox="0 0 100 60" width={width} height={width * 0.6} aria-hidden="true">
      <KnotPath rank={rank} stroke={stroke} strokeWidth={strokeWidth} />
      {rank === 'loose_end' && (
        <g stroke={stroke} strokeWidth={strokeWidth * 0.55} strokeLinecap="round" fill="none" opacity={0.7}>
          <path d="M92,31 l-6,-5" />
          <path d="M92,31 l-5,6" />
        </g>
      )}
    </svg>
  )
}
