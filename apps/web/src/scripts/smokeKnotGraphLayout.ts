import assert from 'node:assert/strict'
import {
  DESKTOP_DIRECT_NODE_SIZE,
  DESKTOP_EXPANDED_BOUNDS,
  DESKTOP_SECOND_DEGREE_SIZE,
  MOBILE_EXPANDED_BOUNDS,
  MOBILE_SECOND_DEGREE_SIZE,
  layoutExpandedNodeSlots,
  rectForPoint,
  rectsOverlap,
  svgPointForDomGraphPoint,
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
      assert.ok(Math.hypot(point.x - root.x, point.y - root.y) <= maxDistance, `${label}: point ${index} is too far from root`)
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
    const options = {
      root,
      center,
      total,
      bounds: DESKTOP_EXPANDED_BOUNDS,
      size: DESKTOP_SECOND_DEGREE_SIZE,
      parentSize: DESKTOP_DIRECT_NODE_SIZE,
      avoid,
      maxColumns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(total * 2)))),
    }
    const points = layoutExpandedNodeSlots(options)
    const repeated = layoutExpandedNodeSlots(options)

    assert.equal(points.length, total, `${label}: expected ${total} points`)
    assert.deepEqual(points, repeated, `${label}: layout is deterministic`)
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
    const options = {
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
    const points = layoutExpandedNodeSlots(options)
    const repeated = layoutExpandedNodeSlots(options)

    assert.equal(points.length, total, `${label}: expected ${total} points`)
    assert.deepEqual(points, repeated, `${label}: mobile layout is deterministic`)
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

function domScreenPoint(point: LayoutPoint, stage: LayoutSize, viewBox: LayoutSize) {
  return {
    x: (point.x / viewBox.width) * stage.width,
    y: (point.y / viewBox.height) * stage.height,
  }
}

function meetScreenPoint(point: LayoutPoint, stage: LayoutSize, viewBox: LayoutSize) {
  const scale = Math.min(stage.width / viewBox.width, stage.height / viewBox.height)
  const offsetX = (stage.width - viewBox.width * scale) / 2
  const offsetY = (stage.height - viewBox.height * scale) / 2
  return {
    x: offsetX + point.x * scale,
    y: offsetY + point.y * scale,
  }
}

for (const stage of [{ width: 1000, height: 590 }, { width: 1280, height: 720 }, { width: 820, height: 720 }]) {
  const graphPoint = { x: 760, y: 120 }
  const svgPoint = svgPointForDomGraphPoint(graphPoint, stage, { width: 1000, height: 590 })
  assert.deepEqual(
    meetScreenPoint(svgPoint, stage, { width: 1000, height: 590 }),
    domScreenPoint(graphPoint, stage, { width: 1000, height: 590 }),
    `svg/card coordinate systems stay attached at ${stage.width}x${stage.height}`,
  )
}

console.log('KNOT GRAPH LAYOUT SMOKE: PASS')
