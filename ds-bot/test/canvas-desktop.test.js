import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixedDesktop, moveDesktop, desktopBounds } from '../src/client/canvas-desktop.js'
import { createCanvasState, openWindow, createEmptyGroup } from '../src/client/canvas-state.js'

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
