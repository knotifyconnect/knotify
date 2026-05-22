import { useEffect, useState } from 'react'

export function TextGenerateEffect({ words, className }: { words: string; className?: string }) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    const allWords = words.split(' ')
    const interval = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= allWords.length) {
          window.clearInterval(interval)
          return count
        }
        return count + 1
      })
    }, 80)

    return () => window.clearInterval(interval)
  }, [words])

  return <span className={className}>{words.split(' ').slice(0, visibleCount).join(' ')}</span>
}
