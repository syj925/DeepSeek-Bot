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
const nodes = (tree, match) => !tree || typeof tree !== 'object' ? [] : [
  ...(match(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, match)),
]

function fixture() {
  let cursor = 0, tree
  const slots = [], calls = [], module = { exports: {} }
  const bot = { id: 'writer', name: 'Writer', sessionId: 'writer-current', hidden: true }
  const roster = { byId: { writer: bot, 'writer-current': bot }, roomsById: {}, mainBotIds: ['chief'], teams: [] }
  const actions = Object.fromEntries(['closeMenu', 'deleteBot', 'reportError'].map(key => [key, (...args) => calls.push([key, ...args])]))
  const menu = { kind: 'dock-member', id: 'writer-current', x: 10, y: 20,
    place: () => calls.push(['place']), onDeleted: () => calls.push(['onDeleted']) }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: name => ({ react: {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
      Fragment: 'fragment', createContext: value => ({ value }), useContext: context => context.value,
      useRef(initial) { return slots[cursor++] ??= { current: initial } },
      useState(initial) {
        const cell = slots[cursor++] ??= { value: initial }
        return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
      },
      useEffect() {}, useLayoutEffect() {},
    }, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const draw = () => {
    cursor = 0
    tree = module.exports.ContextMenu({ menu, roster, actions })
    if (typeof tree?.type === 'function') tree = tree.type(tree.props)
    return tree
  }
  const button = label => nodes(tree, node => node.type === 'button' && node.children.includes(label))[0]
  const click = label => {
    const target = button(label)
    assert.ok(target, `missing action ${label}`)
    assert.ok(!target.props.disabled, `disabled action ${label}`)
    return target.props.onClick()
  }
  draw()
  return { bot, roster, menu, actions, calls, draw, button, click }
}

test('Dock deletion requires a named confirmation, can be cancelled, and preserves placement', async () => {
  const app = fixture()
  assert.deepEqual(app.calls, [])
  app.click('Delete employee')
  assert.equal(app.draw().props['aria-label'], 'Delete Writer?')
  assert.deepEqual(app.calls, [], 'first click must not delete')
  app.click('Cancel'); app.draw()
  assert.deepEqual(app.calls, [])
  app.click('Place on canvas')
  assert.deepEqual(app.calls, [['closeMenu'], ['place']])
  assert.equal(app.bot.hidden, true)
})

test('Dock deletes the canonical employee once, waits for success and closes only after saving', async () => {
  const app = fixture()
  let finish
  app.actions.deleteBot = id => { app.calls.push(['deleteBot', id]); return new Promise(resolve => { finish = resolve }) }
  app.click('Delete employee'); app.draw()
  const remove = app.button('Delete employee').props.onClick
  const request = remove()
  await remove()
  app.draw()
  assert.equal(app.button('Deleting…').props.disabled, true)
  assert.deepEqual(app.calls, [['deleteBot', 'writer']])
  finish(); await request
  assert.deepEqual(app.calls, [['deleteBot', 'writer'], ['closeMenu'], ['onDeleted']])
})

test('Dock keeps Chief, Main Bots and department leaders protected, including changes during confirmation', async () => {
  for (const protect of [app => { app.bot.generalAssistant = true }, app => app.roster.mainBotIds.push('writer'), app => app.roster.teams.push({ leaderId: 'writer' })]) {
    const app = fixture()
    app.click('Delete employee'); app.draw()
    protect(app); app.draw()
    assert.equal(app.button('Delete employee').props.disabled, true)
    assert.ok(app.button('Place on canvas'))
    assert.equal(app.button('Cancel'), undefined, 'confirmation must not survive a new protected role')
    assert.deepEqual(app.calls, [])
  }
})

test('Dock reports failed deletion without hiding the employee or retrying automatically', async () => {
  const app = fixture(), error = new Error('archive failed')
  app.actions.deleteBot = id => { app.calls.push(['deleteBot', id]); throw error }
  app.click('Delete employee'); app.draw()
  await app.click('Delete employee'); app.draw()
  assert.deepEqual(app.calls, [['deleteBot', 'writer'], ['reportError', error, 'delete-employee']])
  assert.equal(app.button('Delete employee').props.disabled, false)
  assert.equal(app.bot.hidden, true)
  app.actions.deleteBot = id => app.calls.push(['deleteBot', id])
  await app.click('Delete employee')
  assert.deepEqual(app.calls.slice(2), [['deleteBot', 'writer'], ['closeMenu'], ['onDeleted']])
})

test('Dock closes the employee menu when the employee no longer exists', () => {
  const app = fixture()
  app.click('Delete employee'); app.draw()
  app.roster.byId = {}
  assert.equal(app.draw(), null)
  assert.deepEqual(app.calls, [])
})
