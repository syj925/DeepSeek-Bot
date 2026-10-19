import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/activity-row.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

class Element {
  constructor() { this.matches = new Map(); this.rows = []; this.scrollTop = 200; this.dataset = {}; this.offsetHeight = 20; this.animations = [] }
  querySelector(selector) { return this.matches.get(selector) ?? null }
  querySelectorAll() { return this.rows }
  addEventListener() {}
  animate(...args) { this.animations.push(args) }
}

function transcript() {
  const root = new Element(), scroll = new Element(), flow = new Element(), host = new Element()
  root.matches.set('[data-conversation-scroll]', scroll)
  root.matches.set('[data-chat-flow]', flow)
  root.matches.set('[data-chat-flow] > [data-chat-running]', host)
  scroll.matches.set('[data-chat-flow]', flow)
  flow.rows.push(new Element())
  return { root, scroll, flow, host }
}

function runtime(document) {
  const slots = [], observers = [], timers = new Map(), frames = new Map()
  let cursor = 0, effects = [], layouts = [], dirty = false, props, tree, clock = 1000, nextId = 1
  const hook = (effect, deps, queue) => {
    const index = cursor++, previous = slots[index]
    if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
    const cell = slots[index] = { deps }
    queue.push(() => { previous?.cleanup?.(); cell.cleanup = effect() })
  }
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++, cell = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => {
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
      }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useMemo(make, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, at) => !Object.is(value, previous.deps[at]))) slots[index] = { deps, value: make() }
      return slots[index].value
    },
    useEffect: (effect, deps) => hook(effect, deps, effects),
    useLayoutEffect: (effect, deps) => hook(effect, deps, layouts),
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this) }
    observe(target) { this.targets.push(target) }
    disconnect() { this.targets = [] }
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, document, MutationObserver,
    window: { matchMedia: () => ({ matches: false }) }, Date: { now: () => clock },
    requestAnimationFrame: run => { const id = nextId++; frames.set(id, run); return id },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (run, wait) => { const id = nextId++; timers.set(id, { run, at: clock + wait }); return id },
    clearTimeout: id => timers.delete(id), setInterval: () => 1, clearInterval() {},
    require: name => ({ react, 'react-dom': { createPortal: (node, host) => ({ node, host }) }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const render = () => {
    cursor = 0; effects = []; layouts = []; dirty = false
    tree = module.exports.ActivityIndicator(props)
    for (const run of layouts) run()
    for (const run of effects) run()
  }
  const flush = () => {
    let limit = 20
    while (dirty && limit-- > 0) render()
    assert.ok(limit > 0, 'activity hooks must settle')
    return tree
  }
  return {
    observers,
    draw(next) { props = next; render(); return flush() },
    flush,
    advance(ms) {
      clock += ms
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.run() }
      return flush()
    },
    mutate() {
      for (const observer of observers) if (observer.targets.length) observer.callback()
      for (const [id, run] of frames) { frames.delete(id); run() }
      return flush()
    },
    unmount() { for (const cell of slots) cell?.cleanup?.() },
  }
}

function fixture() {
  const status = new Map([['writer', { running: true }], ['reviewer', { running: true }]])
  const live = {
    writer: { read: { at: 1, label: 'Reading the brief', state: 'working' } },
    reviewer: { search: { at: 2, label: 'Checking references', state: 'working' } },
  }
  const roster = { byId: { writer: { id: 'writer', name: 'Writer' }, reviewer: { id: 'reviewer', name: 'Reviewer' } }, roomsById: {} }
  const cleared = []
  const props = sessionId => ({
    sessionId, useRoster: pick => pick(roster), useSessionStatus: pick => pick(status),
    useLive: pick => pick(live), useSession: pick => pick({ pendingSubmissions: [] }),
    actions: { clearLive: id => cleared.push(id) },
  })
  return { status, live, roster, props, cleared }
}

const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('')

