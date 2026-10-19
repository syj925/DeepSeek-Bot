import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/new-chat.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

function fixture({ mode = 'group', initialMembers = [] } = {}) {
  const slots = []
  let cursor = 0
  const react = {
    createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
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
  const chief = { id: 'chief', name: 'Chief' }, writer = { id: 'writer', name: 'Writer' }, coder = { id: 'coder', name: 'Coder' }
  const calls = []
  const props = {
    mode, initialMembers,
    roster: { bots: [chief, writer, coder], byId: { chief, writer, coder, 'writer-part': writer }, agents: [] },
    actions: {
      createRoom: async (members, options) => { calls.push(['create-room', [...members], { ...options }]); return { id: 'new-room' } },
      send: async (id, text) => { calls.push(['send', id, text]) },
      openSession: id => calls.push(['open', id]),
      closeOverlay: () => calls.push(['close']),
    },
  }
  const draw = () => { cursor = 0; return module.exports.NewChat(props) }
  return { draw, calls }
}

function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate))]
}

const find = (node, predicate) => findAll(node, predicate)[0]
const button = (node, label) => find(node, value => value.type === 'button' && (value.props['aria-label'] === label || value.children.includes(label)))
const option = (node, id) => find(node, value => value.props.role === 'option' && value.props['data-flip'] === id)
const textarea = node => find(node, value => value.type === 'textarea')
const tokens = node => findAll(node, value => value.props.className?.split(' ').includes('bt-token'))

test('selected group members remain selectable as admin and stale or duplicate ids are ignored', async () => {
  const data = fixture({ initialMembers: ['writer-part', 'writer', 'missing', 'chief', 'room'] })
  let tree = data.draw()
  assert.deepEqual(tokens(tree).map(value => value.props.key), ['writer', 'chief'])
  assert.ok(option(tree, 'writer'))
  assert.ok(option(tree, 'chief'))
  assert.equal(button(tree, 'Create group chat'), undefined)
  assert.deepEqual(data.calls, [])
  textarea(tree).props.onChange({ target: { value: 'Plan the release' } })
  tree = data.draw()
  assert.equal(button(tree, 'Send message').props.disabled, true)
  await textarea(tree).props.onKeyDown({ key: 'Enter', nativeEvent: {}, preventDefault() {} })
  await Promise.resolve()
  assert.deepEqual(data.calls, [])
})

test('choosing a selected employee as admin keeps the other members and uses the original greeting flow', async () => {
  const data = fixture({ initialMembers: ['chief', 'writer'] })
  await option(data.draw(), 'chief').props.onClick()
  const tree = data.draw()
  assert.deepEqual(tokens(tree).map(value => value.props.key), ['chief', 'writer'])
  assert.equal(tokens(tree).filter(value => value.props.className === 'bt-token bt-token-admin').length, 1)
  assert.equal(option(tree, 'chief'), undefined)
  assert.equal(option(tree, 'writer'), undefined)
  assert.equal(button(tree, 'Create group chat').props.disabled, false)
  await button(tree, 'Create group chat').props.onClick()
  assert.deepEqual(data.calls, [
    ['create-room', ['chief', 'writer'], { admin: 'chief', greet: true }], ['open', 'new-room'], ['close'],
  ])
})

test('choosing another admin preserves selected employees and sends the brief to the real Room', async () => {
  const data = fixture({ initialMembers: ['writer', 'coder'] })
  await option(data.draw(), 'chief').props.onClick()
  let tree = data.draw()
  textarea(tree).props.onChange({ target: { value: '  Build the plan together  ' } })
  tree = data.draw()
  assert.equal(button(tree, 'Send message').props.disabled, false)
  await button(tree, 'Send message').props.onClick()
  assert.deepEqual(data.calls, [
    ['create-room', ['chief', 'writer', 'coder'], { admin: 'chief' }],
    ['send', 'new-room', 'Build the plan together'], ['open', 'new-room'], ['close'],
  ])
})

test('a single selected admin still requires another member before a group can be created', async () => {
  const data = fixture({ initialMembers: ['chief'] })
  await option(data.draw(), 'chief').props.onClick()
  const tree = data.draw()
  assert.equal(button(tree, 'Create group chat').props.disabled, true)
  await button(tree, 'Create group chat').props.onClick()
  assert.deepEqual(data.calls, [])
  await option(data.draw(), 'writer').props.onClick()
  assert.equal(button(data.draw(), 'Create group chat').props.disabled, false)
})

test('the ordinary group picker still starts with admin and chat mode ignores group seeds', async () => {
  const group = fixture()
  assert.equal(tokens(group.draw()).length, 0)
  await option(group.draw(), 'chief').props.onClick()
  assert.equal(button(group.draw(), 'Create group chat').props.disabled, true)
  const chat = fixture({ mode: 'chat', initialMembers: ['chief', 'writer'] })
  assert.equal(tokens(chat.draw()).length, 0)
  await option(chat.draw(), 'writer').props.onClick()
  assert.deepEqual(chat.calls, [['open', 'writer'], ['close']])
})
