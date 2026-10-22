import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    contents: "export { TeamSidebar } from './sidebar.js'; export { CanvasConversation, registerSessionBridge } from './canvas-session.js'",
    resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)),
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const findAll = (node, pick) => !node || typeof node !== 'object' ? []
  : [...(pick(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, pick))]
const find = (node, pick) => findAll(node, pick)[0]
const textOf = node => typeof node === 'string' ? node : node?.children.map(textOf).join('') ?? ''
const byLabel = (tree, label) => find(tree, node => node.type === 'button' && node.props['aria-label'] === label)

function fixture({ folded = true, canvas = true } = {}) {
  const scopes = new Map(), timers = new Map(), listeners = new Map()
  let scope, cursor, layouts, effects, dirty, tree, visited, clock = 0, timerId = 0
  const calls = { opened: [], canvasOpened: [], canvasOpenHadEmbedded: [], popouts: [], unread: [], visits: [], ended: [] }
  const alpha = { id: 'alpha', sessionId: 'alpha-current', name: 'Alpha', createdAt: 10 }
  const beta = { id: 'beta', sessionId: 'beta-current', name: 'Beta', createdAt: 20 }
  const room = { id: 'planning', name: 'Planning', members: ['alpha', 'beta'], createdAt: 30 }
  const roster = {
    ready: true, bots: [alpha, beta], rooms: [room], agents: [], mainBotId: 'alpha', mainBotIds: ['alpha'],
    byId: { alpha, beta, 'alpha-current': alpha, 'beta-current': beta },
    roomsById: { planning: room }, exchangeTurns: {}, questions: {}, agentOf: {},
  }
  const sessions = { ids: ['alpha-current', 'beta-current', 'planning'], byId: {
    'alpha-current': { id: 'alpha-current', updatedAt: 10, retainedBy: { mainView: 1 } },
    'beta-current': { id: 'beta-current', updatedAt: 20 }, planning: { id: 'planning', updatedAt: 30 },
  } }
  const emitter = prefix => ({
    addEventListener(name, run) { const key = `${prefix}:${name}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(run) },
    removeEventListener(name, run) { listeners.get(`${prefix}:${name}`)?.delete(run) },
    emit(name, event) { for (const run of listeners.get(`${prefix}:${name}`) ?? []) run(event) },
  })
  const view = {
    ...emitter('window'), matchMedia: () => ({ matches: true }),
    requestAnimationFrame: run => { const id = ++timerId; timers.set(id, { run, at: clock + 16 }); return id },
    cancelAnimationFrame: id => timers.delete(id),
    setTimeout: (run, wait) => { const id = ++timerId; timers.set(id, { run, at: clock + wait }); return id },
    clearTimeout: id => timers.delete(id),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    dispatchEvent(event) { if (event.type === 'bt:chat-popout') calls.popouts.push(event.detail); this.emit(event.type, event); return true },
  }
  const doc = {
    ...emitter('document'), defaultView: view,
    querySelector: selector => selector === '.bt-canvas' ? canvasRoot : null,
    getSelection: () => ({ isCollapsed: true }),
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
    body: { appendChild() {} },
    elementFromPoint: () => canvasRoot,
  }
  const classes = new Set(), properties = new Map()
  const column = {
    dataset: {}, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) },
    removeAttribute: name => { delete column.dataset[name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] },
  }
  const box = { left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }
  const canvasRoot = { getBoundingClientRect: () => box, closest: () => null }
  const center = { getBoundingClientRect: () => box }
  const frame = { classList: column.classList, getBoundingClientRect: () => box, querySelector: () => center }
  column.parentElement = frame
  const root = {
    ownerDocument: doc, contains: () => true, querySelector: () => null,
    closest: selector => selector === '[class*="_sidebarCol"]' || selector === '.bt-floating-team' ? column : null,
  }
  const paneBox = { left: 320, top: 100, width: 540, height: 600, right: 860, bottom: 700 }
  const captured = new Set()
  const paneElement = {
    ownerDocument: doc, parentElement: root, nodeType: 1, childNodes: [],
    getBoundingClientRect: () => paneBox,
    contains: target => target === paneElement,
    closest: selector => selector === '.bt-canvas-frame' ? { querySelector: () => canvasRoot } : null,
    setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id),
  }
  const list = { scrollTop: 0, querySelectorAll: selector => selector === '[data-room-id]' ? findAll(tree, node => node.type === 'button' && node.props['data-room-id']).map(node => ({ dataset: { roomId: node.props['data-room-id'] } })) : [] }
  const hook = (run, deps, queue) => {
    const index = cursor++, previous = scope[index]
    if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
    const cell = scope[index] = { deps }
    queue.push(() => { previous?.cleanup?.(); cell.cleanup = run() })
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext: value => { const context = { _currentValue: value }; context.Provider = { context }; return context },
    useContext: context => context._currentValue,
    Fragment: 'fragment',
    useRef(value) { return scope[cursor++] ??= { current: value } },
    useState(initial) {
      const cell = scope[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { const value = typeof next === 'function' ? next(cell.value) : next; if (!Object.is(value, cell.value)) { cell.value = value; dirty = true } }]
    },
    useEffect: (run, deps) => hook(run, deps, effects),
    useLayoutEffect: (run, deps) => hook(run, deps, layouts),
    useMemo(make, deps) {
      const index = cursor++, previous = scope[index]
      if (!previous || !deps || deps.some((value, at) => !Object.is(value, previous.deps?.[at]))) scope[index] = { value: make(), deps }
      return scope[index].value
    },
    useId() { const cell = scope[cursor++] ??= { value: 'team-list' }; return cell.value },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: name => ({ react, 'react-dom': { createPortal: node => node, flushSync: run => { run(); draw() } }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
    document: doc, window: view, Element: class {},
    localStorage: { getItem: () => JSON.stringify({ x: 20, y: 104, folded }), setItem() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (run, wait) => { const id = ++timerId; timers.set(id, { run, at: clock + wait }); return id },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: run => { const id = ++timerId; timers.set(id, { run, at: clock + 16 }); return id },
    cancelAnimationFrame: id => timers.delete(id),
  })
  const actions = {
    openSession: id => calls.opened.push(id), clearUnread: id => calls.unread.push(id),
    openCanvasEntity: id => {
      calls.canvasOpened.push(id)
      calls.canvasOpenHadEmbedded.push(Boolean(find(tree, node => node.type?.name === 'TeamAgentChat')))
    },
    beginVisit: id => calls.visits.push(id), endVisit: id => calls.ended.push(id), landOn() {},
    retainCanvasSession: sessionId => ({ sessionId, ready: Promise.resolve(), release() {} }),
    refreshCanvasSessions: () => assert.fail('the fixture catalog already contains each selected session'),
    readCanvasChat: () => () => {},
  }
  const props = {
    wide: true, actions, useRoster: pick => pick(roster), useUi: pick => pick({ unread: {} }),
    useSessions: pick => pick(sessions), usePanelInfo: pick => pick({ activePanelId: canvas ? 'ds-bot-canvas' : null }),
    useCanvas: pick => pick({ windows: [] }), useRegistry: pick => pick({}),
    useSessionStatus: pick => pick(new Map()), useSessionRetainInfo: (id, pick) => pick(sessions.byId[id]),
    useCompletions: pick => pick({}), useActivity: pick => pick({}), useWork: pick => pick({ bots: {}, rooms: {}, approvals: [] }),
  }
  const hostSession = react.createContext(null)
  function FixtureSessionProvider({ session, children }) {
    return react.createElement(hostSession.Provider, { value: session }, children)
  }
  module.exports.registerSessionBridge(FixtureSessionProvider, (_name, slotProps) => react.createElement(module.exports.CanvasConversation, {
    get sessionId() { return hostSession._currentValue.sessionId },
    useSession: pick => pick({ openState: 'open' }), useRoster: props.useRoster,
    useSessionStatus: props.useSessionStatus, useLive: pick => pick({}), useCanvas: props.useCanvas,
    actions, renderFactorySlot: () => null,
    onOpenConversation: slotProps.onOpenConversation,
  }))
  const renderComponents = new Set(['TeamSidebar', 'BotRow', 'RoomRow', 'TeamAgentChat', 'CanvasSession', 'CanvasConversation', 'FixtureSessionProvider'])
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return node
    if (node.type?.context) {
      const context = node.type.context, previous = context._currentValue
      context._currentValue = node.props.value
      const result = { ...node, children: node.children.map((child, index) => walk(child, `${path}/${index}`)) }
      context._currentValue = previous
      return result
    }
    if (typeof node.type === 'function' && renderComponents.has(node.type.name)) {
      const key = `${path}:${node.type.name}:${node.props.key ?? node.props.bot?.id ?? node.props.room?.id ?? ''}`
      visited.add(key)
      const before = scope, beforeCursor = cursor
      scope = scopes.get(key) ?? []; scopes.set(key, scope); cursor = 0
      const result = node.type({ ...node.props, children: node.children })
      scope = before; cursor = beforeCursor
      return { ...node, children: [walk(result, key)] }
    }
    if (node.props.ref && typeof node.type === 'string') node.props.ref.current = node.props.className === 'bt-list' ? list : root
    return { ...node, children: node.children.map((child, index) => walk(child, `${path}/${child?.props?.key ?? index}`)) }
  }
  const draw = () => {
    let limit = 20
    do {
      dirty = false; layouts = []; effects = []; visited = new Set()
      tree = walk({ type: module.exports.TeamSidebar, props, children: [] }, 'root')
      for (const [key, cells] of scopes) if (!visited.has(key)) { for (const cell of cells) cell?.cleanup?.(); scopes.delete(key) }
      for (const run of layouts) run()
      for (const run of effects) run()
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.run() }
      assert.ok(limit-- > 0, 'sidebar hooks must settle')
    } while (dirty)
    return tree
  }
  const row = id => find(tree, node => node.type === 'button' && (node.props['data-bot-id'] === id || node.props['data-room-id'] === id))
  const click = (node, detail = 1) => {
    assert.ok(node, 'the requested control must exist')
    const event = { detail, button: 0, pointerId: 1, clientX: 100, clientY: 100, stopped: false,
      preventDefault() {}, stopPropagation() { this.stopped = true },
      currentTarget: { ownerDocument: doc, dataset: {} },
    }
    if (detail && node.props.onPointerDown) { node.props.onPointerDown(event); view.emit('pointerup', event) }
    node.props.onClickCapture?.(event)
    if (!event.stopped) node.props.onClick(event)
    return draw()
  }
  const chat = () => find(tree, node => node.type?.name === 'TeamAgentChat')
  const pane = () => find(tree, node => node.type === 'div' && node.props.className?.split(' ').includes('bt-team-split-chat'))
  const event = (extra = {}) => ({
    target: paneElement, currentTarget: paneElement, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true,
    clientX: 400, clientY: 180, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true }, ...extra,
  })
  return {
    draw, calls, column, roster, sessions, row, chat,
    pane, doc,
    startPopout(extra) { const next = event(extra); doc.emit('pointerdown', next); pane().props.onPointerDownCapture(next); draw(); return next },
    pointer(name, extra) { const next = event(extra); doc.emit(name, next); draw(); return next },
    popoutKey(extra) { const next = event({ key: 'Enter', ctrlKey: true, shiftKey: true, ...extra }); pane().props.onKeyDownCapture(next); draw(); return next },
    clickRow(id, detail) { return click(row(id), detail) },
    close() { return click(byLabel(tree, 'Close window')) },
    sessionId: () => find(chat(), node => node.type?.name === 'CanvasSession')?.props.sessionId,
    title: () => textOf(find(tree, node => node.props.className === 'bt-team-chat-name')),
    advance(ms) {
      clock += ms
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.run() }
      return draw()
    },
    unmount() { for (const cells of scopes.values()) for (const cell of cells) cell?.cleanup?.(); scopes.clear() },
  }
}

test('clicking a folded bot avatar expands the sidebar directly into its current conversation', () => {
  const app = fixture()
  app.draw()
  assert.equal(app.column.dataset.folded, 'true')
  assert.equal(app.chat(), undefined)
  app.clickRow('alpha')
  assert.equal(app.column.dataset.folded, 'false')
  assert.equal(app.chat().props.entity.id, 'alpha')
  assert.equal(app.sessionId(), 'alpha-current')
  assert.equal(app.title(), 'Alpha')
  assert.equal(app.row('alpha').props['aria-current'], 'page')
  assert.ok(app.calls.unread.includes('alpha'))
  assert.deepEqual(app.calls.opened, [], 'canvas sidebar selection must stay on the embedded conversation surface')
  app.unmount()
})

test('selecting another avatar changes the title, selected row and session without reopening the old bot', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha'); app.clickRow('beta')
  assert.equal(app.chat().props.entity.id, 'beta')
  assert.equal(app.chat().props.key, 'beta')
  assert.equal(app.sessionId(), 'beta-current')
  assert.equal(app.title(), 'Beta')
  assert.equal(app.row('beta').props['aria-current'], 'page')
  assert.equal(app.row('alpha').props['aria-current'], undefined)
  assert.ok(app.calls.ended.includes('alpha-current'))
  assert.ok(app.calls.visits.includes('beta-current'))
  assert.equal(findAll(app.draw(), node => node.type?.name === 'CanvasSession').length, 1)
  app.unmount()
})

test('repeated activation and keyboard activation keep the selected avatar expanded', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha', 0); app.clickRow('alpha'); app.clickRow('alpha', 0)
  assert.equal(app.column.dataset.folded, 'false')
  assert.equal(app.sessionId(), 'alpha-current')
  assert.equal(app.chat().props.entity.id, 'alpha')
  app.unmount()
})

test('selecting a bot during the close animation cancels the old 240ms dismissal', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha'); app.close(); app.advance(120)
  app.clickRow('beta'); app.advance(121)
  assert.equal(app.chat().props.entity.id, 'beta')
  assert.equal(app.sessionId(), 'beta-current')
  assert.equal(app.column.dataset.folded, 'false')
  assert.equal(app.column.dataset.chatClosing, 'false')
  app.advance(1000)
  assert.equal(app.sessionId(), 'beta-current')
  app.unmount()
})

test('a folded room avatar opens that room session and retains the group drop target', () => {
  const app = fixture()
  app.draw(); app.clickRow('planning')
  assert.equal(app.column.dataset.folded, 'false')
  assert.equal(app.chat().props.entity.id, 'planning')
  assert.equal(app.sessionId(), 'planning')
  assert.equal(app.title(), 'Planning')
  assert.equal(find(app.draw(), node => node.props.className === 'bt-team-split-chat').props['data-room-drop-id'], 'planning')
  assert.deepEqual(app.calls.opened, [])
  app.unmount()
})

test('classic sidebar avatar selection continues using openSession for bots and rooms', () => {
  const app = fixture({ canvas: false })
  app.draw(); app.clickRow('alpha'); app.clickRow('beta'); app.clickRow('planning')
  assert.deepEqual(app.calls.opened, ['alpha', 'beta', 'planning'])
  assert.equal(app.chat(), undefined)
  app.unmount()
})

test('the current conversation pane exposes a keyboard region without a separate pop-out button', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha')
  assert.equal(app.pane().props.role, 'region')
  assert.equal(app.pane().props.tabIndex, 0)
  assert.equal(find(app.draw(), node => node.type === 'button' && node.props.title === 'Pop out to canvas'), undefined)
  assert.equal(app.sessionId(), 'alpha-current')
  assert.deepEqual(app.calls.canvasOpened, [])
  app.unmount()
})

test('dragging the pane detaches its current bot once after the embedded conversation unmounts', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha')
  assert.equal(app.sessionId(), 'alpha-current')
  const press = app.startPopout()
  assert.equal(press.defaultPrevented, false, 'a pending gesture must leave ordinary clicks available')
  app.pointer('pointermove', { clientX: 640, clientY: 230 })
  assert.deepEqual(app.calls.canvasOpened, [], 'moving the preview must not open another conversation')
  app.pointer('pointerup', { clientX: 650, clientY: 240 })
  app.pointer('pointerup', { clientX: 650, clientY: 240 })
  assert.deepEqual(app.calls.canvasOpened, ['alpha'])
  assert.deepEqual(app.calls.canvasOpenHadEmbedded, [false], 'flushSync must release the embedded occurrence before opening the canvas occurrence')
  assert.equal(app.chat(), undefined)
  assert.equal(app.calls.popouts.length, 1)
  assert.equal(app.calls.popouts[0].entityId, 'alpha')
  assert.equal(app.calls.popouts[0].offset.x, 240)
  assert.equal(app.calls.popouts[0].offset.y, 60)
  assert.deepEqual(app.calls.opened, [])
  app.unmount()
})

test('pane keyboard activation detaches the selected bot or room rather than the main-view session', () => {
  for (const { id, sessionId, modifiers } of [
    { id: 'beta', sessionId: 'beta-current', modifiers: { ctrlKey: true } },
    { id: 'planning', sessionId: 'planning', modifiers: { ctrlKey: false, metaKey: true } },
  ]) {
    const app = fixture()
    app.draw(); app.clickRow(id)
    assert.equal(app.sessionId(), sessionId)
    const key = app.popoutKey(modifiers)
    assert.equal(key.defaultPrevented, true)
    assert.equal(key.stopped, true)
    assert.deepEqual(app.calls.canvasOpened, [id])
    assert.deepEqual(app.calls.canvasOpenHadEmbedded, [false])
    assert.equal(app.calls.popouts.length, 1)
    assert.equal(app.calls.popouts[0].entityId, id)
    assert.equal(app.chat(), undefined)
    assert.deepEqual(app.calls.opened, [])
    app.unmount()
  }
})

test('cancelling a pane drag keeps the current conversation open and never stages a canvas occurrence', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha'); app.startPopout()
  app.pointer('pointermove', { clientX: 640, clientY: 230 })
  app.pointer('pointercancel')
  app.pointer('pointerup', { clientX: 650, clientY: 240 })
  app.advance(1000)
  assert.equal(app.sessionId(), 'alpha-current')
  assert.equal(app.chat().props.entity.id, 'alpha')
  assert.equal(app.column.dataset.chatClosing, 'false')
  assert.deepEqual(app.calls.canvasOpened, [])
  assert.deepEqual(app.calls.popouts, [])
  app.unmount()
})

test('switching conversation during a drag cancels the old gesture without detaching the new session', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha'); app.startPopout()
  app.pointer('pointermove', { clientX: 640, clientY: 230 })
  app.clickRow('beta')
  app.pointer('pointerup', { clientX: 650, clientY: 240 })
  assert.equal(app.sessionId(), 'beta-current')
  assert.equal(app.chat().props.entity.id, 'beta')
  assert.deepEqual(app.calls.canvasOpened, [])
  assert.deepEqual(app.calls.popouts, [])
  app.unmount()
})

test('a previous close deadline and detached conversation cannot dismiss the newly selected bot', () => {
  const app = fixture()
  app.draw(); app.clickRow('alpha'); app.close(); app.advance(120)
  app.clickRow('alpha'); app.startPopout()
  app.pointer('pointermove', { clientX: 640, clientY: 230 })
  app.pointer('pointerup', { clientX: 650, clientY: 240 })
  assert.deepEqual(app.calls.canvasOpened, ['alpha'])
  assert.equal(app.chat(), undefined)
  app.clickRow('beta'); app.advance(121); app.advance(1000)
  assert.equal(app.sessionId(), 'beta-current')
  assert.equal(app.chat().props.entity.id, 'beta')
  assert.equal(app.row('beta').props['aria-current'], 'page')
  assert.equal(app.column.dataset.chatClosing, 'false')
  assert.deepEqual(app.calls.canvasOpened, ['alpha'])
  app.unmount()
})


test('Shift range uses visible group rows and another click clears the selected range', () => {
  const app = fixture({ folded: false })
  for (const id of ['second', 'third']) {
    const room = { id, name: id, members: ['alpha'], createdAt: 31 }
    app.roster.rooms.push(room); app.roster.roomsById[id] = room
    app.sessions.ids.push(id); app.sessions.byId[id] = { id, updatedAt: 31 }
  }
  const tree = app.draw()
  const rows = findAll(tree, node => node.type === 'button' && node.props['data-room-id'])
  const first = rows[0].props['data-room-id'], last = rows.at(-1).props['data-room-id']
  app.clickRow(first)
  app.row(last).props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} })
  app.draw()
  for (const row of rows) assert.equal(app.row(row.props['data-room-id']).props['data-multi-selected'], 'true')
  app.doc.emit('pointerdown', { target: { closest: () => null }, button: 0 }); app.draw()
  for (const row of rows) assert.ok(!app.row(row.props['data-room-id']).props['data-multi-selected'])
})
