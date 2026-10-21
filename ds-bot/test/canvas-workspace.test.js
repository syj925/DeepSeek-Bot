import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { createCanvasState, openWindow, setCanvasSelection, setWindowCompact, collapseWindow, setRoomExpanded } from '../src/client/canvas-state.js'

const { outputFiles } = await build({
  stdin: {
    contents: "export * from './canvas-workspace.js'; export { stageChatPopout, takeChatPopout, CHAT_POPOUT_EVENT } from './chat-popout.js'",
    resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), sourcefile: 'canvas-workspace-test-entry.js',
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

function renderer() {
  const scopes = new Map(), timers = new Map(), frames = new Map(), observers = []
  const documentListeners = new Map()
  const doc = {
    activeElement: null, defaultView: null,
    addEventListener(type, callback, options = false) {
      const capture = typeof options === 'boolean' ? options : Boolean(options.capture)
      const listeners = documentListeners.get(type) ?? []
      if (!listeners.some(listener => listener.callback === callback && listener.capture === capture)) listeners.push({ callback, capture })
      documentListeners.set(type, listeners)
    },
    removeEventListener(type, callback, options = false) {
      const capture = typeof options === 'boolean' ? options : Boolean(options.capture)
      documentListeners.set(type, (documentListeners.get(type) ?? []).filter(listener => listener.callback !== callback || listener.capture !== capture))
    },
    emit(type, event, capture) {
      for (const listener of documentListeners.get(type) ?? []) if (listener.capture === capture) listener.callback(event)
    },
    dispatch(type, event, onTarget) {
      event.type ??= type
      this.emit(type, event, true)
      onTarget?.(event)
      if (!event.stopped) this.emit(type, event, false)
    },
  }
  let slots, cursor, now = 0, serial = 0
  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const effect = (create, deps) => {
    const cell = slots[cursor++] ??= { effect: true, deps: undefined, pending: null, cleanup: null }
    if (!sameDeps(cell.deps, deps)) { cell.pending = create; cell.nextDeps = deps }
  }
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: 'fragment',
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useEffect: effect,
    useLayoutEffect: effect,
    useMemo(make) { cursor++; return make() },
    useId: () => 'test-id',
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, document: doc,
    setTimeout: (callback, delay = 0) => { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { const id = ++serial; frames.set(id, callback); return id },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this) }
      observe(target) { this.targets.add(target) }
      disconnect() { this.targets.clear() }
    },
    getComputedStyle: node => node.computedStyle ?? { paddingLeft: '0px', paddingRight: '0px' },
    require: name => ({ react, 'react-dom': { createPortal: node => node }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  return {
    ...module.exports, document: doc, observers,
    render(component, props, key = component.name) {
      slots = scopes.get(key) ?? []
      scopes.set(key, slots)
      cursor = 0
      return component(props)
    },
    flushEffects(key) {
      for (const cell of scopes.get(key) ?? []) {
        if (!cell?.effect || !cell.pending) continue
        cell.cleanup?.()
        const create = cell.pending
        cell.pending = null
        cell.deps = cell.nextDeps
        cell.cleanup = create()
      }
    },
    unmount(key) {
      for (const cell of scopes.get(key) ?? []) if (cell?.effect) cell.cleanup?.()
      scopes.delete(key)
    },
    advance(ms) {
      const end = now + ms
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        const [id, timer] = due
        now = timer.at
        timers.delete(id)
        timer.callback()
      }
      now = end
    },
    flushFrames() {
      const pending = [...frames]
      frames.clear()
      for (const [, callback] of pending) callback(now)
    },
    get pendingTimers() { return timers.size },
    get pendingFrames() { return frames.size },
  }
}

function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate))]
}

const find = (node, predicate) => findAll(node, predicate)[0]
const button = (node, label) => find(node, value => value.type === 'button' && (value.props['aria-label'] === label || value.children.includes(label)))
const hasSession = node => findAll(node, value => value.type?.name === 'CanvasSession').length

test('dragging Main avatars together proposes a group; cancellation and multi-selection do not', async () => {
  for (const cancelled of [false, true]) {
    const app = fixture()
    const other = app.addBot({ id: 'partner', name: 'Partner' }, false)
    app.roster.mainBotIds.push('partner')
    let tree = app.draw()
    const source = app.state.windows.find(window => window.entityId === 'writer')
    button(app.card(tree), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer({ clientX: 100 + other.x - source.x, clientY: 100 + other.y - source.y }))
    tree = app.draw()
    assert.equal(app.card(tree, 'partner').props['data-drop-target'], true)
    tree.props.onPointerUp(pointer({ type: cancelled ? 'pointercancel' : 'pointerup', clientX: 100 + other.x - source.x, clientY: 100 + other.y - source.y }))
    tree = app.draw()
    const modal = find(tree, value => value.type?.name === 'MainAgentGroup')
    assert.equal(Boolean(modal), false)
    if (!cancelled) {
      await Promise.resolve()
      await Promise.resolve()
      assert.deepEqual(app.calls.created[0][0], ['writer', 'partner'])
      assert.equal(app.calls.entities[0], 'created-room')
    }
  }
})
const textOf = node => typeof node === 'string' ? node : node?.children?.map(textOf).join('') ?? ''

test('native contact drops use the same avatar distance as desktop grouping', async () => {
  for (const distance of [80, 58, 57]) {
    const app = fixture()
    const other = app.addBot({ id: 'partner', name: 'Partner' }, false)
    const tree = app.draw()
    tree.props.onDrop(pointer({ clientX: other.x + 60 - distance, clientY: other.y + 34,
      dataTransfer: { getData: () => JSON.stringify({ id: 'writer', kind: 'bot' }) } }))
    await Promise.resolve()
    assert.equal(app.calls.created.length, distance < 58 ? 1 : 0)
  }
})

test('repeat avatar grouping reopens the matching ordinary room but preserves task groups', async () => {
  for (const task of [undefined, { objective: 'Existing work' }]) {
    const app = fixture()
    const other = app.addBot({ id: 'partner', name: 'Partner' }, false)
    app.roster.rooms.push({ id: 'same', name: 'Writer + Partner', members: ['writer', 'partner'], task })
    app.draw().props.onDrop(pointer({ clientX: other.x + 60, clientY: other.y + 34, dataTransfer: { getData: () => JSON.stringify({ id: 'writer', kind: 'bot' }) } }))
    await Promise.resolve()
    if (!task) { assert.equal(app.calls.created.length, 0); assert.deepEqual(app.calls.entities, ['same']) }
    else { assert.equal(app.calls.created.length, 1); assert.equal(app.calls.created[0][1].name, 'Writer + Partner (2)') }
  }
})

test('release rechecks current coordinates, including before the scheduled drag frame', async () => {
  for (const scenario of ['preview-only', 'rapid-commit', 'leave-target', 'cancel']) {
    const app = fixture()
    const other = app.addBot({ id: 'partner', name: 'Partner' }, false)
    let tree = app.draw()
    const source = app.state.windows.find(window => window.entityId === 'writer')
    const at = distance => pointer({ clientX: 100 + other.x - source.x - distance, clientY: 100 + other.y - source.y })
    button(app.card(tree), 'Open conversation').props.onPointerDown(pointer())
    const updates = app.calls.updates
    tree.props.onPointerMove(at(scenario === 'preview-only' ? 80 : 20))
    if (scenario !== 'rapid-commit') {
      tree = app.draw()
      assert.equal(app.calls.updates, updates, 'movement must not publish the whole canvas')
      const hint = find(tree, value => value.type?.name === 'MergeHint')
      assert.ok(hint)
      assert.equal(app.card(tree, 'partner').props['data-drop-target'] === true, scenario !== 'preview-only')
    }
    tree.props.onPointerUp({ ...at(scenario === 'leave-target' ? 150 : scenario === 'preview-only' ? 80 : 20), type: scenario === 'cancel' ? 'pointercancel' : 'pointerup' })
    app.draw()
    await Promise.resolve()
    assert.equal(app.calls.created.length, scenario === 'rapid-commit' ? 1 : 0)
    assert.equal(app.calls.opened.length, 0)
    assert.equal(app.captures.size, 0)
    if (scenario === 'cancel') assert.equal(app.state.windows.find(window => window.entityId === 'writer').x, source.x)
  }
})

function pointer(options = {}) {
  return {
    button: 0, pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: 100, clientY: 100, shiftKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true },
    target: { closest: () => null }, ...options,
  }
}

