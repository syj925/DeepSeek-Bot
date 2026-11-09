import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const { outputFiles } = await build({ entryPoints: ['src/client/task-permissions.js'], bundle: true, format: 'cjs', platform: 'node', write: false, external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => ({ createContext: () => ({}) }) })
const { conversationPermissions } = module.exports

test('task approval panel isolates private sessions, groups and employees', () => {
  const privateEntry = { id: 'private-approval', sessionId: 'old', botId: 'worker' }
  const groupEntry = { id: 'group-approval', sessionId: 'hidden', botId: 'worker', roomId: 'room' }
  const foreign = { id: 'foreign', sessionId: 'other', botId: 'other' }
  const roster = { byId: { current: { id: 'worker' } }, roomsById: { room: { id: 'room' } }, pendingApprovals: [privateEntry, groupEntry, foreign],
    chiefPermissions: { grants: [privateEntry, groupEntry], audit: [privateEntry, groupEntry, foreign] } }
  assert.equal(conversationPermissions('current', roster).pending[0].id, 'private-approval')
  assert.equal(conversationPermissions('current', roster).pending.length, 1)
  assert.equal(conversationPermissions('room', roster).grants[0].id, 'group-approval')
  assert.equal(conversationPermissions('room', roster).audit.length, 1)
  assert.equal(conversationPermissions('missing', roster).pending.length, 0)
})
