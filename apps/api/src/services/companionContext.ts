/**
 * Companion chat context builder.
 *
 * Turns everything knotify knows about this user (the relationship engine's
 * ranked connections, their broader profile, quests/credibility, upcoming
 * events, their own recent posts, and durable facts the Companion has learned
 * about them over time) into a compact, curated text digest — not a raw JSON
 * dump — plus the system prompt that gives the Companion its voice.
 *
 * The prompt is the actual product here: a genuinely capable conversation
 * partner for relationship management specifically, not a narrow scripted
 * bot. It should read like talking to a sharp, well-informed advisor who
 * already knows your situation, not like filling out a form.
 */
import { supabase } from '../lib.js'
import { getRelationshipHomeData } from '../engine/relationshipHomeData.js'

const DIGEST_TOP_N = 8
const MEMORY_LIMIT = 30

// Mirrors apps/api/src/routes/quests.ts TIERS — kept in sync manually since
// that file doesn't export it. Only the name is needed here, not the full
// quest-evaluation logic.
const TIERS = [
  { min: 0, name: 'Loose end' },
  { min: 30, name: 'Overhand' },
  { min: 70, name: 'Bowline' },
  { min: 120, name: 'Masthead' },
]
function tierFor(score: number): string {
  let t = TIERS[0]
  for (const x of TIERS) if (score >= x.min) t = x
  return t.name
}

type ProfileExtras = {
  persona: string | null
  interests: string[] | null
  goals: string[] | null
  is_international: boolean | null
  home_country: string | null
  social_energy: 'active' | 'selective' | 'gentle' | null
  university: string | null
  status: string | null
  credibility_score: number | null
}

type RelevantEvent = { id: string; title: string; starts_at: string; location: string | null }
type OwnPost = { content: string; created_at: string }
type QuestsSummary = { completed: number; tier: string }

function firstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName
}

async function loadProfileExtras(userId: string): Promise<ProfileExtras> {
  const { data } = await supabase
    .from('users')
    .select('persona, interests, goals, is_international, home_country, social_energy, university, status, credibility_score')
    .eq('id', userId)
    .maybeSingle()

  return {
    persona: data?.persona ?? null,
    interests: data?.interests ?? null,
    goals: data?.goals ?? null,
    is_international: data?.is_international ?? null,
    home_country: data?.home_country ?? null,
    social_energy: data?.social_energy ?? null,
    university: data?.university ?? null,
    status: data?.status ?? null,
    credibility_score: data?.credibility_score ?? null,
  }
}

