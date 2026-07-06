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
  parentSize?: LayoutSize
  avoid?: LayoutRect[]
  maxColumns?: number
  rootGapX?: number
  rootGapY?: number
  columnGap?: number
  rowGap?: number
  constrainToBounds?: boolean
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

export function pointOnRectBoundary(center: LayoutPoint, toward: LayoutPoint, size: LayoutSize): LayoutPoint {
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  const halfWidth = Math.max(size.width / 2, 0.001)
  const halfHeight = Math.max(size.height / 2, 0.001)

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { ...center }

  const scale = Math.min(
    Math.abs(dx) < 0.001 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx),
    Math.abs(dy) < 0.001 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy),
  )

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  }
}

export function svgPointForDomGraphPoint(point: LayoutPoint, stageSize: LayoutSize, viewBoxSize: LayoutSize): LayoutPoint {
  const stageWidth = Math.max(stageSize.width, 1)
  const stageHeight = Math.max(stageSize.height, 1)
  const scale = Math.min(stageWidth / viewBoxSize.width, stageHeight / viewBoxSize.height) || 1
  const renderedWidth = viewBoxSize.width * scale
  const renderedHeight = viewBoxSize.height * scale
  const offsetX = (stageWidth - renderedWidth) / 2
  const offsetY = (stageHeight - renderedHeight) / 2
  const domX = (point.x / viewBoxSize.width) * stageWidth
  const domY = (point.y / viewBoxSize.height) * stageHeight

  return {
    x: (domX - offsetX) / scale,
    y: (domY - offsetY) / scale,
  }
}

export function layoutExpandedNodeSlots({
  root,
  center,
  total,
  bounds,
  size,
  parentSize = size,
  avoid = [],
  maxColumns,
  rootGapX = 188,
  rootGapY = 88,
  columnGap = 28,
  rowGap = 22,
  constrainToBounds = false,
}: ExpandedSlotOptions): LayoutPoint[] {
  if (total <= 0) return []

  const collisionGap = 8
  const rootRect = rectForPoint(root, parentSize)
  const candidates = makeBackstageCandidates({
    root,
    center,
    bounds,
    size,
    parentSize,
    total,
    maxColumns: maxColumns ?? Math.min(12, Math.max(3, Math.ceil(Math.sqrt(total * 1.8)))),
    rootGap: Math.max(24, Math.min(rootGapX, rootGapY)),
    columnGap,
    rowGap,
    constrainToBounds,
  })
  const hardUsed = [rootRect]
  const points: LayoutPoint[] = []

  for (let index = 0; index < total; index += 1) {
    let best: { point: LayoutPoint; score: number } | null = null

    for (const candidate of candidates) {
      if (points.some((point) => point.x === candidate.point.x && point.y === candidate.point.y)) continue

      const rect = rectForPoint(candidate.point, size)
      if (hardUsed.some((obstacle) => rectsOverlap(rect, obstacle, collisionGap))) continue

      const collisionScore = avoid.reduce((score, obstacle) => {
        return score + (rectsOverlap(rect, obstacle, collisionGap) ? 100_000 : 0)
      }, 0)
      const score = collisionScore + candidate.score

      if (!best || score < best.score) {
        best = { point: candidate.point, score }
        if (score < 1) break
      }
    }

    if (!best) break
    points.push(best.point)
    hardUsed.push(rectForPoint(best.point, size))
  }

  return points
}

function makeBackstageCandidates({
  root,
  center,
  bounds,
  size,
  parentSize,
  total,
  maxColumns,
  rootGap,
  columnGap,
  rowGap,
  constrainToBounds,
}: {
  root: LayoutPoint
  center: LayoutPoint
  bounds: LayoutBounds
  size: LayoutSize
  parentSize: LayoutSize
  total: number
  maxColumns: number
  rootGap: number
  columnGap: number
  rowGap: number
  constrainToBounds: boolean
}) {
  const candidates: Array<{ point: LayoutPoint; score: number }> = []
  const dx = root.x - center.x
  const dy = root.y - center.y
  const length = Math.hypot(dx, dy) || 1
  const outward = { x: dx / length, y: dy / length }
  const across = { x: -outward.y, y: outward.x }
  const acrossStep = axisAlignedSeparationStep(across, size, columnGap)
  const rowStep = axisAlignedSeparationStep(outward, size, rowGap)
  const firstRowDistance = Math.max(rootGap, halfExtentAlong(parentSize, outward) + halfExtentAlong(size, outward) + rowGap)
  const columns = Math.max(1, Math.min(maxColumns, total))
  const rows = Math.ceil(total / columns) + 12
  const seen = new Set<string>()

  for (let row = 0; row < rows; row += 1) {
    const rowDistance = firstRowDistance + row * rowStep
    const rowColumns = Math.min(columns + Math.floor(row / 2), total)
    const offsets = centeredOffsets(rowColumns, acrossStep)

    for (const offset of offsets) {
      const raw = add(root, scale(outward, rowDistance), scale(across, offset))
      const point = constrainToBounds
        ? { x: clamp(raw.x, bounds.minX, bounds.maxX), y: clamp(raw.y, bounds.minY, bounds.maxY) }
        : raw
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`
      if (seen.has(key)) continue
      seen.add(key)

      const rawShift = Math.hypot(point.x - raw.x, point.y - raw.y)
      candidates.push({
        point,
        score: row * rowStep * 8 + Math.abs(offset) + rawShift * 500,
      })
    }
  }

  if (constrainToBounds) {
    const gridStepX = size.width + Math.max(12, columnGap)
    const gridStepY = size.height + Math.max(12, rowGap)

    for (let y = bounds.minY; y <= bounds.maxY; y += gridStepY) {
      for (let x = bounds.minX; x <= bounds.maxX; x += gridStepX) {
        const projection = (x - root.x) * outward.x + (y - root.y) * outward.y
        if (projection <= 0) continue

        const key = `${Math.round(x)}:${Math.round(y)}`
        if (seen.has(key)) continue
        seen.add(key)

        candidates.push({
          point: { x, y },
          score: 500_000 + Math.hypot(x - root.x, y - root.y),
        })
      }
    }
  }

  return candidates
}

function halfExtentAlong(size: LayoutSize, axis: LayoutPoint) {
  return (Math.abs(axis.x) * size.width + Math.abs(axis.y) * size.height) / 2
}

function axisAlignedSeparationStep(axis: LayoutPoint, size: LayoutSize, gap: number) {
  const xStep = Math.abs(axis.x) < 0.0001 ? Number.POSITIVE_INFINITY : (size.width + gap) / Math.abs(axis.x)
  const yStep = Math.abs(axis.y) < 0.0001 ? Number.POSITIVE_INFINITY : (size.height + gap) / Math.abs(axis.y)
  return Math.min(xStep, yStep)
}

function centeredOffsets(count: number, step: number) {
  const start = -((count - 1) * step) / 2
  return Array.from({ length: count }, (_, index) => start + index * step)
}

function add(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): LayoutPoint {
  return { x: a.x + b.x + c.x, y: a.y + b.y + c.y }
}

function scale(point: LayoutPoint, amount: number): LayoutPoint {
  return { x: point.x * amount, y: point.y * amount }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
