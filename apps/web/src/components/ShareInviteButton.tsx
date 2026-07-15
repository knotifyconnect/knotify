import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Mail, MessageCircle, Send, Share2 } from 'lucide-react'
import { apiGetCached } from '../lib/api'
import { KBtn } from '../lib/knotify'

type InviteMeResponse = { code: string; url: string }
type MeResponse = { user: { full_name: string | null } }

// Module-level cache so every instance of the button on a page shares one fetch.
let cachedInviteUrl: string | null = null

function firstName(value?: string | null) {
  if (!value) return ''
  return value.trim().split(/\s+/)[0] ?? ''
}

function buildMessage(name: string) {
  const who = name ? `${name} here: ` : ''
  return `${who}I've been using knotify to actually meet people in Munich. Come connect:`
}

export function ShareInviteButton({
  variant = 'ghost',
  size = 'sm',
  label = 'Invite',
}: {
  variant?: 'signal' | 'ghost' | 'ink'
  size?: 'sm' | 'md'
  label?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const [url, setUrl] = useState<string | null>(cachedInviteUrl)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (url) return
    apiGetCached<InviteMeResponse>('/api/invites/me', { ttlMs: 60_000 })
      .then((d) => { cachedInviteUrl = d.url; setUrl(d.url) })
      .catch(() => {})
  }, [url])

  useEffect(() => {
    apiGetCached<MeResponse>('/api/users/me', { ttlMs: 60_000 })
      .then((d) => setName(firstName(d.user?.full_name)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if ((e.target as HTMLElement).closest('[data-share-menu]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const message = buildMessage(name)

  async function handleClick() {
    if (!url) return
    const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share && /Mobi|Android/i.test(navigator.userAgent)
    if (canNativeShare) {
      try {
        await navigator.share({ title: 'knotify', text: message, url })
      } catch {
        /* user cancelled */
      }
      return
    }
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      const left = Math.min(r.left, window.innerWidth - 260)
      setPos({ top: r.bottom + 8, left: Math.max(12, left) })
    }
    setOpen((o) => !o)
  }

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(`${message} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  function openLink(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  const encodedMessage = encodeURIComponent(message)
  const encodedUrl = encodeURIComponent(url ?? '')
  const encodedFull = encodeURIComponent(`${message} ${url ?? ''}`)

  return (
    <div ref={wrapRef} style={{ display: 'inline-block', position: 'relative' }}>
      <KBtn variant={variant} size={size} onClick={handleClick} disabled={!url}>
        <Share2 size={13} />
        {label}
      </KBtn>
      {open && pos && url && createPortal(
        <div
          data-share-menu
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 200,
            width: 236,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(0,0,0,0.14)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <ShareRow
            icon={<MessageCircle size={15} color="#25D366" />}
            label="WhatsApp"
            onClick={() => openLink(`https://wa.me/?text=${encodedFull}`)}
          />
          <ShareRow
            icon={<Send size={15} color="#229ED9" />}
            label="Telegram"
            onClick={() => openLink(`https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}`)}
          />
          <ShareRow
            icon={<Mail size={15} style={{ color: 'var(--ink-faint)' }} />}
            label="Email"
            onClick={() => openLink(`mailto:?subject=${encodeURIComponent('Join me on knotify')}&body=${encodedFull}`)}
          />
          <div style={{ height: 1, background: 'var(--rule)', margin: '4px 2px' }} />
          <ShareRow
            icon={copied ? <Check size={15} style={{ color: 'var(--signal)' }} /> : <Copy size={15} style={{ color: 'var(--ink-faint)' }} />}
            label={copied ? 'Copied!' : 'Copy link'}
            onClick={copyLink}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

function ShareRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 10px',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--ink)',
        textAlign: 'left',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-soft)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}
