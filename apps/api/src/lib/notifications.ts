import webpush from 'web-push'
import { supabase } from '../lib.js'

export const NOTIFICATION_TYPES = [
  'connection_request',
  'connection_accepted',
  'message',
  'event_rsvp',
  'job_referral_request',
  'ask_reply',
  'ask_created',
  'ask_activity',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

let vapidConfigured = false

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim()

  if (!publicKey || !privateKey || !subject) return false

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

type PushPayload = { title: string; body?: string; url?: string; id?: string }

type NotificationInput = {
  userId: string
  actorId?: string | null
  type: NotificationType
  title: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

const DEFAULT_MAX_PUSH_RECIPIENTS = 16
const PUSH_CONCURRENCY = 4

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function sendPushBatch(
  notifications: NotificationInput[],
  notificationIdByUser: Map<string, string>,
  maxPushRecipients: number
): Promise<{ subscriptions: number; stale: number }> {
  if (!ensureVapidConfigured() || maxPushRecipients <= 0) {
    return { subscriptions: 0, stale: 0 }
  }

  const pushNotifications = notifications.slice(0, maxPushRecipients)
  const pushUserIds = pushNotifications.map((item) => item.userId)
  if (pushUserIds.length === 0) return { subscriptions: 0, stale: 0 }

  const subs = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', pushUserIds)

  if (subs.error) {
    console.error('Failed to load push subscriptions', subs.error)
    return { subscriptions: 0, stale: 0 }
  }

  const notificationByUser = new Map(pushNotifications.map((item) => [item.userId, item]))
  const staleIds: string[] = []
  const subscriptions = (subs.data ?? []) as PushSubscriptionRow[]

  await mapWithConcurrency(subscriptions, PUSH_CONCURRENCY, async (sub) => {
    const notification = notificationByUser.get(sub.user_id)
    if (!notification) return
    const payload: PushPayload = {
      id: notificationIdByUser.get(sub.user_id),
      title: notification.title,
      body: notification.body ?? undefined,
      url: notification.entityType && notification.entityId
        ? entityUrl(notification.entityType, notification.entityId)
        : undefined,
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id)
      } else {
        console.error('Push send failed', error)
      }
    }
  })

  if (staleIds.length > 0) {
    const cleanup = await supabase.from('push_subscriptions').delete().in('id', staleIds)
    if (cleanup.error) console.warn('Failed to remove stale push subscriptions', cleanup.error)
  }

  return { subscriptions: subscriptions.length, stale: staleIds.length }
}

export async function getUserFirstName(userId: string): Promise<string> {
  const result = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle()
  const fullName = result.data?.full_name as string | undefined
  return fullName?.split(' ')[0] ?? 'Someone'
}

export async function createNotification(opts: NotificationInput): Promise<void> {
  await createNotifications([opts])
}

export async function createNotifications(
  opts: NotificationInput[],
  delivery: { maxPushRecipients?: number } = {}
): Promise<void> {
  const unique = [...new Map(opts.map((item) => [item.userId, item])).values()]
  if (unique.length === 0) return

  const startedAt = Date.now()
  const maxPushRecipients = Math.max(
    0,
    Math.min(delivery.maxPushRecipients ?? DEFAULT_MAX_PUSH_RECIPIENTS, DEFAULT_MAX_PUSH_RECIPIENTS)
  )

  const insert = await supabase
    .from('notifications')
    .insert(unique.map(({ userId, actorId, type, title, body, entityType, entityId }) => ({
      user_id: userId,
      actor_id: actorId ?? null,
      type,
      title,
      body: body ?? null,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
    })))
    .select('id, user_id')

  if (insert.error) {
    console.error('Failed to create notifications', insert.error)
    return
  }

  const notificationIdByUser = new Map(
    (insert.data ?? []).map((row) => [row.user_id as string, row.id as string])
  )

  const push = await sendPushBatch(unique, notificationIdByUser, maxPushRecipients)

  if (unique.length > 1 || unique.length > maxPushRecipients) {
    console.info('[notifications.fanout]', JSON.stringify({
      notificationType: unique[0]?.type ?? 'unknown',
      recipients: unique.length,
      pushRecipients: Math.min(unique.length, maxPushRecipients),
      pushSubscriptions: push.subscriptions,
      staleSubscriptions: push.stale,
      pushCapped: unique.length > maxPushRecipients,
      durationMs: Date.now() - startedAt,
    }))
  }
}

export function entityUrl(entityType: string, entityId: string): string | undefined {
  switch (entityType) {
    case 'conversation':
      return `/messages?conversation=${entityId}`
    case 'connection':
      return `/map`
    case 'event':
      return `/events`
    case 'job':
      return `/jobs?job=${entityId}`
    case 'ask':
      return `/asks?ask=${entityId}`
    default:
      return undefined
  }
}
