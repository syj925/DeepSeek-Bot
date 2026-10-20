import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const harness = process.env.DSH_HARNESS ?? fileURLToPath(new URL('../dev/harness/', import.meta.url))
const { JSDOM } = createRequire(join(harness, 'package.json'))('jsdom')
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/reasoning-stream.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent', external: ['react'],
})
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture() {
  const dom = new JSDOM('<!doctype html><body><details open data-bt-streaming><summary>Thinking</summary><div><div style="line-height:18px">Public text</div></div></details></body>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const row = document.querySelector('details'), viewport = row.lastElementChild, text = viewport.firstElementChild
  const frames = new Map(), changes = new Set(), resizes = []
  let serial = 0, height = 100
  window.requestAnimationFrame = run => { const id = ++serial; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.ResizeObserver = class {
    constructor(run) { this.run = run; this.nodes = new Set(); resizes.push(this) }
    observe(node) { this.nodes.add(node) }
    disconnect() { this.nodes.clear() }
  }
  Object.defineProperty(viewport, 'scrollHeight', { get: () => height })
  Object.defineProperty(viewport, 'clientHeight', { get: () => 100 })
  const animations = []
  text.animate = (keyframes, options) => {
    const animation = { keyframes, options, cancelled: false, effect: { getComputedTiming: () => ({ progress: 0.5 }) }, cancel() { this.cancelled = true } }
    animations.push(animation)
    return animation
  }
  const motion = { matches: false, addEventListener: (_name, run) => changes.add(run), removeEventListener: (_name, run) => changes.delete(run) }
  window.matchMedia = () => motion
  const hooks = [], sets = []
  let hook = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useLayoutEffect() {},
    useRef(initial) { const index = hook++; return hooks[index] ??= { current: initial } },
    useState(initial) { const index = hook++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; sets.push(value) }] },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => react })
  return {
    ...module.exports, window, document, row, viewport, text, frames, changes, resizes, animations, motion,
    render(props) { hook = 0; return module.exports.ThinkingRow(props) },
    grow(next) { height = next; text.firstChild.appendData(' more') },
    resize() { for (const observer of resizes) if (observer.nodes.size) observer.run() },
    async paint() { await settle(); const batch = [...frames]; frames.clear(); for (const [, run] of batch) run(); await settle() },
    reduce(value) { motion.matches = value; for (const run of changes) run() },
    close() { window.close() },
  }
}

test('reasoning defaults follow generation while explicit reader choices survive completion', () => {
  const app = fixture()
  try {
    assert.equal(app.render({ text: 'Old', streaming: false }).props.open, false)
    assert.equal(app.render({ text: 'New', streaming: true }).props.open, true)
    assert.equal(app.render({ text: 'Done', streaming: false }).props.open, false)
    let node = app.render({ text: 'Done', streaming: false })
    node.props.onToggle({ currentTarget: { open: true } })
    assert.equal(app.render({ text: 'Done', streaming: false }).props.open, true)
    node = app.render({ text: 'More', streaming: true })
    node.props.onToggle({ currentTarget: { open: false } })
    assert.equal(app.render({ text: 'More', streaming: true }).props.open, false)
    assert.equal(app.render({ text: 'Done', streaming: false }).props.open, false)
  } finally { app.close() }
})

test('a capped live window follows new lines with bounded paint motion and keeps its text nodes', async () => {
  const app = fixture(), controller = app.observeReasoningStream(app.row, app.viewport, app.text)
  try {
    await app.paint()
    const node = app.text.firstChild
    app.grow(200)
    await app.paint()
    assert.equal(app.viewport.scrollTop, 100)
    assert.equal(app.viewport.hasAttribute('data-bt-reason-capped'), true)
    assert.equal(app.text.firstChild, node)
    assert.equal(app.animations.length, 1)
    assert.equal(app.animations[0].keyframes[0].transform, 'translateY(27px)')
    app.grow(300); app.grow(310); app.resize()
    await app.paint()
    assert.equal(app.animations.length, 2)
    assert.equal(app.animations[0].cancelled, true)
    app.row.removeAttribute('data-bt-streaming'); controller.sync()
    await app.paint()
    assert.equal(app.viewport.hasAttribute('data-bt-reason-capped'), false)
    assert.equal(app.animations[1].cancelled, true)
  } finally { controller.stop(); app.close() }
})

test('upward reading stops follow immediately, a new tail does not steal position, and the reader can resume', async () => {
  const app = fixture(), controller = app.observeReasoningStream(app.row, app.viewport, app.text)
  try {
    app.grow(250); await app.paint()
    app.viewport.dispatchEvent(new app.window.Event('scroll'))
    app.viewport.dispatchEvent(new app.window.WheelEvent('wheel', { deltaY: -30 }))
    app.viewport.scrollTop = 30
    app.viewport.dispatchEvent(new app.window.Event('scroll'))
    app.grow(330); await app.paint()
    assert.equal(app.row.dataset.btReasonFollowing, 'false')
    assert.equal(app.viewport.scrollTop, 30)
    assert.equal(app.viewport.hasAttribute('data-bt-reason-capped'), false)
    controller.follow(); await app.paint()
    assert.equal(app.row.dataset.btReasonFollowing, 'true')
    assert.equal(app.viewport.scrollTop, 230)
  } finally { controller.stop(); app.close() }
})

test('selection and reduced motion preserve readable public content, and disposal stops every observer and frame', async () => {
  const app = fixture(), controller = app.observeReasoningStream(app.row, app.viewport, app.text)
  try {
    const range = app.document.createRange()
    range.setStart(app.text.firstChild, 0); range.setEnd(app.text.firstChild, 6)
    app.window.getSelection().addRange(range)
    app.grow(220); await app.paint()
    assert.equal(app.row.dataset.btReasonFollowing, 'false')
    assert.equal(app.window.getSelection().toString(), 'Public')
    app.window.getSelection().removeAllRanges()
    app.reduce(true); controller.follow(); await app.paint()
    assert.equal(app.animations.length, 0)
    assert.equal(app.viewport.scrollTop, 120)
    assert.equal(app.viewport.hasAttribute('data-bt-reason-capped'), false)
    controller.stop()
    app.grow(300); app.resize(); await app.paint()
    assert.equal(app.frames.size, 0)
    assert.equal(app.resizes.every(observer => observer.nodes.size === 0), true)
    assert.equal(app.changes.size, 0)
  } finally { controller.stop(); app.close() }
})

test('opening completed reasoning leaves history at the reader\'s own position', async () => {
  const app = fixture()
  app.row.removeAttribute('data-bt-streaming')
  app.grow(400)
  const controller = app.observeReasoningStream(app.row, app.viewport, app.text)
  try {
    await app.paint()
    assert.equal(app.viewport.scrollTop, 0)
    app.viewport.scrollTop = 50
    app.resize(); await app.paint()
    assert.equal(app.viewport.scrollTop, 50)
    assert.equal(app.animations.length, 0)
  } finally { controller.stop(); app.close() }
})
