import { create } from 'zustand'

type SessionState = {
  token: string | null
  setToken: (token: string | null) => void
}

// Don't read from localStorage, Supabase manages its own session.
// onAuthStateChange fires INITIAL_SESSION on mount and is the sole source of truth.
export const useSessionStore = create<SessionState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}))
