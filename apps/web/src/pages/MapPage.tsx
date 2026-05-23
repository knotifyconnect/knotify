import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { KAvatar, KBtn, KCard, KPill, VerifiedBadge } from '../lib/knotify'

type MapNode = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  is_online: boolean
  referral_score: number
  current_company: string | null
}

type PanelSkill = { id: string; name: string; is_verified: boolean }

type PanelEdu = {
  id: string
  institution: string
  degree: string | null
  field: string | null
  start_year: number | null
  end_year: number | null
  description: string | null
}

type PanelExp = {
  id: string
  company: string
  role: string
  start_date: string | null
  end_date: string | null
  description: string | null
}

type PanelPost = {
  id: string
  title: string | null
  body: string
  image_url: string | null
  created_at: string
  upvote_count: number
  comment_count: number
  channel: { slug: string; name: string } | null
}

type PanelData = {
  user: {
    id: string
    full_name: string
    username: string
    avatar_url: string | null
    bio: string | null
    headline: string | null
    status: string
    university: string | null
    current_company: string | null
    referral_score: number
    linkedin_url: string | null
    website_url: string | null
    github_url: string | null
    languages: string[] | null
  }
  skills: PanelSkill[]
  education: PanelEdu[]
  experience: PanelExp[]
  recentPosts: PanelPost[]
  latestPost: PanelPost | null
  latestUpdate: { id: string; content: string; created_at: string } | null
  submittedReferralCount: number
}

type AskReactionMap = Record<string, { count: number; mine: boolean }>

type Ask = {
  id: string
  user_id: string
  content: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  created_at: string
  reactions: AskReactionMap
  reply_count: number
}

type AskReply = {
  id: string
  ask_id: string
  user_id: string
  body: string
  created_at: string
  author: { id: string; full_name: string; username: string; avatar_url: string | null } | null
}

const ASK_EMOJIS = ['❤️', '👍', '🙌', '💡', '🔥', '🤝'] as const

type GraphNode = MapNode & {
  x: number
  y: number
  vx: number
  vy: number
  degree: 1 | 2
  imgEl?: HTMLImageElement
}

