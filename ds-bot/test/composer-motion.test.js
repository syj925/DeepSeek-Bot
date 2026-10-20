import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const harness = process.env.DSH_HARNESS ?? fileURLToPath(new URL('../dev/harness/', import.meta.url))
const { JSDOM } = createRequire(join(harness, 'package.json'))('jsdom')
const { default: Specificity } = createRequire(join(harness, 'package.json'))('@bramus/specificity')
const cssTree = createRequire(join(harness, 'package.json'))('css-tree')
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/composer-motion.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent', external: ['react'],
})
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture() {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const frames = new Map(), resizes = [], changes = new Set()
  let serial = 0
  window.requestAnimationFrame = run => { const id = ++serial; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.ResizeObserver = class {
    constructor(run) { this.run = run; this.nodes = new Set(); resizes.push(this) }
    observe(node) { this.nodes.add(node) }
    unobserve(node) { this.nodes.delete(node) }
    disconnect() { this.nodes.clear() }
  }
  const motion = { matches: false, addEventListener: (_name, run) => changes.add(run), removeEventListener: (_name, run) => changes.delete(run) }
  window.matchMedia = () => motion
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => ({}) })
  const surface = ({ home = false } = {}) => {
    const card = document.createElement(home ? 'form' : 'div')
    if (home) { card.className = 'bt-qibit-search'; card.innerHTML = '<textarea data-bt-home-input style="min-height:36px;max-height:144px"></textarea><button type="submit" disabled>Send</button>' }
    else { card.setAttribute('data-composer-card', ''); card.innerHTML = '<div data-input-scroll><div data-composer-input role="textbox" contenteditable="true"><p>Draft</p></div></div><div class="host_trailing"><button class="host_primary"><svg><path /></svg></button></div>' }
    document.body.appendChild(card)
    const editor = card.querySelector('[data-composer-input],textarea'), button = card.querySelector('button')
    const animations = []
    let height = 44, textHeight = 28, naturalText = 36
    card.getBoundingClientRect = () => ({ height })
    editor.getBoundingClientRect = () => ({ height: textHeight })
    Object.defineProperty(card, 'offsetHeight', { get: () => height })
    Object.defineProperty(editor, 'offsetHeight', { get: () => textHeight })
    Object.defineProperty(editor, 'scrollHeight', { get: () => naturalText })
    card.animate = (frames, options) => {
      const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true } }
      animations.push(animation)
      return animation
    }
    return {
      card, editor, button, animations,
      grow(next, lines = 28) { height = next; textHeight = lines },
      homeTextHeight(next) { naturalText = next },
      input(value) { if (home) editor.value = value; else editor.firstChild.textContent = value; editor.dispatchEvent(new window.Event('input', { bubbles: true })) },
    }
  }
  return {
    ...module.exports, window, document, frames, resizes, changes, motion, surface,
    async paint() { await settle(); const batch = [...frames]; frames.clear(); for (const [, run] of batch) run(); await settle() },
    resize() { for (const observer of resizes) if (observer.nodes.size) observer.run() },
    reduce(value) { motion.matches = value; for (const run of changes) run() },
    close() { window.close() },
  }
}

test('one scoped composer coalesces changes without replacing the host editor or selection', async () => {
  const app = fixture(), first = app.surface(), other = app.surface()
  const stop = app.observeComposerMotion(first.card)
  try {
    const paragraph = first.editor.firstChild, text = paragraph.firstChild
    first.editor.focus()
    const range = app.document.createRange()
    range.setStart(text, 2); range.collapse(true)
    const selection = app.window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    first.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }))
    first.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }))
    app.resize()
    assert.equal(app.frames.size, 1)
    await app.paint()
    assert.equal(first.card.dataset.btComposerFocused, 'true')
    assert.equal(first.card.dataset.btComposerDraft, 'filled')
    assert.equal(first.editor.firstChild, paragraph)
    assert.equal(selection.anchorNode, text)
    assert.equal(selection.anchorOffset, 2)
    assert.equal(other.card.hasAttribute('data-bt-composer-motion'), false)
  } finally { stop(); app.close() }
})

test('multiline shell growth animates the card while composition never intercepts input or key events', async () => {
  const app = fixture(), surface = app.surface(), stop = app.observeComposerMotion(surface.card)
  try {
    const composition = new app.window.CompositionEvent('compositionstart', { bubbles: true, cancelable: true, data: 'ni' })
    assert.equal(surface.editor.dispatchEvent(composition), true)
    surface.grow(72, 52)
    surface.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }))
    await app.paint()
    assert.equal(surface.card.dataset.btComposerComposing, 'true')
    assert.equal(surface.animations.length, 0)
    const enter = new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })
    assert.equal(surface.editor.dispatchEvent(enter), true)
    surface.editor.dispatchEvent(new app.window.CompositionEvent('compositionend', { bubbles: true, data: '你' }))
    await app.paint()
    surface.grow(96, 76); app.resize(); await app.paint()
    assert.equal(surface.animations.length, 1)
    assert.equal(surface.animations[0].frames[0].height, '72px')
    assert.equal(surface.animations[0].frames[1].height, '96px')
    assert.equal(surface.card.dataset.btComposerLines, 'multiple')
    assert.equal(surface.editor.style.height, '')
    assert.equal(surface.editor.style.transform, '')
  } finally { stop(); app.close() }
})

