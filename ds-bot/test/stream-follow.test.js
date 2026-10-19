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
  entryPoints: [fileURLToPath(new URL('../src/client/stream-follow.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture() {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const frames = new Map(), resizes = [], changes = new Set()
  let nextFrame = 0
  window.requestAnimationFrame = run => { const id = ++nextFrame; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.ResizeObserver = class {
    constructor(run) { this.run = run; this.nodes = new Set(); resizes.push(this) }
    observe(node) { this.nodes.add(node) }
    unobserve(node) { this.nodes.delete(node) }
    disconnect() { this.nodes.clear() }
  }
  const motion = {
    matches: false, addEventListener: (_name, run) => changes.add(run), removeEventListener: (_name, run) => changes.delete(run),
  }
  window.matchMedia = () => motion
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: name => ({ react: { createContext: () => ({}), createElement() {} }, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const surface = () => {
    const scope = document.createElement('section')
    scope.innerHTML = '<div data-conversation-scroll><div data-chat-following-tail><div data-chat-flow><div data-chat-flow><span data-bt-streaming>Text</span></div></div></div></div>'
    document.body.appendChild(scope)
    const scroll = scope.querySelector('[data-conversation-scroll]'), follow = scope.querySelector('[data-chat-following-tail]')
    const flow = scope.querySelector('[data-chat-flow]'), nested = flow.querySelector('[data-chat-flow]')
    let height = 200
    const animations = []
    Object.defineProperty(flow, 'offsetHeight', { get: () => height })
    Object.defineProperty(scroll, 'scrollTop', { get: () => 300, set() { assert.fail('the visual follow layer must never write scrollTop') } })
    nested.animate = () => assert.fail('nested transcript flows must not be animated')
    flow.animate = (keyframes, options) => {
      const animation = { keyframes, options, cancelled: false, progress: 0, cancel() { this.cancelled = true }, effect: { getComputedTiming: () => ({ progress: animation.progress }) } }
      animations.push(animation)
      return animation
    }
    return { scope, scroll, follow, flow, animations, grow: amount => { height += amount } }
  }
  return {
    ...module.exports, window, document, motion, frames, resizes, changes, surface,
    async paint() {
      await settle()
      for (const [id, run] of [...frames]) { frames.delete(id); run() }
      await settle()
    },
    resize() { for (const observer of resizes) if (observer.nodes.size) observer.run() },
    reduce(value) { motion.matches = value; for (const change of changes) change() },
    close() { dom.window.close() },
  }
}

test('the host keeps scroll ownership while only the growing scoped outer transcript animates', async () => {
  const page = fixture(), first = page.surface(), other = page.surface()
  const stop = page.observeStreamFollow(first.scope)
  try {
    first.grow(20)
    other.grow(50)
    page.resize()
    await page.paint()
    assert.equal(first.animations.length, 1)
    assert.equal(other.animations.length, 0)
    assert.equal(first.animations[0].keyframes[0].transform, 'translateY(20px)')
    first.animations[0].progress = 0.5
    first.grow(10)
    page.resize()
    await page.paint()
    assert.equal(first.animations[0].cancelled, true)
    assert.equal(first.animations[1].keyframes[0].transform, 'translateY(20px)')
    assert.equal(first.scroll.scrollTop, 300)
    first.follow.removeAttribute('data-chat-following-tail')
    first.grow(20)
    await page.paint()
    assert.equal(first.animations.length, 2)
    assert.equal(first.animations[1].cancelled, true)
  } finally { stop(); page.close() }
})

test('scroll intent cancels immediately and further text cannot pull the reader back', async () => {
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    const page = fixture(), surface = page.surface(), stop = page.observeStreamFollow(surface.scope)
    try {
      surface.grow(20); page.resize(); await page.paint()
      const intent = event === 'keydown' ? new page.window.KeyboardEvent(event, { key: 'PageUp', bubbles: true }) : new page.window.Event(event, { bubbles: true })
      surface.flow.dispatchEvent(intent)
      assert.equal(surface.animations[0].cancelled, true)
      surface.grow(20); page.resize(); await page.paint()
      assert.equal(surface.animations.length, 1)
      surface.follow.removeAttribute('data-chat-following-tail')
      await page.paint()
      surface.follow.setAttribute('data-chat-following-tail', '')
      surface.grow(10); page.resize(); await page.paint()
      assert.equal(surface.animations.length, 2)
      assert.equal(surface.scroll.scrollTop, 300)
    } finally { stop(); page.close() }
  }
})

test('editing and choosing a model in the composer preserve the host tail and ongoing stream smoothing', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamFollow(surface.scope)
  const composer = page.document.createElement('div')
  composer.setAttribute('data-composer-seat', '')
  composer.innerHTML = '<div contenteditable="true" role="textbox"></div><button>Model</button>'
  surface.scroll.appendChild(composer)
  try {
    surface.grow(20); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 1)
    composer.querySelector('button').dispatchEvent(new page.window.Event('pointerdown', { bubbles: true }))
    composer.querySelector('[contenteditable]').dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    composer.dispatchEvent(new page.window.Event('touchstart', { bubbles: true }))
    composer.dispatchEvent(new page.window.Event('wheel', { bubbles: true }))
    assert.equal(surface.animations[0].cancelled, false)
    assert.ok(surface.follow.hasAttribute('data-chat-following-tail'))
    surface.grow(20); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 2)
    assert.equal(surface.scroll.scrollTop, 300)
  } finally { stop(); page.close() }
})

test('reduced motion, settled text and cleanup stop visual work and release observers', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamFollow(surface.scope)
  try {
    page.reduce(true)
    surface.grow(20); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 0)
    page.reduce(false)
    surface.grow(20); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 1)
    surface.flow.querySelector('[data-bt-streaming]').removeAttribute('data-bt-streaming')
    await page.paint()
    assert.equal(surface.animations[0].cancelled, true)
    surface.flow.querySelector('span').setAttribute('data-bt-streaming', '')
    surface.grow(15); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 2)
    surface.grow(15); page.resize()
    assert.equal(page.frames.size, 1)
    stop()
    assert.equal(page.frames.size, 0)
    assert.equal(surface.animations[1].cancelled, true)
    assert.ok(page.resizes.every(observer => observer.nodes.size === 0))
    assert.equal(page.changes.size, 0)
    surface.grow(15); page.resize(); await page.paint()
    assert.equal(surface.animations.length, 2)
  } finally { stop(); page.close() }
})
