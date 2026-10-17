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

test('cross-team requests work while management remains scoped', () => {
  const value = state()
  assert.equal(requestProblem(value, 'a', 'b'), undefined)
  assert.equal(requestProblem(value, 'b', 'bc'), undefined)
  assert.equal(requestProblem(value, 'a', 'bc'), undefined)
  assert.equal(requestProblem(value, 'ac', 'bc'), undefined)
  assert.match(manageProblem(value, 'a', 'b'), /independent/)
  assert.match(manageProblem(value, 'a', 'bc'), /Beta/)
})

test('collaboration rooms accept all employees without changing affiliation', () => {
  const value = state(), before = structuredClone(value)
  checkRoomMembers(value, ['a', 'b'], true)
  // A regular group keeps the legacy Main Agent + its own child flow.
  assert.doesNotThrow(() => checkRoomMembers(value, ['a', 'ac']))
  checkRoomMembers(value, ['b', 'bc'])
  assert.doesNotThrow(() => checkRoomMembers(value, ['a', 'bc'], true))
  assert.doesNotThrow(() => checkRoomMembers(value, ['a', 'bc']))
  assert.doesNotThrow(() => checkRoomMembers(value, ['b', 'bc'], false, 'a'))
  assert.deepEqual(value, before)
})
