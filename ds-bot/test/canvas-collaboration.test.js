import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overlapMain, canvasPoint, canvasDropPoint, groupDropTarget, selectedMains, marqueeWindows, mergeHintPosition } from '../src/client/canvas-collaboration.js'

test('merge hint stays in viewport at edges and accounts for zoom and pan', () => {
  for (const viewport of [{ x: 0, y: 0, zoom: 1 }, { x: -200, y: 40, zoom: .5 }]) {
    for (const point of [{ x: 10, y: 10 }, { x: 750, y: 550 }, { x: 0, y: 600 }]) {
      const pos = mergeHintPosition(point, point, viewport, { width: 800, height: 600 }, { width: 340, height: 50 })
      assert.ok(pos.left >= 8 && pos.left + 340 <= 792)
      assert.ok(pos.top >= 8 && pos.top + 50 <= 592)
    }
  }
  assert.ok(mergeHintPosition({ x: 50, y: 38 }, { x: 80, y: 38 }, { x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 }, { width: 340, height: 50 }).top > 38)
})

test('only compact, visible main avatars can form a collision pair', () => {
  const a = { id: 'wa', entityId: 'a', kind: 'bot', compact: true, open: true, x: 100, y: 100, z: 1 }
  const b = { ...a, id: 'wb', entityId: 'b', x: 140, z: 2 }
  const roster = { mainBotIds: ['a', 'b'], byId: { a: {}, b: {} } }
  const state = { windows: [a, b] }
  assert.equal(overlapMain(state, roster, 'wa'), b)
  assert.equal(overlapMain(state, roster, 'wa', ['wb']), undefined)
  for (const patch of [{ compact: false }, { open: false }, { kind: 'room' }, { x: 300 }]) {
    assert.equal(overlapMain({ windows: [a, { ...b, ...patch }] }, roster, 'wa'), undefined)
  }
  assert.equal(overlapMain(state, { ...roster, mainBotIds: ['a'] }, 'wa'), b)
})

test('contact drop positions account for canvas origin, pan and zoom', () => {
  assert.deepEqual(canvasDropPoint({ viewport: { x: 20, y: -40, zoom: .5 } }, { left: 200, top: 100 }, 400, 200), { x: 300, y: 240 })
})

test('all employees can join real groups or drafts without management rights', () => {
  const main = { id: 'wa', entityId: 'a', kind: 'bot', compact: true, open: true, x: 20, y: 20 }
  const room = { id: 'wr', entityId: 'r', kind: 'room', compact: true, open: true, x: 300, y: 20, z: 5 }
  const roster = { mainBotIds: ['a'], byId: { a: {}, child: {} }, roomsById: { r: { mainOnly: true } } }
  const state = { windows: [main, room, { ...main, id: 'wc', entityId: 'child' }], groups: [{ id: 'draft', draft: true, x: 600, y: 300 }] }
  assert.deepEqual(groupDropTarget(state, roster, ['wa'], { x: 310, y: 30 }), { kind: 'room', id: 'r', windowId: 'wr' })
  assert.deepEqual(groupDropTarget(state, roster, ['wa'], { x: 650, y: 350 }), { kind: 'draft', id: 'draft' })
  assert.equal(groupDropTarget(state, roster, ['wa'], { x: 900, y: 350 }), null)
  assert.deepEqual(groupDropTarget(state, roster, ['wc'], { x: 310, y: 30 }), { kind: 'room', id: 'r', windowId: 'wr' })
  assert.deepEqual(groupDropTarget(state, roster, ['wa', 'wc'], { x: 310, y: 30 }), { kind: 'room', id: 'r', windowId: 'wr' })
  assert.deepEqual(groupDropTarget(state, { ...roster, roomsById: { r: {} } }, ['wa'], { x: 310, y: 30 }), { kind: 'room', id: 'r', windowId: 'wr' })
  assert.deepEqual(marqueeWindows(state, roster, { x: 0, y: 0, width: 1000, height: 700 }, true), ['wa', 'wc'])
  assert.deepEqual(selectedMains({ ...state, windows: [{ ...main, open: false }] }, roster, ['wa'], true), ['a'])
})


test('canvas coordinates share one origin, pan and zoom transform for pointer and contact drops', () => {
  const state = { viewport: { x: 20, y: -40, zoom: .5 } }
  const box = { left: 200, top: 100 }
  assert.deepEqual(canvasPoint(state, box, 400, 200), { x: 360, y: 280 })
  assert.deepEqual(canvasDropPoint(state, box, 400, 200), { x: 300, y: 240 })
})

test('group drops use visible card bounds including the wide right side and exclude space below its auto height', () => {
  const employee = { id: 'wc', entityId: 'child', kind: 'bot', compact: true, open: true, x: 20, y: 20 }
  const roster = { mainBotIds: [], byId: { child: {} }, roomsById: { room: { members: ['a', 'b'], admin: 'a' } } }
  for (const compact of [true, false]) {
    const room = { id: 'wr', entityId: 'room', kind: 'room', compact, open: true, x: 300, y: 20, z: 5, width: 420, height: 540 }
    const state = { windows: [employee, room], groups: [] }
    const boundsOf = window => window.id === 'wr' ? { x: 300, y: 20, width: 580, height: 126 } : undefined
    const expected = { kind: 'room', id: 'room', windowId: 'wr' }
    assert.deepEqual(groupDropTarget(state, roster, ['wc'], { x: 879, y: 80 }, boundsOf), expected)
    assert.equal(groupDropTarget(state, roster, ['wc'], { x: 881, y: 80 }, boundsOf), null)
    assert.equal(groupDropTarget(state, roster, ['wc'], { x: 500, y: 147 }, boundsOf), null)
  }
})
