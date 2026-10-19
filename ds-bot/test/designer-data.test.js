import assert from 'node:assert/strict'
import { test } from 'node:test'
import { departmentFor, managerFor, reportsFor } from '../src/client/designer-data.js'
import { sessionMessages } from '../src/client/designer-chat-data.js'

test('designer departments use actual membership, never names or demo role defaults', () => {
  const chief = { id: 'c', generalAssistant: true }, lead = { id: 'l', name: 'Design' }, worker = { id: 'w', name: 'Engineering' }
  const roster = { bots: [chief, lead, worker], byId: { c: chief, l: lead, w: worker }, teams: [{ id: 't', name: 'Actual team', leaderId: 'l', members: ['l', 'w'] }] }
  assert.equal(departmentFor(worker, roster).name, 'Actual team')
  assert.equal(managerFor(worker, roster), lead)
  assert.deepEqual(reportsFor(lead, roster), [worker])
  assert.equal(departmentFor(chief, roster), null)
  assert.equal(departmentFor({ id: 'unknown', name: 'Design' }, roster), null)
  assert.equal(roster.bots.length, 3)
})

const event = (type, seq, data) => ({ event: { type, seq, time: seq * 1000, data } })
test('designer chat excludes system injections and hidden exchanges, keeps durable images', () => {
  const rows = sessionMessages([
    event('user/message', 1, { source: { kind: 'skills' }, content: [{ type: 'text', text: 'internal catalog' }] }),
    event('user/message', 2, { source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello' }, { type: 'image', attachment: { attachmentId: 'a', name: 'photo.png' } }] }),
    event('assistant/message', 3, { turn: 2, message: { content: [{ type: 'text', text: 'private relay' }] } }),
  ], [2])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'Hello')
  assert.equal(rows[0].attachments[0].attachmentId, 'a')
})

test('stream chunks sharing a sequence accumulate and final text replaces the partial', () => {
  const entries = [
    event('assistant/live-chunk', 10, { turn: 1, step: 1, attemptId: 'a', chunk: { type: 'text-delta', text: 'Hel' } }),
    event('assistant/live-chunk', 10, { turn: 1, step: 1, attemptId: 'a', chunk: { type: 'text-delta', text: 'lo' } }),
  ]
  assert.equal(sessionMessages(entries)[0].text, 'Hello')
  entries.push(event('assistant/message', 11, { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'Hello!' }] } }))
  const rows = sessionMessages(entries)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].text, 'Hello!')
  assert.equal(rows[0].live, false)
})

test('group relay replies retain the real speaker identity', () => {
  const rows = sessionMessages([
    event('assistant/message', 1, { message: { content: [{ type: 'tool-call', id: 'call', name: 'group_relay' }] } }),
    event('tool/result', 2, { message: { source: { callId: 'call' }, content: [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'writer', name: 'Writer', text: 'Finished' }] }) }] } }),
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].botId, 'writer')
  assert.equal(rows[0].text, 'Finished')
})