function fixture({ rootBox = { left: 0, top: 0, width: 1000, height: 700 }, cardRects = [], roomExpanded = false, strictDom = false } = {}) {
  class FakeElement {}
  const contains = (parent, node) => {
    if (strictDom && node != null && !(node instanceof FakeElement)) throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.")
    for (let current = node; current; current = current.parentElement) if (current === parent) return true
    return false
  }
  const render = renderer()
  const writer = { id: 'writer', sessionId: 'writer-current', name: 'Writer', role: 'Product writing' }
  const room = { id: 'planning', name: 'Planning', members: ['writer'], admin: 'writer', mode: 'admin', preview: 'Next steps for the team' }
  const roster = { bots: [writer], rooms: [room], byId: { writer, 'writer-current': writer }, roomsById: { planning: room }, mainBotIds: ['writer'], exchangeTurns: {}, questions: {} }
  const work = { bots: {}, rooms: {}, approvals: [] }
  let state = openWindow(createCanvasState(), { kind: 'bot', id: 'writer' }, { x: 30, y: 70, width: 560, height: 640 })
  state = openWindow(state, { kind: 'room', id: 'planning' }, { x: 430, y: 70 })
  state = setRoomExpanded(state, 'planning', roomExpanded)
  const calls = { focused: [], updates: 0, opened: [], selected: [], details: [], settings: [], menus: [], entities: [], newChats: [], exchanges: [], created: [], added: [], saved: 0, arranged: 0, compacted: 0 }
  const captures = new Set()
  const roomHit = { current: null }
  const rectOf = rect => ({ ...rect, right: rect.right ?? rect.left + rect.width, bottom: rect.bottom ?? rect.top + rect.height })
  const rootRect = () => rectOf(rootBox)
  const document = render.document
  const viewListeners = new Map()
  document.defaultView = {
    Node: FakeElement,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } },
    addEventListener(type, callback) { if (!viewListeners.has(type)) viewListeners.set(type, new Set()); viewListeners.get(type).add(callback) },
    removeEventListener(type, callback) { viewListeners.get(type)?.delete(callback) },
    dispatchEvent(event) { for (const callback of [...(viewListeners.get(event.type) ?? [])]) callback(event); return true },
  }
  document.elementFromPoint = () => roomHit.current
  const root = {
    ownerDocument: document,
    contains: node => contains(root, node),
    querySelectorAll: selector => selector === '.bt-canvas-group-card[data-window-id]'
      ? [...cardRects, ...state.windows.filter(window => window.kind === 'room' && window.open && !cardRects.some(value => value.windowId === window.id && value.stage === 'avatar')).map(window => ({
          windowId: window.id, stage: 'avatar', rect: { left: rootBox.left + state.viewport.x + window.x * state.viewport.zoom, top: rootBox.top + state.viewport.y + window.y * state.viewport.zoom, width: 120 * state.viewport.zoom, height: 132 * state.viewport.zoom },
        }))].map(({ windowId, rect, stage = 'preview' }) => ({ dataset: { windowId, roomStage: stage }, getBoundingClientRect: () => rectOf(rect) })) : [],
    getBoundingClientRect: rootRect,
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  }
  Object.setPrototypeOf(root, FakeElement.prototype)
  const actions = {
    createRoom: async (members, options) => { calls.created.push([Array.from(members), { ...options }]); return { id: 'created-room', members: Array.from(members), ...options } },
    updateRoom: async (id, patch) => { calls.added.push([id, Array.from(patch.add)]); room.members = [...new Set([...room.members, ...patch.add])]; return { room } },
    updateCanvas: next => { calls.updates++; state = typeof next === 'function' ? next(state) : next },
    selectCanvasWindow: (id, selected = true, additive = false) => {
      calls.selected.push([id, selected, additive])
      const ids = additive ? selected ? [...new Set([...state.selected, id])] : state.selected.filter(value => value !== id) : [id]
      state = setCanvasSelection(state, ids, id)
    },
    openCanvasConversation: id => { calls.opened.push(id); state = setWindowCompact(setCanvasSelection(state, [id], id), id, false) },
    arrangeCanvasCards: () => { calls.arranged++ },
    compactCanvasConversations: () => { calls.compacted++ },
    showDetails: id => calls.details.push(id),
    openSettings: (...args) => calls.settings.push(args),
    openMenu: value => calls.menus.push({ ...value }),
    openCanvasEntity: id => calls.entities.push(id),
    openNewChat: (mode, members = []) => calls.newChats.push([mode, Array.from(members)]),
    openExchange: (...ids) => calls.exchanges.push(ids),
    saveCanvas: () => { calls.saved++ },
    retainCanvasSession: () => { throw new Error('workspace must not retain a Session while drawing a card') },
    refreshCanvasSessions: () => { throw new Error('workspace must not request Session history while drawing a card') },
  }
  const props = {
    actions,
    useRoster: pick => pick(roster), useCanvas: pick => pick(state),
    useSessions: pick => pick({ byId: { 'writer-current': { id: 'writer-current', preview: 'A short saved preview' }, planning: { id: 'planning' } } }),
    useWork: pick => pick(work),
    SessionProvider: 'session-provider',
    renderSlot: () => { throw new Error('a lightweight card must not render conversation slots') },
  }
  const draw = () => {
    render.flushFrames()
    const tree = render.render(render.CanvasWorkspace, props)
    tree.props.ref.current = root
    return tree
  }
  const hosts = new Map(), byProps = new WeakMap()
  const matches = (host, selector) => selector.split(',').some(value => {
    const part = value.trim(), props = host.node?.props ?? {}
    if (part.startsWith('.')) return props.className?.split(/\s+/).includes(part.slice(1))
    if (part.startsWith('[')) {
      const [, key, quoted] = part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/) ?? []
      return key && props[key] !== undefined && (quoted === undefined || String(props[key]) === quoted)
    }
    return host.node?.type === part.replace(/:.*/, '')
  })
  const mount = (node, window, scope, parent = root, path = '0') => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'fragment') { node.children.forEach((child, index) => mount(child, window, scope, parent, `${path}.${index}`)); return }
    const key = `${scope}:${path}`, host = hosts.get(key) ?? new FakeElement()
    hosts.set(key, host)
    host.node = node
    host.parentElement = node.props['data-room-stage'] === 'preview' ? root : parent
    host.ownerDocument = document
    host.children = []
    if (host.parentElement.children) host.parentElement.children.push(host)
    host.dataset = Object.fromEntries(Object.entries(node.props).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value]))
    host.contains = target => contains(host, target)
    host.closest = selector => { for (let current = host; current?.node; current = current.parentElement) if (matches(current, selector)) return current; return null }
    host.querySelector = selector => {
      const visit = current => { for (const child of current.children ?? []) { if (matches(child, selector)) return child; const result = visit(child); if (result) return result } return null }
      return visit(host)
    }
    host.focus = () => { document.activeElement = host; calls.focused.push(node.props['aria-label'] ?? node.props.className ?? 'node') }
    host.blur = () => { if (document.activeElement === host) document.activeElement = null }
    host.getBoundingClientRect = () => {
      const props = host.node.props
      if (props.className === 'bt-canvas-chat-layer') return rootRect()
      if (props.className === 'bt-canvas-chat-float') {
        const width = props.style.width ?? 860, height = props.style.height ?? 700
        const [x, y] = props.style.translate.split(' ').map(parseFloat)
        return rectOf({ left: rootBox.left + (rootBox.width - width) / 2 + x, top: rootBox.top + (rootBox.height - height) / 2 + y, width, height })
      }
      if (props['data-room-stage'] === 'preview') return rectOf({ left: rootBox.left + parseFloat(props.style.left), top: rootBox.top + parseFloat(props.style.top), width: parseFloat(props.style.width ?? props.style['--bt-room-preview-width']) || 320, height: parseFloat(props.style.height ?? props.style['--bt-room-preview-height']) || 300 })
      return rectOf({ left: rootBox.left + state.viewport.x + window.x * state.viewport.zoom, top: rootBox.top + state.viewport.y + window.y * state.viewport.zoom, width: 120 * state.viewport.zoom, height: (window.kind === 'room' ? 132 : 112) * state.viewport.zoom })
    }
    byProps.set(node.props, host)
    if (node.props.ref) node.props.ref.current = host
    node.children.forEach((child, index) => mount(child, window, scope, host, `${path}.${index}`))
  }
  const nested = (node, names) => {
    if (!node || typeof node !== 'object') return node
    if (names.includes(node.type?.name)) {
      const key = `${node.type.name}:${node.props.group?.id ?? node.props.room?.id ?? node.props.window?.id}`
      const result = nested(render.render(node.type, node.props, key), names)
      if (node.type.name === 'WindowCard') { mount(result, node.props.window, key); render.flushEffects(key); render.flushFrames() }
      return result
    }
    return { ...node, children: node.children.map(child => nested(child, names)) }
  }
  const chat = tree => {
    const value = find(tree, value => value.type?.name === 'CanvasChatWindow')
    return value ? nested(value, ['CanvasChatWindow', 'WindowCard']) : null
  }
  const mountedChat = (id = 'writer') => {
    const value = find(draw(), node => node.type?.name === 'CanvasChatWindow' && node.props.window.entityId === id)
    if (!value) return null
    const key = `CanvasChatWindow:${value.props.window.id}`
    const tree = render.render(value.type, value.props, key)
    mount(tree, value.props.window, key)
    render.flushEffects(key)
    return tree
  }
  const desktopTrees = tree => findAll(tree, value => value.type?.name === 'WindowCard').map(value => nested(value, ['WindowCard', 'RoomSummary']))
  const desktopCards = tree => desktopTrees(tree).flatMap(value => findAll(value, node => node.props['data-window-id'] && node.props['data-entity-id'] && node.props['data-room-stage'] !== 'preview'))
  const cards = tree => [...desktopCards(tree), ...findAll(chat(tree), value => value.props.className === 'bt-canvas-window')]
  const card = (tree, id = 'writer') => cards(tree).findLast(value => value.props['data-entity-id'] === id)
  const preview = (tree, id = 'planning') => {
    const window = state.windows.find(window => window.entityId === id)
    return desktopTrees(tree).flatMap(value => findAll(value, node => node.props['data-room-stage'] === 'preview' && node.props['data-window-id'] === window?.id))[0] ?? null
  }
  const showPreview = (id = 'planning') => {
    const value = card(draw(), id)
    const toggle = button(value, 'Expand group card') ?? button(value, 'Group card details')
    toggle.props.onClick(pointer({ detail: 0 }))
    return preview(draw(), id)
  }
  const group = tree => nested(find(tree, value => value.props.className === 'bt-canvas-group'), ['GroupTitle'])
  const departmentDock = tree => nested(find(tree, value => value.type?.name === 'CanvasDepartmentDock'), ['CanvasDepartmentDock'])
  const addBot = (bot, inRoom = true) => {
    roster.bots.push(bot)
    roster.byId[bot.id] = bot
    roster.byId[bot.sessionId ?? bot.id] = bot
    if (inRoom) room.members.push(bot.id)
    state = openWindow(state, { kind: 'bot', id: bot.id })
    return state.windows.find(value => value.entityId === bot.id)
  }
  const modal = () => {
    const node = find(draw(), value => value.type?.name === 'MainAgentGroup')
    return node ? render.render(node.type, node.props, 'group-dialog') : null
  }
  return { draw, cards, card, preview, showPreview, host: node => byProps.get(node?.props), advance: ms => render.advance(ms), get pendingTimers() { return render.pendingTimers }, unmountRoom: (id = 'planning') => render.unmount(`WindowCard:${state.windows.find(window => window.entityId === id)?.id}`), unmountChat: (id = 'writer') => render.unmount(`CanvasChatWindow:${state.windows.find(window => window.entityId === id)?.id}`), stagePopout: (id, rect, bounds = rootRect()) => render.stageChatPopout(id, rect, bounds, document.defaultView), takePopout: render.takeChatPopout, resizeChats: () => { for (const observer of render.observers) if (observer.targets.size) observer.callback() }, document, chat, mountedChat, desktopCards, group, departmentDock, addBot, modal, roster, room, work, calls, captures, actions, rootBox, cardRects, roomHit, get state() { return state }, set state(value) { state = value } }
}

test('right-drag selects all employees and a short right-click offers group actions', async () => {
  const app = fixture()
  app.addBot({ id: 'partner', name: 'Partner' }, false)
  app.roster.mainBotIds.push('partner')
  app.addBot({ id: 'child', name: 'Child', ownerId: 'writer' }, false)
  let tree = app.draw(), stage = find(tree, value => value.type === 'main')
  stage.props.onPointerDown(pointer({ button: 2, clientX: 0, clientY: 0 }))
  tree.props.onPointerMove(pointer({ button: 2, clientX: 990, clientY: 500 }))
  tree.props.onPointerUp(pointer({ button: 2, clientX: 990, clientY: 500, type: 'pointerup' }))
  assert.deepEqual(Array.from(app.state.selected), Array.from(app.state.windows.filter(window => ['writer', 'partner', 'child'].includes(window.entityId)), window => window.id))
  tree = app.draw()
  assert.equal(find(tree, value => value.props.role === 'menu'), undefined)
  find(tree, value => value.type === 'main').props.onPointerDown(pointer({ button: 2, clientX: 600, clientY: 300 }))
  tree.props.onPointerUp(pointer({ button: 2, type: 'pointerup' }))
  tree = app.draw()
  const menu = app.calls.menus.at(-1)
  assert.equal(typeof menu.createEmptyGroup, 'function')
  menu.createSelectedGroup()
  assert.ok(app.modal())
  assert.deepEqual(app.calls.created, [])
  await button(app.modal(), 'Create group chat').props.onClick()
  assert.deepEqual(app.calls.created[0][0], ['writer', 'partner', 'child'])
})

