import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { createCanvasState, openWindow, setCanvasSelection, setWindowCompact } from '../src/client/canvas-state.js'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/canvas-workspace.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

function renderer() {
  const scopes = new Map()
  let slots, cursor
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: 'fragment',
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useEffect() { cursor++ },
    useLayoutEffect() { cursor++ },
    useMemo(make) { cursor++; return make() },
    useId: () => 'test-id',
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: name => ({ react, 'react-dom': { createPortal: node => node }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  return {
    ...module.exports,
    render(component, props, key = component.name) {
      slots = scopes.get(key) ?? []
      scopes.set(key, slots)
      cursor = 0
      return component(props)
    },
  }
}

function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate))]
}

const find = (node, predicate) => findAll(node, predicate)[0]
const button = (node, label) => find(node, value => value.type === 'button' && (value.props['aria-label'] === label || value.children.includes(label)))
const hasSession = node => findAll(node, value => value.type?.name === 'CanvasSession').length

test('dragging Main avatars together proposes a group; cancellation and multi-selection do not', () => {
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
    tree.props.onPointerUp(pointer({ type: cancelled ? 'pointercancel' : 'pointerup' }))
    tree = app.draw()
    const modal = find(tree, value => value.type?.name === 'MainAgentGroup')
    assert.equal(Boolean(modal), !cancelled)
    assert.equal(app.calls.opened.length, 0)
    if (modal) {
      assert.deepEqual(Array.from(modal.props.members), ['writer', 'partner'])
      modal.props.onClose()
      assert.equal(Boolean(find(app.draw(), value => value.type?.name === 'MainAgentGroup')), false)
    }
  }
})
const textOf = node => typeof node === 'string' ? node : node?.children?.map(textOf).join('') ?? ''

function pointer(options = {}) {
  return {
    button: 0, pointerId: 1, clientX: 100, clientY: 100, shiftKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true },
    target: { closest: () => null }, ...options,
  }
}

function fixture() {
  const render = renderer()
  const writer = { id: 'writer', sessionId: 'writer-current', name: 'Writer', role: 'Product writing' }
  const room = { id: 'planning', name: 'Planning', members: ['writer'], admin: 'writer', mode: 'admin', preview: 'Next steps for the team' }
  const roster = { bots: [writer], rooms: [room], byId: { writer, 'writer-current': writer }, roomsById: { planning: room }, mainBotIds: ['writer'], exchangeTurns: {}, questions: {} }
  const work = { bots: {}, rooms: {}, approvals: [] }
  let state = openWindow(createCanvasState(), { kind: 'bot', id: 'writer' }, { x: 30, y: 70, width: 560, height: 640 })
  state = openWindow(state, { kind: 'room', id: 'planning' }, { x: 430, y: 70 })
  const calls = { opened: [], selected: [], details: [], settings: [], menus: [], entities: [], newChats: [], exchanges: [], saved: 0, arranged: 0, compacted: 0 }
  const captures = new Set()
  const root = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id),
  }
  const actions = {
    updateCanvas: next => { state = typeof next === 'function' ? next(state) : next },
    selectCanvasWindow: (id, selected = true, additive = false) => {
      calls.selected.push([id, selected, additive])
      const ids = additive ? selected ? [...new Set([...state.selected, id])] : state.selected.filter(value => value !== id) : [id]
      state = setCanvasSelection(state, ids, id)
    },
    openCanvasConversation: id => { calls.opened.push(id); state = setWindowCompact(state, id, false) },
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
    const tree = render.render(render.CanvasWorkspace, props)
    tree.props.ref.current = root
    return tree
  }
  const nested = (node, names) => {
    if (!node || typeof node !== 'object') return node
    if (names.includes(node.type?.name)) return nested(render.render(node.type, node.props, `${node.type.name}:${node.props.group?.id ?? node.props.room?.id ?? node.props.window?.id}`), names)
    return { ...node, children: node.children.map(child => nested(child, names)) }
  }
  const cards = tree => findAll(tree, value => value.type?.name === 'WindowCard').map(value => nested(value, ['WindowCard', 'RoomSummary']))
  const card = (tree, id = 'writer') => cards(tree).find(value => value.props['data-entity-id'] === id)
  const group = tree => nested(find(tree, value => value.props.className === 'bt-canvas-group'), ['GroupTitle'])
  const addBot = (bot, inRoom = true) => {
    roster.bots.push(bot)
    roster.byId[bot.id] = bot
    roster.byId[bot.sessionId ?? bot.id] = bot
    if (inRoom) room.members.push(bot.id)
    state = openWindow(state, { kind: 'bot', id: bot.id })
    return state.windows.find(value => value.entityId === bot.id)
  }
  return { draw, cards, card, group, addBot, roster, room, work, calls, captures, actions, get state() { return state }, set state(value) { state = value } }
}