// ─── Canvas graph ─────────────────────────────────────────────────────────────
function NetworkGraph({
  nodes,
  selected,
  onSelectNode,
  onSelectSelf,
}: {
  nodes: GraphNode[]
  selected: GraphNode | null
  onSelectNode: (n: GraphNode) => void
  onSelectSelf?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>(nodes)

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Use CSS pixel dimensions — the context is already scaled by DPR in ResizeObserver
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight

    ctx.clearRect(0, 0, W, H)

    const ns = nodesRef.current
    const first = ns.filter((n) => n.degree === 1)
    const second = ns.filter((n) => n.degree === 2)

    // Simulated center "me" node
    const cx = W / 2
    const cy = H / 2

    // Draw edges: center → first degree
    for (const n of first) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(n.x, n.y)
      ctx.strokeStyle = selected?.id === n.id ? 'rgba(216,68,43,0.45)' : 'rgba(84,72,58,0.15)'
      ctx.lineWidth = selected?.id === n.id ? 1.5 : 0.8
      ctx.stroke()
    }

    // Draw edges: first → second degree (random pairings)
    for (let i = 0; i < second.length; i++) {
      const s = second[i]
      const parent = first[i % Math.max(first.length, 1)]
      if (!parent) continue
      ctx.beginPath()
      ctx.moveTo(parent.x, parent.y)
      ctx.lineTo(s.x, s.y)
      ctx.strokeStyle = 'rgba(84,72,58,0.08)'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // Draw second degree nodes (small dots)
    for (const n of second) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(244,239,230,0.9)'
      ctx.strokeStyle = 'rgba(84,72,58,0.2)'
      ctx.lineWidth = 0.8
      ctx.fill()
      ctx.stroke()

      // Initials inside the dot
      ctx.fillStyle = 'rgba(84,72,58,0.7)'
      ctx.font = 'bold 8px "IBM Plex Sans"'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(n.full_name.charAt(0).toUpperCase(), n.x, n.y)

      // First-name caption beneath the dot
      const firstName = n.full_name.split(' ')[0] ?? ''
      if (firstName) {
        ctx.fillStyle = 'rgba(84,72,58,0.55)'
        ctx.font = '9px "IBM Plex Sans"'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(firstName.length > 10 ? firstName.slice(0, 9) + '…' : firstName, n.x, n.y + 12)
      }
    }

    // Draw first degree nodes (avatar circles)
    for (const n of first) {
      const r = n.degree === 1 ? 22 : 14
      const isSelected = selected?.id === n.id

      ctx.save()
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.clip()

      if (n.imgEl?.complete && n.imgEl.naturalWidth > 0) {
        ctx.drawImage(n.imgEl, n.x - r, n.y - r, r * 2, r * 2)
      } else {
        // Fallback: colored initial circle
        const colors = ['#E8E0D5','#F5E6D3','#E0EAE8','#F0E8F0','#FAECD8','#F5E8E6','#E6EBF5','#E8F0E8']
        let h = 0
        for (let i = 0; i < n.full_name.length; i++) h = (h * 31 + n.full_name.charCodeAt(i)) >>> 0
        ctx.fillStyle = colors[h % colors.length]
        ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2)
        ctx.restore()
        ctx.save()
        ctx.fillStyle = '#5C4A36'
        ctx.font = `bold ${r * 0.7}px "Fraunces"`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(n.full_name.charAt(0).toUpperCase(), n.x, n.y)
      }

      ctx.restore()

      // Border ring
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected ? '#D8442B' : n.is_online ? '#1F6B5E' : 'rgba(84,72,58,0.22)'
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      ctx.stroke()

      // Glow when selected
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(216,68,43,0.18)'
        ctx.lineWidth = 5
        ctx.stroke()
      }

      // Online dot
      if (n.is_online) {
        ctx.beginPath()
        ctx.arc(n.x + r * 0.7, n.y + r * 0.7, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#1F6B5E'
        ctx.fill()
        ctx.strokeStyle = 'var(--paper)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Name label below the node
      const labelText = n.full_name.length > 22 ? n.full_name.slice(0, 20) + '…' : n.full_name
      ctx.font = `${isSelected ? 600 : 500} 11px "IBM Plex Sans", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      // Soft paper-tinted plate behind text for legibility on the dotted bg
      const tw = ctx.measureText(labelText).width
      const padX = 5, padY = 2
      const lx = n.x - tw / 2 - padX
      const ly = n.y + r + 6
      ctx.fillStyle = 'rgba(244,239,230,0.92)'
      ctx.beginPath()
      // Hand-rolled rounded rect (compat: roundRect not in all Safari versions)
      const rw = tw + padX * 2
      const rh = 16
      const rr = 5
      ctx.moveTo(lx + rr, ly)
      ctx.arcTo(lx + rw, ly, lx + rw, ly + rh, rr)
      ctx.arcTo(lx + rw, ly + rh, lx, ly + rh, rr)
      ctx.arcTo(lx, ly + rh, lx, ly, rr)
      ctx.arcTo(lx, ly, lx + rw, ly, rr)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = isSelected ? '#D8442B' : '#1A1815'
      ctx.fillText(labelText, n.x, ly + padY)
    }

    // Center "you" node
    const youR = 28
    ctx.beginPath()
    ctx.arc(cx, cy, youR, 0, Math.PI * 2)
    ctx.fillStyle = '#1A1815'
    ctx.fill()
    ctx.fillStyle = '#F4EFE6'
    ctx.font = `italic 500 14px "Fraunces"`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('you', cx, cy)
    // Signal accent ring
    ctx.beginPath()
    ctx.arc(cx, cy, youR + 4, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(216,68,43,0.22)'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [selected])

  // Physics tick
  useEffect(() => {
    const tick = () => {
      const ns = nodesRef.current
      const canvas = canvasRef.current
      if (!canvas) return
      // Use CSS pixel dimensions — matches DPR-scaled context
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      const cx = W / 2
      const cy = H / 2

      for (const n of ns) {
        if (n.degree === 2) continue
        // Spring: pull node toward a ring at target distance from center
        const dx = n.x - cx
        const dy = n.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Scale target ring radius to canvas size so graph fills the space nicely
        const targetRing = Math.min(W, H) * 0.22
        const diff = dist - targetRing
        n.vx -= (dx / Math.max(dist, 1)) * diff * 0.06
        n.vy -= (dy / Math.max(dist, 1)) * diff * 0.06

        // Repulsion between first-degree nodes
        for (const m of ns) {
          if (m === n || m.degree === 2) continue
          const ex = n.x - m.x
          const ey = n.y - m.y
          const ed = Math.sqrt(ex * ex + ey * ey)
          const minDist = 90
          if (ed < minDist && ed > 0) {
            n.vx += (ex / ed) * (minDist - ed) * 0.018
            n.vy += (ey / ed) * (minDist - ed) * 0.018
          }
        }

        // Damping + bounds with margin
        n.vx *= 0.82
        n.vy *= 0.82
        n.x = Math.max(40, Math.min(W - 40, n.x + n.vx))
        n.y = Math.max(40, Math.min(H - 40, n.y + n.vy))
      }

      // Update second degree positions relative to parent
      const first = ns.filter((n) => n.degree === 1)
      const second = ns.filter((n) => n.degree === 2)
      for (let i = 0; i < second.length; i++) {
        const s = second[i]
        const parent = first[i % Math.max(first.length, 1)]
        if (!parent) continue
        const angle = (i * 137.5 * Math.PI) / 180
        // Slightly larger orbit so first-name caption fits under the dot
        const target = { x: parent.x + Math.cos(angle) * 68, y: parent.y + Math.sin(angle) * 68 }
        s.x += (target.x - s.x) * 0.12
        s.y += (target.y - s.y) * 0.12
      }

      draw()
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      // Setting width/height resets context state — apply scale fresh each time
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0) // reset any prior transform
        ctx.scale(dpr, dpr)
      }
    })
    // Fire once immediately to set initial size before first tick
    const dprInit = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dprInit
    canvas.height = canvas.offsetHeight * dprInit
    const ctxInit = canvas.getContext('2d')
    if (ctxInit) { ctxInit.setTransform(1, 0, 0, 1, 0, 0); ctxInit.scale(dprInit, dprInit) }
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Click hit-test
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Check center "you" hit first
    const cx = canvas.offsetWidth / 2
    const cy = canvas.offsetHeight / 2
    if (Math.sqrt((cx - x) ** 2 + (cy - y) ** 2) < 32) {
      onSelectSelf?.()
      return
    }

    const ns = nodesRef.current.filter((n) => n.degree === 1)
    for (const n of ns) {
      const dx = n.x - x
      const dy = n.y - y
      if (Math.sqrt(dx * dx + dy * dy) < 28) {
        onSelectNode(n)
        return
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'crosshair',
      }}
    />
  )
}

// ─── MapPage ──────────────────────────────────────────────────────────────────
export function MapPage() {
  const navigate = useNavigate()
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingRequests, setPendingRequests] = useState<number>(0)
  const [meId, setMeId] = useState<string | null>(null)
  const [meUser, setMeUser] = useState<{ id: string; full_name: string; username: string; avatar_url: string | null } | null>(null)
  const [asks, setAsks] = useState<Ask[]>([])
  // Map of userId → their latest open ask (for canvas bubble overlay)
  const [latestAskByUser, setLatestAskByUser] = useState<Record<string, Ask>>({})
  const [asksLoading, setAsksLoading] = useState(false)
  const [newAskText, setNewAskText] = useState('')
  const [postingAsk, setPostingAsk] = useState(false)
  const [expandedAskId, setExpandedAskId] = useState<string | null>(null)
  const [asksReplies, setAsksReplies] = useState<Record<string, AskReply[]>>({})
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  // Ask bubble popup
  const [askPopup, setAskPopup] = useState<{ ask: Ask; userName: string; avatarUrl: string | null } | null>(null)
  const [popupRepliesLoading, setPopupRepliesLoading] = useState(false)

  // Pending incoming connection requests + my id
  useEffect(() => {
    let mounted = true
    Promise.all([
      apiGet<{ user: { id: string; full_name: string; username: string; avatar_url: string | null } }>('/api/users/me'),
      apiGet<{ connections: Array<{ status: string; requester_id: string; addressee_id: string }> }>('/api/connections'),
    ]).then(([me, cx]) => {
      if (!mounted) return
      setMeId(me.user.id)
      setMeUser(me.user)
      const incoming = (cx.connections ?? []).filter((c) => c.status === 'pending' && c.addressee_id === me.user.id).length
      setPendingRequests(incoming)
    }).catch(() => { /* ignore */ })
    return () => { mounted = false }
  }, [])

  // Build a synthetic GraphNode for self so we can re-use the same panel
  function selectSelf() {
    if (!meUser) return
    const synthetic: GraphNode = {
      id: meUser.id,
      full_name: meUser.full_name,
      username: meUser.username,
      avatar_url: meUser.avatar_url,
      is_online: true,
      referral_score: 0,
      current_company: null,
      x: 0, y: 0, vx: 0, vy: 0,
      degree: 1,
    }
    setSelectedNode(synthetic)
    setPanelOpen(true)
    setPanelLoading(true)
    setPanelData(null)
    apiGet<PanelData>(`/api/users/panel/${meUser.id}`)
      .then((data) => setPanelData(data))
      .catch(() => {})
      .finally(() => setPanelLoading(false))
  }

  // Load every node's latest open ask whenever graphNodes change
  useEffect(() => {
    let cancelled = false
    const ids = graphNodes.filter((n) => n.degree === 1).map((n) => n.id)
    if (meId) ids.push(meId)
    if (ids.length === 0) { setLatestAskByUser({}); return }
    // Fetch all in parallel; populate map
    Promise.all(ids.map(async (id) => {
      try {
        const d = await apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${id}`)
        const open = (d.asks ?? []).find((a) => a.status === 'open')
        return open ? [id, open] as const : null
      } catch { return null }
    })).then((results) => {
      if (cancelled) return
      const map: Record<string, Ask> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setLatestAskByUser(map)
    })
    return () => { cancelled = true }
  }, [graphNodes, meId])

  // Load asks whenever the selected node changes
  useEffect(() => {
    const targetId = selectedNode?.id ?? (panelOpen ? null : meId)
    if (!targetId) { setAsks([]); return }
    let mounted = true
    setAsksLoading(true)
    apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${targetId}`)
      .then((d) => { if (mounted) setAsks(d.asks ?? []) })
      .catch(() => { if (mounted) setAsks([]) })
      .finally(() => { if (mounted) setAsksLoading(false) })
    return () => { mounted = false }
  }, [selectedNode?.id, meId, panelOpen])

  async function postAsk() {
    const content = newAskText.trim()
    if (!content || !meId) return
    setPostingAsk(true)
    try {
      const res = await apiPost<{ ask: Ask }>('/api/asks', { content })
      setAsks((prev) => [res.ask, ...prev])
      // Update the bubble overlay map so the new ask appears on the graph immediately
      setLatestAskByUser((prev) => ({ ...prev, [meId]: res.ask }))
      setNewAskText('')
    } catch { /* ignore */ }
    finally { setPostingAsk(false) }
  }

  async function reactToAsk(askId: string, emoji: string) {
    // Optimistic
    setAsks((prev) => prev.map((a) => {
      if (a.id !== askId) return a
      const cur = a.reactions[emoji]
      const next: AskReactionMap = { ...a.reactions }
      if (cur?.mine) {
        const nextCount = cur.count - 1
        if (nextCount <= 0) delete next[emoji]
        else next[emoji] = { count: nextCount, mine: false }
      } else {
        next[emoji] = { count: (cur?.count ?? 0) + 1, mine: true }
      }
      return { ...a, reactions: next }
    }))
    try { await apiPost(`/api/asks/${askId}/react`, { emoji }) }
    catch { /* revert by reloading */
      try {
        const targetId = selectedNode?.id ?? meId
        if (targetId) {
          const d = await apiGet<{ asks: Ask[] }>(`/api/asks/by-user/${targetId}`)
          setAsks(d.asks ?? [])
        }
      } catch { /* noop */ }
    }
  }

  async function resolveAsk(askId: string) {
    try {
      await apiPost(`/api/asks/${askId}/resolve`, {})
      setAsks((prev) => prev.map((a) => a.id === askId ? { ...a, status: 'resolved', resolved_at: new Date().toISOString() } : a))
      // Remove from canvas bubble map (resolved asks shouldn't show as bubbles)
      setLatestAskByUser((prev) => {
        const next = { ...prev }
        for (const userId of Object.keys(next)) {
          if (next[userId].id === askId) delete next[userId]
        }
        return next
      })
    } catch { /* noop */ }
  }

  async function loadReplies(askId: string) {
    if (asksReplies[askId]) { setExpandedAskId(expandedAskId === askId ? null : askId); return }
    try {
      const d = await apiGet<{ replies: AskReply[] }>(`/api/asks/${askId}/replies`)
      setAsksReplies((prev) => ({ ...prev, [askId]: d.replies ?? [] }))
      setExpandedAskId(askId)
    } catch { /* noop */ }
  }

  async function openAskPopup(ask: Ask, userName: string, avatarUrl: string | null) {
    setAskPopup({ ask, userName, avatarUrl })
    if (!asksReplies[ask.id]) {
      setPopupRepliesLoading(true)
      try {
        const d = await apiGet<{ replies: AskReply[] }>(`/api/asks/${ask.id}/replies`)
        setAsksReplies((prev) => ({ ...prev, [ask.id]: d.replies ?? [] }))
      } catch { /* noop */ } finally { setPopupRepliesLoading(false) }
    }
  }

  // Keep popup ask in sync with reactions/reply_count updates
  useEffect(() => {
    if (!askPopup) return
    const live = asks.find((a) => a.id === askPopup.ask.id) ?? latestAskByUser[askPopup.ask.user_id]
    if (live && (live !== askPopup.ask)) setAskPopup((prev) => prev ? { ...prev, ask: live } : null)
  }, [asks, latestAskByUser])

  async function postReply(askId: string) {
    const body = (replyDraft[askId] ?? '').trim()
    if (!body) return
    try {
      const res = await apiPost<{ reply: AskReply }>(`/api/asks/${askId}/replies`, { body })
      setAsksReplies((prev) => ({ ...prev, [askId]: [...(prev[askId] ?? []), res.reply] }))
      setAsks((prev) => prev.map((a) => a.id === askId ? { ...a, reply_count: a.reply_count + 1 } : a))
      if (askPopup?.ask.id === askId) setAskPopup((prev) => prev ? { ...prev, ask: { ...prev.ask, reply_count: prev.ask.reply_count + 1 } } : null)
      setReplyDraft((prev) => ({ ...prev, [askId]: '' }))
    } catch { /* noop */ }
  }

  function shareAsk(ask: Ask) {
    const url = `${window.location.origin}/profile/${ask.user_id}`
    const text = `"${ask.content}" — ${selectedNode?.full_name ?? 'on knotify'}`
    if (navigator.share) {
      void navigator.share({ title: 'Ask on knotify', text, url }).catch(() => {})
    } else {
      void navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
    }
  }

  const [mapError, setMapError] = useState<string | null>(null)
  const [mapDebug, setMapDebug] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setMapError(null)
    // Build the knot client-side from /api/connections (the SAME endpoint that
    // populates the "Your Knot · 3" badge). This bypasses /api/connections/map
    // entirely so we don't depend on its (currently broken) server-side filtering.
    Promise.all([
      apiGet<{ user: { id: string } }>('/api/users/me'),
      apiGet<{ connections: Array<{ id: string; requester_id: string; addressee_id: string; status: string; user: { id: string; full_name: string; username: string; avatar_url: string | null } | null }> }>('/api/connections'),
    ])
      .then(([meData, cxData]) => {
        if (!mounted) return
        const meId = meData.user.id
        const accepted = (cxData.connections ?? []).filter((c) => c.status === 'accepted')
        setMapDebug({
          version: 'client-side-v1',
          meId,
          totalConns: (cxData.connections ?? []).length,
          acceptedConns: accepted.length,
        })

        // Build first-degree nodes from the enriched user data already in the response
        const firstDegreeRaw: MapNode[] = accepted
          .map((c) => c.user)
          .filter((u): u is { id: string; full_name: string; username: string; avatar_url: string | null } => u !== null)
          .map((u) => ({
            id: u.id,
            full_name: u.full_name,
            username: u.username,
            avatar_url: u.avatar_url,
            is_online: false,
            referral_score: 0,
            current_company: null,
          }))

        // Use actual canvas CSS size, fallback to reasonable graph area defaults
        const canvasEl = document.querySelector('canvas') as HTMLCanvasElement | null
        const W = canvasEl?.offsetWidth || 860
        const H = canvasEl?.offsetHeight || 680
        const cx = W / 2; const cy = H / 2

        const firstNodes: GraphNode[] = firstDegreeRaw.map((n, i) => {
          const angle = (i / Math.max(firstDegreeRaw.length, 1)) * Math.PI * 2
          const r = 130
          const gn: GraphNode = {
            ...n,
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
            vx: 0,
            vy: 0,
            degree: 1,
          }
          if (n.avatar_url) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = n.avatar_url
            gn.imgEl = img
          }
          return gn
        })

        setGraphNodes(firstNodes)
      })
      .catch((err) => {
        if (!mounted) return
        // eslint-disable-next-line no-console
        console.error('knot build error:', err)
        setMapError(err instanceof Error ? err.message : 'Failed to load knot')
        setGraphNodes([])
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return graphNodes
    return graphNodes.filter(
      (n) =>
        n.full_name.toLowerCase().includes(q) ||
        n.username.toLowerCase().includes(q)
    )
  }, [graphNodes, searchQuery])

  async function onSelectNode(node: GraphNode) {
    setSelectedNode(node)
    setPanelOpen(true)
    setPanelLoading(true)
    setPanelData(null)
    try {
      const data = await apiGet<PanelData>(`/api/users/panel/${node.id}`)
      setPanelData(data)
    } catch {
      // noop
    } finally {
      setPanelLoading(false)
    }
  }

  const firstDegree = graphNodes.filter((n) => n.degree === 1)
  const secondDegree = graphNodes.filter((n) => n.degree === 2)

  const activeThisWeek = firstDegree.filter((n) => n.is_online).length || Math.min(firstDegree.length, 12)
  const hasConnections = firstDegree.length > 0

  return (
    <div
      style={{
        // Position fixed to take over the full viewport beside the sidebar.
        // More robust than negative margins on AppLayout's responsive padding.
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontFamily: "'IBM Plex Sans', sans-serif",
        display: 'flex',
        overflow: 'hidden',
        zIndex: 1,
      }}
      className="left-0 md:left-[220px]"
    >
      {/* ── CENTER: graph canvas ─────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top header */}
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            borderBottom: '0.5px solid var(--rule-soft)',
            flexShrink: 0,
            background: 'var(--paper)',
            position: 'relative',
            zIndex: 5,
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-muted)',
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              Your knot · today
            </div>
            <div
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: 'clamp(16px, 2vw, 22px)',
                fontWeight: 400,
                letterSpacing: -0.3,
                marginTop: 2,
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ fontStyle: 'italic' }}>{firstDegree.length} strong.</span> {activeThisWeek} active this week.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '0.5px solid var(--rule)',
                background: 'var(--paper-soft)',
                fontSize: 12,
                color: 'var(--ink-soft)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width={13} height={13} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="8" cy="8" r="5.5" />
                <path d="M12 12l4 4" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-[110px] md:w-[160px]"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 12,
                  color: 'var(--ink)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              />
              <span
                className="hidden md:inline-block"
                style={{
                  marginLeft: 32,
                  fontSize: 10,
                  color: 'var(--ink-faint)',
                  padding: '2px 6px',
                  border: '0.5px solid var(--rule)',
                  borderRadius: 4,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                ⌘K
              </span>
            </div>
            <KBtn variant="ghost" size="sm" onClick={selectSelf} disabled={!meUser}>
              📋 My asks
            </KBtn>
            <KBtn variant="signal" size="sm" onClick={() => navigate('/discover')}>
              + Invite
            </KBtn>
          </div>
        </div>

        {/* Graph area with dotted bg */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* dotted bg */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(217,209,191,0.5) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />

          {/* The canvas graph (or empty state) */}
          <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
            {loading ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-faint)',
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontStyle: 'italic',
                }}
              >
                Loading your knot…
              </div>
            ) : !hasConnections ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 16,
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                {/* "you" node centered */}
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: 18,
                    fontWeight: 500,
                    boxShadow: '0 0 0 6px rgba(216,68,43,0.18)',
                  }}
                >
                  you
                </div>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontSize: 22,
                    fontStyle: 'italic',
                    color: 'var(--ink)',
                    letterSpacing: -0.3,
                    fontWeight: 500,
                    maxWidth: 380,
                  }}
                >
                  Your knot starts empty.
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: 'var(--ink-muted)',
                    lineHeight: 1.5,
                    maxWidth: 360,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  Find a person worth knowing — every connection makes the graph come alive.
                </div>
                <KBtn variant="signal" size="md" onClick={() => navigate('/discover')}>
                  Discover people
                </KBtn>
                {mapError && (
                  <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.25)', color: 'var(--signal)', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", maxWidth: 480 }}>
                    Map API error: {mapError}
                  </div>
                )}
                {false && mapDebug && (
                  <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', color: 'var(--ink-muted)', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", maxWidth: 540, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>API debug:</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(mapDebug, null, 2)}</pre>
                  </div>
                )}
                {pendingRequests > 0 && (
                  <div
                    onClick={() => navigate('/discover')}
                    style={{
                      marginTop: 6,
                      padding: '10px 16px',
                      borderRadius: 12,
                      background: 'var(--signal-soft)',
                      border: '0.5px solid rgba(216,68,43,0.25)',
                      color: 'var(--signal)',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    🔔 You have {pendingRequests} pending connection request{pendingRequests === 1 ? '' : 's'} — click to review
                  </div>
                )}
              </div>
            ) : (
              <>
                <NetworkGraph
                  nodes={filteredNodes}
                  selected={selectedNode}
                  onSelectNode={onSelectNode}
                  onSelectSelf={selectSelf}
                />
                {/* Ask bubble overlays — positioned next to each node */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {filteredNodes.filter((n) => n.degree === 1 && latestAskByUser[n.id]).map((n) => {
                    const ask = latestAskByUser[n.id]
                    const reactionEntries = Object.entries(ask.reactions)
                    return (
                      <button
                        key={`ask-${n.id}`}
                        type="button"
                        onClick={() => openAskPopup(ask, n.full_name, n.avatar_url)}
                        style={{
                          position: 'absolute',
                          left: n.x + 28,
                          top: n.y - 36,
                          maxWidth: 210,
                          padding: '7px 11px',
                          borderRadius: 14,
                          background: 'var(--paper)',
                          border: '0.5px solid var(--signal)',
                          boxShadow: '0 4px 18px rgba(216,68,43,0.2)',
                          fontSize: 11,
                          color: 'var(--ink)',
                          lineHeight: 1.35,
                          textAlign: 'left',
                          cursor: 'pointer',
                          pointerEvents: 'auto',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        <div style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--signal)', fontWeight: 600, marginBottom: 3 }}>
                          📌 Ask · tap to reply
                        </div>
                        <div style={{ wordBreak: 'break-word', WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {ask.content}
                        </div>
                        {(reactionEntries.length > 0 || ask.reply_count > 0) && (
                          <div style={{ fontSize: 10, marginTop: 5, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            {reactionEntries.slice(0, 4).map(([emoji, { count }]) => (
                              <span key={emoji} style={{ padding: '1px 5px', borderRadius: 8, background: 'var(--signal-soft)', border: '0.5px solid rgba(216,68,43,0.2)', fontSize: 10 }}>{emoji} {count}</span>
                            ))}
                            {ask.reply_count > 0 && <span style={{ color: 'var(--ink-faint)' }}>💬 {ask.reply_count}</span>}
                          </div>
                        )}
                      </button>
                    )
                  })}
                  {/* Self ask bubble at center */}
                  {meId && latestAskByUser[meId] && (() => {
                    const canvasEl = document.querySelector('canvas') as HTMLCanvasElement | null
                    const cx = canvasEl?.offsetWidth ? canvasEl.offsetWidth / 2 : 400
                    const cy = canvasEl?.offsetHeight ? canvasEl.offsetHeight / 2 : 300
                    const ask = latestAskByUser[meId]
                    const reactionEntries = Object.entries(ask.reactions)
                    return (
                      <button
                        type="button"
                        onClick={() => openAskPopup(ask, meUser?.full_name ?? 'You', meUser?.avatar_url ?? null)}
                        style={{
                          position: 'absolute',
                          left: cx + 36,
                          top: cy - 36,
                          maxWidth: 230,
                          padding: '7px 11px',
                          borderRadius: 14,
                          background: 'var(--ink)',
                          color: 'var(--paper)',
                          border: '0.5px solid var(--signal)',
                          boxShadow: '0 4px 18px rgba(216,68,43,0.25)',
                          fontSize: 11,
                          lineHeight: 1.35,
                          textAlign: 'left',
                          cursor: 'pointer',
                          pointerEvents: 'auto',
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        <div style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(216,68,43,0.85)', fontWeight: 600, marginBottom: 3 }}>
                          📌 Your ask · tap to manage
                        </div>
                        <div style={{ wordBreak: 'break-word', WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {ask.content}
                        </div>
                        {(reactionEntries.length > 0 || ask.reply_count > 0) && (
                          <div style={{ fontSize: 10, marginTop: 5, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            {reactionEntries.slice(0, 4).map(([emoji, { count }]) => (
                              <span key={emoji} style={{ padding: '1px 5px', borderRadius: 8, background: 'rgba(244,239,230,0.15)', border: '0.5px solid rgba(244,239,230,0.25)', fontSize: 10 }}>{emoji} {count}</span>
                            ))}
                            {ask.reply_count > 0 && <span style={{ color: 'rgba(244,239,230,0.6)' }}>💬 {ask.reply_count}</span>}
                          </div>
                        )}
                      </button>
                    )
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Style chips bottom-left */}
          <div
            style={{
              position: 'absolute',
              left: 20,
              bottom: 20,
              padding: 6,
              background: 'var(--paper-soft)',
              borderRadius: 999,
              border: '0.5px solid var(--rule)',
              display: 'flex',
              gap: 4,
            }}
          >
            {(['organic', 'constellation', 'rings'] as const).map((s) => (
              <div
                key={s}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: s === 'organic' ? 'var(--ink)' : 'transparent',
                  color: s === 'organic' ? 'var(--paper-soft)' : 'var(--ink-soft)',
                  fontSize: 11.5,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                {s}
              </div>
            ))}
          </div>

          {/* Legend top-right */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              padding: 12,
              borderRadius: 12,
              background: 'var(--paper-soft)',
              border: '0.5px solid var(--rule)',
              fontSize: 11,
              color: 'var(--ink-muted)',
              lineHeight: 1.7,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--signal)' }} />
              ripple = activity
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 1, background: 'var(--ink)', opacity: 0.4 }} />
              direct (1°)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 14,
                  height: 1,
                  background: 'var(--ink)',
                  opacity: 0.4,
                  borderTop: '1px dashed var(--ink)',
                }}
              />
              possible intro (2°)
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: selection panel + activity rail ──────────────────── */}
      {/* Desktop: persistent 320px column.
          Mobile: bottom-sheet drawer that slides up when a node is tapped. */}
      <div
        className={[
          // Mobile visibility — only show when panelOpen
          panelOpen ? 'flex' : 'hidden',
          'md:flex',
          // Mobile: bottom-sheet positioning
          'fixed bottom-0 left-0 right-0 z-30 max-h-[70vh] w-full rounded-t-2xl shadow-[0_-10px_30px_rgba(26,24,21,0.12)]',
          // Desktop: in-flow column
          'md:static md:max-h-none md:rounded-none md:shadow-none md:w-[320px]',
          // Layout
          'flex-col gap-4 overflow-y-auto',
        ].join(' ')}
        style={{
          padding: 18,
          borderLeft: '0.5px solid var(--rule)',
          background: 'var(--paper-soft)',
          flexShrink: 0,
        }}
      >
        {/* Selected node card */}
        {selectedNode ? (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--paper)',
              border: '0.5px solid var(--rule)',
              position: 'relative',
            }}
          >
            {/* Close button — shown only on mobile (the desktop rail is always open) */}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="md:hidden"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: 'none',
                background: 'var(--paper-soft)',
                color: 'var(--ink-muted)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
              aria-label="Close panel"
            >
              ×
            </button>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <KAvatar name={selectedNode.full_name} src={selectedNode.avatar_url} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div
                    style={{
                      fontFamily: "'Fraunces', Georgia, serif",
                      fontSize: 17,
                      fontWeight: 500,
                      letterSpacing: -0.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedNode.full_name}
                  </div>
                  <VerifiedBadge size={12} />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                  @{selectedNode.username}
                  {selectedNode.current_company && <> · {selectedNode.current_company}</>}
                </div>
                {panelData?.user.university && (
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 1 }}>
                    {panelData.user.university}
                  </div>
                )}
              </div>
            </div>

            {/* Headline */}
            {panelData?.user.headline && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink)', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif", fontWeight: 500 }}>
                {panelData.user.headline}
              </div>
            )}

            {/* Bio */}
            {panelData?.user.bio && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                {panelData.user.bio}
              </div>
            )}

            {/* Links */}
            {panelData && (panelData.user.website_url || panelData.user.github_url || panelData.user.linkedin_url) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {panelData.user.website_url && (
                  <a href={panelData.user.website_url.startsWith('http') ? panelData.user.website_url : `https://${panelData.user.website_url}`} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 9px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 10.5, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>🌐 Site</a>
                )}
                {panelData.user.github_url && (
                  <a href={panelData.user.github_url.startsWith('http') ? panelData.user.github_url : `https://github.com/${panelData.user.github_url}`} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 9px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 10.5, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>⌥ GitHub</a>
                )}
                {panelData.user.linkedin_url && (
                  <a href={panelData.user.linkedin_url.startsWith('http') ? panelData.user.linkedin_url : `https://linkedin.com/in/${panelData.user.linkedin_url}`} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '3px 9px', borderRadius: 999, border: '0.5px solid var(--rule)', fontSize: 10.5, color: 'var(--ink)', textDecoration: 'none', fontFamily: "'IBM Plex Sans'" }}>💼 LinkedIn</a>
                )}
              </div>
            )}

            {/* Languages */}
            {panelData?.user.languages && panelData.user.languages.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>Languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {panelData.user.languages.map((lang) => (
                    <span key={lang} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: 'var(--paper-soft)', border: '0.5px solid var(--rule)', color: 'var(--ink)' }}>{lang}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {panelData && panelData.skills.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {panelData.skills.slice(0, 6).map((s) => (
                  <span
                    key={s.id}
                    style={{
                      fontSize: 10.5,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: s.is_verified ? 'var(--verd-soft)' : 'transparent',
                      color: s.is_verified ? 'var(--verd)' : 'var(--ink-muted)',
                      border: s.is_verified ? '0.5px solid rgba(31,107,94,0.25)' : '0.5px solid var(--rule)',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                  >
                    {s.is_verified && <span style={{ marginRight: 3 }}>✓</span>}
                    {s.name}
                  </span>
                ))}
                {panelData.skills.length > 6 && (
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    +{panelData.skills.length - 6}
                  </span>
                )}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                background: 'var(--paper-deep)',
                fontSize: 11.5,
                lineHeight: 1.4,
              }}
            >
              <div
                style={{
                  color: 'var(--ink-muted)',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  fontSize: 10,
                  marginBottom: 4,
                }}
              >
                tie strength
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: 'var(--rule)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${Math.min(selectedNode.referral_score, 100)}%`,
                      background: 'var(--signal)',
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: 14,
                  }}
                >
                  {selectedNode.referral_score}
                </div>
              </div>
              {panelData && panelData.submittedReferralCount > 0 && (
                <div style={{ marginTop: 6, color: 'var(--ink-muted)', fontSize: 11 }}>
                  Has submitted {panelData.submittedReferralCount} warm referral{panelData.submittedReferralCount === 1 ? '' : 's'}.
                </div>
              )}
            </div>

            {/* Milestone timeline: experience + education interleaved */}
            {panelData && (panelData.experience.length > 0 || panelData.education.length > 0) && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Career & education</div>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1, background: 'var(--rule-soft)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      ...panelData.experience.map((e) => ({ kind: 'exp' as const, year: e.start_date ? parseInt(e.start_date.slice(0, 4)) : 0, data: e })),
                      ...panelData.education.map((e) => ({ kind: 'edu' as const, year: e.start_year ?? 0, data: e })),
                    ]
                      .sort((a, b) => b.year - a.year)
                      .slice(0, 5)
                      .map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 13, height: 13, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                            background: item.kind === 'exp' ? 'var(--ink)' : 'var(--paper)',
                            border: `1.5px solid ${item.kind === 'exp' ? 'var(--ink)' : 'var(--rule)'}`,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.kind === 'exp' ? item.data.role : item.data.institution}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.kind === 'exp' ? item.data.company : [item.data.degree, item.data.field].filter(Boolean).join(' · ')}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 1 }}>
                              {item.kind === 'exp'
                                ? `${item.data.start_date?.slice(0, 7) ?? ''}${item.data.end_date ? ` → ${item.data.end_date.slice(0, 7)}` : ' → now'}`
                                : `${item.data.start_year ?? ''}${item.data.end_year ? ` → ${item.data.end_year}` : ''}`}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3 recent Pulse posts */}
            {panelData && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Recent pulse</div>
                {panelData.recentPosts.length === 0 ? (
                  panelData.latestUpdate ? (
                    <div style={{ padding: 10, borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                      <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
                        Working on now · {new Date(panelData.latestUpdate.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                        {panelData.latestUpdate.content.slice(0, 110)}{panelData.latestUpdate.content.length > 110 ? '…' : ''}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
                      {selectedNode.full_name.split(' ')[0]} hasn't posted yet.
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {panelData.recentPosts.map((post) => (
                      <div
                        key={post.id}
                        onClick={() => navigate('/home')}
                        style={{ borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)', overflow: 'hidden', cursor: 'pointer' }}
                      >
                        {post.image_url && (
                          <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: 100, objectFit: 'cover', display: 'block' }} />
                        )}
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 3 }}>
                            {new Date(post.created_at).toLocaleDateString()}
                            {post.channel && <span style={{ color: 'var(--signal)', marginLeft: 4 }}>#{post.channel.slug}</span>}
                          </div>
                          {post.title && (
                            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, letterSpacing: -0.1 }}>
                              {post.title}
                            </div>
                          )}
                          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                            {post.body}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 10, color: 'var(--ink-faint)' }}>
                            <span>↑ {post.upvote_count}</span>
                            <span>💬 {post.comment_count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* ── Professional Asks ───────────────────────────────────── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  Professional asks
                </div>
                {asksLoading && <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic' }}>loading…</span>}
              </div>

              {/* New ask composer (only when viewing my own node) */}
              {meId && selectedNode.id === meId && (
                <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                  <textarea
                    value={newAskText}
                    onChange={(e) => setNewAskText(e.target.value.slice(0, 280))}
                    placeholder="What do you need? (e.g. 'Intro to a CV agent founder')"
                    rows={2}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 12, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.4 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-faint)', fontFamily: "'IBM Plex Mono'" }}>{newAskText.length}/280</span>
                    <KBtn variant="signal" size="sm" disabled={!newAskText.trim() || postingAsk} onClick={postAsk}>
                      {postingAsk ? '…' : 'Post ask'}
                    </KBtn>
                  </div>
                </div>
              )}

              {asks.length === 0 && !asksLoading ? (
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
                  {meId && selectedNode.id === meId
                    ? 'You have no open asks yet. Post one above so your knot can help.'
                    : `${selectedNode.full_name.split(' ')[0]} hasn't posted any asks yet.`}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {asks.map((ask) => {
                    const reactionEntries = Object.entries(ask.reactions)
                    const isOwn = meId === ask.user_id
                    const isResolved = ask.status === 'resolved'
                    const isExpanded = expandedAskId === ask.id
                    return (
                      <div
                        key={ask.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          background: isResolved ? 'var(--paper-deep)' : 'var(--paper-soft)',
                          border: `0.5px solid ${isResolved ? 'var(--rule-soft)' : 'var(--rule)'}`,
                          opacity: isResolved ? 0.65 : 1,
                        }}
                      >
                        {/* Header pill: status + age */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 9, padding: '1px 7px', borderRadius: 999, fontFamily: "'IBM Plex Sans'",
                            background: isResolved ? 'var(--verd-soft)' : 'var(--signal-soft)',
                            color: isResolved ? 'var(--verd)' : 'var(--signal)',
                            border: `0.5px solid ${isResolved ? 'rgba(31,107,94,0.25)' : 'rgba(216,68,43,0.25)'}`,
                            fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                          }}>
                            {isResolved ? '✓ Resolved' : 'Open'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
                            {new Date(ask.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Content */}
                        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {ask.content}
                        </div>

                        {/* Reactions row */}
                        {reactionEntries.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                            {reactionEntries.sort((a, b) => b[1].count - a[1].count).map(([emoji, { count, mine }]) => (
                              <button
                                key={emoji}
                                onClick={() => reactToAsk(ask.id, emoji)}
                                disabled={isResolved}
                                style={{
                                  padding: '2px 7px', borderRadius: 12, fontSize: 11, cursor: isResolved ? 'default' : 'pointer',
                                  border: `0.5px solid ${mine ? 'var(--signal)' : 'var(--rule)'}`,
                                  background: mine ? 'var(--signal-soft)' : 'var(--paper)',
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  fontFamily: "'IBM Plex Sans'",
                                }}
                              >
                                {emoji} <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Action row */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* Quick react buttons */}
                          {!isResolved && (
                            <div style={{ display: 'flex', gap: 2, padding: '3px 6px', borderRadius: 999, background: 'var(--paper)', border: '0.5px solid var(--rule-soft)' }}>
                              {ASK_EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => reactToAsk(ask.id, e)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '1px 3px', transition: 'transform 0.1s' }}
                                  onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1.3)' }}
                                  onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                                  title={`React with ${e}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => loadReplies(ask.id)}
                            style={{ padding: '3px 8px', borderRadius: 8, border: '0.5px solid var(--rule-soft)', background: 'var(--paper)', cursor: 'pointer', fontSize: 11, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'", display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            💬 {ask.reply_count}
                          </button>
                          <button
                            onClick={() => shareAsk(ask)}
                            style={{ padding: '3px 8px', borderRadius: 8, border: '0.5px solid var(--rule-soft)', background: 'var(--paper)', cursor: 'pointer', fontSize: 11, color: 'var(--ink-muted)', fontFamily: "'IBM Plex Sans'" }}
                            title="Share"
                          >
                            ↗ Share
                          </button>
                          {isOwn && !isResolved && (
                            <button
                              onClick={() => resolveAsk(ask.id)}
                              style={{ padding: '3px 10px', borderRadius: 8, border: '0.5px solid var(--verd)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--verd)', fontFamily: "'IBM Plex Sans'", fontWeight: 600, marginLeft: 'auto' }}
                            >
                              ✓ Mark resolved
                            </button>
                          )}
                        </div>

                        {/* Replies (expanded) */}
                        {isExpanded && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px dashed var(--rule)' }}>
                            {(asksReplies[ask.id] ?? []).length === 0 ? (
                              <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic', marginBottom: 8 }}>
                                No replies yet.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                {(asksReplies[ask.id] ?? []).map((r) => (
                                  <div key={r.id} style={{ padding: '6px 9px', borderRadius: 8, background: 'var(--paper)', border: '0.5px solid var(--rule-soft)' }}>
                                    <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginBottom: 2 }}>
                                      <strong style={{ color: 'var(--ink)' }}>{r.author?.full_name ?? 'Someone'}</strong>
                                      <span style={{ marginLeft: 6, color: 'var(--ink-faint)' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.body}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                              <textarea
                                value={replyDraft[ask.id] ?? ''}
                                onChange={(e) => setReplyDraft((prev) => ({ ...prev, [ask.id]: e.target.value.slice(0, 800) }))}
                                placeholder="Reply…"
                                rows={1}
                                style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: '0.5px solid var(--rule)', background: 'var(--paper)', fontSize: 12, fontFamily: "'IBM Plex Sans'", color: 'var(--ink)', outline: 'none', resize: 'none', lineHeight: 1.4, boxSizing: 'border-box' }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void postReply(ask.id) } }}
                              />
                              <KBtn variant="signal" size="sm" disabled={!(replyDraft[ask.id] ?? '').trim()} onClick={() => postReply(ask.id)}>↵</KBtn>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <KBtn variant="ink" size="sm" fullWidth onClick={() => navigate(`/messages?to=${selectedNode.id}`)}>
                Message
              </KBtn>
              <KBtn variant="signal" size="sm" onClick={() => navigate(`/messages?to=${selectedNode.id}&action=coffee`)}>
                ☕ Coffee
              </KBtn>
            </div>
            {panelLoading && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center' }}>
                Loading details…
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--paper)',
              border: '0.5px solid var(--rule)',
              fontSize: 12.5,
              color: 'var(--ink-muted)',
              lineHeight: 1.5,
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            Click a node to inspect.
          </div>
        )}

        {/* Pulse · live */}
        <PulseLiveSection />

        {/* Real upcoming meeting */}
        <UpcomingMeetingSection />
      </div>

      {/* ── Ask popup modal ─────────────────────────────────────────── */}
      {askPopup && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setAskPopup(null) }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(26,24,21,0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '88vh',
              borderRadius: 20,
              background: 'var(--paper)',
              border: '0.5px solid var(--rule)',
              boxShadow: '0 24px 60px rgba(26,24,21,0.22)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '0.5px solid var(--rule-soft)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}
            >
              <KAvatar name={askPopup.userName} src={askPopup.avatarUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 15, fontWeight: 500, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {askPopup.userName}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 6,
                      background: askPopup.ask.status === 'open' ? 'var(--signal-soft)' : 'var(--paper-soft)',
                      color: askPopup.ask.status === 'open' ? 'var(--signal)' : 'var(--verd)',
                      border: `0.5px solid ${askPopup.ask.status === 'open' ? 'rgba(216,68,43,0.2)' : 'var(--rule)'}`,
                    }}
                  >
                    {askPopup.ask.status === 'open' ? '● open' : '✓ resolved'}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
                    {new Date(askPopup.ask.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAskPopup(null)}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '0.5px solid var(--rule)', background: 'var(--paper-soft)', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Ask content */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'var(--paper-soft)',
                  border: '0.5px solid var(--rule-soft)',
                  fontSize: 14,
                  color: 'var(--ink)',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                {askPopup.ask.content}
              </div>

              {/* Existing reactions display */}
              {Object.keys(askPopup.ask.reactions).length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {Object.entries(askPopup.ask.reactions)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([emoji, { count, mine }]) => (
                      <button
                        key={emoji}
                        type="button"
                        disabled={askPopup.ask.status === 'resolved'}
                        onClick={() => reactToAsk(askPopup.ask.id, emoji)}
                        style={{
                          padding: '3px 9px',
                          borderRadius: 14,
                          border: `0.5px solid ${mine ? 'var(--signal)' : 'var(--rule)'}`,
                          background: mine ? 'var(--signal-soft)' : 'var(--paper)',
                          cursor: askPopup.ask.status === 'resolved' ? 'default' : 'pointer',
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontFamily: "'IBM Plex Sans'",
                          transition: 'transform 0.1s',
                        }}
                        onMouseEnter={(e) => { if (askPopup.ask.status !== 'resolved') (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                      >
                        {emoji} <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{count}</span>
                      </button>
                    ))}
                </div>
              )}

              {/* React buttons row */}
              {askPopup.ask.status === 'open' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginRight: 2, fontFamily: "'IBM Plex Sans'" }}>React:</span>
                  <div style={{ display: 'flex', gap: 2, padding: '4px 8px', borderRadius: 999, background: 'var(--paper-soft)', border: '0.5px solid var(--rule-soft)' }}>
                    {ASK_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => reactToAsk(askPopup.ask.id, e)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', transition: 'transform 0.1s' }}
                        onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1.35)' }}
                        onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                        title={`React with ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Replies section */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, fontFamily: "'IBM Plex Sans'" }}>
                  Replies · {askPopup.ask.reply_count}
                </div>
                {popupRepliesLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0', fontFamily: "'Fraunces', Georgia, serif" }}>
                    Loading replies…
                  </div>
                ) : (asksReplies[askPopup.ask.id] ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0', fontFamily: "'Fraunces', Georgia, serif" }}>
                    No replies yet. Be the first.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(asksReplies[askPopup.ask.id] ?? []).map((r) => (
                      <div
                        key={r.id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: 'var(--paper-soft)',
                          border: '0.5px solid var(--rule-soft)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <KAvatar name={r.author?.full_name ?? '?'} src={r.author?.avatar_url ?? null} size={22} />
                          <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--ink)', fontFamily: "'IBM Plex Sans'" }}>
                            {r.author?.full_name ?? 'Someone'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--ink-faint)', marginLeft: 'auto', fontFamily: "'IBM Plex Sans'" }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'IBM Plex Sans'" }}>
                          {r.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer: reply input + owner controls */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '0.5px solid var(--rule-soft)',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {askPopup.ask.status === 'open' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <textarea
                    value={replyDraft[askPopup.ask.id] ?? ''}
                    onChange={(e) => setReplyDraft((prev) => ({ ...prev, [askPopup.ask.id]: e.target.value.slice(0, 800) }))}
                    placeholder="Write a reply…"
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '0.5px solid var(--rule)',
                      background: 'var(--paper-soft)',
                      fontSize: 13,
                      fontFamily: "'IBM Plex Sans'",
                      color: 'var(--ink)',
                      outline: 'none',
                      resize: 'none',
                      lineHeight: 1.4,
                      boxSizing: 'border-box',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void postReply(askPopup.ask.id) } }}
                  />
                  <KBtn
                    variant="signal"
                    size="sm"
                    disabled={!(replyDraft[askPopup.ask.id] ?? '').trim()}
                    onClick={() => postReply(askPopup.ask.id)}
                  >
                    Send
                  </KBtn>
                </div>
              )}
              {/* Owner controls */}
              {meId === askPopup.ask.user_id && askPopup.ask.status === 'open' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={async () => { await resolveAsk(askPopup.ask.id); setAskPopup(null) }}
                    style={{ padding: '5px 14px', borderRadius: 8, border: '0.5px solid var(--verd)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--verd)', fontFamily: "'IBM Plex Sans'", fontWeight: 600 }}
                  >
                    ✓ Mark resolved
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PulseLiveSection — live posts from connections + global feed ─────────
type PulsePost = {
  id: string
  title: string | null
  body: string
  image_url: string | null
  created_at: string
  upvote_count: number
  comment_count: number
  author: { full_name: string; username: string; avatar_url: string | null } | null
  channel: { slug: string; name: string } | null
}

function PulseLiveSection() {
  const navigate = useNavigate()
  const [items, setItems] = useState<PulsePost[]>([])

  useEffect(() => {
    let mounted = true
    apiGet<{ posts: PulsePost[] }>('/api/posts?scope=all&sort=new&limit=4')
      .then((data) => {
        if (mounted) setItems((data.posts ?? []).slice(0, 4))
      })
      .catch(() => {
        if (mounted) setItems([])
      })
    return () => {
      mounted = false
    }
  }, [])

  const palette = ['var(--verd)', 'var(--signal)', 'var(--plum)', 'var(--ochre)']

  function timeShort(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${Math.max(1, mins)}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-muted)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: 10,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        <span>Pulse · live</span>
        {items.length > 0 && <span style={{ color: 'var(--signal)' }}>● {items.length}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: 'var(--paper)',
              border: '0.5px solid var(--rule-soft)',
              fontSize: 11.5,
              color: 'var(--ink-faint)',
              fontStyle: 'italic',
              textAlign: 'center',
              fontFamily: "'Fraunces', Georgia, serif",
            }}
          >
            The knot is quiet.
          </div>
        ) : (
          items.map((it, i) => (
            <div
              key={it.id}
              onClick={() => navigate('/home')}
              style={{
                padding: 10,
                borderRadius: 12,
                background: 'var(--paper)',
                border: '0.5px solid var(--rule-soft)',
                display: 'flex',
                gap: 10,
                fontFamily: "'IBM Plex Sans', sans-serif",
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--paper-soft)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--paper)' }}
            >
              {/* Color rail / image thumb */}
              {it.image_url ? (
                <img
                  src={it.image_url}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: palette[i % palette.length], flexShrink: 0 }} />
              )}

              <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.author?.full_name ?? 'Someone'}
                  </span>
                  {it.channel && (
                    <span style={{ color: 'var(--signal)', fontSize: 10.5 }}>· #{it.channel.slug}</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-faint)', flexShrink: 0 }}>
                    {timeShort(it.created_at)}
                  </span>
                </div>
                {it.title && (
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.title}
                  </div>
                )}
                <div style={{ color: 'var(--ink-muted)', marginTop: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                  {it.body}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10.5, color: 'var(--ink-faint)' }}>
                  <span>↑ {it.upvote_count}</span>
                  <span>💬 {it.comment_count}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── UpcomingMeetingSection — real "Tomorrow · IRL" data ─────────────────────
type UpcomingMeeting = {
  id: string
  scheduled_at: string
  status: 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'completed'
  location_text: string | null
  am_initiator: boolean
  peer: { id: string; full_name: string; username: string; avatar_url: string | null } | null
  cafe: { id: string; name: string; slug: string; address: string | null } | null
}

function UpcomingMeetingSection() {
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  function load() {
    apiGet<{ meetings: UpcomingMeeting[] }>('/api/meetings/upcoming')
      .then((d) => setMeetings(d.meetings ?? []))
      .catch(() => setMeetings([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function respond(id: string, status: 'confirmed' | 'declined' | 'cancelled') {
    setBusy(true)
    try {
      await apiPatch(`/api/meetings/${id}`, { status })
      load()
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  const next = meetings[0] ?? null
  const headerLabel = next ? meetingDayLabel(next.scheduled_at) : 'Next · IRL'

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-muted)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: 10,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {headerLabel}
      </div>
      {loading ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: 'var(--paper)',
            border: '0.5px solid var(--rule-soft)',
            fontSize: 12,
            color: 'var(--ink-faint)',
            fontStyle: 'italic',
            fontFamily: "'Fraunces', Georgia, serif",
            textAlign: 'center',
          }}
        >
          Loading…
        </div>
      ) : !next ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'var(--paper)',
            border: '0.5px dashed var(--rule)',
            fontSize: 12.5,
            color: 'var(--ink-muted)',
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontSize: 14, color: 'var(--ink)' }}>
            Nothing planned.
          </span>
          <br />
          Plan a coffee with someone in your knot — the card lights up here.
        </div>
      ) : (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: next.status === 'confirmed' ? 'var(--signal)' : 'var(--ink)',
            color: '#fff',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' }}>
            {meetingTimeLabel(next.scheduled_at)}
            {next.status === 'proposed' && <span style={{ marginLeft: 6 }}>· proposed</span>}
          </div>
          <div
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 17,
              fontWeight: 400,
              marginTop: 4,
              lineHeight: 1.2,
            }}
          >
            Coffee with {next.peer?.full_name ?? 'a friend'}
            {next.cafe && (
              <>
                <br />
                <span style={{ fontStyle: 'italic', opacity: 0.85 }}>at {next.cafe.name}.</span>
              </>
            )}
            {!next.cafe && next.location_text && (
              <>
                <br />
                <span style={{ fontStyle: 'italic', opacity: 0.85 }}>at {next.location_text}.</span>
              </>
            )}
          </div>
          {/* Action row — invitee can confirm/decline; initiator can cancel */}
          {next.status === 'proposed' && !next.am_initiator && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(next.id, 'confirmed')}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(next.id, 'declined')}
                style={{ padding: '6px 10px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                Decline
              </button>
            </div>
          )}
          {next.status === 'proposed' && next.am_initiator && (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
              Awaiting {next.peer?.full_name ?? 'response'}…
              <button
                type="button"
                disabled={busy}
                onClick={() => respond(next.id, 'cancelled')}
                style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function meetingDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((target - today) / 86400000)
  if (diffDays === 0) return 'Today · IRL'
  if (diffDays === 1) return 'Tomorrow · IRL'
  if (diffDays < 7) return `In ${diffDays} days · IRL`
  return 'Upcoming · IRL'
}

function meetingTimeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

