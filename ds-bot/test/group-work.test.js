import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../index.js'
import { fakeContext } from './fake-ctx.js'
import { ROOM_LATE_ROUNDS, ROOM_REPLY_TIMEOUT_MS } from '../src/host/constants.js'

// Chief, the admin of group 'r1', speaks there from 'ga'; Writer from 'gb'; Tester from 'gc'.
const seed = (room = {}) => ({
  version: 1,
  mainBotIds: ['a'],
  bots: {
    a: { id: 'a', name: 'Chief', role: 'Boss', sessionId: 'a', createdAt: 1 },
    b: { id: 'b', name: 'Writer', role: 'Write', sessionId: 'b', createdAt: 2 },
    c: { id: 'c', name: 'Tester', role: 'Test', sessionId: 'c', createdAt: 3 },
  },
  rooms: { r1: { id: 'r1', name: 'Ops', members: ['a', 'b', 'c'], mode: 'admin', admin: 'a', named: true, sessions: { a: 'ga', b: 'gb', c: 'gc' }, log: [], seq: 0, seen: {}, ...room } },
  agents: {},
  exchanges: [],
  exchangeTurns: {},
  questions: {},
  prefs: {},
  revision: 0,
})

async function start(t, room, questions = {}) {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-work-'))
  writeFileSync(join(home, 'state.json'), JSON.stringify({ ...seed(room), questions }))
  const ctx = fakeContext()
  const agents = new Map()
  const agentOf = (sessionId) => {
    if (!agents.has(sessionId)) {
      const calls = []
      const cancelled = []
      const held = []
      const inbox = {
        nextStep: [],
        nextTurn: held,
        remove(id) {
          const at = held.findIndex(message => message.id === id)
          if (at === -1) return false
          held.splice(at, 1)
          return true
        },
      }
      const keep = (message) => { calls.push(message); held.push(message) }
      agents.set(sessionId, { session: { id: sessionId }, calls, cancelled, inbox, followup: keep, steer: keep, cancel(reason) { cancelled.push(reason) } })
    }
    return agents.get(sessionId)
  }
  Object.assign(ctx, {
    llm: { listProviders: () => [], listModels: async () => [], resolveModelInfo: async () => ({}) },
    workspaceRegistry: { get: () => undefined, resolveByPath: async () => undefined, create: async path => ({ id: 'w1', path }), archiveSession: async () => {} },
    sessionController: { create: async () => ({ sessionId: 's1' }), resolveAgent: async sessionId => ({ agent: agentOf(sessionId) }), selectModel: async () => {} },
    sessionTitle: { rename: async () => {} },
    sessions: { flush: async () => {} },
  })
  let route
  const register = ctx.connection.fetch.register
  ctx.connection.fetch.register = (options) => { route = options; return register(options) }
  apply(ctx, { home })
  t.after(async () => {
    await ctx.dispose()
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })
  let seq = 0
  const turns = new Map()
  const emit = (id, type, data) => {
    for (const listener of ctx.listeners.get('session/event') ?? []) {
      if (listener.length >= 2) listener({ id }, { type, seq: ++seq, data })
    }
  }
  const tool = (name, args, sessionId, exec = {}) => ctx.registeredTools.get(name).execute(args, { agent: { id: sessionId }, ...exec })
  const call = async (endpoint, payload) => (await route.fetch(new Request('http://localhost/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }))).json()
  // A Session takes up the newest message it was sent, as a new turn.
  const begin = (sessionId) => {
    const message = agentOf(sessionId).calls.at(-1)
    agentOf(sessionId).inbox.nextTurn.length = 0
    const turn = (turns.get(sessionId) ?? 0) + 1
    turns.set(sessionId, turn)
    emit(sessionId, 'turn/start', { turn })
    emit(sessionId, 'user/message', { content: message.content, source: message.source })
    return message
  }
  const finish = (sessionId, reply) => {
    emit(sessionId, 'assistant/message', { message: { content: [{ type: 'text', text: reply }] } })
    emit(sessionId, 'turn/end', { turn: turns.get(sessionId), reason: { kind: 'completed' } })
  }
  // The user's message in the group, or a Bot's post the group Session took up, and the
  // round it starts.
  const round = (callId, message) => {
    emit('r1', 'user/message', message)
    let result
    const stop = new AbortController()
    t.after(() => stop.abort())
    void tool('group_relay', {}, 'r1', { callId, signal: stop.signal }).then((value) => { result = JSON.parse(value) })
    const read = () => result
    return read
  }
  const say = text => ({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  const takePost = () => {
    const post = agentOf('r1').calls.shift()
    return { content: post.content, source: post.source }
  }
  await tool('list_bots', {}, 'a')
  const stream = (id, frame) => { for (const listener of ctx.listeners.get('agent/assistant-stream') ?? []) listener({ agent: { id }, frame }) }
  return { home, agentOf, emit, stream, tool, call, begin, finish, round, say, takePost }
}

const settle = async (check) => {
  const until = Date.now() + 3000
  while (!check() && Date.now() < until) await new Promise(resolve => setImmediate(resolve))
  assert.ok(check(), 'condition not reached')
}
const text = message => message.content.map(block => block.text ?? '').join('\n')
const kinds = result => result.replies.map(reply => [reply.kind ?? 'message', reply.name])

test('group questions identify the employee, block completion and answer that employee directly', async t => {
  const host = await start(t, { task: { status: 'active', originBotId: 'a', objective: 'deliver', cycle: 1 } })
  const result = host.round('question-round', host.say('@Writer @Tester Prepare the report'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  await host.tool('ask_user', { question: 'Which audience?', options: [{ label: 'Business' }, { label: 'Consumer' }], allowCustom: true }, 'gb')
  host.finish('gb', '')
  await settle(() => host.agentOf('gc').calls.length === 1)
  host.begin('gc')
  await host.tool('ask_user', { question: 'Which tests?', options: [{ label: 'Smoke' }, { label: 'Full' }] }, 'gc')
  host.finish('gc', '')
  await settle(() => result())
  assert.deepEqual(kinds(result()), [['question', 'Writer'], ['question', 'Tester']])
  let state = (await host.call('state', {})).value
  assert.equal(state.questions.gb.roomId, 'r1')
  assert.equal(state.questions.gb.botId, 'b')
  assert.equal(state.rooms[0].task.status, 'active')
  const questionId = state.questions.gb.id
  const answer = { sessionId: 'gb', questionId, answer: { selected: ['Business'] } }
  assert.equal((await host.call('answer-question', answer)).ok, true)
  assert.equal((await host.call('answer-question', answer)).ok, false)
  const follow = host.round('answer-round', host.takePost())
  await settle(() => host.agentOf('gb').calls.length === 2)
  assert.match(text(host.begin('gb')), /Which audience\?[\s\S]*Business/)
  assert.equal(host.agentOf('ga').calls.length, 0)
  assert.equal(host.agentOf('a').calls.length, 0)
  host.finish('gb', 'The business report is ready.')
  await settle(() => follow())
  state = (await host.call('state', {})).value
  assert.equal(state.questions.gb, undefined)
  assert.ok(state.questions.gc)
  assert.match((await host.tool('read_group_chat', { group: 'Ops' }, 'a')), /Business/)
  const typed = host.round('typed-answer', host.say('@Tester Full'))
  await settle(() => host.agentOf('gc').calls.length === 2)
  assert.match(text(host.begin('gc')), /Which tests\?[\s\S]*Full/)
  host.finish('gc', '[PASS]')
  await settle(() => typed())
  assert.equal((await host.call('state', {})).value.questions.gc, undefined)
})

test('execution details are bounded actual tool events and returned model reasoning', async t => {
  const host = await start(t)
  const result = host.round('details', host.say('@Writer Check the report'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.emit('gb', 'tool/call', { callId: 'read', name: 'read_file', arguments: '{"path":"private"}' })
  const live = (await host.call('execution', { sessionId: 'r1', botId: 'b' })).value
  assert.equal(live.length, 1)
  assert.equal(live[0].running, true)
  assert.equal(live[0].progress[0].tool, 'read_file')
  assert.ok(!JSON.stringify(live).includes('private'))
  host.stream('gb', { type: 'start', attemptId: 'think' })
  host.stream('gb', { type: 'chunk', attemptId: 'think', index: 0, chunk: { type: 'reasoning-delta', text: 'Live returned reasoning' } })
  assert.equal((await host.call('execution', { sessionId: 'r1', botId: 'b' })).value[0].reasoning, 'Live returned reasoning')
  host.stream('gb', { type: 'end', attemptId: 'think', outcome: { kind: 'abandoned' } })
  assert.equal((await host.call('execution', { sessionId: 'r1', botId: 'b' })).value[0].reasoning, '')
  host.emit('gb', 'assistant/message', { message: { content: [{ type: 'reasoning', text: 'Returned model summary' }] } })
  host.finish('gb', 'Done')
  await settle(() => result())
  const finished = (await host.call('execution', { sessionId: 'r1', botId: 'b' })).value[0]
  assert.equal(finished.running, false)
  assert.equal(finished.reasoning, 'Returned model summary')
})

test('saved group questions survive host reload and reject answers after the member leaves', async t => {
  const question = { id: 'saved-question', roomId: 'r1', botId: 'b', question: 'Audience?', options: [{ label: 'Business' }] }
  const host = await start(t, {}, { gb: question })
  assert.equal((await host.call('state', {})).value.questions.gb.id, question.id)
  await host.tool('update_group', { group: 'Ops', remove_members: ['Writer'] }, 'a')
  const answer = await host.call('answer-question', { sessionId: 'gb', questionId: question.id, answer: { selected: ['Business'] } })
  assert.equal(answer.ok, false)
  assert.equal(host.agentOf('gb').calls.length, 0)
})

test('a coordinator cannot ask privately after creating a task group in the same turn', async t => {
  const host = await start(t, { task: { status: 'active', originBotId: 'a', createdAt: Date.now() + 1000 } })
  host.emit('a', 'turn/start', { turn: 1 })
  const answer = await host.tool('ask_user', { question: 'Budget?', options: [{ label: 'Low' }] }, 'a')
  assert.match(answer, /Post the task there/)
  assert.equal((await host.call('state', {})).value.questions.a, undefined)
})

test('active tool work holds the next employee until its reply finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await start(t)
  const result = host.round('c1', host.say('@Chief 帮忙处理'))
  await settle(() => host.agentOf('ga').calls.length === 1)
  host.begin('ga')
  host.finish('ga', '@Writer @Tester 请依次处理')
  await settle(() => host.agentOf('gb').calls.length === 1)
  assert.equal(host.begin('gb').source.askedBy, 'a')
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'pwsh', arguments: '{}' })
  t.mock.timers.tick(30_000)
  await settle(() => true)
  assert.equal(result(), undefined)
  assert.equal(host.agentOf('gc').calls.length, 0)
  host.emit('gb', 'tool/result', { callId: 'k1' })
  host.finish('gb', '文档已完成。')
  await settle(() => host.agentOf('gc').calls.length === 1)
  assert.match(text(host.begin('gc')), /Writer: 文档已完成/)
  host.finish('gc', '验证完成。')
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['message', 'Chief'], ['message', 'Writer'], ['message', 'Tester']])
  assert.equal(host.agentOf('r1').calls.length, 0)
})

test('a member called while still at earlier work lets the round go on at once', async (t) => {
  const host = await start(t)
  host.emit('gb', 'turn/start', { turn: 1 })
  const result = host.round('c1', host.say('@Writer 再看看这个'))
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['working', 'Writer']])
  // The call waits for the work before it.
  assert.equal(host.agentOf('gb').inbox.nextTurn.length, 1)
})

test('a quick team tool does not let the round go on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await start(t)
  const result = host.round('c1', host.say('@Writer 谁在群里？'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'list_bots', arguments: '{}' })
  t.mock.timers.tick(15_000 * 2)
  await settle(() => true)
  assert.equal(result(), undefined)
  host.finish('gb', 'Chief、Tester 和我。')
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['message', 'Writer']])
})