test('employee avatars and Room cards keep management reachable without mounting conversation content', () => {
  const data = fixture(), tree = data.draw(), cards = data.cards(tree)
  assert.equal(cards.length, 2)
  for (const card of cards) {
    assert.equal(card.props['data-mode'], 'card')
    const expected = card.props['data-kind'] === 'bot' ? { width: 120, height: 112 } : { width: 320, height: 200 }
    assert.deepEqual({ width: card.props.style.width, height: card.props.style.height }, expected)
    assert.equal(hasSession(card), 0)
    assert.equal(findAll(card, value => value.props.contentEditable || value.props.role === 'textbox' || /Editor|Composer|CanvasConversation/.test(value.type?.name ?? '')).length, 0)
    assert.ok(button(card, 'Open conversation'))
    assert.equal(button(card, 'Memory'), undefined)
    assert.equal(button(card, 'Scheduled tasks'), undefined)
    assert.equal(find(card, value => value.props.className === 'bt-canvas-resize'), undefined)
  }
  assert.ok(button(data.card(tree), 'Details'))
  assert.ok(button(data.card(tree), 'Writer actions'))
  assert.ok(button(data.card(tree, 'planning'), 'Group settings'))
  assert.ok(button(data.card(tree, 'planning'), 'Planning actions'))
  assert.match(textOf(data.card(tree)), /Main Bot/)
})

test('Open conversation passes the stable window id and mounts only its current Session', () => {
  const data = fixture(), before = data.draw()
  const window = data.state.windows.find(value => value.entityId === 'writer')
  button(data.card(before), 'Open conversation').props.onClick({ detail: 0 })
  assert.deepEqual(data.calls.opened, [window.id])
  const after = data.draw(), card = data.card(after)
  assert.equal(card.props['data-mode'], 'conversation')
  const session = find(card, value => value.type?.name === 'CanvasSession')
  assert.equal(session.props.sessionId, 'writer-current')
  assert.equal(session.props.actions, data.actions)
  assert.equal(hasSession(data.card(after, 'planning')), 0)
  assert.equal(card.props.style.width, 560)
  assert.equal(card.props.style.height, 640)
  assert.ok(button(card, 'Details'))
})

test('Room conversation opening routes its own window and Session instead of the selected Bot', () => {
  const data = fixture(), before = data.draw()
  const window = data.state.windows.find(value => value.entityId === 'planning')
  button(data.card(before, 'planning'), 'Open conversation').props.onClick()
  assert.deepEqual(data.calls.opened, [window.id])
  const after = data.draw()
  assert.equal(find(data.card(after, 'planning'), value => value.type?.name === 'CanvasSession').props.sessionId, 'planning')
  assert.equal(hasSession(data.card(after)), 0)
})

test('checkbox, card selection, and keyboard movement never expand a lightweight card', () => {
  const data = fixture(), card = data.card(data.draw())
  const window = data.state.windows.find(value => value.entityId === 'writer')
  const checkbox = find(card, value => value.type === 'input' && value.props.type === 'checkbox')
  const event = pointer({ target: { closest: () => ({}) } })
  card.props.onPointerDownCapture(event)
  checkbox.props.onPointerDown(event)
  checkbox.props.onChange({ target: { checked: true } })
  assert.equal(event.stopped, true)
  assert.deepEqual(data.calls.selected, [[window.id, true, true]])
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
  assert.equal(hasSession(data.card(data.draw())), 1)
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
    assert.equal(value.x, before[index].x + 5)
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
  assert.equal(find(data.card(data.draw()), value => value.type?.name === 'CanvasSession').props.sessionId, 'writer-current')
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
  tree.props.onPointerUp(pointer())
  data.state.windows.forEach((value, index) => {
    assert.equal(value.x, before[index].x + 40)
    assert.equal(value.y, before[index].y + 20)
    assert.equal(value.compact, true)
  })
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.cards(data.draw()).reduce((count, card) => count + hasSession(card), 0), 0)
})