test('home textarea sizes after composition, caps tall drafts and restores its inline styles', async () => {
  const app = fixture(), surface = app.surface({ home: true }), stop = app.observeComposerMotion(surface.card)
  try {
    assert.equal(surface.editor.style.height, '36px')
    surface.editor.dispatchEvent(new app.window.CompositionEvent('compositionstart', { bubbles: true }))
    surface.homeTextHeight(72); surface.input('中文输入')
    await app.paint()
    assert.equal(surface.editor.style.height, '36px')
    surface.editor.dispatchEvent(new app.window.CompositionEvent('compositionend', { bubbles: true }))
    await app.paint()
    assert.equal(surface.editor.style.height, '72px')
    surface.homeTextHeight(200); surface.input('Long draft'); await app.paint()
    assert.equal(surface.editor.style.height, '144px')
    assert.equal(surface.editor.style.overflowY, 'auto')
  } finally {
    stop()
    assert.equal(surface.editor.style.height, '')
    assert.equal(surface.editor.style.overflowY, '')
    app.close()
  }
})

test('send and stop states follow the actual controls and glyph swaps without changing disabled', async () => {
  const app = fixture(), surface = app.surface(), stop = app.observeComposerMotion(surface.card)
  const svg = surface.button.querySelector('svg'), swaps = []
  svg.animate = (frames, options) => { const animation = { frames, options, cancel() {} }; swaps.push(animation); return animation }
  try {
    assert.equal(surface.card.dataset.btComposerSend, 'ready')
    surface.button.disabled = true; await app.paint()
    assert.equal(surface.card.dataset.btComposerSend, 'idle')
    assert.equal(surface.button.disabled, true)
    svg.innerHTML = '<rect />'; surface.button.disabled = false; await app.paint()
    assert.equal(surface.card.dataset.btComposerSend, 'busy')
    assert.equal(surface.button.dataset.btComposerControl, 'stop')
    assert.equal(swaps.length, 1)
  } finally { stop(); app.close() }
})

test('live reduced motion cancels movement and disposal releases every observer and pending frame', async () => {
  const app = fixture(), surface = app.surface(), stop = app.observeComposerMotion(surface.card)
  try {
    surface.grow(72, 52); app.resize(); await app.paint()
    assert.equal(surface.animations.length, 1)
    app.reduce(true)
    assert.equal(surface.animations[0].cancelled, true)
    surface.grow(96, 76); app.resize(); await app.paint()
    assert.equal(surface.animations.length, 1)
    surface.input('pending')
    assert.equal(app.frames.size, 1)
    stop()
    assert.equal(app.frames.size, 0)
    assert.equal(app.changes.size, 0)
    assert.ok(app.resizes.every(observer => observer.nodes.size === 0))
    assert.equal(surface.card.hasAttribute('data-bt-composer-motion'), false)
    surface.input('after disposal'); await app.paint()
    assert.equal(app.frames.size, 0)
    assert.equal(surface.card.hasAttribute('data-bt-composer-motion'), false)
  } finally { stop(); app.close() }
})

test('composer controls outrank legacy hiding and animation rules regardless of stylesheet installation order', () => {
  const app = fixture()
  const legacyCss = readFileSync(new URL('../src/client/styles.js', import.meta.url), 'utf8')
  const declarations = []
  cssTree.walk(cssTree.parse(app.COMPOSER_MOTION_CSS), {
    visit: 'Rule',
    enter(rule) {
      if (rule.prelude?.type !== 'SelectorList') return
      const selector = cssTree.generate(rule.prelude)
      for (const node of rule.block.children) if (node.type === 'Declaration') declarations.push({ selector, property: node.property, important: node.important, value: cssTree.generate(node.value) })
    },
  })
  const outranks = (legacy, property, value, selectorPart, important = false) => {
    assert.ok(legacyCss.includes(legacy), `legacy regression selector still exists: ${legacy}`)
    const [old] = Specificity.calculate(legacy)
    const candidates = declarations.filter(item => item.property === property && item.value === value && item.selector.includes(selectorPart) && (!important || item.important))
    assert.ok(candidates.some(item => Specificity.calculate(item.selector).every(specificity => specificity.isGreaterThan(old))), `${property}:${value} must outrank ${legacy} without relying on source order`)
  }
  try {
    outranks('[data-composer-card] button[class*="_primary"]:disabled', 'display', 'inline-grid', 'button[data-bt-composer-control]:disabled', true)
    outranks('[data-composer-card] button[class*="_primary"]', 'animation', 'none', 'button[data-bt-composer-control]', true)
    outranks('[data-composer-card] button[class*="_primary"]', 'transition', 'opacity 150ms ease,scale 210ms cubic-bezier(.2,.75,.25,1),background-color 170ms ease,color 170ms ease,visibility 150ms', 'button[data-bt-composer-control]', true)
    outranks('.bt-voice', 'display', 'inline-grid', '.bt-voice', true)
    outranks('.bt-voice', 'animation', 'none', '.bt-voice', true)
    outranks('[data-bt-room] .bt-voice', 'display', 'none', '[data-bt-room]', true)
    outranks('.bt-voice:hover', 'opacity', '1', '[data-bt-composer-send=idle] .bt-voice')
  } finally { app.close() }
})
