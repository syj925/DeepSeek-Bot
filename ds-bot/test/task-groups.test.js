import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/task-groups.js'

function setup() {
  const room = { id: 'room', name: 'Report', admin: 'chief', sessions: { chief: 'group-chief', writer: 'group-writer' }, task: { originBotId: 'chief', objective: 'Make report', status: 'active', cycle: 1 } }
  const reports = []
  const rt = { state: { exchanges: [], questions: {} }, live: new Map(), roomProgress: new Map(), roomOf: id => id === room.id ? room : undefined,
    botOf: id => ({ id, name: id }), save: async () => {}, deliver: async value => reports.push(value), warn() {} }
  install(rt)
  const complete = () => rt.recordTaskGroupCompletion({ roomId: room.id, botId: 'chief', title: 'Report', summary: 'Report verified.', files: [] })
  const round = (patch = {}) => ({ slots: [{ id: 'chief', status: 'posted' }], failed: [], replies: [{ botId: 'chief', text: 'Delivered.' }], ...patch })
  return { rt, room, reports, complete, round }
}

test('idle rounds and ordinary replies never finish a task group', async () => {
  const h = setup()
  await h.rt.finishTaskGroupRound(h.room, h.round())
  assert.equal(h.room.task.status, 'active')
  assert.equal(h.reports.length, 0)
})

test('coordinator completion archives without deleting history and reports once per cycle', async () => {
  const h = setup()
  h.room.log = [{ text: 'history' }]
  h.complete()
  await h.rt.finishTaskGroupRound(h.room, h.round())
  await h.rt.finishTaskGroupRound(h.room, h.round())
  assert.equal(h.room.task.status, 'completed')
  assert.equal(h.room.log.length, 1)
  assert.equal(h.reports.length, 0)
  assert.equal(h.rt.state.taskNotices.length, 1)
  await h.rt.reopenTaskGroup(h.room)
  assert.equal(h.room.task.cycle, 2)
  assert.equal(h.room.task.status, 'active')
  h.complete()
  await h.rt.finishTaskGroupRound(h.room, h.round())
  assert.equal(h.reports.length, 0)
})

test('failed, aborted, pending and approval rounds cannot archive', async () => {
  for (const kind of ['failed', 'working', 'approval', 'missed', 'stopped', 'cut', 'resumed', 'aborted', 'waiting']) {
    const h = setup(); h.complete()
    const round = kind === 'waiting' ? h.round({ slots: [{ status: 'waiting' }] }) : h.round({ replies: [{ kind }] })
    await h.rt.finishTaskGroupRound(h.room, round, kind === 'aborted')
    assert.equal(h.room.task.status, 'active', kind)
    assert.equal(h.room.task.pendingCompletion, undefined)
    assert.equal(h.reports.length, 0)
  }
})

test('outstanding private delegation, active employees and approvals block completion', () => {
  const h = setup()
  h.rt.state.exchanges = [{ id: 'request', role: 'request', fromRoomId: 'room' }]
  assert.equal(h.rt.taskGroupBlocked(h.room), true)
  h.rt.state.exchanges.push({ role: 'reply', replyTo: 'request' })
  assert.equal(h.rt.taskGroupBlocked(h.room), false)
  h.rt.live.set('group-writer', { turn: 1 })
  assert.equal(h.rt.taskGroupBlocked(h.room, 'group-chief'), true)
  assert.equal(h.rt.taskGroupBlocked(h.room, 'group-writer'), false)
  h.rt.live.clear()
  h.rt.state.modelFailures = [{ roomId: 'room' }]
  assert.equal(h.rt.taskGroupBlocked(h.room), true)
  h.rt.state.modelFailures = []
  h.rt.state.questions['group-chief'] = {}
  assert.equal(h.rt.taskGroupBlocked(h.room), true)
})

test('ordinary groups and non-coordinator declarations remain unchanged', async () => {
  const h = setup()
  h.rt.recordTaskGroupCompletion({ roomId: 'room', botId: 'writer' })
  assert.equal(h.room.task.pendingCompletion, undefined)
  delete h.room.task
  await h.rt.finishTaskGroupRound(h.room, h.round())
  assert.equal(h.room.task, undefined)
})

test('report failure retains the completed result without retry storms', async () => {
  const h = setup(); h.complete()
  let calls = 0
  h.rt.deliver = async () => { calls++; throw new Error('offline') }
  await h.rt.finishTaskGroupRound(h.room, h.round())
  await h.rt.finishTaskGroupRound(h.room, h.round())
  assert.equal(h.room.task.status, 'completed')
  assert.equal(h.room.task.reportedCycle, 1)
  assert.equal(h.room.task.result.summary, 'Report verified.')
  assert.equal(calls, 0)
})

test('reopening a completed group replaces a retired temporary coordinator with an active member', async () => {
  const h = setup()
  h.room.members = ['chief', 'writer']
  h.room.task.status = 'completed'
  h.rt.botOf = id => ({ id, retiredAt: id === 'chief' ? 1 : undefined })
  h.rt.isMain = () => false
  await h.rt.reopenTaskGroup(h.room)
  assert.equal(h.room.admin, 'writer')
  assert.equal(h.room.task.status, 'active')
})