test('collapsing an expanded conversation removes its Session and preserves the card identity and geometry', () => {
  const data = fixture(), window = data.state.windows.find(value => value.entityId === 'writer')
  data.state = setWindowCompact(data.state, window.id, false)
  const card = data.card(data.draw())
  assert.equal(hasSession(card), 1)
  button(card, 'Compact window').props.onClick()
  const after = data.state.windows.find(value => value.id === window.id)
  assert.equal(after.open, true)
  assert.equal(after.compact, true)
  assert.equal(after.width, window.width)
  assert.equal(after.height, window.height)
  assert.equal(after.x, window.x)
  assert.equal(after.y, window.y)
  assert.equal(hasSession(data.card(data.draw())), 0)
  assert.deepEqual(data.calls.opened, [])
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
  const click = pointer({ type: 'click', currentTarget: { getBoundingClientRect: () => box } })
  button(data.card(tree), 'Writer actions').props.onClick(click)
  assert.deepEqual(data.calls.menus, [{ id: 'writer', x: 300, y: 120 }])
  assert.equal(click.prevented, true)
  const context = pointer({ type: 'contextmenu', clientX: 150, clientY: 200, currentTarget: { getBoundingClientRect: () => box } })
  data.card(tree, 'planning').props.onContextMenu(context)
  assert.deepEqual(data.calls.menus[1], { id: 'planning', x: 150, y: 200 })
  const transcript = pointer({ type: 'contextmenu', target: { closest: () => ({}) } })
  data.card(tree).props.onContextMenu(transcript)
  assert.equal(transcript.prevented, false)
  assert.equal(data.calls.menus.length, 2)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.cards(tree).reduce((count, card) => count + hasSession(card), 0), 0)
})

test('avatar details, room member shortcuts, and room settings route to original management actions', () => {
  const data = fixture(), tree = data.draw()
  button(data.card(tree), 'Details').props.onClick()
  button(data.card(tree, 'planning'), 'Writer').props.onClick()
  button(data.card(tree, 'planning'), 'Group settings').props.onClick()
  const mode = find(data.card(tree, 'planning'), value => value.props.className === 'bt-canvas-room-mode')
  mode.props.onClick()
  assert.deepEqual(data.calls.details, ['writer-current'])
  assert.deepEqual(data.calls.entities, ['writer'])
  assert.deepEqual(data.calls.settings, [['groups', 'planning'], ['groups', 'planning']])
  assert.deepEqual(data.calls.opened, [])
})

test('avatar status reflects employee work, questions and approval using Details without mounting history', () => {
  const data = fixture()
  let status = button(data.card(data.draw()), 'Details')
  assert.equal(status.props['data-state'], 'available')
  assert.equal(status.props.title, 'Available')
  data.work.bots.writer = { tool: 'read' }
  status = button(data.card(data.draw()), 'Details')
  assert.equal(status.props['data-state'], 'working')
  assert.equal(status.props.title, 'Working')
  data.roster.questions['writer-current'] = { text: 'Which file?' }
  status = button(data.card(data.draw()), 'Details')
  assert.equal(status.props['data-state'], 'waiting')
  assert.equal(status.props.title, 'Waiting for your answer')
  data.work.approvals.push({ id: 'approval', botId: 'writer', tool: 'write' })
  status = button(data.card(data.draw()), 'Details')
  assert.equal(status.props['data-state'], 'waiting')
  assert.equal(status.props.title, 'Waiting for your approval')
  status.props.onClick()
  assert.deepEqual(data.calls.details, ['writer-current'])
  assert.deepEqual(data.calls.opened, [])
  assert.equal(hasSession(data.card(data.draw())), 0)
})

test('compact room summary shows admin, reply mode, member work, and approvals without histories', () => {
  const data = fixture()
  data.addBot({ id: 'designer', name: 'Designer' })
  data.addBot({ id: 'reviewer', name: 'Reviewer' })
  data.work.rooms.planning = [{ botId: 'writer', tool: 'read', since: 100 }]
  data.work.approvals = [{ id: 'approval', botId: 'designer', roomId: 'planning', tool: 'write' }]
  let card = data.card(data.draw(), 'planning')
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
  card = data.card(data.draw(), 'planning')
  assert.match(textOf(find(card, value => value.props.className === 'bt-canvas-room-mode')), /Everyone.*No admin/)
})

test('room member overflow opens the existing details panel and hides missing roster entries', () => {
  const data = fixture()
  for (const id of ['designer', 'reviewer', 'ops']) data.addBot({ id, name: id })
  data.room.members.push('missing')
  const card = data.card(data.draw(), 'planning')
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