test('a short background right-click creates an empty, movable group without a backend Room', () => {
  const app = fixture()
  let tree = app.draw()
  find(tree, value => value.type === 'main').props.onPointerDown(pointer({ button: 2, clientX: 600, clientY: 300 }))
  tree.props.onPointerUp(pointer({ button: 2, type: 'pointerup' }))
  app.calls.menus.at(-1).createEmptyGroup()
  assert.equal(app.state.groups[0].draft, true)
  assert.equal(app.state.groups[0].x, 600)
  assert.equal(app.state.groups[0].y, 300)
  assert.deepEqual(app.calls.created, [])
  tree = app.draw()
  const node = find(tree, value => value.props['data-group-id'])
  const title = find(node, value => value.type?.name === 'GroupTitle')
  title.props.start(pointer(), 'group', app.state.groups[0].id)
  tree.props.onPointerMove(pointer({ clientX: 140, clientY: 150 }))
  tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 140, clientY: 150 }))
  assert.equal(app.state.groups[0].x, 640)
  assert.equal(app.state.groups[0].y, 350)
})

test('a draft stages one Main Agent, then creates a real group with a second even if the first icon is closed', async () => {
  const app = fixture()
  app.addBot({ id: 'partner', name: 'Partner' }, false)
  app.roster.mainBotIds.push('partner')
  app.draw().props.onContextMenu(pointer({ clientX: 500, clientY: 350 }))
  app.calls.menus.at(-1).createEmptyGroup()
  const drop = id => {
    const tree = app.draw()
    button(app.card(tree, id), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer({ clientX: 530, clientY: 400 }))
    assert.equal(find(app.draw(), value => value.props['data-group-id']).props['data-drop-target'], true)
    tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 530, clientY: 400 }))
  }
  const positions = Array.from(app.state.windows, ({ x, y }) => [x, y])
  drop('writer')
  await button(app.modal(), 'Add to group').props.onClick()
  assert.equal(app.calls.created.length, 0)
  assert.equal(app.state.groups[0].members.length, 1)
  app.state = collapseWindow(app.state, 'writer')
  drop('partner')
  await button(app.modal(), 'Create group chat').props.onClick()
  assert.deepEqual(app.calls.created[0][0], ['writer', 'partner'])
  assert.equal(app.calls.created[0][1].mainOnly, undefined)
  assert.equal(app.state.groups.length, 0)
  assert.deepEqual(Array.from(app.state.windows, ({ x, y }) => [x, y]), positions)
  assert.deepEqual(app.calls.entities, ['created-room'])
})

test('multi-selection can join an existing Main Agent group; cancellation restores every icon', async () => {
  for (const cancelled of [true, false]) {
    const app = fixture()
    for (const id of ['partner', 'third']) { app.addBot({ id, name: id }, false); app.roster.mainBotIds.push(id) }
    app.room.mainOnly = true
    const ids = app.state.windows.filter(window => ['partner', 'third'].includes(window.entityId)).map(window => window.id)
    app.state = setCanvasSelection(app.state, ids)
    const positions = app.state.windows.map(({ x, y }) => [x, y])
    const tree = app.draw()
    button(app.card(tree, 'partner'), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer({ clientX: 500, clientY: 140 }))
    assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], true)
    tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 500, clientY: 140 }))
    assert.deepEqual(Array.from(app.state.windows, ({ x, y }) => [x, y]), positions)
    const modal = app.modal()
    await button(modal, cancelled ? 'Cancel' : 'Add to group').props.onClick()
    assert.deepEqual(app.calls.added, cancelled ? [] : [['planning', ['partner', 'third']]])
    assert.deepEqual(app.room.members, cancelled ? ['writer'] : ['writer', 'partner', 'third'])
    assert.deepEqual(app.calls.created, [])
  }
})

test('already-present members and failed invitations leave the group unchanged and allow retry', async () => {
  const app = fixture()
  app.room.mainOnly = true
  const invite = id => {
    const tree = app.draw()
    button(app.card(tree, id), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer({ clientX: 500, clientY: 140 }))
    tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 500, clientY: 140 }))
  }
  invite('writer')
  let modal = app.modal()
  assert.equal(button(modal, 'Add to group').props.disabled, true)
  await button(modal, 'Add to group').props.onClick()
  assert.deepEqual(app.calls.added, [])
  button(modal, 'Cancel').props.onClick()
  app.addBot({ id: 'partner', name: 'Partner' }, false)
  app.roster.mainBotIds.push('partner')
  const original = app.actions.updateRoom
  app.actions.updateRoom = async () => { throw new Error('Offline') }
  invite('partner')
  await button(app.modal(), 'Add to group').props.onClick()
  modal = app.modal()
  assert.match(textOf(modal), /Offline/)
  assert.deepEqual(app.room.members, ['writer'])
  app.actions.updateRoom = original
  await button(app.modal(), 'Add to group').props.onClick()
  assert.deepEqual(app.calls.added, [['planning', ['partner']]])
})

test('employee avatars and Room cards keep management reachable without mounting conversation content', () => {
  const data = fixture(), tree = data.draw(), cards = data.cards(tree)
  assert.equal(cards.length, 2)
  for (const card of cards) {
    assert.equal(card.props['data-mode'], card.props['data-kind'] === 'bot' ? 'card' : 'avatar')
    const expected = card.props['data-kind'] === 'bot' ? { width: 120, height: 112 } : { width: 120, height: 132 }
    assert.deepEqual({ width: card.props.style.width, height: card.props.style.height }, expected)
    assert.equal(hasSession(card), 0)
    assert.equal(findAll(card, value => value.props.contentEditable || value.props.role === 'textbox' || /Editor|Composer|CanvasConversation/.test(value.type?.name ?? '')).length, 0)
    assert.ok(button(card, card.props['data-kind'] === 'bot' ? 'Open conversation' : 'Expand group card'))
    assert.equal(button(card, 'Memory'), undefined)
    assert.equal(button(card, 'Scheduled tasks'), undefined)
    assert.equal(find(card, value => value.props.className === 'bt-canvas-resize'), undefined)
  }
  assert.equal(button(data.card(tree), 'Details'), undefined)
  data.card(tree).props.onContextMenu(pointer({ type: 'contextmenu', currentTarget: { getBoundingClientRect: () => ({ right: 100, bottom: 100 }) } }))
  assert.equal(data.calls.menus.at(-1).id, 'writer')
  const preview = data.showPreview()
  assert.ok(button(preview, 'Group settings'))
  assert.ok(button(preview, 'Planning actions'))
  assert.match(textOf(data.card(tree)), /Main Bot/)
})

test('opening either employee or group mounts one floating Session and keeps its desktop card in place', () => {
  for (const id of ['writer', 'planning']) {
    const data = fixture(), original = data.state.windows.find(w => w.entityId === id)
    const before = data.state.windows.map(w => [w.x, w.y])
    data.actions.openCanvasConversation(original.id)
    const tree = data.draw(), chat = data.chat(tree)
    assert.equal(find(chat, node => node.type?.name === 'CanvasSession').props.sessionId, id === 'writer' ? 'writer-current' : id)
    assert.equal(hasSession(data.card(tree, id)), 0)
    assert.equal(data.card(tree, id).props['data-mode'], id === 'writer' ? 'card' : 'avatar')
    assert.deepEqual(data.state.windows.map(w => [w.x, w.y]), before)
    assert.equal(findAll(chat, node => node.props.className === 'bt-chat-resize').length, 8)
  }
})

test('a newly detached employee or room consumes its client placement once without moving its canvas avatar', () => {
  for (const id of ['writer', 'planning']) {
    const app = fixture({ rootBox: { left: 200, top: 100, width: 1200, height: 800 } })
    app.state = { ...app.state, viewport: { x: -250, y: 90, zoom: 1.8 } }
    const original = app.state.windows.find(window => window.entityId === id)
    const avatars = app.state.windows.map(({ id, x, y }) => [id, x, y])
    app.stagePopout(id, { left: 650, top: 240, width: 600, height: 400 })
    app.actions.openCanvasConversation(original.id)
    const tree = app.mountedChat(id)
    const float = find(tree, node => node.props.className === 'bt-canvas-chat-float')
    assert.deepEqual({ ...float.props.style }, { translate: '150px -60px', width: 600, height: 400 })
    assert.equal(float.props['data-entity-id'], id)
    assert.equal(find(tree, node => node.type?.name === 'CanvasSession').props.sessionId, id === 'writer' ? 'writer-current' : id)
    assert.equal(app.takePopout(id), undefined, 'mount consumes the request instead of leaving a stale placement')
    assert.deepEqual(app.state.windows.map(({ id, x, y }) => [id, x, y]), avatars)
    const again = find(app.mountedChat(id), node => node.props.className === 'bt-canvas-chat-float')
    assert.equal(again.props.style.translate, '150px -60px', 'rerenders keep the detached geometry')
    app.unmountChat(id)
  }
})

test('detaching into an existing float resets its task-group conversation, cancels closing and applies only its own placement', () => {
  const app = fixture()
  const original = app.state.windows.find(window => window.entityId === 'writer')
  app.actions.openCanvasConversation(original.id)
  let tree = app.mountedChat()
  find(tree, node => node.type?.name === 'CanvasSession').props.onOpenConversation('planning')
  tree = app.mountedChat()
  assert.equal(find(tree, node => node.type?.name === 'CanvasSession').props.sessionId, 'planning')
  button(tree, 'Close window').props.onClick()
  tree = app.mountedChat()
  assert.equal(find(tree, node => node.props.className === 'bt-canvas-chat-float').props['data-closing'], true)
  assert.equal(app.pendingTimers, 1)
  app.stagePopout('planning', { left: 220, top: 180, width: 560, height: 360 })
  assert.ok(app.takePopout('planning'), 'an unrelated float must not consume this room request')
  app.stagePopout('writer', { left: 300, top: 200, width: 600, height: 400 })
  tree = app.mountedChat()
  const float = find(tree, node => node.props.className === 'bt-canvas-chat-float')
  assert.equal(float.props['data-entity-id'], 'writer')
  assert.equal(find(tree, node => node.type?.name === 'CanvasSession').props.sessionId, 'writer-current')
  assert.equal(float.props['data-closing'], undefined)
  assert.deepEqual({ ...float.props.style }, { translate: '100px 50px', width: 600, height: 400 })
  assert.equal(app.takePopout('writer'), undefined)
  assert.equal(app.pendingTimers, 0, 'reopening removes the old close fallback')
  app.advance(241)
  assert.equal(app.state.windows.find(window => window.id === original.id).compact, false)
  assert.deepEqual([app.state.windows[0].x, app.state.windows[0].y], [original.x, original.y])
  assert.equal(app.document.activeElement, app.host(float), 'reused float receives focus')
  app.unmountChat()
})

