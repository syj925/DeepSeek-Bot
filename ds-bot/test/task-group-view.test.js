import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { indexRoster } from '../src/client/sources.js'

const { outputFiles } = await build({ entryPoints: ['src/client/task-groups.js'], bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports,
  require: name => name === 'react' ? {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }),
    createContext: value => ({ value }), useContext: context => context.value,
    useState: value => [value, () => {}],
  } : {} })
const { conversationResults, ConversationResult, TaskGroupJourney } = module.exports
const find = (node, match) => match(node) ? node : node?.children?.map(child => find(child, match)).find(Boolean)
const chief = { id: 'chief', sessionId: 'current', parts: ['old'] }
const completion = { id: 'finished', at: 100, targetId: 'chief', sessionId: 'old', title: 'Report', summary: 'Delivered the report.', files: [{ name: 'Report', path: '/report.docx' }] }
const roster = (extra = {}) => indexRoster({ bots: [chief], rooms: [], taskNotices: [], ...extra })

test('late employee receipts do not replace the private completion across context switches', () => {
  const state = roster({ taskNotices: [completion,
    { id: 'receipt', at: 200, targetId: 'chief', kind: 'message', title: 'New message', summary: 'Received' },
    { ...completion, id: 'other', targetId: 'other-bot', at: 300 }] })
  for (const sessionId of ['chief', 'old', 'current']) {
    const results = conversationResults(sessionId, state)
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'finished')
    const tree = TaskGroupJourney({ sessionId, roster: state, actions: {} })
    assert.equal(find(tree, node => node?.type === ConversationResult).props.item.id, 'finished')
  }
})

test('ordinary done text without formal completion does not create a result card', () => {
  const state = roster({ taskNotices: [{ kind: 'message', title: 'New message', targetId: 'chief', summary: 'Done!' }] })
  assert.equal(TaskGroupJourney({ sessionId: 'current', roster: state, actions: {} }), null)
})

test('private results remain after notices expire and exclude handoffs and group experiences', () => {
  const record = { ...completion, key: completion.id }
  const state = roster({ bots: [{ ...chief, taskIndex: [record,
    { ...record, key: 'handoff:room:1', at: 300 }, { ...record, key: 'room:1', roomId: 'room', at: 400 }] }] })
  assert.equal(conversationResults('current', state).length, 1)
  assert.equal(conversationResults('current', state)[0].id, completion.id)
  state.taskNotices = [completion]
  assert.equal(conversationResults('current', state).length, 1)
})

test('group results deduplicate notices and distinguish a resumed task from completed work', () => {
  const room = { id: 'room', members: ['chief'], task: { originBotId: 'chief', status: 'completed', completedAt: 200, result: { title: 'Group report', summary: 'Delivered', cycle: 1 } } }
  const state = roster({ rooms: [room], taskNotices: [{ ...completion, targetId: 'room', roomId: 'room', at: 201 }] })
  for (const sessionId of ['room', 'current']) {
    assert.equal(conversationResults(sessionId, state).length, 1)
    assert.equal(conversationResults(sessionId, state)[0].previous, false)
  }
  room.task.status = 'active'
  const item = conversationResults('room', state)[0]
  assert.equal(item.previous, true)
  const tree = ConversationResult({ item, sessionId: 'room', actions: {} })
  assert.equal(find(tree, node => node?.type === 'strong').children[0], 'Previous task result')
})

test('result files and linked task group use existing navigation actions', () => {
  const opened = [], files = []
  const item = { ...completion, roomId: 'room', targetId: 'room', sessionId: 'room' }
  const tree = ConversationResult({ item, sessionId: 'chief', actions: { openTaskResult: (result, file) => files.push([result, file]) }, open: id => opened.push(id) })
  assert.equal(tree.type, 'details')
  find(tree, node => node?.type === 'button' && node.props.title === '/report.docx').props.onClick()
  assert.equal(files[0][0], item)
  assert.equal(files[0][1], item.files[0])
  find(tree, node => node?.type === 'button' && node.children.includes('Open task group')).props.onClick()
  assert.deepEqual(opened, ['room'])
})
