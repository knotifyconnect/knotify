/**
 * knotify connective layer, the shared taxonomy.
 *
 * People, events, gigs and groups are all tagged with this SAME vocabulary so that
 * recommendations / matching are just graph operations over a common set of tags.
 * Keep this as the single source of truth; do not redefine these lists elsewhere.
 */

// Interests, cross-cutting, multi-select. Used on the waitlist and in onboarding.
export const INTERESTS = [
  'Jobs & careers',
  'Entrepreneurship',
  'Tech',
  'Arts & design',
  'Music',
  'Sports',
  'Food & cafés',
  'Cars',
  'Academia & research',
  'Travel',
  'Gaming',
  'Events & nightlife',
  'Languages & culture',
  'Wellness',
] as const

// Goals, why someone is on knotify. These drive recommendations most strongly.
export const GOALS = [
  'Make friends',
  'Find a job or internship',
  'Learn the city',
  'Find a mentor',
  'Mentor others',
  'Grow my network',
  'Find collaborators',
  'Attend events',
] as const

// Personas for the consumer app (individuals). Companies onboard via the employer track.
export const PERSONAS = [
  { value: 'student', label: 'Student' },
  { value: 'professional', label: 'Professional' },
  { value: 'professor', label: 'Professor' },
  { value: 'investor', label: 'Investor' },
] as const

// Waitlist roles, superset of personas, adds Company (the B2B side shows interest too).
export const WAITLIST_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'professional', label: 'Professional' },
  { value: 'professor', label: 'Professor' },
  { value: 'investor', label: 'Investor' },
  { value: 'company', label: 'Company / Recruiter' },
] as const

// How long someone has been in Munich, context for newcomer matching & side quests.
export const MUNICH_TENURE = [
  'Not in Munich yet',
  'Just arrived',
  'Within the last year',
  '1–3 years',
  '3+ years',
] as const

// Common languages for quick selection (free additions allowed in the UI).
export const COMMON_LANGUAGES = [
  'English', 'German', 'Spanish', 'French', 'Italian', 'Mandarin',
  'Hindi', 'Arabic', 'Russian', 'Turkish', 'Portuguese', 'Ukrainian',
] as const

export type Persona = (typeof PERSONAS)[number]['value']
