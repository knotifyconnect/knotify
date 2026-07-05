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
}: {
  label: string
  points: LayoutPoint[]
  bounds: LayoutBounds
  size: LayoutSize
  avoid?: ReturnType<typeof rectForPoint>[]
  checkBounds?: boolean
  root?: LayoutPoint
  center?: LayoutPoint
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
]

for (const { label, root } of desktopRoots) {
  for (const total of [1, 2, 3, 6, 9, 12, 16]) {
    const avoid = [rectForPoint(root, DESKTOP_DIRECT_NODE_SIZE)]
    const points = layoutExpandedNodeSlots({
      root,
      center,
      total,
      bounds: DESKTOP_EXPANDED_BOUNDS,
      size: DESKTOP_SECOND_DEGREE_SIZE,
      avoid,
    })

    assert.equal(points.length, total, `${label}: expected ${total} points`)
    assertLayout({
      label: `desktop ${label} ${total}`,
      points,
      bounds: DESKTOP_EXPANDED_BOUNDS,
      size: DESKTOP_SECOND_DEGREE_SIZE,
      avoid,
      checkBounds: false,
      root,
      center,
    })
  }
}

const mobileRoots = [
  { label: 'mobile top-right', root: { x: 326, y: 168 } },
  { label: 'mobile bottom-left', root: { x: 64, y: 432 } },
]

for (const { label, root } of mobileRoots) {
  const avoid = [rectForPoint(root, MOBILE_SECOND_DEGREE_SIZE)]
  const points = layoutExpandedNodeSlots({
    root,
    center: { x: 195, y: 300 },
    total: 10,
    bounds: MOBILE_EXPANDED_BOUNDS,
    size: MOBILE_SECOND_DEGREE_SIZE,
    avoid,
    maxColumns: 2,
    rootGapX: 62,
    rootGapY: 62,
    columnGap: 16,
    rowGap: 16,
    constrainToBounds: true,
  })

  assert.equal(points.length, 10, `${label}: expected 10 points`)
  assertLayout({
    label,
    points,
    bounds: MOBILE_EXPANDED_BOUNDS,
    size: MOBILE_SECOND_DEGREE_SIZE,
    avoid,
  })
}

console.log('KNOT GRAPH LAYOUT SMOKE: PASS')
