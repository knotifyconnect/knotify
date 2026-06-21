import {
  Target, Camera, Palette, Globe, Handshake, Users,
  Coffee, HeartHandshake, PartyPopper, Map, Languages, Croissant, Gift,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  target: Target,
  camera: Camera,
  palette: Palette,
  globe: Globe,
  handshake: Handshake,
  users: Users,
  coffee: Coffee,
  'heart-handshake': HeartHandshake,
  party: PartyPopper,
  map: Map,
  languages: Languages,
  croissant: Croissant,
  gift: Gift,
}

export function QuestIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = MAP[name] ?? Sparkles
  return <Icon size={size} />
}
