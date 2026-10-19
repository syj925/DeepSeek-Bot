import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitChat, resizeChat } from '../src/client/chat-geometry.js'

const box = { left: 100, top: 100, right: 900, bottom: 600 }
const bounds = { left: 0, top: 0, right: 1200, bottom: 800 }
test('all resize edges keep the opposite edge fixed', () => {
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const next = resizeChat(box, bounds, edge, 30, 20)
    const left = 500 + next.x - next.width / 2, right = left + next.width
    const top = 350 + next.y - next.height / 2, bottom = top + next.height
    assert.equal(left, edge.includes('w') ? 130 : 100)
    assert.equal(right, edge.includes('e') ? 930 : 900)
    assert.equal(top, edge.includes('n') ? 120 : 100)
    assert.equal(bottom, edge.includes('s') ? 620 : 600)
  }
})
test('resize enforces usable minimums and canvas margins', () => {
  const small = resizeChat(box, bounds, 'se', -5000, -5000)
  assert.equal(small.width, 560); assert.equal(small.height, 360)
  const large = resizeChat(box, bounds, 'nw', -5000, -5000)
  assert.equal(large.width, 888); assert.equal(large.height, 588)
  const east = resizeChat(box, bounds, 'se', 5000, 5000)
  assert.equal(east.width, 1088); assert.equal(east.height, 688)
})
test('shrinking the app keeps a manually sized dialog inside its viewport', () => {
  assert.deepEqual(fitChat({ width: 1000, height: 700 }, { x: 200, y: -200 }, 800, 600), {
    size: { width: 776, height: 576 }, offset: { x: 0, y: 0 },
  })
})
