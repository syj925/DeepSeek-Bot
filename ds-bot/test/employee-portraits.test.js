import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { install, validatePortrait } from '../src/host/employee-portraits.js'
import { employeeIcon, temporaryIdentity, replyIdentity } from '../src/shared/employee-avatar.js'

function png(size, opaque = false) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length); body.copy(out, 4)
    let crc = 0xffffffff
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0) }
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4)
    return out
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  const pixels = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels[y * (size * 4 + 1) + x * 4 + 4] = opaque || x > size / 4 && x < size * .75 ? 255 : 0
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const result = () => ({ image: png(1024), thumbnail: png(256), review: { familyStyle: true, adult: true, distinctIdentity: true, completeHead: true, cleanEdges: true, transparentBackground: true } })

test('temporary icons preserve transcript identity after promotion and retirement', () => {
  const bot = { id: 'temp', name: 'Writer', role: '文案', employment: 'temporary' }
  assert.equal(employeeIcon(bot), 'write')
  const reply = { botId: bot.id, ...temporaryIdentity(bot) }
  bot.employment = 'long-term'; bot.avatar = { image: 'custom' }
  assert.equal(employeeIcon(replyIdentity(reply, { byId: { temp: bot } })), 'write')
  assert.equal(employeeIcon(bot), undefined)
  assert.equal(employeeIcon({ employment: 'long-term' }), undefined)
  assert.equal(employeeIcon(replyIdentity({ botId: 'old' }, { byId: {}, retiredById: { old: { employment: 'temporary', role: '工程' } } })), 'code')
})

test('portrait validation rejects opaque backgrounds and failed review', () => {
  assert.ok(validatePortrait(result()).original.length)
  assert.throws(() => validatePortrait({ ...result(), image: png(1024, true) }), /transparency/)
  assert.throws(() => validatePortrait({ ...result(), review: {} }), /review/)
  assert.throws(() => validatePortrait({ ...result(), image: png(256) }), /1024/)
})

test('portrait jobs are asynchronous, deduplicated, saved and never overwrite manual uploads', async t => {
  const home = await mkdtemp(join(tmpdir(), 'qibit-portrait-'))
  const bot = { id: 'employee', name: 'Writer', role: 'Writer', avatar: { icon: 'write' } }
  const disposers = []
  const rt = { home, config: {}, ctx: { effect: fn => disposers.push(fn()) }, botOf: () => bot, save: async () => {} }
  install(rt)
  t.after(async () => { disposers.forEach(fn => fn()); await rm(home, { recursive: true, force: true }) })
  assert.equal((await rt.requestPortrait(bot.id)).status, 'unavailable')
  let received, release, requests = 0
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    received = JSON.parse(Buffer.concat(chunks)); requests++
    release = () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result())) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  rt.config.portraitServiceUrl = `http://127.0.0.1:${server.address().port}/portrait`
  const until = async fn => { for (let i = 0; i < 300; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 10)) }; throw new Error('Timed out') }
  await rt.requestPortrait(bot.id); await rt.requestPortrait(bot.id)
  await until(() => release)
  assert.equal(requests, 1)
  assert.match(received.skill, /QiBit/)
  assert.match(received.reference, /^data:image\/png/)
  assert.equal(received.employee.instructions, undefined)
  assert.equal(bot.avatar.icon, 'write')
  release(); await until(() => bot.portraitGeneration.status === 'generated')
  assert.equal((await readdir(join(home, 'portraits'))).length, 2)
  assert.match(bot.avatar.image, /^data:image\/png/)
  release = null
  await rt.requestPortrait(bot.id); await until(() => release)
  rt.cancelPortrait(bot.id); bot.avatar = { image: 'manual' }; delete bot.portraitGeneration
  release(); await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(bot.avatar.image, 'manual')
  bot.portraitGeneration = { status: 'generating' }
  assert.equal(rt.portraitStatus(bot).status, 'interrupted')
})
