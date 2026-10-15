import assert from 'node:assert/strict'
import { test } from 'node:test'
import { call } from '../src/client/api.js'

test('browser polling uses cookie-authenticated GET without page metadata in its URL', async (t) => {
  const sent = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push({ url, options })
    return Response.json({ ok: true, value: options.method === 'GET' ? [] : true })
  })
  const signal = new AbortController().signal
  const payload = { clientId: 'window/a?b', open: { bot: { url: 'https://private.invalid/?sensitive=value', title: 'Private page' } } }
  assert.deepEqual(await call('browser-wait', payload, signal), [])
  assert.equal(sent[0].url, 'api/bot')
  assert.equal(sent[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(sent[0].options.body), { endpoint: 'browser-pages', payload })
  assert.equal(sent[1].options.method, 'GET')
  assert.equal(sent[1].options.credentials, 'same-origin')
  assert.equal(sent[1].options.cache, 'no-store')
  assert.equal(sent[1].options.signal, signal)
  assert.equal(sent[1].options.body, undefined)
  const params = new URL(sent[1].url, 'https://host.invalid/base/').searchParams
  assert.deepEqual([...params.keys()], ['endpoint', 'clientId'])
  assert.equal(params.get('clientId'), payload.clientId)
  assert.doesNotMatch(sent[1].url, /private|sensitive|token|Private/)
  await call('browser-result', { id: 'read-1', ok: true })
  await call('send', { text: 'Continue' })
  assert.equal(sent[2].options.method, 'POST')
  assert.equal(sent[3].options.method, 'POST')
})

test('a cancelled page report does not start another poll', async (t) => {
  const sent = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push({ url, options })
    throw new DOMException('Cancelled', 'AbortError')
  })
  await assert.rejects(call('browser-wait', { clientId: 'w', open: {} }), { name: 'AbortError' })
  assert.equal(sent.length, 1)
})
