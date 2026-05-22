import type { User } from '@supabase/supabase-js'

declare global {
  namespace Express {
    interface Request {
      authUser?: User
      appUserId?: string
      isAdmin?: boolean
      isHr?: boolean
    }
  }
}

export {}
