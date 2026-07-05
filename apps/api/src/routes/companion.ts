/**
 * /api/companion — the Relationship OS Companion chat.
 *
 * One continuous per-user timeline (no threads). On first open (empty
 * history) the GET handler generates and persists a proactive opener grounded
 * in the user's real network data. Every reply is synchronous (no streaming
 * in v1) and returns strict-JSON { reply, suggestions, memory } that the
 * frontend renders as chat bubbles + deep-link action pills; `memory` facts
 * are persisted separately so future conversations stay grounded in durable
 * things the Companion has learned about this person, not just recent turns.
 *
 * The Companion is a real agent: it runs a Gemini function-calling loop and
 * can send a message, propose a coffee, RSVP to an event, or post an ask on
 * the user's behalf (companionActions.ts). The system prompt enforces
 * explicit user confirmation in-conversation before any outward-facing
 * action.
 *
 * Runs on Google's Gemini API (free tier) rather than Anthropic — a
 * deliberate choice so this feature has zero marginal cost by default. See
 * apps/api/src/engine/relationshipPriority.ts for the separate, still-Claude
 * "Layer 2" insight cache, which is untouched by this.
 */
import { Router } from 'express'
import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from '@google/genai'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'
import { buildCompanionContext, buildCompanionSystemPrompt, type CompanionContext } from '../services/companionContext.js'
import { sendMessage, proposeCoffee, rsvpEvent, createAsk, type ExecutedAction } from '../services/companionActions.js'

export const companionRouter = Router()

const MODEL = process.env.COMPANION_MODEL || 'gemini-2.5-flash'
const HISTORY_LIMIT = 50
const CONTEXT_TURNS = 20
const MAX_MESSAGE_LENGTH = 2000
const MAX_MEMORY_FACTS_PER_TURN = 5
const MAX_MEMORY_FACT_LENGTH = 300

// No per-user daily cap: Gemini's free tier has no billing attached, so
// there's no monetary cost to control. Its own free-tier request quota
// (shared per API key, not per user) is the real backstop — if that's ever
// hit, requests fail with a rate-limit error rather than a charge.

// Deliberately distinct wording from the generic-failure path below, so a
// screenshot immediately tells us which branch fired: this one means
// getGemini() returned null, i.e. GEMINI_API_KEY isn't visible to this
// runtime at all (as opposed to the key being present but the API call
// itself failing, which surfaces as a 500 with the real error instead).
const FALLBACK_REPLY = "Companion setup issue: GEMINI_API_KEY is not configured on this server."

// Only the successful case is cached — a missing key is re-checked fresh on
// every call (cheap: one process.env read) rather than latched permanently,
// so a warm container that happened to start before the key was configured
// can recover on its very next request instead of staying poisoned for its
// whole lifetime.
let gemini: GoogleGenAI | undefined
function getGemini(): GoogleGenAI | null {
  if (gemini) return gemini
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[companion] GEMINI_API_KEY is not set in process.env for this runtime')
    return null
  }
  gemini = new GoogleGenAI({ apiKey })
  return gemini
}

type Suggestion = {
  label: string
  action: 'open_message' | 'open_coffee' | 'open_profile' | 'open_quests' | 'open_events'
  peerId?: string
  draft?: string
}

type CompanionRow = {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions: Suggestion[] | null
  created_at: string
}

const VALID_ACTIONS = new Set(['open_message', 'open_coffee', 'open_profile', 'open_quests', 'open_events'])

/** Defensive JSON parse of the model's reply — same discipline as the Layer 2 engine. */
function parseModelReply(raw: string, ctx: CompanionContext): { reply: string; suggestions: Suggestion[]; memory: string[] } {
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { reply?: string; suggestions?: Suggestion[]; memory?: string[] }
    if (!parsed.reply) return { reply: raw, suggestions: [], memory: [] }
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
      .filter((s) => s && typeof s.label === 'string' && VALID_ACTIONS.has(s.action))
      // Safety net: never let a hallucinated person through — peerId must be a real connection.
      .filter((s) => !s.peerId || ctx.home.peerProfiles.has(s.peerId))
      .slice(0, 3)
    const memory = (Array.isArray(parsed.memory) ? parsed.memory : [])
      .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
      .map((f) => f.trim().slice(0, MAX_MEMORY_FACT_LENGTH))
      .slice(0, MAX_MEMORY_FACTS_PER_TURN)
    return { reply: parsed.reply, suggestions, memory }
  } catch {
    return { reply: raw, suggestions: [], memory: [] }
  }
}

// ── Agent tools ──────────────────────────────────────────────────────────────
// parametersJsonSchema takes a raw JSON Schema object directly (Gemini's
// alternative to building a Schema/Type-enum tree), so these definitions are
// the same shape Anthropic's input_schema would use.

const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'send_message',
    description: 'Send a direct message to one of the user\'s accepted connections, on the user\'s behalf. Only after the user explicitly confirmed the exact text in this conversation. peerId must come from CONTEXT.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        peerId: { type: 'string', description: 'UUID of the connection, exactly as it appears in CONTEXT' },
        text: { type: 'string', description: 'The message text, exactly as the user approved it' },
      },
      required: ['peerId', 'text'],
    },
  },
  {
    name: 'propose_coffee',
    description: 'Propose a coffee meeting to a connection (they still have to confirm). Only after the user confirmed person, time and place. peerId must come from CONTEXT.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        peerId: { type: 'string', description: 'UUID of the connection from CONTEXT' },
        scheduledAt: { type: 'string', description: 'ISO 8601 datetime in the future' },
        locationText: { type: 'string', description: 'Café name or meeting spot' },
      },
      required: ['peerId', 'scheduledAt', 'locationText'],
    },
  },
  {
    name: 'rsvp_event',
    description: 'RSVP the user to an upcoming event they clearly asked to join. eventId must come from CONTEXT.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'UUID of the event from CONTEXT' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'create_ask',
    description: 'Post an ask (a request for help) to the user\'s network, visible to their connections. Only after the user confirmed the exact wording.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The ask text, 5-280 characters, as the user approved it' },
      },
      required: ['content'],
    },
  },
]