test('an unmounted float cannot steal the next placement and a replacement mount consumes it', () => {
  const app = fixture()
  app.actions.openCanvasConversation(app.state.windows[0].id)
  app.mountedChat()
  app.unmountChat()
  app.stagePopout('writer', { left: 250, top: 150, width: 560, height: 360 })
  const float = find(app.mountedChat(), node => node.props.className === 'bt-canvas-chat-float')
  assert.deepEqual({ ...float.props.style }, { translate: '30px -20px', width: 560, height: 360 })
  assert.equal(app.takePopout('writer'), undefined)
  app.unmountChat()
})

test('detached geometry fits the unscaled canvas and remains bounded after the canvas becomes smaller', () => {
  const app = fixture({ rootBox: { left: 200, top: 100, width: 1000, height: 700 } })
  app.state = { ...app.state, viewport: { x: 280, y: -150, zoom: 2.5 } }
  app.stagePopout('writer', { left: -1000, top: 2000, width: 2000, height: 1400 })
  app.actions.openCanvasConversation(app.state.windows[0].id)
  let float = find(app.mountedChat(), node => node.props.className === 'bt-canvas-chat-float')
  assert.deepEqual({ ...float.props.style }, { translate: '0px 0px', width: 976, height: 676 })
  Object.assign(app.rootBox, { width: 600, height: 450 })
  app.resizeChats()
  float = find(app.mountedChat(), node => node.props.className === 'bt-canvas-chat-float')
  assert.deepEqual({ ...float.props.style }, { translate: '0px 0px', width: 576, height: 426 })
  const rect = app.host(float).getBoundingClientRect()
  assert.equal(rect.left, app.rootBox.left + 12)
  assert.equal(rect.top, app.rootBox.top + 12)
  app.unmountChat()
})

test('closing the floating chat preserves the employee, card location and session', () => {
  const data = fixture(), original = data.state.windows[0]
  data.actions.openCanvasConversation(original.id)
  button(data.chat(data.draw()), 'Close window').props.onClick()
  const chat = data.chat(data.draw())
  const float = find(chat, node => node.props.className === 'bt-canvas-chat-float')
  assert.equal(float.props['data-closing'], true)
  float.props.onAnimationEnd({target: null, currentTarget: null})
  assert.equal(data.state.windows[0].open, true)
  assert.equal(data.state.windows[0].compact, true)
  assert.equal(data.state.windows[0].x, original.x)
  assert.equal(data.roster.byId.writer.sessionId, 'writer-current')
  assert.equal(data.chat(data.draw()), null)
})

test('designer selection controls and keyboard movement never expand a lightweight card', () => {
  const data = fixture(), card = data.card(data.draw())
  const window = data.state.windows.find(value => value.entityId === 'writer')
  assert.equal(find(card, value => value.type === 'input' && value.props.type === 'checkbox'), undefined)
  assert.equal(find(card, value => value.props.className === 'bt-canvas-avatar-tools'), undefined)
  const event = pointer({ target: { closest: () => ({}) } })
  card.props.onPointerDownCapture(event)
  assert.deepEqual(data.calls.selected, [])
  card.props.onPointerDownCapture(pointer())
  const title = button(card, 'Move Writer')
  const key = pointer({ key: 'ArrowRight', shiftKey: true })
  title.props.onKeyDown(key)
  assert.equal(key.prevented, true)
  assert.equal(data.state.windows.find(value => value.id === window.id).x, window.x + 24)
  assert.equal(data.state.active, window.id)
  assert.equal(data.state.windows.every(value => value.compact), true)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('title drag updates card geometry and selection without retaining conversation content', () => {
  const data = fixture(), tree = data.draw(), card = data.card(tree)
  const before = data.state.windows.find(value => value.entityId === 'writer')
  const start = pointer()
  button(card, 'Move Writer').props.onPointerDown(start)
  assert.equal(start.prevented, true)
  assert.equal(data.captures.has(1), true)
  tree.props.onPointerMove(pointer({ clientX: 175, clientY: 125 }))
  tree.props.onPointerUp(pointer({ clientX: 175, clientY: 125 }))
  const after = data.state.windows.find(value => value.id === before.id)
  assert.equal(after.x, before.x + 75)
  assert.equal(after.y, before.y + 25)
  assert.equal(after.compact, true)
  assert.equal(data.state.active, before.id)
  assert.equal(data.calls.saved, 1)
  assert.equal(data.captures.size, 0)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('an avatar pointer click opens exactly once on release while tiny pointer jitter leaves its position unchanged', () => {
  const data = fixture(), tree = data.draw(), card = data.card(tree)
  const before = data.state.windows.find(value => value.entityId === 'writer')
  const avatar = button(card, 'Open conversation'), start = pointer()
  avatar.props.onPointerDown(start)
  assert.equal(start.prevented, true)
  assert.equal(start.stopped, true)
  assert.equal(data.captures.has(1), true)
  assert.deepEqual(data.calls.opened, [])
  tree.props.onPointerMove(pointer({ clientX: 103, clientY: 102 }))
  assert.equal(hasSession(data.card(data.draw())), 0)
  const pending = data.state.windows.find(value => value.id === before.id)
  assert.deepEqual({ x: pending.x, y: pending.y }, { x: before.x, y: before.y })
  tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 103, clientY: 102 }))
  avatar.props.onClick({ detail: 1 })
  assert.deepEqual(data.calls.opened, [before.id])
  assert.equal(data.captures.size, 0)
  assert.equal(data.calls.saved, 1)
  assert.equal(hasSession(data.chat(data.draw())), 1)
  assert.equal(hasSession(data.card(data.draw(), 'planning')), 0)
})

test('dragging an avatar moves all selected windows and never opens a conversation even when released at its origin', () => {
  const data = fixture(), ids = data.state.windows.map(value => value.id)
  data.state = setCanvasSelection(data.state, ids, ids[0])
  const before = data.state.windows.map(({ x, y }) => ({ x, y }))
  const tree = data.draw(), avatar = button(data.card(tree), 'Open conversation')
  avatar.props.onPointerDown(pointer())
  tree.props.onPointerMove(pointer({ clientX: 105, clientY: 100 }))
  data.state.windows.forEach((value, index) => {
    assert.equal(value.x, before[index].x, 'drag motion does not commit shared layout')
    assert.equal(value.y, before[index].y)
  })
  tree.props.onPointerMove(pointer())
  tree.props.onPointerUp(pointer({ type: 'pointerup' }))
  avatar.props.onClick({ detail: 1 })
  assert.deepEqual(Array.from(data.state.windows, ({ x, y }) => ({ x, y })), before)
  assert.equal(data.state.windows.every(value => value.compact), true)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.captures.size, 0)
  assert.equal(data.cards(data.draw()).reduce((count, item) => count + hasSession(item), 0), 0)
})

