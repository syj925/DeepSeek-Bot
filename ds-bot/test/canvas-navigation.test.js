import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    contents: "export { TeamSidebar } from './src/client/sidebar.js'; export { Overlays } from './src/client/overlays.js'",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

function renderer() {
  const scopes = new Map(), timers = new Map()
  let slots, cursor, effects, timerId = 0
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: 'fragment',
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }]
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index]
      if (previous && deps?.length === previous.deps?.length && deps.every((value, at) => Object.is(value, previous.deps[at]))) return
      slots[index] = { deps }
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect() })
    },
    useLayoutEffect(effect, deps) { react.useEffect(effect, deps) },
    useMemo(make) { cursor++; return make() },
    useId: () => 'test-id',
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, document: { body: {} }, window: { matchMedia: () => ({ matches: false }) },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id),
    require: name => ({ react, 'react-dom': { createPortal: node => node }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  return {
    components: module.exports,
    render(component, props, key = component.name) {
      slots = scopes.get(key) ?? []
      scopes.set(key, slots)
      cursor = 0
      effects = []
      const node = component(props)
      for (const effect of effects) effect()
      return node
    },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) },
  }
}

function fixture() {
  const chief = { id: 'chief', name: 'Chief', sessionId: 'chief-part', createdAt: 1 }
  const writer = { id: 'writer', name: 'Writer', sessionId: 'writer-part', createdAt: 2 }
  const room = { id: 'room', name: 'Planning', members: ['chief', 'writer'], createdAt: 3 }
  const roster = { ready: true, bots: [chief, writer], rooms: [room], agents: [], mainBotId: 'chief', mainBotIds: ['chief'], exchangeTurns: {}, questions: {}, agentOf: {}, byId: { chief, 'chief-part': chief, writer, 'writer-part': writer }, roomsById: { room } }
  const list = { ids: ['chief-part', 'writer-part', 'room'], byId: { 'chief-part': { id: 'chief-part', retainedBy: { mainView: 1 } }, 'writer-part': { id: 'writer-part', retainedBy: {} }, room: { id: 'room', retainedBy: {} } } }
  const canvas = { active: 'window-writer', windows: [{ id: 'window-chief', kind: 'bot', entityId: 'chief', open: true }, { id: 'window-writer', kind: 'bot', entityId: 'writer', open: true }, { id: 'window-room', kind: 'room', entityId: 'room', open: true }] }
  const panel = { activePanelId: 'ds-bot-canvas' }, cleared = [], landed = [], followed = []
  const actions = { clearUnread: id => cleared.push(id), landOn: id => landed.push(id), followPanel: id => followed.push(id) }
  const props = {
    wide: false, actions,
    useRoster: pick => pick(roster), useSessions: pick => pick(list),
    usePanelInfo: pick => pick(panel), useCanvas: pick => pick(canvas), useCompletions: pick => pick({}),
    useUi: pick => pick({ unread: { chief: true, writer: true, room: true } }),
    useRegistry: pick => pick({}), useActivity: pick => pick({}),
    useWork: pick => pick({ bots: {}, rooms: {}, approvals: [] }),
    useSessionStatus: pick => pick(new Map()),
    useSessionRetainInfo: (id, pick) => pick(list.byId[id]),
  }
  return { roster, list, canvas, panel, props, cleared, landed, followed }
}

function rowNodes(render, tree) {
  if (!tree || typeof tree !== 'object') return []
  if (['BotRow', 'RoomRow'].includes(tree.type?.name)) {
    const id = tree.props.bot?.id ?? tree.props.room.id
    return rowNodes(render, render.render(tree.type, tree.props, `row:${id}`))
  }
  return [...(tree.props['data-bot-id'] || tree.props['data-room-id'] ? [tree] : []), ...tree.children.flatMap(node => rowNodes(render, node))]
}

