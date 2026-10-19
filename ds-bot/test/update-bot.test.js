import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createRuntime } from '../index.js'
import { fakeContext } from './fake-ctx.js'

const TEAM = {
  version: 1,
  mainBotIds: ['m1'],
  revision: 1,
  whaleStored: true,
  bots: {
    m1: { id: 'm1', sessionId: 'm1', name: 'Chief', role: 'Chief of Staff', model: 'deepseek/v4', instructions: '', createdAt: 1 },
    b2: { id: 'b2', sessionId: 'b2', name: 'Writer', role: '写作', model: 'deepseek/v4', instructions: '', createdAt: 2 },
    b3: { id: 'b3', sessionId: 'b3', name: 'Coder', role: '代码', instructions: '', createdAt: 3 },
  },
  rooms: {
    r1: {
      id: 'r1', name: 'Launch', named: true, members: ['b2', 'b3'], admin: 'b3', mode: 'everyone', notice: '', sessions: { b3: 'g3' },
      seq: 0,
      log: [],
    },
  },
  exchanges: [],
  exchangeTurns: {},
  questions: {},
}

function start({ seed = TEAM, providers = { deepseek: ['v4', 'v4-pro'] }, reasoning = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'ds-bot-update-'))
  if (!existsSync(join(home, 'state.json'))) writeFileSync(join(home, 'state.json'), JSON.stringify(seed))
  let profileDefault = { provider: 'deepseek', model: 'v4' }
  const selected = []
  const ctx = fakeContext({ services: { agentDefaultModel: {
    currentSelection: () => ({ ...profileDefault }),
    saveSelection: async next => { profileDefault = { ...next } },
  } } })
  Object.assign(ctx, {
    llm: {
      listProviders: () => Object.keys(providers).map(id => ({ id })),
      listModels: async provider => providers[provider].map(id => ({ id })),
      resolveModelInfo: async (provider, model) => reasoning[`${provider}/${model}`] ?? {},
    },
    sessionController: {
      resolveAgent: async sessionId => ({ agent: { session: { id: sessionId, seq: 1 } } }),
      selectModel: async choice => {
        selected.push(choice)
        profileDefault = { provider: choice.provider, model: choice.model }
      },
    },
    sessionTitle: { rename: async () => {} },
    sessions: { flush: async () => {} },
    workspaceRegistry: { archiveSession: async () => {} },
  })
  const rt = createRuntime(ctx, { home })
  const tool = (name, args, sessionId) => ctx.registeredTools.get(name).execute(args, { agent: { id: sessionId } })
  const state = () => JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'))
  const stop = async () => {
    await ctx.dispose()
    rmSync(home, { recursive: true, force: true, maxRetries: 5 })
  }
  return { ctx, rt, tool, state, selected, profileDefault: () => ({ ...profileDefault }), stop }
}

test('a Bot changes itself by leaving out bot, or by naming itself', async (t) => {
  const { tool, state, stop } = start()
  t.after(stop)
  assert.equal(await tool('update_bot', { name: 'King', instructions: 'Lead the team' }, 'b2'), 'Updated King.')
  const king = state().bots.b2
  assert.equal(king.name, 'King')
  assert.equal(king.instructions, 'Lead the team')
  // Its current name resolves to it again.
  assert.equal(await tool('update_bot', { bot: 'King', role: '掌门' }, 'b2'), 'Updated King.')
  assert.equal(state().bots.b2.role, '掌门')
})

test('a Bot cannot change another Bot; a Main Bot can', async (t) => {
  const { tool, state, stop } = start()
  t.after(stop)
  assert.match(await tool('update_bot', { bot: 'Chief', role: 'boss' }, 'b2'), /^Only a Main Bot can change another Bot/)
  assert.equal(state().bots.m1.role, 'Chief of Staff')
  assert.equal(await tool('update_bot', { bot: 'Writer', role: '主笔' }, 'm1'), 'Updated Writer.')
  assert.equal(state().bots.b2.role, '主笔')
  assert.match(await tool('update_bot', { bot: 'Nobody' }, 'm1'), /^No Bot named Nobody/)
})

