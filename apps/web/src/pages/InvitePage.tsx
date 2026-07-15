import { useEffect, useState } from 'react'
import { Check, Copy, Link, Mail, ShieldCheck, Users } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'
import { KAvatar } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'

type InvitedUser = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  joined_at: string
  onboarded: boolean
  verified: boolean
}

type PendingInvite = { email: string; sent_at: string }

type InviteResponse = {
  code: string
  url: string
  invited: InvitedUser[]
  pending: PendingInvite[]
  stats: { total: number; onboarded: number; verified: number; verifiedOnboarded: number; pending: number }
}

export function InvitePage() {
  useSeo({
    title: 'Invite friends · knotify',
    description: 'Grow your network in Munich. Invite friends and earn credibility together.',
    path: '/invite',
    noindex: true,
  })

  const [data, setData] = useState<InviteResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Invite-by-email (verified path)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  function load() {
    return apiGet<InviteResponse>('/api/invites/me')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function sendEmailInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setSending(true)
    setSendMsg(null)
    try {
      await apiPost('/api/invites/email', { email })
      setSendMsg({ tone: 'ok', text: `Invite sent to ${email}.` })
      setInviteEmail('')
      void load()
    } catch (err) {
      setSendMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not send invite' })
    } finally {
      setSending(false)
    }
  }

  async function copyLink() {
    if (!data?.url) return
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div style={{ color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
          Loading...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div style={{ color: 'var(--signal)', fontSize: 14 }}>{error ?? 'Something went wrong'}</div>
      </div>
    )
  }

  const milestones = [
    { label: 'Open the door', target: 1, points: 15 },
    { label: 'Bring the crew', target: 3, points: 30 },
    { label: 'Super-connector', target: 10, points: 60 },
  ]

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(26px, 3.2vw, 34px)', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 6 }}>
          Invite your network
        </h1>
        <p style={{ color: 'var(--ink-faint)', fontSize: 14, lineHeight: 1.5 }}>
          Munich is more useful when your real circle is here. Invite a friend by email to vouch for them personally — verified invites are what earn you credibility.
        </p>
      </div>

      {/* Invite by email — the verified path */}
      <div
        style={{
          background: 'var(--paper-soft)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          padding: '20px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShieldCheck size={15} style={{ color: 'var(--signal)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Invite a friend by email</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '0 0 14px' }}>
          They get a personal invite tied to their email. Verified joins count toward your credibility milestones.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); void sendEmailInvite() }}
          style={{ display: 'flex', gap: 8 }}
        >
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8, padding: '0 12px' }}>
            <Mail size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@email.com"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--ink)', padding: '10px 0', fontFamily: 'inherit' }}
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            style={{
              flexShrink: 0, background: 'var(--signal)', color: 'var(--paper)', border: 'none',
              borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 600,
              cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {sendMsg && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: sendMsg.tone === 'ok' ? 'var(--signal)' : '#c0392b' }}>
            {sendMsg.text}
          </div>
        )}
      </div>

      {/* Invite link card */}
      <div
        style={{
          background: 'var(--paper-soft)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          padding: '20px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Link size={14} style={{ color: 'var(--ink-faint)' }} />
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Shareable link — for groups & socials
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <span
            style={{
              flex: 1,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              color: 'var(--ink)',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {data.url}
          </span>
          <button
            onClick={copyLink}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: copied ? 'var(--signal)' : 'var(--ink)',
              color: 'var(--paper)',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-faint)' }}>
          Anyone who joins through your link gets a +10 welcome bonus. Link joins build your reach, but only verified email invites count toward your milestones.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="Verified joins (onboarded)" value={data.stats.verifiedOnboarded} />
        <StatCard label="Total reach" value={data.stats.total} />
      </div>

      {/* Milestones */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Milestones
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {milestones.map((m) => {
            const done = data.stats.verifiedOnboarded >= m.target
            const progress = Math.min(data.stats.verifiedOnboarded, m.target)
            return (
              <MilestoneRow
                key={m.target}
                label={m.label}
                target={m.target}
                progress={progress}
                points={m.points}
                done={done}
              />
            )
          })}
        </div>
      </div>

      {/* Pending verified invites */}
      {data.pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Invites awaiting acceptance
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pending.map((p) => (
              <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--paper-soft)', border: '1px dashed var(--rule)', borderRadius: 10 }}>
                <Mail size={15} style={{ color: 'var(--ink-faint)' }} />
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)' }}>{p.email}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)' }}>Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invited list */}
      {data.invited.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            People you brought in
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.invited.map((u) => (
              <InvitedRow key={u.id} user={u} />
            ))}
          </div>
        </div>
      )}

      {data.invited.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 20px',
            background: 'var(--paper-soft)',
            border: '1px dashed var(--rule)',
            borderRadius: 12,
          }}
        >
          <Users size={28} style={{ color: 'var(--ink-faint)', marginBottom: 10 }} />
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, margin: 0 }}>
            No one has joined through your link yet.
          </p>
          <p style={{ color: 'var(--ink-faint)', fontSize: 13, marginTop: 4 }}>
            Share it with people who would get value from Munich's professional network.
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: 'var(--paper-soft)',
        border: '1px solid var(--rule)',
        borderRadius: 10,
        padding: '16px 18px',
      }}
    >
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function MilestoneRow({
  label,
  target,
  progress,
  points,
  done,
}: {
  label: string
  target: number
  progress: number
  points: number
  done: boolean
}) {
  const pct = Math.round((progress / target) * 100)
  return (
    <div
      style={{
        background: 'var(--paper-soft)',
        border: `1px solid ${done ? 'var(--signal)' : 'var(--rule)'}`,
        borderRadius: 10,
        padding: '14px 16px',
        opacity: done ? 0.9 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: done ? 0 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {done && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--signal)',
              }}
            >
              <Check size={10} color="white" strokeWidth={3} />
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: done ? 'var(--signal)' : 'var(--ink-faint)',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          +{points} pts
        </span>
      </div>
      {!done && (
        <>
          <div
            style={{
              height: 4,
              background: 'var(--rule)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--ink)',
                borderRadius: 2,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 5 }}>
            {progress} / {target} verified
          </div>
        </>
      )}
    </div>
  )
}

function InvitedRow({ user }: { user: InvitedUser }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--paper-soft)',
        border: '1px solid var(--rule)',
        borderRadius: 10,
      }}
    >
      <KAvatar name={user.full_name} src={user.avatar_url} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
          {user.full_name}
          {user.verified && <ShieldCheck size={13} style={{ color: 'var(--signal)', flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>@{user.username}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 20,
          background: user.onboarded ? 'rgba(var(--signal-rgb, 216,68,43), 0.1)' : 'var(--rule)',
          color: user.onboarded ? 'var(--signal)' : 'var(--ink-faint)',
          whiteSpace: 'nowrap',
        }}
      >
        {user.onboarded ? 'Onboarded' : 'Pending'}
      </span>
    </div>
  )
}
