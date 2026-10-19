import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/client/execution-status.js', import.meta.url))], bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => ({}) })
const state = module.exports.executionState
const bot = { id: 'b', sessionId: 'part' }
const base = { sessionId: 'part', roster: { bots: [bot], byId: { b: bot }, roomsById: {}, questions: {} }, work: { bots: {}, approvals: [] }, running: false, entries: [], pending: false }

test('actual execution separates pending, model wait, tool, streaming and idle', () => {
  assert.equal(state(base), null)
  assert.equal(state({ ...base, pending: true }).kind, 'queued')
  assert.equal(state({ ...base, running: true }).kind, 'waiting')
  const work = { bots: { b: { since: 123, tool: 'read_file' } } }
  assert.equal(state({ ...base, work }).kind, 'tool')
  assert.equal(state({ ...base, work }).since, 123)
  assert.equal(state({ ...base, work, entries: [{ text: 'Answer' }] }).kind, 'reply')
  assert.equal(state({ ...base, work: { bots: { b: { since: 123, roomId: 'other' } } } }), null)
})

test('questions and approvals override running, without leaking unrelated group status', () => {
  const work = { approvals: [{ botId: 'b', roomId: 'other' }] }
  assert.equal(state({ ...base, work }), null)
  work.approvals = [{ botId: 'b' }]
  assert.equal(state({ ...base, work, running: true }).kind, 'approval')
  assert.equal(state({ ...base, roster: { ...base.roster, questions: { part: {} } }, running: true }).kind, 'question')
  const room = { ...base, sessionId: 'r', roster: { ...base.roster, roomsById: { r: { id: 'r' } }, questions: { hidden: { roomId: 'r' } } } }
  assert.equal(state(room).kind, 'question')
  assert.equal(state({ ...base, roster: { ...base.roster, modelFailures: [{ sessionId: 'part' }] } }).kind, 'error')
})
