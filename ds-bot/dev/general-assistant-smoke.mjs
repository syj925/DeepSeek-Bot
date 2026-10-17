// Run against the isolated mock bench after dev/smoke.mjs; never a user profile.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [name = 'smoke', port = '3096'] = process.argv.slice(2)
if (!/^[a-z0-9-]+$/.test(name) || !/^\d+$/.test(port)) throw new Error('Invalid isolated bench name or port')
const home = fileURLToPath(new URL(`../../.dsh-test-${name}/`, import.meta.url))
const base = `http://127.0.0.1:${port}`
const log = readFileSync(join(home, 'web.log'), 'utf8')
const loginUrl = log.match(new RegExp(`http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+`))?.[0]
assert.ok(loginUrl, 'Start the isolated smoke bench first')
const login = await fetch(loginUrl, { redirect: 'manual' })
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
assert.ok(cookie)
async function api(endpoint, payload = {}) {
  const response = await fetch(`${base}/api/bot`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }) })
  const result = await response.json()
  assert.equal(result.ok, true, result.error?.message)
  return result.value
}
const state = () => JSON.parse(readFileSync(join(home, 'bot', 'state.json'), 'utf8'))
const calls = () => readFileSync(join(home, 'mock.jsonl'), 'utf8').trim().split('\n').length
async function settle() {
  const deadline = Date.now() + 60000
  let count = calls(), quiet = Date.now()
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 400))
    const live = await api('state')
    if (calls() !== count || Object.keys(live.activity ?? {}).length) { count = calls(); quiet = Date.now() }
    else if (Date.now() - quiet > 2500) return
  }
  throw new Error('Mock team did not settle')
}
const send = async (id, text) => { await api('send', { sessionId: id, text }); await settle() }

// Check the old folder smoke assertion with native Windows path canonicalization.
const coder = Object.values(state().bots).find(bot => bot.name === 'Coder')
const folder = realpathSync.native(mkdtempSync(join(tmpdir(), 'ds-bot-native-folder-')))
try {
  await api('update-bot', { id: coder.id, workDir: folder })
  assert.equal(state().bots[coder.id].workDir, folder)
  await api('update-bot', { id: coder.id, workDir: '' })
  console.log('ok native Windows working folder')
} finally { rmSync(folder, { recursive: true, force: true }) }

const before = calls()
const [assistant, again] = await Promise.all([api('ensure-general-assistant'), api('ensure-general-assistant')])
assert.equal(assistant.id, again.id)
await settle()
assert.equal(calls(), before, 'Opening the assistant must not call a model')
console.log('ok singleton assistant without a model call')

await send(assistant.id, 'smoke:create-department')
let saved = state()
const room = Object.values(saved.rooms).find(value => value.department?.name === 'Smoke department')
assert.ok(room, 'Real model tool call must create a department')
const leader = saved.bots[room.admin]
assert.ok(saved.mainBotIds.includes(leader.id))
const child = room.members.map(id => saved.bots[id]).find(bot => bot.id !== leader.id)
const team = saved.teams[room.teamId]
assert.ok(team)
assert.equal(team.leaderId, leader.id)
assert.equal(child.teamId, team.id)
assert.ok(team.members.includes(child.id))
assert.equal(room.createdBy, leader.id)
console.log('ok model tool creates a lasting team, leader, specialist and separate group')

const count = Object.keys(saved.bots).length
await send(assistant.id, 'smoke:create-department')
assert.equal(Object.keys(state().bots).length, count)
console.log('ok repeated request reuses the department')

await send(room.id, '讨论')
const answers = state().rooms[room.id].log.filter(line => line.who !== 'User' && line.kind === undefined)
assert.ok(answers.some(line => line.who === leader.name))
assert.ok(answers.some(line => line.who === child.name))
console.log('ok department leader and specialist both speak in the real group')

// An ordinary employee can contact and group with an employee outside its team.
const affiliations = Object.fromEntries(Object.values(state().bots).map(bot => [bot.id, bot.teamId ?? null]))
await send(child.id, '转告 Coder: cross-team-direct-smoke')
assert.ok(state().exchanges.some(entry => entry.from === child.id && entry.to === coder.id && entry.role === 'request' && entry.text.includes('cross-team-direct-smoke')))
await send(child.id, '建群 CrossTeamSmoke: Coder')
const crossRoom = Object.values(state().rooms).find(value => value.name === 'CrossTeamSmoke')
assert.ok(crossRoom)
assert.ok(crossRoom.members.includes(child.id) && crossRoom.members.includes(coder.id))
await send(child.id, '群发 CrossTeamSmoke: cross-team-room-smoke')
assert.ok(state().rooms[crossRoom.id].log.some(line => line.text?.includes('cross-team-room-smoke')))
assert.deepEqual(Object.fromEntries(Object.values(state().bots).map(bot => [bot.id, bot.teamId ?? null])), affiliations)
console.log('ok ordinary employee contacts and groups across teams without changing affiliation')
