import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const [bench = 'clear-context', port = '3127'] = process.argv.slice(2)
if (!/^[a-z0-9-]+$/.test(bench) || !/^\d+$/.test(port)) throw new Error('Invalid bench')
const home = fileURLToPath(new URL('../../.dsh-test-' + bench, import.meta.url))
const base = `http://127.0.0.1:${port}`
const url = readFileSync(home + '/web.log', 'utf8').split(/\s+/).find(value => value.startsWith(base + '/?token='))
const login = await fetch(url, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
async function api(endpoint, payload = {}) {
  const res = await fetch(base + '/api/bot', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  const data = await res.json()
  assert.ok(data.ok, data.error?.message)
  return data.value
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let n = 0; n < 120; n++) { const value = await check(); if (value) return value; await delay(250) }
  throw new Error('Timed out waiting for clear')
}
const records = () => readFileSync(home + '/mock.jsonl', 'utf8').trim().split('\n').map(JSON.parse)
const chief = (await api('state')).bots.find(bot => bot.name === 'Chief')
const send = text => api('send', { sessionId: chief.id, text })
const old = chief.sessionId
await send('clear-benchmark ' + 'reference-material '.repeat(500))
await until(() => records().findLast(r => r.session === old && r.last?.startsWith('clear-benchmark')))
await delay(2500)
await send('baseline-check')
const before = await until(() => records().findLast(r => r.session === old && r.last?.startsWith('baseline-check')))
await delay(2500)
const calls = records().length
await send('/clear')
const fresh = await until(async () => (await api('state')).bots.find(bot => bot.id === chief.id && bot.sessionId !== old))
await delay(2500)
assert.equal(records().length, calls, '/clear must not call the model')
await send('after-clear-check')
const after = await until(() => records().findLast(r => r.session === fresh.sessionId && r.last?.startsWith('after-clear-check')))
assert.equal(after.messages, 3)
assert.ok(after.first.startsWith('[Context cleared'))
assert.ok(after.tokens < before.tokens)
await delay(1500)
assert.equal((await api('state')).bots.find(bot => bot.id === chief.id).contextClearedAt, undefined)
console.log(JSON.stringify({ before: { tokens: before.tokens, messages: before.messages }, after: { tokens: after.tokens, messages: after.messages }, modelCallsToClear: 0 }))
