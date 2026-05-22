import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'

interface Avatar {
  id: number
  src: string
  alt: string
}

type AvatarPickerProps = {
  value?: string | null
  onChange?: (avatarSrc: string, avatarId: number) => void
  className?: string
}

const mainAvatarVariants = {
  initial: {
    y: 20,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    },
  },
  exit: {
    y: -20,
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
} as const

const pickerVariants = {
  container: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  },
  item: {
    initial: {
      y: 20,
      opacity: 0,
    },
    animate: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    },
  },
} as const

const selectedVariants = {
  initial: {
    opacity: 0,
    rotate: -180,
  },
  animate: {
    opacity: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
    },
  },
  exit: {
    opacity: 0,
    rotate: 180,
    transition: {
      duration: 0.2,
    },
  },
} as const

const encodeSvg = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const avatarSvg = {
  one: `<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' width='40' height='40' aria-label='Avatar 1'><mask id='m1' maskUnits='userSpaceOnUse' x='0' y='0' width='36' height='36'><rect width='36' height='36' rx='72' fill='#fff'/></mask><g mask='url(#m1)'><rect width='36' height='36' fill='#ff005b'/><rect x='0' y='0' width='36' height='36' transform='translate(9 -5) rotate(219 18 18) scale(1)' fill='#ffb238' rx='6'/><g transform='translate(4.5 -4) rotate(9 18 18)'><path d='M15 19c2 1 4 1 6 0' stroke='#000' fill='none' stroke-linecap='round'/><rect x='10' y='14' width='1.5' height='2' rx='1' fill='#000'/><rect x='24' y='14' width='1.5' height='2' rx='1' fill='#000'/></g></g></svg>`,
  two: `<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' width='40' height='40' aria-label='Avatar 2'><mask id='m2' maskUnits='userSpaceOnUse' x='0' y='0' width='36' height='36'><rect width='36' height='36' rx='72' fill='#fff'/></mask><g mask='url(#m2)'><rect width='36' height='36' fill='#ff7d10'/><rect x='0' y='0' width='36' height='36' transform='translate(5 -1) rotate(55 18 18) scale(1.1)' fill='#0a0310' rx='6'/><g transform='translate(7 -6) rotate(-5 18 18)'><path d='M15 20c2 1 4 1 6 0' stroke='#fff' fill='none' stroke-linecap='round'/><rect x='14' y='14' width='1.5' height='2' rx='1' fill='#fff'/><rect x='20' y='14' width='1.5' height='2' rx='1' fill='#fff'/></g></g></svg>`,
  three: `<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' width='40' height='40' aria-label='Avatar 3'><mask id='m3' maskUnits='userSpaceOnUse' x='0' y='0' width='36' height='36'><rect width='36' height='36' rx='72' fill='#fff'/></mask><g mask='url(#m3)'><rect width='36' height='36' fill='#0a0310'/><rect x='0' y='0' width='36' height='36' transform='translate(-3 7) rotate(227 18 18) scale(1.2)' fill='#ff005b' rx='36'/><g transform='translate(-3 3.5) rotate(7 18 18)'><path d='M13,21 a1,0.75 0 0,0 10,0' fill='#fff'/><rect x='12' y='14' width='1.5' height='2' rx='1' fill='#fff'/><rect x='22' y='14' width='1.5' height='2' rx='1' fill='#fff'/></g></g></svg>`,
  four: `<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' width='40' height='40' aria-label='Avatar 4'><mask id='m4' maskUnits='userSpaceOnUse' x='0' y='0' width='36' height='36'><rect width='36' height='36' rx='72' fill='#fff'/></mask><g mask='url(#m4)'><rect width='36' height='36' fill='#d8fcb3'/><rect x='0' y='0' width='36' height='36' transform='translate(9 -5) rotate(219 18 18) scale(1)' fill='#89fcb3' rx='6'/><g transform='translate(4.5 -4) rotate(9 18 18)'><path d='M15 19c2 1 4 1 6 0' stroke='#000' fill='none' stroke-linecap='round'/><rect x='10' y='14' width='1.5' height='2' rx='1' fill='#000'/><rect x='24' y='14' width='1.5' height='2' rx='1' fill='#000'/></g></g></svg>`,
}

const avatars: Avatar[] = [
  { id: 1, src: encodeSvg(avatarSvg.one), alt: 'Avatar 1' },
  { id: 2, src: encodeSvg(avatarSvg.two), alt: 'Avatar 2' },
  { id: 3, src: encodeSvg(avatarSvg.three), alt: 'Avatar 3' },
  { id: 4, src: encodeSvg(avatarSvg.four), alt: 'Avatar 4' },
]

export function AvatarPicker({ value, onChange, className }: AvatarPickerProps) {
  const matchingInitial = useMemo(() => avatars.find((avatar) => avatar.src === value) ?? avatars[0], [value])
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar>(matchingInitial)
  const [rotationCount, setRotationCount] = useState(0)

  useEffect(() => {
    if (!value) return
    const found = avatars.find((avatar) => avatar.src === value)
    if (found) setSelectedAvatar(found)
  }, [value])

  const handleAvatarSelect = (avatar: Avatar) => {
    setRotationCount((prev) => prev + 1080)
    setSelectedAvatar(avatar)
    onChange?.(avatar.src, avatar.id)
  }

  return (
    <motion.div initial="initial" animate="animate" className={cn('w-full', className)}>
      <Card className="mx-auto w-full max-w-md overflow-hidden border-border-default bg-bg-elevated">
        <CardContent className="p-0">
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: '7.5rem',
              transition: {
                height: {
                  type: 'spring',
                  stiffness: 100,
                  damping: 20,
                },
              },
            }}
            className="w-full bg-gradient-to-r from-brand-500/18 to-accent-teal/14"
          />

          <div className="-mt-14 px-6 pb-6">
            <motion.div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-bg-surface bg-bg-surface" variants={mainAvatarVariants} layoutId="selectedAvatar">
              <motion.div
                className="flex h-full w-full items-center justify-center"
                animate={{
                  rotate: rotationCount,
                }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <img src={selectedAvatar.src} alt={selectedAvatar.alt} className="h-full w-full scale-[1.32]" />
              </motion.div>
            </motion.div>

            <motion.div className="mt-3 text-center" variants={pickerVariants.item}>
              <motion.h2 className="text-xl font-semibold text-text-primary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                Me
              </motion.h2>
              <motion.p className="text-xs text-text-secondary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                Select your avatar
              </motion.p>
            </motion.div>

            <motion.div className="mt-5" variants={pickerVariants.container}>
              <motion.div className="flex justify-center gap-3" variants={pickerVariants.container}>
                {avatars.map((avatar) => (
                  <motion.button
                    key={avatar.id}
                    onClick={() => handleAvatarSelect(avatar)}
                    className={cn('relative h-11 w-11 overflow-hidden rounded-full border-2 border-white/20 transition-all duration-300')}
                    variants={pickerVariants.item}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                    whileTap={{ y: 0, transition: { duration: 0.2 } }}
                    aria-label={`Select ${avatar.alt}`}
                    aria-pressed={selectedAvatar.id === avatar.id}
                    type="button"
                  >
                    <img src={avatar.src} alt={avatar.alt} className="h-full w-full" />
                    {selectedAvatar.id === avatar.id ? (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-brand-500/20 ring-2 ring-brand-500 ring-offset-2 ring-offset-bg-surface"
                        variants={selectedVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layoutId="selectedIndicator"
                      />
                    ) : null}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
