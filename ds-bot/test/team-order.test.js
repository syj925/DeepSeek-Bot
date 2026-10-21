import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conversationTimes, teamConversationOrder } from '../src/client/team-order.js'

const roster = () => ({
  mainBotId: 'chief',
  bots: [{ id: 'chief' }, { id: 'writer', sessionId: 'writer-chat', createdAt: 1 }, { id: 'designer', sessionId: 'design-chat', createdAt: 2 }],
  rooms: [{ id: 'room', createdAt: 3 }], agents: [], exchangeTurns: {},
})
const ids = rows => rows.map(row => row.item.id)

test('new personal and group messages rise above older conversations, retaining manual pins', () => {
  const team = roster(), stamps = { 'writer-chat': 10, 'design-chat': 20, room: 30 }
  assert.deepEqual(ids(teamConversationOrder(team, stamps)), ['room', 'designer', 'writer'])
  stamps['writer-chat'] = 40
  assert.deepEqual(ids(teamConversationOrder(team, stamps, {}, { 'writer-chat': true })), ['writer', 'room', 'designer'])
  stamps.room = 50
  assert.deepEqual(ids(teamConversationOrder(team, stamps, {}, { 'writer-chat': true, room: true })), ['room', 'writer', 'designer'])
  team.bots[2].pinned = true
  assert.deepEqual(ids(teamConversationOrder(team, stamps, {}, { room: true })), ['designer', 'room', 'writer'])
  assert.equal(team.bots[0].id, 'chief', 'sorting never mutates the roster or duplicates its fixed Chief entry')
})

test('unread rooms remain discoverable after completion and recede after acknowledgement', () => {
  const team = roster()
  team.rooms[0].task = { status: 'completed' }
  assert.ok(!ids(teamConversationOrder(team, {})).includes('room'))
  assert.equal(ids(teamConversationOrder(team, {}, {}, { room: true }))[0], 'room')
  assert.equal(ids(teamConversationOrder(team, {}, { room: true }))[0], 'room')
})

test('activity uses session timestamps with real timestamp-free outlines and ignores internal exchanges', () => {
  const team = roster()
  const list = { ids: ['writer-chat', 'room', 'room-worker'], byId: {
    'writer-chat': { updatedAt: 10, projectionValues: { turnOutline: [{ turn: 1, seq: 1, prompt: 'Hello', response: 'Done' }] } },
    room: { updatedAt: 20 }, 'room-worker': { updatedAt: 200 },
  } }
  let stamps = conversationTimes(list, team)
  assert.equal(stamps['writer-chat'], 10)
  assert.deepEqual(ids(teamConversationOrder(team, stamps)), ['room', 'writer', 'designer'])
  team.exchangeTurns['writer-chat'] = [2]
  list.byId['writer-chat'].updatedAt = 300
  list.projectionsBySession = { 'writer-chat': { values: { turnOutline: [{ turn: 2, seq: 2, prompt: 'Internal delegation' }] } } }
  stamps = conversationTimes(list, team, stamps)
  assert.equal(stamps['writer-chat'], 10)
  assert.equal(conversationTimes(list, team)['writer-chat'], 0, 'a cold load does not count internal work as a public reply')
  list.projectionsBySession['writer-chat'].values.turnOutline.push({ turn: 3, seq: 3, response: 'Public reply' })
  stamps = conversationTimes(list, team, stamps)
  assert.equal(stamps['writer-chat'], 300)
  assert.equal(ids(teamConversationOrder(team, stamps))[0], 'writer')
})

test('archived personal parts and external agent sessions contribute to recency', () => {
  const team = roster()
  team.bots[1].parts = ['writer-old']
  team.agents = [{ id: 'agent', sessions: ['agent-chat'] }]
  assert.deepEqual(ids(teamConversationOrder(team, { 'writer-old': 30, 'agent-chat': 40 })), ['agent', 'writer', 'room', 'designer'])
})