test('a group Session changes its own Bot; a Session outside the team changes nothing', async (t) => {
  const { tool, state, stop } = start()
  t.after(stop)
  assert.equal(await tool('update_bot', { instructions: 'Ship the fix' }, 'g3'), 'Updated Coder.')
  assert.equal(state().bots.b3.instructions, 'Ship the fix')
  assert.equal(await tool('update_bot', { name: 'King' }, 'stranger'), 'Only Bots on the team can use update_bot.')
})

test('every Bot sees the update_bot rule in its identity section', async (t) => {
  const { ctx, tool, stop } = start()
  t.after(stop)
  // The first load indexes the Sessions; without it selfOf finds no Bot.
  await tool('list_bots', {}, 'b2')
  const text = ctx.sections.get('bot-identity').text({ agent: { id: 'b2' } })
  assert.match(text, /update_bot changes your own settings/)
  assert.match(ctx.sections.get('bot-identity').text({ agent: { id: 'm1' } }), /update_bot changes your own settings/)
  for (const sessionId of ['b2', 'g3', 'm1']) {
    const rules = ctx.sections.get('bot-identity').text({ agent: { id: sessionId } })
    assert.match(rules, /model_user_requested true/)
    assert.match(rules, /without creating a task group or asking the user to confirm/)
    assert.match(rules, /Ordinary delegated work omits model and preserves the employee model/)
  }
})

test('a supervisor saves a user-requested subordinate model and reports the old and new choice', async t => {
  const seed = structuredClone(TEAM)
  seed.bots.b2.createdBy = 'm1'
  seed.rooms.r1.members.push('m1')
  seed.rooms.r1.sessions.m1 = 'gm'
  seed.rooms.r1.sessions.b2 = 'gw'
  const app = start({ seed })
  t.after(app.stop)
  await app.tool('list_bots', {}, 'm1')
  const otherBefore = app.state().bots.b3
  const result = await app.tool('update_bot', { bot: 'Writer', model: 'v4-pro', model_user_requested: true }, 'gm')
  assert.match(result, /Updated Writer\. Saved model: deepseek\/v4 -> deepseek\/v4-pro\./)
  assert.match(result, /subsequent turns and newly queued tasks/)
  assert.match(result, /running turns and tasks already queued with a captured model keep that route/)
  assert.match(result, /profile default and access permissions are unchanged/)
  const saved = app.state()
  assert.equal(saved.bots.b2.model, 'deepseek/v4-pro')
  assert.equal(saved.bots.b2.appliedModel, 'deepseek/v4-pro')
  assert.equal(saved.bots.b2.createdBy, 'm1')
  assert.deepEqual(saved.bots.b3, otherBefore)
  assert.deepEqual(app.profileDefault(), { provider: 'deepseek', model: 'v4' })
  assert.deepEqual(app.selected.map(choice => [choice.sessionId, choice.model]), [['b2', 'v4-pro'], ['gw', 'v4-pro']])
})

test('a model whose application fails reports the change without claiming it is saved or active', async t => {
  const seed = structuredClone(TEAM)
  seed.bots.b2.appliedModel = 'deepseek/v4'
  const app = start({ seed })
  t.after(app.stop)
  await app.tool('list_bots', {}, 'm1')
  app.ctx.sessionController.selectModel = async () => { throw new Error('adapter temporarily unavailable') }
  const result = await app.tool('update_bot', { bot: 'Writer', model: 'v4-pro', model_user_requested: true }, 'm1')
  assert.match(result, /Model setting for Writer: deepseek\/v4 -> deepseek\/v4-pro, but saving or applying the settings failed: adapter temporarily unavailable/)
  assert.match(result, /Do not claim the model is saved or active or retry with a different model/)
  assert.doesNotMatch(result, /^Updated Writer/)
  const saved = app.state().bots.b2
  assert.equal(saved.model, 'deepseek/v4-pro')
  assert.equal(saved.appliedModel, 'deepseek/v4')
  assert.deepEqual(app.profileDefault(), { provider: 'deepseek', model: 'v4' })
})

