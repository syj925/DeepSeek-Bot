import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install as installModels } from '../src/host/models.js'
import { install, taskKind } from '../src/host/task-models.js'
import { SOURCE_KIND } from '../src/host/constants.js'

const entries = [
  { ref: 'p/pro', id: 'pro', name: 'Pro', input: ['text'] },
  { ref: 'p/flash', id: 'flash', name: 'Flash', input: ['text'] },
  { ref: 'p/codex', id: 'codex', name: 'Codex', input: ['text'] },
  { ref: 'p/vision', id: 'vision', name: 'Vision', input: ['text', 'image'] },
]
function bench() {
  const listeners = new Map()
  const bots = { employee: { id: 'employee', model: 'p/pro', effort: 'high' } }
  const ctx = {
    on(name, fn) { listeners.set(name, fn) },
    llm: {
      listProviders: () => [{ id: 'p' }],
      listModels: async () => entries.map(entry => ({ ...entry, inputModalities: entry.input })),
      resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }] } }),
    },
    sessionController: { selectModel() { assert.fail('Task routes must not change saved settings') } },
  }
  const rt = { ctx, state: { bots }, load: async () => {}, selfOf: () => 'employee', botOf: id => bots[id], isBotSession: id => id === 'own' || id === 'group' }
  installModels(rt)
  install(rt)
  const payload = (id, turn, messages = [], step = 1) => ({ agent: { id }, turn, step, messages, signal: new AbortController().signal })
  const admit = (id, turn, messages, step) => listeners.get('agent/pre-step')(payload(id, turn, messages, step), async () => ({ kind: 'continue', messages }))
  const request = (id, turn, config = { provider: 'p', model: 'pro', reasoningEffort: 'high', maxTokens: 8000 }) => listeners.get('agent/request')(payload(id, turn), async () => config)
  return { rt, listeners, admit, request, bots, payload }
}
const message = taskModel => ({ source: { kind: SOURCE_KIND, role: 'request', taskModel } })

test('identifies task content without using it to change the employee model', () => {
  assert.equal(taskKind('请修复代码的 bug'), 'coding')
  assert.equal(taskKind('分析这张截图'), 'vision')
  assert.equal(taskKind('写作一篇报告'), 'writing')
  assert.equal(taskKind('修复代码'), 'coding')
  assert.equal(taskKind('研究一个主题'), 'analysis')
  assert.equal(taskKind('Say hello'), 'general')
})

