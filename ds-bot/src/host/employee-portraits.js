import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_AVATAR_IMAGE } from './constants.js'
import { inflateSync } from 'node:zlib'

const kit = new URL('../../skills/artifact-template-qibit-3d-human-agents/', import.meta.url)
const checks = ['familyStyle', 'adult', 'distinctIdentity', 'completeHead', 'cleanEdges', 'transparentBackground']
const LIMIT = 12 * 1024 * 1024

export function validatePortrait(result) {
  const decode = (value, limit) => {
    if (typeof value !== 'string' || value.length > limit || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid portrait image')
    const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG')
    if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error('Portrait must be a non-interlaced RGBA PNG')
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
    if (![256, 1024].includes(width) || width !== height) throw new Error('Invalid portrait dimensions')
    const parts = []
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(at)
      if (at + length + 12 > bytes.length) throw new Error('Truncated PNG')
      let crc = 0xffffffff
      for (const byte of bytes.subarray(at + 4, at + 8 + length)) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0)
      }
      if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(at + 8 + length)) throw new Error('Invalid PNG checksum')
      if (bytes.toString('ascii', at + 4, at + 8) === 'IDAT') parts.push(bytes.subarray(at + 8, at + 8 + length))
      at += length + 12
    }
    const stride = width * 4
    const raw = inflateSync(Buffer.concat(parts), { maxOutputLength: height * (stride + 1) })
    if (raw.length !== height * (stride + 1)) throw new Error('Invalid PNG data')
    let previous = Buffer.alloc(stride), transparent = false, visible = false
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(stride), filter = raw[y * (stride + 1)]
      if (filter > 4) throw new Error('Invalid PNG filter')
      for (let x = 0; x < stride; x++) {
        const a = x < 4 ? 0 : row[x - 4], b = previous[x], c = x < 4 ? 0 : previous[x - 4]
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        row[x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
        if (x % 4 === 3) { transparent ||= row[x] === 0; visible ||= row[x] > 0 }
      }
      previous = row
    }
    if (!transparent || !visible) throw new Error('Portrait must have visible content and real transparency')
    return bytes
  }
  const original = decode(result.image, LIMIT)
  const thumbnail = decode(result.thumbnail, MAX_AVATAR_IMAGE)
  if (original.readUInt32BE(16) !== 1024 || original.readUInt32BE(20) !== 1024) throw new Error('Portrait must be 1024 by 1024')
  if (thumbnail.readUInt32BE(16) !== 256 || thumbnail.readUInt32BE(20) !== 256) throw new Error('Thumbnail must be 256 by 256')
  if (!checks.every(key => result.review?.[key] === true)) throw new Error('Portrait did not pass visual review')
  return { original, thumbnail }
}

export function install(rt) {
  const jobs = new Map()
  let tail = Promise.resolve()
  const service = () => {
    const address = rt.config.portraitServiceUrl
    if (!address) return undefined
    const url = new URL(address)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return undefined
    if (url.username || url.password) return undefined
    return url.href
  }
  const status = bot => {
    const current = bot.portraitGeneration
    return current && ['queued', 'generating'].includes(current.status) && !jobs.has(bot.id)
      ? { ...current, status: 'interrupted' } : current
  }
  rt.portraitStatus = status
  rt.portraitServiceAvailable = () => { try { return Boolean(service()) } catch { return false } }
  rt.cancelPortrait = id => { jobs.get(id)?.abort(); jobs.delete(id) }
  rt.ctx.effect(() => () => { for (const controller of jobs.values()) controller.abort(); jobs.clear() }, 'ds-bot: portrait jobs')
  rt.requestPortrait = async id => {
    const bot = rt.botOf(id)
    if (!bot || bot.retiredAt) throw new Error('Only active employees can receive a portrait')
    if (jobs.has(id)) return bot.portraitGeneration
    if (jobs.size >= 20) throw new Error('Portrait queue is full. Try again later.')
    const requestId = randomUUID()
    if (!rt.portraitServiceAvailable()) {
      bot.portraitGeneration = { status: 'unavailable', requestId }
      await rt.save()
      return bot.portraitGeneration
    }
    const controller = new AbortController()
    jobs.set(id, controller)
    bot.portraitGeneration = { status: 'queued', requestId }
    try { await rt.save() } catch (error) { jobs.delete(id); throw error }
    const current = () => rt.botOf(id) === bot && !bot.retiredAt && jobs.get(id) === controller && bot.portraitGeneration?.requestId === requestId && !controller.signal.aborted
    const work = async () => {
      try {
        if (!current()) return
        bot.portraitGeneration = { status: 'generating', requestId }
        await rt.save()
        const [skill, promptKit, reference] = await Promise.all([
          readFile(new URL('SKILL.md', kit), 'utf8'), readFile(new URL('references/prompt-kit.md', kit), 'utf8'), readFile(new URL('assets/reference.png', kit)),
        ])
        const token = process.env.QIBIT_PORTRAIT_TOKEN
        const response = await fetch(service(), {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ requestId, employee: { name: bot.name, role: bot.role }, skill, promptKit,
            reference: `data:image/png;base64,${reference.toString('base64')}`, size: '1024x1024', background: 'transparent', thumbnailSize: 256,
            requiredReview: checks }),
        })
        if (!response.ok) throw new Error('Portrait service failed')
        const chunks = []
        let size = 0
        for await (const chunk of response.body) {
          size += chunk.length
          if (size > LIMIT) throw new Error('Portrait response too large')
          chunks.push(chunk)
        }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const images = validatePortrait(result)
        if (!current()) return
        const folder = join(rt.home, 'portraits')
        await mkdir(folder, { recursive: true })
        await writeFile(join(folder, `${requestId}.png`), images.original, { flag: 'wx' })
        await writeFile(join(folder, `${requestId}-thumb.png`), images.thumbnail, { flag: 'wx' })
        if (!current()) return
        bot.avatar = { image: result.thumbnail, portraitId: requestId }
        bot.portraitGeneration = { status: 'generated', requestId }
        await rt.save()
      } catch {
        if (current()) {
          bot.portraitGeneration = { status: 'failed', requestId }
          await rt.save().catch(() => {})
        }
      } finally {
        if (jobs.get(id) === controller) jobs.delete(id)
      }
    }
    tail = tail.then(work, work)
    return bot.portraitGeneration
  }
}
