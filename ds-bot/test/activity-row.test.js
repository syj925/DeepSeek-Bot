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
  const slots = [], observers = [], timers = new Map(), intervals = new Map(), frames = new Map()
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
    clearTimeout: id => timers.delete(id),
    setInterval: (run, wait) => { const id = nextId++; intervals.set(id, { run, wait, at: clock + wait }); return id },
    clearInterval: id => intervals.delete(id),
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
      let limit = 1000
      while (limit-- > 0) {
        const timeout = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= clock)
        const interval = [...intervals].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= clock)
        if (!timeout && !interval) break
        if (timeout && (!interval || timeout[1].at <= interval[1].at)) {
          timers.delete(timeout[0]); timeout[1].run()
        } else {
          interval[1].at += interval[1].wait; interval[1].run()
        }
      }
      assert.ok(limit > 0, 'intervals must settle')
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

test('embedded waiting survives a missing or replaced native host and ends with the run', () => {
  const data = fixture(), root = transcript(), page = runtime({ querySelector: () => { throw new Error('global lookup') } })
  data.live.writer = {}
  root.root.matches.delete('[data-chat-flow] > [data-chat-running]')
  const props = { ...data.props('writer'), rootRef: { current: root.root }, inline: true }
  const row = page.draw(props)
  assert.equal(row.host, root.flow, 'waiting belongs to the transcript above the composer')
  assert.equal(row.node.props.role, 'status')
  assert.match(row.node.props.className, /bt-typing-stable/)
  assert.match(text(row.node), /your request/i)
  root.root.matches.set('[data-chat-flow] > [data-chat-running]', new Element())
  assert.match(text(page.mutate().node), /your request/i)
  const replacement = new Element()
  root.root.matches.set('[data-chat-flow]', replacement)
  assert.equal(page.mutate().host, replacement, 'rebind after the transcript is remounted')
  assert.match(text(page.advance(8000).node), /Thanks for waiting/i)
  assert.match(text(page.advance(38000).node), /No new progress/i)
  data.live.writer = { reply: { text: true, progress: 1 } }
  page.draw(props)
  assert.equal(page.advance(140), null)
  data.live.writer = {}
  assert.match(text(page.draw(props).node), /your request/i)
  data.status.set('writer', { running: false })
  page.draw(props)
  assert.equal(page.advance(140), null)
  assert.equal(root.flow.animations.length, 0)
  assert.equal(root.scroll.scrollTop, 200)
  page.unmount()
})

test('embedded waiting yields to approval, question, failure and another editor owner', () => {
  const data = fixture(), root = transcript(), page = runtime({ querySelector: () => null })
  const work = {}
  const props = { ...data.props('writer'), useWork: pick => pick(work), rootRef: { current: root.root }, inline: true }
  assert.ok(page.draw(props))
  work.approvals = [{ sessionId: 'reviewer' }]
  assert.ok(page.draw(props), 'unrelated approvals must not hide this employee')
  work.approvals = [{ sessionId: 'writer' }]
  assert.equal(page.draw(props), null)
  work.approvals = []
  data.roster.questions = { writer: { sessionId: 'writer' } }
  assert.equal(page.draw(props), null)
  data.roster.questions = {}
  data.roster.modelFailures = [{ sessionId: 'writer' }]
  assert.equal(page.draw(props), null)
  data.roster.modelFailures = []
  assert.ok(page.draw(props))
  assert.equal(page.draw({ ...props, enabled: false }), null)
  assert.ok(page.draw(props))
  page.unmount()
})

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

test('waiting copy rotates every eight seconds without resetting the run clock, then stops after 45 seconds without progress', () => {
  const document = { querySelector: () => { throw new Error('canvas activity must stay scoped') } }
  const root = transcript()
  const status = new Map([['writer', { running: true }]])
  const roster = { byId: { writer: { id: 'writer', name: 'Writer' } }, roomsById: {} }
  const page = runtime(document)
  const props = {
    sessionId: 'writer', rootRef: { current: root.root },
    useRoster: pick => pick(roster), useSessionStatus: pick => pick(status),
    useLive: pick => pick({ writer: {} }), useSession: pick => pick({ pendingSubmissions: [] }),
    actions: { clearLive() {} },
  }
  const initial = page.draw(props)
  const first = text(initial.node)
  assert.match(first, /your request/i)
  page.advance(8000)
  const rotated = text(page.flush().node)
  assert.match(rotated, /Thanks for waiting/i)
  assert.notEqual(rotated, first)
  page.advance(38000)
  const delayed = text(page.flush().node)
  assert.match(delayed, /longer/i)
  page.advance(15000)
  assert.match(text(page.flush().node), /1m/)
  assert.equal(text(page.flush().node), text(page.advance(8000).node))
  page.unmount()
})

test('real tool progress clears the delayed notice and streaming replaces the waiting row', () => {
  const data = fixture(), root = transcript(), page = runtime({ querySelector: () => null })
  data.live.writer = {}
  const props = { ...data.props('writer'), rootRef: { current: root.root } }
  page.draw(props)
  assert.match(text(page.advance(45000).node), /longer/i)
  data.live.writer = { read: { at: 46000, label: 'Opening a file', state: 'working' } }
  assert.match(text(page.draw(props).node), /Opening a file/)
  assert.doesNotMatch(text(page.flush().node), /longer/i)
  page.advance(15000)
  assert.match(text(page.flush().node), /1m/)
  data.live.writer = { reply: { text: true, progress: 20 } }
  page.draw(props)
  assert.equal(page.advance(140), null)
  data.status.set('writer', { running: false })
  assert.equal(page.draw(props), null)
  page.unmount()
})
