export type UserStatus = 'studying' | 'open_to_work' | 'employed'
export type ConnectionStatus = 'pending' | 'accepted' | 'declined'

export interface UserProfile {
  id: string
  authId: string
  email: string
  fullName: string
  username: string
  avatarUrl?: string | null
  bio?: string | null
  locationCity: string
  locationLat?: number | null
  locationLng?: number | null
  status: UserStatus
  university?: string | null
  currentCompany?: string | null
  isHr: boolean
  referralScore: number
  isOnline: boolean
  createdAt: string
  updatedAt: string
}

export interface Connection {
  id: string
  requesterId: string
  addresseeId: string
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}
