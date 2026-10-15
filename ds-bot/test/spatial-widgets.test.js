import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/spatial-widgets.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  plugins: [{ name: 'schedule-fixture', setup(builder) {
    builder.onResolve({ filter: /\/schedules\.js$/ }, () => ({ path: 'schedule-fixture', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useSchedules = () => globalThis.scheduleView; export const timingText = task => task.kind ?? "";' }))
  } }],
})

const plain = value => JSON.parse(JSON.stringify(value))
function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const findAll = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate))]
const find = (node, predicate) => findAll(node, predicate)[0]
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.children?.map(textOf).join('') ?? ''

function runtime(saved = storage()) {
  const slots = [], events = new Map(), intervals = new Map()
  let cursor = 0, effects = [], dirty = false, mounted = true, lateUpdates = 0, component, props, tree, nextTimer = 0
  const effectHook = (effect, deps) => {
    const index = cursor++, previous = slots[index]
    if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
    const cell = slots[index] = { deps }
    effects.push(() => { previous?.cleanup?.(); cell.cleanup = effect() })
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => {
        if (!mounted) { lateUpdates++; return }
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
      }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect: effectHook, useLayoutEffect: effectHook,
  }
  const module = { exports: {} }
  const context = {
    module, exports: module.exports, localStorage: saved, scheduleView: null,
    require: name => ({ react, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
    setInterval: run => { const id = ++nextTimer; intervals.set(id, run); return id }, clearInterval: id => intervals.delete(id),
    window: { addEventListener: (type, run) => events.set(type, run), removeEventListener: type => events.delete(type), dispatchEvent: event => events.get(event.type)?.(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
  }
  runInNewContext(outputFiles[0].text, context)
  const render = () => {
    cursor = 0; effects = []; dirty = false
    tree = component(props)
    for (const run of effects) run()
    return tree
  }
  const flush = () => {
    let limit = 20
    while (dirty && limit-- > 0) render()
    assert.ok(limit > 0, 'widget hooks must settle')
    return tree
  }
  return {
    ...module.exports, saved, context, intervals, events,
    draw(next, nextProps) { component = next; props = nextProps; render(); return flush() }, flush,
    async settle() { await new Promise(resolve => setImmediate(resolve)); return flush() },
    unmount() { mounted = false; for (const cell of slots) cell?.cleanup?.() },
    get lateUpdates() { return lateUpdates },
  }
}

const bot = id => ({ id, name: id === 'writer' ? 'Writer' : 'Designer', role: 'A real employee' })
function quick(saved) {
  const page = runtime(saved), sent = [], opened = []
  const actions = {
    send: (id, text) => { const request = deferred(); sent.push({ id, text, ...request }); return request.promise },
    openCanvasEntity: id => opened.push(id),
    retainCanvasSession: () => { throw new Error('quick messages must not retain history') },
  }
  let selected = bot('writer')
  const draw = (id = selected.id) => { selected = bot(id); return page.draw(page.CanvasQuickMessage, { bot: selected, actions }) }
  const type = text => { find(page.flush(), node => node.type === 'input').props.onChange({ target: { value: text } }); return page.flush() }
  const send = () => { find(page.flush(), node => node.type === 'form').props.onSubmit({ preventDefault() {} }); return page.flush() }
  return { page, sent, opened, actions, draw, type, send }
}

test('widget and draft storage ignore corrupt fields, retain unrelated widgets, and tolerate unavailable storage', () => {
  const page = runtime()
  for (const value of [null, '{broken', '[]', '42', 'null', '{"quick":{"x":"100","y":null,"folded":"true"}}']) {
    const saved = storage({ 'ds-bot:spatial-widgets': value, 'ds-bot:canvas-quick-drafts': value })
    assert.deepEqual(plain(page.readSpatialWidget('quick', saved)), { x: null, y: null, folded: null })
  }
  const saved = storage({ 'ds-bot:spatial-widgets': '{"agenda":{"x":70,"y":80,"folded":true}}', 'ds-bot:canvas-quick-drafts': '{"writer":"hello","bad":12,"other":null}' })
  page.writeSpatialWidget('quick', { x: 30, y: 40, folded: false }, saved)
  assert.deepEqual(JSON.parse(saved.getItem('ds-bot:spatial-widgets')), { agenda: { x: 70, y: 80, folded: true }, quick: { x: 30, y: 40, folded: false } })
  assert.deepEqual(plain(page.readQuickDrafts(saved)), { writer: 'hello' })
  const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } }
  assert.deepEqual(plain(page.readQuickDrafts(denied)), {})
  assert.doesNotThrow(() => page.writeSpatialWidget('quick', {}, denied))
  Object.defineProperty(page.context, 'localStorage', { get() { throw new Error('storage getter denied') } })
  assert.deepEqual(plain(page.readQuickDrafts()), {})
  assert.deepEqual(plain(page.readSpatialWidget('quick')), { x: null, y: null, folded: null })
  assert.doesNotThrow(() => page.writeSpatialWidget('quick', {}))
})

test('widgets clamp within the canvas and narrow defaults fold without replacing explicit preferences', () => {
  const page = runtime(), fresh = { x: null, y: null, folded: null }
  const desktop = { width: 1600, height: 1000, minY: 80 }
  assert.deepEqual(plain(page.fitSpatialWidget('quick', fresh, desktop)), { x: 360, y: 104, folded: false, width: 360, height: 200 })
  assert.equal(page.fitSpatialWidget('agenda', fresh, desktop).x, 1316)
  const narrow = { width: 390, height: 640, minY: 154 }
  const first = page.fitSpatialWidget('quick', fresh, narrow), second = page.fitSpatialWidget('agenda', fresh, narrow)
  assert.equal(first.folded, true); assert.equal(second.folded, true)
  assert.ok(first.x + first.width < second.x, 'default folded headings occupy separate columns')
  assert.equal(first.y, narrow.minY); assert.equal(second.y, narrow.minY)
  assert.equal(page.fitSpatialWidget('quick', { ...fresh, folded: false }, narrow).folded, false)
  for (const area of [narrow, { width: 240, height: 180, minY: 90 }]) {
    for (const id of ['quick', 'agenda']) {
      const box = page.fitSpatialWidget(id, { x: 1e8, y: -1e8, folded: false }, area)
      assert.ok(box.x >= 12 && box.x + box.width <= area.width - 12)
      assert.ok(box.y >= 12 && box.y + box.height <= area.height - 12)
    }
  }
})

test('tablet resize moves a saved desktop agenda below quick messages and keeps its header reachable on short screens', () => {
  const page = runtime(), saved = { x: 1316, y: 104, folded: false }, area = { width: 760, height: 800, minY: 84 }
  const quick = page.fitSpatialWidget('quick', { x: 360, y: 104, folded: false }, area)
  const agenda = page.fitSpatialWidget('agenda', saved, area)
  assert.ok(agenda.y >= quick.y + quick.height + 12, 'saved desktop y must not leave the agenda over the quick-message header or controls')
  assert.equal(agenda.y, 316)
  assert.equal(agenda.x + agenda.width, 748)
  assert.deepEqual(saved, { x: 1316, y: 104, folded: false }, 'responsive placement does not overwrite the desktop preference')
  const short = page.fitSpatialWidget('agenda', saved, { ...area, height: 380 })
  assert.equal(short.y, 316)
  assert.equal(short.height, 52)
  assert.ok(short.height >= 44 && short.y + short.height <= 368, 'a short canvas keeps the complete foldable title accessible')
  const veryShort = page.fitSpatialWidget('agenda', saved, { ...area, height: 240 })
  assert.equal(veryShort.height, 44)
  assert.equal(veryShort.y + veryShort.height, 228)
})

test('quick message sends once to the original employee and preserves another employee draft during completion', async () => {
  const data = quick(); data.draw(); data.type('  Review the proposal  '); data.send(); data.send()
  assert.equal(data.sent.length, 1)
  assert.equal(data.sent[0].id, 'writer'); assert.equal(data.sent[0].text, 'Review the proposal')
  data.draw('designer'); data.type('Prepare a layout')
  data.sent[0].resolve(); let tree = await data.page.settle()
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Prepare a layout')
  tree = data.draw('writer')
  assert.equal(find(tree, node => node.type === 'input').props.value, '')
  assert.match(textOf(tree), /Message sent/)
  assert.deepEqual(JSON.parse(data.page.saved.getItem('ds-bot:canvas-quick-drafts')), { designer: 'Prepare a layout' })
  data.page.unmount()
})

test('typing a new draft while sending prevents an old completion from clearing it, including equal text', async () => {
  const data = quick(); data.draw(); data.type('Review'); data.send()
  data.type('Review next'); data.type('Review')
  data.sent[0].resolve(); const tree = await data.page.settle()
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Review')
  assert.equal(JSON.parse(data.page.saved.getItem('ds-bot:canvas-quick-drafts')).writer, 'Review')
  data.page.unmount()
})

test('send errors keep the draft, appear only for their employee, and permit retry', async () => {
  const data = quick(); data.draw(); data.type('Try this'); data.send(); data.draw('designer')
  data.sent[0].reject(new Error('Connection unavailable'))
  let tree = await data.page.settle()
  assert.equal(find(tree, node => node.props.role === 'alert'), undefined)
  tree = data.draw('writer')
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Try this')
  assert.equal(textOf(find(tree, node => node.props.role === 'alert')), 'Connection unavailable')
  data.send(); assert.equal(data.sent.length, 2)
  data.sent[1].resolve(); await data.page.settle(); data.page.unmount()
})

test('unmounted send completion leaves a newer saved draft intact and does not update disposed UI', async () => {
  const data = quick(); data.draw(); data.type('Old draft'); data.send(); data.page.unmount()
  data.page.saved.setItem('ds-bot:canvas-quick-drafts', '{"writer":"Draft from reopened panel"}')
  data.sent[0].resolve(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(data.page.lateUpdates, 0)
  assert.equal(JSON.parse(data.page.saved.getItem('ds-bot:canvas-quick-drafts')).writer, 'Draft from reopened panel')
})

test('quick message reload restores per-employee drafts and opens the chosen employee using the stable id', () => {
  const saved = storage({ 'ds-bot:canvas-quick-drafts': '{"writer":"Saved work","designer":"Another draft"}' })
  const data = quick(saved)
  let tree = data.draw()
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Saved work')
  tree = data.draw('designer')
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Another draft')
  find(tree, node => node.props['aria-label'] === 'Open conversation').props.onClick()
  assert.deepEqual(data.opened, ['designer'])
  data.page.unmount()
})

test('agenda excludes finished or invalid dates, sorts real tasks, and marks only actual scheduled dates', () => {
  const page = runtime()
  const tasks = [
    { id: 'late', status: 'active', scheduledAt: '2030-06-12T12:00:00' },
    { id: 'done', status: 'finished', scheduledAt: '2030-06-10T09:00:00' },
    { id: 'bad', status: 'active', scheduledAt: 'not a date' },
    { id: 'early', status: 'active', scheduledAt: '2030-06-11T09:00:00' },
  ]
  const active = page.upcomingTasks({ available: true, tasks })
  assert.deepEqual(plain(active.map(task => task.id)), ['early', 'late'])
  assert.equal(tasks[0].id, 'late', 'the schedule catalog is never reordered in place')
  assert.deepEqual(plain(page.upcomingTasks({ available: false, tasks })), [])
  const week = page.agendaWeek(new Date('2030-06-10T10:00:00').getTime(), active)
  assert.deepEqual(plain(week.filter(day => day.marked).map(day => day.date.getDate())), [11, 12])
  assert.equal(week.filter(day => day.today).length, 1)
})

test('agenda shows distinct loading, disabled and empty states, and routes each real task to its owner', () => {
  const page = runtime(), opened = [], actions = { openSettings: (...args) => opened.push(args) }
  const roster = { byId: { writer: bot('writer') }, roomsById: { team: { id: 'team', name: 'Team' } } }
  const draw = view => { page.context.scheduleView = view; return page.draw(page.CanvasAgenda, { actions, roster }) }
  assert.match(textOf(draw(null)), /Loading/)
  assert.match(textOf(draw({ available: false, tasks: [] })), /Switch on Automation tasks/)
  assert.match(textOf(draw({ available: true, tasks: [] })), /No upcoming tasks/)
  const tree = draw({ available: true, tasks: Array.from({ length: 4 }, (_, index) => ({
    id: `task-${index}`, sessionId: 'writer-current', botId: index === 0 ? 'writer' : undefined, roomId: index > 0 ? 'team' : undefined,
    title: `Real task ${index}`, status: 'active', scheduledAt: `2030-06-${11 + index}T09:00:00`, kind: 'daily',
  })) })
  const rows = findAll(tree, node => node.props.className === 'bt-agenda-task')
  assert.equal(rows.length, 3)
  rows[0].props.onClick(); rows[1].props.onClick()
  assert.deepEqual(opened, [['schedules', 'writer'], ['schedules', 'team']])
  assert.equal(page.intervals.size, 1)
  page.unmount(); assert.equal(page.intervals.size, 0)
})

test('floating widget toolbar toggles fold without unmounting content and keyboard placement persists', () => {
  const page = runtime(), props = { id: 'quick', title: 'Quick message', children: 'Persistent draft' }
  let tree = page.draw(page.FloatingWidget, props)
  assert.equal(tree.props['data-folded'], false)
  page.toggleSpatialWidget('quick'); tree = page.flush()
  assert.equal(tree.props['data-folded'], true)
  assert.equal(find(tree, node => node.props.className === 'bt-spatial-body').props.hidden, true)
  assert.match(textOf(tree), /Persistent draft/)
  find(tree, node => node.props.className === 'bt-spatial-grip').props.onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {} })
  tree = page.flush()
  assert.equal(tree.props.style.left, 384)
  assert.equal(JSON.parse(page.saved.getItem('ds-bot:spatial-widgets')).quick.x, 384)
  page.unmount(); assert.equal(page.events.size, 0)
})

test('floating header pointer movement clamps, captures its pointer and leaves the other widget position intact', () => {
  const saved = storage({ 'ds-bot:spatial-widgets': '{"agenda":{"x":70,"y":80,"folded":true}}' })
  const page = runtime(saved), captured = new Set(), props = { id: 'quick', title: 'Quick message' }
  let tree = page.draw(page.FloatingWidget, props)
  const event = {
    button: 0, pointerId: 7, clientX: 400, clientY: 120, preventDefault() {}, stopPropagation() {},
    currentTarget: { setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) },
  }
  const handle = () => find(tree, node => node.props.className === 'bt-spatial-grip').props
  handle().onPointerDown(event)
  assert.equal(captured.has(7), true)
  handle().onPointerMove({ ...event, clientX: -1000, clientY: 2000 }); tree = page.flush()
  assert.equal(tree.props.style.left, 12)
  assert.equal(tree.props.style.top, 588)
  handle().onPointerUp(event); assert.equal(captured.has(7), false)
  handle().onPointerMove({ ...event, clientX: 500, clientY: 500 }); tree = page.flush()
  assert.equal(tree.props.style.left, 12)
  assert.deepEqual(JSON.parse(saved.getItem('ds-bot:spatial-widgets')).agenda, { x: 70, y: 80, folded: true })
  page.unmount()
})
