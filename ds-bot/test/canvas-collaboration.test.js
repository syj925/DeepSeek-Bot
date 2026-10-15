import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overlapMain, canvasDropPoint, groupDropTarget, selectedMains, marqueeWindows } from '../src/client/canvas-collaboration.js'

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
  assert.equal(overlapMain(state, { ...roster, mainBotIds: ['a'] }, 'wa'), undefined)
})

test('contact drop positions account for canvas origin, pan and zoom', () => {
  assert.deepEqual(canvasDropPoint({ viewport: { x: 20, y: -40, zoom: .5 } }, { left: 200, top: 100 }, 400, 200), { x: 300, y: 240 })
})

test('group hit testing accepts only Main Agent selections and real main-only rooms or drafts', () => {
  const main = { id: 'wa', entityId: 'a', kind: 'bot', compact: true, open: true, x: 20, y: 20 }
  const room = { id: 'wr', entityId: 'r', kind: 'room', compact: true, open: true, x: 300, y: 20, z: 5 }
  const roster = { mainBotIds: ['a'], byId: { a: {}, child: {} }, roomsById: { r: { mainOnly: true } } }
  const state = { windows: [main, room, { ...main, id: 'wc', entityId: 'child' }], groups: [{ id: 'draft', draft: true, x: 600, y: 300 }] }
  assert.deepEqual(groupDropTarget(state, roster, ['wa'], { x: 310, y: 30 }), { kind: 'room', id: 'r', windowId: 'wr' })
  assert.deepEqual(groupDropTarget(state, roster, ['wa'], { x: 650, y: 350 }), { kind: 'draft', id: 'draft' })
  assert.equal(groupDropTarget(state, roster, ['wa'], { x: 900, y: 350 }), null)
  assert.equal(groupDropTarget(state, roster, ['wc'], { x: 310, y: 30 }), null)
  assert.equal(groupDropTarget(state, roster, ['wa', 'wc'], { x: 310, y: 30 }), null)
  assert.equal(groupDropTarget(state, { ...roster, roomsById: { r: {} } }, ['wa'], { x: 310, y: 30 }), null)
  assert.deepEqual(marqueeWindows(state, roster, { x: 0, y: 0, width: 1000, height: 700 }, true), ['wa'])
  assert.deepEqual(selectedMains({ ...state, windows: [{ ...main, open: false }] }, roster, ['wa'], true), ['a'])
})
