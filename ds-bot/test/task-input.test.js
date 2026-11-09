import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install, taskInputIntent } from '../src/host/task-input.js'

const message = (text, id = text) => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
function setup() {
  const bot = { id: 'writer', sessionId: 'old' }, sent = []
  let task = { id: 't1', title: 'Current report' }
  const rt = { state: { taskInputs: {}, questions: {} }, ctx: { sessions: { flush: async () => {} } },
    chatOwners: new Map([['old', 'writer'], ['fresh', 'writer']]), botOf: () => bot, chatOf: () => bot.sessionId,
    load: async () => {}, save: async () => {}, readOnly: () => undefined, isTemporaryBot: () => false,
    workTaskForSession: () => task, privateContextBusy: async () => false, ensureCapabilities: async () => {},
    resetTaskSession: async () => { bot.sessionId = 'fresh'; task = undefined; return true },
    resolveAgent: async () => ({ session: {}, followup: value => sent.push(value) }) }
  install(rt)
  return { rt, bot, sent }
}

test('task intent recognizes explicit boundaries and never infers a topic change from a keyword', () => {
  for (const text of ['新任务：做一份表', '开始新任务', '请开始一个新任务：整理名单', 'New task: write a report']) assert.equal(taskInputIntent(text), 'new', text)
  for (const text of ['继续当前任务：核验', '继续', '把这份报告改短一点', '这个文件在哪里？', 'Continue this task: check sources']) assert.equal(taskInputIntent(text), 'continue', text)
  for (const text of ['报告里写着“新任务”', '不要开始新任务', '帮我制定明天的计划', '这次是新任务吗？']) assert.equal(taskInputIntent(text), 'ask', text)
})

test('ambiguous input stays outside execution, survives restart and needs an exact user choice', async () => {
  const { rt, sent } = setup(), input = message('Please prepare a presentation.')
  input.content.push({ type: 'image', url: 'file:///mock/reference.png' })
  assert.equal(await rt.inspectTaskInput('old', [input]), 'ask')
  const pending = rt.taskInputsView().writer
  assert.equal(sent.length, 0)
  assert.equal(pending.attachments, 1)
  install(rt)
  assert.equal(rt.initializeTaskInputs(), false)
  await assert.rejects(rt.resolveTaskInput({ botId: 'writer', requestId: 'stale', decision: 'new' }), /choice changed/)
  await rt.resolveTaskInput({ botId: 'writer', requestId: pending.id, decision: 'continue' })
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].content, input.content)
  assert.equal(await rt.inspectTaskInput('old', [sent[0]]), 'continue')
  assert.equal(rt.taskInputsView().writer, undefined)
})

test('choosing new isolates before replaying input and keeps it after a failed reset', async () => {
  const { rt, sent, bot } = setup()
  await rt.inspectTaskInput('old', [message('Prepare a new result')])
  const requestId = rt.taskInputsView().writer.id, reset = rt.resetTaskSession
  rt.resetTaskSession = async () => false
  await assert.rejects(rt.resolveTaskInput({ botId: 'writer', requestId, decision: 'new' }), /could not be created/)
  assert.equal(sent.length, 0)
  assert.equal(rt.taskInputsView().writer.id, requestId)
  rt.resetTaskSession = reset
  await rt.resolveTaskInput({ botId: 'writer', requestId, decision: 'new' })
  assert.equal(bot.sessionId, 'fresh')
  assert.equal(await rt.inspectTaskInput('fresh', [sent[0]]), 'continue')
  assert.equal(rt.taskInputsView().writer, undefined)
})

test('approved input is not resent twice, and restart requires a fresh choice if sending was interrupted', async () => {
  const { rt, sent } = setup()
  await rt.inspectTaskInput('old', [message('Another request')])
  const requestId = rt.taskInputsView().writer.id
  await rt.resolveTaskInput({ botId: 'writer', requestId, decision: 'continue' })
  await assert.rejects(rt.resolveTaskInput({ botId: 'writer', requestId, decision: 'continue' }), /already being sent/)
  assert.equal(sent.length, 1)
  assert.equal(rt.initializeTaskInputs(), true)
  assert.notEqual(rt.taskInputsView().writer.id, requestId)
  assert.equal(rt.taskInputsView().writer.sending, false)
})

test('two windows confirming simultaneously cannot send the held request twice', async () => {
  const { rt, sent } = setup()
  await rt.inspectTaskInput('old', [message('Another request')])
  const requestId = rt.taskInputsView().writer.id
  const results = await Promise.allSettled([1, 2].map(() => rt.resolveTaskInput({ botId: 'writer', requestId, decision: 'continue' })))
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(sent.length, 1)
})