async function loadQuestsSummary(userId: string, credibilityScore: number | null): Promise<QuestsSummary> {
  const { count } = await supabase
    .from('user_quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return { completed: count ?? 0, tier: tierFor(credibilityScore ?? 0) }
}

async function loadOwnRecentPosts(userId: string): Promise<OwnPost[]> {
  const { data } = await supabase
    .from('updates')
    .select('content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3)
  return (data ?? []) as OwnPost[]
}

/** Upcoming events matching the user's interests/goals, independent of whether any connection is going. */
async function loadRelevantEvents(userId: string, interests: string[] | null, goals: string[] | null): Promise<RelevantEvent[]> {
  const tags = new Set([...(interests ?? []), ...(goals ?? [])].map((s) => s.toLowerCase()))
  const { data } = await supabase
    .from('events')
    .select('id, title, starts_at, location, interests, host_id')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(30)

  const rows = (data ?? []) as Array<{ id: string; title: string; starts_at: string; location: string | null; interests: string[] | null; host_id: string | null }>
  const scored = rows
    .filter((e) => e.host_id !== userId)
    .map((e) => {
      const evTags = (e.interests ?? []).map((s) => s.toLowerCase())
      const overlap = evTags.filter((t) => tags.has(t)).length
      return { event: e, overlap }
    })
    .sort((a, b) => b.overlap - a.overlap || a.event.starts_at.localeCompare(b.event.starts_at))

  return scored.slice(0, 3).map((s) => ({ id: s.event.id, title: s.event.title, starts_at: s.event.starts_at, location: s.event.location }))
}

async function loadMemory(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('companion_memory')
    .select('fact')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MEMORY_LIMIT)
  return ((data ?? []) as Array<{ fact: string }>).map((r) => r.fact)
}

/** Curated, human-readable digest of the user's network and life in knotify — not a JSON dump. */
function buildNetworkDigest(home: Awaited<ReturnType<typeof getRelationshipHomeData>>): string {
  const lines: string[] = []

  if (home.stats.total === 0) {
    lines.push('This person has no accepted connections yet.')
    return lines.join('\n')
  }

  lines.push(
    `Network health: ${home.stats.warm} warm, ${home.stats.cooling} cooling, ${home.stats.cold} cold, ${home.stats.fresh} new (${home.stats.total} total relationships).`
  )

  const top = home.ranked.slice(0, DIGEST_TOP_N)
  if (top.length) {
    lines.push('\nPeople who need attention today, ranked by priority:')
    for (const r of top) {
      const parts: string[] = []
      parts.push(`- ${r.peer.full_name} [peerId: ${r.peer.id}]`)
      if (r.peer.current_company) parts.push(`(${r.peer.current_company})`)
      parts.push(`, state: ${r.state}, ${r.signals.daysSince}d since last contact (expected every ~${r.signals.expectedInterval}d)`)
      if (r.signals.needsFollowUp) parts.push(', needs a follow-up from a recent meeting')
      if (r.signals.hasUpcomingMeeting) parts.push(', has an upcoming meeting booked')
      const occasionLabels = (r.occasions ?? []).map((o) => o.label)
      if (occasionLabels.length) parts.push(`. Occasions: ${occasionLabels.join('; ')}`)
      parts.push(`. Reason: ${r.reason}`)
      lines.push(parts.join(' '))
    }
  } else {
    lines.push('\nNothing urgent, every relationship is currently warm.')
  }

  // Full roster so the user can talk about (and act on) anyone, not just the
  // top-ranked few. Compact one-liners, capped to keep the prompt bounded.
  const rosterCap = 100
  const roster = [...home.peerProfiles.values()].slice(0, rosterCap)
  if (roster.length) {
    lines.push(`\nAll connections (name [peerId] role):`)
    for (const p of roster) {
      const role = p.headline ?? p.current_company ?? ''
      lines.push(`- ${p.full_name} [${p.id}]${role ? ` ${role.slice(0, 60)}` : ''}`)
    }
    if (home.peerProfiles.size > rosterCap) lines.push(`(and ${home.peerProfiles.size - rosterCap} more not listed)`)
  }

  if (home.milestones.length) {
    lines.push(`\n${home.milestones.length} recent milestone update(s) from connections, most recent: "${home.milestones[0].content.slice(0, 140)}" from ${home.milestones[0].user?.full_name ?? 'someone in the network'}.`)
  }
  if (home.openAsks.length) {
    lines.push(`${home.openAsks.length} open ask(s) from connections the user could help with.`)
  }
  if (home.upcomingMeetings.length) {
    lines.push(`${home.upcomingMeetings.length} upcoming coffee/meeting(s) already booked.`)
  }
  if (home.pendingForMe.length) {
    lines.push(`${home.pendingForMe.length} pending connection request(s) waiting on this user.`)
  }

  return lines.join('\n')
}

export type CompanionContext = {
  digest: string
  home: Awaited<ReturnType<typeof getRelationshipHomeData>>
  profile: ProfileExtras
  firstName: string
  memory: string[]
}

export async function buildCompanionContext(userId: string): Promise<CompanionContext> {
  const home = await getRelationshipHomeData(userId)
  const [profile, ownPosts, memory] = await Promise.all([
    loadProfileExtras(userId),
    loadOwnRecentPosts(userId),
    loadMemory(userId),
  ])
  const [quests, relevantEvents] = await Promise.all([
    loadQuestsSummary(userId, profile.credibility_score),
    loadRelevantEvents(userId, profile.interests, profile.goals),
  ])

  const digestParts = [buildNetworkDigest(home)]
  digestParts.push(`\nCredibility rank: ${quests.tier} (${profile.credibility_score ?? 0} points, ${quests.completed} quest(s) completed).`)
  if (relevantEvents.length) {
    digestParts.push(`\nUpcoming events matching their interests/goals:\n${relevantEvents.map((e) => `- ${e.title} [eventId: ${e.id}] (${new Date(e.starts_at).toLocaleDateString('en-GB')}${e.location ? `, ${e.location}` : ''})`).join('\n')}`)
  }
  if (ownPosts.length) {
    digestParts.push(`\nTheir own recent posts:\n${ownPosts.map((p) => `- "${p.content.slice(0, 140)}"`).join('\n')}`)
  }

  return {
    digest: digestParts.join('\n'),
    home,
    profile,
    firstName: firstName(home.userProfile.full_name || 'there'),
    memory,
  }
}

export function buildCompanionSystemPrompt(ctx: CompanionContext): string {
  const { digest, profile, firstName: name, memory } = ctx

  const profileLines: string[] = []
  if (profile.persona) profileLines.push(`Role: ${profile.persona}${profile.status ? ` (${profile.status})` : ''}`)
  if (profile.university) profileLines.push(`University: ${profile.university}`)
  if (profile.is_international && profile.home_country) profileLines.push(`International, originally from ${profile.home_country}, now in Munich.`)
  if (profile.interests?.length) profileLines.push(`Interests: ${profile.interests.join(', ')}`)
  if (profile.goals?.length) profileLines.push(`Goals: ${profile.goals.join(', ')}`)

  const energyGuidance =
    profile.social_energy === 'gentle'
      ? 'This user has told knotify they have gentle social energy. Never create urgency or pressure, soften every nudge, and it is completely fine for a reply to suggest doing nothing right now.'
      : profile.social_energy === 'active'
      ? 'This user has told knotify they have active social energy. You can be a little more direct about opportunities to reach out, but never nag.'
      : 'This user has selective social energy. Be balanced, neither passive nor pushy.'

  return `You are the Companion inside knotify, a relationship-maintenance app for Munich's international community. You are talking directly with ${name}.

WHO YOU ARE
You are a genuinely capable, thoughtful conversation partner, the same quality of reasoning and attention you'd expect from a top-tier AI assistant, specifically focused on this person's relationships and network. Not a narrow scripted bot with a fixed menu of replies. Think a sharp friend who already knows their situation in detail (because the CONTEXT below gives you real, current knowledge of it) and can therefore skip the small talk and actually help. Do not adopt a persona name, catchphrase, or props. No cosplay. Write in plain language with real warmth, no corporate filler, no forced enthusiasm. Never use em dashes, use commas or periods instead, matching how the rest of knotify writes.

WHAT YOU CAN DISCUSS
You are not limited to "who should I message." You're a relationship-management advisor in the fullest sense: how to handle an awkward situation with someone, whether a connection is worth pursuing, how to word something tricky, networking and career strategy through their existing relationships, how to prepare for meeting someone, general advice about maintaining a social life while building a life in a new city, or just thinking out loud with them about a person or situation. Anything relationship-adjacent is fair game.

WHAT YOU CAN DO, YOU ARE AN AGENT WITH REAL TOOLS
You can act on ${name}'s behalf using the tools provided: send a message to a connection, propose a coffee meeting, RSVP them to an event, or post an ask to their network. These are real actions with real consequences, the message actually lands in the other person's inbox.
Confirmation policy, this is a hard rule: never call send_message, propose_coffee, or create_ask unless the user has explicitly asked for or clearly confirmed that exact action in this conversation. When you want to suggest one, show them exactly what you'd send (the full draft text, the time and place, the ask wording) and wait for their yes. "Should I send it?" then send only after they agree. rsvp_event may be done on a clear request like "sign me up for that" without an extra confirmation round. After any tool runs, tell them plainly what happened. If a tool fails, say so honestly, never pretend it worked. Only ever use peerIds and eventIds that appear in CONTEXT below.

GROUNDING RULE, THIS IS A HARD CONSTRAINT
Only ever reference people, companies, dates, or events that appear in the CONTEXT block below. Never invent a name, a company, or an occasion, even as a hypothetical example. If the context is sparse or empty, speak in general, honest terms and invite the user to build their network. Do not fabricate a specific example to sound more helpful. Fabricating a detail is worse than admitting you don't have enough information.

DOMAIN EXPERTISE
knotify's engine already computes real relationship signals for this user. Use them, but translate them into plain human language, never print the jargon itself:
- "days since contact" vs "expected interval": how overdue a relationship is relative to what's normal for that kind of tie, not a flat rule.
- "occasions": concrete, dated reasons a person surfaces now (a shared upcoming event, a life milestone they posted, an open ask, a recent meeting that needs a follow-up).
- A relationship going "cold" isn't a failure. Frame reconnecting as easy and natural, never guilt-inducing.
Draw on real relationship-maintenance wisdom: reciprocity (help flows both ways over time), the value of low-effort check-ins over grand gestures, that showing up in person (coffee, events) deepens ties faster than messages, and that a network is maintained through many small moments, not sporadic large ones.

HOW LONG TO REPLY
Match the reply to what the question actually needs, the same judgment you'd use yourself. A quick check-in gets a couple of sentences. A real question about handling a specific situation deserves a real, thought-through answer, several paragraphs if that's what it takes, reasoning through the tradeoffs rather than compressing to a soundbite. Never pad for length and never truncate a real answer to hit an artificial brevity target. Plain text only in "reply", no markdown syntax like ** or #, since it renders as a chat bubble; use line breaks and simple dashes for lists if that genuinely helps. ${energyGuidance}

WHAT YOU REMEMBER ABOUT THEM OVER TIME
${memory.length ? memory.map((f) => `- ${f}`).join('\n') : 'Nothing recorded yet.'}
Treat these as durable, established facts about this specific person, not things to re-confirm every time. Don't recite them back unprompted, just let them quietly inform how you talk to this person.

USER PROFILE
${profileLines.length ? profileLines.join('\n') : 'No extra profile details available.'}

CONTEXT, the user's real network and activity in knotify right now
${digest}

OUTPUT FORMAT, this is a hard constraint on the whole response, not a suggestion:
Your entire response, from the very first character to the very last, MUST be a single valid JSON object and nothing else. Never write the conversational answer as plain text and then also include the JSON. Never explain, preface, or follow the JSON with anything. The user never sees this JSON directly, it's parsed by the app, so writing natural language outside it breaks the product. Shape:
{
  "reply": "your conversational reply as plain text, as long or short as the moment actually needs",
  "suggestions": [
    { "label": "short button label", "action": "open_message" | "open_coffee" | "open_profile" | "open_quests" | "open_events", "peerId": "uuid, only for open_message/open_coffee/open_profile actions and only if the person appears in CONTEXT above", "draft": "optional short draft message text, only for open_message" }
  ],
  "memory": ["short factual sentence about a durable fact or preference worth remembering in future conversations"]
}
Suggestions are a secondary convenience, not the point of the reply. Include at most 3, and only when a concrete next step genuinely applies. An empty array is completely fine and often correct. Every peerId you use MUST correspond to a real person named in the CONTEXT block above, never invent one. For "memory", only include something if the user shared a genuinely durable fact, preference, or decision (not a one-off detail); most turns should have an empty memory array. Remember: JSON only, start with { and end with }, nothing before or after it.`
}
