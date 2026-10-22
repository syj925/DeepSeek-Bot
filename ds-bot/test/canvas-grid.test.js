import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopGrid, snapDesktopWindows } from '../src/client/canvas-grid.js'
import { createCanvasState, openWindow, collapseWindow } from '../src/client/canvas-state.js'

const size = { width: 1000, height: 800, insets: { left: 24, top: 24, right: 24, bottom: 96 } }
const seed = (kind = 'bot', id = 'one', x = 213, y = 225) => openWindow(createCanvasState(), { id, kind }, { x, y })
const positions = state => state.windows.map(({ id, x, y, open }) => ({ id, x, y, open }))
const onGrid = (window, state, grid) => {
  assert.equal((state.viewport.x + window.x * state.viewport.zoom - grid.left) % grid.width, 0)
  assert.equal((state.viewport.y + window.y * state.viewport.zoom - grid.top) % grid.height, 0)
}

test('an Agent and a group each occupy the same nearest grid unit', () => {
  const results = ['bot', 'room'].map(kind => {
    const state = seed(kind)
    const result = snapDesktopWindows(state, [state.windows[0].id], size)
    assert.equal(result.fits, true)
    assert.deepEqual([result.state.windows[0].x, result.state.windows[0].y], [184, 200])
    assert.deepEqual([result.placements[0].width, result.placements[0].height], [120, 132])
    onGrid(result.state.windows[0], result.state, result.grid)
    assert.deepEqual([state.windows[0].x, state.windows[0].y], [213, 225])
    assert.equal(result.state.windows[0].kind, kind)
    return result.placements[0]
  })
  assert.deepEqual(results.map(({ left, top, width, height }) => ({ left, top, width, height })), [
    { left: 184, top: 200, width: 120, height: 132 }, { left: 184, top: 200, width: 120, height: 132 },
  ])
})

test('occupied cells and widgets are skipped without moving existing objects or opening conversations', () => {
  let state = seed('room', 'fixed', 184, 200)
  state = openWindow(state, { id: 'moving', kind: 'bot' }, { x: 190, y: 210 })
  state.windows[0].compact = false
  const original = positions(state), moving = state.windows[1].id
  const result = snapDesktopWindows(state, [moving], size, [{ x: 344, y: 200, width: 120, height: 132 }])
  assert.equal(result.fits, true)
  assert.deepEqual(positions(result.state)[0], original[0])
  assert.equal(result.state.windows[0].compact, false)
  assert.notDeepEqual([result.state.windows[1].x, result.state.windows[1].y], [184, 200])
  assert.notDeepEqual([result.state.windows[1].x, result.state.windows[1].y], [344, 200])
  assert.deepEqual(positions(state), original)
  onGrid(result.state.windows[1], result.state, result.grid)
})

test('multi-selection gets distinct cells and a repeat drop is stable', () => {
  const state = openWindow(seed(), { id: 'two', kind: 'room' }, { x: 218, y: 228 })
  const ids = state.windows.map(window => window.id)
  const result = snapDesktopWindows(state, ids, size)
  assert.equal(result.fits, true)
  assert.equal(new Set(result.placements.map(place => `${place.left},${place.top}`)).size, 2)
  result.state.windows.forEach(window => onGrid(window, result.state, result.grid))
  assert.deepEqual(snapDesktopWindows(result.state, ids, size).state, result.state)
})

test('a full grid cancels the entire placement instead of overlapping or evicting objects', () => {
  const state = openWindow(seed(), { id: 'two', kind: 'room' }, { x: 1, y: 1 })
  const ids = state.windows.map(window => window.id)
  const tiny = { width: 160, height: 180, insets: { left: 12, top: 12, right: 12, bottom: 12 } }
  const result = snapDesktopWindows(state, ids, tiny)
  assert.equal(result.fits, false)
  assert.equal(result.state, state)
  assert.deepEqual(result.placements, [])
})

test('closed desktop avatars free their cells while entity data is kept', () => {
  let state = seed('room', 'fixed', 184, 200)
  state = collapseWindow(state, state.windows[0].id)
  state = openWindow(state, { id: 'moving', kind: 'bot' }, { x: 190, y: 210 })
  const result = snapDesktopWindows(state, [state.windows[1].id], size)
  assert.equal(result.fits, true)
  assert.deepEqual([result.state.windows[1].x, result.state.windows[1].y], [184, 200])
  assert.equal(result.state.windows[0].entityId, 'fixed')
  assert.equal(result.state.windows[0].open, false)
})

test('grid alignment converts screen cells through the existing pan and zoom', () => {
  const state = { ...seed(), viewport: { x: 37, y: -23, zoom: .5 } }
  const result = snapDesktopWindows(state, [state.windows[0].id], size)
  assert.equal(result.fits, true)
  onGrid(result.state.windows[0], result.state, result.grid)
  assert.deepEqual(result.state.viewport, state.viewport)
  assert.deepEqual(desktopGrid(size), { left: 24, top: 24, right: 976, bottom: 704, width: 160, height: 176, unitWidth: 120, unitHeight: 132 })
})
