import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createRuntime } from '../index.js'
import { fakeContext } from './fake-ctx.js'
import { createCanvasState, groupWindows, openWindow, reconcileCanvas, setCanvasSelection } from '../src/client/canvas-state.js'

function team() {
  return {
    version: 1, organizationVersion: 1, revision: 1, whaleStored: true,
    mainBotIds: ['chief', 'partner'], generalAssistantId: 'chief',
    bots: {
      chief: { id: 'chief', sessionId: 'chief', name: 'Chief', generalAssistant: true, teamId: null },
      writer: { id: 'writer', sessionId: 'writer-now', name: 'Writer', teamId: null, segments: [{ sessionId: 'writer-old', endedAt: 1 }] },
      designer: { id: 'designer', sessionId: 'designer', name: 'Designer', teamId: null },
      partner: { id: 'partner', sessionId: 'partner', name: 'Partner', teamId: 'research' },
      researcher: { id: 'researcher', sessionId: 'researcher', name: 'Researcher', teamId: 'research' },
      leader: { id: 'leader', sessionId: 'leader', name: 'Lead', teamId: 'local' },
      local: { id: 'local', sessionId: 'local', name: 'Local', teamId: 'local' },
      legacy: { id: 'legacy', sessionId: 'legacy', name: 'Legacy', ownerId: 'chief' },
    },
    teams: {
      research: { id: 'research', name: 'Research', purpose: 'Research', leaderId: 'partner', members: ['partner', 'researcher'] },
      local: { id: 'local', name: 'Local', purpose: 'Local', leaderId: 'leader', members: ['leader', 'local'] },
    },
    rooms: {
      room: { id: 'room', name: 'Work', named: true, members: ['chief', 'writer', 'designer'], admin: 'writer', mode: 'admin',
        sessions: { chief: 'group-chief', writer: 'group-writer' }, segments: { writer: [{ sessionId: 'group-writer-old', endedAt: 1 }] }, seq: 1,
        log: [{ seq: 1, botId: 'writer', name: 'Writer', text: 'Saved result', time: 1 }] },
    },
    questions: { writer: {}, 'writer-now': {}, 'writer-old': {}, 'group-writer': {}, 'group-writer-old': {} },
    exchangeTurns: { writer: [1], 'writer-now': [2], 'writer-old': [3], 'group-writer': [4], 'group-writer-old': [5] }, exchanges: [],
  }
}

function start(seed = team()) {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-delete-'))
  writeFileSync(join(home, 'state.json'), JSON.stringify(seed))
  const archived = []
  const ctx = fakeContext()
  Object.assign(ctx, {
    llm: { listProviders: () => [] }, sessions: { flush: async () => {} },
    sessionController: { resolveAgent: async id => ({ agent: { session: { id, seq: 1 } } }) },
    sessionTitle: { rename: async () => {} },
    workspaceRegistry: { archiveSession: async (id, options) => { archived.push([id, options]) } },
  })
  const rt = createRuntime(ctx, { home })
  const tool = (args, sessionId = 'chief') => ctx.registeredTools.get('delete_bot').execute(args, { agent: { id: sessionId } })
  const saved = () => JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'))
  const stop = async () => { await ctx.dispose(); rmSync(home, { recursive: true, force: true, maxRetries: 5 }) }
  return { rt, ctx, tool, saved, archived, stop }
}

test('a Main Bot deletes explicitly selected employees from its group identity using the existing cleanup', async t => {
  const app = start()
  t.after(app.stop)
  const memories = [], secrets = []
  app.rt.archiveBotMemory = async id => { memories.push(id) }
  app.rt.forgetBotSecrets = async id => { secrets.push(id) }
  const result = await app.tool({ bot: 'Writer', user_requested: true }, 'group-chief')
  assert.match(result, /^Deleted Writer\./)
  const state = app.saved()
  assert.equal(state.bots.writer, undefined)
  assert.deepEqual(state.rooms.room.members, ['chief', 'designer'])
  assert.equal(state.rooms.room.admin, null)
  assert.equal(state.rooms.room.sessions.writer, undefined)
  assert.equal(state.rooms.room.segments.writer, undefined)
  assert.equal(state.rooms.room.log[0].text, 'Saved result')
  assert.equal(state.rooms.room.log[0].name, 'Writer', 'historical group replies remain readable')
  for (const id of ['writer', 'writer-now', 'writer-old', 'group-writer', 'group-writer-old']) {
    assert.equal(state.questions[id], undefined)
    assert.equal(state.exchangeTurns[id], undefined)
  }
  assert.deepEqual(memories, ['writer'])
  assert.deepEqual(secrets, ['writer'])
  assert.deepEqual(app.archived.map(([id]) => id).sort(), ['group-writer', 'group-writer-old', 'writer', 'writer-now', 'writer-old'].sort())
  assert.ok(app.archived.every(([, options]) => options.stopActivity === true))
  assert.equal(app.rt.selfOf('writer-now'), undefined)
  assert.equal(app.rt.selfOf('group-writer'), undefined)

  assert.match(await app.tool({ bot: 'Designer', user_requested: true }), /^Deleted Designer\./)
  assert.equal(app.saved().bots.designer, undefined, 'multiple named employees can be cleared with one call per target')
  assert.ok(app.saved().rooms.room, 'deleting employees does not delete their collaboration groups')
})

