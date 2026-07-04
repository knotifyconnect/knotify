/**
 * CompanionHero — a standalone chat card on Home, separate from the
 * "Today's moves" card queue (which stays as its own section so the two
 * never intervene with each other). On open it fetches (and, server-side,
 * lazily generates) a proactive opener grounded in the user's real network
 * data, then lets them chat freely. It's a real agent: some suggestion
 * pills are deep-links, but it can also directly send a message, propose
 * coffee, RSVP, or post an ask when the user confirms in conversation
 * (executed actions render as ✓/✕ chips above the reply).
 */
import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'
import { KAvatar } from '../lib/knotify'
import { T, SectionLabel } from '../lib/desk'
import { Send, MessageSquare, Coffee, User, Trophy, CalendarDays } from 'lucide-react'

export type Suggestion = {
  label: string
  action: 'open_message' | 'open_coffee' | 'open_profile' | 'open_quests' | 'open_events'
  peerId?: string
  draft?: string
}

export type ExecutedAction = {
  tool: string
  detail: string
  ok: boolean
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestions: Suggestion[] | null
  created_at: string
  actions?: ExecutedAction[]
}

export type PeerLite = { id: string; full_name: string; avatar_url: string | null }

const ACTION_ICON: Record<Suggestion['action'], typeof Send> = {
  open_message: MessageSquare,
  open_coffee: Coffee,
  open_profile: User,
  open_quests: Trophy,
  open_events: CalendarDays,
}

export function CompanionHero({
  peers,
  onSuggestion,
}: {
  /** peerId → lightweight peer info, used to resolve suggestion pills. */
  peers: Map<string, PeerLite>
  onSuggestion: (s: Suggestion) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    apiGet<{ messages: ChatMessage[] }>('/api/companion/messages')
      .then((r) => { if (mounted) setMessages(r.messages ?? []) })
      .catch((e) => {
        if (!mounted) return
        const detail = e instanceof Error ? e.message : 'Failed to load the Companion.'
        setMessages([{ id: 'load-error', role: 'assistant', content: detail, suggestions: null, created_at: new Date().toISOString() }])
      })
      .finally(() => { if (mounted) setLoadingHistory(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content, suggestions: null, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, optimistic])
    setSending(true)
    try {
      const r = await apiPost<{ reply: string; suggestions: Suggestion[]; actions?: ExecutedAction[] }>('/api/companion/messages', { content })
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, role: 'assistant', content: r.reply, suggestions: r.suggestions?.length ? r.suggestions : null, created_at: new Date().toISOString(), actions: r.actions?.length ? r.actions : undefined }])
    } catch (e) {
      // Surfaces the real server error (e.g. a bad model id, a missing table) while
      // this feature is still being stabilized, instead of a generic message.
      const detail = e instanceof Error ? e.message : "Sorry, that didn't go through, try again."
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: detail, suggestions: null, created_at: new Date().toISOString() }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ padding: 20, borderRadius: 18, background: '#fff', boxShadow: 'var(--lift-1)' }}>
      <SectionLabel>Companion</SectionLabel>

      <div
        ref={scrollRef}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560, overflowY: 'auto', padding: '4px 2px 8px' }}
      >
        {loadingHistory ? (
          <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 13.5, color: T.inkMuted, padding: '10px 2px' }}>
            Thinking about your network…
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
              {m.actions && m.actions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '94%' }}>
                  {m.actions.map((a, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 999,
                        background: a.ok ? T.verdSoft : T.paperDeep,
                        color: a.ok ? T.verd : T.inkMuted,
                        fontSize: 11.5, fontFamily: T.text, fontWeight: 600,
                      }}
                    >
                      {a.ok ? '✓' : '✕'} {a.detail}
                    </span>
                  ))}
                </div>
              )}
              <div
                style={{
                  maxWidth: m.role === 'user' ? '80%' : '94%',
                  padding: '9px 13px',
                  borderRadius: 14,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  fontFamily: T.text,
                  whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? T.ink : T.paperDeep,
                  color: m.role === 'user' ? T.paperSoft : T.ink,
                }}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '94%' }}>
                  {m.suggestions.map((s, i) => {
                    const Icon = ACTION_ICON[s.action]
                    const peer = s.peerId ? peers.get(s.peerId) : undefined
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSuggestion(s)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 999, border: 'none',
                          background: T.paperSoft, color: T.ink, fontSize: 12.5,
                          fontFamily: T.text, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {peer ? <KAvatar name={peer.full_name} src={peer.avatar_url} size={16} /> : <Icon size={13} />}
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div style={{ alignSelf: 'flex-start', padding: '9px 13px', borderRadius: 14, background: T.paperDeep, color: T.inkMuted, fontSize: 13, fontFamily: T.display, fontStyle: 'italic' }}>
            Companion is typing…
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, borderTop: `0.5px solid ${T.ruleSoft}`, paddingTop: 12 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your network…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: T.paperSoft, borderRadius: 12, padding: '10px 14px',
            fontSize: 13.5, fontFamily: T.text, color: T.ink, maxHeight: 100,
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || sending}
          aria-label="Send"
          style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 999, border: 'none',
            background: T.ink, color: T.paperSoft, cursor: input.trim() && !sending ? 'pointer' : 'default',
            opacity: input.trim() && !sending ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