test('Shift-clicking avatars adds and removes selection without moving or opening them', () => {
  const data = fixture(), writer = data.state.windows[0], planning = data.state.windows[1]
  const positions = data.state.windows.map(({ x, y }) => ({ x, y }))
  let tree = data.draw(), avatar = button(data.card(tree), 'Open conversation')
  avatar.props.onPointerDown(pointer({ shiftKey: true }))
  tree.props.onPointerUp(pointer({ type: 'pointerup', shiftKey: true }))
  avatar.props.onClick({ detail: 1 })
  assert.deepEqual(data.state.selected, [planning.id, writer.id])
  tree = data.draw()
  avatar = button(data.card(tree), 'Open conversation')
  avatar.props.onPointerDown(pointer({ shiftKey: true }))
  tree.props.onPointerUp(pointer({ type: 'pointerup', shiftKey: true }))
  avatar.props.onClick({ detail: 1 })
  assert.deepEqual(data.state.selected, [planning.id])
  assert.deepEqual(data.calls.selected, [[writer.id, true, true], [writer.id, false, true]])
  assert.deepEqual(data.state.windows.map(({ x, y }) => ({ x, y })), positions)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.captures.size, 0)
  assert.equal(data.calls.saved, 0)
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('cancelling an avatar pointer releases capture and keeps its conversation unloaded', () => {
  const data = fixture(), tree = data.draw(), avatar = button(data.card(tree), 'Open conversation')
  avatar.props.onPointerDown(pointer())
  tree.props.onPointerCancel(pointer({ type: 'pointercancel' }))
  tree.props.onPointerUp(pointer({ type: 'pointerup' }))
  assert.equal(data.captures.size, 0)
  assert.equal(data.calls.saved, 1)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('avatar keyboard arrows adjust position before native keyboard activation opens the same employee', () => {
  const data = fixture(), tree = data.draw(), avatar = button(data.card(tree), 'Open conversation')
  const writer = data.state.windows[0]
  const left = pointer({ key: 'ArrowLeft' }), down = pointer({ key: 'ArrowDown', shiftKey: true })
  avatar.props.onKeyDown(left)
  avatar.props.onKeyDown(down)
  assert.equal(left.prevented, true)
  assert.equal(down.prevented, true)
  assert.equal(data.state.windows[0].x, writer.x - 8)
  assert.equal(data.state.windows[0].y, writer.y + 24)
  assert.deepEqual(data.calls.opened, [])
  const enter = pointer({ key: 'Enter' })
  avatar.props.onKeyDown(enter)
  assert.equal(enter.prevented, false)
  avatar.props.onClick({ detail: 0 })
  assert.deepEqual(data.calls.opened, [writer.id])
  assert.equal(find(data.chat(data.draw()), value => value.type?.name === 'CanvasSession').props.sessionId, 'writer-current')
})

test('grouping and moving compact cards keeps every conversation unmounted', () => {
  const data = fixture()
  const ids = data.state.windows.map(value => value.id)
  data.state = setCanvasSelection(data.state, ids, ids[0])
  button(data.draw(), 'Group windows').props.onClick()
  assert.equal(data.state.groups.length, 1)
  const before = data.state.windows.map(value => ({ x: value.x, y: value.y }))
  const tree = data.draw()
  const group = data.group(tree)
  button(group, 'Window group').props.onPointerDown(pointer())
  tree.props.onPointerMove(pointer({ clientX: 140, clientY: 120 }))
  tree.props.onPointerUp(pointer({ clientX: 140, clientY: 120 }))
  data.state.windows.forEach((value, index) => {
    assert.equal(value.x, before[index].x + 40)
    assert.equal(value.y, before[index].y + 20)
    assert.equal(value.compact, true)
  })
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.cards(data.draw()).reduce((count, card) => count + hasSession(card), 0), 0)
})

test('collapsing all conversations removes floating Session without moving desktop cards', () => {
  const data = fixture(), window = data.state.windows[0]
  data.actions.openCanvasConversation(window.id)
  assert.equal(hasSession(data.chat(data.draw())), 1)
  data.state = setWindowCompact(data.state, window.id, true)
  assert.equal(data.chat(data.draw()), null)
  assert.equal(data.state.windows[0].x, window.x)
  assert.equal(data.state.windows[0].y, window.y)
})

test('Arrange cards is an explicit toolbar action before grouping, and collapse stays separate', () => {
  const data = fixture(), window = data.state.windows[0]
  data.state = setWindowCompact(data.state, window.id, false)
  const tree = data.draw(), toolbar = find(tree, value => value.props.className === 'bt-canvas-toolbar')
  const arrange = button(toolbar, 'Arrange cards'), group = button(toolbar, 'Group windows'), collapse = button(toolbar, 'Collapse conversations')
  assert.equal(data.calls.arranged, 0)
  assert.equal(toolbar.children.indexOf(arrange) < toolbar.children.indexOf(group), true)
  assert.equal(arrange.props.disabled, false)
  assert.equal(collapse.props.disabled, false)
  arrange.props.onClick()
  assert.equal(data.calls.arranged, 1)
  assert.equal(data.calls.compacted, 0)
  collapse.props.onClick()
  assert.equal(data.calls.compacted, 1)
  assert.deepEqual(data.calls.opened, [])
})

test('empty workspace disables arranging and an all-card workspace disables collapse', () => {
  const data = fixture()
  assert.equal(button(data.draw(), 'Collapse conversations').props.disabled, true)
  data.state = createCanvasState()
  assert.equal(button(data.draw(), 'Arrange cards').props.disabled, true)
})

test('compact menus use stable employee and room identities while transcript context menus stay native', () => {
  const data = fixture(), tree = data.draw()
  const box = { right: 300, bottom: 120 }
  const click = pointer({ type: 'contextmenu', button: 2, clientX: 170, clientY: 180, currentTarget: { getBoundingClientRect: () => box } })
  data.card(tree).props.onContextMenu(click)
  assert.deepEqual(data.calls.menus, [{ id: 'writer', canvasWindowId: 'canvas-bot-writer', x: 170, y: 180 }])
  assert.equal(click.prevented, true)
  assert.equal(click.stopped, true)
  data.actions.selectCanvasWindow(data.state.windows.find(value => value.entityId === 'writer').id)
  data.card(data.draw()).props.onContextMenu(click)
  assert.deepEqual(data.calls.menus[1], { id: 'writer', canvasWindowId: 'canvas-bot-writer', x: 170, y: 180 }, 'selected Main Agents also open their own management menu')
  const context = pointer({ type: 'contextmenu', clientX: 150, clientY: 200, currentTarget: { getBoundingClientRect: () => box } })
  data.card(tree, 'planning').props.onContextMenu(context)
  assert.deepEqual(data.calls.menus[2], { id: 'planning', canvasWindowId: 'canvas-room-planning', x: 150, y: 200 })
  const transcript = pointer({ type: 'contextmenu', target: { closest: () => ({}) } })
  data.card(tree).props.onContextMenu(transcript)
  assert.equal(transcript.prevented, false)
  assert.equal(data.calls.menus.length, 3)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.cards(tree).reduce((count, card) => count + hasSession(card), 0), 0)
})

test('room member shortcuts and room settings route to original management actions', () => {
  const data = fixture(), preview = data.showPreview()
  button(preview, 'Writer').props.onClick()
  button(preview, 'Group settings').props.onClick()
  const mode = find(preview, value => value.props.className === 'bt-canvas-room-mode')
  mode.props.onClick()
  assert.deepEqual(data.calls.details, [])
  assert.deepEqual(data.calls.entities, ['writer'])
  assert.deepEqual(data.calls.settings, [['groups', 'planning'], ['groups', 'planning']])
  assert.deepEqual(data.calls.opened, [])
})

test('designer avatar status action reflects work, questions and approval without mounting history', () => {
  const data = fixture()
  const indicator = () => find(data.card(data.draw()), value => value.props.className === 'bt-canvas-avatar-status')
  let status = indicator()
  assert.equal(status.props['data-state'], 'available')
  assert.equal(status.props.title, 'Available')
  data.work.bots.writer = { tool: 'read' }
  status = indicator()
  assert.equal(status.props['data-state'], 'working')
  assert.equal(status.props.title, 'Working')
  data.roster.questions['writer-current'] = { text: 'Which file?' }
  status = indicator()
  assert.equal(status.props['data-state'], 'waiting')
  assert.equal(status.props.title, 'Waiting for your answer')
  data.work.approvals.push({ id: 'approval', botId: 'writer', tool: 'write' })
  status = indicator()
  assert.equal(status.props['data-state'], 'waiting')
  assert.equal(status.props.title, 'Waiting for your approval')
  assert.equal(status.type, 'span')
  assert.equal(status.props.onClick, undefined)
  assert.deepEqual(data.calls.details, [])
  assert.deepEqual(data.calls.opened, [])
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('compact room summary shows admin, reply mode, member work, and approvals without histories', () => {
  const data = fixture()
  data.addBot({ id: 'designer', name: 'Designer' })
  data.addBot({ id: 'reviewer', name: 'Reviewer' })
  data.work.rooms.planning = [{ botId: 'writer', tool: 'read', since: 100 }]
  data.work.approvals = [{ id: 'approval', botId: 'designer', roomId: 'planning', tool: 'write' }]
  let card = data.showPreview()
  assert.match(textOf(find(card, value => value.props.className === 'bt-canvas-room-mode')), /Admin leads.*Admin Writer/)
  assert.equal(button(card, 'Writer').props['data-state'], 'work')
  assert.equal(button(card, 'Designer').props['data-state'], 'ask')
  assert.equal(button(card, 'Reviewer').props['data-state'], 'idle')
  assert.match(button(card, 'Writer').props.title, /Admin.*Working/)
  assert.match(button(card, 'Designer').props.title, /Waiting for your approval/)
  const status = find(card, value => value.props.className === 'bt-canvas-card-state')
  assert.equal(status.props['data-state'], 'waiting')
  assert.match(textOf(status), /Designer is waiting for your approval/)
  status.props.onClick()
  button(card, 'Designer').props.onClick()
  assert.deepEqual(data.calls.details, ['planning'])
  assert.deepEqual(data.calls.entities, ['designer'])
  assert.equal(hasSession(card), 0)
  delete data.room.admin
  card = data.preview(data.draw())
  assert.match(textOf(find(card, value => value.props.className === 'bt-canvas-room-mode')), /Everyone.*No admin/)
})

test('room member overflow opens the existing details panel and hides missing roster entries', () => {
  const data = fixture()
  for (const id of ['designer', 'reviewer', 'ops']) data.addBot({ id, name: id })
  data.room.members.push('missing')
  const card = data.showPreview()
  const members = find(card, value => value.props.className === 'bt-canvas-members')
  assert.equal(members.props['aria-label'], 'Members · 4')
  assert.equal(findAll(members, value => value.props['data-state']).length, 3)
  button(members, '+1').props.onClick()
  assert.deepEqual(data.calls.details, ['planning'])
  assert.deepEqual(data.calls.opened, [])
})

test('selected employees seed the real group creation flow and pair exchange, excluding rooms', () => {
  const data = fixture()
  data.addBot({ id: 'designer', sessionId: 'designer-current', name: 'Designer' })
  data.state = setCanvasSelection(data.state, data.state.windows.map(value => value.id))
  const tree = data.draw(), toolbar = find(tree, value => value.props.className === 'bt-canvas-toolbar')
  assert.deepEqual(data.calls.newChats, [])
  button(toolbar, 'Create group with selected').props.onClick()
  button(toolbar, 'Bot exchange').props.onClick()
  assert.deepEqual(data.calls.newChats, [['group', ['writer', 'designer']]])
  assert.deepEqual(data.calls.exchanges, [['writer', 'designer']])
  assert.equal(data.state.groups.length, 0)
  assert.deepEqual(data.calls.opened, [])
  data.addBot({ id: 'reviewer', name: 'Reviewer' })
  data.state = setCanvasSelection(data.state, data.state.windows.map(value => value.id))
  assert.equal(button(data.draw(), 'Bot exchange'), undefined)
})

test('a room and one employee cannot accidentally seed a group or expose a Bot exchange', () => {
  const data = fixture()
  data.state = setCanvasSelection(data.state, data.state.windows.map(value => value.id))
  const tree = data.draw()
  assert.equal(button(tree, 'Create group with selected'), undefined)
  assert.equal(button(tree, 'Bot exchange'), undefined)
  button(tree, 'Create group chat').props.onClick()
  assert.deepEqual(data.calls.newChats, [['group', []]])
})

test('visual window grouping stays separate and offers explicit real group creation from its employees', () => {
  const data = fixture()
  data.addBot({ id: 'designer', name: 'Designer' })
  data.state = setCanvasSelection(data.state, data.state.windows.map(value => value.id))
  button(data.draw(), 'Group windows').props.onClick()
  assert.equal(data.state.groups.length, 1)
  assert.deepEqual(data.calls.newChats, [])
  button(data.group(data.draw()), 'Create group chat').props.onClick()
  assert.deepEqual(data.calls.newChats, [['group', ['writer', 'designer']]])
  assert.equal(data.roster.rooms.length, 1)
  assert.equal(data.cards(data.draw()).reduce((count, card) => count + hasSession(card), 0), 0)
})

test('window group title rename saves only that visual label and Escape cancels edits', () => {
  const data = fixture()
  data.state = setCanvasSelection(data.state, data.state.windows.map(value => value.id))
  button(data.draw(), 'Group windows').props.onClick()
  button(data.group(data.draw()), 'Rename window group').props.onClick()
  let input = find(data.group(data.draw()), value => value.type === 'input')
  assert.equal(input.props['aria-label'], 'Window group name')
  input.props.onChange({ target: { value: '  Editorial team  ' } })
  input = find(data.group(data.draw()), value => value.type === 'input')
  input.props.onBlur()
  assert.equal(data.state.groups[0].name, 'Editorial team')
  assert.equal(data.room.name, 'Planning')
  button(data.group(data.draw()), 'Rename window group').props.onClick()
  input = find(data.group(data.draw()), value => value.type === 'input')
  input.props.onChange({ target: { value: 'Discard me' } })
  input = find(data.group(data.draw()), value => value.type === 'input')
  const escape = pointer({ key: 'Escape' })
  input.props.onKeyDown(escape)
  input.props.onBlur()
  assert.equal(escape.prevented, true)
  assert.equal(data.state.groups[0].name, 'Editorial team')
  assert.equal(find(data.group(data.draw()), value => value.type === 'input'), undefined)
  assert.deepEqual(data.calls.newChats, [])
  assert.deepEqual(data.calls.opened, [])
})


test('background drag selects instead of moving the fixed desktop viewport', () => {
  const data = fixture(), tree = data.draw(), before = {...data.state.viewport}
  find(tree, node => node.type === 'main').props.onPointerDown(pointer({clientX: 20, clientY: 20}))
  tree.props.onPointerMove(pointer({clientX: 700, clientY: 400}))
  tree.props.onPointerUp(pointer({type: 'pointerup'}))
  assert.deepEqual({...data.state.viewport}, before)
  assert.ok(data.state.selected.length > 0)
})

test('floating window Escape uses the exit animation and leaves its desktop icon alive', () => {
  const data = fixture(), original = data.state.windows[0]
  data.actions.openCanvasConversation(original.id)
  const chat = data.chat(data.draw())
  const float = find(chat, node => node.props.className === 'bt-canvas-chat-float')
  const escape = pointer({key: 'Escape', nativeEvent: {isComposing: false}})
  float.props.onKeyDown(escape)
  assert.equal(escape.prevented, true)
  const closing = find(data.chat(data.draw()), node => node.props.className === 'bt-canvas-chat-float')
  assert.equal(closing.props['data-closing'], true)
  closing.props.onAnimationEnd({target: null, currentTarget: null})
  assert.equal(data.state.windows[0].open, true)
  assert.equal(data.state.windows[0].compact, true)
  assert.equal(data.state.windows[0].x, original.x)
})

test('left click on blank desktop clears selection without moving icons; right click keeps it', () => {
  for (const mouseButton of [0, 2]) {
    const data = fixture()
    const id = data.state.windows[0].id
    data.actions.selectCanvasWindow(id)
    const before = data.state.windows.map(window => [window.id, window.x, window.y])
    const tree = data.draw()
    find(tree, node => node.type === 'main').props.onPointerDown(pointer({ button: mouseButton, clientX: 900, clientY: 650 }))
    tree.props.onPointerUp(pointer({ button: mouseButton, type: 'pointerup', clientX: 900, clientY: 650 }))
    assert.equal(data.state.selected.length, mouseButton === 0 ? 0 : 1)
    assert.equal(JSON.stringify(data.state.windows.map(window => [window.id, window.x, window.y])), JSON.stringify(before))
    if (mouseButton === 0) assert.equal(data.card(data.draw()).props['data-active'], undefined)
  }
})


test('multiple employee and group chats stay mounted; selecting one only changes their stacking order', () => {
  const data = fixture()
  const ids = data.state.windows.map(window => window.id)
  for (const id of ids) data.actions.openCanvasConversation(id)
  let windows = findAll(data.draw(), node => node.type?.name === 'CanvasChatWindow')
  assert.equal(windows.length, 2)
  assert.equal(windows.at(-1).props.window.id, ids.at(-1))
  data.actions.selectCanvasWindow(ids[0])
  windows = findAll(data.draw(), node => node.type?.name === 'CanvasChatWindow')
  assert.equal(windows.length, 2)
  assert.equal(windows.at(-1).props.window.id, ids[0])
  data.actions.updateCanvas(state => setWindowCompact(state, ids[0], true))
  windows = findAll(data.draw(), node => node.type?.name === 'CanvasChatWindow')
  assert.equal(windows.length, 1)
  assert.equal(windows[0].props.window.id, ids[1])
})

test('focusing a conversation raises it without selecting its desktop avatar', () => {
  const data = fixture()
  const ids = data.state.windows.map(window => window.id)
  for (const id of ids) data.actions.openCanvasConversation(id)
  const chat = data.chat(data.draw())
  const float = find(chat, node => node.props.className === 'bt-canvas-chat-float')
  float.props.onPointerDown(pointer())
  assert.equal(data.state.active, ids[0])
  assert.equal(data.state.selected.length, 0)
  assert.equal(data.state.windows.filter(window => !window.compact).length, 2)
})


function showMeasuredGroupCard(app, height = 300) {
  const room = app.state.windows.find(window => window.entityId === app.room.id)
  const preview = app.showPreview()
  assert.ok(preview)
  const box = app.host(preview).getBoundingClientRect()
  app.cardRects.splice(0, app.cardRects.length, {
    windowId: room.id, stage: 'preview',
    rect: { left: box.left, top: box.top, width: box.width, height },
  })
  return { clientX: box.left + box.width * .8, clientY: box.top + Math.min(40, height / 2) }
}

test('ordinary employees join the wide visible group card from two to three to four members without creating another room', async () => {
  const app = fixture()
  app.addBot({ id: 'second', name: 'Second' })
  for (const id of ['third', 'fourth']) app.addBot({ id, name: id }, false)
  app.state = { ...app.state, windows: app.state.windows.map(window => window.kind === 'room' ? { ...window, compact: true, width: 420, height: 540 } : window) }
  const at = showMeasuredGroupCard(app)
  const positions = app.state.windows.map(({ x, y }) => [x, y])
  for (const id of ['third', 'fourth']) {
    assert.equal(app.roster.mainBotIds.includes(id), false)
    const tree = app.draw()
    button(app.card(tree, id), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer(at))
    assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], true)
    tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
    const modal = app.modal()
    assert.ok(modal)
    await button(modal, 'Add to group').props.onClick()
    const expected = id === 'third' ? ['writer', 'second', 'third'] : ['writer', 'second', 'third', 'fourth']
    assert.deepEqual(app.room.members, expected)
    assert.equal(app.room.id, 'planning')
    assert.equal(app.room.admin, 'writer')
    assert.deepEqual(Array.from(app.state.windows, ({ x, y }) => [x, y]), positions)
  }
  assert.deepEqual(app.calls.added, [['planning', ['third']], ['planning', ['fourth']]])
  assert.deepEqual(app.calls.created, [])
})

test('dropping below the visible auto-height group card does not invite an employee', () => {
  for (const roomExpanded of [true, false]) {
    const app = fixture({ roomExpanded })
    app.addBot({ id: 'third', name: 'Third' }, false)
    app.state = { ...app.state, windows: app.state.windows.map(window => window.kind === 'room' ? { ...window, compact: true, width: 420, height: 540 } : window) }
    showMeasuredGroupCard(app)
    const rect = app.cardRects[0].rect
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height + 1 }
    const tree = app.draw()
    button(app.card(tree, 'third'), 'Open conversation').props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer(at))
    assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], undefined)
    tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
    assert.equal(app.modal(), null)
    assert.deepEqual(app.calls.added, [])
    assert.deepEqual(app.calls.created, [])
  }
})

