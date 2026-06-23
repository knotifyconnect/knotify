import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { motion } from 'framer-motion'

export type KnotGraphTab = 'Connected' | 'Incoming' | 'Sent'

export type KnotHealthState = 'warm' | 'cooling' | 'cold'

export type KnotGraphNode = {
  id: string
  userId: string
  connectionId: string
  name: string
  avatarUrl: string | null
  context: string
  tab: KnotGraphTab
  matchesQuery: boolean
  degree?: 'direct' | 'second'
  expandedViaUserId?: string
  healthState?: KnotHealthState
}

export type KnotGraphPeerEdge = {
  id: string
  sourceId: string
  targetId: string
}

type CenterNode = {
  id: 'me'
  name: string
  avatarUrl: string | null
}

type LayoutNode = KnotGraphNode & {
  x: number
  y: number
  initial: string
}

type DragState = {
  nodeId: string
  startClientX: number
  startClientY: number
  offsetX: number
  offsetY: number
}

type PanState = {
  startClientX: number
  startClientY: number
  startViewportX: number
  startViewportY: number
  moved: boolean
}

type ViewportState = {
  scale: number
  x: number
  y: number
}

type Props = {
  me: CenterNode
  nodes: KnotGraphNode[]
  peerEdges: KnotGraphPeerEdge[]
  selectedNodeId: string | null
  query: string
  onSelectNode: (node: KnotGraphNode) => void
  onClearSelection: () => void
  onClearQuery?: () => void
  onResetGraph?: () => void
  compact?: boolean
}

const VIEW_W = 1000
const VIEW_H = 590
const BASE_CENTER_X = 500
const BASE_CENTER_Y = 295
const MIN_ZOOM = 0.72
const MAX_ZOOM = 2.15

function clean(value?: string | null) {
  return value?.trim() || ''
}

function firstName(value?: string | null) {
  return clean(value).split(' ')[0] || 'Someone'
}

function initialFor(name: string) {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function clampText(value: string, max = 24) {
  if (value.length <= max) return value
  return value.slice(0, max - 1).trimEnd() + '…'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function statusColor(tab: KnotGraphTab) {
  if (tab === 'Incoming') return 'var(--verd)'
  if (tab === 'Sent') return 'var(--signal)'
  return 'var(--ink-muted)'
}

function healthColor(health?: KnotHealthState) {
  if (health === 'cold') return '#e05c3a'
  if (health === 'cooling') return '#d4a017'
  if (health === 'warm') return '#4caf7d'
  return null
}

function tabLabel(tab: KnotGraphTab) {
  if (tab === 'Incoming') return 'Needs decision'
  if (tab === 'Sent') return 'Waiting'
  return 'In your knot'
}

function cardSize(total: number, selected: boolean, searchHit: boolean, related: boolean) {
  if (total > 220 && !selected && !searchHit && !related) return 'dot'
  if (total > 80 && !selected && !searchHit && !related) return 'pill'
  return 'card'
}

function layoutPosition(index: number, total: number, tab: KnotGraphTab, compact?: boolean) {
  if (total <= 0) return { x: BASE_CENTER_X, y: BASE_CENTER_Y }

  // Compact (mobile) mode: uniform circular ring, no wave noise.
  // y-scale 0.34 compensates for portrait viewport (stage is taller than wide)
  // so the ring looks circular rather than a tall ellipse.
  if (compact) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    const radius = tab === 'Connected' ? 190 : 240
    return {
      x: BASE_CENTER_X + Math.cos(angle) * radius,
      y: BASE_CENTER_Y + Math.sin(angle) * radius * 0.34,
    }
  }

  if (total <= 20) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    const wave = Math.sin(index * 1.73) * 18
    const radius = tab === 'Connected' ? 215 + wave : 285 + wave

    return {
      x: BASE_CENTER_X + Math.cos(angle) * radius,
      y: BASE_CENTER_Y + Math.sin(angle) * radius * 0.55,
    }
  }

  let remaining = index
  let ring = 0
  let capacity = 20

  while (remaining >= capacity) {
    remaining -= capacity
    ring += 1
    capacity = 24 + ring * 8
  }

  const angle = (remaining / capacity) * Math.PI * 2 - Math.PI / 2 + ring * 0.17
  const wave = Math.sin(index * 1.73) * 18
  const radius = 215 + ring * 82 + wave + (tab === 'Connected' ? 0 : 52)

  return {
    x: BASE_CENTER_X + Math.cos(angle) * radius,
    y: BASE_CENTER_Y + Math.sin(angle) * radius * (total > 120 ? 0.68 : 0.58),
  }
}

