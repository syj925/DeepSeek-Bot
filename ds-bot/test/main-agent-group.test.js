import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/main-agent-group.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})

function fixture({ members = ['c'], target = 'room', keepSurface = false } = {}) {
  const slots = []
  let cursor = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useEffect() { cursor++ },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, require: () => react,
  })
  const bots = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }))
  const placeholder = { id: 'preview-only', name: 'Preview employee', sessionId: 'preview-only' }
  let room = { id: 'planning', name: 'Planning', members: ['a', 'b'], admin: 'b', mode: 'admin' }
  const roster = {
    bots,
    byId: Object.fromEntries([...bots, placeholder].map(bot => [bot.id, bot])),
    mainBotIds: [],
    roomsById: { [room.id]: room },
  }
  const calls = { updated: [], created: [], opened: [], completed: [], closed: 0 }
  const props = {
    members, roster,
    target: target === 'room' ? { kind: 'room', id: room.id, name: room.name, keepSurface }
      : target === 'draft' ? { kind: 'draft', id: 'draft' } : undefined,
    actions: {
      updateRoom: async (id, patch) => {
        calls.updated.push({ id, patch: { add: Array.from(patch.add) } })
        room = { ...room, members: [...new Set([...room.members, ...patch.add])] }
        roster.roomsById[id] = room
        return { room, changes: ['added employees'] }
      },
      createRoom: async (ids, options) => {
        calls.created.push({ members: Array.from(ids), options: { ...options } })
        return { id: 'created-room', members: Array.from(ids), ...options }
      },
      openCanvasEntity: id => calls.opened.push(id),
    },
    onComplete: result => calls.completed.push(result),
    onClose: () => calls.closed++,
  }
  const draw = () => { cursor = 0; return module.exports.MainAgentGroup(props) }
  return { draw, props, roster, calls, get room() { return room } }
}

function findAll(node, predicate) {
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate))]
}

const find = (node, predicate) => findAll(node, predicate)[0]
const save = tree => find(tree, node => node.type === 'button' && node.props.className === 'bt-send')
const cancel = tree => find(tree, node => node.type === 'button' && node.children.includes('Cancel'))
const textOf = node => !node ? '' : typeof node === 'object' ? node.children.map(textOf).join(' ') : String(node)
const alerts = tree => findAll(tree, node => node.props.role === 'alert').map(textOf).join(' ')

test('byId-only placeholders and missing employees cannot be saved to a group', async () => {
  for (const target of ['room', 'draft', undefined]) {
    for (const missing of ['preview-only', 'missing']) {
      const data = fixture({ members: ['a', missing], target: target ?? 'new' })
      const tree = data.draw()
      assert.equal(save(tree).props.disabled, true)
      assert.match(alerts(tree), /Create them before adding them to a group/)
      await save(tree).props.onClick()
      assert.deepEqual(data.calls.updated, [])
      assert.deepEqual(data.calls.created, [])
      assert.deepEqual(data.calls.completed, [])
      assert.equal(data.calls.closed, 0)
      assert.deepEqual(data.room.members, ['a', 'b'])
      assert.equal(data.room.admin, 'b')
    }
  }
})

test('ordinary employees extend a two-person group to three or four without replacing members or admin', async () => {
  for (const members of [['c'], ['c', 'd'], ['a', 'c', 'c', 'd', 'b']]) {
    const data = fixture({ members })
    const additions = [...new Set(members.filter(id => !['a', 'b'].includes(id)))]
    const tree = data.draw()
    assert.equal(save(tree).props.disabled, false)
    await save(tree).props.onClick()
    assert.deepEqual(data.calls.updated, [{ id: 'planning', patch: { add: additions } }])
    assert.deepEqual(data.calls.created, [])
    assert.deepEqual(data.room.members, ['a', 'b', ...additions])
    assert.equal(data.room.admin, 'b')
    assert.equal(data.calls.completed[0].room, data.room)
    assert.deepEqual(Array.from(data.calls.completed[0].members), [...new Set(members)])
    assert.deepEqual(data.calls.opened, ['planning'])
    assert.equal(data.calls.closed, 1)
  }
})

