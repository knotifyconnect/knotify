import { useEffect, useState, useCallback } from 'react'
import { Check } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'

type Quest = {
  key: string
  title: string
  description: string
  points: number
  category: 'profile' | 'network' | 'social' | 'explore' | 'give'
  type: 'verified' | 'self'
  icon: string
  progress?: number
  target?: number
  status: 'completed' | 'claimable' | 'locked'
}

type QuestsResponse = {
  credibility_score: number
  tier: string
  next_tier: { name: string; at: number } | null
  gig_unlocked: boolean
  gig_unlock_at: number
  quests: Quest[]
}

const CATEGORY_LABEL: Record<Quest['category'], string> = {
  profile: 'Profile',
  network: 'Network',
  social: 'Social',
  explore: 'Explore',
  give: 'Give back',
}

export function QuestsPage() {
  const [data, setData] = useState<QuestsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await apiGet<QuestsResponse>('/api/quests'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function claim(key: string) {
    const quest = data?.quests.find(q => q.key === key)
    if (quest?.type === 'self') {
      const ok = window.confirm('On your honour, did you really do this? Credibility on knotify is built on trust.')
      if (!ok) return
    }
    setClaiming(key)
    setError(null)
    try {
      await apiPost(`/api/quests/${key}/claim`, {})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim quest')
    } finally {
      setClaiming(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 48, color: 'var(--ink-muted)' }}>Loading quests…</div>
  }
  if (!data) {
    return <div style={{ padding: 48, color: 'var(--signal)' }}>{error ?? 'Something went wrong.'}</div>
  }

  const score = data.credibility_score
  const next = data.next_tier
  const tierFloor = next ? prevTierFloor(score, next.at) : score
  const pctToNext = next ? Math.min(100, Math.round(((score - tierFloor) / (next.at - tierFloor)) * 100)) : 100

  const claimable = data.quests.filter(q => q.status === 'claimable').length

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)', fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--ink)' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Side quests</div>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 'clamp(30px, 4vw, 40px)', fontWeight: 400, letterSpacing: '-0.03em', margin: '6px 0 4px' }}>
          Build your credibility.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 14.5, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
          Complete quests to earn credibility. Higher credibility unlocks the ability to offer CV reviews, referrals and other gigs to the community.
        </p>
      </div>

      {/* Credibility card */}
      <div style={{ background: 'var(--ink)', color: 'var(--paper)', borderRadius: 20, padding: 'clamp(20px, 3vw, 28px)', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.6)' }}>Credibility</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 54, lineHeight: 1 }}>{score}</span>
              <span style={{ fontSize: 15, color: 'var(--signal)', fontWeight: 600 }}>{data.tier}</span>
            </div>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
            background: data.gig_unlocked ? 'rgba(45,125,70,0.25)' : 'rgba(245,240,232,0.12)',
            color: data.gig_unlocked ? '#7fd6a0' : 'rgba(245,240,232,0.7)',
          }}>
            {data.gig_unlocked ? '✓ Gigs unlocked' : `Gigs unlock at ${data.gig_unlock_at}`}
          </div>
        </div>

        {/* progress to next tier */}
        <div style={{ marginTop: 20 }}>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(245,240,232,0.14)' }}>
            <div style={{ width: `${pctToNext}%`, height: '100%', borderRadius: 999, background: 'var(--signal)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'rgba(245,240,232,0.7)' }}>
            {next ? `${next.at - score} points to ${next.name}` : 'Top tier reached, you are a Pillar of the community.'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, border: '0.5px solid rgba(216,68,43,0.3)', background: 'rgba(216,68,43,0.07)', color: 'var(--signal)', borderRadius: 12, padding: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {claimable > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13.5, color: 'var(--verd, #1f6b5e)', fontWeight: 600 }}>
          {claimable} quest{claimable === 1 ? '' : 's'} ready to claim
        </div>
      )}

      {/* Quest list */}
      <div style={{ display: 'grid', gap: 12 }}>
        {data.quests.map(q => (
          <div
            key={q.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'white', border: `0.5px solid ${q.status === 'claimable' ? 'var(--signal)' : 'var(--rule)'}`,
              borderRadius: 14, padding: '16px 18px',
              opacity: q.status === 'locked' ? 0.82 : 1,
            }}
          >
            {/* status dot */}
            <div style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: q.status === 'completed' ? 'var(--verd-soft, rgba(31,107,94,0.12))' : 'var(--paper-soft, #ede8df)',
              color: q.status === 'completed' ? 'var(--verd, #1f6b5e)' : 'var(--ink-muted)',
            }}>
              {q.status === 'completed' ? <Check size={18} /> : <QuestIcon name={q.icon} size={18} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{q.title}</span>
                <span style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{CATEGORY_LABEL[q.category]}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>{q.description}</div>
              {typeof q.progress === 'number' && typeof q.target === 'number' && q.status !== 'completed' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 999, background: 'var(--rule-soft, rgba(84,72,58,0.12))' }}>
                    <div style={{ width: `${(q.progress / q.target) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--signal)' }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{q.progress}/{q.target}</span>
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: 'var(--signal)' }}>+{q.points}</div>
              {q.status === 'claimable' && (
                <button
                  onClick={() => claim(q.key)}
                  disabled={claiming === q.key}
                  style={{
                    marginTop: 4, padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: 'var(--signal)', color: '#fff', fontSize: 12.5, fontWeight: 600,
                    cursor: claiming === q.key ? 'wait' : 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  {claiming === q.key ? '…' : q.type === 'self' ? 'Mark done' : 'Claim'}
                </button>
              )}
              {q.status === 'completed' && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--verd, #1f6b5e)', fontWeight: 600 }}>Done</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Derive the floor of the current tier given the next tier threshold (for progress bar).
function prevTierFloor(score: number, nextAt: number): number {
  const floors = [0, 30, 70, 120]
  let floor = 0
  for (const f of floors) if (f <= score && f < nextAt) floor = f
  return floor
}
