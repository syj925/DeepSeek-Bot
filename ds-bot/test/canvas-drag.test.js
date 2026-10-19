import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dragGeometry } from '../src/client/canvas-drag.js'
import { overlapMain, MERGE_PREVIEW_DISTANCE } from '../src/client/canvas-collaboration.js'

const state = () => ({ windows: [
  { id: 'a', entityId: 'a', kind: 'bot', x: 100, y: 100, open: true, compact: true },
  { id: 'b', entityId: 'b', kind: 'bot', x: 300, y: 100, open: true, compact: true },
], groups: [], selected: [] })
const roster = { byId: { a: {}, b: {} } }
test('preview includes 120px, release excludes 58px and no target outside preview', () => {
  for (const [distance, preview, commit] of [[121, false, false], [120, true, false], [80, true, false], [58, true, false], [57.99, true, true], [0, true, true]]) {
    const current = state(); current.windows[1].x = 100 + distance
    assert.equal(Boolean(overlapMain(current, roster, 'a', [], MERGE_PREVIEW_DISTANCE)), preview)
    assert.equal(Boolean(overlapMain(current, roster, 'a')), commit)
  }
})
test('temporary positions preserve untouched references, order and selection offsets', () => {
  const current = state(), before = structuredClone(current)
  const moved = dragGeometry(current, ['a'], 25, 12, { width: 1000, height: 700 })
  assert.deepEqual(current, before)
  assert.equal(moved.windows[1], current.windows[1])
  assert.deepEqual([moved.windows[0].x, moved.windows[0].y], [125, 112])
  const edge = dragGeometry(current, ['a', 'b'], -999, 999, { width: 1000, height: 700 })
  assert.equal(edge.windows[0].x, 16)
  assert.equal(edge.windows[1].x - edge.windows[0].x, 200)
  assert.equal(edge.windows[0].y, edge.windows[1].y)
})