async function executeTool(userId: string, ctx: CompanionContext, name: string, input: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (name) {
      case 'send_message': return await sendMessage(userId, ctx.home.peerProfiles, input as { peerId?: string; text?: string })
      case 'propose_coffee': return await proposeCoffee(userId, ctx.home.peerProfiles, input as { peerId?: string; scheduledAt?: string; locationText?: string })
      case 'rsvp_event': return await rsvpEvent(userId, input as { eventId?: string })
      case 'create_ask': return await createAsk(userId, input as { content?: string })
      default: return { ok: false, detail: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Tool execution failed' }
  }
}

const MAX_AGENT_TURNS = 3

async function callCompanion(
  client: GoogleGenAI,
  userId: string,
  ctx: CompanionContext,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ reply: string; suggestions: Suggestion[]; memory: string[]; actions: ExecutedAction[] }> {
  const system = buildCompanionSystemPrompt(ctx)
  const contents: Content[] = history.length
    ? history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    : [{ role: 'user', parts: [{ text: 'The user just opened the Companion. Greet them briefly and, if CONTEXT has something concrete worth raising, lead with that. Otherwise just offer a warm, low-key opener.' }] }]

  const actions: ExecutedAction[] = []

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: AGENT_TOOLS }],
        maxOutputTokens: 1500,
      },
    })

    const calls = response.functionCalls
    if (!calls || !calls.length) {
      return { ...parseModelReply(response.text ?? '', ctx), actions }
    }

    // Execute every tool call in this turn, feed results back, continue the loop.
    const modelParts = response.candidates?.[0]?.content?.parts ?? calls.map((c) => ({ functionCall: c }) as Part)
    const resultParts: Part[] = []
    for (const call of calls) {
      const result = await executeTool(userId, ctx, call.name ?? '', call.args ?? {})
      actions.push({ tool: call.name ?? 'unknown', detail: result.detail, ok: result.ok })
      resultParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { ok: result.ok, detail: result.detail },
        },
      })
    }
    contents.push({ role: 'model', parts: modelParts })
    contents.push({ role: 'user', parts: resultParts })
  }

  // Loop cap hit: surface what did happen rather than an opaque error.
  const done = actions.filter((a) => a.ok).map((a) => a.detail).join(' ')
  return { reply: done || 'I got stuck partway through that, nothing further was changed.', suggestions: [], memory: [], actions }
}

async function persistMessage(userId: string, role: 'user' | 'assistant', content: string, suggestions?: Suggestion[]) {
  await supabase.from('companion_messages').insert({
    user_id: userId, role, content, suggestions: suggestions?.length ? suggestions : null,
  })
}

async function persistMemory(userId: string, facts: string[]) {
  if (!facts.length) return
  await supabase.from('companion_memory').insert(facts.map((fact) => ({ user_id: userId, fact })))
}

// ── GET /messages ────────────────────────────────────────────────────────────
companionRouter.get('/messages', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  try {
    const { data: rows } = await supabase
      .from('companion_messages')
      .select('id, role, content, suggestions, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(HISTORY_LIMIT)

    const messages = (rows ?? []) as CompanionRow[]
    if (messages.length) return res.json({ messages })

    // Empty history — generate the proactive opener.
    const client = getGemini()
    if (!client) {
      return res.json({ messages: [{ id: 'fallback', role: 'assistant', content: FALLBACK_REPLY, suggestions: null, created_at: new Date().toISOString() }] })
    }

    const ctx = await buildCompanionContext(userId)
    const { reply, suggestions, memory } = await callCompanion(client, userId, ctx, [])
    await persistMessage(userId, 'assistant', reply, suggestions)
    await persistMemory(userId, memory)

    return res.json({ messages: [{ id: 'opener', role: 'assistant', content: reply, suggestions: suggestions.length ? suggestions : null, created_at: new Date().toISOString() }] })
  } catch (err) {
    console.error('[companion] GET /messages failed', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed loading companion messages' })
  }
})

// ── POST /messages ───────────────────────────────────────────────────────────
companionRouter.post('/messages', requireAuth, async (req, res) => {
  const userId = req.appUserId
  if (!userId) return res.status(404).json({ error: 'Profile not found' })

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
  if (!content) return res.status(400).json({ error: 'content is required' })
  if (content.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: `content must be ${MAX_MESSAGE_LENGTH} characters or fewer` })

  try {
    await persistMessage(userId, 'user', content)

    const client = getGemini()
    if (!client) {
      return res.json({ reply: FALLBACK_REPLY, suggestions: [] })
    }

    const { data: rows } = await supabase
      .from('companion_messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_TURNS)

    const history = ((rows ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>)
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }))

    const ctx = await buildCompanionContext(userId)
    const { reply, suggestions, memory, actions } = await callCompanion(client, userId, ctx, history)
    await persistMessage(userId, 'assistant', reply, suggestions)
    await persistMemory(userId, memory)

    return res.json({ reply, suggestions, actions })
  } catch (err) {
    console.error('[companion] POST /messages failed', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed sending message to companion' })
  }
})
