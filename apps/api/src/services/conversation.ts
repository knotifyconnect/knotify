import { supabase } from '../lib.js'

/**
 * Shared conversation helpers used outside the conversations router (e.g. gigs).
 *
 * Unlike the conversations POST endpoint, ensureDirectConversation does NOT
 * require an accepted connection — booking a gig is itself a legitimate reason
 * to open a thread between two people who may not be connected yet.
 */

function directPairKey(a: string, b: string) {
  return [a, b].sort().join(':')
}

async function findByPairKey(pairKey: string): Promise<string | null> {
  const found = await supabase
    .from('conversations')
    .select('id')
    .eq('direct_pair_key', pairKey)
    .maybeSingle()
  if (found.error) {
    if (found.error.message.toLowerCase().includes('direct_pair_key')) return null
    throw new Error(found.error.message)
  }
  return found.data?.id ?? null
}

/** Get or create the 1:1 conversation between two users. Returns its id. */
export async function ensureDirectConversation(userId: string, otherUserId: string): Promise<string> {
  if (userId === otherUserId) throw new Error('Cannot open a conversation with yourself')

  const pairKey = directPairKey(userId, otherUserId)

  const existing = await findByPairKey(pairKey)
  if (existing) return existing

  const created = await supabase
    .from('conversations')
    .insert({ direct_pair_key: pairKey })
    .select('id')
    .single()

  if (created.error) {
    // Another request may have created it concurrently
    const duplicate = await findByPairKey(pairKey)
    if (duplicate) return duplicate
    throw new Error(created.error.message)
  }

  const participants = await supabase.from('conversation_participants').insert([
    { conversation_id: created.data.id, user_id: userId },
    { conversation_id: created.data.id, user_id: otherUserId },
  ])

  if (participants.error) {
    await supabase.from('conversations').delete().eq('id', created.data.id)
    const duplicate = await findByPairKey(pairKey)
    if (duplicate) return duplicate
    throw new Error(participants.error.message)
  }

  return created.data.id
}

/** Post a message into a conversation. Best-effort: returns the message id or null. */
export async function postMessage(conversationId: string, senderId: string, content: string): Promise<string | null> {
  const inserted = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select('id')
    .maybeSingle()
  if (inserted.error) return null
  return inserted.data?.id ?? null
}