test('concurrent canvas activities use their own running host, tool and observer targets', () => {
  const document = { querySelector: selector => { throw new Error(`global activity lookup: ${selector}`) } }
  const data = fixture(), first = transcript(), second = transcript(), a = runtime(document), b = runtime(document)
  const own = a.draw({ ...data.props('writer'), rootRef: { current: first.root } })
  const other = b.draw({ ...data.props('reviewer'), rootRef: { current: second.root } })
  assert.equal(own.host, first.host)
  assert.equal(other.host, second.host)
  assert.match(text(own.node), /Reading the brief/)
  assert.match(text(other.node), /Checking references/)
  assert.ok(a.observers.every(observer => observer.targets.every(target => [first.root, first.scroll].includes(target))))
  assert.ok(b.observers.every(observer => observer.targets.every(target => [second.root, second.scroll].includes(target))))
  a.unmount(); b.unmount()
  assert.ok(a.observers.every(observer => observer.targets.length === 0))
  assert.ok(b.observers.every(observer => observer.targets.length === 0))
})

test('ending one canvas run animates and clears only that conversation', () => {
  const document = { querySelector: () => { throw new Error('canvas activity must stay scoped') } }
  const data = fixture(), first = transcript(), second = transcript(), a = runtime(document), b = runtime(document)
  const firstProps = { ...data.props('writer'), rootRef: { current: first.root } }
  const secondProps = { ...data.props('reviewer'), rootRef: { current: second.root } }
  a.draw(firstProps); b.draw(secondProps)
  data.status.set('writer', { running: false })
  assert.equal(a.draw(firstProps), null)
  let reads = 0
  Object.defineProperty(first.scroll, 'scrollTop', { get: () => reads++ === 0 ? 200 : 180 })
  a.advance(140)
  assert.deepEqual(data.cleared, ['writer'])
  assert.equal(first.flow.animations.length, 1)
  assert.equal(second.flow.animations.length, 0)
  assert.equal(b.draw(secondProps).host, second.host)
  a.unmount(); b.unmount()
})

test('new-row entrances stay in their own canvas and find an asynchronously mounted flow', () => {
  const document = { querySelector: () => { throw new Error('canvas activity must stay scoped') } }
  const data = fixture(), first = transcript(), second = transcript(), page = runtime(document)
  first.root.matches.delete('[data-chat-flow]')
  page.draw({ ...data.props('writer'), rootRef: { current: first.root } })
  first.root.matches.set('[data-chat-flow]', first.flow)
  page.mutate()
  page.advance(1000)
  const row = new Element(), unrelated = new Element()
  first.flow.rows.push(row); second.flow.rows.push(unrelated)
  page.mutate()
  assert.equal(row.dataset.btEnter, 'new')
  assert.equal(unrelated.dataset.btEnter, undefined)
  page.unmount()
})

test('classic activity keeps its document transcript host and clears stopped live notes', () => {
  const data = fixture(), classic = transcript(), page = runtime({ body: classic.root, querySelector: selector => classic.root.querySelector(selector) })
  assert.equal(page.draw(data.props('writer')).host, classic.host)
  data.status.set('writer', { running: false })
  assert.equal(page.draw(data.props('writer')), null)
  page.advance(140)
  assert.deepEqual(data.cleared, ['writer'])
  page.unmount()
})

test('a group without a live relay note leaves typing and streaming feedback to its members', () => {
  const document = { querySelector: () => { throw new Error('canvas activity must stay scoped') } }
  const data = fixture(), group = transcript(), page = runtime(document)
  data.roster.roomsById.team = { id: 'team', name: 'Team' }
  data.status.set('team', { running: true })
  data.live.team = {}
  const props = { ...data.props('team'), rootRef: { current: group.root } }
  assert.equal(page.draw(props), null, 'a PTC relay need not register a live relay note')
  data.live.team = { background: { at: 2, label: 'Waiting for a colleague', state: 'working' } }
  assert.equal(page.draw(props), null, 'an employee stream must not gain a second room activity row')
  data.live.team = { relay: { at: 3, relay: true } }
  assert.equal(page.draw(props), null)
  page.unmount()
})
