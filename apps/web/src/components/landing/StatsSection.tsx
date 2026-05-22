import { NumberTicker } from '@/components/magicui/number-ticker'
import { BlurFade } from '@/components/magicui/blur-fade'

const stats = [
  { value: 2400, label: 'students joined', suffix: '+' },
  { value: 180, label: 'referrals sent', suffix: '+' },
  { value: 40, label: 'Munich companies', suffix: '+' },
  { value: 94, label: 'referral success rate', suffix: '%' },
]

export function StatsSection() {
  return (
    <section className="border-y border-[#ffffff06] bg-[#0a0a0f] py-20">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
        {stats.map((stat, i) => (
          <BlurFade key={stat.label} delay={0.1 * i} inView>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-baseline gap-1">
                <NumberTicker value={stat.value} className="font-mono text-4xl font-semibold text-[#a8ffb0]" />
                <span className="font-mono text-2xl text-[#a8ffb0]">{stat.suffix}</span>
              </div>
              <p className="text-xs uppercase tracking-widest text-[#5a5a72]">{stat.label}</p>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  )
}
