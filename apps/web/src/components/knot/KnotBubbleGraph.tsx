/**
 * Mobile-only bubble graph for Your Knot.
 * Renders round avatar nodes in concentric rings around a "me" centre.
 * Desktop uses KnotForceGraph — this component is hidden on md+.
 */
import { useMemo, useState } from 'react'
import type { KnotGraphNode } from './KnotForceGraph'

type CenterNode = { id: 'me'; name: string; avatarUrl: string | null }

type Props = {
  me: CenterNode
  nodes: KnotGraphNode[]
  selectedNodeId: string | null
  query: string
  onSelectNode: (node: KnotGraphNode) => void
  onClearSelection: () => void
}

// Deterministic initials from a name
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Light pastel background from name seed for avatar fallback
function seedColor(name: string) {
  const palette = ['#F4D7CD', '#C8DDD7', '#F0E0B5', '#E5D2DD', '#D1DCF0', '#D4EDD4']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

// Arrange N nodes in concentric rings around (cx, cy)
function ringLayout(count: number, cx: number, cy: number, r1: number, r2: number) {
  const ring1Cap = Math.min(count, 7)
  const ring2Count = count - ring1Cap
  const positions: { x: number; y: number }[] = []

  for (let i = 0; i < ring1Cap; i++) {
    const angle = (2 * Math.PI * i) / ring1Cap - Math.PI / 2
    positions.push({ x: cx + r1 * Math.cos(angle), y: cy + r1 * Math.sin(angle) })
  }
  for (let i = 0; i < ring2Count; i++) {
    const angle = (2 * Math.PI * i) / ring2Count - Math.PI / 2 + Math.PI / ring2Count
    positions.push({ x: cx + r2 * Math.cos(angle), y: cy + r2 * Math.sin(angle) })
  }
  return positions
}

const HEALTH_COLOR: Record<string, string> = {
  warm: '#4caf7d',
  cooling: '#c9922a',
  cold: '#D84428',
}

export function KnotBubbleGraph({ me, nodes, selectedNodeId, query, onSelectNode, onClearSelection }: Props) {
  const [imgFailed, setImgFailed] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!query.trim()) return nodes.filter(n => n.tab === 'Connected')
    const q = query.toLowerCase()
    return nodes.filter(n =>
      n.tab === 'Connected' &&
      (n.name.toLowerCase().includes(q) || n.context.toLowerCase().includes(q))
    )
  }, [nodes, query])

  // SVG dimensions — full-width, enough height for two rings
  const W = 390
  const H = filtered.length > 7 ? 460 : 360
  const CX = W / 2
  const CY = filtered.length > 7 ? 210 : H / 2
  const R1 = filtered.length > 7 ? 120 : 110
  const R2 = 210

  const positions = ringLayout(filtered.length, CX, CY, R1, R2)

  const ME_R = 30
  const NODE_R = 20

  function avatar(id: string, name: string, url: string | null, r: number, cx: number, cy: number, isMe = false) {
    const clipId = `clip-${id}`
    const failed = imgFailed.has(id)
    const bg = seedColor(name)
    const label = initials(name)
    return (
      <g key={id}>
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        {/* Background fill */}
        <circle cx={cx} cy={cy} r={r} fill={bg} />
        {/* Avatar image */}
        {url && !failed && (
          <image
            href={url}
            x={cx - r} y={cy - r}
            width={r * 2} height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            onError={() => setImgFailed(prev => new Set(prev).add(id))}
          />
        )}
        {/* Initials fallback */}
        {(!url || failed) && (
          <text
            x={cx} y={cy}
            textAnchor="middle" dominantBaseline="central"
            fontSize={isMe ? 13 : 10}
            fontFamily="'IBM Plex Sans', sans-serif"
            fontWeight={600}
            fill="#1A1815"
          >
            {label}
          </text>
        )}
      </g>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', touchAction: 'manipulation' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Lines from me to each node */}
        {filtered.map((node, i) => {
          const { x, y } = positions[i]
          const isSelected = node.id === selectedNodeId
          return (
            <line
              key={`line-${node.id}`}
              x1={CX} y1={CY} x2={x} y2={y}
              stroke={isSelected ? '#D8442B' : 'rgba(26,24,21,0.12)'}
              strokeWidth={isSelected ? 1.5 : 1}
            />
          )
        })}

        {/* Connection nodes */}
        {filtered.map((node, i) => {
          const { x, y } = positions[i]
          const isSelected = node.id === selectedNodeId
          const hc = node.healthState ? HEALTH_COLOR[node.healthState] : undefined

          return (
            <g
              key={node.id}
              onClick={() => {
                if (isSelected) onClearSelection()
                else onSelectNode(node)
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* Outer ring: health state or selection */}
              <circle
                cx={x} cy={y} r={NODE_R + 3}
                fill={isSelected ? 'rgba(216,68,43,0.15)' : hc ? `${hc}22` : 'transparent'}
                stroke={isSelected ? '#D8442B' : hc ?? 'transparent'}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              {avatar(node.id, node.name, node.avatarUrl, NODE_R, x, y)}
              {/* Name label */}
              <text
                x={x} y={y + NODE_R + 13}
                textAnchor="middle"
                fontSize={9.5}
                fontFamily="'IBM Plex Sans', sans-serif"
                fontWeight={isSelected ? 700 : 500}
                fill={isSelected ? '#D8442B' : '#1A1815'}
              >
                {node.name.split(' ')[0]}
              </text>
            </g>
          )
        })}

        {/* Me — centre, on top */}
        <g>
          <circle cx={CX} cy={CY} r={ME_R + 4} fill="rgba(216,68,43,0.08)" stroke="#D8442B" strokeWidth={1.5} />
          {avatar('me', me.name, me.avatarUrl, ME_R, CX, CY, true)}
          <text
            x={CX} y={CY + ME_R + 13}
            textAnchor="middle"
            fontSize={9.5}
            fontFamily="'IBM Plex Sans', sans-serif"
            fontWeight={700}
            fill="#D8442B"
          >
            You
          </text>
        </g>

        {/* Empty state */}
        {filtered.length === 0 && (
          <text
            x={CX} y={CY + 60}
            textAnchor="middle"
            fontSize={13}
            fontFamily="'Fraunces', Georgia, serif"
            fontStyle="italic"
            fill="rgba(26,24,21,0.35)"
          >
            {query ? 'No matches' : 'No connections yet'}
          </text>
        )}
      </svg>
    </div>
  )
}
