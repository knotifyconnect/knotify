import assert from 'node:assert/strict'
import {
  DESKTOP_DIRECT_NODE_SIZE,
  DESKTOP_EXPANDED_BOUNDS,
  DESKTOP_SECOND_DEGREE_SIZE,
  edgeEndpointsForRects,
  layoutSizeForDomSize,
  MOBILE_EXPANDED_BOUNDS,
  MOBILE_SECOND_DEGREE_SIZE,
  layoutExpandedNodeSlots,
  offsetLayoutPoint,
  pointOnRectBoundary,
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
  assertNoClamp,
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
  assertNoClamp?: boolean
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

  if (assertNoClamp && points.length > 1) {
    const pinned = points.filter((point) => (
      Math.abs(point.x - bounds.minX) < 0.5 ||
      Math.abs(point.x - bounds.maxX) < 0.5 ||
      Math.abs(point.y - bounds.minY) < 0.5 ||
      Math.abs(point.y - bounds.maxY) < 0.5
    ))
    assert.equal(pinned.length, 0, `${label}: points are pinned to an artificial viewport boundary`)

    const sameRoundedX = new Map<number, number>()
    const sameRoundedY = new Map<number, number>()
    for (const point of points) {
      sameRoundedX.set(Math.round(point.x), (sameRoundedX.get(Math.round(point.x)) ?? 0) + 1)
      sameRoundedY.set(Math.round(point.y), (sameRoundedY.get(Math.round(point.y)) ?? 0) + 1)
    }
    const maxAligned = Math.max(...sameRoundedX.values(), ...sameRoundedY.values())
    assert.ok(maxAligned < points.length, `${label}: all children collapsed into a straight boundary row`)
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
      assertNoClamp: total <= 16,
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
      assertNoClamp: true,
    })
  }
}

