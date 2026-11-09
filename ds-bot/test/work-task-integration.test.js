import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { install } from '../src/host/work-task-integration.js'
import { install as installNotices } from '../src/host/task-notices.js'
import { install as installGroups } from '../src/host/task-groups.js'

function fixture() {
  const employees = { chief: { id: 'chief', name: 'Chief' }, worker: { id: 'worker', name: 'Worker' } }
  const rt = { state: { rooms: {}, exchanges: [], questions: {} }, home: '', ctx: {}, live: new Map(),
    roomInbox: new Map(), roomProgress: new Map(), botOf: id => employees[id], roomOf: id => rt.state.rooms[id],
    approvalsView: () => [], save: async () => {}, warn() {} }
  install(rt)
  return rt
}

test('task delivery ignores its own turn but respects another worker, approval and unanswered delegation', () => {
  const rt = fixture()
  const task = { ownerBotId: 'worker', roomId: 'room', bindings: [{ botId: 'chief', sessionId: 'chief-private', purpose: 'origin' }, { botId: 'worker', sessionId: 'worker-room', purpose: 'execution' }] }
  rt.state.rooms.room = { id: 'room', sessions: { worker: 'worker-room', chief: 'chief-room' } }
  rt.live.set('chief-private', { turn: 5 })
  rt.live.set('worker-room', { turn: 3 })
  assert.equal(rt.workTaskSubmissionBlocked(task, { sessionId: 'worker-room' }), false)
  assert.equal(rt.workTaskAcceptanceBlocked(task), true)
  rt.live.set('chief-room', { turn: 2 })
  assert.equal(rt.workTaskSubmissionBlocked(task, { sessionId: 'worker-room' }), true)
  rt.live.delete('chief-room')
  rt.approvalsView = () => [{ sessionId: 'worker-room' }]
  assert.equal(rt.workTaskSubmissionBlocked(task, { sessionId: 'worker-room' }), true)
  rt.approvalsView = () => []
  rt.state.exchanges.push({ id: 'request1', role: 'request', fromRoomId: 'room' })
  assert.equal(rt.workTaskSubmissionBlocked(task, { sessionId: 'worker-room' }), true)
  rt.state.exchanges.push({ role: 'reply', replyTo: 'request1' })
  assert.equal(rt.workTaskSubmissionBlocked(task, { sessionId: 'worker-room' }), false)
})

test('acceptance indexes only involved staff and never feeds unconfirmed business lessons', async () => {
  const rt = fixture(), indexed = []
  rt.recordTaskExperiences = async items => indexed.push(...items)
  const task = { id: 'task', ownerBotId: 'worker', originBotId: 'chief', participantBotIds: ['worker'], title: 'Five companies', objective: 'Verified leads', bindings: [] }
  const delivery = { id: 'version1', title: 'Five companies', summary: 'Verified leads attached', files: [] }
  await rt.acceptWorkTask(task, delivery)
  await rt.acceptWorkTask(task, delivery)
  assert.equal(rt.state.taskNotices.length, 1)
  assert.deepEqual([...new Set(indexed.map(item => item.botId))].sort(), ['chief', 'worker'])
  assert.ok(indexed.every(item => !item.evidence))
})

test('delivery download uses a known archive version and rejects changed or escaped files', async t => {
  const rt = fixture()
  rt.home = await mkdtemp(join(process.cwd(), '.dsh-test-work-task-files-'))
  t.after(() => rm(rt.home, { recursive: true, force: true }))
  const archive = join(rt.home, 'task-records', 't1', 'versions', 'v1')
  await mkdir(archive, { recursive: true })
  const path = join(archive, 'report.csv'), data = Buffer.from('company,evidence\nA,https://example.test\n')
  await writeFile(path, data)
  const file = { path, name: 'report.csv', size: data.length, sha256: createHash('sha256').update(data).digest('hex') }
  rt.state.workTasks = { t1: { id: 't1', deliveries: [{ id: 'd1', files: [file] }] } }
  const args = { taskId: 't1', deliveryId: 'd1', fileIndex: 0 }
  assert.equal(Buffer.from((await rt.workTaskFile(args)).base64, 'base64').toString(), data.toString())
  await assert.rejects(rt.workTaskFile({ ...args, fileIndex: -1 }), /not found/)
  await writeFile(path, 'changed')
  await assert.rejects(rt.workTaskFile(args), /changed/)
  file.path = join(rt.home, 'outside.txt')
  await writeFile(file.path, 'outside')
  await assert.rejects(rt.workTaskFile(args), /outside the task archive/)
})

