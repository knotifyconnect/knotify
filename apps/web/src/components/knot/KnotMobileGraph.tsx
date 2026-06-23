import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KnotGraphNode, KnotHealthState } from './KnotForceGraph'

// ── Types ─────────────────────────────────────────────────────────────────────
export type MeNode = { id: 'me'; name: string; avatarUrl: string | null }

const HEALTH: Record<KnotHealthState, string> = {
  warm: '#4caf7d',
  cooling: '#c9922a',
  cold: '#D84428',
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
export function MobileBottomSheet({
  title,
  subtitle,
  peekHeight = 64,
  defaultHeight = 360,
  children,
}: {
  title?: string
  subtitle?: string
  peekHeight?: number
  defaultHeight?: number
  children: React.ReactNode
}) {
  const MAX_H = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.84)
  // Start collapsed — only the labelled handle is visible; user drags to open
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
        bottom: 88,
        left: 0,
        right: 0,
        height,
        background: 'var(--paper)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -6px 32px rgba(26,24,21,0.16)',
        zIndex: 9900,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: dragRef.current ? 'none' : 'height 0.26s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* Drag handle + label — always on top, never scrolls, tap to toggle */}
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
          // A tap (no drag) toggles between peek and default
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
          cursor: 'ns-resize',
          touchAction: 'none',
          userSelect: 'none',
          borderBottom: '0.5px solid var(--rule)',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 8 }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(26,24,21,0.22)' }} />
        </div>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              {isOpen ? 'Tap to close' : subtitle ?? 'Tap to open'}
            </span>
          </div>
        )}
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
  if (!open) return null
  return createPortal(
    <div
      onClick={onClose}
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

export function KnotMobileGraph({
  me,
  nodes,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
}: {
  me: MeNode
  nodes: KnotGraphNode[]
  selectedNodeId: string | null
  onSelectNode: (node: KnotGraphNode) => void
  onClearSelection: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imgFail, setImgFail] = useState(new Set<string>())

  const direct = nodes.filter(n => n.degree !== 'second')
  const second = nodes.filter(n => n.degree === 'second')
  const r1Nodes = direct.slice(0, 10)
  const r2Nodes = [...direct.slice(10), ...second]
  const r1Pos = ring(r1Nodes.length, 132, CX, CY)
  const r2Pos = ring(r2Nodes.length, 208, CX, CY)

  const positioned = [
    ...r1Nodes.map((n, i) => ({ n, x: r1Pos[i].x, y: r1Pos[i].y, r: 22 })),
    ...r2Nodes.map((n, i) => ({ n, x: r2Pos[i].x, y: r2Pos[i].y, r: 17 })),
  ]

  function onBgDown(e: React.PointerEvent<SVGSVGElement>) {
    if ((e.target as Element).closest('[data-node]')) return
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function onBgMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panRef.current.moved = true
    setPan({ x: panRef.current.ox + dx, y: panRef.current.oy + dy })
  }
  function onBgUp() {
    if (panRef.current && !panRef.current.moved) onClearSelection()
    panRef.current = null
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerCancel={onBgUp}
    >
      <g transform={`translate(${pan.x},${pan.y})`}>

        {/* Dimming overlay when a node is selected */}
        {selectedNodeId && (
          <rect
            x={-pan.x} y={-pan.y} width={VW} height={VH}
            fill="rgba(26,24,21,0.18)"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Curved lines from center to each node */}
        {positioned.map(({ n, x, y }) => (
          <path
            key={`ln-${n.id}`}
            d={curvedPath(CX, CY, x, y)}
            fill="none"
            stroke={n.id === selectedNodeId ? 'rgba(216,68,43,0.35)' : 'rgba(84,72,58,0.16)'}
            strokeWidth={n.id === selectedNodeId ? 1.6 : 0.8}
            strokeDasharray={n.degree === 'second' ? '5 5' : undefined}
            strokeLinecap="round"
          />
        ))}

        {/* Center halos */}
        <circle cx={CX} cy={CY} r={56} fill="rgba(244,239,230,0.22)" />
        <circle cx={CX} cy={CY} r={44} fill="rgba(255,252,246,0.28)" />
        <circle cx={CX} cy={CY} r={44} fill="none" stroke="rgba(84,72,58,0.07)" strokeWidth={0.8} />

        {/* Connection nodes */}
        {positioned.map(({ n, x, y, r }) => {
          const sel = n.id === selectedNodeId
          const hc = n.healthState ? HEALTH[n.healthState] : null
          const hasImg = !!n.avatarUrl && !imgFail.has(n.id)
          const clipId = `c-${n.id}`
          const label = n.name.split(' ')[0].slice(0, 9)
          const labelW = Math.max(22, label.length * 5.2 + 8)
          // Scale up selected node
          const scale = sel ? 1.55 : 1
          const scaledR = r * scale

          return (
            <g
              key={n.id}
              data-node={n.id}
              transform={`translate(${x},${y}) scale(${scale})`}
              onClick={(e) => { e.stopPropagation(); sel ? onClearSelection() : onSelectNode(n) }}
              style={{ cursor: 'pointer', transformOrigin: `${x}px ${y}px` }}
            >
              {/* Outer selection / health ring */}
              {sel && <circle cx={0} cy={0} r={r + 5} fill="rgba(216,68,43,0.12)" stroke="#D8442B" strokeWidth={1.5} />}
              {hc && !sel && <circle cx={0} cy={0} r={r + 3} fill="none" stroke={hc} strokeWidth={1.5} />}

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
                fontWeight={sel ? 700 : 600}
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
  )
}
