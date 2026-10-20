import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install as installChannel } from '../src/host/channel.js'
import { install as installInspection } from '../src/host/tool-inspection.js'
import { fakeContext } from './fake-ctx.js'

function fixture({ readOnly = false } = {}) {
  const live = new Map()
  const state = {
    bots: { chief: { id: 'chief', capabilities: [] }, writer: { id: 'writer', capabilities: [] } },
    rooms: { room: { id: 'room', members: ['chief', 'writer'], sessions: {} } },
    agents: { plain: { id: 'plain', sessions: ['plain-chat'] } },
  }
  const ctx = fakeContext({ services: { agents: { get: id => live.get(id) }, agentPresets: { composedPreset: context => context.preset } } })
  let route
  ctx.connection.fetch.register = options => { route = options; return () => {} }
  ctx.tools.schemas = agent => agent.schemas
  const prepared = []
  const rt = {
    ctx, state,
    load: async () => {}, refresh: async () => {},
    readOnly: () => readOnly ? 'Team is open in another host' : undefined,
    botOf: id => state.bots[id], roomOf: id => state.rooms[id], chatOf: id => `${id}-chat`,
    chatOwners: new Map([['chief-chat', 'chief'], ['writer-chat', 'writer']]),
    groupOwners: new Map(),
    agentOf: id => id === 'plain-chat' ? state.agents.plain : undefined,
    ensureGroupSession: async (room, bot) => {
      prepared.push({ roomId: room.id, botId: bot.id })
      const id = room.sessions[bot.id] ??= `${room.id}-${bot.id}`
      rt.groupOwners.set(id, { roomId: room.id, botId: bot.id })
      return { id }
    },
    noteFailure: () => { throw new Error('Refused inspection must not become an internal failure') },
  }
  installInspection(rt)
  installChannel(rt)
  const call = async (endpoint, payload) => (await route.fetch(new Request('http://localhost/api/bot', {
    method: 'POST', body: JSON.stringify({ endpoint, payload }),
  }))).json()
  const addAgent = id => live.set(id, {
    ctx: { preset: 'standard' }, schemas: [{ name: 'mcp__browser__click', deferLoading: true, description: 'sensitive instructions', parameters: { token: 'private-credential' } }],
    session: { id, toolHistory: () => ({ tools: [], updates: [] }), requestHeader: () => ({ tools: [{ name: 'run_code' }], config: { token: 'private-credential' } }) },
  })
  return { rt, state, prepared, call, addAgent }
}

test('read-only team hosts allow tool snapshots but reject operation browser preparation', async () => {
  const h = fixture({ readOnly: true })
  h.addAgent('chief-chat')
  const snapshot = await h.call('tool-inspection', { sessionId: 'chief' })
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.value.sessions[0].presetId, 'standard')
  assert.deepEqual(snapshot.value.sessions[0].registry.tools, [{ name: 'mcp__browser__click', deferLoading: true }])
  assert.deepEqual(snapshot.value.sessions[0].lastRequest.tools, [{ name: 'run_code' }])
  assert.doesNotMatch(JSON.stringify(snapshot), /sensitive|private-credential|parameters|description|config/)
  const open = await h.call('browser-session', { sessionId: 'room', botId: 'writer' })
  assert.equal(open.ok, false)
  assert.equal(open.error.code, 'bot/read-only')
  assert.deepEqual(h.prepared, [])
  assert.deepEqual(h.state.rooms.room.sessions, {})
})

test('group inspection never creates members and operation browser requires an explicit member', async () => {
  const h = fixture()
  const snapshot = await h.call('tool-inspection', { sessionId: 'room' })
  assert.equal(snapshot.ok, true)
  assert.deepEqual(snapshot.value.sessions.map(item => item.state), ['not-started', 'not-started'])
  const refused = await h.call('browser-session', { sessionId: 'room' })
  assert.equal(refused.ok, false)
  assert.equal(refused.error.code, 'bot/refused')
  assert.match(refused.error.message, /Choose a Bot/)
  assert.deepEqual(h.prepared, [])
  assert.deepEqual(h.state.rooms.room.sessions, {})
})

test('operation browser prepares only the selected group owner and preserves private sessions', async () => {
  const h = fixture()
  const opened = await h.call('browser-session', { sessionId: 'room', botId: 'writer' })
  assert.deepEqual(opened, { ok: true, value: { sessionId: 'room-writer', botId: 'writer', roomId: 'room' } })
  assert.deepEqual(h.prepared, [{ roomId: 'room', botId: 'writer' }])
  assert.deepEqual(h.state.rooms.room.sessions, { writer: 'room-writer' })
  const own = await h.call('browser-session', { sessionId: 'writer' })
  assert.deepEqual(own, { ok: true, value: { sessionId: 'writer-chat', botId: 'writer' } })
  assert.equal(h.prepared.length, 1)
  const plain = await h.call('browser-session', { sessionId: 'plain-chat' })
  assert.deepEqual(plain, { ok: true, value: { sessionId: 'plain-chat' } })
})

test('both endpoints reject sessions outside the team and group nonmembers without preparation', async () => {
  const h = fixture()
  for (const endpoint of ['tool-inspection', 'browser-session']) {
    for (const payload of [{ sessionId: 'unrelated-session' }, { sessionId: 'room', botId: 'nonmember' }, { sessionId: 'chief', botId: 'writer' }]) {
      const result = await h.call(endpoint, payload)
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'bot/refused')
    }
  }
  assert.deepEqual(h.prepared, [])
})
