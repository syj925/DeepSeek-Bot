import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmployeeConversationRestore } from '../src/client/conversation-visibility.js'
import { createSource, indexRoster } from '../src/client/sources.js'

function fixture() {
  const roster = createSource(indexRoster({
    bots: [{ id: 'chief', name: 'Chief' }, { id: 'quote', sessionId: 'quote-current', parts: ['quote-old'], hidden: true },
      { id: 'other', hidden: true }, { id: 'retired', hidden: true, retiredAt: 123 }],
    rooms: [{ id: 'room', hidden: true, members: ['quote', 'other'] }],
  }))
  const persist = (id, flags) => {
    const next = structuredClone(roster.getSnapshot())
    Object.assign(next.bots.find(bot => bot.id === id), flags)
    roster.set(indexRoster(next))
  }
  return { roster, persist }
}

test('explicit reopening restores only the chosen employee and coalesces requests for its session parts', async () => {
  const { roster, persist } = fixture(), calls = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const restore = createEmployeeConversationRestore({ roster,
    setFlags: async (id, flags) => { calls.push({ id, flags }); await gate; persist(id, flags) },
    onError: error => assert.fail(error),
  })
  assert.equal(calls.length, 0, 'loading existing hidden conversations does not restore them')
  const first = restore('quote-old'), second = restore('quote-current'), third = restore('quote')
  assert.equal(first, second); assert.equal(second, third)
  await Promise.resolve()
  assert.deepEqual(calls, [{ id: 'quote', flags: { hidden: false } }])
  release(); await first
  assert.equal(roster.getSnapshot().byId.quote.hidden, false)
  assert.equal(roster.getSnapshot().byId.other.hidden, true)
  assert.equal(roster.getSnapshot().roomsById.room.hidden, true)
  for (const id of ['chief', 'quote', 'missing', 'room', 'retired']) await restore(id)
  assert.equal(calls.length, 1, 'visible, missing, retired employees and groups produce no restore write')
  const reloaded = indexRoster(JSON.parse(JSON.stringify(roster.getSnapshot())))
  assert.equal(reloaded.byId.quote.hidden, false, 'restored visibility survives loading saved state')
  assert.equal(reloaded.byId.other.hidden, true)
  persist('quote', { hidden: true })
  await restore('chief')
  assert.equal(roster.getSnapshot().byId.quote.hidden, true, 'switching to another chat respects a later manual hide')
  await restore('quote')
  assert.equal(calls.length, 2, 'a later explicit reopen can restore this employee again')
})

test('failed visibility writes report once, preserve hidden preferences and retry only on another explicit open', async () => {
  const { roster, persist } = fixture(), errors = []
  let calls = 0
  const failure = new Error('Save unavailable')
  const restore = createEmployeeConversationRestore({ roster, setFlags: (id, flags) => {
    if (++calls === 1) throw failure
    persist(id, flags)
  }, onError: error => errors.push(error) })
  await Promise.all([restore('quote'), restore('quote-current')])
  assert.deepEqual(errors, [failure])
  assert.equal(calls, 1)
  assert.equal(roster.getSnapshot().byId.quote.hidden, true)
  assert.equal(roster.getSnapshot().byId.other.hidden, true)
  await restore('quote')
  assert.equal(calls, 2)
  assert.equal(roster.getSnapshot().byId.quote.hidden, false)
  assert.equal(roster.getSnapshot().byId.other.hidden, true)
})
