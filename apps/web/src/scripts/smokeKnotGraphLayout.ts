import assert from 'node:assert/strict'
import {
  DESKTOP_DIRECT_NODE_SIZE,
  DESKTOP_EXPANDED_BOUNDS,
  DESKTOP_SECOND_DEGREE_SIZE,
  MOBILE_EXPANDED_BOUNDS,
  MOBILE_SECOND_DEGREE_SIZE,
  edgeAttachmentPoints,
  layoutExpandedNodeSlots,
  rectForPoint,
  rectsOverlap,
  type LayoutBounds,
  type LayoutPoint,
  type LayoutSize,
} from '../components/knot/knotGraphLayout'

function assertLayout({
  label,
  points,
  bounds,
  size,
  avoid = [],
  checkBounds = true,
  root,
  center,
  maxDistance,
}: {
  label: string
  points: LayoutPoint[]
  bounds: LayoutBounds
  size: LayoutSize
  avoid?: ReturnType<typeof rectForPoint>[]
  checkBounds?: boolean
  root?: LayoutPoint
  center?: LayoutPoint
  maxDistance?: number
}) {
  for (const [index, point] of points.entries()) {
    if (checkBounds) {
      assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX, `${label}: point ${index} x is outside bounds`)
      assert.ok(point.y >= bounds.minY && point.y <= bounds.maxY, `${label}: point ${index} y is outside bounds`)
    }

    if (root && center) {
      const outward = { x: root.x - center.x, y: root.y - center.y }
      const projection = (point.x - root.x) * outward.x + (point.y - root.y) * outward.y
      assert.ok(projection > 0, `${label}: point ${index} is not behind the expanded root`)
    }

    if (root && maxDistance) {
      const distance = Math.hypot(point.x - root.x, point.y - root.y)
      assert.ok(distance <= maxDistance, `${label}: point ${index} is too far from the expanded root`)
    }
  }

  const rects = points.map((point) => rectForPoint(point, size))
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.equal(rectsOverlap(rects[i], rects[j], 8), false, `${label}: child ${i} overlaps child ${j}`)
    }

    for (const obstacle of avoid) {
      assert.equal(rectsOverlap(rects[i], obstacle, 8), false, `${label}: child ${i} overlaps an occupied node`)
    }
  }
}

const center = { x: 500, y: 295 }
const desktopRoots = [
  { label: 'top-right', root: { x: 760, y: 120 } },
  { label: 'bottom-right', root: { x: 760, y: 470 } },
  { label: 'top-left', root: { x: 245, y: 120 } },
  { label: 'bottom-left', root: { x: 245, y: 470 } },
  { label: 'near-center', root: { x: 560, y: 330 } },
]

for (const { label, root } of desktopRoots) {
  for (const total of [1, 2, 3, 6, 9, 12, 16, 32, 64, 250]) {
    const avoid = [rectForPoint(root, DESKTOP_DIRECT_NODE_SIZE)]
    const layoutOptions = {
      root,
      center,
      total,
      bounds: DESKTOP_EXPANDED_BOUNDS,
      size: DESKTOP_SECOND_DEGREE_SIZE,
      parentSize: DESKTOP_DIRECT_NODE_SIZE,
      avoid,
      maxColumns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(total * 2)))),
    }
    const points = layoutExpandedNodeSlots(layoutOptions)
    const repeated = layoutExpandedNodeSlots(layoutOptions)

    assert.equal(points.length, total, `${label}: expected ${total} points`)
    assert.deepEqual(points, repeated, `${label}: layout should be deterministic after repeated expand/collapse`)
    assertLayout({
      label: `desktop ${label} ${total}`,
      points,
      bounds: DESKTOP_EXPANDED_BOUNDS,
      size: DESKTOP_SECOND_DEGREE_SIZE,
      avoid,
      checkBounds: false,
      root,
      center,
      maxDistance: total <= 16 ? 720 : undefined,
    })
  }
}

const mobileRoots = [
  { label: 'mobile top-right', root: { x: 326, y: 168 } },
  { label: 'mobile bottom-right', root: { x: 326, y: 432 } },
  { label: 'mobile top-left', root: { x: 64, y: 168 } },
  { label: 'mobile bottom-left', root: { x: 64, y: 432 } },
  { label: 'mobile near-center', root: { x: 220, y: 330 } },
]

