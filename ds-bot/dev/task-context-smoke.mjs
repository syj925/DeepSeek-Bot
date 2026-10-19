import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Run after dev/smoke.mjs on the same isolated mock bench.
const [bench = 'task-context', port = '3126'] = process.argv.slice(2)
if (!/^[a-z0-9-]+$/.test(bench) || !/^\d+$/.test(port)) throw new Error('Invalid bench name or port')
const home = fileURLToPath(new URL('../../.dsh-test-' + bench, import.meta.url))
const base = 'http://127.0.0.1:' + port
const suffix = Date.now().toString(36)
const groupName = 'Lifecycle-' + suffix
const tempName = 'Temp-' + suffix
const log = readFileSync(home + '/web.log', 'utf8')
const url = log.split(/\s+/).find(value => value.startsWith(base + '/?token='))
const response = await fetch(url, { redirect: 'manual' })
const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
async function api(endpoint, payload = {}) {
  const res = await fetch(base + '/api/bot', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  const data = await res.json()
  if (!data.ok) throw new Error(endpoint + ': ' + data.error?.message)
  return data.value
}
const state = () => JSON.parse(readFileSync(home + '/bot/state.json', 'utf8'))
const bot = name => Object.values(state().bots).find(item => item.name === name)
const room = name => Object.values(state().rooms).find(item => item.name === name)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  const end = Date.now() + 80000
  while (Date.now() < end) { if (check()) { console.log('ok ' + label); return }; await delay(500) }
  throw new Error('Timed out: ' + label)
}
const send = (id, text) => api('send', { sessionId: id, text })
const chief = bot('Chief')
const old = chief.sessionId ?? chief.id
await send(chief.id, 'smoke:complete-task')
await until(() => bot('Chief').sessionId !== old, 'private verified completion creates clean context')
assert.ok(bot('Chief').segments.some(item => item.sessionId === old && item.taskCompleted))
await until(() => existsSync(home + '/bot/memory/bots/' + chief.id + '/task-lessons.md'), 'reusable lesson saved separately')
const temp = await api('create-bot', { name: tempName, role: 'Test worker', employment: 'temporary', quiet: true })
await send(chief.id, 'smoke:task-group ' + JSON.stringify({ name: groupName, members: ['Chief', 'Writer', temp.name] }))
await until(() => room(groupName), 'real task group created')
await delay(1500)
const handoffOld = bot('Chief').sessionId ?? chief.id
await send(chief.id, '群发 ' + groupName + '：@Writer 开始任务')
await until(() => bot('Chief').sessionId !== handoffOld, 'Chief handoff releases private execution context')
const privateWriter = bot('Writer').sessionId
await send(room(groupName).id, '@Chief smoke:finish-group')
await until(() => room(groupName).task.status === 'completed', 'coordinator confirms group completion')
await until(() => room(groupName).task.contextArchivedAt, 'all group execution contexts reset')
assert.equal(bot('Writer').sessionId, privateWriter)
assert.ok(room(groupName).task.result)
assert.ok(bot('Chief').taskIndex.some(item => item.roomId === room(groupName).id && !item.key.startsWith('handoff:')))
await until(() => bot(tempName).retiredAt, 'temporary employee retires without deleting group history')
const retiredState = await api('state')
assert.ok(!retiredState.bots.some(item => item.id === temp.id))
await send(room(groupName).id, '@Writer 修改一下')
await until(() => room(groupName).task.status === 'active', 'follow-up reopens existing group')
assert.equal(room(groupName).task.cycle, 2)
console.log('task lifecycle smoke passed')
