import { supabase } from '../lib.js'
import { ensureDirectConversation } from '../services/conversation.js'

export const MAX_SPECIFIC_ASK_RECIPIENTS = 12
const CARD_DELIVERY_CONCURRENCY = 3

type AskThreadCard = {
  id: string
  user_id: string
  content: string
}

/**
 * Put one durable Ask card in every explicitly targeted direct thread.
 * Delivery is intentionally bounded: explicit audiences are capped at twelve
 * and only three conversation operations run at once.
 */
export async function deliverAskThreadCards(
  ask: AskThreadCard,
  recipientIds: string[]
): Promise<{ delivered: number; failed: number }> {
  const uniqueRecipientIds = [...new Set(recipientIds)]
    .filter((userId) => userId !== ask.user_id)
    .slice(0, MAX_SPECIFIC_ASK_RECIPIENTS)

  let nextIndex = 0
  let delivered = 0
  let failed = 0

  const workers = Array.from(
    { length: Math.min(CARD_DELIVERY_CONCURRENCY, uniqueRecipientIds.length) },
    async () => {
      while (nextIndex < uniqueRecipientIds.length) {
        const recipientId = uniqueRecipientIds[nextIndex]
        nextIndex += 1

        try {
          const conversationId = await ensureDirectConversation(ask.user_id, recipientId)
          const [message, restore] = await Promise.all([
            supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_id: ask.user_id,
              content: ask.content,
              message_kind: 'ask',
              ask_id: ask.id,
            }),
            supabase
              .from('conversation_participants')
              .update({ archived_at: null })
              .eq('conversation_id', conversationId),
          ])

          if (message.error) throw new Error(message.error.message)
          if (restore.error) {
            console.warn('[asks.thread-card] Card created but thread restore failed', {
              conversationId,
              askId: ask.id,
            })
          }
          delivered += 1
        } catch (error) {
          failed += 1
          console.error('[asks.thread-card] Delivery failed', {
            askId: ask.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }
  )

  await Promise.all(workers)
  return { delivered, failed }
}
