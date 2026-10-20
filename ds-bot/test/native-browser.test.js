import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openNativeBrowser } from '../src/client/native-browser.js'
import { createSource } from '../src/client/sources.js'

function fixture({ floating = true } = {}) {
  const ready = createSource(undefined), mounted = createSource(undefined), openTabs = createSource([])
  const events = [], subscriptions = new Set()
  const sidebar = {
    ready: { getSnapshot: ready.getSnapshot, subscribe(callback) { const off = ready.subscribe(callback); subscriptions.add(callback); return () => { subscriptions.delete(callback); off() } } },
    mounted, openTabs,
    focus: tabId => events.push(['focus', tabId]),
    openTab: kind => { events.push(['open', kind]); sidebar.active = () => ({ id: 'browser-tab', kind }); openTabs.set([{ sessionId: ready.getSnapshot(), tabId: 'browser-tab', kind }]) },
    active: () => undefined,
    ...(floating ? { float: tabId => events.push(['float', tabId]) } : {}),
  }
  const show = id => { mounted.set(id); ready.set(id) }
  const navigate = id => { events.push(['navigate', id]); show(id) }
  return { ready, mounted, openTabs, events, subscriptions, sidebar, show, navigate }
}

test('opens the true execution session before creating and floating its browser tab', async () => {
  const h = fixture()
  const result = await openNativeBrowser({ sidebar: h.sidebar, sessionId: 'group-writer', navigate: h.navigate })
  assert.deepEqual(h.events, [['navigate', 'group-writer'], ['open', 'browser'], ['float', 'browser-tab']])
  assert.equal(result.sessionId, 'group-writer')
  assert.equal(result.created, true)
  assert.equal(result.floatingRequested, true)
  assert.equal(h.subscriptions.size, 0)
})

test('reuses only the owning session tab from public inventory', async () => {
  const h = fixture()
  h.openTabs.set([{ sessionId: 'other', tabId: 'wrong-tab', kind: 'browser' }, { sessionId: 'group-writer', tabId: 'original', kind: 'browser' }])
  const result = await openNativeBrowser({ sidebar: h.sidebar, sessionId: 'group-writer', navigate: h.navigate })
  assert.deepEqual(h.events, [['navigate', 'group-writer'], ['focus', 'original'], ['float', 'original']])
  assert.equal(result.created, false)
})

test('another ready session cannot capture the open while the target is still mounting', async () => {
  const h = fixture()
  const pending = openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: id => h.events.push(['navigate', id]) })
  h.show('other')
  await Promise.resolve()
  assert.deepEqual(h.events, [['navigate', 'target']])
  h.show('target')
  await pending
  assert.equal(h.events[1][0], 'open')
})

test('a session change after readiness cancels before any browser mutation', async () => {
  const h = fixture()
  const pending = openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: h.navigate })
  h.show('user-selected-other')
  await assert.rejects(pending, /conversation changed/)
  assert.deepEqual(h.events, [['navigate', 'target']])
  assert.equal(h.subscriptions.size, 0)
})

test('cancellation and timeout release subscriptions without late tab creation', async () => {
  for (const cancel of [true, false]) {
    const h = fixture(), controller = new AbortController()
    const pending = openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: () => {}, signal: controller.signal, timeout: 5 })
    if (cancel) controller.abort(new Error('User selected another employee.'))
    await assert.rejects(pending, cancel ? /another employee/ : /did not open/)
    assert.equal(h.subscriptions.size, 0)
    h.show('target')
    assert.deepEqual(h.events, [])
  }
})

test('cancellation before navigation has no UI side effect', async () => {
  const h = fixture(), controller = new AbortController()
  controller.abort()
  await assert.rejects(openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: h.navigate, signal: controller.signal }))
  assert.deepEqual(h.events, [])
  assert.equal(h.subscriptions.size, 0)
})

test('unsupported hosts report the missing interface and do not navigate', async () => {
  let navigated = false
  const result = await openNativeBrowser({ sidebar: {}, sessionId: 'target', navigate: () => { navigated = true } })
  assert.equal(result.supported, false)
  assert.match(result.reason, /unavailable/)
  assert.equal(navigated, false)
  const h = fixture({ floating: false })
  const docked = await openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: h.navigate })
  assert.equal(docked.supported, true)
  assert.equal(docked.floatingSupported, false)
  assert.equal(docked.floatingRequested, false)
})

test('missing browser registration and navigation failures remain visible to the caller', async () => {
  const h = fixture()
  h.sidebar.openTab = () => { throw new Error('No browser tab type is registered') }
  await assert.rejects(openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: h.navigate }), /No browser tab type/)
  assert.equal(h.subscriptions.size, 0)
  await assert.rejects(openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: () => { throw new Error('Conversation unavailable') } }), /Conversation unavailable/)
  assert.equal(h.subscriptions.size, 0)
})

test('session changes caused during focus cannot float another session tab', async () => {
  const h = fixture()
  h.openTabs.set([{ sessionId: 'target', tabId: 'original', kind: 'browser' }])
  h.sidebar.focus = () => h.show('other')
  await assert.rejects(openNativeBrowser({ sidebar: h.sidebar, sessionId: 'target', navigate: h.navigate }), /conversation changed/)
  assert.deepEqual(h.events, [['navigate', 'target']])
})
