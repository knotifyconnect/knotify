import { create } from 'zustand'

type ToastType =
  | 'referral_received'
  | 'referral_submitted'
  | 'connection_accepted'
  | 'connection_request'
  | 'message'
  | 'event_rsvp'
  | 'job_referral_request'
  | 'ask_reply'
  | 'invite_bonus'

export type ToastItem = {
  id: string
  type: ToastType
  title: string
  body: string
}

type ToastState = {
  toasts: ToastItem[]
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
    }, 4500)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}))