test('canvas focus selects its employee or room while the retained main chat stays unread', () => {
  const render = renderer(), data = fixture()
  const rows = () => rowNodes(render, render.render(render.components.TeamSidebar, data.props))
  let current = rows()
  const active = values => values.filter(node => node.props['aria-current'] === 'page').map(node => node.props['data-bot-id'] ?? node.props['data-room-id'])
  assert.deepEqual(active(current), ['writer'])
  assert.deepEqual(data.cleared, ['writer'])
  data.canvas.active = 'window-room'
  current = rows()
  assert.deepEqual(active(current), ['room'])
  assert.deepEqual(data.cleared, ['writer', 'room'])
  data.panel.activePanelId = null
  assert.deepEqual(active(rows()), ['chief'])
  assert.deepEqual(data.cleared, ['writer', 'room', 'chief'])
})

test('a hidden main-view part cannot navigate away from the canvas', () => {
  const render = renderer(), data = fixture()
  data.roster.byId.chief.sessionId = 'chief-new-part'
  render.render(render.components.TeamSidebar, data.props)
  render.flushTimers()
  assert.deepEqual(data.landed, [])
  data.panel.activePanelId = null
  render.render(render.components.TeamSidebar, data.props)
  assert.deepEqual(data.landed, ['chief'])
})

test('details follow canvas focus and the current Bot part, then return to classic navigation', () => {
  const render = renderer(), data = fixture()
  const draw = () => render.render(render.components.Overlays, data.props)
  draw()
  assert.deepEqual(data.followed, [])
  data.canvas.active = 'window-room'
  draw()
  assert.deepEqual(data.followed, ['room'])
  data.canvas.active = 'window-writer'
  data.roster.byId.writer.sessionId = 'writer-next-part'
  draw()
  assert.deepEqual(data.followed, ['room', 'writer-next-part'])
  data.panel.activePanelId = null
  draw()
  assert.deepEqual(data.followed, ['room', 'writer-next-part', 'chief-part'])
})

test('selecting compact employees or Rooms preserves manual unread until expansion', () => {
  const render = renderer(), data = fixture()
  data.props.wide = true
  const rows = () => rowNodes(render, render.render(render.components.TeamSidebar, data.props))
  const badge = node => node.children.some(child => child?.props?.className === 'bt-unread')
  data.canvas.windows[1].compact = true
  let current = rows()
  assert.deepEqual(data.cleared, [])
  assert.equal(badge(current.find(node => node.props['data-bot-id'] === 'writer')), true)
  data.canvas.active = 'window-room'
  data.canvas.windows[2].compact = true
  current = rows()
  assert.deepEqual(data.cleared, [])
  assert.equal(badge(current.find(node => node.props['data-room-id'] === 'room')), true)
  data.canvas.windows[2].compact = false
  rows()
  assert.deepEqual(data.cleared, ['room'])
})

test('Bot and Room completion badges ignore stale native completion flags', () => {
  const render = renderer(), data = fixture()
  data.props.wide = true
  data.props.useUi = pick => pick({ unread: {} })
  data.props.useSessionStatus = pick => pick(new Map([['writer-part', { completionUnread: true }], ['room', { completionUnread: true }]]))
  data.canvas.active = 'window-chief'
  const rows = () => rowNodes(render, render.render(render.components.TeamSidebar, data.props))
  const unread = () => rows().filter(node => node.children.some(child => child?.props?.className === 'bt-unread')).map(node => node.props['data-bot-id'] ?? node.props['data-room-id'])
  assert.deepEqual(unread(), [])
  data.props.useCompletions = pick => pick({ 'writer-part': true, room: true })
  assert.deepEqual(unread().sort(), ['room', 'writer'])
  data.props.useCompletions = pick => pick({})
  data.panel.activePanelId = null
  assert.deepEqual(unread(), [])
  data.panel.activePanelId = 'ds-bot-canvas'
  assert.deepEqual(unread(), [])
})
