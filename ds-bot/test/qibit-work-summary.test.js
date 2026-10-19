import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qibitWorkSummary } from '../src/client/qibit-work-summary.js'

test('work overview uses actual completion records, not chatter or idle state', () => {
  const roster = { rooms: [{ id: 'r', name: 'Analysis', task: { objective: 'Analyze sales data', status: 'active' } }], taskNotices: [
    { id: 'chat', kind: 'message', title: 'New message' },
    { id: 'private', botId: 'b', title: 'Write meeting notes', summary: 'Recorded three decisions', at: 10 },
    { id: 'duplicate', roomId: 'r', title: 'Analyze sales data' },
  ] }
  const view = qibitWorkSummary('plan', roster)
  assert.equal(view.tasks.length, 2)
  assert.equal(view.completed, 1)
  assert.equal(view.results[0].summary, 'Recorded three decisions')
  assert.equal(qibitWorkSummary('data', roster).completed, 0)
  assert.equal(qibitWorkSummary('customer', roster).tasks.length, 1, 'sales analysis can also belong to customer work')
  roster.rooms[0].task.status = 'completed'
  roster.rooms[0].task.result = { summary: 'Sales grew 5% based on the supplied table' }
  assert.equal(qibitWorkSummary('data', roster).completed, 1)
})

test('schedule uses only valid active records and never invents a date', () => {
  const tasks = [{ id: 'invalid', title: 'Meeting', status: 'active', scheduledAt: 'unknown' },
    { id: 'paused', title: 'Meeting', status: 'paused', scheduledAt: '2026-10-20T10:00:00Z' },
    { id: 'later', title: 'Meeting review', status: 'active', scheduledAt: '2026-10-21T10:00:00Z' },
    { id: 'first', title: 'Meeting notes', status: 'active', scheduledAt: '2026-10-20T10:00:00Z' }]
  assert.deepEqual(qibitWorkSummary('meeting', {}, {}, { available: true, tasks }).upcoming.map(t => t.id), ['first', 'later'])
  assert.equal(qibitWorkSummary('plan', {}, {}, { available: false, tasks }).upcoming.length, 0)
  assert.equal(qibitWorkSummary('plan').tasks.length, 0)
})

test('private work appears as running without inflating completed task counts', () => {
  const view = qibitWorkSummary('plan', { byId: { b: { name: 'Writer' } } }, { bots: { b: { since: 1 }, c: { roomId: 'r' } } })
  assert.deepEqual(view.running, [{ id: 'b', name: 'Writer' }])
  assert.equal(view.completed, 0)
  assert.equal(view.tasks.length, 0)
})
