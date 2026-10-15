import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/context-menu.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: name => ({
    react: {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
      Fragment: 'fragment', useState: initial => [initial, () => {}],
      useRef: initial => ({ current: initial }), useEffect() {}, useLayoutEffect() {},
    },
    'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {},
  })[name],
})

function nodes(tree, match) {
  if (!tree || typeof tree !== 'object') return []
  return [...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match))]
}

function fixture({ room = false, memory, browser, bridge = true, main = false, kind } = {}) {
  const bot = { id: 'writer', sessionId: 'writer-current', name: 'Writer', role: 'Writing' }
  const group = { id: 'planning', name: 'Planning', members: ['writer'] }
  const calls = []
  const actions = Object.fromEntries([
    'closeMenu', 'showDetails', 'openMemory', 'openSettings', 'openBrowser', 'setFlags', 'markUnread', 'renameBot',
    'duplicateBot', 'openSession', 'setMain', 'deleteBot', 'deleteRoom', 'reportError',
  ].map(name => [name, (...args) => { calls.push([name, ...args]) }]))
  if (!bridge) delete actions.openBrowser
  const roster = {
    byId: { writer: bot, 'writer-current': bot }, roomsById: { planning: group },
    mainBotId: 'chief', mainBotIds: main ? ['chief', 'writer'] : ['chief'], memory, browser,
    agentsById: { agent: { id: 'agent' } },
  }
  const tree = module.exports.ContextMenu({
    menu: { kind: kind ?? (room ? 'room' : 'bot'), id: kind === 'agent' ? 'agent' : room ? 'planning' : 'writer', x: 10, y: 20 },
    roster, actions,
  })
  const buttons = nodes(tree, node => node.type === 'button' && node.props.role === 'menuitem')
  return {
    tree, calls, actions,
    labels: buttons.map(button => button.children.find(child => typeof child === 'string')),
    click(label) {
      const button = buttons.find(button => button.children.includes(label))
      assert.ok(button, `missing menu action: ${label}`)
      button.props.onClick()
    },
  }
}

test('Bot management can open details, memory, schedules, and browser without opening its conversation', () => {
  const data = fixture({ browser: true })
  assert.deepEqual(data.calls, [])
  for (const label of ['Details', 'Memory', 'Scheduled tasks', 'Open browser']) data.click(label)
  assert.deepEqual(data.calls, [
    ['closeMenu'], ['showDetails', 'writer'],
    ['closeMenu'], ['openMemory', 'writer'],
    ['closeMenu'], ['openSettings', 'schedules', 'writer'],
    ['closeMenu'], ['openBrowser', 'writer'],
  ])
})

test('Room management targets the Room and offers no employee memory or browser', () => {
  const data = fixture({ room: true, browser: true })
  assert.ok(!data.labels.includes('Memory'))
  assert.ok(!data.labels.includes('Open browser'))
  assert.ok(data.labels.includes('Group settings'))
  assert.ok(data.labels.includes('Rename group'))
  assert.deepEqual(data.calls, [])
  data.click('Details')
  data.click('Scheduled tasks')
  data.click('Group settings')
  assert.deepEqual(data.calls, [
    ['closeMenu'], ['showDetails', 'planning'],
    ['closeMenu'], ['openSettings', 'schedules', 'planning'],
    ['closeMenu'], ['openSettings', 'groups', 'planning'],
  ])
})

test('memory and browser actions follow actual host capabilities', () => {
  assert.ok(!fixture({ memory: false, browser: false }).labels.includes('Memory'))
  assert.ok(!fixture({ browser: false }).labels.includes('Open browser'))
  assert.ok(!fixture({ browser: true, bridge: false }).labels.includes('Open browser'))
  assert.ok(fixture({ memory: true }).labels.includes('Memory'))
})

test('original Bot controls and Main Bot protections remain available', () => {
  const data = fixture()
  for (const label of ['Pin', 'Mark as Unread', 'Rename Bot', 'Edit Bot', 'Duplicate', 'Make Main Bot', 'Copy conversation ID', 'Hide from sidebar', 'Delete']) {
    assert.ok(data.labels.includes(label), label)
  }
  data.click('Make Main Bot')
  data.click('Edit Bot')
  assert.deepEqual(data.calls, [
    ['closeMenu'], ['setMain', 'writer', true],
    ['closeMenu'], ['openSettings', 'bots', 'writer'],
  ])
  const main = fixture({ main: true })
  assert.ok(main.labels.includes('Remove Main Bot role'))
  assert.ok(!main.labels.includes('Hide from sidebar'))
  assert.ok(!main.labels.includes('Delete'))
})
