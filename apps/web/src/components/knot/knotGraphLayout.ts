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
  minX: DESKTOP_SECOND_DEGREE_SIZE.width / 2 + 24,
  maxX: 710,
  minY: DESKTOP_SECOND_DEGREE_SIZE.height / 2 + 54,
  maxY: 590 - DESKTOP_SECOND_DEGREE_SIZE.height / 2 - 42,
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

  const stepX = size.width + columnGap
  const stepY = size.height + rowGap
  const preferredSide = root.x >= center.x ? -1 : 1
  const outwardY = root.y >= center.y ? 1 : -1
  const sideOrder = [preferredSide, -preferredSide]
  const verticalOrder = [outwardY, -outwardY, 0]
  const rootRect = rectForPoint(root, size)

  let best: { points: LayoutPoint[]; score: number } | null = null

  for (const side of sideOrder) {
    const available = side < 0 ? root.x - bounds.minX : bounds.maxX - root.x
    const fitColumns = Math.max(1, Math.min(maxColumns, total, Math.floor((available - rootGapX) / stepX) + 1))
    const columnOrder = Array.from({ length: fitColumns }, (_, index) => fitColumns - index)

    for (const columns of columnOrder) {
      for (const vertical of verticalOrder) {
        const points = normalizePoints(makeGrid(root, total, columns, side, vertical, rootGapX, rootGapY, stepX, stepY), bounds)
        const score = scorePoints(points, size, [rootRect, ...avoid])

        if (!best || score < best.score) {
          best = { points, score }
          if (score === 0) return points
        }
      }
    }
  }

  return best?.points ?? []
}

function makeGrid(
  root: LayoutPoint,
  total: number,
  columns: number,
  side: number,
  vertical: number,
  rootGapX: number,
  rootGapY: number,
  stepX: number,
  stepY: number
) {
  const rows = Math.ceil(total / columns)
  const centeredStartY = root.y - ((rows - 1) * stepY) / 2

  return Array.from({ length: total }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const y = vertical === 0
      ? centeredStartY + row * stepY
      : root.y + vertical * (rootGapY + row * stepY)

    return {
      x: root.x + side * (rootGapX + column * stepX),
      y,
    }
  })
}

function normalizePoints(points: LayoutPoint[], bounds: LayoutBounds) {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  let shiftX = 0
  let shiftY = 0

  if (minX < bounds.minX) shiftX = bounds.minX - minX
  else if (maxX > bounds.maxX) shiftX = bounds.maxX - maxX

  if (minY < bounds.minY) shiftY = bounds.minY - minY
  else if (maxY > bounds.maxY) shiftY = bounds.maxY - maxY

  return points.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY }))
}

function scorePoints(points: LayoutPoint[], size: LayoutSize, avoid: LayoutRect[]) {
  const rects = points.map((point) => rectForPoint(point, size))
  let score = 0

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j], 8)) score += 1000
    }

    for (const obstacle of avoid) {
      if (rectsOverlap(rects[i], obstacle, 10)) score += 1
    }
  }

  return score
}
