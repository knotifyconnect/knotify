import { supabase } from '../lib.js'

const GENERATED_USERNAME_RE = /^user_[a-z0-9]{12}$/i

export function isGeneratedUsername(value: unknown): value is string {
  return typeof value === 'string' && GENERATED_USERNAME_RE.test(value)
}

export function usernameStemFromName(fullName: string) {
  const normalized = fullName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 26)

  if (normalized.length >= 3) return normalized
  if (normalized.length > 0) return `${normalized}_member`.slice(0, 26)
  return 'new_member'
}

/**
 * Allocate a readable handle from a person's name. The users.username unique
 * constraint remains the final concurrency guard; callers retry an insert if
 * another signup claims the same candidate at the same instant.
 */
export async function allocateUsername(fullName: string, excludeUserId?: string) {
  const stem = usernameStemFromName(fullName)
  let query = supabase
    .from('users')
    .select('id, username')
    .ilike('username', `${stem}%`)

  if (excludeUserId) query = query.neq('id', excludeUserId)

  const existing = await query.limit(500)
  if (existing.error) throw new Error(existing.error.message)

  const occupied = new Set(
    (existing.data ?? []).map((row) => String(row.username).toLowerCase())
  )

  if (!occupied.has(stem)) return stem

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = `_${suffix}`
    const candidate = `${stem.slice(0, 32 - suffixText.length)}${suffixText}`
    if (!occupied.has(candidate)) return candidate
  }

  throw new Error('Could not allocate a unique username')
}

export function profileNameFromIdentity(
  metadata: Record<string, unknown>,
  email: string,
) {
  const metadataName =
    typeof metadata.fullName === 'string'
      ? metadata.fullName.trim()
      : typeof metadata.full_name === 'string'
        ? metadata.full_name.trim()
        : typeof metadata.name === 'string'
          ? metadata.name.trim()
          : ''

  if (metadataName.length >= 2) return metadataName

  const stem = (email.split('@')[0] ?? 'New member')
    .replace(/[._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return stem
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'New member'
}
