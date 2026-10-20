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
const { groupModels, ModelChoiceDock, effortRows, filterModels, menuPlacement } = module.exports

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
  assert.equal(trigger.props['aria-label'], 'Member models')
  assert.equal(trigger.children[0].type.name, 'RoomModelGlyph')
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

test('the group model trigger shows actual model vendors and combines mixed vendors', () => {
  const page = menuRuntime()
  const roster = { models: [], byId: {} }
  const deepseek = { id: 'chief', model: 'cloud/deepseek-chat' }
  const claude = { id: 'writer', model: 'cloud/claude-sonnet-4-5' }
  let tree = page.RoomModelGlyph({ members: [deepseek, { ...deepseek, id: 'research' }], roster })
  assert.equal(tree.type(tree.props).type(tree.props).props['data-vendor'], 'deepseek')
  tree = page.RoomModelGlyph({ members: [deepseek, claude], roster })
  assert.equal(tree.props.className, 'bt-room-model-stack')
  assert.equal(tree.props['data-count'], 2)
  const vendors = tree.children.map(glyph => {
    const icon = glyph.type(glyph.props)
    return icon.type(icon.props).props['data-vendor']
  })
  assert.deepEqual(vendors, ['deepseek', 'anthropic'])
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

test('the compact trigger and model rows pass model identities to real logo artwork', () => {
  const page = menuRuntime()
  const catalog = [
    { ref: 'reseller/claude-haiku-4-5', provider: 'reseller', providerName: 'QibitAI CodingPlan', name: 'Claude Haiku 4.5' },
    { ref: 'reseller/MiniMax-M2.7', provider: 'reseller', providerName: 'QibitAI CodingPlan', name: 'MiniMax M2.7' },
  ]
  let tree = page.render(page.ModelMenu, { bot: { id: 'chief', name: 'Chief', model: catalog[0].ref }, roster: { models: catalog }, actions: {}, compact: true })
  const trigger = nodes(tree, node => node.type === 'button')[0]
  const glyph = trigger.children[0]
  const icon = glyph.type(glyph.props)
  assert.equal(icon.type(icon.props).props['data-vendor'], 'anthropic')
  trigger.props.ref.current = { getBoundingClientRect: () => ({ left: 20, right: 48, top: 400, bottom: 428, width: 28 }) }
  trigger.props.onClick()
  tree = page.render()
  const rows = nodes(tree, node => typeof node.type === 'function' && node.props.roster && node.props.onPick)[0]
  const rowTree = menuRuntime().render(rows.type, rows.props)
  const buttons = nodes(rowTree, node => node.props.role === 'menuitemradio')
  assert.deepEqual(buttons.map(button => button.children[0].type(button.children[0].props).props['data-vendor']), ['anthropic', 'minimax'])
})

test('model search finds vendor identities across custom routes and keeps all query words', () => {
  const catalog = [
    { ref: 'qibitai/claude-opus-4-6', name: 'Powerful', providerName: 'Team route' },
    { ref: 'qibitai/MiniMax-M2.7', name: 'MiniMax M2.7', providerName: 'Team route' },
  ]
  assert.deepEqual(Array.from(filterModels(catalog, 'anthropic'), entry => entry.ref), [catalog[0].ref])
  assert.deepEqual(Array.from(filterModels(catalog, 'team minimax'), entry => entry.ref), [catalog[1].ref])
  assert.equal(filterModels(catalog, 'minimax opus').length, 0)
})

test('the model menu remains inside a small viewport and a scrolled-off trigger cannot produce negative height', () => {
  for (const rect of [
    { left: 12, right: 40, top: 260, bottom: 288, width: 28 },
    { left: -100, right: -72, top: -20, bottom: 8, width: 28 },
    { left: 500, right: 528, top: 500, bottom: 528, width: 28 },
  ]) {
    const place = menuPlacement(rect, { width: 220, height: 300 })
    assert.equal(place.width, 204)
    assert.equal(place.left, 8)
    assert.ok(place.maxHeight >= 0)
    if (place.top !== undefined) assert.ok(place.top + place.maxHeight <= 292)
    else assert.ok(place.bottom + place.maxHeight <= 292)
  }
})

test('search fields receive pointer focus while model choices preserve composer focus', () => {
  const page = menuRuntime()
  let tree = page.render(page.ModelMenu, { bot: { id: 'chief', name: 'Chief', model: models[0].ref }, roster: { models }, actions: {}, compact: true })
  const trigger = nodes(tree, node => node.type === 'button')[0]
  trigger.props.ref.current = { getBoundingClientRect: () => ({ left: 20, right: 48, top: 400, bottom: 428, width: 28 }) }
  trigger.props.onClick()
  tree = page.render()
  const menu = nodes(tree, node => node.props.role === 'menu')[0]
  let prevented = 0
  menu.props.onMouseDown({ target: { closest: () => ({ tagName: 'INPUT' }) }, preventDefault: () => { prevented++ } })
  assert.equal(prevented, 0)
  menu.props.onMouseDown({ target: { closest: () => null }, preventDefault: () => { prevented++ } })
  assert.equal(prevented, 1)
})
