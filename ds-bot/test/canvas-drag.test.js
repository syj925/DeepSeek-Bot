import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dragGeometry, paintCanvasDrag } from '../src/client/canvas-drag.js'
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

test('Dock movement follows the pointer even when the rendered origin was clamped by the desktop', () => {
  const original = state()
  original.windows[0].y = 638
  const latest = dragGeometry(original, ['a'], 240, -422)
  const node = { dataset: { windowId: 'a' }, style: { left: '100px', top: '520px' }, isConnected: true }
  const untouched = { dataset: { windowId: 'b' }, style: { left: '300px', top: '100px' } }
  const root = { dataset: {}, querySelectorAll: () => [node, untouched] }
  const current = { kind: 'avatar', state: original, latest, ids: ['a'] }
  const before = structuredClone(original)
  paintCanvasDrag(current, root)
  const displacement = node.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px,0\)/).slice(1).map(Number)
  assert.deepEqual([parseFloat(node.style.left) + displacement[0], parseFloat(node.style.top) + displacement[1]], [340, 216])
  assert.deepEqual(original, before, 'painting must not rewrite saved geometry')
  assert.equal(untouched.style.transform, undefined)
  assert.equal(node.style.transition, 'none')
})

test('Dock preview picks up a newly mounted icon after an empty first frame and follows rendered origin changes', () => {
  const latest = state(), current = { kind: 'avatar', latest, ids: ['a'] }
  const node = { dataset: { windowId: 'a' }, style: { left: '24px', top: '300px' }, isConnected: true }
  let mounted = [], scans = 0
  const root = { dataset: {}, querySelectorAll: () => { scans++; return mounted } }
  paintCanvasDrag(current, root)
  mounted = [node]
  paintCanvasDrag(current, root)
  assert.equal(node.style.transform, 'translate3d(76px,-200px,0)')
  node.style.top = '260px'
  paintCanvasDrag(current, root)
  assert.equal(node.style.transform, 'translate3d(76px,-160px,0)')
  assert.equal(scans, 2, 'a mounted icon must be reused between pointer frames')
  node.isConnected = false
  const replacement = { ...node, style: { left: '50px', top: '100px' }, isConnected: true }
  mounted = [replacement]
  paintCanvasDrag(current, root)
  assert.equal(replacement.style.transform, 'translate3d(50px,0px,0)')
})