// Under PTC the model calls run_code, and the program dispatches the real tools.
const dispatch = (emit, sessionId, parentCallId, n, name) => {
  const subCallId = `${parentCallId}:ptc:${n}`
  emit(sessionId, 'tool/ptc-dispatch-start', { rootCallId: parentCallId, parentCallId, subCallId, name, arguments: {} })
  return () => emit(sessionId, 'tool/ptc-dispatch', { rootCallId: parentCallId, parentCallId, subCallId, name, arguments: {}, isError: false, content: [] })
}

test('a PTC program that runs only team tools does not let the round go on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await start(t)
  const result = host.round('c1', host.say('@Writer 群里刚才说了什么？'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'run_code', arguments: '{"code":"await read_group_chat({})"}' })
  dispatch(host.emit, 'gb', 'k1', 1, 'read_group_chat')()
  dispatch(host.emit, 'gb', 'k1', 2, 'list_bots')()
  host.emit('gb', 'tool/result', { callId: 'k1' })
  t.mock.timers.tick(15_000 * 2)
  await settle(() => true)
  assert.equal(result(), undefined)
  host.finish('gb', '在讨论文档的结构。')
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['message', 'Writer']])
})

test('work inside a PTC program keeps its speaking turn', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await start(t)
  const result = host.round('c1', host.say('@Writer 整理文档'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'run_code', arguments: '{}' })
  dispatch(host.emit, 'gb', 'k1', 1, 'read_group_chat')()
  dispatch(host.emit, 'gb', 'k1', 2, 'write')
  const { value } = await host.call('state', {})
  assert.deepEqual(value.work.rooms.r1.map(entry => [entry.botId, entry.tool]), [['b', 'write']])
  t.mock.timers.tick(30_000)
  assert.equal(result(), undefined)
  host.finish('gb', '文档已完成。')
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['message', 'Writer']])
})

