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
  entryPoints: [fileURLToPath(new URL('../src/client/composer-caret.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
})
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture({ plain = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div data-composer-card></div></body>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const card = document.querySelector('[data-composer-card]')
  card.innerHTML = plain ? '<textarea data-bt-home-input style="line-height:24px;font-size:14px">One line</textarea>' : '<div data-composer-input role="textbox" contenteditable="true" style="line-height:24px;font-size:14px"><p>Some text</p></div>'
  const editor = card.firstChild, text = editor.firstChild?.firstChild
  let left = 40, top = 32, measurable = true, neighbor = true
  editor.getBoundingClientRect = () => ({ left: 20, top: 20, right: 280, bottom: 100, width: 260, height: 80 })
  const rect = () => ({ left, top, right: left, bottom: top + 20, height: 20, width: 0 })
  window.Range.prototype.getClientRects = function () { return (this.collapsed ? measurable : neighbor) ? [rect()] : [] }
  window.HTMLSpanElement.prototype.getClientRects = () => measurable ? [rect()] : []
  const frames = new Map(), changes = new Set(), animations = []
  let serial = 0
  window.requestAnimationFrame = run => { const id = ++serial; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.HTMLElement.prototype.animate = function (keyframes, options) {
    const animation = { node: this, keyframes, options, cancelled: false, cancel() { this.cancelled = true } }
    animations.push(animation)
    return animation
  }
  const motion = { matches: false, addEventListener: (_name, run) => changes.add(run), removeEventListener: (_name, run) => changes.delete(run) }
  window.matchMedia = () => motion
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, { module, exports: module.exports })
  const select = (offset = 2, end = offset) => {
    editor.focus()
    if (plain) editor.setSelectionRange(offset, end)
    else {
      const range = document.createRange()
      range.setStart(text, offset); range.setEnd(text, end)
      const selection = document.getSelection()
      selection.removeAllRanges(); selection.addRange(range)
    }
    document.dispatchEvent(new window.Event('selectionchange'))
  }
  return {
    ...module.exports, window, document, card, editor, text, frames, animations, changes,
    get layer() { return document.querySelector('[data-bt-composer-caret]') },
    select,
    move(x, y = top) { left = x; top = y },
    measurable(value, neighborValue = value) { measurable = value; neighbor = neighborValue },
    input() { editor.dispatchEvent(new window.Event('input', { bubbles: true })) },
    compose(type) { return editor.dispatchEvent(new window.CompositionEvent(type, { bubbles: true, cancelable: true })) },
    async paint() { await settle(); const ready = [...frames]; frames.clear(); for (const [, run] of ready) run(); await settle() },
    reduce(value) { motion.matches = value; for (const run of changes) run() },
    close() { dom.window.close() },
  }
}

test('typed insertion glides the visible caret while retaining the editor, text nodes and selection', async () => {
  const app = fixture(), stop = app.observeComposerCaret(app.card)
  try {
    app.select(2); await app.paint()
    const first = app.layer, paragraph = app.editor.firstChild, selection = app.document.getSelection()
    assert.ok(first)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), true)
    assert.equal(first.style.transform, 'translate(40px,32px)')
    assert.equal(first.style.transition, 'none')
    app.move(54); app.select(3); app.input(); await app.paint()
    assert.equal(app.layer, first)
    assert.match(first.style.transition, /transform 80ms/)
    assert.equal(first.style.transform, 'translate(54px,32px)')
    assert.equal(app.editor.firstChild, paragraph)
    assert.equal(paragraph.firstChild, app.text)
    assert.equal(selection.anchorNode, app.text)
    assert.equal(selection.anchorOffset, 3)
    assert.equal(app.animations[0].cancelled, true, 'typing restarts blink in its visible half')
    app.move(24, 56); app.select(4); app.input(); await app.paint()
    assert.equal(first.style.transition, 'none', 'crossing a line must not sweep across text')
  } finally { stop(); app.close() }
})

