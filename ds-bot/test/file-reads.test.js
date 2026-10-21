import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFileReader } from '../src/client/file-reads.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const ok = text => ({ ok: true, value: { text } })
const failed = code => ({ ok: false, error: { code } })

test('a burst of file reads shares two slots and returns out-of-order contents to their own callers', async () => {
  const pending = []
  let active = 0, peak = 0
  const reader = createFileReader(() => ({ read: (sessionId, path) => {
    active++; peak = Math.max(peak, active)
    return new Promise(resolve => pending.push({ sessionId, path, resolve: value => { active--; resolve(value) } }))
  } }))
  const reads = ['/a.md', '/b.md', '/c.md', '/d.md'].map((path, index) => reader.read(`owner-${index}`, path, {}))
  await tick()
  assert.equal(pending.length, 2)
  pending[1].resolve(ok('B'))
  await tick()
  assert.deepEqual(pending.map(({ sessionId, path }) => [sessionId, path]), [['owner-0', '/a.md'], ['owner-1', '/b.md'], ['owner-2', '/c.md']])
  pending[2].resolve(ok('C'))
  await tick()
  pending[3].resolve(ok('D'))
  pending[0].resolve(ok('A'))
  assert.deepEqual((await Promise.all(reads)).map(result => result.value.text), ['A', 'B', 'C', 'D'])
  assert.equal(peak, 2)
  reader.dispose()
})

test('only transient read failures retry, retaining Session, path and page options', async () => {
  const calls = [], results = [failed('gateway/internal'), failed('gateway/service-unavailable'), ok('Ready')]
  const reader = createFileReader(() => ({ read: async (...args) => { calls.push(args); return results.shift() } }), { retryDelays: [0, 0] })
  const range = { offset: 301, limit: 300 }
  assert.deepEqual(await reader.read('member-group-part', '/report.md', range), ok('Ready'))
  assert.equal(calls.length, 3)
  assert.ok(calls.every(([sessionId, path, options]) => sessionId === 'member-group-part' && path === '/report.md' && options === range))
  reader.dispose()
})

test('binary reads recover from a thrown transport failure without using preview text', async () => {
  let calls = 0
  const data = new Uint8Array([0, 1, 255]), options = {}
  const reader = createFileReader(() => ({ readBytes: async (sessionId, path, requested) => {
    assert.equal(sessionId, 'owner'); assert.equal(path, '/image.png'); assert.equal(requested, options)
    if (++calls === 1) throw Object.assign(new Error('Transport unavailable'), { code: 'gateway/internal' })
    return { ok: true, value: { data, eof: true } }
  } }), { retryDelays: [0, 0] })
  assert.equal((await reader.readBytes('owner', '/image.png', options)).value.data, data)
  assert.equal(calls, 2)
  reader.dispose()
})

test('permanent file failures and programming exceptions do not retry', async () => {
  for (const code of ['workspace-file/not-found', 'workspace-file/outside-workspace', 'workspace-file/too-large', 'gateway/lookup-not-found', 'gateway/bad-request']) {
    let calls = 0
    const result = failed(code)
    const reader = createFileReader(() => ({ read: async () => { calls++; return result } }), { retryDelays: [0, 0] })
    assert.equal(await reader.read('owner', '/file.md', {}), result)
    assert.equal(calls, 1)
    reader.dispose()
  }
  let calls = 0
  const error = new TypeError('Invalid reader implementation')
  const reader = createFileReader(() => ({ read: () => { calls++; throw error } }), { retryDelays: [0, 0] })
  await assert.rejects(reader.read('owner', '/file.md', {}), thrown => thrown === error)
  assert.equal(calls, 1)
  reader.dispose()
})

test('a persistent transient failure stops after three attempts and retains its final code', async () => {
  let calls = 0
  const reader = createFileReader(() => ({ read: async () => { calls++; return failed('gateway/internal') } }), { retryDelays: [0, 0] })
  assert.deepEqual(await reader.read('owner', '/file.md', {}), failed('gateway/internal'))
  assert.equal(calls, 3)
  reader.dispose()
})

test('a temporarily missing reader is resolved again on the next attempt', async () => {
  let lookups = 0
  const reader = createFileReader(() => ++lookups === 1 ? undefined : { read: async () => ok('Connected') }, { retryDelays: [0, 0] })
  assert.deepEqual(await reader.read('owner', '/file.md', {}), ok('Connected'))
  assert.equal(lookups, 2)
  reader.dispose()
})

test('cancelling a queued or active read does not cancel another file or deliver late data', async () => {
  const pending = []
  const reader = createFileReader(() => ({ read: (sessionId, path, _range, signal) => new Promise(resolve => pending.push({ sessionId, path, signal, resolve })) }), { concurrency: 1 })
  const active = new AbortController(), queued = new AbortController()
  const first = assert.rejects(reader.read('one', '/first.md', {}, active.signal), { name: 'AbortError' })
  const second = assert.rejects(reader.read('two', '/second.md', {}, queued.signal), { name: 'AbortError' })
  const third = reader.read('three', '/third.md', {})
  await tick()
  queued.abort()
  await second
  assert.equal(pending.length, 1)
  active.abort()
  await first
  await tick()
  assert.equal(pending[0].signal.aborted, true)
  assert.equal(pending[1].signal.aborted, false)
  assert.equal(pending[1].path, '/third.md')
  pending[0].resolve(ok('Stale'))
  pending[1].resolve(ok('Current'))
  assert.deepEqual(await third, ok('Current'))
  reader.dispose()
})

test('retry backoff leaves another file free to load and closing cancels the remaining retry', async () => {
  let calls = 0
  const controller = new AbortController()
  const reader = createFileReader(() => ({ read: async (_sessionId, path) => { calls++; return path === '/fast.md' ? ok('Next') : failed('gateway/internal') } }), { concurrency: 1, retryDelays: [60000] })
  const result = assert.rejects(reader.read('owner', '/file.md', {}, controller.signal), { name: 'AbortError' })
  await tick()
  assert.deepEqual(await reader.read('other', '/fast.md', {}), ok('Next'))
  controller.abort()
  await result
  assert.equal(calls, 2)
  reader.dispose()
})

test('plugin disposal releases queued and in-flight requests and refuses new work', async () => {
  const pending = []
  const reader = createFileReader(() => ({ read: () => new Promise(resolve => pending.push(resolve)) }), { concurrency: 1 })
  const results = [reader.read('one', '/first.md', {}), reader.read('two', '/second.md', {})].map(result => assert.rejects(result, { name: 'AbortError' }))
  await tick()
  reader.dispose()
  await Promise.all(results)
  await assert.rejects(reader.read('three', '/third.md', {}), { name: 'AbortError' })
  assert.equal(pending.length, 1)
  pending[0](ok('Late'))
})
