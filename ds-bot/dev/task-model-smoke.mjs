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
const baseline = await api('state')
const botModels = new Map(baseline.bots.map(bot => [bot.id, bot.model]))
const workerDetails = baseline.bots.find(bot => bot.id === worker.id)
async function unchangedDefaults(expectedWorker = pro.ref) {
  const current = await api('state')
  assert.equal(current.defaultModel, baseline.defaultModel, 'profile default is unchanged')
  for (const bot of current.bots) assert.equal(bot.model, bot.id === worker.id ? expectedWorker : botModels.get(bot.id), `${bot.name} saved model`)
  const after = current.bots.find(bot => bot.id === worker.id)
  for (const key of ['name', 'role', 'instructions', 'teamId', 'ownerId', 'access', 'workDir']) assert.deepEqual(after[key], workerDetails[key], `worker ${key} is unchanged`)
}
async function send(text) {
  const before = log().length
  await api('send', { sessionId: chief.id, text })
  await quiet()
  return log().slice(before)
}
const ownCalls = rows => rows.filter(row => row.session === worker.id)
let rows = await send('任务模型 RouteWorker auto general: Say hello')
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === pro.id), 'ordinary general task keeps the employee model at the HTTP adapter')
await unchangedDefaults()
console.log('PASS ordinary general task keeps saved Pro on actual mock HTTP requests')
rows = await send('任务模型 RouteWorker auto coding: Implement a short function')
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === pro.id), 'task type does not authorize changing the model')
console.log('PASS ordinary coding task keeps saved Pro')
rows = await send(`任务模型 RouteWorker ${flash.ref} general: Use Flash for this task only`)
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === flash.id), 'explicit user-requested task override reaches the HTTP adapter')
await unchangedDefaults()
console.log('PASS explicit task-only Flash leaves employee, Chief and profile defaults unchanged')
const before = log().length
await api('send', { sessionId: worker.id, text: 'Direct user chat' })
await quiet()
assert.ok(ownCalls(log().slice(before)).length)
assert.ok(ownCalls(log().slice(before)).every(row => row.model === pro.id))
await unchangedDefaults()
console.log('PASS next ordinary chat uses saved Pro')
rows = await send(`任务模型未授权 RouteWorker ${flash.ref} general: Must not execute without user intent`)
assert.equal(ownCalls(rows).length, 0)
await unchangedDefaults()
await send(`smoke:set-model-unrequested RouteWorker ${flash.ref}`)
await unchangedDefaults()
console.log('PASS missing explicit user intent refuses task and saved-model changes')
rows = await send('任务模型 RouteWorker unavailable/model general: Must not execute')
assert.equal(ownCalls(rows).length, 0)
await send('smoke:set-model RouteWorker unavailable/model')
await unchangedDefaults()
console.log('PASS unavailable model neither dispatches work nor changes saved defaults')
rows = await send(`smoke:set-model RouteWorker ${flash.ref}`)
assert.equal(ownCalls(rows).length, 0, 'changing a saved model does not itself dispatch employee work')
await unchangedDefaults(flash.ref)
rows = await send('任务模型 RouteWorker auto coding: Work after the requested permanent switch')
assert.ok(ownCalls(rows).length)
assert.ok(ownCalls(rows).every(row => row.model === flash.id), 'next worker turn uses the requested saved model')
await unchangedDefaults(flash.ref)
console.log('PASS Chief conversation saves Flash for employee next turns; other employees, Chief and profile stay unchanged')
console.log('Task model wire checks passed')