test('a model save failure reports only the in-memory change and never claims persistence or application', async t => {
  const app = start()
  const save = app.rt.save
  t.after(async () => { app.rt.save = save; await app.stop() })
  await app.tool('list_bots', {}, 'm1')
  const before = app.state().bots.b2
  app.rt.save = async () => { throw new Error('Test disk failure') }
  const result = await app.tool('update_bot', { bot: 'Writer', model: 'v4-pro', model_user_requested: true }, 'm1')
  assert.match(result, /Model setting for Writer: deepseek\/v4 -> deepseek\/v4-pro, but saving or applying the settings failed: Test disk failure/)
  assert.match(result, /Do not claim the model is saved or active or retry with a different model/)
  assert.doesNotMatch(result, /^Updated Writer|^Saved model/)
  assert.deepEqual(app.state().bots.b2, before, 'The disk still holds the previous model')
  assert.equal(app.rt.botOf('b2').model, 'deepseek/v4-pro', 'The failed mutation is only in memory')
  assert.deepEqual(app.selected, [], 'Application did not run after the failed save')
  assert.deepEqual(app.profileDefault(), { provider: 'deepseek', model: 'v4' })
})

test('saved model changes require explicit user intent even for self and never mutate on refusal', async t => {
  const app = start()
  t.after(app.stop)
  await app.tool('list_bots', {}, 'm1')
  const before = app.state().bots
  for (const [session, target] of [['m1', 'Writer'], ['b2', undefined], ['g3', 'Coder']]) {
    for (const flag of [undefined, false]) {
      const result = await app.tool('update_bot', { ...(target === undefined ? {} : { bot: target }), model: 'v4-pro', ...(flag === undefined ? {} : { model_user_requested: flag }), role: 'Changed' }, session)
      assert.match(result, /Model unchanged\. Only change it when the user explicitly asks/)
      assert.deepEqual(app.state().bots, before)
    }
  }
  assert.deepEqual(app.selected, [])
  const changed = await app.tool('update_bot', { model: 'v4-pro', model_user_requested: true }, 'b2')
  assert.match(changed, /Saved model: deepseek\/v4 -> deepseek\/v4-pro/)
  assert.equal(app.state().bots.b2.model, 'deepseek/v4-pro')
})

test('empty, unavailable and ambiguous saved model choices refuse before changing any settings', async t => {
  const app = start({ providers: { deepseek: ['v4', 'v4-pro'], local: ['v4-pro'] } })
  t.after(app.stop)
  await app.tool('list_bots', {}, 'm1')
  const before = app.state().bots
  for (const model of ['', '   ', 'missing', 'v4-pro']) {
    const result = await app.tool('update_bot', { bot: 'Writer', model, model_user_requested: true, name: 'Changed' }, 'm1')
    assert.match(result, /Model unchanged|not available|more than one provider/)
    assert.deepEqual(app.state().bots, before)
  }
  for (const model of [null, false]) {
    await assert.rejects(app.tool('update_bot', { bot: 'Writer', model, model_user_requested: true }, 'm1'), /model.*must be a string/)
    assert.deepEqual(app.state().bots, before)
  }
  assert.deepEqual(app.selected, [])
  assert.deepEqual(app.profileDefault(), { provider: 'deepseek', model: 'v4' })
})

function departmentSeed() {
  const seed = structuredClone(TEAM)
  seed.organizationVersion = 1
  seed.bots.b2.teamId = 'writing'
  seed.bots.b3.teamId = 'writing'
  seed.bots.p = { id: 'p', sessionId: 'p', name: 'Partner', teamId: 'research', model: 'deepseek/v4', createdAt: 4 }
  seed.bots.r = { id: 'r', sessionId: 'r', name: 'Researcher', teamId: 'research', model: 'deepseek/v4', createdAt: 5 }
  seed.mainBotIds.push('p')
  seed.teams = {
    writing: { id: 'writing', name: 'Writing', purpose: 'Write', leaderId: 'b3', members: ['b3', 'b2'] },
    research: { id: 'research', name: 'Research', purpose: 'Research', leaderId: 'p', members: ['p', 'r'] },
  }
  seed.rooms.r1.admin = 'b2'
  return seed
}

