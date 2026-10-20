import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { indexRoster } from '../src/client/sources.js'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/canvas-session.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function runtime() {
  const slots = []
  let cursor = 0, effects = [], dirty = false, mounted = true, lateUpdates = 0, component, props, tree
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++
      const cell = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => {
        if (!mounted) { lateUpdates += 1; return }
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
      }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
      const cell = slots[index] = { deps }
      effects.push(() => { previous?.cleanup?.(); cell.cleanup = effect() })
    },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    setTimeout, clearTimeout,
    require: name => ({ react, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const render = () => {
    cursor = 0
    effects = []
    dirty = false
    tree = component(props)
    for (const effect of effects) effect()
    return tree
  }
  const flush = () => {
    let limit = 20
    while (dirty && limit-- > 0) render()
    assert.ok(limit > 0, 'hook rendering must settle')
    return tree
  }
  return {
    ...module.exports,
    render(nextComponent, nextProps) { component = nextComponent; props = nextProps; return render() },
    flush,
    async settle() { await new Promise(resolve => setImmediate(resolve)); return flush() },
    unmount() { mounted = false; for (const cell of slots) cell?.cleanup?.() },
    get lateUpdates() { return lateUpdates },
  }
}

function fixture() {
  const page = runtime(), catalog = { byId: { writer: { id: 'writer' }, next: { id: 'next' } } }
  const refreshed = [], references = [], opened = []
  const actions = {
    refreshCanvasSessions: () => { const request = deferred(); refreshed.push(request); return request.promise },
    retainCanvasSession: sessionId => {
      const opening = deferred()
      const reference = {
        sessionId, opening, ready: opening.promise, releases: 0,
        get binding() { assert.equal(this.releases, 0, 'a released reference cannot supply a SessionProvider'); return { sessionId } },
        release() { this.releases += 1; opening.reject(new Error('reference released')) },
      }
      references.push(reference)
      return reference
    },
    openClassicSession: sessionId => opened.push(sessionId),
  }
  const props = {
    sessionId: 'writer', actions,
    useSessions: pick => pick(catalog),
    SessionProvider: 'session-provider',
    renderSlot: name => ({ type: 'slot', props: { name }, children: [] }),
  }
  const draw = () => page.render(page.CanvasSession, props)
  const provider = () => {
    const node = page.flush()
    assert.equal(node.type, 'session-provider')
    assert.equal(node.props.session.binding.sessionId, props.sessionId)
    return node.props.session
  }
  return { page, catalog, refreshed, references, opened, actions, props, draw, provider }
}

test('canvas windows resolve the current Bot part from their stable entity id', () => {
  const page = runtime(), bot = { id: 'writer', sessionId: 'writer-current', parts: ['writer', 'writer-old'] }
  const roster = indexRoster({ bots: [bot], rooms: [{ id: 'planning' }] })
  assert.equal(page.canvasSessionId({ kind: 'bot', entityId: 'writer' }, roster), 'writer-current')
  bot.sessionId = 'writer-next'
  assert.equal(page.canvasSessionId({ kind: 'bot', entityId: 'writer' }, roster), 'writer-next')
  assert.equal(page.canvasSessionId({ kind: 'room', entityId: 'planning' }, roster), 'planning')
  assert.equal(page.canvasSessionId({ kind: 'bot', entityId: 'removed' }, roster), undefined)
})

test('a known Session retains immediately and releases exactly once on collapse or panel unmount', async () => {
  const data = fixture()
  data.draw()
  const reference = data.provider()
  assert.equal(data.refreshed.length, 0)
  assert.equal(data.references.length, 1)
  data.draw()
  assert.equal(data.provider(), reference)
  data.page.unmount()
  await data.page.settle()
  assert.equal(reference.releases, 1)
  assert.equal(data.page.lateUpdates, 0)
})

test('an uncatalogued fresh Session refreshes once and retains when the catalog arrives', async () => {
  const data = fixture()
  delete data.catalog.byId.writer
  assert.equal(data.draw().props.role, 'status')
  assert.equal(data.refreshed.length, 1)
  assert.equal(data.references.length, 0)
  data.catalog.byId.writer = { id: 'writer' }
  data.draw()
  const reference = data.provider()
  data.refreshed[0].resolve()
  await data.page.settle()
  assert.equal(data.provider(), reference)
  assert.equal(data.refreshed.length, 1)
  assert.equal(data.references.length, 1)
  data.page.unmount()
})

test('unmount during a catalog refresh cannot acquire a late reference or update state', async () => {
  const data = fixture()
  delete data.catalog.byId.writer
  data.draw()
  data.page.unmount()
  data.refreshed[0].reject(new Error('disconnected'))
  await data.page.settle()
  assert.equal(data.references.length, 0)
  assert.equal(data.page.lateUpdates, 0)
})

test('a catalog refresh failure exposes the current Session through the Classic fallback', async () => {
  const data = fixture()
  delete data.catalog.byId.writer
  data.draw()
  data.refreshed[0].reject(new Error('catalog offline'))
  const tree = await data.page.settle()
  assert.equal(tree.props.role, 'alert')
  assert.equal(tree.children[0], 'catalog offline')
  tree.children[1].props.onClick()
  assert.deepEqual(data.opened, ['writer'])
  assert.equal(data.references.length, 0)
  data.page.unmount()
})

test('a readiness failure releases its reference before the error fallback is used', async () => {
  const data = fixture()
  data.draw()
  const reference = data.provider()
  reference.opening.reject(new Error('history failed'))
  const tree = await data.page.settle()
  assert.equal(tree.props.role, 'alert')
  assert.equal(tree.children[0], 'history failed')
  assert.equal(reference.releases, 1)
  data.page.unmount()
  assert.equal(reference.releases, 1)
})

test('changing the current Bot part releases the old opening and ignores its late failure', async () => {
  const data = fixture()
  data.draw()
  const previous = data.provider()
  data.props.sessionId = 'next'
  assert.equal(data.draw().props.role, 'status')
  const current = data.provider()
  assert.equal(previous.releases, 1)
  assert.equal(current.sessionId, 'next')
  await data.page.settle()
  assert.equal(data.provider(), current)
  assert.equal(data.references.length, 2)
  data.page.unmount()
  assert.equal(current.releases, 1)
})

test('catalog removal hides the released reference and reappearance acquires a new one', async () => {
  const data = fixture()
  data.draw()
  const previous = data.provider()
  delete data.catalog.byId.writer
  assert.equal(data.draw().props.role, 'status')
  assert.equal(data.page.flush().props.role, 'status')
  assert.equal(previous.releases, 1)
  data.catalog.byId.writer = { id: 'writer' }
  assert.equal(data.draw().props.role, 'status')
  const current = data.provider()
  assert.notEqual(current, previous)
  data.refreshed[0].resolve()
  await data.page.settle()
  assert.equal(data.provider(), current)
  assert.equal(previous.releases, 1)
  data.page.unmount()
})

test('a synchronous retain failure renders an error without creating a reference', () => {
  const data = fixture()
  data.actions.retainCanvasSession = () => { throw new Error('no longer available') }
  data.draw()
  const tree = data.page.flush()
  assert.equal(tree.props.role, 'alert')
  assert.equal(tree.children[0], 'no longer available')
  assert.equal(data.references.length, 0)
  data.page.unmount()
})

test('an expanded canvas conversation mounts its activity and acknowledges only after the editor is ready', async () => {
  const page = runtime(), visits = []
  const bot = { id: 'writer', name: 'Writer' }
  const useSession = pick => pick({ openState: 'ready' })
  const useRoster = pick => pick({ byId: { writer: bot }, roomsById: {} })
  const useSessionStatus = () => {}, useLive = () => {}
  const actions = { beginVisit: id => visits.push(['begin', id]), endVisit: id => visits.push(['end', id]), clearUnread: id => visits.push(['read', id]), readCanvasChat: id => { visits.push(['visible', id]); return () => visits.push(['hidden', id]) } }
  const tree = page.render(page.CanvasConversation, {
    sessionId: 'writer', useSession, useRoster, useSessionStatus, useLive, actions,
    useCanvas: pick => pick({ active: 'bot:writer', windows: [{ id: 'bot:writer', entityId: 'writer' }] }),
    renderFactorySlot: () => ({ type: 'transcript', props: {}, children: [] }),
  })
  const surface = tree.children[0]
  const activity = surface.children.find(child => child?.type?.name === 'ActivityIndicator')
  assert.ok(activity)
  assert.equal(activity.props.sessionId, 'writer')
  assert.equal(activity.props.rootRef, surface.props.ref)
  assert.equal(activity.props.useSessionStatus, useSessionStatus)
  assert.equal(activity.props.useLive, useLive)
  assert.equal(activity.props.inline, true)
  assert.equal(activity.props.enabled, false)
  assert.deepEqual(visits, [])
  page.flush()
  await new Promise(resolve => setTimeout(resolve, 5))
  const ready = page.flush()
  assert.equal(ready.children[0].children.find(child => child?.type?.name === 'ActivityIndicator').props.enabled, true)
  assert.deepEqual(visits, [['visible', 'writer'], ['begin', 'writer'], ['read', 'writer']])
  page.unmount()
  assert.deepEqual(visits.at(-2), ['hidden', 'writer'])
  assert.deepEqual(visits.at(-1), ['end', 'writer'])
})
