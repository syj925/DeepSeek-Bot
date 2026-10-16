import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/client/main-agent-drag.js', import.meta.url))], bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'] })

function runtime() {
  const listeners = new Map(), frames = new Map(), events = [], children = []
  let sequence = 0, suppressions = 0
  const element = () => ({ style: { setProperty(name, value) { this[name] = value } }, dataset: {}, children: [], querySelectorAll: () => [], setAttribute() {}, append(node) { this.children.push(node) }, remove() { children.splice(children.indexOf(this), 1) }, cloneNode: () => element() })
  const view = {
    CustomEvent: class { constructor(type, props) { this.type = type; this.detail = props.detail } },
    dispatchEvent: event => events.push(event.detail),
    addEventListener: (name, run) => listeners.set(name, run),
    removeEventListener: (name, run) => { if (listeners.get(name) === run) listeners.delete(name) },
    requestAnimationFrame: run => { frames.set(++sequence, run); return sequence },
    cancelAnimationFrame: id => frames.delete(id),
  }
  const doc = { defaultView: view, createElement: element, body: { append: node => children.push(node) } }
  const row = { ownerDocument: doc, dataset: {}, querySelector: selector => selector === '.bt-mark' ? element() : { textContent: 'Chief' } }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => ({}) })
  const event = (x, y, extra = {}) => ({ pointerId: 1, clientX: x, clientY: y, currentTarget: row, preventDefault() {}, ...extra })
  const cancel = module.exports.beginMainAgentDrag(event(100, 100), 'chief', () => suppressions++)
  return { events, children, row, listeners, frames, cancel, get suppressions() { return suppressions }, send: (type, x, y, extra) => listeners.get(type)?.(event(x, y, extra)), flush() { const tasks = [...frames.values()]; frames.clear(); tasks.forEach(run => run()) } }
}

test('a normal contact click creates no drag preview or canvas drop', () => {
  const app = runtime()
  app.send('pointermove', 103, 101)
  app.send('pointerup', 103, 101)
  assert.equal(app.children.length, 0)
  assert.equal(app.events.length, 0)
  assert.equal(app.suppressions, 0)
  assert.equal(app.listeners.size, 0)
})

test('drag uses an avatar and name, batches motion per frame, commits final coordinates and cleans up', () => {
  const app = runtime()
  app.send('pointermove', 200, 180)
  assert.equal(app.row.dataset.contactDragging, 'true')
  const ghost = app.children[0]
  assert.equal(ghost.children.length, 2)
  assert.equal(ghost.children[1].textContent, 'Chief')
  assert.equal(ghost.children[0].style['--bt-size'], '56px')
  app.send('pointermove', 210, 190)
  app.send('pointermove', 220, 200)
  assert.equal(app.frames.size, 1)
  app.flush()
  assert.equal(ghost.style.transform, 'translate3d(160px,160px,0)')
  app.send('pointerup', 250, 230)
  assert.deepEqual(JSON.parse(JSON.stringify(app.events.at(-1))), { id: 'chief', phase: 'end', x: 250, y: 230 })
  assert.equal(app.suppressions, 1)
  assert.equal(app.children.length, 0)
  assert.equal(app.listeners.size, 0)
  assert.equal(app.frames.size, 0)
  assert.equal(app.row.dataset.contactDragging, undefined)
})

test('Escape, pointer cancellation, blur and unmount cancel without placing an Agent', () => {
  for (const type of ['keydown', 'pointercancel', 'blur', 'unmount']) {
    const app = runtime()
    app.send('pointermove', 220, 200)
    if (type === 'unmount') app.cancel()
    else app.send(type, 220, 200, { key: 'Escape' })
    assert.equal(app.events.at(-1).phase, 'cancel')
    assert.equal(app.events.some(event => event.phase === 'end'), false)
    assert.equal(app.listeners.size, 0)
    assert.equal(app.children.length, 0)
    assert.equal(app.frames.size, 0)
  }
})

test('unrelated pointer motion and release cannot move or finish the active drag', () => {
  const app = runtime()
  app.send('pointermove', 500, 500, { pointerId: 2 })
  app.send('pointerup', 500, 500, { pointerId: 2 })
  assert.equal(app.events.length, 0)
  assert.equal(app.listeners.size, 5)
  app.cancel()
  assert.equal(app.listeners.size, 0)
})