test('work the user asked for is left for the user to read, and the user\'s message resets the late limit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = await start(t, { lateRounds: ROOM_LATE_ROUNDS - 1 })
  const first = host.round('c1', host.say('@Writer 整理文档'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'write', arguments: '{}' })
  t.mock.timers.tick(ROOM_REPLY_TIMEOUT_MS)
  await settle(() => first() !== undefined)
  // The user's message resets the limit.
  assert.equal(JSON.parse(readFileSync(join(host.home, 'state.json'), 'utf8')).rooms.r1.lateRounds, 0)
  host.finish('gb', '好了。')
  await settle(() => host.agentOf('r1').calls.length === 1)
  const post = host.takePost()
  assert.deepEqual([post.source.late, post.source.askedBy, post.source.quiet], [true, undefined, undefined])
  const second = host.round('c2', post)
  await settle(() => second() !== undefined)
  assert.deepEqual(second().replies, [])
  assert.deepEqual([host.agentOf('ga').calls.length, host.agentOf('gc').calls.length], [0, 0])
})

test('the late round limit makes a late post quiet', async (t) => {
  const host = await start(t, { lateRounds: ROOM_LATE_ROUNDS })
  host.emit('gb', 'turn/start', { turn: 1 })
  host.emit('gb', 'user/message', { content: [{ type: 'text', text: 'go' }], source: { kind: 'bot', role: 'room', exchangeId: 'x1', roomId: 'r1', hop: 0, askedBy: 'a' } })
  host.finish('gb', '做完了。')
  await settle(() => host.agentOf('r1').calls.length === 1)
  assert.equal(host.takePost().source.quiet, true)
})

