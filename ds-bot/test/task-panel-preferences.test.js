import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTaskPanelPreferences, TASK_PANEL_PREFERENCES_KEY } from '../src/client/task-panel-preferences.js'

test('panel choices persist per conversation, synchronize between windows and can be undone', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const handlers = new Set(), events = { addEventListener: (_, fn) => handlers.add(fn), removeEventListener: (_, fn) => handlers.delete(fn) }
  const first = createTaskPanelPreferences(storage, events)
  first.removeFile('workspace', 'worker', '/report.csv', 'report:1')
  first.setCollapsed('workspace', 'worker', 'experience', true)
  const second = createTaskPanelPreferences(storage, events)
  assert.equal(second.get('workspace', 'worker').removedFiles['/report.csv'], 'report:1')
  assert.equal(second.get('workspace', 'worker').collapsed.experience, true)
  assert.deepEqual(second.get('workspace', 'other').removedFiles, {})
  assert.deepEqual(second.get('other-workspace', 'worker').removedFiles, {})
  let changes = 0
  const off = first.subscribe(() => changes++)
  second.restoreFile('workspace', 'worker', '/report.csv', 'report:1')
  for (const handler of handlers) handler({ key: TASK_PANEL_PREFERENCES_KEY, storageArea: storage })
  assert.equal(changes, 1)
  assert.deepEqual(first.get('workspace', 'worker').removedFiles, {})
  assert.equal(first.get('workspace', 'worker').collapsed.experience, true)
  off(); assert.equal(handlers.size, 0)
})

test('restored files clear removal marks while malformed or full browser storage cannot break the panel', () => {
  const storage = { getItem: () => '{broken', setItem() { throw new Error('quota exceeded') } }
  const preferences = createTaskPanelPreferences(storage, {})
  preferences.removeFile('workspace', 'worker', '/report.csv', 'report:1')
  preferences.removeFile('workspace', 'worker', '/notes.md', 'notes:1')
  preferences.setCollapsed('workspace', 'worker', 'files', true)
  const off = preferences.subscribe(() => {})
  assert.equal(preferences.get('workspace', 'worker').removedFiles['/report.csv'], 'report:1')
  preferences.clearRestoredFiles('workspace', 'worker', ['/report.csv'])
  assert.deepEqual(preferences.get('workspace', 'worker').removedFiles, { '/notes.md': 'notes:1' })
  preferences.restoreFile('workspace', 'worker', '/notes.md', 'older-revision')
  assert.equal(preferences.get('workspace', 'worker').removedFiles['/notes.md'], 'notes:1')
  preferences.setCollapsed('workspace', 'worker', 'files', false)
  assert.deepEqual(preferences.get('workspace', 'worker').collapsed, {})
  off()
})
