import assert from 'node:assert/strict'
import test from 'node:test'
import { botUpdateHint, installedUpdateText } from '../src/client/update-status.js'

test('hosted update failures and unavailable releases never say up to date', () => {
  assert.equal(botUpdateHint({ checkedAt: 1, latest: '0.1.6', checkError: 'Gateway unavailable' }),
    'Could not check for updates: Gateway unavailable')
  assert.equal(botUpdateHint({ source: 'hosted', checkedAt: 1, unavailableReason: 'No stable release has been published yet.' }),
    'No stable release has been published yet.')
})

test('applied, pending restart and cancelled updates have distinct user messages', () => {
  assert.equal(installedUpdateText({ source: 'hosted', installed: '0.1.6', application: 'applied' }),
    'DS Bot 0.1.6 has been applied.')
  assert.equal(installedUpdateText({ source: 'hosted', installed: '0.1.6', application: 'restart-required' }),
    'DS Bot 0.1.6 is installed. Quit and reopen QibitAI Desktop to use it.')
  assert.equal(botUpdateHint({ phase: 'cancelled', available: true, latest: '0.1.6' }), 'Update cancelled.')
})