test('native drops resolve the visible group card after canvas origin, pan and zoom changes', async () => {
  const app = fixture({ rootBox: { left: 200, top: 100, width: 1000, height: 700 } })
  app.addBot({ id: 'second', name: 'Second' })
  app.addBot({ id: 'third', name: 'Third' }, false)
  app.state = { ...app.state, viewport: { x: 20, y: -40, zoom: .5 }, windows: app.state.windows.map(window => window.kind === 'room' ? { ...window, compact: true, width: 420, height: 540 } : window) }
  const at = showMeasuredGroupCard(app)
  const payload = JSON.stringify({ id: 'third', kind: 'bot' })
  app.draw().props.onDrop({ ...pointer(at), dataTransfer: { getData: type => type === 'application/x-ds-bot' ? payload : '' } })
  const modal = app.modal()
  assert.ok(modal)
  await button(modal, 'Add to group').props.onClick()
  assert.deepEqual(app.calls.added, [['planning', ['third']]])
  assert.deepEqual(app.room.members, ['writer', 'second', 'third'])
  assert.equal(app.room.admin, 'writer')
  assert.deepEqual(app.calls.created, [])
})

test('an employee can join an open sidebar group without a canvas room card or popping out that conversation', async () => {
  const app = fixture()
  app.addBot({ id: 'second', name: 'Second' })
  app.addBot({ id: 'third', name: 'Third' }, false)
  app.state = { ...app.state, windows: app.state.windows.filter(window => window.kind !== 'room') }
  app.roomHit.current = { closest: selector => selector === '[data-room-drop-id]' ? { dataset: { roomDropId: 'planning' } } : null }
  const tree = app.draw(), at = { clientX: 750, clientY: 350 }
  button(app.card(tree, 'third'), 'Open conversation').props.onPointerDown(pointer())
  tree.props.onPointerMove(pointer(at))
  tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
  const modal = app.modal()
  assert.ok(modal)
  await button(modal, 'Add to group').props.onClick()
  assert.deepEqual(app.calls.added, [['planning', ['third']]])
  assert.deepEqual(app.room.members, ['writer', 'second', 'third'])
  assert.equal(app.room.admin, 'writer')
  assert.deepEqual(app.calls.created, [])
  assert.deepEqual(app.calls.entities, [])
  assert.equal(app.state.windows.some(window => window.kind === 'room'), false)
})


test('a Dock employee can join a room after one move event while preserving the original desktop geometry', async () => {
  for (const surface of ['card', 'sidebar']) {
    const app = fixture()
    app.addBot({ id: 'partner', name: 'Partner' })
    app.addBot({ id: 'designer', name: '设计Agent' }, false)
    app.roster.teams = [{ id: 'design', name: '设计部', members: ['designer'], leaderId: 'designer' }]
    let at
    if (surface === 'sidebar') {
      app.state = { ...app.state, windows: app.state.windows.filter(window => window.kind !== 'room') }
      app.roomHit.current = { closest: selector => selector === '[data-room-drop-id]' ? { dataset: { roomDropId: 'planning' } } : null }
      at = { clientX: 750, clientY: 350 }
    } else at = showMeasuredGroupCard(app)
    const geometry = app.state.windows.map(({ id, x, y }) => [id, x, y])
    const tree = app.draw()
    const dock = find(app.departmentDock(tree), node => node.type?.name === 'DockItem' && node.props['data-dept-key'] === 'design')
    assert.ok(dock)
    assert.equal(dock.props['aria-label'], '产品部', 'display skin changes the label while the real team key stays design')
    dock.props.onPointerDown(pointer())
    tree.props.onPointerMove(pointer(at))
    tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
    assert.deepEqual(Array.from(app.state.windows, ({ id, x, y }) => [id, x, y]), geometry)
    const modal = app.modal()
    assert.ok(modal)
    await button(modal, 'Add to group').props.onClick()
    assert.deepEqual(app.calls.added, [['planning', ['designer']]])
    assert.deepEqual(app.room.members, ['writer', 'partner', 'designer'])
    assert.equal(app.room.admin, 'writer')
    assert.deepEqual(app.calls.created, [])
    assert.deepEqual(Array.from(app.state.windows, ({ id, x, y }) => [id, x, y]), geometry)
    if (surface === 'sidebar') {
      assert.deepEqual(app.calls.entities, [])
      assert.equal(app.state.windows.some(window => window.kind === 'room'), false)
    }
  }
})


