import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChatSurfaces } from '../src/client/chat-surface.js'
import { conversationFailures, recoveryNotice, CHIEF_UNAVAILABLE, CHIEF_DELAYED } from '../src/client/recovery-state.js'

test('a session transfers its editor before the old animated window closes', () => {
  const surfaces = createChatSurfaces(), states = {}, writes = []
  const watch = name => active => { states[name] = active; writes.push([name, active]) }
  const team = surfaces.register('writer', watch('team'))
  const popup = surfaces.register('writer', watch('popup'))
  assert.deepEqual(states, { team: false, popup: true })
  assert.deepEqual(writes.slice(-2), [['team', false], ['popup', true]])
  team.release()
  assert.equal(states.popup, true)
  const other = surfaces.register('researcher', watch('other'))
  assert.equal(states.popup, true)
  assert.equal(states.other, true)
  popup.release(); other.release()
})

test('returning to an existing window restores the editor, released windows cannot reclaim it', () => {
  const surfaces = createChatSurfaces(), states = {}
  const team = surfaces.register('writer', value => { states.team = value })
  const popup = surfaces.register('writer', value => { states.popup = value })
  team.activate()
  assert.deepEqual(states, { team: true, popup: false })
  team.release(); team.release(); team.activate()
  assert.equal(states.popup, true)
  popup.release()
})

test('recovery follows an employee across parts and stays visible in Chief diagnosis', () => {
  const failure = { id: 'f', botId: 'writer', sessionId: 'old', assistance: { botId: 'chief', sessionId: 'chief-part' } }
  const group = { id: 'g', botId: 'writer', sessionId: 'group-part', roomId: 'room' }
  const roster = { byId: { next: { id: 'writer' }, 'chief-part': { id: 'chief' }, other: { id: 'other' } }, roomsById: {}, modelFailures: [failure, group] }
  assert.deepEqual(conversationFailures('next', roster), [failure])
  assert.deepEqual(conversationFailures('chief-part', roster), [failure])
  assert.deepEqual(conversationFailures('room', roster), [group])
  assert.deepEqual(conversationFailures('other', roster), [])
})

test('local reminders include initial unresolved errors, interrupted and delayed diagnosis without repeated polls', () => {
  const sent = { id: 'f', assistance: { status: 'sent' } }
  for (const status of ['failed', 'interrupted']) {
    const failed = { ...sent, assistance: { status } }
    assert.equal(recoveryNotice([sent], [failed]), CHIEF_UNAVAILABLE)
    assert.equal(recoveryNotice([failed], [failed]), null)
  }
  const delayed = { ...sent, assistance: { status: 'delayed' } }
  assert.equal(recoveryNotice([sent], [delayed]), CHIEF_DELAYED)
  assert.equal(recoveryNotice([delayed], [delayed]), null)
  assert.equal(recoveryNotice([], [{ id: 'chief-error', chief: true }]), CHIEF_UNAVAILABLE)
})
