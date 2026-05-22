import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StickyItem = {
  title: string
  description: string
  content: ReactNode
}

type StickyScrollProps = {
  content: StickyItem[]
  contentClassName?: string
}

export function StickyScroll({ content, contentClassName }: StickyScrollProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <div className="grid gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4 md:pr-4">
          {content.map((item, index) => (
            <motion.button
              key={item.title}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={cn(
                'w-full rounded-xl border p-5 text-left transition-colors',
                activeIndex === index
                  ? 'border-[#7c5cfc40] bg-[#7c5cfc10]'
                  : 'border-[#ffffff08] bg-[#111118] hover:border-[#ffffff16] hover:bg-[#14141d]'
              )}
            >
              <h3 className="text-lg font-semibold text-[#f0f0f5]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9090a8]">{item.description}</p>
            </motion.button>
          ))}
        </div>

        <div className="md:sticky md:top-20 md:h-[520px]">
          <div className={cn('h-[360px] rounded-xl border border-[#ffffff08] bg-[#111118] p-4 md:h-full', contentClassName)}>
            <AnimatePresence mode="wait">
              <motion.div
                key={content[activeIndex]?.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="h-full"
              >
                {content[activeIndex]?.content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
