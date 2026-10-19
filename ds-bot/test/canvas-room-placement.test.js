import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCanvasState, openWindow, moveWindow, readCanvas, writeCanvas } from '../src/client/canvas-state.js'
import { placeNewRoom, roomPlacementLayout } from '../src/client/canvas-room-placement.js'

const layout = { left: 340, top: 120, right: 1000, bottom: 600 }
const roomOf = (state, id) => state.windows.find(window => window.kind === 'room' && window.entityId === id)

test('new room avatars fill a vertical column before starting the next column', () => {
  let state = createCanvasState()
  for (const id of ['first', 'second', 'third', 'fourth']) state = placeNewRoom(state, id, layout)
  assert.deepEqual(state.windows.map(({ x, y }) => [x, y]), [[340, 120], [340, 276], [340, 432], [484, 120]])
  assert.ok(state.windows.every(window => window.compact && window.open))
  assert.equal(state.active, null)
  assert.deepEqual(state.selected, [])
})

test('new rooms use the first empty slot without moving existing employee or group avatars', () => {
  let state = openWindow(createCanvasState(), { id: 'employee' }, { x: 340, y: 120 })
  state = openWindow(state, { kind: 'room', id: 'manual-room' }, { x: 340, y: 432, compact: false })
  const before = JSON.parse(JSON.stringify(state))
  const next = placeNewRoom(state, 'new-room', layout)
  const room = roomOf(next, 'new-room')
  assert.deepEqual([room.x, room.y], [340, 276])
  assert.equal(room.compact, true)
  assert.deepEqual(next.windows.slice(0, 2), before.windows)
  assert.equal(next.active, before.active)
  assert.deepEqual(next.selected, before.selected)
  assert.deepEqual(state, before)
})

test('opening the seeded real room conversation preserves its aligned initial position', () => {
  const placed = placeNewRoom(createCanvasState(), 'real-room', layout)
  const opened = openWindow(placed, { kind: 'room', id: 'real-room' }, { compact: false })
  assert.equal(opened.windows.length, 1)
  assert.deepEqual([roomOf(opened, 'real-room').x, roomOf(opened, 'real-room').y], [340, 120])
  assert.equal(roomOf(opened, 'real-room').compact, false)
})

test('manual room positions survive another placement attempt, persistence and sidebar movement', () => {
  let state = placeNewRoom(createCanvasState(), 'saved-room', layout)
  state = moveWindow(state, roomOf(state, 'saved-room').id, 300, 75)
  assert.equal(placeNewRoom(state, 'saved-room', { ...layout, left: 50, top: 50 }), state)
  let saved
  const storage = { setItem: (key, value) => { saved = value }, getItem: () => saved }
  writeCanvas(storage, state)
  const restored = readCanvas(storage)
  assert.equal(placeNewRoom(restored, 'saved-room', layout), restored)
  assert.deepEqual([roomOf(restored, 'saved-room').x, roomOf(restored, 'saved-room').y], [640, 195])
  assert.equal(placeNewRoom({ ...restored, windows: restored.windows.map(window => ({ ...window, open: false })) }, 'saved-room', layout).windows[0].open, false)
})

test('DOM-relative slots convert to canvas coordinates under pan and zoom', () => {
  for (const zoom of [.5, 2]) {
    const state = createCanvasState({ viewport: { x: 90, y: -35, zoom } })
    const first = placeNewRoom(state, 'first', { ...layout, bottom: 900 })
    const next = placeNewRoom(first, 'second', { ...layout, bottom: 900 })
    const one = roomOf(next, 'first'), two = roomOf(next, 'second')
    assert.equal(one.x * zoom + 90, layout.left)
    assert.equal(one.y * zoom - 35, layout.top)
    assert.equal(two.x, one.x)
    assert.equal((two.y - one.y) * zoom, 132 * zoom + 24)
    assert.deepEqual(next.viewport, state.viewport)
  }
})

test('live team boundaries are measured in the visible canvas coordinate system', () => {
  const team = { getClientRects: () => [1], getBoundingClientRect: () => ({ right: 420, top: 154 }) }
  const frame = { querySelector: selector => selector === '.bt-floating-team' ? team : null }
  const visible = { getClientRects: () => [1], closest: () => frame, getBoundingClientRect: () => ({ left: 100, top: 50, width: 1100, height: 800 }) }
  const hidden = { getClientRects: () => [] }
  const doc = { querySelectorAll: () => [hidden, visible] }
  const size = { insets: { left: 24, top: 80, right: 20, bottom: 80 } }
  assert.deepEqual(roomPlacementLayout(doc, size), { left: 344, top: 120, right: 1080, bottom: 720 })
  team.getBoundingClientRect = () => ({ right: 500, top: 210 })
  assert.deepEqual(roomPlacementLayout(doc, size), { left: 424, top: 176, right: 1080, bottom: 720 })
  team.getClientRects = () => []
  assert.equal(roomPlacementLayout(doc, size), null)
})

test('missing panel, invalid viewport and full columns leave the current desktop unchanged', () => {
  const state = createCanvasState()
  assert.equal(roomPlacementLayout({}, {}), null)
  assert.equal(placeNewRoom(state, 'new', null), state)
  assert.equal(placeNewRoom(state, 'new', { left: 340, right: 440, top: 120, bottom: 200 }), state)
  const invalid = { ...state, viewport: { x: 0, y: 0, zoom: 0 } }
  assert.equal(placeNewRoom(invalid, 'new', layout), invalid)
  const full = placeNewRoom(state, 'occupied', { left: 340, right: 460, top: 120, bottom: 252 })
  assert.equal(placeNewRoom(full, 'overflow', { left: 340, right: 460, top: 120, bottom: 252 }), full)
})
