import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/model-menu.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const module = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports,
  require: name => {
    const platform = {
      react: {
        createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
        useState: initial => [initial, () => {}],
        useEffect: () => {},
      },
      'react-dom': {},
      '@deepseek-ai/dsh-client-ui-primitives': {},
    }
    if (!(name in platform)) throw new Error(`no platform module ${name}`)
    return platform[name]
  },
})
const { groupModels, ModelChoiceDock, effortRows } = module.exports

function menuRuntime({ width = 1024, height = 768 } = {}) {
  const hooks = []
  let cursor = 0, component, props, tree
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value,
    createElement: (type, next, ...children) => ({ type, props: next ?? {}, children: children.flat(Infinity) }), Fragment: 'fragment',
    useState(initial) {
      const slot = cursor++
      const cell = hooks[slot] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value }]
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial } }, useEffect: () => {},
  }
  const loaded = { exports: {} }
  runInNewContext(bundle.outputFiles[0].text, {
    module: loaded, exports: loaded.exports,
    require: name => ({ react, 'react-dom': { createPortal: value => value }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
    document: { body: {} }, window: { innerWidth: width, innerHeight: height },
  })
  return {
    ...loaded.exports,
    render(nextComponent = component, nextProps = props) { cursor = 0; component = nextComponent; props = nextProps; tree = component(props); return tree },
    get tree() { return tree },
  }
}

function nodes(tree, match) {
  if (!tree || typeof tree !== 'object') return []
  return [...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match))]
}

function dock(models, { model, ready = true } = {}) {
  const picked = []
  const bot = { id: 'chief', name: 'Chief', model }
  const roster = { ready, byId: { chief: bot }, models, defaultModel: models[0]?.ref }
  const tree = ModelChoiceDock({
    sessionId: bot.id, useRoster: select => select(roster),
    actions: { updateBot: (id, patch) => { picked.push([id, patch.model]); return Promise.resolve() } },
  })
  return { tree, picked }
}

const models = [
  { ref: 'official/flash', provider: 'official', providerName: 'DeepSeek', name: 'DeepSeek Flash' },
  { ref: 'local/flash', provider: 'local', providerName: 'Ollama', name: 'DeepSeek Flash' },
  { ref: 'official/pro', provider: 'official', providerName: 'DeepSeek', name: 'DeepSeek Pro' },
]

test('the first model choice shows provider groups and keeps each model route', () => {
  const { tree, picked } = dock(models)
  const groups = nodes(tree, node => node.props.className === 'bt-model-choice-group')
  assert.deepEqual(groups.map(group => group.props['aria-label']), ['DeepSeek', 'Ollama'])
  assert.deepEqual(groups.map(group => nodes(group, node => node.props.className === 'bt-model-choice-provider')[0].children[0]), ['DeepSeek', 'Ollama'])
  const buttons = groups.map(group => nodes(group, node => node.type === 'button'))
  assert.deepEqual(buttons.map(list => list.map(button => button.children[0])), [['DeepSeek Flash', 'DeepSeek Pro'], ['DeepSeek Flash']])
  assert.match(buttons[0][0].props.title, /official\/flash.*Harness default/)
  buttons[1][0].props.onClick()
  buttons[0][0].props.onClick()
  assert.deepEqual(picked, [['chief', 'local/flash'], ['chief', 'official/flash']])
  assert.equal(nodes(tree, node => node.type === 'button' && node.children.includes('Manage models')).length, 1)
})

test('providers with the same display name stay distinct, and unnamed providers use their id', () => {
  const entries = [
    { ...models[0], providerName: 'Cloud' },
    { ...models[1], providerName: 'Cloud' },
    { ref: 'custom/flash', provider: 'custom', name: 'Flash' },
  ]
  const groups = groupModels(entries)
  assert.deepEqual(Array.from(groups, ([label, list]) => [label, Array.from(list, model => model.ref)]), [
    ['Cloud (official)', ['official/flash']],
    ['Cloud (local)', ['local/flash']],
    ['custom', ['custom/flash']],
  ])
})

test('an unavailable model offers the same provider groups', () => {
  const { tree } = dock(models, { model: 'gone/flash' })
  assert.deepEqual(nodes(tree, node => node.props.className === 'bt-model-choice-group').map(group => group.props['aria-label']), ['DeepSeek', 'Ollama'])
  assert.ok(nodes(tree, node => node.props.className === 'bt-bubble')[0].children[0].includes('not available anymore'))
})

test('an empty catalog offers setup choices, and a ready model needs no choice dock', () => {
  const { tree } = dock([])
  assert.deepEqual(nodes(tree, node => node.type === 'button').map(button => button.children[0]), [
    'Enter a DeepSeek API key', 'Open settings to set up a custom model',
  ])
  assert.equal(dock(models, { model: models[0].ref }).tree, null)
  assert.equal(dock(models, { ready: false }).tree, null)
})

