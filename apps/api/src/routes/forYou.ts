import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

/**
 * /api/for-you — the personalization engine.
 *
 * A single server-ranked feed that scores what the user could act on next
 * (events to attend, asks they could answer) against their own signals —
 * interests, goals, persona — and returns each item with a human "why".
 *
 * The goal is that everything on Home feels chosen *for* the user, and every
 * suggestion can explain itself. People suggestions intentionally live in
 * Discover, so this focuses on events + asks.
 */
export const forYouRouter = Router()

function lc(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase()) : []
}

function overlap(a: string[], b: Set<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of a) {
    if (b.has(x) && !seen.has(x)) { seen.add(x); out.push(x) }
  }
  return out
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

forYouRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) return res.status(404).json({ error: 'Profile not found' })
  const meId = req.appUserId

  // ── Viewer signals ────────────────────────────────────────────────────────
  const meRow = await supabase
    .from('users')
    .select('interests, goals, persona, can_help_with')
    .eq('id', meId)
    .maybeSingle()

  const myInterests = lc(meRow.data?.interests)
  const myGoals = lc(meRow.data?.goals)
  const interestSet = new Set(myInterests)
  const goalSet = new Set(myGoals)
  const helpText = (meRow.data?.can_help_with ?? '').toLowerCase()

  // ── Events: upcoming, not mine, scored ────────────────────────────────────
  const eventsR = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, capacity, price_eur, event_type, interests, host_id, source, url, host_label, image_url, users:host_id(full_name, avatar_url)')
    .gte('starts_at', new Date(Date.now() - 3 * 3600 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(60)

  const eventRows = eventsR.data ?? []
  const eventIds = eventRows.map((e) => e.id)

  const rsvpCount = new Map<string, number>()
  const myRsvps = new Set<string>()
  if (eventIds.length) {
    const rsvps = await supabase.from('event_rsvps').select('event_id, user_id').in('event_id', eventIds)
    for (const r of rsvps.data ?? []) {
      rsvpCount.set(r.event_id, (rsvpCount.get(r.event_id) ?? 0) + 1)
      if (r.user_id === meId) myRsvps.add(r.event_id)
    }
  }

  const now = Date.now()
  const rankedEvents = eventRows
    .filter((e) => e.host_id !== meId && !myRsvps.has(e.id))
    .map((e) => {
      const evInterests = lc((e as any).interests)
      const sharedInterests = overlap(evInterests, interestSet)
      const sharedGoals = overlap(evInterests, goalSet)
      const count = rsvpCount.get(e.id) ?? 0
      const daysAway = (new Date(e.starts_at).getTime() - now) / 86400000

      let score = 0
      score += sharedInterests.length * 5
      score += sharedGoals.length * 4
      if (daysAway >= 0 && daysAway <= 3) score += 3
      else if (daysAway > 3 && daysAway <= 10) score += 1.5
      score += Math.min(count, 10) * 0.4
      if ((e as any).source === 'curated') score += 1

      const reason =
        sharedInterests.length > 0 ? `Because you're into ${titleCase(sharedInterests[0])}`
        : sharedGoals.length > 0 ? `Fits your goal: ${titleCase(sharedGoals[0])}`
        : count >= 3 ? `${count} people going`
        : daysAway >= 0 && daysAway <= 3 ? 'Happening soon'
        : 'New in Munich'

      const host = Array.isArray((e as any).users) ? (e as any).users[0] : (e as any).users
      return {
        type: 'event' as const,
        score,
        reason,
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        starts_at: e.starts_at,
        ends_at: (e as any).ends_at ?? null,
        interests: evInterests,
        image_url: (e as any).image_url ?? null,
        event_type: (e as any).event_type ?? null,
        price_eur: (e as any).price_eur ?? null,
        source: (e as any).source ?? 'peer',
        url: (e as any).url ?? null,
        host_name: (e as any).source === 'curated' ? ((e as any).host_label ?? 'Munich') : (host?.full_name ?? 'Someone'),
        rsvp_count: count,
      }
    })
    .sort((a, b) => b.score - a.score)

  // ── Asks: open, not mine, that the viewer might answer ─────────────────────
  const asksR = await supabase
    .from('user_asks')
    .select('id, user_id, content, status, audience_type, audience_value, created_at, users:user_id(id, full_name, username, avatar_url)')
    .eq('status', 'open')
    .neq('user_id', meId)
    .order('created_at', { ascending: false })
    .limit(40)

  const rankedAsks = (asksR.error ? [] : (asksR.data ?? []))
    .map((a) => {
      const audienceValue = (a as any).audience_type === 'interest' && typeof (a as any).audience_value === 'string'
        ? [String((a as any).audience_value).toLowerCase()]
        : []
      const sharedInterests = overlap(audienceValue, interestSet)
      const content = String((a as any).content ?? '').toLowerCase()
      // Does the viewer's "can help with" text mention anything in the ask?
      const helpMatch = helpText.length > 3 && helpText.split(/[\s,]+/).some((w: string) => w.length > 3 && content.includes(w))

      let score = 0.5
      score += sharedInterests.length * 4
      if (helpMatch) score += 3

      const reason =
        sharedInterests.length > 0 ? `Matches your interest in ${titleCase(sharedInterests[0])}`
        : helpMatch ? 'You said you can help with this'
        : 'From your network'

      const author = Array.isArray((a as any).users) ? (a as any).users[0] : (a as any).users
      return {
        type: 'ask' as const,
        score,
        reason,
        id: a.id,
        content: (a as any).content,
        created_at: (a as any).created_at,
        author: author ? { id: author.id, full_name: author.full_name, username: author.username, avatar_url: author.avatar_url } : null,
      }
    })
    .sort((a, b) => b.score - a.score)

  return res.json({
    events: rankedEvents.slice(0, 12),
    asks: rankedAsks.slice(0, 8),
  })
})