test('delete_bot requires explicit user intent and refuses unknown, self, Main Bot and foreign targets without mutation', async t => {
  const app = start()
  t.after(app.stop)
  await app.rt.load()
  const before = app.saved()
  for (const flag of [undefined, false]) {
    await assert.rejects(app.tool({ bot: 'Writer', ...(flag === undefined ? {} : { user_requested: flag }) }), /user explicitly requests|user_requested/)
  }
  for (const [bot, pattern] of [['Nobody', /No Bot named Nobody/], ['Chief', /cannot delete yourself/],
    ['Partner', /Another Main Bot is independent/], ['Researcher', /managed by Partner/], ['Local', /managed by Lead/]]) {
    await assert.rejects(app.tool({ bot, user_requested: true }), pattern)
  }
  assert.deepEqual(app.saved(), before)
  assert.deepEqual(app.archived, [])
})

test('an employee, ordinary session and group admin receive no deletion rights, while legacy owned employees can be deleted', async t => {
  const app = start()
  t.after(app.stop)
  for (const session of ['designer', 'leader', 'stranger', 'group-writer']) {
    await assert.rejects(app.tool({ bot: 'Legacy', user_requested: true }, session), /Only an active Main Bot/)
  }
  await assert.rejects(app.tool({ bot: 'Writer', user_requested: true }, 'partner'), /employee is independent/)
  assert.match(await app.tool({ bot: 'Legacy', user_requested: true }), /^Deleted Legacy\./)
  assert.equal(app.saved().bots.legacy, undefined)
})

test('an owning Main Bot can remove a team member but never bypass leadership or Main Bot protection', async t => {
  const seed = team()
  seed.mainBotIds.push('leader')
  seed.bots.ownedLead = { id: 'ownedLead', sessionId: 'ownedLead', name: 'OwnedLead', ownerId: 'chief' }
  seed.teams.owned = { id: 'owned', name: 'Owned', purpose: 'Owned', leaderId: 'ownedLead', members: ['ownedLead'] }
  const app = start(seed)
  t.after(app.stop)
  assert.match(await app.tool({ bot: 'Local', user_requested: true }, 'leader'), /^Deleted Local\./)
  assert.deepEqual(app.saved().teams.local.members, ['leader'])
  await assert.rejects(app.tool({ bot: 'OwnedLead', user_requested: true }), /Hand over team leadership/)
  await assert.rejects(app.tool({ bot: 'Lead', user_requested: true }), /Another Main Bot is independent/)
  assert.ok(app.saved().bots.ownedLead)
  assert.ok(app.saved().bots.leader)
})

test('delete_bot respects read-only state and does not claim success if the existing deletion fails', async t => {
  const app = start()
  t.after(app.stop)
  await app.rt.load()
  const before = app.saved()
  const readOnly = app.rt.readOnly
  app.rt.readOnly = () => 'The team is read-only'
  await assert.rejects(app.tool({ bot: 'Writer', user_requested: true }), /read-only/)
  assert.deepEqual(app.saved(), before)
  assert.deepEqual(app.archived, [])
  app.rt.readOnly = readOnly
  app.rt.deleteBot = async () => { throw new Error('Test delete failed') }
  await assert.rejects(app.tool({ bot: 'Writer', user_requested: true }), /Test delete failed/)
  assert.deepEqual(app.saved(), before)
})

test('deletion archives historical group parts even after the employee has left the group', async t => {
  const seed = team()
  seed.rooms.room.members = seed.rooms.room.members.filter(id => id !== 'writer')
  seed.rooms.room.admin = null
  delete seed.rooms.room.sessions.writer
  const app = start(seed)
  t.after(app.stop)
  await app.tool({ bot: 'Writer', user_requested: true })
  assert.ok(app.archived.some(([id]) => id === 'group-writer-old'))
  assert.equal(app.saved().rooms.room.segments.writer, undefined)
})

test('a failed group archive is reported and does not prevent the remaining parts from being stopped', async t => {
  const app = start()
  t.after(app.stop)
  const archive = app.ctx.workspaceRegistry.archiveSession
  app.ctx.workspaceRegistry.archiveSession = async (id, options) => {
    await archive(id, options)
    if (id === 'group-writer') throw new Error('Test archive failed')
  }
  await assert.rejects(app.tool({ bot: 'Writer', user_requested: true }), /removed from the roster, but some conversations could not be archived: group-writer: Test archive failed/)
  assert.equal(app.saved().bots.writer, undefined)
  assert.ok(app.archived.some(([id]) => id === 'group-writer-old'), 'a failed current group archive must not skip historical parts')
  assert.equal(app.archived.length, 5)
})

test('the existing canvas reconciliation removes deleted employee windows, selection and group references', async t => {
  const app = start()
  t.after(app.stop)
  let canvas = createCanvasState()
  for (const id of ['chief', 'writer']) canvas = openWindow(canvas, { id, kind: 'bot' })
  canvas = groupWindows(setCanvasSelection(canvas, canvas.windows.map(window => window.id)))
  assert.equal(canvas.groups.length, 1)
  await app.tool({ bot: 'Writer', user_requested: true })
  const state = app.saved()
  const next = reconcileCanvas(canvas, { ready: true, bots: Object.values(state.bots), rooms: Object.values(state.rooms) })
  assert.deepEqual(next.windows.map(window => window.entityId), ['chief'])
  assert.deepEqual(next.groups, [])
  assert.equal(next.selected.some(id => id.includes('writer')), false)
  assert.equal(next.active.includes('writer'), false)
})

test('Main Bot instructions distinguish explicit deletion from retirement and ordinary cleanup', async t => {
  const app = start()
  t.after(app.stop)
  await app.rt.load()
  const text = app.ctx.sections.get('bot-identity').text({ agent: { id: 'chief' } })
  assert.match(text, /call delete_bot with user_requested true once per employee/)
  assert.match(text, /without creating a task group or asking to confirm/)
  assert.match(text, /substitute temporary retirement for deletion/)
  assert.doesNotMatch(app.ctx.sections.get('bot-identity').text({ agent: { id: 'designer' } }), /call delete_bot/)
})
