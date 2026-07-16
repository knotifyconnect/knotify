import { create } from 'zustand'

type SessionState = {
  token: string | null
  setToken: (token: string | null) => void
  // True while AuthPage is mid-way through creating/repairing the users row
  // for a freshly-authenticated session (e.g. resolving a username collision).
  // App.tsx must not route into the authenticated app while this is set,
  // otherwise the backend's self-heal would silently create the profile
  // under a random fallback username before the user gets a chance to fix it.
  profileSetupBlocking: boolean
  setProfileSetupBlocking: (blocking: boolean) => void
}

// Don't read from localStorage, Supabase manages its own session.
// onAuthStateChange fires INITIAL_SESSION on mount and is the sole source of truth.
export const useSessionStore = create<SessionState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
  profileSetupBlocking: false,
  setProfileSetupBlocking: (profileSetupBlocking) => set({ profileSetupBlocking }),
}))
