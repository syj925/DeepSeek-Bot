import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSource } from '../src/client/sources.js'
import { watchCompletions } from '../src/client/completion-unread.js'

function fixture() {
  const bot = { id: 'writer', sessionId: 'writer-part' }
  const roster = createSource({
    ready: true, bots: [bot], rooms: [{ id: 'room' }], byId: { writer: bot, 'writer-part': bot }, roomsById: { room: { id: 'room' } },
  })
  const sessions = createSource({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  const canvas = createSource({ active: 'writer-window', viewport: { x: 0, y: 0, zoom: 1 }, windows: [{ id: 'writer-window', kind: 'bot', entityId: 'writer', x: 20, y: 100, width: 420, height: 540, open: true, compact: false }] })
  const panels = createSource({ activePanelId: 'ds-bot-canvas' })
  const completions = createSource({})
  const page = { visibilityState: 'visible', listeners: new Set(), addEventListener(type, listener) { if (type === 'visibilitychange') this.listeners.add(listener) }, removeEventListener(type, listener) { this.listeners.delete(listener) } }
  const stop = watchCompletions({ sessions, roster, canvas, panels, completions, canvasSize: () => ({ width: 1000, height: 800, insets: { top: 80, bottom: 100, left: 0, right: 0 } }), page })
  return { bot, roster, sessions, canvas, panels, completions, page, stop }
}

test('initial idle and running baselines do not create historical completion unread', () => {
  const data = fixture()
  data.panels.set({ activePanelId: 'plugins' })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.stop()
})

test('active expanded canvas window acknowledges only the current Bot part', () => {
  const data = fixture()
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('compact canvas cards keep completion unread until the conversation is expanded', () => {
  const data = fixture()
  data.canvas.set({ ...data.canvas.getSnapshot(), windows: [{ ...data.canvas.getSnapshot().windows[0], compact: true }] })
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.canvas.set({ ...data.canvas.getSnapshot(), windows: [{ ...data.canvas.getSnapshot().windows[0], compact: false }] })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('an offscreen active expanded canvas window stays unread', () => {
  const data = fixture()
  data.canvas.set({ ...data.canvas.getSnapshot(), windows: [{ ...data.canvas.getSnapshot().windows[0], x: 3000 }] })
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.stop()
})

test('classic main view clears the completion and Agent mode leaves it unchanged', () => {
  const data = fixture()
  data.panels.set({ activePanelId: 'plugins' })
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false }, agent: { running: true, retainedBy: { mainView: 1 } } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false }, agent: { running: false, retainedBy: { mainView: 1 } } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.sessions.set({ byId: { 'writer-part': { id: 'writer-part', running: false, retainedBy: { mainView: 1 } }, room: { running: false } } })
  data.panels.set({ activePanelId: null })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false }, agent: { running: false, retainedBy: { mainView: 1 } } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false }, agent: { running: false, retainedBy: { mainView: 1 } } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.panels.set({ activePanelId: 'agent-panel' })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.stop()
})

test('current Bot part changes discard the old completion key', () => {
  const data = fixture()
  data.panels.set({ activePanelId: 'plugins' })
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.bot.sessionId = 'writer-next'
  data.roster.set({ ...data.roster.getSnapshot(), bots: [data.bot], byId: { writer: data.bot, 'writer-next': data.bot } })
  data.sessions.set({ byId: { 'writer-next': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('a hidden retained main Session completing behind the canvas remains unread', () => {
  const data = fixture()
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { id: 'room', running: true, retainedBy: { mainView: 1 } } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { id: 'room', running: false, retainedBy: { mainView: 1 } } } })
  assert.deepEqual(data.completions.getSnapshot(), { room: true })
  data.canvas.set({ ...data.canvas.getSnapshot(), active: 'room-window', windows: [{ id: 'room-window', kind: 'room', entityId: 'room', x: 20, y: 100, width: 420, height: 540, open: true }] })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('hidden pages preserve completions until the expanded conversation is visible again', () => {
  const data = fixture()
  data.page.visibilityState = 'hidden'
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), { 'writer-part': true })
  data.page.visibilityState = 'visible'
  for (const listener of data.page.listeners) listener()
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('a completion acknowledged in canvas stays read through Classic and Agent round trips', () => {
  const data = fixture()
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false, completionUnread: true }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.panels.set({ activePanelId: null })
  data.sessions.set({ byId: { 'writer-part': { running: false, completionUnread: true }, room: { running: false }, agent: { id: 'agent', running: true, retainedBy: { mainView: 1 } } } })
  data.sessions.set({ byId: { 'writer-part': { running: false, completionUnread: true }, room: { running: false }, agent: { id: 'agent', running: false, retainedBy: { mainView: 1 } } } })
  data.canvas.set({ ...data.canvas.getSnapshot(), active: null })
  data.panels.set({ activePanelId: 'ds-bot-canvas' })
  assert.deepEqual(data.completions.getSnapshot(), {})
  data.stop()
})

test('plugin disposal removes all completion observers', () => {
  const data = fixture()
  data.stop()
  assert.equal(data.page.listeners.size, 0)
  data.panels.set({ activePanelId: 'plugins' })
  data.sessions.set({ byId: { 'writer-part': { running: true }, room: { running: false } } })
  data.sessions.set({ byId: { 'writer-part': { running: false }, room: { running: false } } })
  assert.deepEqual(data.completions.getSnapshot(), {})
})
