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
        display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'flex-end', alignItems: 'stretch',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 480,
          maxWidth: '100%',
          height: isMobile ? '88vh' : '100vh',
          background: T.paper,
          borderRadius: isMobile ? '20px 20px 0 0' : 0,
          borderLeft: isMobile ? 'none' : `0.5px solid ${T.rule}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: T.text,
          overflow: 'hidden',
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

        {/* Ask body */}
        <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${T.ruleSoft}` }}>
          <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.6, margin: 0, fontFamily: T.text }}>{ask.content}</p>
          {status === 'resolved' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, fontWeight: 700, color: T.verd, background: T.verdSoft, padding: '3px 10px', borderRadius: 999 }}>● Resolved</span>
          )}
        </div>

        {/* Replies list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkFaint, marginBottom: 12 }}>
            {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Replies'}
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>Loading…</div>
          ) : replies.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontStyle: 'italic', color: T.inkMuted, fontFamily: T.display, marginBottom: 4 }}>Be the first to help.</div>
              <div style={{ fontSize: 12, color: T.inkFaint }}>Your reply could make a real difference.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {replies.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <KAvatar name={r.author?.full_name ?? '?'} src={r.author?.avatar_url ?? null} size={32} />
                  <div style={{ flex: 1, minWidth: 0, background: T.paperSoft, borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginBottom: 3 }}>{r.author?.full_name ?? 'Someone'}</div>
                    <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>{r.body}</div>
                  </div>
                  {currentUserId === r.user_id && (
                    <button onClick={() => deleteReply(r.id)} aria-label="Delete reply" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 4, display: 'flex', marginTop: 6 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: reply composer + optional resolve */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${T.ruleSoft}`, padding: '14px 20px', paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : 14, background: T.paper }}>
          {mine && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={toggleResolved}
                style={{ padding: '6px 14px', borderRadius: 999, border: `0.5px solid ${status === 'resolved' ? T.verd : T.rule}`, background: status === 'resolved' ? T.verdSoft : 'transparent', color: status === 'resolved' ? T.verd : T.inkMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.text }}
              >
                {status === 'resolved' ? '↩ Reopen ask' : '✓ Mark as resolved'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 800))}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendReply() } }}
              placeholder={mine ? 'Add a note…' : 'Write a helpful reply…'}
              rows={2}
              style={{
                flex: 1, resize: 'none', minHeight: 56, maxHeight: 140,
                padding: '12px 14px', borderRadius: 14,
                border: `1px solid ${body.trim() ? T.ink : T.rule}`,
                background: T.paperSoft,
                fontSize: 14, color: T.ink, outline: 'none',
                fontFamily: T.text, lineHeight: 1.5, boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = T.ink }}
              onBlur={(e) => { e.currentTarget.style.borderColor = body.trim() ? T.ink : T.rule }}
            />
            <button
              onClick={sendReply}
              disabled={sending || !body.trim()}
              aria-label="Send reply"
              style={{
                flexShrink: 0, width: 48, height: 48, borderRadius: 14, border: 'none',
                background: body.trim() ? T.ink : T.paperDeep,
                color: body.trim() ? T.paper : T.inkFaint,
                cursor: body.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              <Send size={18} />
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 6 }}>⌘↵ to send</div>
        </div>
      </div>
    </div>
  )
}
