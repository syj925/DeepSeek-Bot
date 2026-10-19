import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/task-context.js'
import { fakeContext } from './fake-ctx.js'

function setup(t) {
  const bots = Object.fromEntries(['chief', 'writer', 'temp'].map(id => [id, { id, name: id, employment: id === 'temp' ? 'temporary' : 'long-term' }]))
  const room = { id: 'room', admin: 'chief', members: ['chief', 'writer', 'temp'], sessions: { chief: 'gc', writer: 'gw', temp: 'gt' }, seq: 15, task: { status: 'completed' } }
  const ctx = fakeContext()
  t.after(() => ctx.dispose())
  const reset = [], archived = [], agents = new Map()
  ctx.workspaceRegistry = { archiveSession: async id => archived.push(id) }
  const rt = {
    ctx, state: { bots, rooms: { room }, teams: {}, questions: {}, exchanges: [] }, live: new Map(),
    botOf: id => bots[id], chatOf: id => bots[id].sessionId ?? id,
    chatOwners: new Map([['chief', 'chief'], ['writer', 'writer'], ['temp', 'temp']]),
    selfOf: id => id, isMain: id => id === 'chief',
    groupSessionsOf: id => Object.values(rt.state.rooms).map(value => value.sessions?.[id]).filter(Boolean),
    resolveAgent: async id => {
      if (!agents.has(id)) agents.set(id, { status: 'idle', inbox: { nextStep: [], nextTurn: [] } })
      return agents.get(id)
    },
    resetTaskSession: async id => {
      reset.push(id)
      const group = Object.values(rt.state.rooms).find(value => Object.values(value.sessions).includes(id))
      if (group) group.sessions[Object.keys(group.sessions).find(key => group.sessions[key] === id)] = `${id}-fresh`
      else bots[rt.chatOwners.get(id)].sessionId = `${id}-fresh`
      return true
    },
    retireTemporaryBot: async id => { if (!await rt.temporaryBotBusy(id)) bots[id].retiredAt = 1 },
    save: async () => {}, warn: () => {}, roomBusy: () => false, taskGroupBlocked: () => false,
  }
  install(rt)
  return { rt, room, bots, reset, archived, agents }
}

test('task indices deduplicate by cycle, retain paths and never become experience prompts', async t => {
  const h = setup(t)
  const entry = { botId: 'writer', title: 'Report', summary: 'Done', roomId: 'room', files: [{ path: 'E:/report.docx' }] }
  await h.rt.recordTaskExperiences([entry, entry, { ...entry, cycle: 2 }])
  assert.equal(h.bots.writer.taskIndex.length, 2)
  assert.equal(h.bots.writer.taskExperience, undefined)
  assert.equal(h.bots.writer.taskIndex[0].files[0].path, 'E:/report.docx')
  const text = await h.rt.ctx.registeredTools.get('read_task_history').execute({ query: 'Report' }, { agent: { id: 'writer' } })
  assert.equal(JSON.parse(text).length, 2)
  assert.equal(await h.rt.ctx.registeredTools.get('read_task_history').execute({}, { agent: { id: 'chief' } }), '[]')
})

test('completed group resets only its own execution sessions, leaving another group and private chat untouched', async t => {
  const h = setup(t)
  h.rt.state.rooms.other = { id: 'other', members: ['writer'], sessions: { writer: 'other-writer' }, task: { status: 'active' } }
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.deepEqual(h.reset, ['gc', 'gw', 'gt'])
  assert.equal(h.rt.state.rooms.other.sessions.writer, 'other-writer')
  assert.equal(h.rt.chatOf('writer'), 'writer')
  assert.equal(h.room.seen.writer, 15)
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.equal(h.reset.length, 3)
})

test('active tasks and queued messages cannot be cleaned up', async t => {
  const h = setup(t)
  h.room.task.status = 'active'
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.equal(h.reset.length, 0)
  h.room.task.status = 'completed'
  ;(await h.rt.resolveAgent('gc')).inbox.nextTurn.push({ id: 'new' })
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.equal(h.reset.length, 0)
  assert.equal(h.room.task.contextArchivedAt, undefined)
})

test('failed cleanup retains durable work and restart resumes without repeating a saved switch', async t => {
  const h = setup(t)
  const original = h.rt.resetTaskSession
  h.rt.resetTaskSession = async id => id === 'gw' ? false : original(id)
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.equal(h.room.task.contextArchivedAt, undefined)
  assert.deepEqual(Object.keys(h.room.task.resetSessions), ['writer', 'temp'])
  h.rt.resetTaskSession = original
  install(h.rt)
  await h.rt.archiveCompletedTaskContext(h.room)
  assert.deepEqual(h.reset, ['gc', 'gw', 'gt'])
  assert.ok(h.room.task.contextArchivedAt)
})

test('ordinary replies do not reset; verified private completion resets Chief too', async t => {
  const h = setup(t)
  h.room.task.status = 'active'
  await h.rt.archiveCompletedTaskSession('chief', { kind: 'message', title: 'Hi' })
  assert.deepEqual(h.reset, [])
  await h.rt.archiveCompletedTaskSession('chief', { title: 'Done', summary: 'Delivered' })
  assert.deepEqual(h.reset, ['chief'])
  assert.equal(h.bots.chief.pendingTaskReset, undefined)
})

test('new private work wins a race with completion persistence', async t => {
  const h = setup(t)
  h.rt.live.set('chief', { taskEpoch: 2 })
  await h.rt.archiveCompletedTaskSession('chief', { title: 'Done', epoch: 1 })
  assert.deepEqual(h.reset, [])
  assert.equal(h.bots.chief.pendingTaskReset, undefined)
})

test('temporary retirement waits for other groups, private input, questions, schedules and exchanges', async t => {
  const h = setup(t)
  h.rt.state.rooms.other = { id: 'other', members: ['temp'], sessions: {}, task: { status: 'active' } }
  assert.equal(await h.rt.temporaryBotBusy('temp'), true)
  delete h.rt.state.rooms.other
  ;(await h.rt.resolveAgent('temp')).inbox.nextTurn.push({ id: 'next' })
  assert.equal(await h.rt.temporaryBotBusy('temp'), true)
  h.agents.get('temp').inbox.nextTurn = []
  h.rt.state.questions.temp = { question: 'Continue?' }
  assert.equal(await h.rt.temporaryBotBusy('temp'), true)
  delete h.rt.state.questions.temp
  h.rt.scheduleEndpoint = async () => ({ tasks: [{ sessionId: 'temp' }] })
  assert.equal(await h.rt.temporaryBotBusy('temp'), true)
  h.rt.scheduleEndpoint = async () => ({ tasks: [] })
  h.rt.state.exchanges.push({ id: 'x', role: 'request', to: 'temp' })
  assert.equal(await h.rt.temporaryBotBusy('temp'), true)
  h.rt.state.exchanges.push({ role: 'reply', replyTo: 'x' })
  assert.equal(await h.rt.temporaryBotBusy('temp'), false)
})