for (const { label, root } of mobileRoots) {
  const avoid = [rectForPoint(root, MOBILE_SECOND_DEGREE_SIZE)]
  for (const total of [1, 2, 3, 6, 9, 12, 16]) {
    const layoutOptions = {
      root,
      center: { x: 195, y: 300 },
      total,
      bounds: MOBILE_EXPANDED_BOUNDS,
      size: MOBILE_SECOND_DEGREE_SIZE,
      parentSize: MOBILE_SECOND_DEGREE_SIZE,
      avoid,
      maxColumns: Math.min(4, Math.max(2, Math.ceil(Math.sqrt(total)))),
      rootGapX: 62,
      rootGapY: 62,
      columnGap: 16,
      rowGap: 16,
      constrainToBounds: false,
    }
    const points = layoutExpandedNodeSlots(layoutOptions)
    const repeated = layoutExpandedNodeSlots(layoutOptions)

    assert.equal(points.length, total, `${label}: expected ${total} points`)
    assert.deepEqual(points, repeated, `${label}: mobile layout should be deterministic after orientation refits`)
    assertLayout({
      label: `${label} ${total}`,
      points,
      bounds: MOBILE_EXPANDED_BOUNDS,
      size: MOBILE_SECOND_DEGREE_SIZE,
      avoid,
      checkBounds: false,
      root,
      center: { x: 195, y: 300 },
      maxDistance: 430,
    })
  }
}

const horizontalEdge = edgeAttachmentPoints({
  source: { x: 100, y: 100 },
  target: { x: 300, y: 100 },
  sourceSize: { width: 80, height: 40 },
  targetSize: { width: 100, height: 60 },
})
assert.deepEqual(horizontalEdge.start, { x: 140, y: 100 }, 'edge starts on the source card boundary')
assert.deepEqual(horizontalEdge.end, { x: 250, y: 100 }, 'edge ends on the target card boundary')

const diagonalEdge = edgeAttachmentPoints({
  source: { x: 200, y: 180 },
  target: { x: 360, y: 300 },
  sourceSize: { width: 120, height: 64 },
  targetSize: { width: 158, height: 54 },
})
assert.notDeepEqual(diagonalEdge.start, { x: 200, y: 180 }, 'diagonal edge should not start at the source center')
assert.notDeepEqual(diagonalEdge.end, { x: 360, y: 300 }, 'diagonal edge should not end at the target center')
assert.ok(Math.abs(diagonalEdge.start.y - 212) < 0.0001, 'diagonal edge exits through the source boundary')
assert.ok(Math.abs(diagonalEdge.end.y - 273) < 0.0001, 'diagonal edge enters through the target boundary')

function worldToScreen(point: LayoutPoint, viewport: { x: number; y: number; scale: number }, stage: LayoutSize) {
  const origin = { x: stage.width / 2, y: stage.height / 2 }
  return {
    x: origin.x + viewport.x + viewport.scale * (point.x - origin.x),
    y: origin.y + viewport.y + viewport.scale * (point.y - origin.y),
  }
}

const transformCases = [
  { label: 'desktop resize', stage: { width: 1000, height: 590 }, viewport: { x: 0, y: 0, scale: 1 } },
  { label: 'desktop pan zoom drag', stage: { width: 780, height: 460 }, viewport: { x: -84, y: 38, scale: 1.42 } },
  { label: 'mobile portrait', stage: { width: 390, height: 600 }, viewport: { x: 24, y: -30, scale: 1.18 } },
  { label: 'mobile landscape', stage: { width: 720, height: 360 }, viewport: { x: -55, y: 18, scale: 0.86 } },
]

for (const { label, stage, viewport } of transformCases) {
  const screenStart = worldToScreen(diagonalEdge.start, viewport, stage)
  const screenSource = worldToScreen({ x: 200, y: 180 }, viewport, stage)
  const dx = Math.abs(screenStart.x - screenSource.x)
  const dy = Math.abs(screenStart.y - screenSource.y)
  assert.ok(dx <= (120 / 2) * viewport.scale + 0.001, `${label}: edge start x remains attached after transform`)
  assert.ok(dy <= (64 / 2) * viewport.scale + 0.001, `${label}: edge start y remains attached after transform`)
}

console.log('KNOT GRAPH LAYOUT SMOKE: PASS')
