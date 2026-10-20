import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const harness = process.env.DSH_HARNESS ?? fileURLToPath(new URL('../dev/harness/', import.meta.url))
const requireHarness = createRequire(join(harness, 'package.json'))
const { JSDOM } = requireHarness('jsdom')
const h = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) })
let activeHook = null
const react = {
  createElement: h, Fragment: Symbol('Fragment'), createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value,
  useState: initial => activeHook.useState(initial), useRef: initial => activeHook.useRef(initial),
  useEffect: (effect, deps) => activeHook.effect(effect, deps), useLayoutEffect: (effect, deps) => activeHook.effect(effect, deps),
}
const roots = new Set()
async function act(run) {
  await run()
  for (let index = 0; index < 5; index += 1) {
    await settle()
    for (const root of roots) root.flush()
  }
}
function createRoot(mount) {
  const slots = [], portals = new Set()
  let cursor = 0, effects = [], dirty = false, element, mounted = true
  const hook = {
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => {
        assert.ok(mounted, 'a released room stream must not update state')
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
      }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    effect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
      const cell = slots[index] = { deps }
      effects.push(() => { previous?.cleanup?.(); cell.cleanup = effect() })
    },
  }
  const draw = () => {
    cursor = 0; effects = []; dirty = false; activeHook = hook
    const tree = element.type(element.props)
    activeHook = null
    const anchor = tree.children[0]
    if (!anchor.props.ref.current) {
      const node = mount.ownerDocument.createElement('span')
      mount.appendChild(node)
      anchor.props.ref.current = node
    }
    const portal = tree.children[1]
    if (portal?.host) {
      const host = portal.host
      portals.add(host)
      host.replaceChildren()
      for (const row of portal.node.children) {
        const node = host.ownerDocument.createElement('div')
        node.className = 'bt-group-msg'
        node.textContent = row.props.text
        if (row.props.streamId) node.setAttribute('data-test-stream-id', row.props.streamId)
        if (row.props.streaming) node.setAttribute('data-test-streaming', '')
        host.appendChild(node)
      }
    }
    for (const effect of effects) effect()
  }
  const root = {
    render(next) { element = next; draw() },
    flush() { let remaining = 20; while (mounted && dirty && remaining-- > 0) draw(); assert.ok(remaining > 0, 'room stream hooks must settle') },
    unmount() {
      if (!mounted) return
      for (const cell of slots) cell?.cleanup?.()
      mounted = false
      roots.delete(root)
      for (const host of portals) host.replaceChildren()
      mount.replaceChildren()
    },
  }
  roots.add(root)
  return root
}
const { outputFiles } = await build({
  stdin: {
    contents: "export { RoomStreams, roomContentRoot } from './src/client/room-streams.js'; export { subscribeRoomProgress } from './src/client/room-progress.js'",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const settle = () => new Promise(resolve => setImmediate(resolve))
const plain = value => JSON.parse(JSON.stringify(value))

function runtime() {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
  const globals = Object.fromEntries(['window', 'document', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })
  const timers = new Set()
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, document: dom.window.document, window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    setTimeout: (run, delay) => { const timer = { run, delay }; timers.add(timer); return timer },
    clearTimeout: timer => timers.delete(timer),
    require: name => ({ react, 'react-dom': { createPortal: (node, host) => ({ node, host }) }, '@deepseek-ai/dsh-client-ui-primitives': {
      MarkdownText: ({ text, streaming }) => h('span', { 'data-test-streaming': streaming ? '' : undefined }, text),
    } })[name],
  })
  return {
    ...module.exports, document: dom.window.document, timers,
    async tick() {
      const ready = [...timers]
      for (const timer of ready) { timers.delete(timer); timer.run() }
      await settle()
    },
    close() { dom.window.close(); Object.assign(globalThis, globals) },
  }
}

test('all consumers of one room share a poll and the last unsubscribe ignores an in-flight response', async () => {
  const page = runtime(), pending = [], seenA = [], seenB = [], seenOther = []
  const actions = { roomProgress: roomId => new Promise(resolve => pending.push({ roomId, resolve })) }
  const stopA = page.subscribeRoomProgress(actions, 'ops', value => seenA.push(value))
  const stopB = page.subscribeRoomProgress(actions, 'ops', value => seenB.push(value))
  const stopOther = page.subscribeRoomProgress(actions, 'other', value => seenOther.push(value))
  try {
    assert.deepEqual(pending.map(request => request.roomId), ['ops', 'other'])
    pending[0].resolve([{ background: true, streams: [{ streamId: 'one', text: 'Partial' }] }])
    pending[1].resolve([])
    await settle()
    assert.equal(seenA.length, 2)
    assert.deepEqual(plain(seenA), plain(seenB))
    assert.deepEqual([...page.timers].map(timer => timer.delay), [150, 150])
    stopA()
    await page.tick()
    assert.equal(pending.length, 4)
    stopB()
    pending[2].resolve([{ background: true, streams: [{ streamId: 'one', text: 'Late' }] }])
    pending[3].resolve([])
    await settle()
    assert.equal(seenA.length, 2)
    assert.equal(seenB.length, 2)
    assert.equal(page.timers.size, 1)
    stopOther()
    assert.equal(page.timers.size, 0)
    const after = []
    const stopFresh = page.subscribeRoomProgress(actions, 'ops', value => after.push(value))
    assert.deepEqual(plain(after), [[]])
    assert.equal(pending.length, 5)
    stopFresh()
    pending[4].resolve([])
    await settle()
    assert.equal(page.timers.size, 0)
  } finally { stopA(); stopB(); stopOther(); page.close() }
})

const roster = {
  byId: { writer: { id: 'writer', name: 'Writer', color: 'blue' }, chief: { id: 'chief', name: 'Chief', color: 'green' } },
  bots: [{ id: 'writer', name: 'Writer' }, { id: 'chief', name: 'Chief' }],
  roomsById: { ops: { id: 'ops', name: 'Ops', admin: 'chief' }, other: { id: 'other', name: 'Other' } },
}

function surface(page, id) {
  const root = page.document.createElement('section')
  root.innerHTML = `<header><div data-test-header></div></header><div data-conversation-session="${id}"><div data-chat-flow></div></div>`
  page.document.body.appendChild(root)
  return { root, mount: root.querySelector('[data-test-header]'), flow: root.querySelector('[data-chat-flow]'), content: root.querySelector('[data-conversation-session]') }
}

test('background bubbles keep streaming after the round ends, share the room poll, and stay inside each canvas', async () => {
  const page = runtime(), first = surface(page, 'ops'), second = surface(page, 'other')
  const roots = [createRoot(first.mount), createRoot(second.mount)]
  const calls = []
  const progress = {
    ops: [{ callId: 'background:ops', background: true, streams: [
      { streamId: 'w', botId: 'writer', text: 'Partial', time: 1, status: 'active' },
      { streamId: 'c', botId: 'chief', text: 'Chief is answering', time: 2, status: 'active' },
    ] }],
    other: [{ callId: 'background:other', background: true, streams: [{ streamId: 'o', botId: 'writer', text: 'Other reply', status: 'active' }] }],
  }
  const actions = { roomProgress: async id => { calls.push(id); return progress[id] }, openSession() {} }
  try {
    await act(async () => {
      roots[0].render(h(page.RoomStreams, { sessionId: 'ops', roster, actions, rootRef: { current: first.root } }))
      roots[1].render(h(page.RoomStreams, { sessionId: 'other', roster, actions, rootRef: { current: second.root } }))
      await settle()
    })
    assert.match(first.flow.textContent, /Partial.*Chief is answering/)
    assert.doesNotMatch(first.flow.textContent, /Other reply/)
    assert.match(second.flow.textContent, /Other reply/)
    assert.doesNotMatch(second.flow.textContent, /Chief is answering|Partial/)
    assert.equal(first.flow.querySelectorAll('[data-test-streaming]').length, 2)
    assert.deepEqual([...first.flow.querySelectorAll('[data-test-stream-id]')].map(node => node.getAttribute('data-test-stream-id')), ['w', 'c'])
    progress.ops[0].streams[0].text = 'Partial grows without a running relay'
    await act(async () => { await page.tick() })
    assert.match(first.flow.textContent, /Partial grows without a running relay/)
    assert.equal(first.flow.querySelectorAll('.bt-group-msg').length, 2)
    const newest = page.document.createElement('div')
    newest.textContent = 'New user message'
    await act(async () => { first.flow.appendChild(newest); await settle() })
    assert.equal(first.flow.lastElementChild.dataset.btRoomStreams, 'ops')
    await act(async () => { roots[0].unmount(); roots[1].unmount() })
    assert.equal(page.timers.size, 0)
    assert.equal(first.flow.querySelector('[data-bt-room-streams]'), null)
    assert.equal(second.flow.querySelector('[data-bt-room-streams]'), null)
    assert.deepEqual(calls.slice(0, 2), ['ops', 'other'])
  } finally { await act(async () => { for (const root of roots) root.unmount() }); page.close() }
})

test('a durable reply replaces its temporary bubble only in its own room and never returns after virtualization', async () => {
  const page = runtime(), first = surface(page, 'ops'), second = surface(page, 'other')
  const root = createRoot(first.mount)
  const progress = [{ background: true, streams: [{ streamId: 'same', botId: 'writer', text: 'Complete answer', status: 'completed' }] }]
  const actions = { roomProgress: async () => progress, openSession() {} }
  try {
    await act(async () => { root.render(h(page.RoomStreams, { sessionId: 'ops', roster, actions })); await settle() })
    assert.match(first.flow.textContent, /Complete answer/)
    assert.equal(first.flow.querySelector('[data-test-stream-id]')?.getAttribute('data-test-stream-id'), 'same')
    const elsewhere = page.document.createElement('div')
    elsewhere.dataset.btStreamId = 'same'
    second.flow.appendChild(elsewhere)
    await act(async () => { await settle() })
    assert.match(first.flow.textContent, /Complete answer/)
    const final = page.document.createElement('div')
    final.dataset.btStreamId = 'same'
    final.textContent = 'Complete answer'
    await act(async () => { first.flow.insertBefore(final, first.flow.firstChild); await settle() })
    assert.equal(first.flow.textContent, 'Complete answer')
    assert.equal(first.flow.querySelector('[data-bt-room-streams]').textContent, '')
    await act(async () => { final.remove(); await page.tick() })
    assert.equal(first.flow.textContent, '')
    await act(async () => { root.unmount() })
    assert.equal(page.timers.size, 0)
  } finally { await act(async () => { root.unmount() }); page.close() }
})

test('the classic header never falls back to a different conversation on the page', () => {
  const page = runtime(), first = surface(page, 'ops'), second = surface(page, 'other')
  try {
    assert.equal(page.roomContentRoot(first.mount, 'ops'), first.content)
    assert.equal(page.roomContentRoot(first.mount, 'other', first.root), null)
    first.content.remove()
    assert.equal(page.roomContentRoot(first.mount, 'ops'), null)
    assert.equal(page.roomContentRoot(second.mount, 'other'), second.content)
  } finally { page.close() }
})