test('a reply to a message a group Session sent comes back there, and its turn posts in the group', async (t) => {
  const host = await start(t)
  await host.tool('message_bot', { to: 'Tester', message: '能跑通吗？' }, 'gb')
  assert.deepEqual(host.agentOf('c').calls, [])
  assert.equal(host.begin('gc').source.senderRoomId, 'r1')
  host.finish('gc', 'ok')
  await settle(() => host.agentOf('gb').calls.length === 1)
  assert.deepEqual(host.agentOf('b').calls, [])
  assert.match(text(host.begin('gb')), /^\[Reply from Tester\]\nok/)
  host.finish('gb', 'Tester 说可以，我继续。')
  await settle(() => host.agentOf('r1').calls.length === 1)
  const post = host.takePost()
  assert.deepEqual([post.source.late, text(post)], [true, '[Group post from Writer]\nTester 说可以，我继续。'])
})

test('the user stops a member\'s work in a group, and the group shows it', async (t) => {
  const host = await start(t)
  assert.equal((await host.call('stop-member-work', { roomId: 'r1', botId: 'b' })).value, false)
  host.emit('gb', 'turn/start', { turn: 1 })
  assert.equal((await host.call('stop-member-work', { roomId: 'r1', botId: 'b' })).value, true)
  assert.deepEqual(host.agentOf('gb').cancelled, [{ kind: 'user' }])
  await settle(() => host.agentOf('r1').calls.length === 1)
  const post = host.takePost()
  assert.deepEqual([post.source.stopped, post.source.quiet], [true, true])
  const result = host.round('c1', post)
  await settle(() => result() !== undefined)
  assert.deepEqual(kinds(result()), [['stopped', 'Writer']])
  const log = JSON.parse(readFileSync(join(host.home, 'state.json'), 'utf8')).rooms.r1.log
  assert.deepEqual(log.map(line => [line.who, line.kind]), [['Writer', 'stopped']])
})

