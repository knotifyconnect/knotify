import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KnotGraphNode, KnotHealthState } from './KnotForceGraph'
import {
  edgeEndpointsForRects,
  MOBILE_EXPANDED_BOUNDS,
  MOBILE_SECOND_DEGREE_SIZE,
  layoutExpandedNodeSlots,
  rectForPoint,
} from './knotGraphLayout'

// ── Types ─────────────────────────────────────────────────────────────────────
export type MeNode = { id: 'me'; name: string; avatarUrl: string | null }

const HEALTH: Record<KnotHealthState, string> = {
  warm: '#4caf7d',
  cooling: '#c9922a',
  cold: '#D84428',
  new: '#1F6B5E',
}

/** SVG badge cluster at a node's top-right: booked coffee / open ask / follow-up. */
function SvgNodeBadges({ node, r }: { node: KnotGraphNode; r: number }) {
  const badges: Array<{ key: string; bg: string; glyph: string }> = []
  if (node.hasCoffee) badges.push({ key: 'coffee', bg: '#1F6B5E', glyph: '☕' })
  if (node.hasOpenAsk) badges.push({ key: 'ask', bg: '#C8941F', glyph: '?' })
  if (node.needsFollowUp) badges.push({ key: 'followup', bg: '#D8442B', glyph: '↩' })
  if (!badges.length) return null
  const br = 6.5
  const bx = r * 0.72
  const by = -r * 0.72
  return (
    <g style={{ pointerEvents: 'none' }}>
      {badges.slice(0, 2).map((b, i) => (
        <g key={b.key} transform={`translate(${bx - i * (br * 2 + 1.5)}, ${by})`}>
          <circle r={br} fill={b.bg} stroke="rgba(255,252,246,0.95)" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={b.glyph === '☕' ? 6.5 : 8}
            fontFamily="'IBM Plex Sans', sans-serif" fontWeight={700} fill="#fff" y={0.5}>
            {b.glyph}
          </text>
        </g>
      ))}
    </g>
  )
}

function tabColor(tab: string) {
  if (tab === 'Incoming') return '#1F6B5E'
  if (tab === 'Sent') return '#D8442B'
  return 'rgba(84,72,58,0.55)'
}

// Evenly space n points on a circle
function ring(n: number, r: number, cx: number, cy: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })
}

// Quadratic bezier path between two points with a gentle perpendicular curve
function curvedPath(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // Perpendicular unit vector, curved outward by ~18% of length
  const off = len * 0.18
  const cpx = mx + (-dy / len) * off
  const cpy = my + (dx / len) * off
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
}

