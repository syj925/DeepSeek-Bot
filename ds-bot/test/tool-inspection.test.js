import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/tool-inspection.js'

function runtime() {
  const state = {
    bots: {
      chief: { id: 'chief', capabilities: ['browser'] },
      writer: { id: 'writer', capabilities: [] },
    },
    rooms: { room: { id: 'room', members: ['chief', 'writer'], sessions: { chief: 'room-chief' } } },
    agents: { plain: { id: 'plain', sessions: ['plain-chat'] } },
  }
  const live = new Map()
  const reads = []
  const presets = { composedPreset: context => context.preset }
  const rt = {
    state,
    ctx: {
      get: name => name === 'agents' ? { get: id => { reads.push(id); return live.get(id) } } : name === 'agentPresets' ? presets : undefined,
      tools: { schemas: agent => agent.schemas },
    },
    botOf: id => state.bots[id],
    roomOf: id => state.rooms[id],
    chatOf: id => `${id}-chat`,
    chatOwners: new Map([['chief-chat', 'chief'], ['writer-chat', 'writer']]),
    groupOwners: new Map([['room-chief', { botId: 'chief', roomId: 'room' }]]),
    agentOf: id => Object.values(state.agents).find(agent => agent.sessions.includes(id)),
    load: async () => {},
    resolveAgent: () => { throw new Error('Inspection must not activate an Agent') },
    ensureCapabilities: () => { throw new Error('Inspection must not change capability readiness') },
    capabilityStatusesView: () => ({ chief: { browser: { state: 'connecting', error: 'sensitive failure detail' } } }),
  }
  install(rt)
  const addAgent = (id, schemas = [], history = { tools: [], updates: [] }) => {
    const agent = { ctx: { preset: 'standard' }, session: { id, header: { agentPreset: 'old-preset', cwd: '/sensitive/path' }, toolHistory: () => history }, schemas }
    live.set(id, agent)
    return agent
  }
  return { rt, state, live, reads, addAgent }
}

test('inspection separates registry and historical tools and exports only allowed fields', async () => {
  const { rt, addAgent } = runtime()
  const tool = (name, extra = {}) => ({ name, description: 'private instructions', parameters: { token: 'secret-value' }, ...extra })
  addAgent('chief-chat', [tool('read_browser'), tool('mcp__browser__click', { deferLoading: true }), tool('run_code')], {
    tools: [tool('old_browser', { deferLoading: true })],
    updates: [{ messageId: 'not-exported', additions: [tool('mcp__browser__click', { deferLoading: true })] }],
  })
  const result = await rt.toolInspection('chief')
  assert.equal(result.sessions[0].presetId, 'standard')
  assert.equal(result.sessions[0].kind, 'private')
  assert.deepEqual(result.sessions[0].registry.tools, [
    { name: 'mcp__browser__click', deferLoading: true }, { name: 'read_browser' }, { name: 'run_code' },
  ])
  assert.deepEqual(result.sessions[0].history.initial, [{ name: 'old_browser', deferLoading: true }])
  assert.deepEqual(result.sessions[0].history.additions, [{ name: 'mcp__browser__click', deferLoading: true }])
  assert.deepEqual(result.sessions[0].capabilities, [{ name: 'browser', state: 'connecting' }])
  assert.equal(result.sessions[0].capabilityScope, 'employee')
  assert.doesNotMatch(JSON.stringify(result), /private instructions|secret-value|sensitive|not-exported|parameters|description|cwd/)
})

test('group inspection includes not-started members without creating sessions', async () => {
  const { rt, addAgent, reads, state } = runtime()
  addAgent('room-chief', [{ name: 'dsh_browser_control' }])
  const result = await rt.toolInspection('room')
  assert.deepEqual(result.sessions.map(item => [item.botId, item.state]), [['chief', 'ready'], ['writer', 'not-started']])
  assert.deepEqual(reads, ['room-chief'])
  assert.equal(state.rooms.room.sessions.writer, undefined)
  assert.equal((await rt.toolInspection('room', 'chief')).sessions.length, 1)
  assert.equal((await rt.toolInspection('room-chief')).sessions[0].kind, 'group')
})

test('cold sessions remain inactive and plain DSH Agent sessions can be compared', async () => {
  const { rt, addAgent } = runtime()
  assert.equal((await rt.toolInspection('writer-chat')).sessions[0].state, 'inactive')
  addAgent('plain-chat', [{ name: 'dsh_builtin_browser_click' }])
  const item = (await rt.toolInspection('plain-chat')).sessions[0]
  assert.equal(item.kind, 'agent')
  assert.equal(item.agentId, 'plain')
  assert.deepEqual(item.registry.tools, [{ name: 'dsh_builtin_browser_click' }])
  assert.deepEqual(item.capabilities, [])
})

test('inspection rejects arbitrary sessions, other members and stale ownership before reading live agents', async () => {
  const { rt, reads, state } = runtime()
  await assert.rejects(rt.toolInspection('outside-session'), /Unknown team conversation/)
  await assert.rejects(rt.toolInspection('constructor'), /Unknown team conversation/)
  await assert.rejects(rt.toolInspection('__proto__'), /Unknown team conversation/)
  await assert.rejects(rt.toolInspection('room', 'outsider'), /not a member/)
  await assert.rejects(rt.toolInspection('chief', 'writer'), /does not own/)
  await assert.rejects(rt.toolInspection('room-chief', 'writer'), /does not own/)
  await assert.rejects(rt.toolInspection('plain-chat', 'chief'), /no Bot owner/)
  delete state.rooms.room.sessions.chief
  await assert.rejects(rt.toolInspection('room-chief'), /Unknown team conversation/)
  assert.deepEqual(reads, [])
})

