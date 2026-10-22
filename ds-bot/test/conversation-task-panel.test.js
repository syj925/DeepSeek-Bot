import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { indexRoster } from '../src/client/sources.js'

const { outputFiles } = await build({ entryPoints: ['src/client/conversation-task-panel.js'], bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }),
  createContext: value => ({ value }), useContext: context => context.value,
} : {} })
const { conversationFiles, fileRevision, TaskPanelContent, informationRevisions, panelOwner } = module.exports
const nodes = (node, match) => [...(match(node) ? [node] : []), ...(node?.children ?? []).flatMap(child => nodes(child, match))]
const chief = { id: 'chief', sessionId: 'chief-current', parts: ['chief-old'] }
const file = { path: '/report.docx', name: 'Report.docx' }
const completion = { id: 'finished', at: 200, targetId: 'chief', sessionId: 'chief-old', title: 'Report', summary: 'Delivered', files: [file] }

test('panel scopes results to the employee across parts and preserves the source session for opening files', () => {
  const roster = indexRoster({ bots: [chief], rooms: [], taskNotices: [completion,
    { ...completion, id: 'other', targetId: 'other', at: 300 },
    { ...completion, id: 'message', kind: 'message', at: 400 }] })
  const calls = []
  const tree = TaskPanelContent({ sessionId: 'chief-current', roster, actions: { openTaskResult: (...args) => calls.push(args) } })
  const buttons = nodes(tree, node => node?.props?.className === 'bt-task-panel-file')
  assert.equal(buttons.length, 1)
  buttons[0].props.onClick()
  assert.equal(calls[0][0].sessionId, 'chief-old')
  assert.equal(calls[0][1].path, file.path)
  assert.equal(calls[0][1], file)
  assert.equal(nodes(tree, node => node?.props?.item?.id === 'finished').length, 1)
})

test('absolute file deduplication keeps the newest registration, relative paths retain their source', () => {
  const results = [completion, { ...completion, id: 'older', at: 100 }, { ...completion, id: 'different-source', sessionId: 'writer' }]
  const files = conversationFiles(results)
  assert.equal(files.length, 1)
  assert.equal(files[0].item.id, 'finished')
  assert.equal(conversationFiles(results.map(item => ({ ...item, files: [{ path: 'report.md' }] }))).length, 2)
})

test('group panels expose their own active task, files and result without unrelated groups', () => {
  const rooms = [{ id: 'room', name: 'Report team', task: { status: 'active', objective: 'Revise the report', originBotId: 'chief', completedAt: 100, result: { ...completion, cycle: 1 } } },
    { id: 'other-room', task: { status: 'active', originBotId: 'other' } }]
  const roster = indexRoster({ bots: [chief], rooms, taskNotices: [] })
  const opened = []
  const tree = TaskPanelContent({ sessionId: 'room', roster, actions: { showExecution: id => opened.push(id) } })
  const tasks = nodes(tree, node => node?.props?.className === 'bt-task-panel-task')
  assert.equal(tasks.length, 1)
  tasks[0].props.onClick()
  assert.deepEqual(opened, ['room'])
  assert.equal(nodes(tree, node => node?.props?.className === 'bt-task-panel-file').length, 1)
  assert.equal(nodes(tree, node => node?.props?.item?.previous === true).length, 1)
})

test('private panel opens related active groups and does not invent task completion from messages', () => {
  const roster = indexRoster({ bots: [chief], rooms: [{ id: 'room', name: 'Report', task: { originBotId: 'chief', status: 'active', objective: 'Write' } }],
    taskNotices: [{ ...completion, kind: 'message' }] })
  const opened = []
  const tree = TaskPanelContent({ sessionId: 'chief-current', roster, actions: {}, open: id => opened.push(id) })
  nodes(tree, node => node?.props?.className === 'bt-task-panel-task')[0].props.onClick()
  assert.deepEqual(opened, ['room'])
  assert.equal(nodes(tree, node => node?.props?.className === 'bt-task-panel-file').length, 0)
  assert.equal(nodes(tree, node => node?.props?.className === 'bt-task-panel-empty').length, 2)
})

test('discovered files replace completion metadata and missing paths have no open action', () => {
  const roster = indexRoster({ bots: [chief], rooms: [], taskNotices: [completion] })
  const discovered = [{ ...file, id: 'verified', targetId: 'chief', sessionId: 'worker', available: false, at: 200 }]
  const merged = conversationFiles([completion], discovered)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].item.sessionId, 'worker')
  const tree = TaskPanelContent({ sessionId: 'chief-current', roster, actions: {}, discovered })
  assert.equal(nodes(tree, node => node?.props?.className === 'bt-task-panel-file').length, 0)
  assert.equal(nodes(tree, node => node?.props?.className?.includes('bt-task-panel-file--missing')).length, 1)
  assert.equal(nodes(tree, node => node?.props?.className === 'bt-task-panel-retry').length, 1)
  const before = { item: completion, file: { ...file, modifiedAt: 1, size: 10 } }
  assert.notEqual(fileRevision(before), fileRevision({ ...before, file: { ...before.file, modifiedAt: 2 } }))
})

test('information panel includes only this conversation errors and keeps dismissed errors recoverable', () => {
  const roster = indexRoster({ bots: [chief], rooms: [{ id: 'room' }], modelFailures: [
    { id: 'failure', sessionId: 'chief-current', botId: 'chief', code: 'RATE_LIMIT', at: 1, dismissedAt: 2 },
    { id: 'other-error', roomId: 'other-room', botId: 'chief', code: 'AUTH', at: 2 },
  ] })
  const tree = TaskPanelContent({ sessionId: 'chief-current', roster, actions: {} })
  const errors = nodes(tree, node => node?.props?.className === 'bt-task-panel-errors')
  assert.equal(errors.length, 1)
  const recovery = nodes(tree, node => node?.props?.embedded)[0]
  assert.equal(recovery.props.sessionId, 'chief-current')
  const revisions = informationRevisions('chief-current', roster, [])
  assert.equal(revisions.filter(value => value.startsWith('error:')).length, 1)
  assert.ok(revisions.some(value => value.startsWith('error:failure:')))
  assert.equal(nodes(TaskPanelContent({ sessionId: 'room', roster, actions: {} }), node => node?.props?.className === 'bt-task-panel-errors').length, 0)
})

test('information unread revisions include task completion and recovery changes across conversation parts', () => {
  const roster = indexRoster({ bots: [chief], rooms: [], taskNotices: [completion], modelFailures: [
    { id: 'failure', sessionId: 'chief-current', botId: 'chief', at: 1, assistance: { status: 'sent' } },
  ] })
  assert.equal(panelOwner('chief-current', roster).owner, 'chief')
  const before = informationRevisions('chief-current', roster, [])
  assert.ok(before.some(value => value.startsWith('result:finished:')))
  roster.modelFailures[0].assistance.status = 'failed'
  const after = informationRevisions('chief-current', roster, [])
  assert.notDeepEqual(before, after)
  assert.equal(informationRevisions('unrelated', roster, []).length, 0)
})
