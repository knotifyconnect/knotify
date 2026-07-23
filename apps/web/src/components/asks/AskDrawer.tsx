import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Globe, Hash, Briefcase, Send, Pencil, Share2, Trash2, UsersRound } from 'lucide-react'
import { apiGet, apiPost, apiDelete, apiPatch } from '../../lib/api'
import { KAvatar } from '../../lib/knotify'
import { T } from '../../lib/desk'
import { PERSONAS } from '../../lib/taxonomy'


export type Ask = {
  id: string
  user_id: string
  content: string
  status: 'open' | 'resolved'
  created_at: string
  audience_type?: 'everyone' | 'interest' | 'persona' | 'people'
  audience_value?: string | null
  audience_count?: number
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
  if (type === 'everyone') return { icon: Globe, label: 'Your knot' }
  if (type === 'interest') return { icon: Hash, label: ask.audience_value ?? 'Topic' }
  if (type === 'persona') {
    return { icon: Briefcase, label: PERSONAS.find((p) => p.value === ask.audience_value)?.label ?? 'Profession' }
  }
  return {
    icon: UsersRound,
    label: `${ask.audience_count ?? 0} selected ${ask.audience_count === 1 ? 'person' : 'people'}`,
  }
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
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(ask.status)
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(ask.content)
  const [draftContent, setDraftContent] = useState(ask.content)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function saveEdit() {
    const content = draftContent.trim()
    if (!content || content === ask.content) { setEditing(false); return }
    setSaving(true)
    try {
      await apiPatch(`/api/asks/${ask.id}`, { content })
      setContent(content)
      onChanged?.()
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function shareAsk() {
    const share = { title: 'A knotify ask', text: content, url: `${window.location.origin}/asks` }
    try {
      if (navigator.share) await navigator.share(share)
      else await navigator.clipboard.writeText(`${share.text}\n${share.url}`)
    } catch { /* cancellation and unavailable clipboard are non-fatal */ }
  }

  async function deleteAsk() {
    if (!window.confirm('Delete this ask and its replies?')) return
    setDeleting(true)
    try {
      await apiDelete(`/api/asks/${ask.id}`)
      onChanged?.()
      onClose()
    } finally { setDeleting(false) }
  }

  return createPortal(
    <div
      className="k-visual-viewport-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        zIndex: 220,
        background: 'rgba(26,24,21,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(85dvh, calc(var(--visual-viewport-height) - 32px))',
          background: T.paper,
          borderRadius: 20,
          border: `0.5px solid ${T.rule}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: T.text,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(26,24,21,0.18)',
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
          {editing ? (
            <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value.slice(0, 280))} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${T.rule}`, background: T.paperSoft, color: T.ink, fontFamily: T.text, fontSize: 14, lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }} />
          ) : (
            <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.6, margin: 0 }}>{content}</p>
          )}
          {status === 'resolved' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, fontWeight: 700, color: T.verd, background: T.verdSoft, padding: '3px 10px', borderRadius: 999 }}>● Resolved</span>
          )}
        </div>

        {/* Replies */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkFaint, marginBottom: 12 }}>
            {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Replies'}
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display }}>Loading…</div>
          ) : replies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 15, fontStyle: 'italic', color: T.inkMuted, fontFamily: T.display, marginBottom: 4 }}>Be the first to help.</div>
              <div style={{ fontSize: 12, color: T.inkFaint }}>Your reply could make a real difference.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {replies.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <KAvatar name={r.author?.full_name ?? '?'} src={r.author?.avatar_url ?? null} size={30} />
                  <div style={{ flex: 1, minWidth: 0, background: T.paperSoft, borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginBottom: 3 }}>{r.author?.full_name ?? 'Someone'}</div>
                    <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>{r.body}</div>
                  </div>
                  {currentUserId === r.user_id && (
                    <button onClick={() => deleteReply(r.id)} aria-label="Delete reply" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 4, display: 'flex', marginTop: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${T.ruleSoft}`, padding: '14px 20px', background: T.paper }}>
          {mine && (
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              <button
                type="button"
                onClick={toggleResolved}
                style={{ padding: '6px 14px', borderRadius: 999, border: `0.5px solid ${status === 'resolved' ? T.verd : T.rule}`, background: status === 'resolved' ? T.verdSoft : 'transparent', color: status === 'resolved' ? T.verd : T.inkMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.text }}
              >
                {status === 'resolved' ? '↩ Reopen ask' : '✓ Mark as resolved'}
              </button>
              <button type="button" onClick={() => editing ? void saveEdit() : setEditing(true)} disabled={saving} style={{ padding: '6px 12px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, fontSize: 12, cursor: 'pointer', fontFamily: T.text, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <Pencil size={12} /> {editing ? (saving ? 'Saving…' : 'Save') : 'Edit'}
              </button>
              <button type="button" onClick={() => void shareAsk()} style={{ padding: '6px 12px', borderRadius: 999, border: `0.5px solid ${T.rule}`, background: 'transparent', color: T.inkMuted, fontSize: 12, cursor: 'pointer', fontFamily: T.text, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <Share2 size={12} /> Share
              </button>
              <button type="button" onClick={() => void deleteAsk()} disabled={deleting} style={{ padding: '6px 12px', borderRadius: 999, border: '0.5px solid rgba(216,68,43,0.28)', background: 'transparent', color: T.signal, fontSize: 12, cursor: 'pointer', fontFamily: T.text, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                <Trash2 size={12} /> {deleting ? 'Deleting…' : 'Delete'}
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
                flex: 1, resize: 'none', minHeight: 52, maxHeight: 120,
                padding: '12px 14px', borderRadius: 14,
                border: `1px solid ${T.rule}`,
                background: T.paperSoft,
                fontSize: 14, color: T.ink, outline: 'none',
                fontFamily: T.text, lineHeight: 1.5, boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = T.ink }}
              onBlur={(e) => { e.currentTarget.style.borderColor = T.rule }}
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
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
