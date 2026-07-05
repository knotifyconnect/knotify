export type LayoutPoint = { x: number; y: number }

export type LayoutSize = { width: number; height: number }

export type LayoutBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type LayoutRect = LayoutPoint & LayoutSize

type ExpandedSlotOptions = {
  root: LayoutPoint
  center: LayoutPoint
  total: number
  bounds: LayoutBounds
  size: LayoutSize
  avoid?: LayoutRect[]
  maxColumns?: number
  rootGapX?: number
  rootGapY?: number
  columnGap?: number
  rowGap?: number
}

export const DESKTOP_SECOND_DEGREE_SIZE: LayoutSize = { width: 158, height: 54 }
export const DESKTOP_DIRECT_NODE_SIZE: LayoutSize = { width: 180, height: 62 }
export const DESKTOP_EXPANDED_BOUNDS: LayoutBounds = {
  minX: DESKTOP_SECOND_DEGREE_SIZE.width / 2 + 28,
  maxX: 1000 - DESKTOP_SECOND_DEGREE_SIZE.width / 2 - 28,
  minY: DESKTOP_SECOND_DEGREE_SIZE.height / 2 + 58,
  maxY: 590 - DESKTOP_SECOND_DEGREE_SIZE.height / 2 - 34,
}

export const MOBILE_SECOND_DEGREE_SIZE: LayoutSize = { width: 54, height: 50 }
export const MOBILE_EXPANDED_BOUNDS: LayoutBounds = {
  minX: MOBILE_SECOND_DEGREE_SIZE.width / 2 + 12,
  maxX: 390 - MOBILE_SECOND_DEGREE_SIZE.width / 2 - 12,
  minY: MOBILE_SECOND_DEGREE_SIZE.height / 2 + 58,
  maxY: 600 - MOBILE_SECOND_DEGREE_SIZE.height / 2 - 34,
}

export function rectForPoint(point: LayoutPoint, size: LayoutSize): LayoutRect {
  return {
    x: point.x - size.width / 2,
    y: point.y - size.height / 2,
    width: size.width,
    height: size.height,
  }
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

export function layoutExpandedNodeSlots({
  root,
  center,
  total,
  bounds,
  size,
  avoid = [],
  maxColumns = 4,
  rootGapX = 188,
  rootGapY = 88,
  columnGap = 28,
  rowGap = 22,
}: ExpandedSlotOptions): LayoutPoint[] {
  if (total <= 0) return []

  const collisionGap = 8
  const radialStep = Math.max(size.width + columnGap, size.height + rowGap)
  const rootDistance = Math.max(1, Math.hypot(root.x - center.x, root.y - center.y))
  const outwardAngle = Math.atan2(root.y - center.y, root.x - center.x)
  const maxCandidates = Math.max(total * 18, 72)
  const rootRect = rectForPoint(root, size)
  const candidates = makeRadialCandidates({
    root,
    center,
    bounds,
    size,
    total: maxCandidates,
    baseRadius: Math.max(rootGapX, rootGapY, radialStep * 0.82),
    radiusStep: radialStep,
    outwardAngle,
    rootDistance,
    maxColumns,
  })
  const used = [rootRect, ...avoid]
  const points: LayoutPoint[] = []

  for (let index = 0; index < total; index += 1) {
    let best: { point: LayoutPoint; score: number } | null = null

    for (const candidate of candidates) {
      if (points.some((point) => point.x === candidate.point.x && point.y === candidate.point.y)) continue

      const rect = rectForPoint(candidate.point, size)
      const collisionScore = used.reduce((score, obstacle) => {
        return score + (rectsOverlap(rect, obstacle, collisionGap) ? 1_000_000 : 0)
      }, 0)
      const fanScore = Math.abs(candidate.angleOffset) * 10 + candidate.ring * 34 + candidate.edgePenalty
      const score = collisionScore + fanScore

      if (!best || score < best.score) {
        best = { point: candidate.point, score }
        if (score < 1) break
      }
    }

    if (!best) break
    points.push(best.point)
    used.push(rectForPoint(best.point, size))
  }

  return points
}

function makeRadialCandidates({
  root,
  center,
  bounds,
  size,
  total,
  baseRadius,
  radiusStep,
  outwardAngle,
  rootDistance,
  maxColumns,
}: {
  root: LayoutPoint
  center: LayoutPoint
  bounds: LayoutBounds
  size: LayoutSize
  total: number
  baseRadius: number
  radiusStep: number
  outwardAngle: number
  rootDistance: number
  maxColumns: number
}) {
  const candidates: Array<{ point: LayoutPoint; angleOffset: number; ring: number; edgePenalty: number }> = []
  const angleStep = Math.PI / 8
  const offsets = Array.from({ length: 17 }, (_, index) => {
    if (index === 0) return 0
    const distance = Math.ceil(index / 2) * angleStep
    return index % 2 === 1 ? -distance : distance
  })
  const ringCount = Math.max(5, Math.ceil(total / Math.max(1, maxColumns)) + 2)
  const seen = new Set<string>()

  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = baseRadius + ring * radiusStep
    for (const angleOffset of offsets) {
      const angle = outwardAngle + angleOffset
      const raw = {
        x: root.x + Math.cos(angle) * radius,
        y: root.y + Math.sin(angle) * radius,
      }
      const point = {
        x: clamp(raw.x, bounds.minX, bounds.maxX),
        y: clamp(raw.y, bounds.minY, bounds.maxY),
      }
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`
      if (seen.has(key)) continue
      seen.add(key)

      const rawShift = Math.hypot(point.x - raw.x, point.y - raw.y)
      const fromCenter = Math.hypot(point.x - center.x, point.y - center.y)

      candidates.push({
        point,
        angleOffset,
        ring,
        edgePenalty: rawShift * 2 + (fromCenter < rootDistance ? 80 : 0),
      })
    }
  }

  const gridStepX = size.width + 24
  const gridStepY = size.height + 18
  for (let y = bounds.minY; y <= bounds.maxY; y += gridStepY) {
    for (let x = bounds.minX; x <= bounds.maxX; x += gridStepX) {
      const key = `${Math.round(x)}:${Math.round(y)}`
      if (seen.has(key)) continue
      seen.add(key)

      const angle = Math.atan2(y - root.y, x - root.x)
      const distance = Math.hypot(x - root.x, y - root.y)
      const fromCenter = Math.hypot(x - center.x, y - center.y)

      candidates.push({
        point: { x, y },
        angleOffset: signedAngleDiff(angle, outwardAngle),
        ring: ringCount + Math.floor(distance / Math.max(1, radiusStep)),
        edgePenalty: 120 + (fromCenter < rootDistance ? 80 : 0),
      })
    }
  }

  return candidates
}

function signedAngleDiff(angle: number, target: number) {
  return Math.atan2(Math.sin(angle - target), Math.cos(angle - target))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
