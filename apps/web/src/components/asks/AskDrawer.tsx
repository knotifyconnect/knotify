import { useEffect, useState } from 'react'
import { X, Globe, Hash, Briefcase, Send } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '../../lib/api'
import { KAvatar, KBtn } from '../../lib/knotify'
import { T } from '../../lib/desk'
import { useIsMobile } from '../../hooks/useIsMobile'
import { PERSONAS } from '../../lib/taxonomy'

export type Ask = {
  id: string
  user_id: string
  content: string
  status: 'open' | 'resolved'
  created_at: string
  audience_type?: 'everyone' | 'interest' | 'persona'
  audience_value?: string | null
  reply_count?: number
  author?: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

type Reply = {
  id: string
  user_id: string
  body: string
  created_at: string
  author: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

function audienceChip(ask: Ask) {
  const type = ask.audience_type ?? 'everyone'
  if (type === 'everyone') return { icon: Globe, label: 'Everyone' }
  if (type === 'interest') return { icon: Hash, label: ask.audience_value ?? 'Topic' }
  return { icon: Briefcase, label: PERSONAS.find((p) => p.value === ask.audience_value)?.label ?? 'Profession' }
}

export function AskDrawer({
  ask,
  currentUserId,
  onClose,
  onChanged,
}: {
  ask: Ask
  currentUserId: string | null
  onClose: () => void
  onChanged?: () => void
}) {
  const isMobile = useIsMobile()
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(ask.status)

  const mine = currentUserId === ask.user_id
  const chip = audienceChip(ask)
  const ChipIcon = chip.icon

  useEffect(() => {
    apiGet<{ replies: Reply[] }>(`/api/asks/${ask.id}/replies`)
      .then((r) => setReplies(r.replies ?? []))
      .catch(() => setReplies([]))
      .finally(() => setLoading(false))
  }, [ask.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function sendReply() {
    const text = body.trim()
    if (!text) return
    setSending(true)
    try {
      const r = await apiPost<{ reply: Reply }>(`/api/asks/${ask.id}/replies`, { body: text })
      setReplies((prev) => [...prev, r.reply])
      setBody('')
      onChanged?.()
    } catch { /* ignore */ }
    finally { setSending(false) }
  }

  async function deleteReply(id: string) {
    setReplies((prev) => prev.filter((r) => r.id !== id))
    try { await apiDelete(`/api/asks/${ask.id}/replies/${id}`) } catch { /* ignore */ }
  }

  async function toggleResolved() {
    const next = status === 'resolved' ? 'open' : 'resolved'
    setStatus(next)
    try {
      await apiPost(`/api/asks/${ask.id}/${next === 'resolved' ? 'resolve' : 'reopen'}`, {})
      onChanged?.()
    } catch { setStatus(status) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(26,24,21,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end', alignItems: isMobile ? 'flex-end' : 'stretch',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 440,
          maxWidth: '100%',
          height: isMobile ? 'auto' : '100%',
          maxHeight: isMobile ? '88vh' : '100%',
          background: T.paper,
          borderRadius: isMobile ? '20px 20px 0 0' : 0,
          borderLeft: isMobile ? 'none' : `0.5px solid ${T.rule}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: T.text,
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: `0.5px solid ${T.ruleSoft}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {ask.author && <KAvatar name={ask.author.full_name} src={ask.author.avatar_url} size={38} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{ask.author?.full_name ?? 'Someone'}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, padding: '2px 8px', borderRadius: 999, background: T.paperDeep, fontSize: 11, color: T.inkMuted }}>
              <ChipIcon size={11} /> {chip.label}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body + replies */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ fontSize: 16, color: T.ink, lineHeight: 1.5, marginBottom: 6 }}>{ask.content}</div>
          {status === 'resolved' && (
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: T.verd, marginBottom: 6 }}>● Resolved</span>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkFaint, margin: '18px 0 10px' }}>
            {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Replies'}
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: T.inkFaint }}>Loading…</div>
          ) : replies.length === 0 ? (
            <div style={{ fontSize: 13, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>Be the first to help.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {replies.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <KAvatar name={r.author?.full_name ?? '?'} src={r.author?.avatar_url ?? null} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{r.author?.full_name ?? 'Someone'}</div>
                    <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.45, marginTop: 1 }}>{r.body}</div>
                  </div>
                  {currentUserId === r.user_id && (
                    <button onClick={() => deleteReply(r.id)} aria-label="Delete reply" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 2, display: 'flex' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: resolve (if mine) + reply composer */}
        <div style={{ borderTop: `0.5px solid ${T.ruleSoft}`, padding: 14, paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : 14 }}>
          {mine && (
            <div style={{ marginBottom: 10 }}>
              <KBtn variant="ghost" size="sm" onClick={toggleResolved}>
                {status === 'resolved' ? 'Reopen ask' : 'Mark resolved'}
              </KBtn>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 800))}
              placeholder={mine ? 'Add a note…' : 'Write a helpful reply…'}
              rows={1}
              style={{ flex: 1, resize: 'none', minHeight: 42, maxHeight: 120, padding: '11px 12px', borderRadius: 12, border: `0.5px solid ${T.rule}`, background: T.paperSoft, fontSize: 14, color: T.ink, outline: 'none', fontFamily: T.text, lineHeight: 1.4, boxSizing: 'border-box' }}
            />
            <button
              onClick={sendReply}
              disabled={sending || !body.trim()}
              aria-label="Send reply"
              style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, border: 'none', background: body.trim() ? T.ink : T.inkFaint, color: T.paper, cursor: body.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
