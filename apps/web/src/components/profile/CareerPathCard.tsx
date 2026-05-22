import { GlowingStarsBackgroundCard, GlowingStarsDescription, GlowingStarsTitle } from '@/components/ui/glowing-stars'

type CareerPath = {
  title?: string
  description?: string
  matchScore?: number
  skillGaps?: Array<{ skill?: string; priority?: string }>
}

export function CareerPathCard({ path }: { path: CareerPath }) {
  return (
    <GlowingStarsBackgroundCard>
      <GlowingStarsTitle>{path.title ?? 'Suggested Path'}</GlowingStarsTitle>
      <div className="flex items-end justify-between gap-2">
        <GlowingStarsDescription>{path.description ?? 'No description available.'}</GlowingStarsDescription>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-2xl text-[#a8ffb0]">{path.matchScore ?? 0}%</span>
          <span className="text-xs text-[#5a5a72] uppercase tracking-widest">match</span>
        </div>
      </div>
      {path.skillGaps?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {path.skillGaps.slice(0, 3).map((gap, idx) => (
            <span key={`${gap.skill}-${idx}`} className="text-xs text-[#f59e0b80] border border-[#f59e0b20] rounded-full px-2 py-0.5">
              + {gap.skill ?? 'Skill'}
            </span>
          ))}
        </div>
      ) : null}
    </GlowingStarsBackgroundCard>
  )
}