test('hovering a group avatar opens its portal preview after 120ms without selecting, persisting or opening a conversation', () => {
  const app = fixture()
  const original = structuredClone(app.state), selected = app.calls.selected.length, updates = app.calls.updates
  const card = app.card(app.draw(), 'planning'), avatar = button(card, 'Expand group card')
  assert.equal(card.props['data-room-stage'], 'avatar')
  assert.deepEqual({ width: card.props.style.width, height: card.props.style.height }, { width: 120, height: 132 })
  assert.equal(find(card, node => node.type?.name === 'RoomAvatar').props.size, 72)
  const editor = { id: 'existing-focus' }
  app.document.activeElement = editor
  avatar.props.onPointerEnter(pointer())
  app.advance(119)
  assert.equal(Boolean(app.preview(app.draw())), false)
  app.advance(1)
  const preview = app.preview(app.draw())
  assert.ok(preview)
  assert.equal(preview.props['data-room-drop-id'], 'planning')
  assert.ok(button(preview, 'Open conversation'))
  assert.equal(hasSession(preview), 0)
  assert.ok(button(app.card(app.draw(), 'planning'), 'Expand group card'))
  assert.equal(app.chat(app.draw()), null)
  assert.equal(app.document.activeElement, editor)
  assert.deepEqual(app.calls.focused, [])
  assert.equal(app.calls.selected.length, selected)
  assert.equal(app.calls.updates, updates)
  assert.equal(app.calls.saved, 0)
  assert.deepEqual(app.calls.opened, [])
  assert.deepEqual(app.state, original)
})

test('moving from a group avatar into the preview cancels delayed close and a real exit closes after 240ms', () => {
  const app = fixture()
  button(app.card(app.draw(), 'planning'), 'Expand group card').props.onPointerEnter(pointer())
  app.advance(120)
  let card = app.card(app.draw(), 'planning'), preview = app.preview(app.draw())
  card.props.onPointerLeave(pointer({ relatedTarget: app.host(preview) }))
  preview.props.onPointerEnter(pointer())
  app.advance(240)
  assert.ok(app.preview(app.draw()))
  preview = app.preview(app.draw())
  preview.props.onPointerLeave(pointer({ relatedTarget: null }))
  app.advance(239)
  assert.ok(app.preview(app.draw()))
  app.advance(1)
  assert.equal(Boolean(app.preview(app.draw())), false)
  assert.ok(button(app.card(app.draw(), 'planning'), 'Expand group card'))
  assert.deepEqual(app.calls.opened, [])
  const avatar = button(app.card(app.draw(), 'planning'), 'Expand group card')
  avatar.props.onPointerEnter(pointer())
  app.unmountRoom()
  assert.equal(app.pendingTimers, 0)
  app.advance(500)
  assert.deepEqual(app.calls.opened, [])
})

test('keyboard and touch fallback and delayed mouse preview only enter the chat through Open conversation', () => {
  for (const activation of ['keyboard', 'touch', 'mouse-tap', 'details']) {
    const app = fixture()
    const original = app.state.windows.find(window => window.entityId === 'planning')
    const tree = app.draw(), avatar = button(app.card(tree, 'planning'), 'Expand group card')
    if (activation === 'keyboard') avatar.props.onClick(pointer({ detail: 0 }))
    else if (activation === 'details') button(app.card(tree, 'planning'), 'Group card details').props.onClick(pointer())
    else {
      const pointerType = activation === 'touch' ? 'touch' : 'mouse'
      avatar.props.onPointerEnter(pointer({ pointerType }))
      if (pointerType === 'touch') { app.advance(120); assert.equal(Boolean(app.preview(app.draw())), false) }
      avatar.props.onPointerDown(pointer({ pointerType, buttons: 1 }))
      tree.props.onPointerMove(pointer({ pointerType, clientX: 103, clientY: 102 }))
      tree.props.onPointerUp(pointer({ pointerType, type: 'pointerup', clientX: 103, clientY: 102 }))
      avatar.props.onClick(pointer({ pointerType, detail: 1 }))
      if (activation === 'mouse-tap') {
        assert.equal(Boolean(app.preview(app.draw())), false, 'a mouse tap must not reveal the popup immediately')
        app.advance(119)
        assert.equal(Boolean(app.preview(app.draw())), false)
        app.advance(1)
      }
    }
    const preview = app.preview(app.draw())
    assert.ok(preview, activation)
    assert.ok(button(app.card(app.draw(), 'planning'), 'Expand group card'))
    assert.equal(app.chat(app.draw()), null)
    assert.deepEqual(app.calls.opened, [])
    if (activation === 'keyboard' || activation === 'details') assert.ok(app.calls.focused.includes('Open conversation'))
    button(preview, 'Open conversation').props.onClick(pointer())
    assert.equal(Boolean(app.preview(app.draw())), false)
    const chat = app.chat(app.draw())
    assert.equal(hasSession(chat), 1)
    assert.equal(find(chat, node => node.type?.name === 'CanvasSession').props.sessionId, 'planning')
    const roomWindow = app.state.windows.find(window => window.id === original.id)
    assert.equal(roomWindow.compact, false)
    assert.deepEqual([roomWindow.x, roomWindow.y], [original.x, original.y])
  }
})

test('group preview Escape and chat dismissal preserve the permanent avatar and real members', () => {
  for (const dismissal of ['button', 'escape', 'backdrop']) {
    const app = fixture()
    app.addBot({ id: 'partner', name: 'Partner' })
    const original = app.state.windows.find(window => window.entityId === 'planning')
    const members = [...app.room.members], admin = app.room.admin
    const preview = app.showPreview()
    preview.props.onKeyDown(pointer({ key: 'Escape', nativeEvent: { isComposing: false } }))
    assert.equal(Boolean(app.preview(app.draw())), false)
    assert.ok(button(app.card(app.draw(), 'planning'), 'Expand group card'))
    assert.ok(app.document.activeElement === app.host(button(app.card(app.draw(), 'planning'), 'Expand group card')), 'Escape restores focus to the permanent group avatar')
    button(app.showPreview(), 'Open conversation').props.onClick(pointer())
    let chat = app.chat(app.draw())
    if (dismissal === 'button') button(chat, 'Close window').props.onClick(pointer())
    else if (dismissal === 'escape') find(chat, node => node.props.className === 'bt-canvas-chat-float').props.onKeyDown(pointer({ key: 'Escape', nativeEvent: { isComposing: false } }))
    else {
      const backdrop = find(chat, node => node.props.className === 'bt-canvas-chat-layer')
      backdrop.props.onPointerDown(pointer({ target: backdrop, currentTarget: backdrop, clientX: 900, clientY: 650 }))
      backdrop.props.onPointerUp(pointer({ type: 'pointerup', target: backdrop, currentTarget: backdrop, clientX: 900, clientY: 650 }))
    }
    chat = app.chat(app.draw())
    const closing = find(chat, node => node.props.className === 'bt-canvas-chat-float')
    assert.equal(closing.props['data-closing'], true)
    closing.props.onAnimationEnd({ target: closing, currentTarget: closing })
    assert.equal(app.chat(app.draw()), null)
    assert.equal(Boolean(app.preview(app.draw())), false)
    const avatar = app.card(app.draw(), 'planning')
    assert.equal(avatar.props['data-room-stage'], 'avatar')
    const roomWindow = app.state.windows.find(window => window.id === original.id)
    assert.equal(roomWindow.open, true)
    assert.equal(roomWindow.compact, true)
    assert.deepEqual([roomWindow.x, roomWindow.y], [original.x, original.y])
    assert.deepEqual(app.room.members, members)
    assert.equal(app.room.admin, admin)
    assert.deepEqual(app.calls.created, [])
    assert.deepEqual(app.calls.added, [])
  }
})

test('moving or cancelling a group avatar cancels pending hover and never opens a preview or conversation', () => {
  for (const end of ['pointerup', 'pointercancel']) {
    const app = fixture()
    const original = app.state.windows.find(window => window.entityId === 'planning')
    const tree = app.draw(), avatar = button(app.card(tree, 'planning'), 'Expand group card')
    avatar.props.onPointerEnter(pointer())
    avatar.props.onPointerDown(pointer({ buttons: 1 }))
    assert.equal(app.pendingTimers, 0)
    tree.props.onPointerMove(pointer({ clientX: 108, clientY: 106 }))
    avatar.props.onPointerEnter(pointer({ buttons: 1 }))
    app.advance(500)
    assert.equal(Boolean(app.preview(app.draw())), false)
    tree.props.onPointerMove(pointer())
    if (end === 'pointercancel') tree.props.onPointerCancel(pointer({ type: end }))
    else tree.props.onPointerUp(pointer({ type: end }))
    avatar.props.onClick(pointer({ detail: 1 }))
    app.advance(500)
    const roomWindow = app.state.windows.find(window => window.id === original.id)
    assert.equal(roomWindow.compact, true)
    assert.equal(roomWindow.open, true)
    assert.deepEqual([roomWindow.x, roomWindow.y], [original.x, original.y])
    assert.equal(Boolean(app.preview(app.draw())), false)
    assert.equal(app.chat(app.draw()), null)
    assert.deepEqual(app.calls.opened, [])
    assert.deepEqual(app.calls.entities, [])
    assert.deepEqual(app.calls.created, [])
    assert.equal(app.captures.size, 0)
  }
})

test('folded group avatars accept a third and fourth ordinary member from pointer and native drops without expanding', async () => {
  for (const source of ['pointer', 'native']) {
    const app = fixture({ roomExpanded: false })
    app.addBot({ id: 'partner', name: 'Partner' })
    for (const id of ['third', 'fourth']) app.addBot({ id, name: id }, false)
    const roomWindow = app.state.windows.find(window => window.entityId === 'planning')
    const geometry = app.state.windows.map(({ id, x, y }) => [id, x, y])
    const at = { clientX: roomWindow.x + 60, clientY: roomWindow.y + 60 }
    app.roomHit.current = { closest: selector => selector === '[data-room-drop-id]' ? { dataset: { roomDropId: 'planning' } } : null }
    for (const id of ['third', 'fourth']) {
      assert.equal(app.roster.mainBotIds.includes(id), false)
      const tree = app.draw(), avatar = app.card(tree, 'planning')
      assert.equal(avatar.props['data-room-stage'], 'avatar')
      assert.equal(avatar.props['data-room-drop-id'], 'planning')
      assert.equal(avatar.props['data-window-id'], roomWindow.id)
      if (source === 'pointer') {
        button(app.card(tree, id), 'Open conversation').props.onPointerDown(pointer())
        tree.props.onPointerMove(pointer(at))
        assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], true)
        tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
      } else {
        const payload = JSON.stringify({ id, kind: 'bot' })
        tree.props.onDrop({ ...pointer(at), dataTransfer: { getData: type => type === 'application/x-ds-bot' ? payload : '' } })
      }
      const modal = app.modal()
      assert.ok(modal)
      await button(modal, 'Add to group').props.onClick()
      assert.deepEqual(app.room.members, id === 'third' ? ['writer', 'partner', 'third'] : ['writer', 'partner', 'third', 'fourth'])
      assert.equal(app.room.admin, 'writer')
      assert.equal(app.card(app.draw(), 'planning').props['data-room-stage'], 'avatar')
      assert.equal(app.state.windows.find(window => window.id === roomWindow.id).roomExpanded, false)
      assert.equal(app.chat(app.draw()), null)
      assert.deepEqual(Array.from(app.state.windows, ({ id, x, y }) => [id, x, y]), geometry)
    }
    assert.deepEqual(app.calls.added, [['planning', ['third']], ['planning', ['fourth']]])
    assert.deepEqual(app.calls.created, [])
    assert.deepEqual(app.calls.entities, [])
  }
})


