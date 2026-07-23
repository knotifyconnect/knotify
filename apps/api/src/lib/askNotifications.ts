import { audienceRecipientIdsForAsk, type AudienceAsk } from './askAudience.js'
import {
  createNotifications,
  getUserFirstName,
  type NotificationType,
} from './notifications.js'

type AskNotificationKind = 'reply' | 'reaction' | 'resolved' | 'reopened'

export async function notifyAskCreated(
  ask: AudienceAsk & { content: string }
): Promise<void> {
  const [recipientIds, authorName] = await Promise.all([
    audienceRecipientIdsForAsk(ask),
    getUserFirstName(ask.user_id),
  ])

  await createNotifications(recipientIds.map((userId) => ({
    userId,
    actorId: ask.user_id,
    type: 'ask_created' as NotificationType,
    title: `${authorName} asked for your help`,
    body: ask.content,
    entityType: 'ask',
    entityId: ask.id,
  })))
}

export async function notifyAskActivity(opts: {
  ask: AudienceAsk & { content: string }
  actorId: string
  kind: AskNotificationKind
  body?: string | null
}): Promise<void> {
  const { ask, actorId, kind, body } = opts
  const [audienceIds, actorName, authorName] = await Promise.all([
    audienceRecipientIdsForAsk(ask),
    getUserFirstName(actorId),
    getUserFirstName(ask.user_id),
  ])

  const recipientIds = [...new Set([ask.user_id, ...audienceIds])]
    .filter((userId) => userId !== actorId)

  const activityTitle = (recipientId: string) => {
    const isAuthor = recipientId === ask.user_id
    if (kind === 'reply') {
      return isAuthor
        ? `${actorName} replied to your ask`
        : `${actorName} replied to ${authorName}'s ask`
    }
    if (kind === 'reaction') {
      return isAuthor
        ? `${actorName} reacted to your ask`
        : `${actorName} reacted to ${authorName}'s ask`
    }
    if (kind === 'resolved') return `${authorName} marked an ask resolved`
    return `${authorName} reopened an ask`
  }

  await createNotifications(recipientIds.map((userId) => ({
    userId,
    actorId,
    type: kind === 'reply' ? 'ask_reply' : 'ask_activity',
    title: activityTitle(userId),
    body: body ?? ask.content,
    entityType: 'ask',
    entityId: ask.id,
  })))
}