test('a non-Main team leader changes only the model and effort of its own employee from its group identity', async t => {
  const app = start({ seed: departmentSeed(), reasoning: { 'deepseek/v4-pro': { reasoning: { efforts: [{ id: 'high', name: 'High' }] } } } })
  t.after(app.stop)
  const result = await app.tool('update_bot', { bot: 'Writer', model: 'deepseek/v4-pro', model_user_requested: true, effort: 'high' }, 'g3')
  assert.match(result, /Saved model: deepseek\/v4 -> deepseek\/v4-pro\. Thinking level: high/)
  assert.equal(app.state().bots.b2.model, 'deepseek/v4-pro')
  assert.equal(app.state().bots.b2.effort, 'high')
  assert.equal(app.state().bots.b2.teamId, 'writing')
  assert.equal(app.state().mainBotIds.includes('b3'), false)
  assert.match(await app.tool('update_bot', { bot: 'Writer', effort: '' }, 'b3'), /Thinking level: model default/)
  assert.equal(app.state().bots.b2.effort, undefined)
  assert.deepEqual(app.profileDefault(), { provider: 'deepseek', model: 'v4' })
})

test('a leader cannot combine model rights with other settings or manage other teams or Main Bots', async t => {
  const app = start({ seed: departmentSeed() })
  t.after(app.stop)
  await app.tool('list_bots', {}, 'b3')
  const before = app.state().bots
  for (const patch of [{ name: 'Changed' }, { role: 'Changed' }, { instructions: 'Changed' }, { color: 'blue' }, { employment: 'temporary' }, { work_dir: '' }, { formal_avatar: false }]) {
    const result = await app.tool('update_bot', { bot: 'Writer', model: 'v4-pro', model_user_requested: true, ...patch }, 'g3')
    assert.match(result, /Only a Main Bot can change another Bot's other settings/)
    assert.deepEqual(app.state().bots, before)
  }
  for (const bot of ['Researcher', 'Partner', 'Chief']) {
    assert.match(await app.tool('update_bot', { bot, model: 'v4-pro', model_user_requested: true }, 'b3'), /Only a Main Bot|independent|managed by/)
    assert.deepEqual(app.state().bots, before)
  }
  assert.match(await app.tool('update_bot', { bot: 'Coder', model: 'v4-pro', model_user_requested: true }, 'b2'), /Only a Main Bot/)
  assert.deepEqual(app.state().bots, before, 'A group admin has no employee management rights')
  assert.deepEqual(app.selected, [])
})

test('Main Bots cannot change independent Main Bots or employees belonging to another leader', async t => {
  const app = start({ seed: departmentSeed() })
  t.after(app.stop)
  await app.tool('list_bots', {}, 'm1')
  const before = app.state().bots
  assert.match(await app.tool('update_bot', { bot: 'Partner', model: 'v4-pro', model_user_requested: true }, 'm1'), /Another Main Bot is independent/)
  assert.match(await app.tool('update_bot', { bot: 'Researcher', model: 'v4-pro', model_user_requested: true }, 'm1'), /Researcher is managed by Partner/)
  assert.deepEqual(app.state().bots, before)
  assert.deepEqual(app.selected, [])
})

test('list_bots distinguishes the saved model from a different applied model', async t => {
  const seed = structuredClone(TEAM)
  seed.bots.b2.appliedModel = 'deepseek/v4-pro'
  const app = start({ seed })
  t.after(app.stop)
  const text = await app.tool('list_bots', {}, 'm1')
  const writer = text.split('\n').find(line => line.startsWith('- Writer'))
  assert.match(writer, /model deepseek\/v4, applied model deepseek\/v4-pro/)
  assert.equal(app.state().bots.b2.model, 'deepseek/v4')
})
