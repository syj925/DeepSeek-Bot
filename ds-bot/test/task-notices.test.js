import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { install } from '../src/host/task-notices.js'
import { createTaskNotices } from '../src/client/task-notice-state.js'
import { openTaskFile } from '../src/client/task-notice-navigation.js'
import { createSource } from '../src/client/sources.js'

const notice = (id, at = 200) => ({ id, at, botId: 'b', targetId: 'b', sessionId: 'b', name: 'Writer', title: 'Report', summary: 'Report checked.', files: [] })
function memory() {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
}
function host() {
  let tool, saves = 0
  const entry = { turn: 1 }, bots = { b: { id: 'b', name: 'Writer' }, a: { id: 'a' } }, rooms = { r: { admin: 'a' } }
  const rt = { state: { questions: {} }, live: new Map([['b', entry]]), groupOwners: new Map(), ctx: { tools: { register: value => { tool = value } } }, botOf: id => bots[id], selfOf: id => id, roomOf: id => rooms[id], save: async () => { saves++ }, warn() {} }
  install(rt)
  return { rt, entry, rooms, saves: () => saves, report: (args = {}) => tool.execute({ title: 'Report', summary: 'Checked and delivered.', ...args }, { agent: { id: 'b' } }), finish: (values = {}) => rt.finishTaskNotice(entry, { reason: { kind: 'completed' }, id: 'b', ...values }) }
}

test('a declaration only publishes after successful finish, at most once', async () => {
  const h = host()
  h.finish()
  assert.equal(h.rt.state.taskNotices, undefined, 'ordinary replies do not complete tasks')
  await h.report()
  assert.equal(h.rt.state.taskNotices, undefined)
  h.finish(); h.finish()
  assert.equal(h.rt.state.taskNotices.length, 1)
  assert.equal(h.saves(), 1)
})

test('failed, aborted, retried, switched and approval-blocked work never publishes', async () => {
  for (const args of [{ reason: { kind: 'error' } }, { reason: { kind: 'aborted' } }, { retry: true }, { switched: true }, { question: true }, { approval: true }]) {
    const h = host()
    await h.report()
    if (args.question) h.rt.state.questions.b = {}
    if (args.approval) h.rt.approvalsView = () => [{ sessionId: 'b' }]
    h.finish(args)
    assert.equal(h.rt.state.taskNotices, undefined)
    assert.equal(h.entry.completion, undefined)
  }
})

test('a final outward reply automatically notifies once per turn without a completion tool', () => {
  const h = host()
  const final = { turn: 1, opened: true, lastText: ' Here is\n the answer. ' }
  h.finish(final); h.finish(final)
  assert.equal(h.rt.state.taskNotices.length, 1)
  assert.equal(h.rt.state.taskNotices[0].kind, 'message')
  assert.equal(h.rt.state.taskNotices[0].summary, 'Here is the answer.')
  assert.equal(h.rt.state.taskNotices[0].targetId, 'b')
  h.finish({ ...final, turn: 2 })
  assert.equal(h.rt.state.taskNotices.length, 2)
})

test('automatic messages exclude internal handoffs, unfinished work and empty or tool-only output', () => {
  for (const overrides of [
    { opened: false }, { lastText: '' }, { lastText: '   ' }, { lastCalled: true },
    { reason: { kind: 'error' } }, { reason: { kind: 'aborted' } }, { retry: true }, { switched: true },
    { info: { role: 'request', audience: 'sender' } }, { info: { role: 'handoff' } },
  ]) {
    const h = host()
    h.finish({ turn: 1, opened: true, lastText: 'Reply', ...overrides })
    assert.equal(h.rt.state.taskNotices, undefined, JSON.stringify(overrides))
  }
  for (const blocked of ['question', 'approval']) {
    const h = host()
    if (blocked === 'question') h.rt.state.questions.b = {}
    else h.rt.approvalsView = () => [{ sessionId: 'b' }]
    h.finish({ turn: 1, opened: true, lastText: 'Reply' })
    assert.equal(h.rt.state.taskNotices, undefined)
  }
})

