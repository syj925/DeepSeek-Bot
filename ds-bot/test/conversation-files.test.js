import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { install, sharedFilePaths } from '../src/host/conversation-files.js'

test('shared paths support Chinese, spaces, Markdown and Windows paths without remote links', () => {
  assert.deepEqual(sharedFilePaths('路径：C:\\工作区\\outputs\\报告.md'), ['C:\\工作区\\outputs\\报告.md'])
  assert.deepEqual(sharedFilePaths('[报告](<C:/My Work/报告 (1).md>) and `outputs/报告.md`'), ['C:/My Work/报告 (1).md', 'outputs/报告.md'])
  assert.deepEqual(sharedFilePaths('[报告](outputs/report(1).md) https://example.com/report.md'), ['outputs/report(1).md'])
  assert.deepEqual(sharedFilePaths('```text\noutputs/report.md\n```'), ['outputs/report.md'])
  assert.deepEqual(sharedFilePaths('`//server/share/report.md` `outputs/.git/readme.md` [remote](https://example.com/a.md)'), [])
})

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'qibit-files-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const folders = Object.fromEntries(['private', 'group', 'other'].map(id => [id, join(root, id)]))
  await Promise.all(Object.values(folders).map(path => mkdir(path)))
  const bots = { b: { id: 'b', sessionId: 'private', name: 'Writer' } }
  const rooms = { r: { id: 'r', name: 'Group', sessions: { b: 'group' }, log: [], seq: 0, task: { status: 'active' } } }
  const history = {}, counters = { scans: 0, saves: 0 }
  const rt = { state: { conversationFiles: [], taskNotices: [] }, botOf: id => bots[id], roomOf: id => rooms[id],
    selfOf: id => ['private', 'old'].includes(id) ? 'b' : undefined,
    groupOwners: new Map([['group', { roomId: 'r', botId: 'b' }]]), pastOwners: new Map(),
    resolveAgent: async id => ({ session: { header: { cwd: folders[id] }, seq: history[id]?.length ?? 0 } }),
    partsOf: () => [{ sessionId: 'private' }],
    eventsBackwards: async function* (id) { counters.scans++; yield* [...(history[id] ?? [])].reverse() },
    save: async () => { counters.saves++ }, readOnly: () => false,
  }
  install(rt)
  return { rt, root, folders, rooms, bots, history, counters,
    file: async (where, name = 'report.md') => { const path = join(folders[where], name); await writeFile(path, '# Report'); return path } }
}
const answer = text => ({ type: 'assistant/message', time: 200, data: { message: { content: [{ type: 'text', text }] } } })
const trigger = source => ({ type: 'user/message', time: 100, data: { source } })

test('active group backfills shared files and missing paths with worker source; user paths and other groups stay out', async t => {
  const f = await fixture(t), path = await f.file('group')
  f.rooms.r.log = [{ botId: 'b', text: '`report.md` and `missing.md`', seq: 1 }, { text: '`input.md`', seq: 2 }, { botId: 'b', file: false, text: '`question.md`', seq: 3 }]
  const result = await f.rt.conversationFiles('r')
  assert.equal(result.partial, false)
  assert.equal(result.files.length, 2)
  assert.equal(result.files.find(item => item.available).path, path)
  assert.equal(result.files.find(item => item.available).sessionId, 'group')
  assert.equal(result.files.find(item => !item.available).name, 'missing.md')
  assert.equal(f.rooms.r.task.status, 'active')
  assert.equal((await f.rt.conversationFiles('private')).files.length, 0)
  await assert.rejects(f.rt.conversationFiles('group'), /no longer available/)
})

test('private backfill excludes internal assignments, missing triggers and user-supplied paths', async t => {
  const f = await fixture(t)
  await f.file('private', 'own.md'); await f.file('private', 'internal.md')
  f.history.private = [answer('`unclassified.md`'), trigger({ kind: 'user' }), answer('`own.md`'),
    trigger({ kind: 'bot', role: 'request', audience: 'sender' }), answer('`internal.md`'),
    trigger({ kind: 'bot', role: 'handoff' }), answer('`handoff.md`')]
  const result = await f.rt.conversationFiles('b')
  assert.deepEqual(result.files.map(item => item.name), ['own.md'])
  await f.rt.conversationFiles('b')
  assert.equal(f.counters.scans, 1, 'unchanged histories use bounded caching')
})

test('a recorded group file survives log rollover, employee context reset and a missing source session', async t => {
  const f = await fixture(t), path = await f.file('group')
  await f.rt.recordConversationFiles({ targetId: 'r', roomId: 'r', botId: 'b', sessionId: 'group', text: '`report.md`', at: 300 })
  f.rooms.r.sessions.b = 'new-context'
  f.rt.resolveAgent = async () => { throw new Error('archived') }
  const result = await f.rt.conversationFiles('r')
  assert.equal(result.files[0].path, path)
  assert.equal(result.files[0].sessionId, 'group')
  assert.equal(result.files[0].available, true)
})

test('automatic discovery rejects traversal and symlink escape, but checks explicit completion files', async t => {
  const f = await fixture(t), outside = await f.file('other')
  await symlink(f.folders.other, join(f.folders.group, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  f.rooms.r.log = [{ botId: 'b', text: '`../other/report.md` `linked/report.md`', seq: 1 }]
  assert.equal((await f.rt.conversationFiles('r')).files.length, 0)
  f.rt.state.taskNotices.push({ targetId: 'r', roomId: 'r', sessionId: 'group', at: 100, files: [{ path: outside }] })
  assert.equal((await f.rt.conversationFiles('r', { force: true })).files[0].path, outside)
})

test('file deletion, later creation and updates are rechecked without duplicating one delivered path', async t => {
  const f = await fixture(t), path = await f.file('group')
  f.rooms.r.log = [{ botId: 'b', text: '`report.md`', seq: 1 }]
  f.rooms.r.task.result = { files: [{ path }], title: 'Complete' }
  f.rooms.r.task.completedAt = 500
  const first = await f.rt.conversationFiles('r')
  assert.equal(first.files.length, 1)
  assert.equal(first.files[0].sessionId, 'group', 'worker source wins over group completion fallback')
  await rm(path)
  assert.equal((await f.rt.conversationFiles('r', { force: true })).files[0].available, false)
  await writeFile(path, '# A revised report with more content')
  const updated = (await f.rt.conversationFiles('r', { force: true })).files[0]
  assert.equal(updated.available, true)
  assert.ok(updated.size > first.files[0].size)
})

test('overlapping requests share one history scan and a read-only host does not save discoveries', async t => {
  const f = await fixture(t)
  await f.file('private')
  f.history.private = [trigger({ kind: 'user' }), answer('`report.md`')]
  await Promise.all([f.rt.conversationFiles('private'), f.rt.conversationFiles('b')])
  assert.equal(f.counters.scans, 1)
  f.rt.readOnly = () => true
  await f.rt.recordConversationFiles({ targetId: 'b', sessionId: 'private', text: '`report.md`' })
  assert.equal(f.counters.saves, 0)
  assert.equal(resolve(f.folders.private, 'report.md'), (await f.rt.conversationFiles('b')).files[0].path)
})
