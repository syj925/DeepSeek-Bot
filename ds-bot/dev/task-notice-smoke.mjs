// Run after dev/smoke.mjs on an isolated mock bench, never a user profile.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const [name, port] = process.argv.slice(2)
if (!/^[a-z0-9-]+$/.test(name ?? '') || !/^\d+$/.test(port ?? '') || port === '3080') throw new Error('Provide an isolated bench name and port')
const home = fileURLToPath(new URL(`../../.dsh-test-${name}/`, import.meta.url))
const base = `http://127.0.0.1:${port}`
const loginUrl = readFileSync(join(home, 'web.log'), 'utf8').match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
assert.ok(loginUrl, 'Start the isolated bench first')
const login = await fetch(loginUrl, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
assert.ok(cookie)
async function api(endpoint, payload = {}) {
  const response = await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  const result = await response.json()
  assert.equal(result.ok, true, result.error?.message)
  return result.value
}
async function settle() {
  const until = Date.now() + 30000
  let quiet = Date.now()
  while (Date.now() < until) {
    const state = await api('state')
    if (Object.keys(state.activity ?? {}).length) quiet = Date.now()
    else if (Date.now() - quiet > 2500) return state
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Task did not settle')
}
const before = await settle()
const bot = before.bots.find(value => value.name === 'Coder') ?? before.bots[0]
const count = before.taskNotices.length
const output = join(home, 'completion-report.txt')
writeFileSync(output, 'Mock completion report. Verified final output.\n')
await api('send', { sessionId: bot.id, text: `smoke:complete-task ${JSON.stringify([output])}` })
const delivered = await settle()
assert.equal(delivered.taskNotices.length, count + 1)
assert.equal(delivered.taskNotices.at(-1).botId, bot.id)
assert.equal(delivered.taskNotices.at(-1).title, 'Mock delivery')
assert.equal(delivered.taskNotices.at(-1).files[0].path, output)
console.log('ok mock model tool call publishes one completion after successful turn')
const incremental = await api('state', { since: delivered.revision, models: delivered.modelsKey })
assert.equal(incremental.taskNotices.at(-1).id, delivered.taskNotices.at(-1).id)
console.log('ok incremental polling retains completion history')
await api('send', { sessionId: bot.id, text: 'Hello, ordinary conversation.' })
const replied = await settle()
assert.equal(replied.taskNotices.length, count + 2)
assert.equal(replied.taskNotices.at(-1).kind, 'message')
assert.equal(replied.taskNotices.at(-1).botId, bot.id)
assert.ok(replied.taskNotices.at(-1).summary)
assert.equal(replied.taskNotices.filter(item => item.kind !== 'message').length, delivered.taskNotices.filter(item => item.kind !== 'message').length)
console.log('ok ordinary conversation automatically sends a message notice, not a task completion')
const saved = JSON.parse(readFileSync(join(home, 'bot/state.json'), 'utf8'))
assert.equal(saved.taskNotices.at(-1).id, replied.taskNotices.at(-1).id)
console.log('ok message and completion history is persisted')
