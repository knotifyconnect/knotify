import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Hash, Briefcase, Plus } from 'lucide-react'
import { apiGet } from '../lib/api'
import { KBtn, KAvatar } from '../lib/knotify'
import { T, DeskHeader, SectionLabel as DeskSectionLabel } from '../lib/desk'
import { AskDrawer, type Ask } from '../components/asks/AskDrawer'
import { CreateAskModal } from '../components/asks/CreateAskModal'
import { PERSONAS } from '../lib/taxonomy'

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function AudienceChip({ ask }: { ask: Ask }) {
  const type = ask.audience_type ?? 'everyone'
  let Icon = Globe
  let label = 'Everyone'
  if (type === 'interest') { Icon = Hash; label = ask.audience_value ?? 'Topic' }
  if (type === 'persona') {
    Icon = Briefcase
    label = PERSONAS.find((p) => p.value === ask.audience_value)?.label ?? 'Profession'
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: T.paperDeep, fontSize: 10.5, color: T.inkMuted, fontFamily: T.text }}>
      <Icon size={9} /> {label}
    </span>
  )
}

function AskCard({ ask, onOpen }: { ask: Ask; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer',
        padding: '14px 16px', borderRadius: 14,
        background: T.paper, border: `0.5px solid ${T.ruleSoft}`,
        display: 'flex', flexDirection: 'column', gap: 8,
        fontFamily: T.text,
        transition: 'box-shadow 0.13s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 12px rgba(0,0,0,0.06)` }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {ask.author && <KAvatar name={ask.author.full_name} src={ask.author.avatar_url} size={28} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{ask.author?.full_name ?? 'Someone'}</div>
          <div style={{ fontSize: 10.5, color: T.inkFaint }}>{timeAgo(ask.created_at)}</div>
        </div>
        <AudienceChip ask={ask} />
      </div>
      <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>{ask.content}</div>
      {(ask.reply_count ?? 0) > 0 && (
        <div style={{ fontSize: 11, color: T.inkFaint }}>
          {ask.reply_count} {ask.reply_count === 1 ? 'reply' : 'replies'}
        </div>
      )}
    </button>
  )
}

export function AsksPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState('')
  const [feedAsks, setFeedAsks] = useState<Ask[]>([])
  const [myAsks, setMyAsks] = useState<Ask[]>([])
  const [loading, setLoading] = useState(true)
  const [askOpen, setAskOpen] = useState(false)
  const [askDetail, setAskDetail] = useState<Ask | null>(null)

  useEffect(() => {
    apiGet<{ user: { id: string } }>('/api/users/me')
      .then((r) => setUserId(r.user?.id ?? ''))
      .catch(() => {})
  }, [])

  const loadFeedAsks = useCallback(() => {
    return apiGet<{ asks: Ask[] }>('/api/asks/feed?limit=60')
      .then((r) => setFeedAsks(r.asks ?? []))
      .catch(() => {})
  }, [])

  const loadMyAsks = useCallback((uid: string) => {
    if (!uid) return Promise.resolve()
    return apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${uid}`)
      .then((r) => setMyAsks(r.asks ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadFeedAsks()])
      .finally(() => setLoading(false))
  }, [loadFeedAsks])

  useEffect(() => {
    if (userId) loadMyAsks(userId)
  }, [userId, loadMyAsks])

  function refresh() {
    loadFeedAsks()
    if (userId) loadMyAsks(userId)
  }

  const myOpenAsks = myAsks.filter((a) => a.status === 'open')

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 60 }}>
      {askOpen && <CreateAskModal onClose={() => setAskOpen(false)} onCreated={refresh} />}
      {askDetail && (
        <AskDrawer
          ask={askDetail}
          currentUserId={userId || null}
          onClose={() => setAskDetail(null)}
          onChanged={refresh}
        />
      )}

      <DeskHeader
        kicker="Asks · your knot"
        title={<span style={{ fontStyle: 'italic' }}>What does your network need?</span>}
        right={
          <>
            <KBtn variant="ghost" size="sm" onClick={() => navigate('/home')}>← Home</KBtn>
            <KBtn variant="signal" size="sm" onClick={() => setAskOpen(true)}>
              <Plus size={13} style={{ marginRight: 4 }} /> Ask your knot
            </KBtn>
          </>
        }
      />

      {/* My open asks */}
      {myOpenAsks.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <DeskSectionLabel>Your open asks</DeskSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myOpenAsks.map((a) => (
              <AskCard key={a.id} ask={{ ...a, author: a.author ?? undefined }} onOpen={() => setAskDetail(a)} />
            ))}
          </div>
        </div>
      )}

      {/* Feed: targeted asks for this user */}
      <div>
        <DeskSectionLabel right={
          feedAsks.length > 0
            ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11, color: T.inkFaint }}>{feedAsks.length} matched</span>
            : undefined
        }>
          Asks for you
        </DeskSectionLabel>

        {loading ? (
          <div style={{ fontSize: 13, color: T.inkFaint, fontStyle: 'italic', fontFamily: T.display, padding: '20px 0' }}>
            Loading…
          </div>
        ) : feedAsks.length === 0 ? (
          <div style={{ padding: '32px 24px', borderRadius: 16, background: T.paperSoft, border: `0.5px solid ${T.rule}`, textAlign: 'center' }}>
            <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 18, color: T.ink, margin: '0 0 8px' }}>
              No targeted asks yet.
            </p>
            <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 auto 20px', maxWidth: 380, lineHeight: 1.55, fontFamily: T.text }}>
              Asks filtered to your interests and profession will show here. You can also post one and see who responds.
            </p>
            <KBtn variant="signal" size="sm" onClick={() => setAskOpen(true)}>Post an ask</KBtn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feedAsks.map((a) => (
              <AskCard key={a.id} ask={a} onOpen={() => setAskDetail(a)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