test('complete_task saves a managed delivery before the final answer and never publishes a legacy completion', async () => {
  let complete, submitted = 0
  const rt = fixture(), entry = { turn: 1, taskEpoch: 1 }
  rt.ctx.tools = { register: tool => { complete = tool } }
  rt.live.set('worker', entry)
  rt.selfOf = id => id
  rt.groupOwners = new Map()
  rt.workTaskForSession = () => ({ id: 'task' })
  rt.submitWorkTask = async (taskId, input) => { assert.equal(taskId, 'task'); assert.equal(input.sessionId, 'worker'); submitted++ }
  installNotices(rt)
  const answer = await complete.execute({ title: 'Report', summary: 'Checked five records.', task_id: 'task' }, { agent: { id: 'worker' } })
  assert.match(answer, /awaiting user acceptance/)
  assert.equal(submitted, 1)
  assert.equal(entry.completion, undefined)
  rt.finishTaskNotice(entry, { reason: { kind: 'error' }, id: 'worker', turn: 1 })
  assert.equal(rt.state.taskNotices, undefined, 'the saved delivery survives independently from final-message notifications')
})

test('a replaced archive directory cannot redirect a saved-version download', async t => {
  const rt = fixture()
  rt.home = await mkdtemp(join(process.cwd(), '.dsh-test-work-task-junction-'))
  t.after(() => rm(rt.home, { recursive: true, force: true }))
  const external = join(rt.home, 'other-data'), archive = join(rt.home, 'task-records', 'task')
  await mkdir(external, { recursive: true })
  await mkdir(join(rt.home, 'task-records'), { recursive: true })
  await writeFile(join(external, 'report.csv'), 'same bytes')
  try { await symlink(external, archive, 'junction') } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Creating directory links requires permission on this host'); return }
    throw error
  }
  rt.state.workTasks = { task: { id: 'task', deliveries: [{ id: 'v1', files: [{ path: join(archive, 'report.csv'), name: 'report.csv', size: 10, sha256: createHash('sha256').update('same bytes').digest('hex') }] }] } }
  await assert.rejects(rt.workTaskFile({ taskId: 'task', deliveryId: 'v1', fileIndex: 0 }), /Linked paths/)
})

test('ending a managed group round cannot complete or learn the task without acceptance', async () => {
  const rt = fixture()
  installGroups(rt)
  const room = { id: 'room', members: ['worker'], admin: 'worker', task: { status: 'active', workTaskId: 'task', pendingCompletion: { title: 'Report' } } }
  await rt.finishTaskGroupRound(room, { failed: [], slots: [], replies: [] })
  assert.equal(room.task.status, 'active')
  assert.equal(rt.state.taskNotices, undefined)
})

test('a new cycle uses the current coordinator even when the former Chief has left', async () => {
  const rt = fixture()
  const room = { id: 'room', name: 'Prospecting', members: ['worker'], admin: 'worker', task: { status: 'completed', cycle: 1, objective: 'Five leads', originBotId: 'former-chief', workTaskId: 'old' } }
  rt.state.rooms.room = room
  rt.state.workTasks = { old: { id: 'old', status: 'completed', criteria: ['Five leads with evidence'], steps: [{ id: 'search', title: 'Verify sources' }] } }
  rt.ensureGroupSession = async (_room, owner) => { assert.equal(owner.id, 'worker'); return { id: 'worker-current-group' } }
  rt.createWorkTask = async input => {
    assert.equal(input.sessionId, 'worker-current-group')
    assert.equal(input.originBotId, 'worker')
    assert.deepEqual(input.criteria, ['Five leads with evidence'])
    return { id: 'next' }
  }
  installGroups(rt)
  await rt.reopenTaskGroup(room)
  assert.equal(room.task.cycle, 2)
  assert.equal(room.task.workTaskId, 'next')
  assert.equal(rt.state.workTasks.old.status, 'completed')
})

test('a failed new task cycle leaves the accepted group result intact', async () => {
  const rt = fixture()
  const prior = { status: 'completed', cycle: 1, workTaskId: 'accepted', result: { title: 'Saved delivery' } }
  const room = { id: 'room', members: ['worker'], admin: 'worker', task: prior }
  rt.nextWorkTaskForRoom = async () => { throw new Error('Cannot save new task') }
  installGroups(rt)
  await assert.rejects(rt.reopenTaskGroup(room), /Cannot save/)
  assert.equal(room.task, prior)
  assert.equal(room.task.status, 'completed')
})
