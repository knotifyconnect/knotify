import webpush from 'web-push'
import { supabase } from '../lib.js'

export const NOTIFICATION_TYPES = [
  'connection_request',
  'connection_accepted',
  'message',
  'event_rsvp',
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

type PushPayload = { title: string; body?: string; url?: string }

async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapidConfigured()) return

  const subs = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (subs.error || !subs.data?.length) return

  await Promise.allSettled(
    subs.data.map(async (sub) => {
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
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('Push send failed', error)
        }
      }
    })
  )
}

export async function getUserFirstName(userId: string): Promise<string> {
  const result = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle()
  const fullName = result.data?.full_name as string | undefined
  return fullName?.split(' ')[0] ?? 'Someone'
}

export async function createNotification(opts: {
  userId: string
  actorId?: string | null
  type: NotificationType
  title: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
}): Promise<void> {
  const { userId, actorId, type, title, body, entityType, entityId } = opts

  const insert = await supabase.from('notifications').insert({
    user_id: userId,
    actor_id: actorId ?? null,
    type,
    title,
    body: body ?? null,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
  })

  if (insert.error) {
    console.error('Failed to create notification', insert.error)
    return
  }

  try {
    await sendPushToUser(userId, {
      title,
      body: body ?? undefined,
      url: entityType && entityId ? entityUrl(entityType, entityId) : undefined,
    })
  } catch (error) {
    console.error('Failed to send push notification', error)
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
    default:
      return undefined
  }
}
