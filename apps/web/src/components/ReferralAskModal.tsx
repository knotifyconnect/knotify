/**
 * ReferralAskModal — lightweight "ask a connection for a referral" flow.
 * Does NOT require a job to be listed in Knotify.
 * Sends a pre-formatted message to the connection via the conversations API.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { apiPost } from '../lib/api'
import { KAvatar, KBtn } from '../lib/knotify'

type Peer = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline?: string | null
  current_company?: string | null
}

type Props = {
  peer: Peer
  onClose: () => void
}

export function ReferralAskModal({ peer, onClose }: Props) {
  const navigate = useNavigate()
  const [company, setCompany] = useState(peer.current_company ?? '')
  const [role, setRole] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!company.trim() || !role.trim()) return
    setSending(true)
    setError(null)

    const message = [
      `Hey ${peer.full_name.split(' ')[0]}, hope you're doing well!`,
      `I came across a ${role.trim()} role at ${company.trim()} and you came to mind immediately.`,
      note.trim() ? note.trim() : null,
      `Would you be open to referring me, or pointing me in the right direction? Happy to share my CV and more context. Thanks so much!`,
    ].filter(Boolean).join('\n\n')

    try {
      const conv = await apiPost<{ conversation: { id: string } }>('/api/conversations', { peerId: peer.id })
      await apiPost('/api/conversations/' + conv.conversation.id + '/messages', { content: message })
      navigate(`/messages?conversation=${conv.conversation.id}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
      setSending(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(26,24,21,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--paper)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 24px 64px rgba(26,24,21,0.18)',
          border: '0.5px solid var(--rule)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 400, color: 'var(--ink)' }}>
            Ask for a referral
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Who */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
          <KAvatar name={peer.full_name} src={peer.avatar_url} size={36} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>{peer.full_name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans'" }}>
              {peer.headline ?? peer.current_company ?? `@${peer.username}`}
            </div>
          </div>
        </div>

        {/* Company */}
        <div>
          <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans'" }}>
            Company *
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Stripe, Google, Personio"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 14, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", outline: 'none' }}
          />
        </div>

        {/* Role */}
        <div>
          <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans'" }}>
            Role *
          </label>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Senior Product Manager"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 14, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", outline: 'none' }}
          />
        </div>

        {/* Personal note */}
        <div>
          <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6, fontFamily: "'IBM Plex Sans'" }}>
            Add a personal note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 400))}
            placeholder="Why this role, why now — anything that gives context."
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 13.5, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'", resize: 'vertical', outline: 'none' }}
          />
        </div>

        {/* Preview */}
        {company.trim() && role.trim() && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)', fontSize: 12.5, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {[
              `Hey ${peer.full_name.split(' ')[0]}, hope you're doing well!`,
              `I came across a ${role.trim()} role at ${company.trim()} and you came to mind immediately.`,
              note.trim() || null,
              `Would you be open to referring me, or pointing me in the right direction? Happy to share my CV and more context. Thanks so much!`,
            ].filter(Boolean).join('\n\n')}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12.5, color: 'var(--signal)', fontFamily: "'IBM Plex Sans'" }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <KBtn variant="ghost" size="sm" onClick={onClose} disabled={sending}>Cancel</KBtn>
          <KBtn
            variant="signal"
            size="sm"
            onClick={send}
            disabled={sending || !company.trim() || !role.trim()}
          >
            {sending ? 'Sending…' : 'Send referral ask'}
          </KBtn>
        </div>
      </div>
    </div>
  )
}
