import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CANVAS_LIMITS, CANVAS_STORAGE_KEY, DEFAULT_CANVAS, collapseWindow, compactConversations, createCanvasState,
  fitViewport, groupWindows, moveWindow, normalizeCanvas, openWindow, readCanvas,
  reconcileCanvas, resizeWindow, setCanvasSelection, setCanvasViewport, setWindowCompact,
  ungroupWindows, windowBounds, windowHeight, windowWidth, writeCanvas, arrangeCards,
} from '../src/client/canvas-state.js'

const employee = id => ({ id, kind: 'bot' })
const room = id => ({ id, kind: 'room' })
const roster = (bots, rooms = [], ready = true) => ({ ready, bots: bots.map(id => ({ id, sessionId: `${id}-part` })), rooms: rooms.map(id => ({ id })) })
const memoryStorage = () => {
  const values = new Map()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const withEmployees = () => ['chief', 'coder', 'writer'].reduce((state, id) => openWindow(state, employee(id)), createCanvasState())

test('opening an existing employee reuses its stable window and geometry', () => {
  const initial = openWindow(createCanvasState(), employee('chief'), { x: -120, y: 75, width: 520, height: 610 })
  const second = openWindow(initial, employee('coder'))
  const opened = openWindow(second, employee('chief'), { x: 999, width: 999 })
  assert.equal(opened.windows.length, 2)
  const chief = opened.windows.find(window => window.entityId === 'chief')
  assert.deepEqual({ id: chief.id, x: chief.x, y: chief.y, width: chief.width, height: chief.height }, {
    id: initial.windows[0].id, x: -120, y: 75, width: 520, height: 610,
  })
  assert.equal(opened.active, chief.id)
  assert.deepEqual(opened.selected, [chief.id])
  assert.ok(chief.z > opened.windows.find(window => window.entityId === 'coder').z)
  assert.equal(initial.windows.length, 1)
})

test('a current conversation part change leaves employee identity and layout intact', () => {
  const state = openWindow(createCanvasState(), employee('chief'), { x: 120, y: -20 })
  const before = reconcileCanvas(state, { ready: true, bots: [{ id: 'chief', sessionId: 'part-one' }], rooms: [] })
  const after = reconcileCanvas(before, { ready: true, bots: [{ id: 'chief', sessionId: 'part-two', parts: ['chief', 'part-one', 'part-two'] }], rooms: [] })
  assert.deepEqual(after, before)
  assert.equal(after.windows[0].entityId, 'chief')
  assert.equal('sessionId' in after.windows[0], false)
})

test('collapse changes only layout and reopening keeps the same entity and window', () => {
  const state = withEmployees(), chief = state.windows[0]
  const collapsed = collapseWindow(state, chief.id)
  assert.equal(collapsed.windows.length, state.windows.length)
  assert.equal(collapsed.windows[0].open, false)
  assert.equal(state.windows[0].open, true)
  assert.equal(collapsed.selected.includes(chief.id), false)
  assert.notEqual(collapsed.active, chief.id)
  const reopened = openWindow(collapsed, employee('chief'))
  assert.equal(reopened.windows[0].id, chief.id)
  assert.equal(reopened.windows[0].x, chief.x)
  assert.equal(reopened.windows[0].open, true)
})

test('malformed and unavailable storage produce a fresh independent state', () => {
  const storage = memoryStorage()
  storage.values.set(CANVAS_STORAGE_KEY, '{broken')
  const first = readCanvas(storage), second = readCanvas(storage)
  assert.deepEqual(first, DEFAULT_CANVAS)
  assert.notEqual(first.windows, second.windows)
  assert.deepEqual(readCanvas({ getItem: () => { throw new Error('denied') } }), DEFAULT_CANVAS)
  assert.equal(writeCanvas({ setItem: () => { throw new Error('full') } }, first), false)
  assert.deepEqual(normalizeCanvas({ version: 99, windows: [employee('chief')] }), DEFAULT_CANVAS)
})

test('persistence strips business data and legacy manual relation data', () => {
  const storage = memoryStorage(), state = openWindow(createCanvasState(), employee('chief'))
  const dirty = {
    ...state, employees: [{ id: 'chief', messages: ['private'] }], rooms: [{ id: 'room' }], edges: [{ source: 'chief' }], selectedEdge: 'edge',
    windows: [{ ...state.windows[0], name: 'Chief', sessionId: 'part-2', messages: ['private'], draft: 'draft', memory: 'memory', permissions: ['all'] }],
  }
  assert.equal(writeCanvas(storage, dirty), true)
  assert.equal(storage.values.size, 1)
  const raw = JSON.parse(storage.values.get(CANVAS_STORAGE_KEY))
  assert.deepEqual(Object.keys(raw).sort(), ['active', 'groups', 'selected', 'version', 'viewport', 'windows'])
  assert.deepEqual(Object.keys(raw.windows[0]).sort(), ['compact', 'entityId', 'height', 'id', 'kind', 'open', 'width', 'x', 'y', 'z'])
  assert.deepEqual(readCanvas(storage), state)
})

test('normalization deduplicates identities and clamps untrusted geometry', () => {
  const state = normalizeCanvas({
    version: 1,
    windows: [
      { id: 'a', kind: 'bot', entityId: 'chief', x: Infinity, y: -1e12, width: -20, height: 1e12, z: NaN },
      { id: 'b', kind: 'bot', entityId: 'chief' },
      { id: 'a', kind: 'room', entityId: 'room-one' },
      { id: 'c', kind: 'agent', entityId: 'plain' },
      { kind: 'bot', entityId: '' },
    ],
    viewport: { x: NaN, y: Infinity, zoom: 1e8 }, selected: ['a', 'a', 'missing'], active: 'missing',
  })
  assert.equal(state.windows.length, 1)
  assert.equal(state.windows[0].x, 0)
  assert.equal(state.windows[0].y, -CANVAS_LIMITS.coordinate)
  assert.equal(state.windows[0].width, CANVAS_LIMITS.minWidth)
  assert.equal(state.windows[0].height, CANVAS_LIMITS.maxSize)
  assert.deepEqual(state.viewport, { x: 0, y: 0, zoom: CANVAS_LIMITS.maxZoom })
  assert.deepEqual(state.selected, ['a'])
  assert.equal(state.active, 'a')
})

test('new entity windows do not reuse an unrelated persisted window id', () => {
  const state = createCanvasState({ windows: [{ id: 'canvas-bot-writer', kind: 'bot', entityId: 'chief' }] })
  const opened = openWindow(state, employee('writer'))
  assert.equal(new Set(opened.windows.map(window => window.id)).size, 2)
  assert.equal(normalizeCanvas(opened).windows.length, 2)
  assert.equal(opened.windows[0].entityId, 'chief')
})

test('visual grouping and ungrouping do not create or change a Room', () => {
  const state = openWindow(withEmployees(), room('room-one'))
  const ids = state.windows.slice(0, 2).map(window => window.id)
  const grouped = groupWindows(state, ids, { id: 'project', name: 'Project' })
  assert.equal(grouped.groups.length, 1)
  assert.deepEqual(grouped.groups[0], { id: 'project', name: 'Project', members: ids })
  assert.deepEqual(grouped.windows, state.windows)
  assert.equal('rooms' in grouped, false)
  const ungrouped = ungroupWindows(grouped, 'project')
  assert.deepEqual(ungrouped.windows, state.windows)
  assert.deepEqual(ungrouped.groups, [])
})

test('regrouping moves layout members and removes groups with fewer than two windows', () => {
  const state = withEmployees(), ids = state.windows.map(window => window.id)
  const first = groupWindows(state, ids.slice(0, 2), { id: 'first' })
  const second = groupWindows(first, ids.slice(1), { id: 'second' })
  assert.deepEqual(second.groups, [{ id: 'second', name: 'Window group', members: ids.slice(1) }])
  assert.equal(first.groups.length, 1)
})

test('roster loading preserves saved windows; a complete roster cleans deleted references', () => {
  const state = openWindow(withEmployees(), room('room-one'))
  const ids = state.windows.map(window => window.id)
  const grouped = groupWindows(setCanvasSelection(state, ids, ids[2]), ids.slice(0, 3), { id: 'team' })
  assert.deepEqual(reconcileCanvas(grouped, roster([], [], false)), grouped)
  assert.deepEqual(reconcileCanvas(grouped, { bots: [], rooms: [] }), grouped)
  const pruned = reconcileCanvas(grouped, roster(['chief', 'coder']))
  assert.deepEqual(pruned.windows.map(window => window.entityId), ['chief', 'coder'])
  assert.deepEqual(pruned.groups[0].members, ids.slice(0, 2))
  assert.deepEqual(pruned.selected, ids.slice(0, 2))
  assert.ok(ids.slice(0, 2).includes(pruned.active))
  const last = reconcileCanvas(pruned, roster(['chief']))
  assert.deepEqual(last.groups, [])
  assert.deepEqual(reconcileCanvas(last, roster([])), DEFAULT_CANVAS)
})

test('movement and resize are immutable and bounded without changing entity references', () => {
  const state = withEmployees(), ids = state.windows.slice(0, 2).map(window => window.id)
  const moved = moveWindow(state, ids, 25, -10)
  for (let index = 0; index < 2; index += 1) {
    assert.equal(moved.windows[index].x, state.windows[index].x + 25)
    assert.equal(moved.windows[index].y, state.windows[index].y - 10)
  }
  assert.deepEqual(moved.windows[2], state.windows[2])
  const clamped = moveWindow(moved, ids[0], 1e12, -1e12)
  assert.equal(clamped.windows[0].x, CANVAS_LIMITS.coordinate)
  assert.equal(clamped.windows[0].y, -CANVAS_LIMITS.coordinate)
  const resized = resizeWindow(state, ids[0], -1e12, 1e12)
  assert.equal(resized.windows[0].width, CANVAS_LIMITS.minWidth)
  assert.equal(resized.windows[0].height, CANVAS_LIMITS.maxSize)
  assert.equal(resized.windows[0].entityId, 'chief')
  assert.equal(state.windows[0].width, 760)
})

test('compact toggles preserve a window identity and its expanded dimensions', () => {
  const state = openWindow(createCanvasState(), employee('chief'), { width: 600, height: 650, compact: false })
  const compact = setWindowCompact(state, 'chief', true)
  assert.equal(compact.windows[0].compact, true)
  assert.equal(compact.windows[0].height, 650)
  assert.equal(windowWidth(compact.windows[0]), 120)
  assert.equal(windowHeight(compact.windows[0]), 112)
  assert.equal(windowBounds(compact).height, 112)
  assert.equal(fitViewport(compact, { width: 700, height: 300 }, 30).viewport.zoom, 1)
  assert.deepEqual(setWindowCompact(compact, 'chief', false), state)
})

test('compact rooms retain their summary size while employee entries use avatar bounds', () => {
  let state = openWindow(createCanvasState(), employee('chief'), { x: 20, y: 30, width: 620, height: 700 })
  state = openWindow(state, room('planning'), { x: 172, y: 30, width: 540, height: 640 })
  assert.deepEqual(state.windows.map(window => [windowWidth(window), windowHeight(window)]), [[120, 112], [320, 200]])
  assert.deepEqual(windowBounds(state), { x: 20, y: 30, width: 472, height: 200, right: 492, bottom: 230 })
  const expanded = setWindowCompact(setWindowCompact(state, 'chief', false), 'planning', false)
  assert.deepEqual(expanded.windows.map(window => [windowWidth(window), windowHeight(window)]), [[620, 700], [540, 640]])
  const fitted = fitViewport(state, { width: 500, height: 300 }, 30)
  assert.equal(fitted.viewport.zoom, 440 / 472)
  assert.equal(fitted.viewport.x + 20 * fitted.viewport.zoom, 30)
  assert.equal(fitted.viewport.x + 492 * fitted.viewport.zoom, 470)
})

test('new entries use actual visible bounds to avoid existing avatars, rooms and expanded windows', () => {
  let state = withEmployees()
  assert.deepEqual(state.windows.map(({ x, y }) => ({ x, y })), [{ x: 40, y: 100 }, { x: 192, y: 100 }, { x: 344, y: 100 }])
  state = openWindow(state, room('planning'))
  assert.deepEqual({ x: state.windows[3].x, y: state.windows[3].y }, { x: 496, y: 100 })
  state = setWindowCompact(state, 'planning', false)
  state = openWindow(state, employee('reviewer'))
  assert.deepEqual({ x: state.windows[4].x, y: state.windows[4].y }, { x: 40, y: 244 })
  const reviewer = state.windows[4], planning = state.windows[3]
  assert.ok(reviewer.x + windowWidth(reviewer) < planning.x)
  const closed = collapseWindow(state, 'chief')
  const reusedSpace = openWindow(closed, employee('tester'))
  assert.deepEqual({ x: reusedSpace.windows[5].x, y: reusedSpace.windows[5].y }, { x: 40, y: 100 })
})

test('fit includes open windows only and keeps them within a feasible viewport', () => {
  let state = openWindow(createCanvasState(), employee('chief'), { x: -300, y: 100, width: 400, height: 400 })
  state = openWindow(state, employee('coder'), { x: 200, y: 100, width: 400, height: 400 })
  state = openWindow(state, employee('hidden'), { x: 10000, y: 10000 })
  state = collapseWindow(state, 'hidden')
  const fitted = fitViewport(state, { width: 1000, height: 700 }, 50)
  for (const window of fitted.windows.filter(item => item.open)) {
    const { x, y, zoom } = fitted.viewport
    assert.ok(x + window.x * zoom >= 50)
    assert.ok(y + window.y * zoom >= 50)
    assert.ok(x + (window.x + windowWidth(window)) * zoom <= 950)
    assert.ok(y + (window.y + windowHeight(window)) * zoom <= 650)
  }
  assert.deepEqual(fitted.windows, state.windows)
  assert.deepEqual(fitViewport(state, { width: 0, height: 10 }), state)
  assert.equal(setCanvasViewport(state, { zoom: -1 }).viewport.zoom, CANVAS_LIMITS.minZoom)
})

test('fit and focus reserve measured toolbar and dock space on narrow screens', () => {
  let state = openWindow(createCanvasState(), employee('chief'), { x: -300, y: 100, width: 420, height: 540 })
  state = openWindow(state, employee('coder'), { x: 2000, y: -2000 })
  const focused = fitViewport(state, { width: 390, height: 800 }, { left: 24, right: 24, top: 210, bottom: 150 }, [state.windows[0].id])
  const window = focused.windows[0], { x, y, zoom } = focused.viewport
  assert.ok(x + window.x * zoom >= 24)
  assert.ok(y + window.y * zoom >= 210)
  assert.ok(x + (window.x + windowWidth(window)) * zoom <= 366)
  assert.ok(y + (window.y + windowHeight(window)) * zoom <= 650)
  assert.deepEqual(focused.windows, state.windows)
})

test('fit keeps the visual group header below the toolbar', () => {
  const state = withEmployees(), ids = state.windows.map(window => window.id)
  const grouped = groupWindows(state, ids)
  const fitted = fitViewport(grouped, { width: 1200, height: 800 }, { left: 24, right: 24, top: 100, bottom: 90 })
  const top = Math.min(...fitted.windows.map(window => window.y)) - 45
  assert.ok(fitted.viewport.y + top * fitted.viewport.zoom >= 100)
})

test('new employees and rooms remain compact until explicitly expanded', () => {
  let state = openWindow(withEmployees(), room('planning'))
  assert.ok(state.windows.every(window => window.compact))
  const positions = state.windows.map(({ x, y }) => ({ x, y }))
  state = setWindowCompact(state, 'chief', false)
  assert.deepEqual(state.windows.filter(window => !window.compact).map(window => window.entityId), ['chief'])
  state = setWindowCompact(state, 'planning', false)
  assert.deepEqual(state.windows.filter(window => !window.compact).map(window => window.entityId), ['chief', 'planning'])
  assert.deepEqual(state.windows.map(({ x, y }) => ({ x, y })), positions)
  const closed = collapseWindow(state, 'planning')
  assert.equal(openWindow(closed, room('planning')).windows.at(-1).compact, true)
})

test('opening or compacting one conversation preserves all other windows and saved dimensions', () => {
  let state = openWindow(createCanvasState(), employee('chief'), { width: 650, height: 720, compact: false })
  state = openWindow(state, employee('writer'), { width: 520, height: 610, compact: false })
  state = openWindow(state, employee('coder'), { width: 580, height: 660 })
  state = collapseWindow(state, 'coder')
  const neighbors = state.windows.filter(window => window.entityId !== 'writer')
  const compacted = setWindowCompact(state, 'writer', true)
  assert.deepEqual(compacted.windows.filter(window => window.entityId !== 'writer'), neighbors)
  assert.deepEqual(compacted.windows.find(window => window.entityId === 'writer'), { ...state.windows[1], compact: true })
  const expanded = setWindowCompact(compacted, 'writer', false)
  assert.deepEqual(expanded, state)
  const reopened = openWindow(collapseWindow(state, 'writer'), employee('writer'), { compact: false, width: 999, height: 999 })
  assert.deepEqual(reopened.windows.filter(window => window.entityId !== 'writer'), neighbors)
  const writer = reopened.windows.find(window => window.entityId === 'writer')
  assert.equal(writer.open, true)
  assert.equal(writer.compact, false)
  assert.deepEqual({ width: writer.width, height: writer.height }, { width: 520, height: 610 })
  const added = openWindow(reopened, room('planning'), { compact: false })
  assert.deepEqual(added.windows.slice(0, -1), reopened.windows)
  assert.deepEqual(added.windows.filter(window => window.open && !window.compact).map(window => window.entityId), ['chief', 'writer', 'planning'])
})

test('multiple explicitly opened conversations restore as cards and can reopen independently', () => {
  const storage = memoryStorage()
  let state = openWindow(createCanvasState(), employee('chief'), { width: 650, height: 720, compact: false })
  state = openWindow(state, room('planning'), { width: 540, height: 620, compact: false })
  state = openWindow(state, employee('closed'), { compact: false })
  state = collapseWindow(state, 'closed')
  state = groupWindows(state, state.windows.slice(0, 2).map(window => window.id), { name: 'Planning team' })
  assert.equal(writeCanvas(storage, state), true)
  const restored = readCanvas(storage)
  assert.deepEqual(restored, compactConversations(state))
  const first = setWindowCompact(restored, 'chief', false)
  assert.deepEqual(first.windows.filter(window => window.entityId !== 'chief'), restored.windows.filter(window => window.entityId !== 'chief'))
  const both = setWindowCompact(first, 'planning', false)
  assert.deepEqual(both.windows.filter(window => window.open && !window.compact).map(window => window.entityId), ['chief', 'planning'])
  assert.deepEqual(compactConversations(both), restored)
})

test('restoring an older expanded layout keeps geometry and groups but opens no conversations', () => {
  const storage = memoryStorage()
  const state = withEmployees(), ids = state.windows.map(window => window.id)
  const grouped = groupWindows(state, ids, { name: 'Team' })
  grouped.windows.forEach(window => { window.compact = false; window.width = 640; window.height = 720 })
  writeCanvas(storage, grouped)
  const restored = readCanvas(storage)
  assert.ok(restored.windows.every(window => window.compact))
  assert.deepEqual(restored.groups, grouped.groups)
  assert.deepEqual(restored.viewport, grouped.viewport)
  assert.deepEqual(restored.windows.map(({ compact, ...window }) => window), grouped.windows.map(({ compact, ...window }) => window))
})

test('selection, movement and grouping do not load conversations', () => {
  const state = withEmployees(), ids = state.windows.map(window => window.id)
  const moved = moveWindow(setCanvasSelection(state, ids, ids[0]), ids, 20, 10)
  const grouped = groupWindows(moved, ids)
  assert.ok(grouped.windows.every(window => window.compact))
})

test('arranging cards keeps group membership, separates groups and preserves saved chat sizes', () => {
  let state = openWindow(withEmployees(), room('planning'))
  const ids = state.windows.map(window => window.id)
  state = groupWindows(state, ids.slice(0, 2), { name: 'Team' })
  state = setWindowCompact(state, ids[0], false)
  state = collapseWindow(state, ids[3])
  const arranged = arrangeCards(state)
  assert.ok(arranged.windows.every(window => window.compact))
  assert.deepEqual(arranged.groups, state.groups)
  assert.deepEqual(arranged.windows.map(({ width, height, entityId, open }) => ({ width, height, entityId, open })), state.windows.map(({ width, height, entityId, open }) => ({ width, height, entityId, open })))
  assert.equal(arranged.windows[3].x, state.windows[3].x)
  assert.equal(arranged.windows[3].y, state.windows[3].y)
  assert.ok(arranged.windows[2].y > arranged.windows[0].y + windowHeight(arranged.windows[0]) + 45)
  assert.ok(arranged.windows[1].x >= arranged.windows[0].x + windowWidth(arranged.windows[0]))
})

test('arranging mixed groups packs each row by actual widths and advances by its tallest member', () => {
  let state = [employee('chief'), room('planning'), employee('writer'), employee('coder'), employee('reviewer')].reduce((value, entity) => openWindow(value, entity), createCanvasState())
  state = groupWindows(state, state.windows.slice(0, 4).map(window => window.id), { name: 'Delivery' })
  state = resizeWindow(state, 'chief', 180, 110)
  state = setWindowCompact(state, 'chief', false)
  const arranged = arrangeCards(state)
  assert.deepEqual(arranged.windows.map(({ x, y }) => ({ x, y })), [
    { x: 42, y: 115 }, { x: 194, y: 115 }, { x: 546, y: 115 },
    { x: 42, y: 347 }, { x: 42, y: 539 },
  ])
  assert.deepEqual(arranged.groups, state.groups)
  assert.deepEqual(arranged.windows.map(({ id, entityId, width, height }) => ({ id, entityId, width, height })), state.windows.map(({ id, entityId, width, height }) => ({ id, entityId, width, height })))
  assert.equal(windowBounds(arranged, arranged.groups[0].members).width, 624)
  assert.equal(windowBounds(arranged, arranged.groups[0].members).height, 344)
  assert.deepEqual(arrangeCards(arranged), arranged)
})