test('members still at work show in the team view and in the prompts of the others', async (t) => {
  const host = await start(t)
  host.emit('gb', 'turn/start', { turn: 1 })
  host.emit('gb', 'tool/call', { callId: 'k1', name: 'pwsh', arguments: '{}' })
  const result = host.round('c1', host.say('@Tester 你怎么看'))
  await settle(() => host.agentOf('gc').calls.length === 1)
  assert.match(text(host.agentOf('gc').calls[0]), /Still at work on what they were asked; each posts here when done: Writer \(1 min\)\./)
  host.begin('gc')
  const { value } = await host.call('state', {})
  assert.deepEqual(value.work.rooms.r1.map(entry => [entry.botId, entry.tool, entry.speaking]), [['b', 'pwsh', undefined], ['c', undefined, true]])
  host.finish('gc', '没问题。')
  await settle(() => result() !== undefined)
})

test('only the current public stream appears live, retries replace partial text and steps accumulate', async (t) => {
  const host = await start(t)
  const result = host.round('stream-1', host.say('@Writer 说句话'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  const live = async () => (await host.call('room-progress', { roomId: 'r1' })).value[0]
  const startStream = (id, attemptId) => host.stream(id, { type: 'start', attemptId })
  const chunk = (id, attemptId, index, type, value) => host.stream(id, { type: 'chunk', attemptId, index, chunk: { type, text: value } })
  startStream('b', 'private')
  chunk('b', 'private', 0, 'text-delta', 'private message')
  assert.equal((await live()).streaming, undefined)
  startStream('gb', 'one')
  chunk('gb', 'one', 0, 'reasoning-delta', 'private reasoning')
  chunk('gb', 'one', 1, 'text-delta', 'Hello')
  assert.equal((await live()).streaming.text, 'Hello')
  chunk('gb', 'one', 1, 'text-delta', 'Hello')
  chunk('gb', 'stale', 2, 'text-delta', 'stale')
  assert.equal((await live()).streaming.text, 'Hello')
  host.stream('gb', { type: 'end', attemptId: 'one', outcome: { kind: 'abandoned' } })
  chunk('gb', 'one', 2, 'text-delta', 'late')
  assert.equal((await live()).streaming, undefined)
  startStream('gb', 'two')
  chunk('gb', 'two', 0, 'text-delta', 'First step.')
  host.emit('gb', 'assistant/message', { message: { content: [{ type: 'text', text: 'First step.' }] } })
  host.stream('gb', { type: 'end', attemptId: 'two', outcome: { kind: 'committed', eventType: 'assistant/message', seq: 1 } })
  startStream('gb', 'three')
  chunk('gb', 'three', 0, 'text-delta', 'Final')
  assert.equal((await live()).streaming.text, 'First step.\n\nFinal')
  chunk('gb', 'three', 1, 'text-delta', ' answer.')
  assert.equal((await live()).streaming.text, 'First step.\n\nFinal answer.')
  assert.equal(result(), undefined)
  host.finish('gb', 'Final answer.')
  await settle(() => result() !== undefined)
  assert.equal(result().replies[0].text, 'First step.\n\nFinal answer.')
  assert.deepEqual((await host.call('room-progress', { roomId: 'r1' })).value, [])
})

test('a collaborative task ends with one admin summary without calling employees again', async (t) => {
  const host = await start(t)
  const result = host.round('summary', host.say('@Writer @Tester 完成分析报告'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.finish('gb', '分析结果。')
  await settle(() => host.agentOf('gc').calls.length === 1)
  assert.equal(host.agentOf('ga').calls.length, 0)
  host.begin('gc')
  host.finish('gc', '验证结果。')
  await settle(() => host.agentOf('ga').calls.length === 1)
  const prompt = text(host.begin('ga'))
  assert.match(prompt, /Summarize the completed employee contributions/)
  assert.match(prompt, /Writer: 分析结果/)
  assert.match(prompt, /Tester: 验证结果/)
  host.finish('ga', '汇总结果。@Writer 不应再触发')
  await settle(() => result() !== undefined)
  assert.deepEqual(result().replies.map(reply => reply.botId), ['b', 'c', 'a'])
  assert.equal(host.agentOf('gb').calls.length, 1)
})

test('casual discussion does not add a summary call', async (t) => {
  const host = await start(t)
  const result = host.round('casual', host.say('@Writer @Tester 大家好'))
  await settle(() => host.agentOf('gb').calls.length === 1)
  host.begin('gb')
  host.finish('gb', '你好！')
  await settle(() => host.agentOf('gc').calls.length === 1)
  host.begin('gc')
  host.finish('gc', '早上好！')
  await settle(() => result() !== undefined)
  assert.deepEqual(result().replies.map(reply => reply.botId), ['b', 'c'])
  assert.equal(host.agentOf('ga').calls.length, 0)
})
