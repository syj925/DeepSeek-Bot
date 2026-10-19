import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install } from '../src/host/recovery.js'

function host() {
  const bots = { a: { id: 'a', name: 'Chief', model: 'mock/default' }, b: { id: 'b', name: 'Writer', model: 'mock/default' } }
  const rooms = { r: { id: 'r', members: ['a', 'b'], sessions: { b: 'gb' } } }
  const sent = []
  const rt = { state: { generalAssistantId: 'a' }, live: new Map(), roomProgress: new Map(), groupOwners: new Map([['gb', { roomId: 'r', botId: 'b' }]]),
    botOf: id => bots[id], roomOf: id => rooms[id], selfOf: id => id, chatOf: id => id,
    isGeneralAssistant: id => id === 'a', save: async () => {}, load: async () => {}, warn: () => {},
    resolveAgent: async () => ({ inbox: { nextTurn: [], nextStep: [] } }), deliver: async value => { sent.push(value) } }
  install(rt)
  const fail = (sessionId = 'b') => {
    rt.recordModelFailure(sessionId, { code: 'INVALID_REQUEST', status: 400, message: 'SECRET original task' })
    const record = rt.state.modelFailures.find(item => item.sessionId === sessionId)
    record.at -= 3000
    return record
  }
  return { rt, sent, fail, rooms }
}

test('failure metadata excludes raw provider messages; successful retry clears it', async () => {
  const { rt, sent, fail } = host()
  const failure = fail()
  assert.ok(!JSON.stringify(rt.failuresView()).includes('SECRET'))
  await rt.recoverFailure({ id: failure.id, action: 'retry' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].sessionId, 'b')
  assert.match(sent[0].text, /do not repeat completed side effects/)
  assert.equal(rt.failuresView()[0].retrying, true)
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'retry' }), /still working/)
  rt.finishRecovery('b', { kind: 'completed' }, { exchangeId: sent[0].exchangeId })
  assert.deepEqual(rt.failuresView(), [])
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'retry' }), /no longer current/)
})

test('diagnosis uses Chief own session, preserves original failure and never retries it', async () => {
  const { rt, sent, fail } = host()
  const failure = fail('gb')
  await rt.recoverFailure({ id: failure.id, action: 'diagnose' })
  assert.equal(sent[0].sessionId, 'a')
  assert.equal(sent[0].roomId, undefined)
  assert.match(sent[0].text, /read-only diagnosis/)
  assert.ok(!sent[0].text.includes('SECRET'))
  await rt.recoverFailure({ id: failure.id, action: 'diagnose' })
  assert.equal(sent.length, 1)
  rt.finishRecovery('a', { kind: 'completed' }, { exchangeId: sent[0].exchangeId })
  assert.equal(rt.failuresView()[0].assistance.status, 'replied')
  assert.equal(rt.failuresView()[0].sessionId, 'gb')
})

test('Chief errors and delayed diagnoses surface independently of a model reply', async () => {
  const { rt, sent, fail } = host()
  const failure = fail()
  await rt.recoverFailure({ id: failure.id, action: 'diagnose' })
  failure.assistance.at -= 91000
  assert.equal(rt.failuresView()[0].assistance.status, 'delayed')
  rt.finishRecovery('a', { kind: 'error' }, { exchangeId: sent[0].exchangeId })
  const chiefFailure = fail('a')
  assert.equal(rt.failuresView()[0].assistance.status, 'failed')
  assert.equal(rt.failuresView()[1].chief, true)
  await assert.rejects(rt.recoverFailure({ id: chiefFailure.id, action: 'diagnose' }), /unavailable/)
})

test('refuses running rounds, old parts, unknown actions and rapid repeats', async () => {
  const { rt, fail, rooms } = host()
  const failure = fail('gb')
  rt.roomProgress.set('round', { roomId: 'r' })
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'retry' }), /still working/)
  rt.roomProgress.clear()
  rooms.r.sessions.b = 'new-part'
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'retry' }), /new part/)
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'reset' }), /Unknown/)
  rooms.r.sessions.b = 'gb'
  failure.at = Date.now()
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'retry' }), /wait a moment/)
})

test('delivery failure clears the pending lock and records a local diagnosis failure', async () => {
  const { rt, fail } = host()
  const failure = fail()
  rt.deliver = async () => { throw new Error('offline') }
  await assert.rejects(rt.recoverFailure({ id: failure.id, action: 'diagnose' }), /offline/)
  assert.equal(rt.failuresView()[0].assistance.status, 'failed')
  assert.equal(rt.failuresView()[0].busy, false)
})

test('restarting does not silently re-send diagnostics or hide failures', async () => {
  const { rt, fail } = host()
  const failure = fail()
  await rt.recoverFailure({ id: failure.id, action: 'diagnose' })
  install(rt)
  assert.equal(rt.failuresView()[0].assistance.status, 'interrupted')
})
