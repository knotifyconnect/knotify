import { useCallback, useEffect, useState } from 'react'
import { Globe, Hash, Briefcase, MessageSquare, Plus } from 'lucide-react'
import { apiGet, apiPost } from '../lib/api'
import { KAvatar, KBtn } from '../lib/knotify'
import { T, DeskHeader } from '../lib/desk'
import { useSeo } from '../lib/seo'
import { PERSONAS } from '../lib/taxonomy'
import { CreateAskModal } from '../components/asks/CreateAskModal'
import { AskDrawer, type Ask } from '../components/asks/AskDrawer'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function AudienceTag({ ask }: { ask: Ask }) {
  const type = ask.audience_type ?? 'everyone'
  const Icon = type === 'everyone' ? Globe : type === 'interest' ? Hash : Briefcase
  const label = type === 'everyone' ? 'Everyone'
    : type === 'interest' ? (ask.audience_value ?? 'Topic')
    : (PERSONAS.find((p) => p.value === ask.audience_value)?.label ?? 'Profession')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: T.paperDeep, fontSize: 10.5, color: T.inkMuted }}>
      <Icon size={10} /> {label}
    </span>
  )
}

export function AsksPage() {
  useSeo({ title: 'Asks · knotify', description: 'Help requests from your Munich network.', path: '/asks', noindex: true })

  const [tab, setTab] = useState<'foryou' | 'mine'>('foryou')
  const [meId, setMeId] = useState<string | null>(null)
  const [feed, setFeed] = useState<Ask[]>([])
  const [mine, setMine] = useState<Ask[]>([])
  const [loading, setLoading] = useState(true)
  const [openAsk, setOpenAsk] = useState<Ask | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadFeed = useCallback(() => {
    return apiGet<{ asks: Ask[] }>('/api/asks/feed?limit=50').then((r) => setFeed(r.asks ?? [])).catch(() => {})
  }, [])

  const loadMine = useCallback((uid: string) => {
    return apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${uid}`).then((r) => setMine(r.asks ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    apiGet<{ user: { id: string } }>('/api/users/me')
      .then(async (r) => {
        if (!active) return
        const uid = r.user?.id ?? null
        setMeId(uid)
        await Promise.all([loadFeed(), uid ? loadMine(uid) : Promise.resolve()])
      })
      .finally(() => active && setLoading(false))
    // Mark the feed seen so the nav badge clears.
    apiPost('/api/asks/seen', {}).catch(() => {})
    return () => { active = false }
  }, [loadFeed, loadMine])

  function refresh() {
    void loadFeed()
    if (meId) void loadMine(meId)
  }

  const list = tab === 'foryou' ? feed : mine

  return (
    <div style={{ paddingBottom: 80 }}>
      {createOpen && <CreateAskModal onClose={() => setCreateOpen(false)} onCreated={refresh} />}
      {openAsk && <AskDrawer ask={openAsk} currentUserId={meId} onClose={() => setOpenAsk(null)} onChanged={refresh} />}

      <DeskHeader
        kicker="Asks"
        title={<span style={{ fontStyle: 'italic' }}>Help requests</span>}
        right={<KBtn variant="signal" size="sm" onClick={() => setCreateOpen(true)}>Ask for help</KBtn>}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '4px 0 18px' }}>
        {([['foryou', 'For you'], ['mine', 'Your asks']] as const).map(([v, label]) => {
          const active = tab === v
          return (
            <button key={v} onClick={() => setTab(v)} style={{
              padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 500,
              border: `0.5px solid ${active ? T.signal : T.rule}`, background: active ? T.signal : 'transparent',
              color: active ? '#fff' : T.inkMuted, fontFamily: T.text,
            }}>{label}</button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: T.inkFaint, fontSize: 13 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', borderRadius: 16, background: T.paperSoft, border: `0.5px solid ${T.rule}` }}>
          <p style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 20, color: T.ink, margin: '0 0 8px' }}>
            {tab === 'foryou' ? 'No asks for you yet.' : "You haven't asked anything yet."}
          </p>
          <p style={{ fontSize: 13.5, color: T.inkMuted, margin: '0 auto 18px', maxWidth: 360, lineHeight: 1.5 }}>
            {tab === 'foryou'
              ? 'When someone asks for help that matches your interests or profession, it shows up here.'
              : 'Ask your network for an intro, a recommendation, or a hand.'}
          </p>
          <KBtn variant="signal" size="sm" onClick={() => setCreateOpen(true)}>Ask for help</KBtn>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680 }}>
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenAsk(a)}
              style={{
                textAlign: 'left', cursor: 'pointer', width: '100%',
                padding: 16, borderRadius: 14, background: T.paper, border: `0.5px solid ${T.rule}`,
                opacity: a.status === 'resolved' ? 0.6 : 1, fontFamily: T.text,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {tab === 'foryou' && a.author && <KAvatar name={a.author.full_name} src={a.author.avatar_url} size={26} />}
                {tab === 'foryou' && <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{a.author?.full_name ?? 'Someone'}</span>}
                <AudienceTag ask={a} />
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: T.inkFaint }}>{timeAgo(a.created_at)}</span>
              </div>
              <div style={{ fontSize: 14.5, color: T.ink, lineHeight: 1.5 }}>{a.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: T.inkMuted }}>
                <MessageSquare size={13} />
                {a.reply_count ? `${a.reply_count} ${a.reply_count === 1 ? 'reply' : 'replies'}` : (tab === 'foryou' ? 'Reply' : 'No replies yet')}
                {a.status === 'resolved' && <span style={{ marginLeft: 8, color: T.verd, fontWeight: 600 }}>● Resolved</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Mobile floating compose */}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        aria-label="Ask for help"
        className="md:hidden"
        style={{
          position: 'fixed', right: 18, bottom: 'max(88px, calc(76px + env(safe-area-inset-bottom)))',
          width: 52, height: 52, borderRadius: 999, border: 'none', background: T.signal, color: '#fff',
          boxShadow: '0 10px 28px rgba(216,68,43,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55,
        }}
      >
        <Plus size={24} />
      </button>
    </div>
  )
}
