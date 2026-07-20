import { useEffect, useState } from 'react'

// window.visualViewport.height reflects the actually-visible area and
// shrinks when the on-screen keyboard opens — window.innerHeight does not,
// once the page opts into `interactive-widget=overlays-content` (see
// index.html). Returns null where visualViewport isn't supported, so
// callers can fall back to their normal CSS sizing.
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() =>
    typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : null
  )

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => setHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return height
}
