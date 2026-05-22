import { useNavigate } from 'react-router-dom'
import { RetroGrid } from '@/components/magicui/retro-grid'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { BlurFade } from '@/components/magicui/blur-fade'

export function CTASection() {
  const navigate = useNavigate()

  return (
    <section className="relative overflow-hidden border-t border-[#ffffff06] bg-[#0a0a0f] py-40">
      <RetroGrid className="opacity-20" />
      <div className="relative z-10 mx-auto max-w-2xl px-4 text-center">
        <BlurFade delay={0.1} inView>
          <h2 className="mb-6 text-4xl font-semibold leading-tight text-[#f0f0f5] md:text-5xl">
            Your first referral is
            <br />
            <span className="gradient-text">one connection away.</span>
          </h2>
          <p className="mb-10 text-lg text-[#9090a8]">Join students across Munich building real professional networks.</p>
          <ShimmerButton
            shimmerColor="#b9a6fe"
            shimmerSize="0.08em"
            shimmerDuration="2s"
            background="#7c5cfc"
            className="rounded-xl px-10 py-4 text-base font-medium text-white"
            onClick={() => navigate('/auth?mode=signup')}
          >
            Join NodeNet - it's free →
          </ShimmerButton>
        </BlurFade>
      </div>
    </section>
  )
}
