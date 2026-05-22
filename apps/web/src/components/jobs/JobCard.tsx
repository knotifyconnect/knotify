import { MagicCard } from '@/components/magicui/magic-card'
import { BorderBeam } from '@/components/magicui/border-beam'

type JobCardProps = {
  job: {
    id: string
    title: string
    location: string | null
    company?: { name?: string | null } | null
    required_skills?: string[] | null
  }
  hasConnection: boolean
  onOpen: () => void
}

export function JobCard({ job, hasConnection, onOpen }: JobCardProps) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <MagicCard
        className={`relative p-5 bg-[#111118] border rounded-xl cursor-pointer ${
          hasConnection ? 'border-[#f59e0b30]' : 'border-[#ffffff06]'
        }`}
        gradientColor="#7c5cfc"
        gradientOpacity={0.06}
      >
        {hasConnection ? <BorderBeam colorFrom="#f59e0b" colorTo="#7c5cfc" size={80} duration={4} borderWidth={1.5} /> : null}

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-[#f0f0f5]">{job.title}</h3>
            <p className="text-sm text-[#9090a8] mt-0.5">{job.company?.name ?? 'Unknown company'} · {job.location ?? 'Munich'}</p>
          </div>
          {hasConnection ? (
            <span className="flex-shrink-0 text-xs bg-[#f59e0b11] text-[#f59e0b] border border-[#f59e0b30] rounded-full px-3 py-1 font-medium">
              Connection here
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {(job.required_skills ?? []).slice(0, 4).map((skill) => (
            <span key={skill} className="text-xs text-[#5a5a72] bg-[#ffffff05] border border-[#ffffff08] rounded-full px-2 py-0.5">
              {skill}
            </span>
          ))}
        </div>
      </MagicCard>
    </button>
  )
}
