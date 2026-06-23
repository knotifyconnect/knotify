import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KnotGraphNode, KnotHealthState } from './KnotForceGraph'

// ── Types ─────────────────────────────────────────────────────────────────────
type MeNode = { id: 'me'; name: string; avatarUrl: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────
const VW = 390
const VH = 600
const CX = VW / 2
const CY = VH / 2

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

// Place n points evenly on a circle of given radius
function ring(n: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }
  })
}

// ── Bottom sheet panel (portal) ────────────────────────────────────────────
export function MobileBottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const [height, setHeight] = useState(300)
  const DEFAULT_H = 300
  const MAX_H = Math.round(window.innerHeight * 0.78)
  const MIN_H = 160
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  if (!open) return null

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
        boxShadow: '0 -8px 40px rgba(26,24,21,0.20)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: dragRef.current ? 'none' : 'height 0.22s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* ── Drag handle — not in the scroll area ─── */}
      <div
        onPointerDown={(e) => {
          dragRef.current = { startY: e.clientY, startH: height }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return
          const newH = Math.max(MIN_H, Math.min(MAX_H, dragRef.current.startH - (e.clientY - dragRef.current.startY)))
          setHeight(newH)
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return
          const dy = dragRef.current.startY - e.clientY
          if (dy < -60) {
            onClose()
          } else if (height > DEFAULT_H * 1.35) {
            setHeight(MAX_H)
          } else {
            setHeight(DEFAULT_H)
          }
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
        style={{
          flexShrink: 0,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ns-resize',
          touchAction: 'none',
          userSelect: 'none',
          borderBottom: '0.5px solid var(--rule)',
        }}
      >
        <div style={{
          width: 36,
          height: 4,
          borderRadius: 999,
          background: 'rgba(26,24,21,0.22)',
        }} />
      </div>

      {/* ── Scrollable content ─── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

// ── Mobile graph ──────────────────────────────────────────────────────────────
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

  // Layout: first ring ≤10 nodes at r=130, overflow to second ring at r=205
  const direct = nodes.filter(n => n.degree !== 'second')
  const second = nodes.filter(n => n.degree === 'second')

  const r1Nodes = direct.slice(0, 10)
  const r2Nodes = [...direct.slice(10), ...second]
  const r1Pos = ring(r1Nodes.length, 130)
  const r2Pos = ring(r2Nodes.length, 205)

  const positioned = [
    ...r1Nodes.map((n, i) => ({ n, x: r1Pos[i].x, y: r1Pos[i].y, r: 22, ring: 1 })),
    ...r2Nodes.map((n, i) => ({ n, x: r2Pos[i].x, y: r2Pos[i].y, r: 17, ring: 2 })),
  ]

  function onSvgPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if ((e.target as Element).closest('[data-node]')) return
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y, moved: false }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panRef.current.moved = true
    setPan({ x: panRef.current.ox + dx, y: panRef.current.oy + dy })
  }
  function onSvgPointerUp() {
    if (panRef.current && !panRef.current.moved) onClearSelection()
    panRef.current = null
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
    >
      <g transform={`translate(${pan.x},${pan.y})`}>

        {/* Lines */}
        {positioned.map(({ n, x, y }) => (
          <line
            key={`ln-${n.id}`}
            x1={CX} y1={CY} x2={x} y2={y}
            stroke={n.id === selectedNodeId ? 'rgba(216,68,43,0.28)' : 'rgba(84,72,58,0.14)'}
            strokeWidth={n.id === selectedNodeId ? 1.5 : 0.7}
            strokeDasharray={n.degree === 'second' ? '5 5' : undefined}
          />
        ))}

        {/* Center halos */}
        <circle cx={CX} cy={CY} r={56} fill="rgba(244,239,230,0.20)" />
        <circle cx={CX} cy={CY} r={44} fill="rgba(255,252,246,0.28)" />
        <circle cx={CX} cy={CY} r={44} fill="none" stroke="rgba(84,72,58,0.07)" strokeWidth={0.8} />

        {/* Connection nodes */}
        {positioned.map(({ n, x, y, r }) => {
          const sel = n.id === selectedNodeId
          const hc = n.healthState ? HEALTH[n.healthState] : null
          const hasImg = !!n.avatarUrl && !imgFail.has(n.id)
          const clipId = `c-${n.id}`
          const label = n.name.split(' ')[0].slice(0, 9)
          const labelW = Math.max(24, label.length * 5.4 + 8)

          return (
            <g
              key={n.id}
              data-node={n.id}
              onClick={(e) => { e.stopPropagation(); sel ? onClearSelection() : onSelectNode(n) }}
              style={{ cursor: 'pointer' }}
            >
              {/* Outer selection / health ring */}
              {sel && <circle cx={x} cy={y} r={r + 5} fill="rgba(216,68,43,0.10)" stroke="#D8442B" strokeWidth={1.5} />}
              {hc && !sel && <circle cx={x} cy={y} r={r + 3} fill="none" stroke={hc} strokeWidth={1.5} />}

              <defs>
                <clipPath id={clipId}>
                  <circle cx={x} cy={y} r={r} />
                </clipPath>
              </defs>

              {/* Avatar fill */}
              <circle cx={x} cy={y} r={r} fill="#F4EFE6" />
              {hasImg ? (
                <image
                  href={n.avatarUrl!}
                  x={x - r} y={y - r} width={r * 2} height={r * 2}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                  onError={() => setImgFail(p => { const s = new Set(p); s.add(n.id); return s })}
                />
              ) : (
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.58} fontFamily="'Fraunces', Georgia, serif" fontStyle="italic"
                  fontWeight={600} fill={tabColor(n.tab)}>
                  {n.name[0]}
                </text>
              )}

              {/* Border */}
              <circle cx={x} cy={y} r={r} fill="none"
                stroke={sel ? '#D8442B' : hc ?? tabColor(n.tab)}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray={n.degree === 'second' && !sel ? '4 3' : undefined}
                opacity={n.degree === 'second' ? 0.6 : 1}
              />

              {/* Name label — background rect first, then text on top */}
              <rect
                x={x - labelW / 2} y={y + r + 3}
                width={labelW} height={13}
                rx={4}
                fill="rgba(244,239,230,0.92)"
                stroke="none"
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={x} y={y + r + 12}
                textAnchor="middle"
                fontSize={8.5}
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

        {/* Me — rendered last so it's on top */}
        {(() => {
          const MR = 34
          const hasImg = !!me.avatarUrl
          return (
            <g onClick={(e) => { e.stopPropagation(); onClearSelection() }} style={{ cursor: 'pointer' }}>
              <circle cx={CX} cy={CY} r={MR + 5} fill="none" stroke="rgba(216,68,43,0.18)" strokeWidth={1} />
              <circle cx={CX} cy={CY} r={MR} fill="#F4EFE6" />
              {hasImg ? (
                <>
                  <defs>
                    <clipPath id="clip-me-mg">
                      <circle cx={CX} cy={CY} r={MR} />
                    </clipPath>
                  </defs>
                  <image
                    href={me.avatarUrl!}
                    x={CX - MR} y={CY - MR} width={MR * 2} height={MR * 2}
                    clipPath="url(#clip-me-mg)"
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              ) : (
                <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
                  fontSize={20} fontFamily="'Fraunces', Georgia, serif" fontStyle="italic"
                  fontWeight={600} fill="#4455c7">
                  {me.name[0]}
                </text>
              )}
              <circle cx={CX} cy={CY} r={MR} fill="none" stroke="#D8442B" strokeWidth={2} />
              {/* "You" label */}
              <rect x={CX - 14} y={CY + MR + 3} width={28} height={13} rx={4} fill="rgba(216,68,43,0.10)" />
              <text x={CX} y={CY + MR + 12} textAnchor="middle"
                fontSize={8.5} fontFamily="'IBM Plex Sans', sans-serif"
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
