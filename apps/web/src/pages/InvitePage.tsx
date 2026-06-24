import { useEffect, useState } from 'react'
import { Check, Copy, Link, Users } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { KAvatar } from '@/lib/knotify'
import { useSeo } from '@/lib/seo'

type InvitedUser = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  joined_at: string
  onboarded: boolean
}

type InviteResponse = {
  code: string
  url: string
  invited: InvitedUser[]
  stats: { total: number; onboarded: number }
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

  useEffect(() => {
    apiGet<InviteResponse>('/api/invites/me')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

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
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          Invite your network
        </h1>
        <p style={{ color: 'var(--ink-faint)', fontSize: 14, lineHeight: 1.5 }}>
          Munich is more useful when your real circle is here. Every friend who joins and sets up their profile earns you credibility points.
        </p>
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
            Your personal invite link
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
          Anyone who signs up through your link gets +10 credibility as a welcome bonus.
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
        <StatCard label="Joined via your link" value={data.stats.total} />
        <StatCard label="Fully onboarded" value={data.stats.onboarded} />
      </div>

      {/* Milestones */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Milestones
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {milestones.map((m) => {
            const done = data.stats.onboarded >= m.target
            const progress = Math.min(data.stats.onboarded, m.target)
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
            {progress} / {target} onboarded
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
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.full_name}
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
