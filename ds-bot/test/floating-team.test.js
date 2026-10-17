import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/floating-team.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})

const plain = value => JSON.parse(JSON.stringify(value))
const storage = initial => {
  const writes = []
  let value = initial
  return { writes, getItem: () => value, setItem: (key, next) => { value = next; writes.push({ key, value: JSON.parse(next) }) } }
}

function element() {
  const classes = new Set(), properties = new Map()
  return {
    classes, properties, dataset: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) },
    removeAttribute(name) { if (name === 'data-folded') delete this.dataset.folded },
  }
}

function runtime(saved = storage(null)) {
  const slots = [], observers = [], timers = new Map()
  let cursor = 0, layouts = [], effects = [], dirty = false, enabled = true, tree, clock = 0, nextTimer = 1
  const column = element(), frame = element()
  const box = { top: 20, width: 1200, height: 832 }, content = { top: 52 }
  frame.getBoundingClientRect = () => box
  frame.querySelector = selector => {
    assert.equal(selector, '[class*="_centerCol"]')
    return { getBoundingClientRect: () => content }
  }
  column.parentElement = frame
  const root = { current: { closest: selector => {
    if (selector === '[class*="_sidebarCol"]') return column
    if (selector === '.bt-floating-team') return column.classes.has('bt-floating-team') ? column : null
    throw new Error(`unexpected shell lookup: ${selector}`)
  } } }
  const hook = (effect, deps, queue) => {
    const index = cursor++, previous = slots[index]
    if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
    const cell = slots[index] = { deps }
    queue.push(() => { previous?.cleanup?.(); cell.cleanup = effect() })
  }
  const react = {
    useState(initial) {
      const index = cursor++, cell = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => {
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
      }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useLayoutEffect: (effect, deps) => hook(effect, deps, layouts),
    useEffect: (effect, deps) => hook(effect, deps, effects),
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this) }
    observe(target) { this.targets.push(target) }
    disconnect() { this.targets = [] }
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, require: () => react, ResizeObserver, localStorage: saved,
    setTimeout: (run, wait) => { const id = nextTimer++; timers.set(id, { run, at: clock + wait }); return id },
    clearTimeout: id => timers.delete(id),
  })
  const render = () => {
    cursor = 0; layouts = []; effects = []; dirty = false
    tree = module.exports.useFloatingTeam(enabled, root)
    for (const run of layouts) run()
    for (const run of effects) run()
  }
  const flush = () => {
    let limit = 20
    while (dirty && limit-- > 0) render()
    assert.ok(limit > 0, 'floating panel hooks must settle')
    return tree
  }
  return {
    ...module.exports, column, frame, root, observers, saved,
    draw(next = enabled) { enabled = next; render(); return flush() },
    flush,
    resize(next) {
      Object.assign(box, next)
      for (const observer of observers) if (observer.targets.includes(frame)) observer.callback()
      return flush()
    },
    advance(ms) {
      clock += ms
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.run() }
      return flush()
    },
    unmount() { for (const cell of slots) cell?.cleanup?.() },
  }
}

function pointer(values = {}) {
  const captured = new Set()
  return {
    button: 0, pointerId: 1, clientX: 0, clientY: 0, prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true },
    currentTarget: {
      setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id),
      releasePointerCapture: id => captured.delete(id),
    }, ...values,
  }
}

const pixels = (page, name) => Number.parseFloat(page.column.properties.get(`--bt-team-${name}`))

test('designer team panel expands to 860px and fits without mutating its home position', () => {
  const page = runtime()
  for (const width of [2560, 1000, 640]) {
    const home = { x: width - 320, y: 104, folded: false }
    const expanded = page.fitTeamPanel({ ...home, chatOpen: true }, { width, height: 900 })
    assert.ok(expanded.x >= 12)
    assert.ok(expanded.x + Math.min(860, width - 24) <= width - 12)
    const collapsed = page.fitTeamPanel(home, { width, height: 900 })
    assert.equal(collapsed.x, home.x)
  }
})

test('missing, corrupted and denied team-panel storage recover independently without accepting invalid fields', () => {
  const page = runtime(), fallback = { x: 20, y: 104, folded: false }
  for (const value of [null, '{broken', 'null', '[]', '42', '"layout"', '{"x":"88","y":null,"folded":"true"}', '{"x":1e999,"y":-1e999}']) {
    const first = page.readTeamPanel(storage(value)), second = page.readTeamPanel(storage(value))
    assert.deepEqual(plain(first), fallback)
    assert.notEqual(first, second)
  }
  assert.deepEqual(plain(page.readTeamPanel({ getItem: () => { throw new Error('storage denied') } })), fallback)
  assert.deepEqual(plain(page.readTeamPanel(storage('{"x":60,"y":75,"folded":true,"messages":["ignored"]}'))), { x: 60, y: 75, folded: true })
})

test('out-of-bounds positions fit the available area without mutating the saved layout', () => {
  const page = runtime(), area = { width: 1000, height: 800 }
  const far = { x: 1e8, y: 1e8, folded: false }
  assert.deepEqual(plain(page.fitTeamPanel(far, area)), { x: 688, y: 164, folded: false })
  assert.deepEqual(far, { x: 1e8, y: 1e8, folded: false })
  assert.deepEqual(plain(page.fitTeamPanel({ x: -1e8, y: -1e8, folded: false }, area)), { x: 12, y: 12, folded: false })
  assert.deepEqual(plain(page.fitTeamPanel({ x: 900, y: 700, folded: true }, area)), { x: 900, y: 164, folded: true })
})

