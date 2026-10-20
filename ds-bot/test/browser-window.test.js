import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitBrowserWindow } from '../src/client/browser-window.js'

test('a saved browser window remains reachable after moving to a smaller display', () => {
  const box = fitBrowserWindow({ left: 1800, top: 900, width: 1200, height: 900 }, { width: 900, height: 600, top: 32 })
  assert.ok(box.left >= 16 && box.top >= 48)
  assert.ok(box.left + box.width <= 884)
  assert.ok(box.top + box.height <= 584)
})

test('browser window sizing handles narrow and invalid saved dimensions', () => {
  const box = fitBrowserWindow({ left: NaN, top: -100, width: Infinity, height: -1 }, { width: 320, height: 480, top: 20 })
  assert.deepEqual(box, { left: 6, top: 26, width: 308, height: 320 })
})