function clientToViewBox(stage: HTMLDivElement, clientX: number, clientY: number, viewport: ViewportState) {
  const rect = stage.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  const originX = rect.width / 2
  const originY = rect.height / 2

  const untransformedX = ((localX - originX - viewport.x) / viewport.scale) + originX
  const untransformedY = ((localY - originY - viewport.y) / viewport.scale) + originY

  return {
    x: (untransformedX / Math.max(rect.width, 1)) * VIEW_W,
    y: (untransformedY / Math.max(rect.height, 1)) * VIEW_H,
  }
}

function viewportForPoint(stage: HTMLDivElement, point: { x: number; y: number }, scale: number) {
  const rect = stage.getBoundingClientRect()
  const originX = rect.width / 2
  const originY = rect.height / 2
  const px = (point.x / VIEW_W) * rect.width
  const py = (point.y / VIEW_H) * rect.height

  return {
    scale,
    x: -scale * (px - originX),
    y: -scale * (py - originY),
  }
}

function Avatar({
  name,
  src,
  size,
  rounded = 10,
  style,
}: {
  name: string
  src: string | null
  size: number
  rounded?: number | string
  style?: CSSProperties
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          objectFit: 'cover',
          flexShrink: 0,
          ...style,
        }}
      />
    )
  }

  return (
    <span
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        border: '0.5px solid var(--rule)',
        background: 'var(--paper-soft)',
        color: 'var(--indigo, #4455c7)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Fraunces', Georgia, serif",
        fontStyle: 'italic',
        fontSize: Math.max(12, size * 0.34),
        fontWeight: 500,
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {initialFor(name)}
    </span>
  )
}

