import { useEffect } from 'react'

type HeroAsciiOneProps = {
  onPrimaryClick?: () => void
  onSecondaryClick?: () => void
  primaryLabel?: string
  secondaryLabel?: string
}

const footerBars = [6, 10, 8, 14, 9, 12, 7, 11]

export default function HeroAsciiOne({
  onPrimaryClick,
  onSecondaryClick,
  primaryLabel = 'Get started free →',
  secondaryLabel = 'Sign in',
}: HeroAsciiOneProps) {
  useEffect(() => {
    const scriptId = 'nodenet-unicorn-bootstrap'
    const styleId = 'nodenet-hero-ascii-style'

    const existingScript = document.getElementById(scriptId)
    if (!existingScript) {
      const embedScript = document.createElement('script')
      embedScript.id = scriptId
      embedScript.type = 'text/javascript'
      embedScript.textContent = `
        !function(){
          if(!window.UnicornStudio){
            window.UnicornStudio={isInitialized:!1};
            var i=document.createElement("script");
            i.src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.33/dist/unicornStudio.umd.js";
            i.onload=function(){
              window.UnicornStudio.isInitialized||(UnicornStudio.init(),window.UnicornStudio.isInitialized=!0)
            };
            (document.head || document.body).appendChild(i)
          }
        }();
      `
      document.head.appendChild(embedScript)
    }

    const existingStyle = document.getElementById(styleId)
    if (!existingStyle) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        [data-us-project] {
          position: relative !important;
          overflow: hidden !important;
        }
        
        [data-us-project] canvas {
          clip-path: inset(0 0 10% 0) !important;
        }

        .nodenet-dither-pattern {
          background-image:
            repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(255,255,255,.55) 1px, rgba(255,255,255,.55) 2px),
            repeating-linear-gradient(90deg, transparent 0px, transparent 1px, rgba(255,255,255,.55) 1px, rgba(255,255,255,.55) 2px);
          background-size: 3px 3px;
        }
        
        .nodenet-stars-bg {
          background-image:
            radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.9), transparent),
            radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,.8), transparent),
            radial-gradient(1px 1px at 50% 50%, rgba(255,255,255,.7), transparent),
            radial-gradient(1px 1px at 80% 10%, rgba(255,255,255,.6), transparent),
            radial-gradient(1px 1px at 90% 60%, rgba(255,255,255,.5), transparent),
            radial-gradient(1px 1px at 33% 80%, rgba(255,255,255,.7), transparent),
            radial-gradient(1px 1px at 15% 60%, rgba(255,255,255,.6), transparent),
            radial-gradient(1px 1px at 70% 40%, rgba(255,255,255,.5), transparent);
          background-size: 200% 200%, 180% 180%, 250% 250%, 220% 220%, 190% 190%, 240% 240%, 210% 210%, 230% 230%;
          background-position: 0% 0%, 40% 40%, 60% 60%, 20% 20%, 80% 80%, 30% 30%, 70% 70%, 50% 50%;
          opacity: .3;
        }
      `
      document.head.appendChild(style)
    }

    return () => {
      const style = document.getElementById(styleId)
      if (style) style.remove()
    }
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <div className="absolute inset-0 h-full w-full hidden lg:block">
        <div data-us-project="OMzqyUv6M3kSnv0JeAtC" style={{ width: '100%', height: '100%', minHeight: '100vh' }} />
      </div>

      <div className="nodenet-stars-bg absolute inset-0 h-full w-full lg:hidden" />

      <div className="absolute left-0 right-0 top-0 z-20 border-b border-white/20">
        <div className="container mx-auto flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="font-mono text-xl font-semibold tracking-[0.18em] text-white lg:text-2xl">NODENET</div>
            <div className="h-3 w-px bg-white/40 lg:h-4" />
            <span className="text-[8px] font-mono uppercase tracking-[0.18em] text-white/60 lg:text-[10px]">Munich Beta</span>
          </div>

          <div className="hidden items-center gap-3 font-mono text-[10px] text-white/60 lg:flex">
            <span>LAT: 48.1372°</span>
            <div className="h-1 w-1 rounded-full bg-white/40" />
            <span>LONG: 11.5756°</span>
          </div>
        </div>
      </div>

      <div className="absolute left-0 top-0 z-20 h-8 w-8 border-l-2 border-t-2 border-white/30 lg:h-12 lg:w-12" />
      <div className="absolute right-0 top-0 z-20 h-8 w-8 border-r-2 border-t-2 border-white/30 lg:h-12 lg:w-12" />
      <div className="absolute bottom-[5vh] left-0 z-20 h-8 w-8 border-b-2 border-l-2 border-white/30 lg:h-12 lg:w-12" />
      <div className="absolute bottom-[5vh] right-0 z-20 h-8 w-8 border-b-2 border-r-2 border-white/30 lg:h-12 lg:w-12" />

      <div className="relative z-10 flex min-h-screen items-center justify-end pt-16 lg:pt-0">
        <div className="w-full px-6 lg:w-1/2 lg:px-16 lg:pr-[10%]">
          <div className="relative max-w-lg lg:ml-auto">
            <div className="mb-3 flex items-center gap-2 opacity-60">
              <div className="h-px w-8 bg-white" />
              <span className="font-mono text-[10px] tracking-wider text-white">∞</span>
              <div className="h-px flex-1 bg-white" />
            </div>

            <div className="relative">
              <div className="nodenet-dither-pattern absolute -right-3 bottom-0 top-0 hidden w-1 opacity-35 lg:block" />
              <h1 className="mb-3 font-mono text-2xl font-semibold leading-tight tracking-[0.11em] text-white lg:mb-4 lg:-ml-[5%] lg:text-5xl">
                YOUR NETWORK.
              </h1>
            </div>

            <h2 className="mb-4 font-mono text-xl font-semibold leading-tight text-[#6aa8ff] lg:mb-5 lg:text-4xl">IN YOUR CORNER.</h2>

            <div className="mb-3 hidden gap-1 opacity-40 lg:flex">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="h-0.5 w-0.5 rounded-full bg-white" />
              ))}
            </div>

            <div className="relative">
              <p className="mb-5 max-w-xl font-mono text-xs leading-relaxed text-gray-300 opacity-80 lg:mb-6 lg:text-base">
                Find your first job through people you actually know. NodeNet maps your Munich network so you can discover who
                works where, request referrals directly, and get noticed by HR.
              </p>

              <div
                className="absolute -left-4 top-1/2 hidden h-3 w-3 -translate-y-1/2 border border-white opacity-30 lg:block"
                aria-hidden
              >
                <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 bg-white" />
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
              <button
                className="group relative border border-white bg-transparent px-5 py-2 font-mono text-xs text-white transition-all duration-200 hover:bg-white hover:text-black lg:px-6 lg:py-2.5 lg:text-sm"
                onClick={onPrimaryClick}
              >
                <span className="absolute -left-1 -top-1 hidden h-2 w-2 border-l border-t border-white opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
                <span className="absolute -bottom-1 -right-1 hidden h-2 w-2 border-b border-r border-white opacity-0 transition-opacity group-hover:opacity-100 lg:block" />
                {primaryLabel}
              </button>

              <button
                className="border border-white bg-transparent px-5 py-2 font-mono text-xs text-white transition-all duration-200 hover:bg-white hover:text-black lg:px-6 lg:py-2.5 lg:text-sm"
                onClick={onSecondaryClick}
              >
                {secondaryLabel}
              </button>
            </div>

            <div className="mt-6 hidden items-center gap-2 opacity-40 lg:flex">
              <span className="font-mono text-[9px] text-white">∞</span>
              <div className="h-px flex-1 bg-white" />
              <span className="font-mono text-[9px] text-white">NODENET.PROTOCOL</span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] left-0 right-0 z-20 border-t border-white/20 bg-black/40 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-2 lg:px-8 lg:py-3">
          <div className="flex items-center gap-3 font-mono text-[8px] text-white/50 lg:gap-6 lg:text-[9px]">
            <span className="hidden lg:inline">SYSTEM.ACTIVE</span>
            <span className="lg:hidden">SYS.ACT</span>
            <div className="hidden gap-1 lg:flex">
              {footerBars.map((height, i) => (
                <div key={i} className="w-1 bg-white/30" style={{ height: `${height}px` }} />
              ))}
            </div>
            <span>V1.0.0</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[8px] text-white/50 lg:gap-4 lg:text-[9px]">
            <span className="hidden lg:inline">◐ RENDERING</span>
            <div className="flex gap-1">
              <div className="h-1 w-1 animate-pulse rounded-full bg-white/60" />
              <div className="h-1 w-1 animate-pulse rounded-full bg-white/40 [animation-delay:0.2s]" />
              <div className="h-1 w-1 animate-pulse rounded-full bg-white/20 [animation-delay:0.4s]" />
            </div>
            <span className="hidden lg:inline">FRAME: ∞</span>
          </div>
        </div>
      </div>
    </main>
  )
}