test('task kinds and priorities keep the saved employee model', async () => {
  const { rt, bots } = bench()
  const before = structuredClone(bots)
  for (const kind of ['general', 'writing', 'coding', 'analysis']) {
    for (const priority of ['balanced', 'speed', 'economy', 'quality']) {
      const task = await rt.planTaskModel(bots.employee, { kind, priority })
      assert.equal(task.ref, 'p/pro')
      assert.equal(task.explicit, false)
      assert.match(task.reason, /Kept the employee's configured model/)
    }
  }
  assert.deepEqual(bots, before)
})

test('only an employee with no saved model uses the profile default', async () => {
  const { rt, bots } = bench()
  rt.defaultModel = async () => 'p/flash'
  assert.equal((await rt.planTaskModel(bots.employee)).ref, 'p/pro')
  delete bots.employee.model
  const task = await rt.planTaskModel(bots.employee, { kind: 'coding' })
  assert.equal(task.ref, 'p/flash')
  assert.match(task.reason, /profile default/)
  assert.equal(bots.employee.model, undefined)
})

test('explicit task model wins; missing or incompatible choices fail before dispatch', async () => {
  const { rt, bots } = bench()
  const before = structuredClone(bots)
  assert.equal((await rt.planTaskModel(bots.employee, { kind: 'coding' })).ref, 'p/pro')
  assert.equal((await rt.planTaskModel(bots.employee, { kind: 'coding', model: 'flash' })).ref, 'p/flash')
  await assert.rejects(rt.planTaskModel(bots.employee, { model: 'missing' }), /not available/)
  await assert.rejects(rt.planTaskModel(bots.employee, { kind: 'vision', model: 'pro' }), /image input/)
  rt.catalog = async () => []
  await assert.rejects(rt.planTaskModel(bots.employee), /Model p\/pro is not available/)
  assert.deepEqual(bots, before)
})

test('an unavailable or incompatible saved model never silently selects another model', async () => {
  const { rt, bots } = bench()
  await assert.rejects(rt.planTaskModel(bots.employee, { kind: 'vision' }), /image input/)
  bots.employee.model = 'p/removed'
  bots.employee.appliedModel = 'p/flash'
  await assert.rejects(rt.planTaskModel(bots.employee), /Model p\/removed is not available/)
  assert.equal(bots.employee.model, 'p/removed')
  assert.equal((await rt.planTaskModel(bots.employee, { model: 'vision', kind: 'vision' })).ref, 'p/vision')
  assert.equal(bots.employee.model, 'p/removed')
  delete bots.employee.model
  rt.defaultModel = async () => undefined
  await assert.rejects(rt.planTaskModel(bots.employee), /No configured model/)
})

test('own and group tasks isolate routes, stay fixed through corrections/retries, then restore defaults', async () => {
  const { admit, request, listeners, bots } = bench()
  await admit('own', 1, [message({ ref: 'p/codex' })])
  await admit('group', 7, [message({ ref: 'p/vision' })])
  assert.deepEqual(await request('own', 1), { provider: 'p', model: 'codex' })
  assert.deepEqual(await request('group', 7), { provider: 'p', model: 'vision' })
  await admit('own', 1, [message({ ref: 'p/flash' })], 2)
  assert.deepEqual(await request('own', 1), { provider: 'p', model: 'codex' })
  assert.deepEqual(await request('own', 1), { provider: 'p', model: 'codex' })
  listeners.get('session/event')({ id: 'own' }, { type: 'turn/end' })
  await admit('own', 2, [message({ ref: 'p/flash' })])
  assert.deepEqual(await request('own', 2), { provider: 'p', model: 'flash' })
  listeners.get('session/event')({ id: 'own' }, { type: 'turn/end' })
  await admit('own', 3, [{ source: { kind: 'user' } }])
  assert.deepEqual(await request('own', 3, { provider: 'p', model: 'flash' }), { provider: 'p', model: 'pro', reasoningEffort: 'high' })
  assert.deepEqual(await request('group', 7), { provider: 'p', model: 'vision' })
  assert.equal(bots.employee.model, 'p/pro')
})

test('admission exposes chosen context route before compaction and removes it on rejected/cancelled steps', async () => {
  const { rt, listeners, payload } = bench()
  const p = payload('own', 1, [message({ ref: 'p/vision' })])
  const decision = await listeners.get('agent/pre-step')(p, async () => {
    assert.equal(rt.taskRouteFor('own').model, 'vision')
    return { kind: 'reject' }
  })
  assert.equal(decision.kind, 'reject')
  assert.equal(rt.taskRouteFor('own'), undefined)
})

test('a saved model change affects the next turn while current own and group routes stay admitted', async () => {
  const { admit, request, bots, listeners } = bench()
  await admit('own', 1, [{ source: { kind: 'user' } }])
  await admit('group', 7, [message({ ref: 'p/codex' })])
  bots.employee.model = 'p/flash'
  await admit('own', 1, [{ source: { kind: 'user' } }], 2)
  assert.equal((await request('own', 1)).model, 'pro')
  assert.equal((await request('group', 7)).model, 'codex')
  listeners.get('session/event')({ id: 'own' }, { type: 'turn/end' })
  await admit('own', 2, [{ source: { kind: 'user' } }])
  assert.equal((await request('own', 2)).model, 'flash')
  assert.equal((await request('group', 7)).model, 'codex')
})

test('restart rehydrates a durable task source; plain agents and original objects are untouched', async () => {
  const durable = JSON.parse(JSON.stringify(message({ ref: 'p/codex' })))
  const { admit, request } = bench()
  await admit('own', 1, [durable])
  const base = Object.freeze({ provider: 'p', model: 'pro', maxTokens: 1234 })
  assert.deepEqual(await request('plain', 1, base), base)
  assert.deepEqual(await request('own', 1, base), { provider: 'p', model: 'codex' })
  assert.equal(base.model, 'pro')
})

test('a bare part handoff before queued work does not mask the task route', async () => {
  const { admit, request } = bench()
  await admit('own', 1, [
    { source: { kind: SOURCE_KIND, role: 'handoff', handoff: true } },
    message({ ref: 'p/codex' }),
  ])
  assert.equal((await request('own', 1)).model, 'codex')
})

test('task effort is validated, inherited only when supported, and isolated from employee defaults', async () => {
  const { rt, bots, admit, request } = bench()
  const automatic = await rt.planTaskModel(bots.employee, { model: 'pro' })
  assert.equal(automatic.effort, 'high')
  const explicit = await rt.planTaskModel(bots.employee, { model: 'flash', effort: 'high' })
  await admit('own', 1, [message(explicit)])
  assert.equal((await request('own', 1)).reasoningEffort, 'high')
  await assert.rejects(rt.planTaskModel(bots.employee, { effort: 'max' }), /not available/)
  const defaults = await rt.planTaskModel(bots.employee, { model: 'flash', effort: '' })
  await admit('group', 2, [message(defaults)])
  assert.equal((await request('group', 2)).reasoningEffort, undefined)
  assert.equal(bots.employee.effort, 'high')
  bots.employee.effort = 'low'
  assert.equal((await rt.planTaskModel(bots.employee)).effort, undefined)
})