test('missing public APIs and failures report unavailable without leaking errors', async () => {
  const { rt, addAgent } = runtime()
  const agent = addAgent('chief-chat')
  rt.ctx.get = name => name === 'agents' ? { get: () => agent } : undefined
  rt.ctx.tools.schemas = () => { throw new Error('token-secret') }
  agent.session.toolHistory = () => { throw new Error('token-secret') }
  const item = (await rt.toolInspection('chief')).sessions[0]
  assert.equal(item.presetId, 'old-preset')
  assert.equal(item.registry.state, 'unavailable')
  assert.equal(item.history.state, 'unavailable')
  assert.doesNotMatch(JSON.stringify(item), /token-secret/)
  delete agent.session.toolHistory
  delete rt.ctx.tools.schemas
  assert.equal((await rt.toolInspection('chief')).sessions[0].state, 'ready')
  rt.ctx.get = () => undefined
  assert.equal((await rt.toolInspection('chief')).sessions[0].state, 'unavailable')
})

test('refresh observes newly registered tools without changing tools itself', async () => {
  const { rt, addAgent } = runtime()
  const agent = addAgent('chief-chat', [{ name: 'read_browser' }])
  const first = await rt.toolInspection('chief')
  agent.schemas.push({ name: 'dsh_browser_click', deferLoading: true })
  const second = await rt.toolInspection('chief')
  assert.equal(first.sessions[0].registry.tools.length, 1)
  assert.equal(second.sessions[0].registry.tools.length, 2)
  assert.deepEqual(second.sessions[0].registry.tools.find(tool => tool.name === 'dsh_browser_click'), { name: 'dsh_browser_click', deferLoading: true })
})

test('last assembled request tools distinguish PTC presentation from registry visibility', async () => {
  const { rt, addAgent } = runtime()
  const agent = addAgent('chief-chat', [{ name: 'dsh_browser_click' }, { name: 'run_code' }])
  agent.session.requestHeader = () => ({ tools: [{ name: 'run_code', description: 'private SDK', parameters: { secret: 'value' } }], config: { apiKey: 'credential' } })
  const item = (await rt.toolInspection('chief')).sessions[0]
  assert.deepEqual(item.lastRequest, { state: 'available', tools: [{ name: 'run_code' }] })
  assert.equal(item.registry.tools.length, 2)
  assert.doesNotMatch(JSON.stringify(item), /private SDK|parameters|credential|config/)
  agent.session.requestHeader = () => undefined
  assert.equal((await rt.toolInspection('chief')).sessions[0].lastRequest.state, 'not-started')
  agent.session.requestHeader = () => { throw new Error('credential') }
  assert.equal((await rt.toolInspection('chief')).sessions[0].lastRequest.state, 'unavailable')
})

test('opening a browser resolves private and plain Agent Sessions without preparing groups', async () => {
  const { rt } = runtime()
  rt.ensureGroupSession = () => { throw new Error('Private opening must not create group Sessions') }
  assert.deepEqual(await rt.browserSession('chief'), { sessionId: 'chief-chat', botId: 'chief' })
  assert.deepEqual(await rt.browserSession('chief-chat'), { sessionId: 'chief-chat', botId: 'chief' })
  assert.deepEqual(await rt.browserSession('plain-chat'), { sessionId: 'plain-chat' })
})

test('opening a group browser requires one explicit member and prepares only their execution Session', async () => {
  const { rt, state } = runtime()
  const prepared = []
  rt.ensureGroupSession = async (room, bot) => {
    prepared.push({ roomId: room.id, botId: bot.id })
    room.sessions[bot.id] ??= `${room.id}-${bot.id}`
    return { id: room.sessions[bot.id] }
  }
  await assert.rejects(rt.browserSession('room'), /Choose a Bot/)
  await assert.rejects(rt.browserSession('room', 'outside'), /not a member/)
  await assert.rejects(rt.browserSession('outside'), /Unknown team conversation/)
  await assert.rejects(rt.browserSession('chief', 'writer'), /does not own/)
  assert.deepEqual(prepared, [])
  assert.deepEqual(await rt.browserSession('room', 'writer'), { sessionId: 'room-writer', botId: 'writer', roomId: 'room' })
  assert.deepEqual(prepared, [{ roomId: 'room', botId: 'writer' }])
  assert.equal(state.rooms.room.sessions.chief, 'room-chief')
  assert.equal(state.bots.writer.sessionId, undefined)
  assert.equal(rt.chatOf('writer'), 'writer-chat')
  assert.deepEqual(await rt.browserSession('room-chief'), { sessionId: 'room-chief', botId: 'chief', roomId: 'room' })
  assert.deepEqual(prepared[1], { roomId: 'room', botId: 'chief' }, 'Existing group Sessions use the same normal prepare path')
})
