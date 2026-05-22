import { StickyScroll } from '@/components/ui/sticky-scroll-reveal'

const features = [
  {
    title: 'Your network on a map',
    description:
      'Not a list. Not a feed. A live map of Munich showing everyone you are connected to, where they work, and whether they are online. Your network becomes visible for the first time.',
    content: (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[#0d1117]">
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        <svg width="100%" height="100%" viewBox="0 0 300 200">
          <line x1="80" y1="60" x2="150" y2="100" stroke="#7c5cfc" strokeWidth="0.5" opacity="0.4" />
          <line x1="150" y1="100" x2="220" y2="70" stroke="#7c5cfc" strokeWidth="0.5" opacity="0.4" />
          <line x1="150" y1="100" x2="180" y2="150" stroke="#7c5cfc" strokeWidth="0.5" opacity="0.4" />
          <line x1="80" y1="60" x2="60" y2="130" stroke="#7c5cfc" strokeWidth="0.5" opacity="0.2" />

          <circle cx="150" cy="100" r="8" fill="#7c5cfc" opacity="0.9" />
          <circle cx="150" cy="100" r="14" fill="#7c5cfc" opacity="0.15" />
          <circle cx="80" cy="60" r="6" fill="#7c5cfc" opacity="0.7" />
          <circle cx="220" cy="70" r="6" fill="#7c5cfc" opacity="0.7" />
          <circle cx="180" cy="150" r="6" fill="#f59e0b" opacity="0.9" />
          <circle cx="180" cy="150" r="12" fill="#f59e0b" opacity="0.15" />
          <circle cx="60" cy="130" r="5" fill="#7c5cfc" opacity="0.4" />
          <circle cx="240" cy="140" r="5" fill="#7c5cfc" opacity="0.4" />
          <text x="196" y="148" fontSize="8" fill="#f59e0b" opacity="0.8">
            BMW
          </text>
        </svg>
        <div className="absolute bottom-4 left-4 rounded-lg border border-[#f59e0b33] bg-[#f59e0b11] px-3 py-2">
          <p className="text-xs font-medium text-[#f59e0b]">1 connection at BMW</p>
          <p className="text-xs text-[#f59e0b80]">Request referral →</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Real referrals, not endorsements',
    description:
      'When you find a role and a connection works there, request a referral in one click. They submit structured context that goes directly to HR with your application.',
    content: (
      <div className="flex h-full w-full flex-col gap-4 rounded-xl bg-[#111118] p-6">
        <div className="rounded-lg border border-[#7c5cfc33] bg-[#1a1a24] p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-[#7c5cfc]">Referral from Sofia Chen</p>
          <p className="mb-1 text-sm font-medium text-[#f0f0f5]">For: Junior Product Manager · Celonis</p>
          <div className="mt-3 flex gap-2">
            {['Problem solving', 'Collaboration', 'Role fit'].map((label) => (
              <span key={label} className="rounded-full border border-[#14b8a620] bg-[#14b8a610] px-2 py-0.5 text-xs text-[#14b8a6]">
                {label}: Exceptional
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-[#1a1a24] p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-[#5a5a72]">Recommendation</p>
          <p className="text-sm italic leading-relaxed text-[#9090a8]">
            "Lukas is one of the most resourceful people I&apos;ve worked with at TUM. He&apos;ll bring real energy to this role."
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-[#14b8a620]" />
          <span className="text-xs text-[#14b8a6]">Submitted to HR ✓</span>
          <div className="h-px flex-1 bg-[#14b8a620]" />
        </div>
      </div>
    ),
  },
  {
    title: 'AI reads your CV, you verify the truth',
    description:
      'Upload your CV. AI extracts skills, maps likely career paths, and identifies gaps. You verify each skill before it becomes part of your profile.',
    content: (
      <div className="flex h-full w-full flex-col gap-3 rounded-xl bg-[#111118] p-6">
        <p className="text-xs uppercase tracking-widest text-[#5a5a72]">Extracted skills</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Python', verified: true },
            { name: 'SQL', verified: true },
            { name: 'Figma', verified: true },
            { name: 'Product Strategy', verified: false },
            { name: 'React', verified: false },
          ].map((skill) => (
            <span
              key={skill.name}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                skill.verified ? 'border-[#14b8a630] bg-[#14b8a610] text-[#14b8a6]' : 'border-[#ffffff10] bg-[#ffffff05] text-[#5a5a72]'
              }`}
            >
              {skill.verified ? '✓ ' : ''}
              {skill.name}
            </span>
          ))}
        </div>
        <div className="mt-2 border-t border-[#ffffff06] pt-4">
          <p className="mb-3 text-xs uppercase tracking-widest text-[#5a5a72]">Suggested paths</p>
          {['Product Manager', 'Data Analyst', 'UX Researcher'].map((path, i) => (
            <div key={path} className="mb-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a1a24]">
                <div className="h-full rounded-full bg-[#7c5cfc]" style={{ width: `${[85, 70, 60][i]}%` }} />
              </div>
              <span className="w-32 text-xs text-[#9090a8]">{path}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'HR finds pre-vetted talent',
    description:
      'Companies can post jobs, filter candidates by verified skills, and prioritize referral-backed applications from trusted employee networks.',
    content: (
      <div className="flex h-full w-full flex-col gap-3 rounded-xl bg-[#111118] p-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-[#5a5a72]">Referral inbox</p>
          <span className="rounded-full border border-[#7c5cfc30] bg-[#7c5cfc20] px-2 py-0.5 text-xs text-[#9b82fd]">4 new</span>
        </div>
        {[
          { name: 'Lukas Bauer', role: 'PM role', ref: 'Sofia Chen', score: 3, time: '2h ago' },
          { name: 'Yasmin Kaya', role: 'Data Analyst', ref: 'Marco Ricci', score: 3, time: '5h ago' },
          { name: 'Tom Reiter', role: 'PM role', ref: 'Hannah Muller', score: 2, time: '1d ago' },
        ].map((item) => (
          <div key={item.name} className="flex items-center gap-3 rounded-lg border border-[#ffffff06] bg-[#1a1a24] p-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#7c5cfc22] text-xs font-medium text-[#9b82fd]">
              {item.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#f0f0f5]">{item.name}</p>
              <p className="text-xs text-[#5a5a72]">
                via {item.ref} · {item.time}
              </p>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-4 w-1.5 rounded-full ${s <= item.score ? 'bg-[#14b8a6]' : 'bg-[#252532]'}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
]

export function FeaturesSection() {
  return (
    <section className="bg-[#0a0a0f]">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs uppercase tracking-widest text-[#7c5cfc]">The platform</p>
          <h2 className="text-3xl font-semibold text-[#f0f0f5] md:text-4xl">Everything your career needs</h2>
        </div>
      </div>

      <StickyScroll content={features} contentClassName="border-[#ffffff08] bg-[#111118]" />
    </section>
  )
}