// ── Generic draggable bottom sheet (portal) ────────────────────────────────
// Fully hidden when collapsed — only a small grab handle peeks above the tab bar.
export function MobileBottomSheet({
  peekHeight = 20,
  defaultHeight = 360,
  children,
}: {
  peekHeight?: number
  defaultHeight?: number
  children: React.ReactNode
}) {
  const MAX_H = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.84)
  const [height, setHeight] = useState(peekHeight)
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null)

  const isOpen = height > peekHeight + 24

  // Snap to the nearest of three rest positions on release
  function snap(h: number) {
    const points = [peekHeight, defaultHeight, MAX_H]
    return points.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a))
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(64px + env(safe-area-inset-bottom))',
        left: 0,
        right: 0,
        height,
        background: 'var(--paper)',
        borderRadius: '20px 20px 0 0',
        boxShadow: isOpen ? '0 -6px 32px rgba(26,24,21,0.16)' : '0 -2px 10px rgba(26,24,21,0.06)',
        zIndex: 9900,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: dragRef.current ? 'none' : 'height 0.26s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* Small grab handle — never scrolls, tap or drag to open */}
      <div
        onPointerDown={(e) => {
          dragRef.current = { startY: e.clientY, startH: height, moved: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const delta = e.clientY - dragRef.current.startY
          if (Math.abs(delta) > 4) dragRef.current.moved = true
          const newH = Math.max(peekHeight, Math.min(MAX_H, dragRef.current.startH - delta))
          setHeight(newH)
        }}
        onPointerUp={() => {
          if (!dragRef.current) return
          if (!dragRef.current.moved) {
            setHeight(isOpen ? peekHeight : defaultHeight)
          } else {
            setHeight(snap(height))
          }
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
        style={{
          flexShrink: 0,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(26,24,21,0.24)' }} />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

// ── Node overlay card (portal) — replaces bottom sheet for node taps ────────
export function MobileNodeOverlay({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const backdropTapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  if (!open) return null
  return createPortal(
    <div
      onClick={onClose}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return
        backdropTapRef.current = { x: e.clientX, y: e.clientY, moved: false }
      }}
      onPointerMove={(e) => {
        const tap = backdropTapRef.current
        if (!tap) return
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) tap.moved = true
      }}
      onPointerUp={(e) => {
        const tap = backdropTapRef.current
        backdropTapRef.current = null
        if (!tap || tap.moved || e.target !== e.currentTarget) return
        onClose()
      }}
      onPointerCancel={() => {
        backdropTapRef.current = null
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(26,24,21,0.52)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: 24,
          width: '100%',
          maxWidth: 360,
          maxHeight: '82vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as any,
          boxShadow: '0 24px 64px rgba(26,24,21,0.28)',
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

// ── SVG graph ─────────────────────────────────────────────────────────────────
const VW = 390
const VH = 600
const CX = VW / 2
const CY = VH / 2
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3

export function KnotMobileGraph({
  me,
  nodes,
  selectedNodeId,
  query = '',
  onSelectNode,
  onClearSelection,
  expandedRootId = null,
  expandedRootName = null,
  onCollapse,
  onResetGraph,
  resetToken = 0,
}: {
  me: MeNode
  nodes: KnotGraphNode[]
  selectedNodeId: string | null
  query?: string
  onSelectNode: (node: KnotGraphNode) => void
  onClearSelection: () => void
  expandedRootId?: string | null
  expandedRootName?: string | null
  onCollapse?: () => void
  onResetGraph?: () => void
  resetToken?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null)
  const nodeDragRef = useRef<{
    nodeId: string
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const suppressNodeClickRef = useRef(false)
  // Active touch points + pinch gesture state for two-finger zoom.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)
  const layoutFrameRef = useRef<number | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [imgFail, setImgFail] = useState(new Set<string>())
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({})

  const direct = nodes.filter(n => n.degree !== 'second')
  const second = nodes.filter(n => n.degree === 'second')
  // When second-degree nodes are present we are in "expanded" mode: gray out the
  // first-degree knot (except the expanded root) and let the new path stand out.
  const expandedMode = second.length > 0
  // A direct node is dimmed in expanded mode unless it's the root we expanded from
  const isDimmed = (n: KnotGraphNode) => expandedMode && n.degree !== 'second' && n.id !== expandedRootId
  const r1Nodes = direct.slice(0, 10)
  const r2Nodes = direct.slice(10)
  const r1Pos = ring(r1Nodes.length, 132, CX, CY)
  const r2Pos = ring(r2Nodes.length, 208, CX, CY)

  const directPositioned = [
    ...r1Nodes.map((n, i) => ({ n, x: dragPositions[n.id]?.x ?? r1Pos[i].x, y: dragPositions[n.id]?.y ?? r1Pos[i].y, r: 22 })),
    ...r2Nodes.map((n, i) => ({ n, x: dragPositions[n.id]?.x ?? r2Pos[i].x, y: dragPositions[n.id]?.y ?? r2Pos[i].y, r: 17 })),
  ]

  // In expanded mode, second-degree edges originate from the expanded root node
  // (not "me"), so it's visually clear they belong to that person's network.
  const rootEntry = expandedRootId ? directPositioned.find(p => p.n.id === expandedRootId) : undefined
  const rootPos = rootEntry ? { x: rootEntry.x, y: rootEntry.y } : { x: CX, y: CY }
  const secondSlots = rootEntry
    ? layoutExpandedNodeSlots({
        root: rootPos,
        center: { x: CX, y: CY },
        total: second.length,
        bounds: MOBILE_EXPANDED_BOUNDS,
        size: MOBILE_SECOND_DEGREE_SIZE,
        parentSize: { width: rootEntry.r * 2, height: rootEntry.r * 2 },
        avoid: directPositioned.map((item) => rectForPoint(item, MOBILE_SECOND_DEGREE_SIZE)),
        maxColumns: Math.min(4, Math.max(2, Math.ceil(Math.sqrt(second.length)))),
        rootGapX: 62,
        rootGapY: 62,
        columnGap: 16,
        rowGap: 16,
        constrainToBounds: false,
      })
    : ring(second.length, 208, CX, CY)

  const positioned = [
    ...directPositioned,
    ...second.map((n, i) => ({ n, x: dragPositions[n.id]?.x ?? secondSlots[i].x, y: dragPositions[n.id]?.y ?? secondSlots[i].y, r: 17 })),
  ]
  const positionedSignature = positioned.map(({ n, x, y }) => `${n.id}:${Math.round(x)}:${Math.round(y)}`).join('|')
  const layoutFitSignature = nodes.map((node) => node.id).join('|')

  function fitViewport(items = positioned, options?: { maxScale?: number; targetY?: number }) {
    const withCenter = [{ x: CX, y: CY, r: 42 }, ...items]
    const minX = Math.min(...withCenter.map((item) => item.x - item.r - 18))
    const maxX = Math.max(...withCenter.map((item) => item.x + item.r + 18))
    const minY = Math.min(...withCenter.map((item) => item.y - item.r - 28))
    const maxY = Math.max(...withCenter.map((item) => item.y + item.r + 42))
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const nextScale = Math.max(MIN_ZOOM, Math.min((VW - 42) / width, (VH - 128) / height, options?.maxScale ?? 1))
    const focusX = (minX + maxX) / 2
    const focusY = (minY + maxY) / 2
    setScale(nextScale)
    setPan({
      x: CX - nextScale * focusX - (1 - nextScale) * CX,
      y: (options?.targetY ?? CY) - nextScale * focusY - (1 - nextScale) * CY,
    })
  }

  useEffect(() => {
    const liveIds = new Set(nodes.map((node) => node.id))
    setDragPositions((prev) => {
      let changed = false
      const next: Record<string, { x: number; y: number }> = {}
      for (const [id, point] of Object.entries(prev)) {
        if (liveIds.has(id)) {
          next[id] = point
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [nodes])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const requestLayout = () => {
      if (layoutFrameRef.current !== null) return
      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null
        setLayoutRevision((value) => value + 1)
      })
    }
    const resizeObserver = new ResizeObserver(requestLayout)
    resizeObserver.observe(svg)
    window.addEventListener('resize', requestLayout)
    window.addEventListener('orientationchange', requestLayout)
    return () => {
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current)
        layoutFrameRef.current = null
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', requestLayout)
      window.removeEventListener('orientationchange', requestLayout)
    }
  }, [])

  const expandedSignature = second.map((node) => node.id).sort().join('|')

  useEffect(() => {
    if (!expandedMode || !rootEntry) return

    const focusNodes = positioned.filter((item) => item.n.degree === 'second' || item.n.id === expandedRootId)
    const minX = Math.min(...focusNodes.map((item) => item.x - item.r - 18))
    const maxX = Math.max(...focusNodes.map((item) => item.x + item.r + 18))
    const minY = Math.min(...focusNodes.map((item) => item.y - item.r - 18))
    const maxY = Math.max(...focusNodes.map((item) => item.y + item.r + 30))
    const focusX = (minX + maxX) / 2
    const focusY = (minY + maxY) / 2

    setPan({ x: -scale * (focusX - CX), y: -scale * (focusY - CY) })
    // Refit only when expansion or container shape changes; user pan remains free afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRootId, expandedSignature, layoutRevision])

  useEffect(() => {
    if (expandedMode) return
    fitViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutFitSignature, layoutRevision, resetToken])

  // Search highlighting — mirrors the desktop graph: matching nodes stand out,
  // the rest dim, and the view pans to the first match.
  const normalizedQuery = query.trim().toLowerCase()
  const hasQuery = normalizedQuery.length > 0
  const prevQueryRef = useRef('')
  useEffect(() => {
    const prevHadQuery = prevQueryRef.current.trim().length > 0
    prevQueryRef.current = query

    if (hasQuery) {
      fitViewport(positioned, { maxScale: 1 })
      return
    }
    // Recenter when the query is cleared.
    if (prevHadQuery) fitViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, positionedSignature])

  function clientToGraphPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    const viewportX = ((clientX - rect.left) / rect.width) * VW
    const viewportY = ((clientY - rect.top) / rect.height) * VH
    const pannedX = viewportX - pan.x
    const pannedY = viewportY - pan.y
    return {
      x: CX + (pannedX - CX) / scale,
      y: CY + (pannedY - CY) / scale,
    }
  }

  function onNodeDown(e: React.PointerEvent<SVGGElement>, nodeId: string, x: number, y: number) {
    e.stopPropagation()
    const point = clientToGraphPoint(e.clientX, e.clientY)
    if (!point) return

    suppressNodeClickRef.current = false
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    panRef.current = null
    nodeDragRef.current = {
      nodeId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: x - point.x,
      offsetY: y - point.y,
      moved: false,
    }
  }

  function onNodeMove(e: React.PointerEvent<SVGGElement>) {
    const drag = nodeDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.stopPropagation()
    e.preventDefault()

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size > 1 || pinchRef.current) {
      if (drag.moved) {
        window.setTimeout(() => {
          suppressNodeClickRef.current = false
        }, 0)
      }
      nodeDragRef.current = null
      return
    }

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true
      suppressNodeClickRef.current = true
    }

    if (!drag.moved) return
    const point = clientToGraphPoint(e.clientX, e.clientY)
    if (!point) return
    setDragPositions((prev) => ({
      ...prev,
      [drag.nodeId]: { x: point.x + drag.offsetX, y: point.y + drag.offsetY },
    }))
  }

  function onNodeUp(e: React.PointerEvent<SVGGElement>) {
    const drag = nodeDragRef.current
    if (drag?.pointerId === e.pointerId) {
      e.stopPropagation()
      if (drag.moved) e.preventDefault()
      if (drag.moved) {
        suppressNodeClickRef.current = true
        window.setTimeout(() => {
          suppressNodeClickRef.current = false
        }, 0)
      }
      nodeDragRef.current = null
    }
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  function onBgDown(e: React.PointerEvent<SVGSVGElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    svgRef.current?.setPointerCapture(e.pointerId)

    // Second finger down → begin a pinch-zoom and cancel any in-flight pan.
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: scale }
      panRef.current = null
      const activeDrag = nodeDragRef.current
      if (activeDrag?.moved) {
        window.setTimeout(() => {
          suppressNodeClickRef.current = false
        }, 0)
      }
      nodeDragRef.current = null
      return
    }

    if ((e.target as Element).closest('[data-node],[data-graph-control],button')) return
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y, moved: false }
  }
  function onBgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // Two-finger pinch: scale relative to the gesture's starting spread.
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const next = pinchRef.current.startScale * (dist / pinchRef.current.startDist)
      setScale(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)))
      return
    }

    if (!panRef.current) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panRef.current.moved = true
    setPan({ x: panRef.current.ox + dx, y: panRef.current.oy + dy })
  }
  function onBgUp(e: React.PointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (panRef.current && !panRef.current.moved) onClearSelection()
    panRef.current = null
  }

  function resetGraph() {
    panRef.current = null
    nodeDragRef.current = null
    pinchRef.current = null
    pointersRef.current.clear()
    suppressNodeClickRef.current = false
    setDragPositions({})
    fitViewport(positioned, { maxScale: 1 })
    onClearSelection()
    onResetGraph?.()
  }

  return (
    <>
    {/* Expanded-mode banner: makes the state and exit obvious */}
    {expandedMode && expandedRootName && (
      <div
        style={{
          position: 'absolute',
          top: 58,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 8px 7px 14px',
          borderRadius: 999,
          background: 'rgba(244,239,230,0.92)',
          border: '0.5px solid rgba(31,107,94,0.35)',
          boxShadow: '0 10px 30px rgba(26,24,21,0.10)',
          backdropFilter: 'blur(10px)',
          maxWidth: 'calc(100% - 24px)',
        }}
      >
        <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Exploring <b style={{ color: 'var(--verd)' }}>{expandedRootName.split(' ')[0]}</b>'s network
        </span>
        <button
          type="button"
          onClick={onCollapse}
          style={{
            border: 'none',
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 999,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Collapse
        </button>
      </div>
    )}
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerCancel={onBgUp}
    >
      <g transform={`translate(${pan.x},${pan.y}) translate(${CX},${CY}) scale(${scale}) translate(${-CX},${-CY})`}>

        {/* Dimming overlay when a node is selected — oversized so it covers the
            viewport regardless of current pan/zoom. */}
        {selectedNodeId && (
          <rect
            x={-VW * 2} y={-VH * 2} width={VW * 5} height={VH * 5}
            fill="rgba(26,24,21,0.18)"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Curved lines: 1st degree from "me", 2nd degree from the expanded root */}
        {positioned.map(({ n, x, y, r }) => {
          const isSecond = n.degree === 'second'
          const from = isSecond ? rootPos : { x: CX, y: CY }
          const fromRadius = isSecond ? rootEntry?.r ?? 22 : 34
          const endpoints = edgeEndpointsForRects(
            from,
            { width: fromRadius * 2, height: fromRadius * 2 },
            { x, y },
            { width: r * 2, height: r * 2 },
          )
          const sel = n.id === selectedNodeId
          const searchMuted = hasQuery && !n.matchesQuery
          return (
            <path
              key={`ln-${n.id}`}
              data-graph-line={n.id}
              d={curvedPath(endpoints.source.x, endpoints.source.y, endpoints.target.x, endpoints.target.y)}
              fill="none"
              stroke={sel ? 'rgba(216,68,43,0.35)' : isSecond ? 'rgba(31,107,94,0.40)' : 'rgba(84,72,58,0.16)'}
              strokeWidth={sel ? 1.6 : isSecond ? 1.2 : 0.8}
              strokeDasharray={isSecond ? '5 4' : undefined}
              strokeLinecap="round"
              opacity={searchMuted ? 0.04 : isDimmed(n) ? 0.18 : 1}
            />
          )
        })}

        {/* Center halos */}
        <circle cx={CX} cy={CY} r={56} fill="rgba(244,239,230,0.22)" />
        <circle cx={CX} cy={CY} r={44} fill="rgba(255,252,246,0.28)" />
        <circle cx={CX} cy={CY} r={44} fill="none" stroke="rgba(84,72,58,0.07)" strokeWidth={0.8} />

        {/* Connection nodes */}
        {positioned.map(({ n, x, y, r }) => {
          const sel = n.id === selectedNodeId
          const searchHit = hasQuery && n.matchesQuery
          const searchMuted = hasQuery && !n.matchesQuery
          const hc = n.healthState ? HEALTH[n.healthState] : null
          const hasImg = !!n.avatarUrl && !imgFail.has(n.id)
          const clipId = `c-${n.id}`
          const label = n.name.split(' ')[0].slice(0, 9)
          const labelW = Math.max(22, label.length * 5.2 + 8)
          // Scale up the selected node, and emphasize search matches
          const nodeScale = sel ? 1.55 : searchHit && !sel ? 1.3 : 1

          return (
            <g
              key={n.id}
              data-node={n.id}
              transform={`translate(${x},${y}) scale(${nodeScale})`}
              onPointerDown={(e) => onNodeDown(e, n.id, x, y)}
              onPointerMove={onNodeMove}
              onPointerUp={onNodeUp}
              onPointerCancel={onNodeUp}
              onClick={(e) => {
                e.stopPropagation()
                if (suppressNodeClickRef.current) return
                sel ? onClearSelection() : onSelectNode(n)
              }}
              style={{ cursor: 'pointer', touchAction: 'none', transformOrigin: `${x}px ${y}px`, opacity: searchMuted ? 0.06 : isDimmed(n) ? 0.28 : 1, transition: 'opacity 0.2s' }}
            >
              {/* Outer selection / search-match / expanded-root / health ring */}
              {sel && <circle cx={0} cy={0} r={r + 5} fill="rgba(216,68,43,0.12)" stroke="#D8442B" strokeWidth={1.5} />}
              {!sel && searchHit && <circle cx={0} cy={0} r={r + 5} fill="rgba(26,24,21,0.06)" stroke="#1A1815" strokeWidth={1.75} />}
              {!sel && n.id === expandedRootId && expandedMode && (
                <circle cx={0} cy={0} r={r + 5} fill="rgba(31,107,94,0.12)" stroke="#1F6B5E" strokeWidth={2} />
              )}
              {hc && !sel && n.id !== expandedRootId && <circle cx={0} cy={0} r={r + 3} fill="none" stroke={hc} strokeWidth={1.5} />}

              <defs>
                <clipPath id={clipId}>
                  <circle cx={0} cy={0} r={r} />
                </clipPath>
              </defs>

              <circle cx={0} cy={0} r={r} fill="#F4EFE6" />
              {hasImg ? (
                <image
                  href={n.avatarUrl!}
                  x={-r} y={-r} width={r * 2} height={r * 2}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                  onError={() => setImgFail(p => { const s = new Set(p); s.add(n.id); return s })}
                />
              ) : (
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.58} fontFamily="'Fraunces', Georgia, serif" fontStyle="italic"
                  fontWeight={600} fill={tabColor(n.tab)}>
                  {n.name[0]}
                </text>
              )}

              <circle cx={0} cy={0} r={r} fill="none"
                stroke={sel ? '#D8442B' : hc ?? tabColor(n.tab)}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={n.degree === 'second' && !sel ? '4 3' : undefined}
                opacity={n.degree === 'second' && !sel ? 0.6 : 1}
              />

              <SvgNodeBadges node={n} r={r} />

              {/* Name label — rect behind text */}
              <rect
                x={-labelW / 2} y={r + 4}
                width={labelW} height={12}
                rx={3}
                fill="rgba(244,239,230,0.92)"
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={0} y={r + 13}
                textAnchor="middle"
                fontSize={8}
                fontFamily="'IBM Plex Sans', sans-serif"
                fontWeight={sel || searchHit ? 700 : 600}
                fill={sel ? '#D8442B' : '#1A1815'}
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Me — on top */}
        {(() => {
          const MR = 34
          const sel = selectedNodeId === null
          return (
            <g onClick={(e) => { e.stopPropagation(); onClearSelection() }} style={{ cursor: 'pointer' }}>
              <circle cx={CX} cy={CY} r={MR + 5} fill="none" stroke="rgba(216,68,43,0.18)" strokeWidth={1} />
              <circle cx={CX} cy={CY} r={MR} fill="#F4EFE6" />
              {me.avatarUrl && (
                <>
                  <defs>
                    <clipPath id="clip-me-mg">
                      <circle cx={CX} cy={CY} r={MR} />
                    </clipPath>
                  </defs>
                  <image
                    href={me.avatarUrl}
                    x={CX - MR} y={CY - MR} width={MR * 2} height={MR * 2}
                    clipPath="url(#clip-me-mg)"
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              )}
              {!me.avatarUrl && (
                <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
                  fontSize={20} fontFamily="'Fraunces', Georgia, serif" fontStyle="italic"
                  fontWeight={600} fill="#4455c7">
                  {me.name[0]}
                </text>
              )}
              <circle cx={CX} cy={CY} r={MR} fill="none" stroke="#D8442B" strokeWidth={2} />
              <rect x={CX - 14} y={CY + MR + 4} width={28} height={12} rx={3} fill="rgba(216,68,43,0.10)" />
              <text x={CX} y={CY + MR + 13} textAnchor="middle"
                fontSize={8} fontFamily="'IBM Plex Sans', sans-serif"
                fontWeight={700} fill="#D8442B">
                You
              </text>
            </g>
          )
        })()}
      </g>
    </svg>
    </>
  )
}
