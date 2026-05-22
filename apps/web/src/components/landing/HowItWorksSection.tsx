import { TracingBeam } from '@/components/ui/tracing-beam'
import { BlurFade } from '@/components/magicui/blur-fade'
import { MagicCard } from '@/components/magicui/magic-card'

const steps = [
  {
    step: '01',
    title: 'Build your map',
    description:
      'Sign up, upload your CV. NodeNet places you on the Munich map. Connect with classmates, colleagues, and people from your university. Watch your network appear as nodes.',
    detail:
      'AI reads your CV, extracts your skills, and suggests career paths. You verify what is accurate. Your verified skills become your professional fingerprint.',
  },
  {
    step: '02',
    title: 'Find the right door',
    description:
      'Browse job postings matched to your verified skills. When you find a role that fits, NodeNet shows you if anyone in your network works there.',
    detail:
      'Their node pulses amber on your map. One click to request a referral. They get your profile, your CV, and your skills. Human connection, not a cold application.',
  },
  {
    step: '03',
    title: 'Get referred properly',
    description:
      'Not a generic endorsement. A structured referral with relationship context, competency assessment, and a recommendation that goes directly to HR.',
    detail:
      'HR sees the referral attached to your application. You stand out before they even read your CV. This is how hiring actually works.',
  },
]

export function HowItWorksSection() {
  return (
    <section className="bg-[#0a0a0f] py-32">
      <div className="mx-auto max-w-2xl px-4">
        <BlurFade delay={0.1} inView>
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs uppercase tracking-widest text-[#7c5cfc]">How it works</p>
            <h2 className="text-3xl font-semibold text-[#f0f0f5] md:text-4xl">Three steps to your first referral</h2>
          </div>
        </BlurFade>

        <TracingBeam className="px-6">
          <div className="flex flex-col gap-16">
            {steps.map((step, i) => (
              <BlurFade key={step.step} delay={0.15 * i} inView>
                <MagicCard className="cursor-default rounded-2xl border border-[#ffffff06] bg-[#111118] p-8" gradientColor="#7c5cfc" gradientOpacity={0.08}>
                  <div className="flex items-start gap-6">
                    <span className="font-mono text-5xl font-semibold leading-none text-[#7c5cfc20]">{step.step}</span>
                    <div>
                      <h3 className="mb-3 text-lg font-semibold text-[#f0f0f5]">{step.title}</h3>
                      <p className="mb-4 leading-relaxed text-[#9090a8]">{step.description}</p>
                      <p className="text-sm leading-relaxed text-[#5a5a72]">{step.detail}</p>
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>
            ))}
          </div>
        </TracingBeam>
      </div>
    </section>
  )
}
