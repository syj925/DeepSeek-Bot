import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerOf, requestProblem, manageProblem, checkRoomMembers } from '../src/host/ownership.js'

const state = () => ({ mainBotIds: ['a', 'b'], bots: {
  a: { name: 'Alpha' }, b: { name: 'Beta' },
  ac: { name: 'Alpha child', ownerId: 'a' }, bc: { name: 'Beta child', createdBy: 'b' },
  old: { name: 'Unassigned' }, nested: { createdBy: 'bc' }, cycle: { createdBy: 'cycle' },
} })

test('owner lookup follows explicit owners and legacy creator chains without changing records', () => {
  const value = state(), before = structuredClone(value)
  assert.equal(ownerOf(value, 'ac'), 'a')
  assert.equal(ownerOf(value, 'nested'), 'b')
  assert.equal(ownerOf(value, 'old'), undefined)
  assert.equal(ownerOf(value, 'cycle'), undefined)
  assert.deepEqual(value, before)
})

test('main-to-main and owner-to-child requests work; a foreign child requires its owner', () => {
  const value = state()
  assert.equal(requestProblem(value, 'a', 'b'), undefined)
  assert.equal(requestProblem(value, 'b', 'bc'), undefined)
  assert.match(requestProblem(value, 'a', 'bc'), /belongs to Beta/)
  assert.match(requestProblem(value, 'ac', 'bc'), /belongs to Beta/)
  assert.match(manageProblem(value, 'a', 'b'), /independent/)
  assert.match(manageProblem(value, 'a', 'bc'), /Beta/)
})

test('collaboration rooms only accept mains and never reassign children', () => {
  const value = state(), before = structuredClone(value)
  checkRoomMembers(value, ['a', 'b'], true)
  // A regular group keeps the legacy Main Agent + its own child flow.
  assert.doesNotThrow(() => checkRoomMembers(value, ['a', 'ac']))
  checkRoomMembers(value, ['b', 'bc'])
  assert.throws(() => checkRoomMembers(value, ['a', 'bc'], true), /only Main/)
  assert.throws(() => checkRoomMembers(value, ['a', 'bc']), /belongs to Beta/)
  assert.throws(() => checkRoomMembers(value, ['b', 'bc'], false, 'a'), /belongs to Beta/)
  assert.deepEqual(value, before)
})
