import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '@/lib/api'
import { QuestIcon } from '@/lib/questIcons'

type QuestsResp = {
  credibility_score: number
  tier: string
  quests: Array<{ key: string; title: string; icon: string; points: number; status: string }>
}
type EventItem = { id: string; title: string; starts_at: string; location: string | null; rsvp_count: number }
type GigItem = { id: string; title: string; provider_name: string; reward_type: 'coffee' | 'paid' | 'free'; price_eur: number | null }

function whenLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today · ${time}`
  if (tomorrow) return `Tomorrow · ${time}`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ` · ${time}`
}

function rewardLabel(g: GigItem) {
  if (g.reward_type === 'coffee') return 'For a coffee'
  if (g.reward_type === 'paid') return g.price_eur ? `€${g.price_eur}` : 'Paid'
  return 'Free'
}

const card: React.CSSProperties = {
  background: 'white',
  border: '0.5px solid var(--rule)',
  borderRadius: 16,
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 240,
  flex: '1 1 240px',
}
const cardHead: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12,
}
const cardTitle: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif", fontSize: 17, fontWeight: 500, letterSpacing: '-0.02em',
}
const viewAll: React.CSSProperties = {
  fontSize: 12, color: 'var(--signal)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
}
const emptyTxt: React.CSSProperties = { fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }

export function HomeHub() {
  const navigate = useNavigate()
  const [quests, setQuests] = useState<QuestsResp | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [gigs, setGigs] = useState<GigItem[]>([])

  useEffect(() => {
    apiGet<QuestsResp>('/api/quests').then(setQuests).catch(() => {})
    apiGet<{ events: EventItem[] }>('/api/events?limit=3').then(r => setEvents(r.events)).catch(() => {})
    apiGet<{ gigs: GigItem[] }>('/api/gigs?limit=3').then(r => setGigs(r.gigs)).catch(() => {})
  }, [])

  const nextQuest = quests?.quests.find(q => q.status === 'claimable')

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
      {/* Quests */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Your quests</span>
          <span style={viewAll} onClick={() => navigate('/quests')}>Open →</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, lineHeight: 1 }}>{quests?.credibility_score ?? 0}</span>
          <span style={{ fontSize: 13, color: 'var(--signal)', fontWeight: 600 }}>{quests?.tier ?? 'Newcomer'}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>credibility</span>
        </div>
        {nextQuest ? (
          <button
            onClick={() => navigate('/quests')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              background: 'var(--paper-soft, #ede8df)', border: 'none', borderRadius: 12,
              padding: '10px 12px', cursor: 'pointer', width: '100%',
            }}
          >
            <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, color: 'var(--ink-muted)' }}>
              <QuestIcon name={nextQuest.icon} size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{nextQuest.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Next quest</span>
            </span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 15, color: 'var(--signal)' }}>+{nextQuest.points}</span>
          </button>
        ) : (
          <span style={emptyTxt}>All caught up, nice work. New quests coming soon.</span>
        )}
      </div>

      {/* Events */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Upcoming events</span>
          <span style={viewAll} onClick={() => navigate('/events')}>View all →</span>
        </div>
        {events.length === 0 ? (
          <span style={emptyTxt}>
            No events yet.{' '}
            <span style={{ color: 'var(--signal)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/events')}>Host one →</span>
          </span>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {events.slice(0, 2).map(e => (
              <button key={e.id} onClick={() => navigate('/events')} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{e.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                  {whenLabel(e.starts_at)}{e.location ? ` · ${e.location}` : ''} · {e.rsvp_count} going
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gigs */}
      <div style={card}>
        <div style={cardHead}>
          <span style={cardTitle}>Gigs</span>
          <span style={viewAll} onClick={() => navigate('/gigs')}>View all →</span>
        </div>
        {gigs.length === 0 ? (
          <span style={emptyTxt}>
            No open gigs yet. Earn credibility to offer CV reviews, referrals and more.
          </span>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {gigs.slice(0, 2).map(g => (
              <button key={g.id} onClick={() => navigate('/gigs')} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{g.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                  {g.provider_name} · {rewardLabel(g)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
