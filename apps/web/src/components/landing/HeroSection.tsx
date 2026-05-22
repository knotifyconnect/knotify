import { useNavigate } from 'react-router-dom'
import { HyperText } from '@/components/magicui/hyper-text'
import { WordRotate } from '@/components/magicui/word-rotate'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { BlurFade } from '@/components/magicui/blur-fade'
import { ShaderAnimation } from '@/components/ui/shader-animation'

export function HeroSection() {
  const navigate = useNavigate()

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0a0f]">
      <div className="pointer-events-none absolute inset-0">
        <ShaderAnimation className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black/35" />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
        <BlurFade delay={0.1}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#7c5cfc33] bg-[#7c5cfc11] px-4 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7c5cfc]" />
            <span className="text-xs font-medium uppercase tracking-widest text-[#9b82fd]">Munich · Beta</span>
          </div>
        </BlurFade>

        <BlurFade delay={0.2}>
          <HyperText
            className="mb-4 text-5xl font-semibold leading-tight tracking-tight text-[#f0f0f5] md:text-7xl"
            duration={1200}
          >
            Your network.
          </HyperText>
        </BlurFade>

        <BlurFade delay={0.3}>
          <div className="mb-8 text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
            <WordRotate className="gradient-text" words={['On the map.', 'In your corner.', 'Working for you.', 'Human again.']} />
          </div>
        </BlurFade>

        <BlurFade delay={0.4}>
          <p className="mb-10 max-w-2xl text-lg leading-relaxed text-[#9090a8] md:text-xl">
            Find your first job through people you actually know. NodeNet maps your Munich network so you can discover who works where,
            request referrals directly, and get noticed by HR.
          </p>
        </BlurFade>

        <BlurFade delay={0.5}>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <ShimmerButton
              shimmerColor="#b9a6fe"
              shimmerSize="0.08em"
              shimmerDuration="2.5s"
              background="#7c5cfc"
              className="rounded-lg px-8 py-3 text-sm font-medium text-white"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Get started free →
            </ShimmerButton>
            <button
              className="rounded-lg border border-[#ffffff10] px-8 py-3 text-sm font-medium text-[#9090a8] transition-colors duration-150 hover:border-[#ffffff20] hover:text-[#f0f0f5]"
              onClick={() => navigate('/auth?mode=login')}
            >
              Sign in
            </button>
          </div>
        </BlurFade>

        <BlurFade delay={0.8}>
          <div className="mt-20 flex flex-col items-center gap-2 text-[#5a5a72]">
            <div className="h-8 w-px bg-gradient-to-b from-transparent to-[#7c5cfc60]" />
            <span className="text-xs uppercase tracking-widest">Scroll</span>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