function StageCard({
  node,
  selected,
  related,
  muted,
  searchHit,
  searchMuted,
  selectedName,
  total,
  secondDegree,
  onSelect,
  onPointerDown,
  compact,
}: {
  node: LayoutNode
  selected: boolean
  related: boolean
  muted: boolean
  searchHit: boolean
  searchMuted: boolean
  selectedName?: string
  total: number
  secondDegree: boolean
  onSelect: () => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  compact?: boolean
}) {
  // Compact mode: round avatar bubble with name label — selected node still shows full card
  if (compact && !selected && !searchHit) {
    const sz = secondDegree ? 26 : related ? 38 : 34
    const hc = healthColor(node.healthState)
    const firstName = node.name.split(' ')[0]
    // Position the bubble at the node center; name label goes below WITHOUT shifting center
    return (
      <div
        style={{
          position: 'absolute',
          left: `${node.x / 10}%`,
          top: `${node.y / 5.9}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          zIndex: related ? 3 : muted || searchMuted ? 1 : 2,
          opacity: muted || searchMuted ? 0.20 : 1,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={onSelect}
          onPointerDown={onPointerDown}
          title={node.name}
          aria-label={node.name}
          style={{
            width: sz,
            height: sz,
            padding: 0,
            border: 'none',
            borderRadius: 999,
            overflow: 'hidden',
            cursor: 'grab',
            touchAction: 'none',
            flexShrink: 0,
            outline: hc ? `2px solid ${hc}` : secondDegree ? undefined : '2px solid rgba(255,252,246,0.90)',
            outlineOffset: secondDegree ? 0 : 1,
            boxShadow: secondDegree
              ? 'none'
              : related
                ? '0 4px 14px rgba(26,24,21,0.18), 0 0 0 3px rgba(84,72,58,0.09)'
                : '0 3px 10px rgba(26,24,21,0.14)',
            pointerEvents: 'auto',
          }}
        >
          <Avatar name={node.name} src={node.avatarUrl} size={sz} rounded={999} />
        </button>
        <span style={{
          fontSize: 8.5,
          fontWeight: 600,
          color: secondDegree ? 'var(--ink-muted)' : 'var(--ink)',
          whiteSpace: 'nowrap',
          maxWidth: 44,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1,
          fontFamily: "'IBM Plex Sans', sans-serif",
          pointerEvents: 'none',
          background: 'rgba(244,239,230,0.88)',
          borderRadius: 4,
          padding: '1px 3px',
        }}>
          {firstName}
        </span>
      </div>
    )
  }

  const mode = cardSize(total, selected, searchHit, related)

  if (mode === 'dot') {
    return (
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          left: `${node.x / 10}%`,
          top: `${node.y / 5.9}%`,
          transform: 'translate(-50%, -50%)',
          width: selected || searchHit ? 18 : 12,
          height: selected || searchHit ? 18 : 12,
          borderRadius: 999,
          border: secondDegree ? '0.5px dashed rgba(84,72,58,0.36)' : '0.5px solid rgba(84,72,58,0.24)',
          background: selected || searchHit ? 'var(--ink)' : secondDegree ? 'rgba(84,72,58,0.48)' : (healthColor(node.healthState) ?? statusColor(node.tab)),
          opacity: muted || searchMuted ? 0.14 : 0.82,
          cursor: 'grab',
          zIndex: selected || searchHit ? 5 : related ? 3 : 2,
          padding: 0,
          touchAction: 'none',
        }}
        title={node.name}
        aria-label={node.name}
      />
    )
  }

  if (mode === 'pill') {
    return (
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={onPointerDown}
        style={{
          position: 'absolute',
          left: `${node.x / 10}%`,
          top: `${node.y / 5.9}%`,
          transform: 'translate(-50%, -50%)',
          minWidth: selected || searchHit ? 126 : related ? 116 : 104,
          maxWidth: 150,
          minHeight: 38,
          padding: '6px 9px',
          borderRadius: 999,
          border: selected || searchHit ? '0.5px solid rgba(26,24,21,0.52)' : secondDegree ? '0.5px dashed rgba(84,72,58,0.34)' : related ? '0.5px solid rgba(84,72,58,0.38)' : '0.5px solid var(--rule)',
          background: selected || searchHit ? 'rgba(255,252,246,0.98)' : secondDegree ? 'rgba(255,252,246,0.62)' : related ? 'rgba(244,239,230,0.94)' : 'rgba(244,239,230,0.72)',
          color: 'var(--ink)',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          textAlign: 'left',
          zIndex: selected || searchHit ? 5 : related ? 3 : 2,
          opacity: muted || searchMuted ? 0.12 : 1,
          touchAction: 'none',
        }}
        title={node.name}
      >
        <Avatar name={node.name} src={node.avatarUrl} size={24} rounded={999} />
        <span style={{ minWidth: 0, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </button>
    )
  }

  const border = selected
    ? 'rgba(26,24,21,0.58)'
    : searchHit
      ? 'rgba(26,24,21,0.62)'
      : secondDegree
        ? 'rgba(84,72,58,0.34)'
        : related
          ? 'rgba(84,72,58,0.46)'
          : node.tab === 'Incoming'
            ? 'rgba(31,107,94,0.30)'
            : node.tab === 'Sent'
              ? 'rgba(216,68,43,0.30)'
              : 'var(--rule)'

  const width = selected ? 196 : searchHit ? 190 : related ? 180 : secondDegree ? 158 : 166
  const subtitle = secondDegree
    ? node.context || 'Warm path'
    : selected
      ? node.context
      : searchHit
        ? 'Search match'
        : related
          ? `Also knows ${firstName(selectedName)}`
          : node.tab === 'Connected'
            ? node.context
            : tabLabel(node.tab)

  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: `${node.x / 10}%`,
        top: `${node.y / 5.9}%`,
        transform: 'translate(-50%, -50%)',
        width,
        minHeight: 54,
        padding: '8px 10px',
        borderRadius: 16,
        border: `0.5px solid ${border}`,
        borderStyle: secondDegree && !selected && !searchHit ? 'dashed' : 'solid',
        borderLeft: selected ? '4px solid var(--ink)' : searchHit ? '4px solid var(--ink)' : related ? '3px solid rgba(84,72,58,0.34)' : secondDegree ? '0.5px dashed rgba(84,72,58,0.34)' : `0.5px solid ${border}`,
        background: selected
          ? 'linear-gradient(180deg, rgba(255,252,246,0.98), rgba(244,239,230,0.94))'
          : searchHit
            ? 'rgba(255,252,246,0.98)'
            : secondDegree
              ? 'rgba(255,252,246,0.64)'
              : related
                ? 'rgba(244,239,230,0.96)'
                : 'rgba(244,239,230,0.72)',
        color: 'var(--ink)',
        cursor: 'grab',
        boxShadow: selected
          ? '0 22px 58px rgba(26,24,21,0.16)'
          : searchHit
            ? '0 18px 44px rgba(26,24,21,0.13)'
            : related
              ? '0 14px 34px rgba(26,24,21,0.08)'
              : '0 4px 14px rgba(26,24,21,0.02)',
        display: 'grid',
        gridTemplateColumns: '30px minmax(0, 1fr)',
        gap: 8,
        alignItems: 'center',
        textAlign: 'left',
        zIndex: selected ? 5 : searchHit ? 4 : related ? 3 : 2,
        opacity: muted || searchMuted ? 0.12 : 1,
        touchAction: 'none',
      }}
      title={node.name}
    >
      <Avatar
        name={node.name}
        src={node.avatarUrl}
        size={30}
        style={{
          borderRadius: 10,
          border: selected ? '0.5px solid rgba(26,24,21,0.24)' : secondDegree ? '0.5px dashed rgba(84,72,58,0.30)' : related ? '0.5px solid rgba(84,72,58,0.30)' : '0.5px solid var(--rule)',
          background: selected ? 'var(--paper-soft)' : secondDegree ? 'rgba(255,252,246,0.88)' : related ? 'var(--paper)' : 'var(--paper-soft)',
          boxShadow: node.avatarUrl ? '0 4px 12px rgba(26,24,21,0.08)' : undefined,
        }}
      />

      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 3,
            fontSize: 10.8,
            color: selected ? 'var(--ink-muted)' : related ? 'rgba(84,72,58,0.78)' : 'var(--ink-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: selected ? 'var(--ink)' : secondDegree ? 'rgba(84,72,58,0.48)' : related ? 'rgba(26,24,21,0.68)' : (healthColor(node.healthState) ?? statusColor(node.tab)),
              display: 'inline-block',
              flex: '0 0 auto',
            }}
          />
          {clampText(subtitle, 22)}
        </span>
      </span>
    </button>
  )
}

export function KnotForceGraph({
  me,
  nodes,
  peerEdges,
  selectedNodeId,
  query,
  onSelectNode,
  onClearSelection,
  onClearQuery,
  onResetGraph,
  compact,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const draggedRef = useRef(false)
  const viewportRef = useRef<ViewportState>({ scale: 1, x: 0, y: 0 })
  const previousQueryRef = useRef('')
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [viewport, setViewport] = useState<ViewportState>({ scale: 1, x: 0, y: 0 })

  const normalizedQuery = query.trim().toLowerCase()
  const hasQuery = normalizedQuery.length > 0
  const center = dragPositions.me ?? { x: BASE_CENTER_X, y: BASE_CENTER_Y }

  const layoutNodes = useMemo<LayoutNode[]>(() => {
    const directNodes = nodes.filter((node) => node.degree !== 'second')
    const secondNodes = nodes.filter((node) => node.degree === 'second')
    const directPositions = new Map<string, { x: number; y: number }>()

    directNodes.forEach((node, index) => {
      directPositions.set(node.id, dragPositions[node.id] ?? layoutPosition(index, directNodes.length, node.tab, compact))
    })

    const secondNodesByRoot = new Map<string, KnotGraphNode[]>()
    for (const node of secondNodes) {
      const rootId = node.expandedViaUserId ?? 'unknown'
      secondNodesByRoot.set(rootId, [...(secondNodesByRoot.get(rootId) ?? []), node])
    }

    return nodes.map((node) => {
      let position = dragPositions[node.id]

      if (!position && node.degree === 'second' && node.expandedViaUserId) {
        const rootPosition = directPositions.get(`person:${node.expandedViaUserId}`) ?? { x: BASE_CENTER_X, y: BASE_CENTER_Y }
        const siblings = secondNodesByRoot.get(node.expandedViaUserId) ?? []
        const index = Math.max(0, siblings.findIndex((item) => item.id === node.id))
        const total = Math.max(1, siblings.length)
        const side = rootPosition.x >= center.x ? -1 : 1
        const column = index % 3
        const row = Math.floor(index / 3)
        const stagger = row % 2 === 0 ? 0 : 26
        const horizontalDistance = 104 + column * 92 + stagger
        const verticalDistance = rootPosition.y >= center.y ? 86 + row * 68 : -(86 + row * 68)
        const targetX = rootPosition.x + side * horizontalDistance
        const targetY = rootPosition.y + verticalDistance
        const panelSafeMaxX = 710

        position = {
          x: clamp(targetX, 42, panelSafeMaxX),
          y: clamp(targetY, 46, 548),
        }
      }

      if (!position) {
        position = directPositions.get(node.id) ?? layoutPosition(0, 1, node.tab, compact)
      }

      return {
        ...node,
        x: position.x,
        y: position.y,
        initial: initialFor(node.name),
      }
    })
  }, [center.x, center.y, dragPositions, nodes])

  const nodesById = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes])
  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) ?? null : null

  const visiblePeerEdges = useMemo(() => {
    return peerEdges
      .map((edge) => {
        const source = nodesById.get(edge.sourceId)
        const target = nodesById.get(edge.targetId)
        if (!source || !target) return null
        return { ...edge, source, target }
      })
      .filter(Boolean) as Array<KnotGraphPeerEdge & { source: LayoutNode; target: LayoutNode }>
  }, [nodesById, peerEdges])

  const selectedPeerIds = useMemo(() => {
    if (!selectedNode) return new Set<string>()

    return new Set(
      visiblePeerEdges
        .filter((edge) => edge.source.id === selectedNode.id || edge.target.id === selectedNode.id)
        .map((edge) => (edge.source.id === selectedNode.id ? edge.target.id : edge.source.id))
    )
  }, [selectedNode, visiblePeerEdges])

  useEffect(() => {
    setDragPositions((prev) => {
      const next: Record<string, { x: number; y: number }> = {}

      if (prev.me) next.me = prev.me

      for (const node of nodes) {
        if (prev[node.id]) next[node.id] = prev[node.id]
      }

      return next
    })
  }, [nodes])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const previousHadQuery = previousQueryRef.current.trim().length > 0
    previousQueryRef.current = query

    if (hasQuery) {
      const match = layoutNodes.find((node) => node.matchesQuery)
      if (match) {
        const stableScale = Math.max(1, viewportRef.current.scale)
        setViewport(viewportForPoint(stage, match, stableScale))
        return
      }
    }

    if (!hasQuery && previousHadQuery) {
      setViewport({ scale: 1, x: 0, y: 0 })
    }
  }, [hasQuery, layoutNodes, query])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      const shouldZoomGraph = event.ctrlKey || event.metaKey || event.altKey

      if (!shouldZoomGraph) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setViewport((prev) => {
        const nextScale = clamp(prev.scale * (event.deltaY > 0 ? 0.90 : 1.11), MIN_ZOOM, MAX_ZOOM)
        const normalizedScale = Math.abs(nextScale - 1) < 0.035 ? 1 : nextScale
        return { ...prev, scale: normalizedScale }
      })
    }

    stage.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      stage.removeEventListener('wheel', handleNativeWheel)
    }
  }, [])

  function applyPan(clientX: number, clientY: number) {
    const pan = panRef.current
    if (!pan) return

    const dx = clientX - pan.startClientX
    const dy = clientY - pan.startClientY

    if (Math.abs(dx) + Math.abs(dy) > 4) {
      pan.moved = true
      draggedRef.current = true
    }

    setViewport((prev) => ({
      ...prev,
      x: pan.startViewportX + dx,
      y: pan.startViewportY + dy,
    }))
  }

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const target = event.target as Element | null
    if (target?.closest?.('button')) return

    dragCleanupRef.current?.()
    dragCleanupRef.current = null

    panRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewportX: viewportRef.current.x,
      startViewportY: viewportRef.current.y,
      moved: false,
    }

    draggedRef.current = false
    event.preventDefault()

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault()
      applyPan(moveEvent.clientX, moveEvent.clientY)
    }

    const handleEnd = () => {
      endDrag()
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
  }

  function applyDrag(clientX: number, clientY: number) {
    const drag = dragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return

    const moved = Math.abs(clientX - drag.startClientX) + Math.abs(clientY - drag.startClientY)
    if (moved > 4) draggedRef.current = true

    const point = clientToViewBox(stage, clientX, clientY, viewportRef.current)
    const minX = drag.nodeId === 'me' ? 210 : 40
    const maxX = drag.nodeId === 'me' ? 790 : 960
    const minY = drag.nodeId === 'me' ? 130 : 30
    const maxY = drag.nodeId === 'me' ? 460 : 560

    setDragPositions((prev) => ({
      ...prev,
      [drag.nodeId]: {
        x: clamp(point.x + drag.offsetX, minX, maxX),
        y: clamp(point.y + drag.offsetY, minY, maxY),
      },
    }))
  }

  function beginDrag(nodeId: string, event: PointerEvent<HTMLButtonElement>) {
    const stage = stageRef.current
    const currentNode = nodeId === 'me' ? center : layoutNodes.find((node) => node.id === nodeId)
    const point = stage ? clientToViewBox(stage, event.clientX, event.clientY, viewportRef.current) : null

    dragCleanupRef.current?.()
    dragCleanupRef.current = null

    dragRef.current = {
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: point && currentNode ? currentNode.x - point.x : 0,
      offsetY: point && currentNode ? currentNode.y - point.y : 0,
    }
    draggedRef.current = false

    event.preventDefault()
    event.stopPropagation()

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Window listeners below keep dragging working even if capture is refused.
    }

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault()
      applyDrag(moveEvent.clientX, moveEvent.clientY)
    }

    const handleEnd = () => {
      endDrag()
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleEnd)

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleEnd)
    }
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current) {
      applyPan(event.clientX, event.clientY)
      return
    }

    applyDrag(event.clientX, event.clientY)
  }

  function endDrag() {
    const cleanup = dragCleanupRef.current
    dragCleanupRef.current = null
    if (cleanup) cleanup()

    dragRef.current = null
    panRef.current = null
    window.setTimeout(() => {
      draggedRef.current = false
    }, 0)
  }

  const showEmpty = layoutNodes.length === 0

  function resetGraph() {
    dragCleanupRef.current?.()
    dragCleanupRef.current = null
    dragRef.current = null
    panRef.current = null
    draggedRef.current = false
    previousQueryRef.current = ''
    setDragPositions({})
    setViewport({ scale: 1, x: 0, y: 0 })
    onClearSelection()
    onClearQuery?.()
    onResetGraph?.()
  }

  return (
    <motion.div
      ref={stageRef}
      initial={{ opacity: 0, scale: 0.985, filter: 'blur(3px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      onPointerDown={beginPan}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
        cursor: panRef.current ? 'grabbing' : 'grab',
      }}
    >
      {showEmpty ? null : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            transformOrigin: '50% 50%',
            transition: dragRef.current || panRef.current ? 'none' : 'transform 0.28s ease',
            willChange: 'transform',
          }}
        >
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              <radialGradient id="forceKnotCenterGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(84,72,58,0.055)" />
                <stop offset="58%" stopColor="rgba(84,72,58,0.022)" />
                <stop offset="100%" stopColor="rgba(84,72,58,0)" />
              </radialGradient>
            </defs>

            <circle cx={center.x} cy={center.y} r="172" fill="url(#forceKnotCenterGlow)" />

            {layoutNodes.filter((node) => node.degree !== 'second').map((node, index) => {
              const selected = selectedNodeId === node.id
              const related = selectedPeerIds.has(node.id)
              const muted = Boolean(selectedNodeId) && !selected && !related
              const searchHit = hasQuery && node.matchesQuery
              const searchMuted = hasQuery && !node.matchesQuery

              const stroke = selected
                ? 'rgba(26,24,21,0.28)'
                : searchHit
                  ? 'rgba(26,24,21,0.34)'
                  : related
                    ? 'rgba(84,72,58,0.14)'
                    : muted || searchMuted
                      ? 'rgba(84,72,58,0.035)'
                      : node.tab === 'Incoming'
                        ? 'rgba(31,107,94,0.34)'
                        : node.tab === 'Sent'
                          ? 'rgba(216,68,43,0.28)'
                          : 'rgba(84,72,58,0.20)'

              const c1x = center.x + (node.x - center.x) * 0.34 + Math.sin(index * 2.1) * 38
              const c1y = center.y + (node.y - center.y) * 0.28 - Math.cos(index * 1.4) * 28
              const c2x = center.x + (node.x - center.x) * 0.72 - Math.cos(index * 1.9) * 32
              const c2y = center.y + (node.y - center.y) * 0.74 + Math.sin(index * 1.2) * 24

              return (
                <path
                  key={`strand-${node.id}`}
                  d={`M ${center.x} ${center.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${node.x} ${node.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={selected ? 1.2 : searchHit ? 1.25 : related ? 0.85 : muted || searchMuted ? 0.28 : node.tab === 'Connected' ? 0.85 : 1.1}
                  strokeDasharray={node.tab === 'Connected' ? 'none' : '8 8'}
                  strokeLinecap="round"
                />
              )
            })}

            {visiblePeerEdges.map((edge, index) => {
              const selected = selectedNodeId === edge.source.id || selectedNodeId === edge.target.id

              if (selectedNodeId && !selected) return null
              if (hasQuery && !edge.source.matchesQuery && !edge.target.matchesQuery) return null

              const midX = (edge.source.x + edge.target.x) / 2
              const midY = (edge.source.y + edge.target.y) / 2
              const awayX = midX + (midX - center.x) * 0.34 + Math.sin(index * 1.7) * 12
              const awayY = midY + (midY - center.y) * 0.52 - Math.cos(index * 1.3) * 10
              const softX = midX + (midX - center.x) * 0.18 + Math.sin(index * 1.7) * 10
              const softY = midY + (midY - center.y) * 0.32 - Math.cos(index * 1.3) * 8
              const curveX = selected ? awayX : softX
              const curveY = selected ? awayY : softY

              return (
                <path
                  key={`peer-${edge.id}`}
                  d={`M ${edge.source.x} ${edge.source.y} Q ${curveX} ${curveY} ${edge.target.x} ${edge.target.y}`}
                  fill="none"
                  stroke={selected ? 'rgba(26,24,21,0.34)' : hasQuery ? 'rgba(26,24,21,0.20)' : 'rgba(84,72,58,0.16)'}
                  strokeWidth={selected ? 1.22 : 0.85}
                  strokeDasharray={selected ? 'none' : '6 10'}
                  strokeLinecap="round"
                />
              )
            })}

            <circle cx={center.x} cy={center.y} r={compact ? 40 : 76} fill="rgba(244,239,230,0.16)" />
            <circle cx={center.x} cy={center.y} r={compact ? 30 : 58} fill="rgba(255,252,246,0.18)" />
            <circle cx={center.x} cy={center.y} r={compact ? 30 : 58} fill="none" stroke="rgba(84,72,58,0.075)" strokeWidth="0.9" />
            <circle cx={center.x} cy={center.y} r={compact ? 22 : 44} fill="rgba(255,252,246,0.24)" />
          </svg>

          <button
            type="button"
            onPointerDown={(event) => beginDrag('me', event)}
            onClick={() => {
              if (draggedRef.current) return
              onClearSelection()
            }}
            style={{
              position: 'absolute',
              left: `${center.x / 10}%`,
              top: `${center.y / 5.9}%`,
              transform: 'translate(-50%, -50%)',
              width: compact ? 56 : 104,
              height: compact ? 56 : 104,
              borderRadius: 999,
              border: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              cursor: 'grab',
              boxShadow: 'none',
              zIndex: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compact ? 3 : 0,
              padding: 0,
              touchAction: 'none',
            }}
            title={`Center: ${me.name}`}
            aria-label={`Center: ${me.name}`}
          >
            <Avatar
              name={me.name}
              src={me.avatarUrl}
              size={compact ? (me.avatarUrl ? 46 : 40) : (me.avatarUrl ? 88 : 78)}
              rounded={999}
              style={{
                border: me.avatarUrl
                  ? compact ? '2px solid rgba(255,252,246,0.96)' : '3px solid rgba(255,252,246,0.96)'
                  : '0.5px solid rgba(84,72,58,0.18)',
                background: me.avatarUrl
                  ? 'var(--paper)'
                  : 'linear-gradient(135deg, rgba(238,242,255,0.96), rgba(255,252,246,0.98))',
                color: 'var(--indigo, #4455c7)',
                boxShadow: me.avatarUrl
                  ? compact
                    ? '0 4px 16px rgba(26,24,21,0.18), 0 0 0 4px rgba(255,252,246,0.60)'
                    : '0 18px 48px rgba(26,24,21,0.18), 0 0 0 9px rgba(255,252,246,0.42)'
                  : compact
                    ? '0 4px 12px rgba(26,24,21,0.10), 0 0 0 4px rgba(255,252,246,0.60)'
                    : '0 16px 42px rgba(26,24,21,0.10), 0 0 0 9px rgba(255,252,246,0.42)',
              }}
            />
            {compact && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--signal, #D8442B)',
                fontFamily: "'IBM Plex Sans', sans-serif",
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                You
              </span>
            )}
          </button>

          {layoutNodes.map((node) => {
            const selected = selectedNodeId === node.id
            const related = selectedPeerIds.has(node.id)
            const muted = Boolean(selectedNodeId) && !selected && !related
            const searchHit = hasQuery && node.matchesQuery
            const searchMuted = hasQuery && !node.matchesQuery

            return (
              <StageCard
                key={node.id}
                node={node}
                selected={selected}
                related={related}
                muted={muted}
                searchHit={searchHit}
                searchMuted={searchMuted}
                selectedName={selectedNode?.name}
                total={layoutNodes.length}
                secondDegree={node.degree === 'second'}
                compact={compact}
                onPointerDown={(event) => beginDrag(node.id, event)}
                onSelect={() => {
                  if (draggedRef.current) return
                  onSelectNode(node)
                }}
              />
            )
          })}
        </div>
      )}

      {!showEmpty && (
        <div
          style={{
            position: 'absolute',
            right: 18,
            bottom: 18,
            zIndex: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 8px 7px 10px',
            borderRadius: 999,
            border: '0.5px solid var(--rule)',
            background: 'rgba(244,239,230,0.88)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 14px 38px rgba(26,24,21,0.08)',
            color: 'var(--ink-muted)',
            fontSize: 11.5,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>Ctrl / Alt + scroll to zoom</span>
          <button
            type="button"
            onClick={resetGraph}
            style={{
              border: '0.5px solid rgba(84,72,58,0.22)',
              background: 'var(--paper-soft)',
              color: 'var(--ink)',
              borderRadius: 999,
              padding: '5px 9px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Reset graph
          </button>
        </div>
      )}
    </motion.div>
  )
}