test('composition follows only a measurable collapsed native Range and restores the native caret otherwise', async () => {
  const app = fixture(), stop = app.observeComposerCaret(app.card)
  try {
    app.select(); await app.paint()
    assert.ok(app.layer)
    assert.equal(app.compose('compositionstart'), true)
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    app.input(); await app.paint()
    assert.ok(app.layer, 'a collapsed pre-edit insertion point can be drawn without altering composition')
    app.move(56); app.input(); await app.paint()
    assert.match(app.layer.style.transition, /80ms/)
    app.select(1, 4); await app.paint()
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    app.select(2); app.measurable(false, true); app.input(); await app.paint()
    assert.equal(app.layer, null, 'composition must never infer a caret from a neighbor glyph')
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    app.measurable(true); app.input(); await app.paint()
    assert.ok(app.layer)
    assert.equal(app.compose('compositionend'), true)
    await app.paint()
    assert.ok(app.layer)
    app.select(1, 4); await app.paint()
    assert.equal(app.layer, null)
    app.select(); app.measurable(false); await app.paint()
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
  } finally { stop(); app.close() }
})

test('textarea measurement leaves the value and selection intact and removes its mirror after each read', async () => {
  const app = fixture({ plain: true }), stop = app.observeComposerCaret(app.card)
  try {
    const value = app.editor.value
    app.select(3); await app.paint()
    assert.ok(app.layer)
    assert.equal(app.editor.value, value)
    assert.equal(app.editor.selectionStart, 3)
    assert.equal(app.document.body.children.length, 2, 'only the card and drawn caret remain')
    app.move(68); app.select(4); app.input(); await app.paint()
    assert.match(app.layer.style.transition, /80ms/)
    app.compose('compositionstart'); app.input(); await app.paint()
    assert.equal(app.layer, null, 'textarea pre-edit retains its native caret because its Range is unavailable')
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    app.compose('compositionend'); await app.paint()
    assert.ok(app.layer)
    app.select(1, 3); await app.paint()
    assert.equal(app.layer, null)
    assert.equal(app.document.body.children.length, 1)
  } finally { stop(); app.close() }
})

test('blur, reduced motion and foreign caret ownership release the overlay without altering input', async () => {
  const app = fixture(), stop = app.observeComposerCaret(app.card)
  try {
    app.select(); await app.paint()
    assert.ok(app.layer)
    app.window.dispatchEvent(new app.window.Event('blur'))
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    app.window.dispatchEvent(new app.window.Event('focus')); await app.paint()
    assert.ok(app.layer)
    app.reduce(true)
    assert.equal(app.layer, null)
    app.reduce(false); await app.paint()
    assert.ok(app.layer)
    Object.defineProperty(app.document, 'hidden', { configurable: true, value: true })
    app.document.dispatchEvent(new app.window.Event('visibilitychange'))
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    Object.defineProperty(app.document, 'hidden', { configurable: true, value: false })
    app.document.dispatchEvent(new app.window.Event('visibilitychange')); await app.paint()
    assert.ok(app.layer)
    app.editor.setAttribute('data-dsh-claude-caret', '')
    app.document.dispatchEvent(new app.window.Event('selectionchange')); await app.paint()
    assert.equal(app.layer, null)
    assert.equal(app.editor.hasAttribute('data-dsh-claude-caret'), true)
  } finally { stop(); app.close() }
})

test('one composer owns only its active field and disposal cancels scheduled work and animation', async () => {
  const app = fixture(), other = app.document.createElement('div'), stop = app.observeComposerCaret(app.card)
  other.innerHTML = '<input data-bt-home-input>'
  app.document.body.appendChild(other)
  try {
    other.firstChild.focus(); app.document.dispatchEvent(new app.window.Event('selectionchange')); await app.paint()
    assert.equal(app.layer, null)
    app.select(); await app.paint()
    assert.ok(app.layer)
    app.input()
    assert.equal(app.frames.size, 1)
    stop()
    assert.equal(app.layer, null)
    assert.equal(app.frames.size, 0)
    assert.equal(app.changes.size, 0)
    assert.equal(app.editor.hasAttribute('data-bt-caret-active'), false)
    assert.ok(app.animations.every(animation => animation.cancelled))
    app.input(); app.document.dispatchEvent(new app.window.Event('selectionchange')); await app.paint()
    assert.equal(app.frames.size, 0)
  } finally { stop(); app.close() }
})