test('the Thinking section always offers Default, so a picked level can be cleared', () => {
  const efforts = [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }]
  assert.deepEqual([...effortRows({ efforts, defaultEffort: 'high' }).map(row => row.effort)], [undefined, 'low', 'high'])
  assert.deepEqual([...effortRows({ efforts }).map(row => row.effort)], [undefined, 'low', 'high'])
  assert.equal(effortRows({ efforts: [] }).length, 0)
})

test('a compact model picker preserves the editor and saves only its employee model', () => {
  const page = menuRuntime({ width: 220 }), changed = []
  let focused = 0, prevented = 0
  const roster = { models, byId: {} }, bot = { id: 'writer', name: 'Writer', model: models[0].ref }
  const actions = { refreshModels() {}, updateBot: (id, patch) => { changed.push([id, patch]); return Promise.resolve() } }
  let tree = page.render(page.ModelMenu, { bot, roster, actions, run: promise => promise, compact: true })
  const trigger = nodes(tree, node => node.type === 'button')[0]
  trigger.props.ref.current = {
    getBoundingClientRect: () => ({ left: 12, right: 40, top: 400, bottom: 428, width: 28 }),
    closest: () => ({ querySelector: () => ({ focus: () => { focused += 1 } }) }),
  }
  trigger.props.onMouseDown({ preventDefault: () => { prevented += 1 } })
  trigger.props.onClick()
  tree = page.render()
  const menu = nodes(tree, node => node.props.role === 'menu')[0]
  assert.equal(menu.props.style.width, 204)
  assert.equal(menu.props.style.left, 8)
  const rows = nodes(menu, node => typeof node.type === 'function' && node.props.onPick && node.props.roster)[0]
  rows.props.onPick(models[1].ref)
  assert.equal(changed[0][0], 'writer')
  assert.equal(changed[0][1].model, models[1].ref)
  assert.equal(prevented, 1)
  assert.equal(focused, 1)
})

test('a group model picker requires a member and keeps changes on that member', () => {
  const page = menuRuntime(), changed = []
  const chief = { id: 'chief', name: 'Chief', model: models[0].ref }, writer = { id: 'writer', name: 'Writer', model: models[1].ref }
  const roster = { models, byId: { chief, writer } }, room = { id: 'room', members: ['chief', 'writer'] }
  const actions = { refreshModels() {}, updateBot: (id, patch) => { changed.push([id, patch]); return Promise.resolve() } }
  let tree = page.render(page.RoomModelMenu, { room, roster, actions, run: promise => promise })
  const trigger = nodes(tree, node => node.type === 'button')[0]
  trigger.props.ref.current = { getBoundingClientRect: () => ({ left: 20, right: 48, top: 600, bottom: 628, width: 28 }), closest: () => null }
  trigger.props.onClick()
  tree = page.render()
  const member = nodes(tree, node => node.props.role === 'menuitem' && node.props['aria-haspopup'] === 'menu')[1]
  member.props.onClick()
  tree = page.render()
  const memberRows = nodes(tree, node => typeof node.type === 'function' && node.props.bot === writer && node.props.close)[0]
  assert.equal(changed.length, 0, 'opening the employee list must not change a model')
  const editor = menuRuntime()
  const rowsTree = editor.render(memberRows.type, memberRows.props)
  const rows = nodes(rowsTree, node => typeof node.type === 'function' && node.props.onPick && node.props.roster)[0]
  rows.props.onPick(models[2].ref)
  assert.equal(changed[0][0], 'writer')
  assert.equal(changed[0][1].model, models[2].ref)
  assert.equal(chief.model, models[0].ref)
})

test('a group thinking-level change clears only the selected employee override', () => {
  const page = menuRuntime(), changed = []
  const bot = { id: 'writer', name: 'Writer', model: models[1].ref, effort: 'high' }
  const reasoning = { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' }
  const roster = { models: models.map(model => model.ref === bot.model ? { ...model, reasoning } : model), byId: { writer: bot } }
  const room = { id: 'room', members: ['writer'] }
  const actions = { refreshModels() {}, updateBot: (id, patch) => { changed.push([id, patch]); return Promise.resolve() } }
  let tree = page.render(page.RoomModelMenu, { room, roster, actions, run: promise => promise })
  const trigger = nodes(tree, node => node.type === 'button')[0]
  trigger.props.ref.current = { getBoundingClientRect: () => ({ left: 20, right: 48, top: 600, bottom: 628, width: 28 }), closest: () => null }
  trigger.props.onClick()
  tree = page.render()
  nodes(tree, node => node.props.role === 'menuitem' && node.props['aria-haspopup'] === 'menu')[0].props.onClick()
  tree = page.render()
  const memberRows = nodes(tree, node => typeof node.type === 'function' && node.props.bot === bot && node.props.close)[0]
  const rowsTree = page.render(memberRows.type, memberRows.props)
  const efforts = nodes(rowsTree, node => typeof node.type === 'function' && node.props.reasoning === reasoning)[0]
  efforts.props.onPick(undefined)
  assert.equal(changed[0][0], 'writer')
  assert.equal(changed[0][1].effort, null)
  assert.equal(Object.hasOwn(changed[0][1], 'model'), false)
  assert.equal(bot.model, models[1].ref)
})
