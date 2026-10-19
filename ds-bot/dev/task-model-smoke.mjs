// Isolated mock bench only. No credentials or real model requests.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [name, port] = process.argv.slice(2)
if (!name || !/^\d+$/.test(port ?? '')) throw new Error('Usage: node dev/task-model-smoke.mjs <bench-name> <port>')
const home = resolve('..', `.dsh-test-${name}`)
const base = `http://127.0.0.1:${port}`
const url = readFileSync(join(home, 'web.log'), 'utf8').match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
assert.ok(url, 'isolated bench login URL')
const login = await fetch(url, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
const api = async (endpoint, payload = {}) => {
  const result = await (await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })).json()
  assert.ok(result.ok, `${endpoint}: ${result.error?.message}`)
  return result.value
}
const log = () => {
  try { return readFileSync(join(home, 'mock.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch { return [] }
}
async function quiet() {
  let size = -1
  let since = Date.now()
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const state = await api('state')
    const next = log().length
    if (next !== size || Object.keys(state.activity ?? {}).length) { size = next; since = Date.now() }
    if (Date.now() - since > 1800) return
    await delay(200)
  }
  throw new Error('Tasks did not settle')
}
const state = await api('state')
const chief = state.bots[0]
const pro = state.models.find(model => model.id.endsWith('pro'))
const flash = state.models.find(model => model.id.endsWith('flash'))
assert.ok(pro && flash)
await api('update-bot', { id: chief.id, model: pro.ref })
await quiet()
const worker = await api('create-bot', { name: 'RouteWorker', role: 'Writer', instructions: 'Answer the requested task briefly.', model: pro.ref })
await quiet()
async function send(text) {
  const before = log().length
  await api('send', { sessionId: chief.id, text })
  await quiet()
  return log().slice(before)
}
const ownCalls = rows => rows.filter(row => row.session === worker.id)
let rows = await send('任务模型 RouteWorker auto general: Say hello')
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === flash.id), 'automatic light task routes to Flash at the HTTP adapter')
console.log('PASS auto general -> Flash on actual mock HTTP requests')
rows = await send(`任务模型 RouteWorker ${pro.ref} general: Say hello again`)
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === pro.id), 'explicit route wins')
console.log('PASS explicit Pro overrides automatic Flash')
rows = await send('任务模型 RouteWorker auto analysis: Compare the evidence')
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === pro.id))
console.log('PASS analysis -> Pro')
await send('任务模型 RouteWorker auto general: Last short task')
const before = log().length
await api('send', { sessionId: worker.id, text: 'Direct user chat' })
await quiet()
assert.ok(ownCalls(log().slice(before)).length)
assert.ok(ownCalls(log().slice(before)).every(row => row.model === pro.id))
assert.equal((await api('state')).bots.find(bot => bot.id === worker.id).model, pro.ref)
console.log('PASS ordinary chat restores Pro; employee defaults unchanged')
rows = await send('任务模型 RouteWorker unavailable/model general: Must not execute')
assert.equal(ownCalls(rows).length, 0)
console.log('PASS unavailable explicit model does not dispatch employee work')
console.log('Task model wire checks passed')
