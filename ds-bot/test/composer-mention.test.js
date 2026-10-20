import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/composer.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const module = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports,
  require: name => ({
    react: {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
      createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value,
      Fragment: 'fragment', useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }),
      useEffect() {}, useLayoutEffect() {},
    },
    'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {},
  })[name],
})
const { ComposerMention, ComposerPlus } = module.exports

test('the mention button opens an existing token without changing models or duplicating @', () => {
  const span = { start: 4, end: 4, draftRev: 3 }, opened = [], inserts = [], changed = []
  let prevented = 0
  const tree = ComposerMention({
    sessionId: 'room',
    useInput: select => select({ draft: '跑完了@', draftRev: 3, phase: 'plain' }),
    inputActions: { captureInsertion: () => span, insertText: (...args) => inserts.push(args) },
    actions: { mentionBots: (...args) => opened.push(args), updateBot: (...args) => changed.push(args) },
  })
  assert.equal(tree.props['aria-label'], 'Mention a Bot')
  assert.equal(tree.children[0].children[0], '@')
  tree.props.onMouseDown({ preventDefault() { prevented += 1 } })
  tree.props.onClick()
  assert.equal(prevented, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [['room', { ...span, start: 3 }, '']])
  assert.deepEqual(inserts, [])
  assert.deepEqual(changed, [])
})

test('the mention button inserts a separated real @ token and opens it with the current revision', () => {
  let span = { start: 4, end: 4, draftRev: 3 }
  const inserts = [], opened = []
  const tree = ComposerMention({ sessionId: 'room', actions: { mentionBots: (...args) => opened.push(args) },
    useInput: select => select({ draft: 'done', draftRev: 3, phase: 'plain' }),
    inputActions: { captureInsertion: () => span, insertText: (...args) => { inserts.push(args); span = { start: 6, end: 6, draftRev: 4 }; return true } },
  })
  tree.props.onClick()
  assert.deepEqual(inserts, [[' @', { start: 4, end: 4, draftRev: 3 }]])
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [['room', { start: 5, end: 6, draftRev: 4 }, '']])
  assert.equal(ComposerMention({ sessionId: 'room', inputActions: {}, actions: {}, useInput: select => select({}) }), null)
})

test('the group composer exposes separate mention and member model controls', () => {
  const room = { id: 'room', members: ['chief'] }
  const roster = { bots: [], byId: {}, roomsById: { room } }
  const inputActions = { captureInsertion() {} }, actions = { canReferenceChat: () => false }
  const tree = ComposerPlus({ sessionId: 'room', inputActions, useRoster: select => select(roster), actions })
  const mention = tree.children.find(child => child?.type === ComposerMention)
  const model = tree.children.find(child => typeof child?.type === 'function' && child.props.room === room)
  assert.ok(mention)
  assert.equal(mention.props.inputActions, inputActions)
  assert.equal(mention.props.actions, actions)
  assert.ok(model)
  assert.notEqual(mention.type, model.type)
})
