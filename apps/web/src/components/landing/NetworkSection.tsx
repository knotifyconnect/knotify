import { useRef } from 'react'
import { AnimatedBeam } from '@/components/magicui/animated-beam'
import { BlurFade } from '@/components/magicui/blur-fade'
import { cn } from '@/lib/utils'

type CircleProps = {
  className?: string
  children: React.ReactNode
  innerRef: React.RefObject<HTMLDivElement>
}

function Circle({ className, children, innerRef }: CircleProps) {
  return (
    <div
      ref={innerRef}
      className={cn(
        'z-10 flex h-14 w-14 items-center justify-center rounded-full border border-[#7c5cfc33] bg-[#111118] text-xs font-medium text-[#9b82fd]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function NetworkSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const studentRef = useRef<HTMLDivElement>(null)
  const referrerRef = useRef<HTMLDivElement>(null)
  const hrRef = useRef<HTMLDivElement>(null)
  const jobRef = useRef<HTMLDivElement>(null)

  return (
    <section className="border-t border-[#ffffff06] bg-[#0a0a0f] py-32">
      <div className="mx-auto max-w-4xl px-4">
        <BlurFade delay={0.1} inView>
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs uppercase tracking-widest text-[#7c5cfc]">The referral loop</p>
            <h2 className="text-3xl font-semibold text-[#f0f0f5] md:text-4xl">Human connections. Real results.</h2>
          </div>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <div
            ref={containerRef}
            className="relative flex items-center justify-between gap-8 rounded-2xl border border-[#ffffff06] bg-[#111118] p-12"
          >
            <div className="flex flex-col items-center gap-2">
              <Circle innerRef={studentRef} className="border-[#7c5cfc60]">
                You
              </Circle>
              <span className="text-xs text-[#5a5a72]">Student</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Circle innerRef={referrerRef} className="border-[#14b8a660]">
                <span className="text-[#14b8a6]">S</span>
              </Circle>
              <span className="text-xs text-[#5a5a72]">Sofia · BMW</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Circle innerRef={jobRef} className="border-[#f59e0b60]">
                <span className="text-[#f59e0b]">JD</span>
              </Circle>
              <span className="text-xs text-[#5a5a72]">Job posting</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Circle innerRef={hrRef} className="border-[#7c5cfc60]">
                HR
              </Circle>
              <span className="text-xs text-[#5a5a72]">Recruiter</span>
            </div>

            <AnimatedBeam containerRef={containerRef} fromRef={studentRef} toRef={referrerRef} gradientStartColor="#7c5cfc" gradientStopColor="#14b8a6" />
            <AnimatedBeam containerRef={containerRef} fromRef={referrerRef} toRef={jobRef} gradientStartColor="#14b8a6" gradientStopColor="#f59e0b" />
            <AnimatedBeam containerRef={containerRef} fromRef={jobRef} toRef={hrRef} gradientStartColor="#f59e0b" gradientStopColor="#7c5cfc" />
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
