import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixedDesktop, moveDesktop, desktopBounds, arrangeDesktop } from '../src/client/canvas-desktop.js'
import { createCanvasState, openWindow, createEmptyGroup, windowWidth, windowHeight } from '../src/client/canvas-state.js'

const size = { width: 1000, height: 700, insets: { left: 220, top: 80, right: 20, bottom: 90 } }
const seed = () => openWindow(openWindow(createCanvasState(), { id: 'one' }, { x: 240, y: 100 }), { id: 'two' }, { x: 400, y: 100 })

test('fixed desktop recovers legacy offscreen cards and drafts without altering live conversations', () => {
  const original = seed()
  original.viewport = { x: -4000, y: 2000, zoom: .2 }
  original.windows[1] = { ...original.windows[1], x: -900, y: 4000, compact: false }
  const state = createEmptyGroup(original, { x: 9000, y: -2000 })
  const next = fixedDesktop(state, size)
  assert.deepEqual(next.viewport, { x: 0, y: 0, zoom: 1 })
  assert.deepEqual(next.windows[0], original.windows[0])
  assert.equal(next.windows[1].compact, false)
  assert.equal(next.active, state.active)
  assert.deepEqual(next.selected, state.selected)
  const bounds = desktopBounds(size)
  for (const item of [...next.windows.map(window => ({ ...window, width: 120, height: 112 })), ...next.groups.map(group => ({ ...group, width: 280, height: 180 }))]) {
    assert.ok(item.x >= bounds.left && item.x + item.width <= bounds.right)
    assert.ok(item.y >= bounds.top && item.y + item.height <= bounds.bottom)
  }
  assert.deepEqual(fixedDesktop(next, size), next)
  assert.equal(state.windows[1].x, -900)
})

test('multi-card dragging stops at each edge and preserves selection spacing', () => {
  const state = seed(), ids = state.windows.map(window => window.id)
  for (const [dx, dy] of [[-10000, -10000], [10000, 10000]]) {
    const next = moveDesktop(state, ids, dx, dy, size)
    assert.equal(next.windows[1].x - next.windows[0].x, 160)
    assert.equal(next.windows[1].y - next.windows[0].y, 0)
    assert.ok(next.windows[0].x >= 220)
    assert.ok(next.windows[1].x + 120 <= 980)
    assert.ok(next.windows[0].y >= 80 && next.windows[0].y + 112 <= 610)
  }
})

test('draft dragging clamps its own card and leaves member avatars independent', () => {
  const state = createEmptyGroup(seed(), { x: 500, y: 200 })
  const next = moveDesktop(state, [], 10000, -10000, size, state.groups[0].id)
  assert.equal(next.groups[0].x, 700)
  assert.equal(next.groups[0].y, 80)
  assert.deepEqual(next.windows, state.windows)
})

test('resizing the desktop rescues cards while expanding leaves healthy positions unchanged', () => {
  let state = seed()
  state.windows[0].x = 900
  state = fixedDesktop(state, { width: 800, height: 600 })
  assert.ok(state.windows[0].x + 120 <= 784)
  assert.deepEqual(fixedDesktop(state, size.width > 800 ? { width: 1400, height: 900 } : size), state)
})

test('explicit arrangement avoids widgets, other employees, rooms and drafts, and repeats deterministically', () => {
  let original = seed()
  for (let i = 0; i < 5; i++) original = openWindow(original, { id: `employee-${i}` })
  original = openWindow(original, { id: 'room', kind: 'room' })
  original = createEmptyGroup(original, { x: 400, y: 400 })
  const viewport = { width: 1440, height: 960, insets: { left: 24, top: 70, right: 24, bottom: 100 } }
  const obstacles = [{ x: 1100, y: 80, width: 300, height: 420 }, { x: 24, y: 70, width: 260, height: 250 }]
  const { state, fits } = arrangeDesktop(original, viewport, obstacles, ['two', 'one'])
  assert.equal(fits, true)
  const boxes = [...obstacles]
  const bounds = desktopBounds(viewport)
  for (const item of [...state.windows.map(w => ({ ...w, width: windowWidth(w), height: windowHeight(w) })), ...state.groups.filter(g => g.draft).map(g => ({ ...g, width: 280, height: 180 }))]) {
    assert.ok(item.x >= bounds.left && item.y >= bounds.top)
    assert.ok(item.x + item.width <= bounds.right && item.y + item.height <= bounds.bottom)
    for (const box of boxes) assert.ok(item.x >= box.x + box.width + 12 || item.x + item.width + 12 <= box.x || item.y >= box.y + box.height + 12 || item.y + item.height + 12 <= box.y)
    boxes.push(item)
  }
  assert.deepEqual(arrangeDesktop(state, viewport, obstacles, ['two', 'one']).state, state)
  assert.deepEqual(fixedDesktop(state, viewport), state)
  assert.equal(original.windows[0].x, 240)
})

test('crowded arrangement preserves the entire layout rather than hiding overflow', () => {
  const original = seed()
  const result = arrangeDesktop(original, size, [{ x: 0, y: 0, width: 1000, height: 700 }])
  assert.equal(result.fits, false)
  assert.equal(result.state, original)
  assert.equal(arrangeDesktop(original, size, []).fits, true)
})
