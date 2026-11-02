import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { install } from '../src/host/task-notices.js'
import { install as installPrompt } from '../src/host/prompt.js'

class MockAdapter extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, context: { contextWindow: 32000 }, defaultMaxTokens: 1024 }
  }
  async * stream(options) {
    if (options.tools?.some(tool => tool.name === 'complete_task') && !options.messages.some(message => message.role === 'tool')) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: {
        type: 'tool-call', id: ToolCallId('mock-completion'), name: 'complete_task', arguments: '{"title":"Mock delivery","summary":"Verified."}',
      } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function setup(t) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  for (const plugin of [LlmRuntime, Sessions, Projections, SystemPrompt, Tools, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], new MockAdapter()))
  const current = new Set(['bot', 'group-bot'])
  const rt = {
    ctx, state: { questions: {} }, live: new Map(), groupOwners: new Map([['group-bot', { roomId: 'room' }]]),
    isBotSession: id => current.has(id), selfOf: id => ['bot', 'group-bot', 'old-bot'].includes(id) ? 'employee' : undefined,
    botOf: id => id === 'employee' ? { id, name: 'Writer' } : undefined,
    roomOf: id => id === 'room' ? { admin: 'employee' } : undefined,
    load: async () => {}, save: async () => {}, isMain: () => false, warn() {},
  }
  const plugin = { name: 'notice-scope-test', inject: ['tools', 'systemPrompt'], apply: (owner) => { rt.ctx = owner; install(rt); installPrompt(rt) } }
  const create = (id, parentAgent) => ctx.agents.create({
    sessionId: SessionId(id), agentOptions: { provider: 'mock', model: 'test' },
    ...parentAgent ? { parentAgent, meta: { origin: 'subagent', parentSession: parentAgent.session.id } } : {},
  })
  let callId = 0
  const call = agent => ctx.tools.execute({
    name: 'complete_task', arguments: { title: 'Done', summary: 'Verified.' },
    callId: ToolCallId(`notice-${++callId}`), agent, signal: new AbortController().signal,
  })
  return { ctx, current, rt, plugin, create, call }
}

test('only current Bot Agents receive completion tools; ordinary roots, DSH Agents, relays, archived segments and children cannot call them', async (t) => {
  const { ctx, rt, plugin, create, call } = await setup(t)
  const bot = (await create('bot')).agent
  const owner = await ctx.plugin(plugin)
  await rt.load()
  assert.equal(ctx.tools.get('complete_task'), undefined)
  assert.ok(ctx.tools.get('complete_task', bot), 'startup adopts an already-live employee Agent')
  const botPrompt = await ctx.systemPrompt.assemble({ agent: bot, scope: bot })
  assert.match(botPrompt.sections.find(section => section.name === 'bot-identity').text, /visible complete_task tool/)
  for (const id of ['ordinary', 'dsh-agent', 'relay', 'old-bot']) {
    const agent = (await create(id)).agent
    assert.equal(ctx.tools.get('complete_task', agent), undefined, id)
    assert.equal((await call(agent)).isError, true, id)
  }
  const child = (await create('child', bot)).agent
  assert.equal(ctx.agents.isOwnedBy(child.id, bot), true)
  assert.equal(ctx.tools.get('complete_task', child), undefined)
  assert.equal((await call(child)).isError, true)
  assert.equal((await call(bot)).isError, true, 'a scoped tool does not bypass its active-task check')
  rt.live.set(bot.id, { turn: 1 })
  assert.equal((await call(bot)).isError, false)
  const group = (await create('group-bot')).agent
  rt.live.set(group.id, { turn: 1 })
  assert.equal((await call(group)).isError, false)
  const oldDefinition = ctx.tools.get('complete_task', bot)
  await owner.dispose()
  assert.equal(ctx.agents.get(bot.id), bot, 'plugin unload does not require destroying employee Agents')
  assert.equal(ctx.tools.get('complete_task', bot), undefined)
  assert.equal(ctx.tools.get('complete_task', group), undefined)
  await assert.rejects(oldDefinition.execute({ title: 'Old', summary: 'Unloaded.' }, { agent: bot }), /active task/)
  await ctx.plugin(plugin)
  await rt.load()
  assert.ok(ctx.tools.get('complete_task', bot), 'plugin reload restores the scoped tool on an existing Agent')
})

test('ownership refresh installs once after adoption, revokes retired conversations, and handles Agent disposal and recreation', async (t) => {
  const { ctx, current, rt, plugin, create, call } = await setup(t)
  await ctx.plugin(plugin)
  const first = await create('adopted')
  assert.equal(ctx.tools.get('complete_task', first.agent), undefined)
  current.add('adopted')
  const originalSelf = rt.selfOf
  rt.selfOf = id => id === 'adopted' ? 'employee' : originalSelf(id)
  rt.syncTaskNoticeTools()
  rt.prepareTaskNoticeAgent(first.agent)
  rt.syncTaskNoticeTools()
  assert.equal(ctx.tools.schemas(first.agent).filter(tool => tool.name === 'complete_task').length, 1)
  const captured = ctx.tools.get('complete_task', first.agent)
  rt.live.set(first.agent.id, { turn: 1 })
  current.delete('adopted')
  rt.syncTaskNoticeTools()
  assert.equal(ctx.tools.get('complete_task', first.agent), undefined)
  await assert.rejects(captured.execute({ title: 'Old', summary: 'Revoked.' }, { agent: first.agent }), /active task/)
  current.add('adopted')
  rt.syncTaskNoticeTools()
  assert.ok(ctx.tools.get('complete_task', first.agent))
  await first.dispose()
  const replacement = await create('adopted')
  assert.ok(ctx.tools.get('complete_task', replacement.agent))
  assert.equal((await call(replacement.agent)).isError, false)
})

test('a mock model can report from an employee turn without exposing the tool to an ordinary model request', async (t) => {
  const { ctx, rt, plugin, create } = await setup(t)
  await ctx.plugin(plugin)
  const bot = (await create('bot')).agent
  const ordinary = (await create('ordinary')).agent
  rt.live.set(bot.id, { turn: 1 })
  for (const agent of [bot, ordinary]) {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Deliver the verified result.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  assert.equal(rt.live.get(bot.id).completion.title, 'Mock delivery')
  assert.equal(bot.session.snapshotEvents().filter(event => event.type === 'tool/call' && event.data.name === 'complete_task').length, 1)
  assert.equal(ordinary.session.snapshotEvents().filter(event => event.type === 'tool/call').length, 0)
})