test('avatar and portal rects of the same room are separate fallback invitation surfaces without an elementFromPoint hit', async () => {
  for (const source of ['pointer', 'native']) {
    for (const order of ['avatar-first', 'preview-first']) {
      const app = fixture()
      app.addBot({ id: 'partner', name: 'Partner' })
      for (const id of ['third', 'fourth']) app.addBot({ id, name: id }, false)
      const window = app.state.windows.find(window => window.entityId === 'planning')
      const avatarRect = { windowId: window.id, stage: 'avatar', rect: { left: 430, top: 70, width: 120, height: 132 } }
      const previewRect = { windowId: window.id, stage: 'preview', rect: { left: 600, top: 310, width: 320, height: 300 } }
      app.cardRects.splice(0, app.cardRects.length, ...(order === 'avatar-first' ? [avatarRect, previewRect] : [previewRect, avatarRect]))
      app.roomHit.current = null
      const geometry = app.state.windows.map(({ id, x, y }) => [id, x, y])
      for (const [id, at] of [['third', { clientX: 490, clientY: 130 }], ['fourth', { clientX: 760, clientY: 350 }]]) {
        const tree = app.draw()
        if (source === 'pointer') {
          button(app.card(tree, id), 'Open conversation').props.onPointerDown(pointer())
          tree.props.onPointerMove(pointer(at))
          assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], true)
          tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
        } else {
          const payload = JSON.stringify({ id, kind: 'bot' })
          tree.props.onDrop({ ...pointer(at), dataTransfer: { getData: type => type === 'application/x-ds-bot' ? payload : '' } })
        }
        const modal = app.modal()
        assert.ok(modal)
        await button(modal, 'Add to group').props.onClick()
      }
      assert.deepEqual(app.calls.added, [['planning', ['third']], ['planning', ['fourth']]])
      assert.deepEqual(app.room.members, ['writer', 'partner', 'third', 'fourth'])
      assert.equal(app.room.admin, 'writer')
      assert.deepEqual(app.calls.entities, [])
      assert.deepEqual(app.calls.opened, [])
      assert.deepEqual(app.calls.created, [])
      assert.deepEqual(Array.from(app.state.windows, ({ id, x, y }) => [id, x, y]), geometry)
    }
  }
})

test('the gap between a room avatar and its portal is not an invitation surface', () => {
  const app = fixture()
  app.addBot({ id: 'third', name: 'Third' }, false)
  const window = app.state.windows.find(window => window.entityId === 'planning')
  app.cardRects.push(
    { windowId: window.id, stage: 'avatar', rect: { left: 430, top: 70, width: 120, height: 132 } },
    { windowId: window.id, stage: 'preview', rect: { left: 600, top: 310, width: 320, height: 300 } },
  )
  app.roomHit.current = null
  const at = { clientX: 575, clientY: 240 }, tree = app.draw()
  button(app.card(tree, 'third'), 'Open conversation').props.onPointerDown(pointer())
  tree.props.onPointerMove(pointer(at))
  assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], undefined)
  tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
  assert.equal(app.modal(), null)
  assert.deepEqual(app.calls.added, [])
  assert.deepEqual(app.calls.created, [])
})


test('a mouse press preserves an open group preview until the avatar actually starts moving', () => {
  const app = fixture()
  let tree = app.draw(), avatar = button(app.card(tree, 'planning'), 'Expand group card')
  avatar.props.onPointerEnter(pointer())
  app.advance(120)
  assert.ok(app.preview(app.draw()))
  avatar.props.onPointerDown(pointer({ buttons: 1 }))
  assert.ok(app.preview(app.draw()), 'pressing an avatar must not remove the popup')
  tree.props.onPointerMove(pointer({ clientX: 103, clientY: 102, buttons: 1 }))
  assert.ok(app.preview(app.draw()))
  tree.props.onPointerUp(pointer({ type: 'pointerup', clientX: 103, clientY: 102 }))
  avatar.props.onClick(pointer({ detail: 1 }))
  assert.ok(app.preview(app.draw()), 'a stationary mouse tap preserves an already open preview')
  assert.deepEqual(app.calls.opened, [])
  tree = app.draw()
  avatar = button(app.card(tree, 'planning'), 'Expand group card')
  avatar.props.onPointerDown(pointer({ buttons: 1 }))
  tree.props.onPointerMove(pointer({ clientX: 108, clientY: 106, buttons: 1 }))
  assert.equal(Boolean(app.preview(app.draw())), false, 'the first real avatar move hides its own popup')
  tree.props.onPointerCancel(pointer({ type: 'pointercancel' }))
  assert.deepEqual(app.calls.opened, [])
})

test('dragging another employee keeps an open group preview available as an invitation target', async () => {
  const app = fixture()
  app.addBot({ id: 'partner', name: 'Partner' })
  app.addBot({ id: 'third', name: 'Third' }, false)
  button(app.card(app.draw(), 'planning'), 'Expand group card').props.onPointerEnter(pointer())
  app.advance(120)
  let preview = app.preview(app.draw())
  assert.ok(preview)
  const rect = app.host(preview).getBoundingClientRect()
  const window = app.state.windows.find(window => window.entityId === 'planning')
  app.cardRects.push({ windowId: window.id, stage: 'preview', rect })
  const tree = app.draw(), employee = button(app.card(tree, 'third'), 'Open conversation')
  const target = app.host(employee)
  const start = target.getBoundingClientRect()
  const down = pointer({ target, currentTarget: target, buttons: 1, clientX: start.left + 28, clientY: start.top + 28 })
  app.document.dispatch('pointerdown', down, employee.props.onPointerDown)
  assert.ok(app.preview(app.draw()), 'an external pointerdown must not remove the target popup')
  const at = { clientX: rect.left + 40, clientY: rect.top + 40 }
  const move = pointer({ ...at, target, currentTarget: target, buttons: 1 })
  app.document.dispatch('pointermove', move, tree.props.onPointerMove)
  preview = app.preview(app.draw())
  preview.props.onPointerLeave(pointer({ relatedTarget: null }))
  app.advance(300)
  assert.ok(app.preview(app.draw()), 'the leave timer must not close a popup during an external drag')
  const up = pointer({ ...at, target, currentTarget: target, type: 'pointerup' })
  app.document.dispatch('pointerup', up, tree.props.onPointerUp)
  assert.ok(app.preview(app.draw()), 'a completed drag must not synchronously remove the target popup')
  const modal = app.modal()
  assert.ok(modal)
  await button(modal, 'Add to group').props.onClick()
  assert.deepEqual(app.room.members, ['writer', 'partner', 'third'])
  assert.equal(app.room.admin, 'writer')
  assert.deepEqual(app.calls.added, [['planning', ['third']]])
  assert.deepEqual(app.calls.entities, [])
  assert.deepEqual(app.calls.opened, [])
  assert.deepEqual(app.calls.created, [])
})

test('a direct preview marker accepts its real rect and rejects its transparent bridge gap', async () => {
  for (const source of ['pointer', 'native']) for (const accepted of [false, true]) {
    const app = fixture()
    app.addBot({ id: 'third', name: 'Third' }, false)
    const window = app.state.windows.find(window => window.entityId === 'planning')
    const avatar = { windowId: window.id, stage: 'avatar', rect: { left: 430, top: 70, width: 120, height: 132 } }
    const preview = { windowId: window.id, stage: 'preview', rect: { left: 600, top: 310, width: 320, height: 300 } }
    if (!accepted) app.cardRects.push(avatar, preview)
    const marker = {
      dataset: { roomDropId: 'planning', roomStage: 'preview', windowId: window.id },
      getBoundingClientRect: () => ({ ...preview.rect, right: 920, bottom: 610 }),
    }
    app.roomHit.current = { closest: selector => selector === '[data-room-drop-id]' ? marker : null }
    const at = accepted ? { clientX: 640, clientY: 350 } : { clientX: 575, clientY: 240 }, tree = app.draw()
    if (source === 'pointer') {
      button(app.card(tree, 'third'), 'Open conversation').props.onPointerDown(pointer())
      tree.props.onPointerMove(pointer(at))
      assert.equal(app.card(app.draw(), 'planning').props['data-drop-target'], accepted || undefined)
      tree.props.onPointerUp(pointer({ ...at, type: 'pointerup' }))
    } else {
      const payload = JSON.stringify({ id: 'third', kind: 'bot' })
      tree.props.onDrop({ ...pointer(at), dataTransfer: { getData: type => type === 'application/x-ds-bot' ? payload : '' } })
    }
    const modal = app.modal()
    assert.equal(Boolean(modal), accepted)
    if (accepted) await button(modal, 'Add to group').props.onClick()
    assert.deepEqual(app.calls.added, accepted ? [['planning', ['third']]] : [])
    assert.deepEqual(app.room.members, accepted ? ['writer', 'third'] : ['writer'])
    assert.equal(app.room.admin, 'writer')
    assert.deepEqual(app.calls.entities, [])
    assert.deepEqual(app.calls.opened, [])
    assert.deepEqual(app.calls.created, [])
  }
})

test('leaving a group preview for a Window relatedTarget safely closes after 240ms while real DOM nodes keep it open', () => {
  const app = fixture({ strictDom: true })
  const avatar = app.card(app.draw(), 'planning')
  button(avatar, 'Expand group card').props.onPointerEnter(pointer())
  app.advance(120)
  const preview = app.preview(app.draw()), popup = app.host(preview)
  const view = app.document.defaultView
  view.window = view
  assert.ok(popup instanceof view.Node)
  assert.throws(() => popup.contains(view), TypeError, 'the DOM stub must reject Window exactly like Node.contains')
  assert.doesNotThrow(() => avatar.props.onPointerLeave(pointer({ relatedTarget: popup })))
  app.advance(300)
  assert.ok(app.preview(app.draw()), 'a real related DOM node inside the popup keeps it open')
  assert.doesNotThrow(() => preview.props.onPointerLeave(pointer({ relatedTarget: view })))
  app.advance(239)
  assert.ok(app.preview(app.draw()))
  app.advance(1)
  assert.equal(Boolean(app.preview(app.draw())), false)
  assert.deepEqual(app.calls.focused, [])
  assert.deepEqual(app.calls.opened, [])
})