function assertBoundaryEndpoint(label: string, center: LayoutPoint, toward: LayoutPoint, size: LayoutSize) {
  const point = pointOnRectBoundary(center, toward, size)
  const rect = rectForPoint(center, size)
  const onHorizontalBoundary = Math.abs(point.x - rect.x) < 0.001 || Math.abs(point.x - (rect.x + rect.width)) < 0.001
  const onVerticalBoundary = Math.abs(point.y - rect.y) < 0.001 || Math.abs(point.y - (rect.y + rect.height)) < 0.001
  assert.ok(onHorizontalBoundary || onVerticalBoundary, `${label}: endpoint is not on the card boundary`)
  assert.ok(
    point.x >= rect.x - 0.001 &&
      point.x <= rect.x + rect.width + 0.001 &&
      point.y >= rect.y - 0.001 &&
      point.y <= rect.y + rect.height + 0.001,
    `${label}: endpoint is outside the card edge`,
  )
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

function assertPointNearlyEqual(actual: LayoutPoint, expected: LayoutPoint, label: string) {
  assert.ok(Math.abs(actual.x - expected.x) < 0.0001, `${label}: x mismatch`)
  assert.ok(Math.abs(actual.y - expected.y) < 0.0001, `${label}: y mismatch`)
}

function assertScreenEndpointTouchesCard({
  label,
  endpoint,
  cardCenter,
  cardDomSize,
  stage,
  viewBox,
}: {
  label: string
  endpoint: LayoutPoint
  cardCenter: LayoutPoint
  cardDomSize: LayoutSize
  stage: LayoutSize
  viewBox: LayoutSize
}) {
  const endpointScreen = domScreenPoint(endpoint, stage, viewBox)
  const centerScreen = domScreenPoint(cardCenter, stage, viewBox)
  const left = centerScreen.x - cardDomSize.width / 2
  const right = centerScreen.x + cardDomSize.width / 2
  const top = centerScreen.y - cardDomSize.height / 2
  const bottom = centerScreen.y + cardDomSize.height / 2
  const onXEdge = Math.abs(endpointScreen.x - left) < 0.0001 || Math.abs(endpointScreen.x - right) < 0.0001
  const onYEdge = Math.abs(endpointScreen.y - top) < 0.0001 || Math.abs(endpointScreen.y - bottom) < 0.0001

  assert.ok(onXEdge || onYEdge, `${label}: endpoint does not touch card boundary`)
  assert.ok(endpointScreen.x >= left - 0.0001 && endpointScreen.x <= right + 0.0001, `${label}: endpoint x is outside card bounds`)
  assert.ok(endpointScreen.y >= top - 0.0001 && endpointScreen.y <= bottom + 0.0001, `${label}: endpoint y is outside card bounds`)
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

for (const size of [DESKTOP_DIRECT_NODE_SIZE, DESKTOP_SECOND_DEGREE_SIZE, MOBILE_SECOND_DEGREE_SIZE]) {
  for (const toward of [
    { x: 820, y: 330 },
    { x: 180, y: 330 },
    { x: 530, y: 80 },
    { x: 530, y: 540 },
    { x: 820, y: 80 },
  ]) {
    assertBoundaryEndpoint(`edge endpoint ${size.width}x${size.height} toward ${toward.x},${toward.y}`, center, toward, size)
  }
}

const resizeSource = { x: 245, y: 120 }
const resizeTarget = { x: 80, y: -42 }
const resizeEndpoint = pointOnRectBoundary(resizeTarget, resizeSource, DESKTOP_SECOND_DEGREE_SIZE)
for (const stage of [{ width: 1000, height: 590 }, { width: 1280, height: 720 }, { width: 390, height: 600 }]) {
  const svgEndpoint = svgPointForDomGraphPoint(resizeEndpoint, stage, { width: 1000, height: 590 })
  assertPointNearlyEqual(
    meetScreenPoint(svgEndpoint, stage, { width: 1000, height: 590 }),
    domScreenPoint(resizeEndpoint, stage, { width: 1000, height: 590 }),
    `edge endpoint remains attached after resize/orientation at ${stage.width}x${stage.height}`,
  )
}

const desktopViewBox = { width: 1000, height: 590 }
const measuredSourceDomSize = { width: 180, height: 62 }
const measuredChildDomSize = { width: 158, height: 54 }
const source = { x: 760, y: 120 }
const target = { x: 1015, y: -84 }
for (const stage of [{ width: 1000, height: 590 }, { width: 1280, height: 720 }, { width: 820, height: 720 }, { width: 390, height: 600 }]) {
  const sourceSize = layoutSizeForDomSize(measuredSourceDomSize, stage, desktopViewBox, DESKTOP_DIRECT_NODE_SIZE)
  const targetSize = layoutSizeForDomSize(measuredChildDomSize, stage, desktopViewBox, DESKTOP_SECOND_DEGREE_SIZE)
  const endpoints = edgeEndpointsForRects(source, sourceSize, target, targetSize)

  assertScreenEndpointTouchesCard({
    label: `source endpoint touches measured card after resize ${stage.width}x${stage.height}`,
    endpoint: endpoints.source,
    cardCenter: source,
    cardDomSize: measuredSourceDomSize,
    stage,
    viewBox: desktopViewBox,
  })
  assertScreenEndpointTouchesCard({
    label: `target endpoint touches measured child card after resize ${stage.width}x${stage.height}`,
    endpoint: endpoints.target,
    cardCenter: target,
    cardDomSize: measuredChildDomSize,
    stage,
    viewBox: desktopViewBox,
  })
}

const clickedChildOptions = {
  root: { x: 245, y: 120 },
  center,
  total: 12,
  bounds: DESKTOP_EXPANDED_BOUNDS,
  size: DESKTOP_SECOND_DEGREE_SIZE,
  parentSize: DESKTOP_DIRECT_NODE_SIZE,
  avoid: [rectForPoint({ x: 245, y: 120 }, DESKTOP_DIRECT_NODE_SIZE)],
  maxColumns: Math.min(10, Math.max(4, Math.ceil(Math.sqrt(12 * 2)))),
}
const beforeClick = layoutExpandedNodeSlots(clickedChildOptions)
const afterChildClick = layoutExpandedNodeSlots(clickedChildOptions)
assert.deepEqual(afterChildClick, beforeClick, 'child click/selection does not change expanded child layout')

const outOfBoundsChild = beforeClick.find((point) => point.x < 40 || point.x > 960 || point.y < 30 || point.y > 560)
assert.ok(outOfBoundsChild, 'test fixture includes a child outside the old drag clamp')
const pointerPoint = { x: outOfBoundsChild.x - 12, y: outOfBoundsChild.y + 9 }
const pointerOffset = { x: 12, y: -9 }
assert.deepEqual(
  offsetLayoutPoint(pointerPoint, pointerOffset, null),
  outOfBoundsChild,
  'second-degree child drag preserves world position without viewport clamp',
)
assert.notDeepEqual(
  offsetLayoutPoint(pointerPoint, pointerOffset, { minX: 40, maxX: 960, minY: 30, maxY: 560 }),
  outOfBoundsChild,
  'old viewport clamp would have snapped the child to a boundary row',
)

console.log('KNOT GRAPH LAYOUT SMOKE: PASS')
