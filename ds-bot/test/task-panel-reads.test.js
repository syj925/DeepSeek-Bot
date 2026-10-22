import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTaskPanelReads, TASK_PANEL_READS_KEY } from '../src/client/task-panel-reads.js'

test('viewing files shares read state across surfaces and persists without deleting file records', () => {
  const saved = new Map(), storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
  const reads = createTaskPanelReads(storage)
  let changes = 0
  const off = reads.subscribe(() => changes++)
  assert.equal(reads.isRead('workspace', 'room', 'report:v1'), false)
  reads.markRead('workspace', 'room', ['report:v1'])
  const snapshot = reads.getSnapshot()
  reads.markRead('workspace', 'room', ['report:v1'])
  assert.equal(reads.getSnapshot(), snapshot)
  assert.equal(changes, 1)
  assert.equal(reads.isRead('workspace', 'room', 'report:v2'), false)
  assert.equal(reads.isRead('workspace', 'another-room', 'report:v1'), false)
  assert.equal(reads.isRead('another-workspace', 'room', 'report:v1'), false)
  assert.equal(createTaskPanelReads(storage).isRead('workspace', 'room', 'report:v1'), true)
  off()
})

test('malformed or unavailable read storage cannot prevent opening the panel', () => {
  for (const value of ['null', '[]', '{', '{"w:r":false}', '{"w:r":[1]}']) {
    const reads = createTaskPanelReads({ getItem: () => value, setItem() { throw new Error('full') } })
    assert.equal(reads.isRead('w', 'r', 'file'), false)
    reads.markRead('w', 'r', ['file'])
    assert.equal(reads.isRead('w', 'r', 'file'), true)
  }
  assert.equal(typeof TASK_PANEL_READS_KEY, 'string')
})
