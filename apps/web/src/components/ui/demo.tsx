import { ShaderAnimation } from '@/components/ui/shader-animation'

export default function DemoOne() {
  return (
    <div className="relative flex h-[650px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border bg-blue-700">
      <ShaderAnimation />
      <span className="pointer-events-none absolute z-10 whitespace-pre-wrap text-center text-7xl leading-none font-semibold tracking-tighter text-white">
        Shader Animation
      </span>
    </div>
  )
}