test('viewport shrink keeps the header and complete expanded panel reachable below the app title bar', () => {
  const page = runtime(storage('{"x":900,"y":650,"folded":false}'))
  page.draw()
  assert.equal(page.column.classes.has('bt-floating-team'), true)
  assert.equal(page.frame.classes.has('bt-canvas-frame'), true)
  assert.equal(pixels(page, 'y'), 196, 'stored y is clamped within the 800 px content area, then offset by the 32 px title bar')
  for (const area of [{ width: 390, height: 420 }, { width: 260, height: 160 }]) {
    page.resize({ width: area.width, height: area.height + 32 })
    const x = pixels(page, 'x'), y = pixels(page, 'y') - 32, height = pixels(page, 'height')
    const width = Math.min(288, area.width - 24)
    assert.ok(x >= 12 && x + width <= area.width - 12, 'horizontal panel bounds stay reachable')
    assert.ok(y >= 12 && y + height <= area.height - 12, `panel must fit a ${area.height} px content area`)
    assert.ok(height >= 56, 'the title and fold button stay reachable')
  }
  page.unmount()
})

test('pointer movement clamps the panel, persists only the settled position and releases capture', () => {
  const page = runtime(), event = pointer({ clientX: 30, clientY: 120 })
  let panel = page.draw()
  panel.handle.onPointerDown(event)
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
  assert.equal(event.currentTarget.hasPointerCapture(1), true)
  panel.handle.onPointerMove({ ...event, clientX: 100, clientY: 180 })
  panel = page.flush()
  assert.equal(pixels(page, 'x'), 90)
  assert.equal(pixels(page, 'y'), 196)
  panel.handle.onPointerMove({ ...event, clientX: 1e6, clientY: -1e6 })
  panel = page.flush()
  assert.equal(pixels(page, 'x'), 888)
  assert.equal(pixels(page, 'y'), 44)
  page.advance(179)
  assert.equal(page.saved.writes.length, 0)
  page.advance(1)
  assert.deepEqual(plain(page.saved.writes), [{ key: 'ds-bot:team-panel', value: { x: 888, y: 12, folded: false } }])
  panel.handle.onPointerCancel(event)
  assert.equal(event.currentTarget.hasPointerCapture(1), false)
  panel.handle.onPointerMove({ ...event, clientX: 30, clientY: 30 })
  page.flush()
  assert.equal(pixels(page, 'x'), 888)
  page.unmount()
})

test('keyboard movement and folding remain usable when pointer dragging is unavailable', () => {
  const page = runtime()
  let panel = page.draw()
  const wrongButton = pointer({ button: 2 })
  panel.handle.onPointerDown(wrongButton)
  panel.handle.onPointerMove(pointer({ clientX: 500, clientY: 500 }))
  page.flush()
  assert.equal(pixels(page, 'x'), 20)
  const right = pointer({ key: 'ArrowRight', shiftKey: true })
  panel.handle.onKeyDown(right)
  panel = page.flush()
  assert.equal(right.prevented, true)
  assert.equal(pixels(page, 'x'), 44)
  panel.handle.onKeyDown(pointer({ key: 'ArrowDown' }))
  panel = page.flush()
  assert.equal(pixels(page, 'y'), 144)
  panel.toggle()
  panel = page.flush()
  assert.equal(panel.folded, true)
  assert.equal(page.column.dataset.folded, 'true')
  panel.handle.onKeyDown(pointer({ key: 'Home' }))
  panel = page.flush()
  assert.equal(pixels(page, 'x'), 20)
  assert.equal(pixels(page, 'y'), 136)
  const ignored = pointer({ key: 'Enter' })
  panel.handle.onKeyDown(ignored)
  assert.equal(ignored.prevented, false)
  page.unmount()
})

test('returning to Classic removes only owned styles and cancels observers and pending writes', () => {
  const page = runtime()
  page.column.classes.add('carrier-sidebar')
  page.frame.classes.add('carrier-frame')
  page.column.style.setProperty('--carrier-size', '240px')
  let panel = page.draw()
  panel.toggle()
  panel = page.flush()
  panel.handle.onKeyDown(pointer({ key: 'ArrowRight' }))
  page.flush()
  page.draw(false)
  assert.deepEqual([...page.column.classes], ['carrier-sidebar'])
  assert.deepEqual([...page.frame.classes], ['carrier-frame'])
  assert.deepEqual([...page.column.properties], [['--carrier-size', '240px']])
  assert.equal(page.column.dataset.folded, undefined)
  assert.ok(page.observers.every(observer => observer.targets.length === 0))
  page.advance(1000)
  assert.equal(page.saved.writes.length, 0)
  panel = page.draw(true)
  assert.equal(panel.folded, true)
  assert.equal(pixels(page, 'x'), 28)
  assert.equal(page.observers.filter(observer => observer.targets.length > 0).length, 1)
  page.unmount()
  assert.deepEqual([...page.column.classes], ['carrier-sidebar'])
  assert.ok(page.observers.every(observer => observer.targets.length === 0))
  page.advance(1000)
  assert.equal(page.saved.writes.length, 0)
})

test('disabled or missing shell mounts safely, and unavailable storage never breaks dragging', () => {
  const saved = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
  const page = runtime(saved)
  page.draw(false)
  assert.equal(page.observers.length, 0)
  page.root.current = null
  assert.doesNotThrow(() => page.draw(true))
  assert.equal(page.observers.length, 0)
  assert.doesNotThrow(() => page.advance(200))
  page.unmount()
  const mounted = runtime(saved)
  const panel = mounted.draw()
  panel.handle.onKeyDown(pointer({ key: 'ArrowRight' }))
  mounted.flush()
  assert.doesNotThrow(() => mounted.advance(200))
  assert.equal(pixels(mounted, 'x'), 28)
  mounted.unmount()
})
