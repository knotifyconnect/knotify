import { supabase } from '../lib.js'

export type AskAudienceType = 'everyone' | 'interest' | 'persona' | 'people'

export type AudienceAsk = {
  id: string
  user_id: string
  audience_type?: AskAudienceType | null
  audience_value?: string | null
}

type ViewerProfile = {
  interests: string[]
  persona: string | null
}

export async function acceptedConnectionIds(userId: string): Promise<string[]> {
  const result = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  if (result.error) throw new Error(result.error.message)

  const rows = (result.data ?? []) as Array<{
    requester_id: string
    addressee_id: string
    status: string
  }>

  return rows
    .filter((connection) => connection.status === 'accepted')
    .map((connection) => (
      connection.requester_id === userId
        ? connection.addressee_id
        : connection.requester_id
    ))
}

async function viewerProfile(userId: string): Promise<ViewerProfile> {
  const result = await supabase
    .from('users')
    .select('interests, persona')
    .eq('id', userId)
    .maybeSingle()

  if (result.error) throw new Error(result.error.message)

  return {
    interests: Array.isArray(result.data?.interests) ? result.data.interests : [],
    persona: typeof result.data?.persona === 'string' ? result.data.persona : null,
  }
}

async function explicitAskIdsForViewer(askIds: string[], viewerId: string): Promise<Set<string>> {
  if (askIds.length === 0) return new Set()

  const result = await supabase
    .from('ask_recipients')
    .select('ask_id')
    .eq('user_id', viewerId)
    .in('ask_id', askIds)

  if (result.error) throw new Error(result.error.message)
  return new Set((result.data ?? []).map((row) => row.ask_id as string))
}

export async function filterAsksVisibleToViewer<T extends AudienceAsk>(
  asks: T[],
  viewerId: string
): Promise<T[]> {
  if (asks.length === 0) return []

  const authored = asks.filter((ask) => ask.user_id === viewerId)
  const others = asks.filter((ask) => ask.user_id !== viewerId)
  if (others.length === 0) return authored

  const [connectionIds, profile] = await Promise.all([
    acceptedConnectionIds(viewerId),
    viewerProfile(viewerId),
  ])
  const connectionSet = new Set(connectionIds)
  const connectedAsks = others.filter((ask) => connectionSet.has(ask.user_id))
  const peopleAskIds = connectedAsks
    .filter((ask) => ask.audience_type === 'people')
    .map((ask) => ask.id)
  const explicitAskIds = await explicitAskIdsForViewer(peopleAskIds, viewerId)

  const visibleIds = new Set<string>(authored.map((ask) => ask.id))
  for (const ask of connectedAsks) {
    const type = ask.audience_type ?? 'everyone'
    if (type === 'everyone') visibleIds.add(ask.id)
    if (type === 'interest' && ask.audience_value && profile.interests.includes(ask.audience_value)) {
      visibleIds.add(ask.id)
    }
    if (type === 'persona' && ask.audience_value && profile.persona === ask.audience_value) {
      visibleIds.add(ask.id)
    }
    if (type === 'people' && explicitAskIds.has(ask.id)) visibleIds.add(ask.id)
  }

  return asks.filter((ask) => visibleIds.has(ask.id))
}

export async function canViewAsk(ask: AudienceAsk, viewerId: string): Promise<boolean> {
  const visible = await filterAsksVisibleToViewer([ask], viewerId)
  return visible.length === 1
}

export async function audienceRecipientIdsForAsk(ask: AudienceAsk): Promise<string[]> {
  const connectionIds = await acceptedConnectionIds(ask.user_id)
  if (connectionIds.length === 0) return []
  const connectionSet = new Set(connectionIds)
  const type = ask.audience_type ?? 'everyone'

  if (type === 'everyone') return connectionIds

  if (type === 'people') {
    const result = await supabase
      .from('ask_recipients')
      .select('user_id')
      .eq('ask_id', ask.id)

    if (result.error) throw new Error(result.error.message)
    return [...new Set(
      (result.data ?? [])
        .map((row) => row.user_id as string)
        .filter((userId) => connectionSet.has(userId))
    )]
  }

  const users = await supabase
    .from('users')
    .select('id, interests, persona')
    .in('id', connectionIds)

  if (users.error) throw new Error(users.error.message)

  return (users.data ?? [])
    .filter((user) => {
      if (type === 'interest') {
        return !!ask.audience_value
          && Array.isArray(user.interests)
          && user.interests.includes(ask.audience_value)
      }
      return type === 'persona'
        && !!ask.audience_value
        && user.persona === ask.audience_value
    })
    .map((user) => user.id as string)
}

export async function validateExplicitAudience(
  authorId: string,
  requestedUserIds: string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(requestedUserIds)].filter((userId) => userId !== authorId)
  const acceptedIds = new Set(await acceptedConnectionIds(authorId))
  return uniqueIds.filter((userId) => acceptedIds.has(userId))
}

export async function attachAudienceCounts<T extends AudienceAsk>(
  asks: T[]
): Promise<Array<T & { audience_count?: number }>> {
  const peopleAskIds = asks
    .filter((ask) => ask.audience_type === 'people')
    .map((ask) => ask.id)
  if (peopleAskIds.length === 0) return asks

  const result = await supabase
    .from('ask_recipients')
    .select('ask_id')
    .in('ask_id', peopleAskIds)

  if (result.error) throw new Error(result.error.message)
  const counts = new Map<string, number>()
  for (const row of result.data ?? []) {
    const askId = row.ask_id as string
    counts.set(askId, (counts.get(askId) ?? 0) + 1)
  }

  return asks.map((ask) => (
    ask.audience_type === 'people'
      ? { ...ask, audience_count: counts.get(ask.id) ?? 0 }
      : ask
  ))
}