test('adding to an open chat or sidebar target preserves the current surface', async () => {
  const data = fixture({ members: ['c', 'd'], keepSurface: true })
  await save(data.draw()).props.onClick()
  assert.deepEqual(data.calls.updated, [{ id: 'planning', patch: { add: ['c', 'd'] } }])
  assert.deepEqual(data.room.members, ['a', 'b', 'c', 'd'])
  assert.equal(data.room.admin, 'b')
  assert.equal(data.calls.completed[0].room, data.room)
  assert.deepEqual(data.calls.opened, [])
  assert.equal(data.calls.closed, 1)
})

test('employees already in the group do not trigger an update', async () => {
  const data = fixture({ members: ['a', 'a', 'b'] })
  const tree = data.draw()
  assert.equal(save(tree).props.disabled, true)
  assert.match(alerts(tree), /already in this group/)
  await save(tree).props.onClick()
  assert.deepEqual(data.calls.updated, [])
  assert.equal(data.calls.closed, 0)
})

test('cancelling an invitation leaves members and admin unchanged', () => {
  const data = fixture()
  cancel(data.draw()).props.onClick()
  assert.deepEqual(data.calls.updated, [])
  assert.deepEqual(data.calls.created, [])
  assert.deepEqual(data.room.members, ['a', 'b'])
  assert.equal(data.room.admin, 'b')
  assert.equal(data.calls.closed, 1)
})

test('failed invitations remain open and can be retried', async () => {
  const data = fixture({ members: ['c', 'd'] })
  const update = data.props.actions.updateRoom
  data.props.actions.updateRoom = async () => { throw new Error('Offline') }
  await save(data.draw()).props.onClick()
  assert.match(alerts(data.draw()), /Offline/)
  assert.equal(save(data.draw()).props.disabled, false)
  assert.equal(data.calls.closed, 0)
  assert.deepEqual(data.calls.opened, [])
  assert.deepEqual(data.room.members, ['a', 'b'])
  assert.equal(data.room.admin, 'b')
  data.props.actions.updateRoom = update
  await save(data.draw()).props.onClick()
  assert.deepEqual(data.room.members, ['a', 'b', 'c', 'd'])
  assert.equal(data.room.admin, 'b')
  assert.doesNotMatch(alerts(data.draw()), /Offline/)
  assert.equal(data.calls.closed, 1)
})

test('a response that omitted selected members is not reported as a successful invitation', async () => {
  const data = fixture({ members: ['c', 'd'] })
  const update = data.props.actions.updateRoom
  data.props.actions.updateRoom = async () => ({ room: data.room, changes: [] })
  await save(data.draw()).props.onClick()
  assert.match(alerts(data.draw()), /did not include all selected employees/)
  assert.equal(data.calls.closed, 0)
  assert.deepEqual(data.calls.completed, [])
  assert.deepEqual(data.calls.opened, [])
  data.props.actions.updateRoom = update
  await save(data.draw()).props.onClick()
  assert.deepEqual(data.room.members, ['a', 'b', 'c', 'd'])
  assert.equal(data.calls.closed, 1)
})

test('a pending invitation cannot be submitted twice or cancelled before completion', async () => {
  const data = fixture()
  let finish
  data.props.actions.updateRoom = (id, patch) => {
    data.calls.updated.push({ id, patch: { add: Array.from(patch.add) } })
    return new Promise(resolve => { finish = resolve })
  }
  const originalTree = data.draw()
  const pending = save(originalTree).props.onClick()
  await save(originalTree).props.onClick()
  cancel(data.draw()).props.onClick()
  assert.equal(data.calls.updated.length, 1)
  assert.equal(data.calls.closed, 0)
  finish({ room: { ...data.room, members: ['a', 'b', 'c'] }, changes: ['added C'] })
  await pending
  assert.equal(data.calls.closed, 1)
})

test('creating a group keeps all three real employees and removes repeated ids', async () => {
  const data = fixture({ members: ['a', 'c', 'c', 'd'], target: 'new' })
  await save(data.draw()).props.onClick()
  assert.deepEqual(data.calls.updated, [])
  assert.deepEqual(data.calls.created, [{ members: ['a', 'c', 'd'], options: { admin: 'a', name: '' } }])
  assert.deepEqual(data.calls.opened, ['created-room'])
  assert.equal(data.calls.closed, 1)
})
