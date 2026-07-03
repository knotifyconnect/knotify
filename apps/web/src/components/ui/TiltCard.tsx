import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'

/**
 * 3D cursor-tracking card. Children can float at their own depth with
 * `style={{ transform: 'translateZ(20px)' }}` on inner elements — the card
 * preserves 3D. Falls back to a static card for touch/reduced-motion users.
 */
export function TiltCard({
  children,
  maxTilt = 7,
  style,
  className,
  onClick,
}: {
  children: ReactNode
  maxTilt?: number
  style?: CSSProperties
  className?: string
  onClick?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 260, damping: 24 })
  const sy = useSpring(my, { stiffness: 260, damping: 24 })
  const rotateY = useTransform(sx, [0, 1], [-maxTilt, maxTilt])
  const rotateX = useTransform(sy, [0, 1], [maxTilt, -maxTilt])

  if (reduced) {
    return (
      <div className={className} style={style} onClick={onClick}>
        {children}
      </div>
    )
  }

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        ref={ref}
        className={className}
        onClick={onClick}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return
          const r = ref.current?.getBoundingClientRect()
          if (!r) return
          mx.set((e.clientX - r.left) / r.width)
          my.set((e.clientY - r.top) / r.height)
        }}
        onPointerLeave={() => {
          mx.set(0.5)
          my.set(0.5)
        }}
        style={{ ...style, rotateX, rotateY, transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        {children}
      </motion.div>
    </div>
  )
}
