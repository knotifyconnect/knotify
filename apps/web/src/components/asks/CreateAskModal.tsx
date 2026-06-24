import { useState } from 'react'
import { Globe, Hash, Briefcase } from 'lucide-react'
import { apiPost } from '../../lib/api'
import { KBtn } from '../../lib/knotify'
import { T } from '../../lib/desk'
import { INTERESTS, PERSONAS } from '../../lib/taxonomy'

type AudienceType = 'everyone' | 'interest' | 'persona'

export function CreateAskModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [text, setText] = useState('')
  const [audienceType, setAudienceType] = useState<AudienceType>('everyone')
  const [audienceValue, setAudienceValue] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const needsValue = audienceType !== 'everyone'
  const canPost = text.trim().length > 0 && (!needsValue || !!audienceValue)

  function pickType(t: AudienceType) {
    setAudienceType(t)
    setAudienceValue(null)
  }

  async function post() {
    if (!canPost) { setError(needsValue ? 'Pick who this is for.' : 'Write your ask.'); return }
    setBusy(true)
    setError('')
    try {
      await apiPost('/api/asks', {
        content: text.trim(),
        audienceType,
        audienceValue: needsValue ? audienceValue : null,
      })
      onCreated?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post')
    } finally {
      setBusy(false)
    }
  }

  const audienceHint =
    audienceType === 'everyone'
      ? 'Everyone in the community will see this.'
      : audienceType === 'interest'
        ? audienceValue ? `Only people interested in ${audienceValue} get notified.` : 'Pick a topic — only people into it get notified.'
        : audienceValue ? `Only ${PERSONAS.find(p => p.value === audienceValue)?.label ?? audienceValue}s get notified.` : 'Pick a profession — only they get notified.'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,24,21,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', background: T.paper, borderRadius: 18, padding: 22, fontFamily: T.text }}>
        <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 21, color: T.ink, marginBottom: 4 }}>Ask for help</div>
        <div style={{ fontSize: 13, color: T.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
          Need a hand, an intro, a recommendation? Aim it at the right people and only they get notified.
        </div>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          placeholder="e.g. Looking for a flat in Schwabing, anyone subletting? Or: who knows someone at Celonis?"
          rows={3}
          style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: `0.5px solid ${T.rule}`, background: T.paperSoft, fontSize: 14, color: T.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: T.text, lineHeight: 1.5 }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: T.inkFaint, marginTop: 4 }}>{text.length}/280</div>

        {/* Audience type */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkFaint, margin: '10px 0 8px' }}>
          Who should see it?
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: needsValue ? 12 : 6 }}>
          {([
            { v: 'everyone' as const, label: 'Everyone', icon: Globe },
            { v: 'interest' as const, label: 'By topic', icon: Hash },
            { v: 'persona' as const, label: 'By profession', icon: Briefcase },
          ]).map(({ v, label, icon: Icon }) => {
            const active = audienceType === v
            return (
              <button key={v} type="button" onClick={() => pickType(v)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px',
                borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${active ? T.signal : T.rule}`,
                background: active ? T.signalSoft : 'transparent',
                color: active ? T.signal : T.inkMuted,
              }}>
                <Icon size={16} />
                <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 500 }}>{label}</span>
              </button>
            )
          })}
        </div>

        {/* Audience value picker */}
        {audienceType === 'interest' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {INTERESTS.map((it) => {
              const active = audienceValue === it
              return (
                <button key={it} type="button" onClick={() => setAudienceValue(it)} style={{
                  padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${active ? T.signal : T.rule}`,
                  background: active ? T.signal : 'transparent',
                  color: active ? '#fff' : T.inkMuted, fontFamily: T.text,
                }}>{it}</button>
              )
            })}
          </div>
        )}
        {audienceType === 'persona' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {PERSONAS.map((p) => {
              const active = audienceValue === p.value
              return (
                <button key={p.value} type="button" onClick={() => setAudienceValue(p.value)} style={{
                  padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${active ? T.signal : T.rule}`,
                  background: active ? T.signal : 'transparent',
                  color: active ? '#fff' : T.inkMuted, fontFamily: T.text,
                }}>{p.label}</button>
              )
            })}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: T.inkFaint, marginBottom: 14 }}>{audienceHint}</div>

        {error && <div style={{ fontSize: 12.5, color: T.signal, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <KBtn variant="ghost" size="sm" onClick={onClose}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={post} disabled={busy || !canPost}>{busy ? 'Posting…' : 'Post ask'}</KBtn>
        </div>
      </div>
    </div>
  )
}
