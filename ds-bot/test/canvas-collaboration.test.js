import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overlapMain, canvasDropPoint } from '../src/client/canvas-collaboration.js'

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
