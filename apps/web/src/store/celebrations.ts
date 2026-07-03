import { create } from 'zustand'
import type { KnotRankKey } from '@/lib/knots'

export type Unlock = {
  id: number
  title: string
  points: number
  /** difficulty seal shown on the toast */
  grade?: 'easy' | 'medium' | 'hard' | null
}

export type Ceremony = {
  rank: KnotRankKey
  rankName: string
  line: string
  /** true when this rank-up also crosses the gig gate (Bowline) */
  gigUnlocked: boolean
}

type CelebrationState = {
  unlocks: Unlock[]
  ceremony: Ceremony | null
  pushUnlock: (u: Omit<Unlock, 'id'>) => void
  dismissUnlock: (id: number) => void
  openCeremony: (c: Ceremony) => void
  closeCeremony: () => void
}

let nextId = 1

export const useCelebrationStore = create<CelebrationState>((set) => ({
  unlocks: [],
  ceremony: null,
  pushUnlock: (u) => {
    const id = nextId++
    set((s) => ({ unlocks: [...s.unlocks, { ...u, id }] }))
    // Trophy toasts dismiss themselves; the ceremony never does.
    setTimeout(() => {
      set((s) => ({ unlocks: s.unlocks.filter((x) => x.id !== id) }))
    }, 3400)
  },
  dismissUnlock: (id) => set((s) => ({ unlocks: s.unlocks.filter((x) => x.id !== id) })),
  openCeremony: (c) => set({ ceremony: c }),
  closeCeremony: () => set({ ceremony: null }),
}))