test('outward relays and group member replies notify the right conversation', () => {
  for (const info of [{ role: 'reply' }, { role: 'retry' }, { role: 'report' }, { role: 'request', audience: 'user' }, { role: 'handoff', resume: true }]) {
    const h = host()
    h.finish({ turn: 1, info, lastText: 'Reply' })
    assert.equal(h.rt.state.taskNotices[0].kind, 'message')
  }
  const h = host()
  h.rt.groupOwners.set('b', { roomId: 'r' })
  h.finish({ turn: 1, info: { role: 'room' }, lastText: '[pass]' })
  assert.equal(h.rt.state.taskNotices, undefined, 'passing a group turn is not a new message')
  h.finish({ turn: 1, info: { role: 'room' }, lastText: 'Group reply' })
  assert.equal(h.rt.state.taskNotices[0].targetId, 'r')
  assert.equal(h.rt.state.taskNotices[0].sessionId, 'b')
  delete h.rooms.r
  h.finish({ turn: 2, info: { role: 'room' }, lastText: 'Stale reply' })
  assert.equal(h.rt.state.taskNotices.length, 1)
})

test('an explicit deliverable takes precedence over an automatic message', async () => {
  const h = host()
  await h.report()
  const final = { turn: 1, opened: true, lastText: 'Your report is ready.' }
  h.finish(final); h.finish(final)
  assert.equal(h.rt.state.taskNotices.length, 1)
  assert.equal(h.rt.state.taskNotices[0].title, 'Report')
  assert.notEqual(h.rt.state.taskNotices[0].kind, 'message')
})

test('internal delegation and non-coordinating group members are suppressed', async () => {
  const h = host()
  h.entry.info = { role: 'request', audience: 'sender' }
  assert.match(await h.report(), /Internal work/)
  h.finish()
  h.rt.groupOwners.set('b', { roomId: 'r' })
  assert.match(await h.report(), /Internal work/)
  h.rooms.r.admin = 'b'
  await h.report(); h.finish()
  assert.equal(h.rt.state.taskNotices.length, 1)
  assert.equal(h.rt.state.taskNotices[0].targetId, 'r')
})

test('user-facing assigned work can finish, and group removal prevents a stale delivery', async () => {
  const h = host()
  h.entry.info = { role: 'request', audience: 'user' }
  await h.report(); h.finish()
  h.rt.groupOwners.set('b', { roomId: 'r' }); h.rooms.r.admin = 'b'
  await h.report(); delete h.rooms.r; h.finish()
  assert.equal(h.rt.state.taskNotices.length, 1)
})

test('final files must exist, and validation cannot attach to the next turn', async () => {
  const home = mkdtempSync(join(tmpdir(), 'bot-notice-'))
  try {
    const path = join(home, 'report.txt'); writeFileSync(path, 'Delivered')
    const h = host()
    await assert.rejects(h.report({ files: ['relative.txt'] }), /absolute/)
    await assert.rejects(h.report({ files: [join(home, 'missing')] }), /not available/)
    await assert.rejects(h.report({ files: [home] }), /not available/)
    await h.report({ files: [path, path] }); h.finish()
    assert.deepEqual(h.rt.state.taskNotices[0].files, [{ path, name: 'report.txt' }])
    const pending = h.report({ files: [path] })
    h.entry.turn = 2
    await assert.rejects(pending, /no longer running/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('history is bounded and failed persistence removes the unpublished record', async () => {
  const h = host()
  h.rt.state.taskNotices = Array.from({ length: 100 }, (_, i) => notice(String(i)))
  await h.report(); h.finish()
  assert.equal(h.rt.state.taskNotices.length, 100)
  assert.equal(h.rt.state.taskNotices[0].id, '1')
  h.rt.save = async () => { throw new Error('disk full') }
  await h.report(); h.finish()
  await Promise.resolve()
  assert.equal(h.rt.state.taskNotices.length, 99)
})

test('old history is retained, fresh notices deduplicate across polls and reload', () => {
  const storage = memory(), state = createTaskNotices({ storage, since: 100 })
  state.receive([notice('old', 50)])
  assert.equal(state.getSnapshot().items.length, 1)
  assert.deepEqual(state.getSnapshot().toasts, [])
  state.receive([notice('old', 50), notice('new')])
  const snapshot = state.getSnapshot()
  state.receive([notice('old', 50), notice('new')])
  assert.equal(state.getSnapshot(), snapshot, 'identical polling must not rerender the UI')
  assert.deepEqual(snapshot.toasts, ['new'])
  const reload = createTaskNotices({ storage, since: 100 })
  reload.receive([notice('new')])
  assert.deepEqual(reload.getSnapshot().toasts, [])
})

test('visible reading marks complete as read; background bursts use one native notice', () => {
  const page = { visibilityState: 'visible' }, sent = [], storage = memory()
  const state = createTaskNotices({ storage, since: 100, page, reading: () => true, systemNotify: (...values) => sent.push(values) })
  state.receive([notice('one')])
  assert.deepEqual(state.getSnapshot().read, ['one'])
  assert.deepEqual(state.getSnapshot().toasts, [])
  page.visibilityState = 'hidden'
  state.receive([notice('one'), notice('two'), notice('three')])
  assert.equal(sent.length, 1)
  assert.equal(sent[0][1], 2)
  assert.deepEqual(state.getSnapshot().toasts, ['two', 'three'])
})

test('notification controls keep history and unread state when popups are disabled', () => {
  const state = createTaskNotices({ storage: memory(), since: 100 })
  state.configure({ enabled: false })
  state.receive([notice('one')])
  assert.deepEqual(state.getSnapshot().toasts, [])
  assert.equal(state.getSnapshot().items.length, 1)
  state.configure({ enabled: true })
  state.receive([notice('one'), notice('two')])
  state.dismiss(['two'])
  assert.deepEqual(state.getSnapshot().read, [])
  state.markRead('one')
  state.toggle(); assert.equal(state.getSnapshot().open, true)
  state.close(); state.markAllRead()
  assert.deepEqual(state.getSnapshot().read, ['two', 'one'])
})

test('an unfocused visible window is background work, not an actively read conversation', () => {
  const sent = []
  const state = createTaskNotices({ storage: memory(), since: 100, page: { visibilityState: 'visible', hasFocus: () => false }, reading: () => true, systemNotify: item => sent.push(item.id) })
  state.receive([notice('one')])
  assert.deepEqual(state.getSnapshot().read, [])
  assert.deepEqual(state.getSnapshot().toasts, ['one'])
  assert.deepEqual(sent, ['one'])
})

test('unavailable native notifications and audio do not break history', () => {
  const state = createTaskNotices({ storage: memory(), since: 100, page: { visibilityState: 'hidden' }, systemNotify() { throw new Error('denied') }, sound() { throw new Error('denied') } })
  state.configure({ sound: true })
  state.receive([null, {}, notice('one')])
  assert.equal(state.getSnapshot().items.length, 1)
  assert.deepEqual(state.getSnapshot().toasts, ['one'])
})

test('file navigation waits for the right session and cleans subscriptions', async () => {
  const mounted = createSource(undefined), opened = []
  const sidebar = { mounted, openResource: address => opened.push(address) }
  await openTaskFile({ sidebar, sessionId: 'room', sourceSessionId: 'worker', path: 'C:\\Results\\file name.txt', navigate: () => { queueMicrotask(() => mounted.set('room')) } })
  assert.equal(opened.length, 1)
  assert.match(opened[0], /^dsh-resource:\/\/file\//)
  mounted.set(undefined)
  await assert.rejects(openTaskFile({ sidebar, sessionId: 'room', sourceSessionId: 'worker', path: '/file', navigate() {}, timeout: 5 }), /did not open/)
  mounted.set('room')
  assert.equal(opened.length, 1, 'timed-out navigation must not fire later')
})
