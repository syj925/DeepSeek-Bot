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
  entryPoints: [fileURLToPath(new URL('../src/client/stream-reveal.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture({ supported = true } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
  const { window } = dom, { document } = window
  const frames = new Map(), changes = new Set(), registry = new Map()
  let nextFrame = 0, now = 0, walks = 0, hidden = false
  window.requestAnimationFrame = run => { const id = ++nextFrame; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.Highlight = supported ? class extends Set {} : undefined
  window.CSS = { highlights: registry, supports: () => true }
  Object.defineProperty(document, 'hidden', { get: () => hidden })
  const walk = document.createTreeWalker.bind(document)
  document.createTreeWalker = (...args) => { walks++; return walk(...args) }
  const motion = {
    matches: false, addEventListener: (_name, run) => changes.add(run), removeEventListener: (_name, run) => changes.delete(run),
  }
  window.matchMedia = () => motion
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports,
    require: name => ({ react: { createContext: () => ({}), createElement() {} }, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const surface = (text = '') => {
    const scope = document.createElement('section')
    scope.innerHTML = '<div data-bt-streaming><div data-bt-reveal-text style="color:rgb(80, 90, 100)"></div></div><div data-composer-seat><div role="textbox" contenteditable="true"></div></div>'
    const bubble = scope.querySelector('[data-bt-reveal-text]')
    bubble.textContent = text
    document.body.appendChild(scope)
    return { scope, stream: scope.firstElementChild, bubble, input: scope.querySelector('[contenteditable]') }
  }
  return {
    ...module.exports, window, document, registry, frames, changes, surface,
    get walks() { return walks },
    ranges() {
      return [...registry.values()].flatMap(highlight => [...highlight])
        .sort((left, right) => left.compareBoundaryPoints(window.Range.START_TO_START, right))
    },
    stages() { return [...registry].filter(([, highlight]) => highlight.size).map(([name]) => Number(name.split('-').at(-1))) },
    async paint(advance = 16) {
      await settle()
      now += advance
      const pending = Array.from(frames)
      frames.clear()
      for (const [, run] of pending) run(now)
      await settle()
    },
    async flush() { await settle() },
    reduce(value) { motion.matches = value; for (const change of changes) change() },
    hide(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')) },
    close() { window.close() },
  }
}

test('only appended characters fade through paint stages, leaving old text, selection and DOM unchanged', async () => {
  const page = fixture(), surface = page.surface('Existing '), stop = page.observeStreamReveal(surface.scope)
  try {
    assert.equal(page.ranges().length, 0)
    const node = surface.bubble.firstChild
    const selection = page.window.getSelection(), selected = page.document.createRange()
    selected.setStart(node, 0); selected.setEnd(node, 4); selection.addRange(selected)
    node.appendData('新的回复')
    await page.paint()
    assert.equal(surface.bubble.firstChild, node)
    assert.equal(surface.bubble.childNodes.length, 1)
    assert.equal(surface.bubble.textContent, 'Existing 新的回复')
    assert.equal(page.ranges().map(range => range.toString()).join(''), '新的回复')
    assert.equal(page.ranges().every(range => range.startOffset >= 9), true)
    assert.equal(page.stages()[0], 0)
    assert.ok(surface.bubble.style.getPropertyValue('--bt-reveal-ink'))
    assert.equal(selection.toString(), 'Exis')
    await page.paint(130)
    assert.ok(page.stages().every(stage => stage > 0 && stage < 20))
    await page.paint(240)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
  } finally { stop(); page.close() }
})

test('new short streams animate while pre-existing and bulk-loaded transcript text never replays', async () => {
  const page = fixture(), surface = page.surface('History'), stop = page.observeStreamReveal(surface.scope)
  try {
    await page.paint()
    assert.equal(page.ranges().length, 0)
    const short = page.document.createElement('div')
    short.setAttribute('data-bt-streaming', '')
    short.textContent = 'Hello'
    surface.scope.appendChild(short)
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'Hello')
    const bulk = page.document.createElement('div')
    bulk.setAttribute('data-bt-streaming', '')
    bulk.textContent = 'history '.repeat(100)
    surface.scope.appendChild(bulk)
    await page.paint(400)
    assert.equal(page.ranges().length, 0)
    bulk.firstChild.appendData('now')
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'now')
  } finally { stop(); page.close() }
})

test('Markdown node replacements retain old reveals and animate only the newly added suffix', async () => {
  const page = fixture(), surface = page.surface('Prefix '), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.firstChild.appendData('bold')
    await page.paint()
    const old = surface.bubble.firstChild
    surface.bubble.innerHTML = 'Prefix <strong>bold</strong> and <a href="https://example.com">link</a>'
    await page.paint()
    assert.equal(old.isConnected, false)
    assert.ok(page.ranges().every(range => range.startContainer.isConnected && range.endContainer.isConnected))
    const visible = page.ranges().map(range => range.toString()).join('')
    assert.equal(visible.includes('Prefix'), false)
    assert.equal(visible, 'bold and link')
    assert.equal(surface.bubble.querySelector('a').getAttribute('href'), 'https://example.com')
    await page.paint(400)
    assert.equal(page.ranges().length, 0)
  } finally { stop(); page.close() }
})

test('completion including a final text batch shows every character and removes all active paint', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = 'live'
    await page.paint()
    assert.equal(page.ranges().length, 4)
    surface.bubble.textContent = 'live and complete'
    surface.stream.removeAttribute('data-bt-streaming')
    await page.paint()
    assert.equal(surface.bubble.textContent, 'live and complete')
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
  } finally { stop(); page.close() }
})

test('burst and active-run budgets reveal excessive batches immediately without queuing hundreds of frames', async () => {
  const page = fixture(), surface = page.surface('prefix'), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.firstChild.appendData('a'.repeat(600))
    await page.paint()
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    for (let index = 0; index < 4; index++) {
      surface.bubble.firstChild.appendData('b'.repeat(300))
      await page.paint()
      assert.ok(page.ranges().length <= 800)
    }
    await page.paint(1000)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.textContent.length, 1806)
  } finally { stop(); page.close() }
})

test('updates batch per animation frame and unrelated composers, IME and other streams do not rescan', async () => {
  const page = fixture(), first = page.surface('one'), other = page.surface('two'), stop = page.observeStreamReveal(first.scope)
  try {
    const initialWalks = page.walks
    first.input.textContent = '拼音'
    first.input.dispatchEvent(new page.window.CompositionEvent('compositionstart', { bubbles: true }))
    first.input.dispatchEvent(new page.window.CompositionEvent('compositionupdate', { data: '拼音', bubbles: true }))
    other.bubble.textContent = 'other reply'
    await page.flush()
    assert.equal(page.frames.size, 0)
    assert.equal(page.walks, initialWalks)
    for (let index = 0; index < 20; index++) first.bubble.firstChild.appendData('字')
    await page.flush()
    assert.equal(page.frames.size, 1)
    await page.paint()
    assert.equal(page.walks, initialWalks + 1)
    assert.equal(page.ranges().length, 20)
    assert.equal(first.input.textContent, '拼音')
  } finally { stop(); page.close() }
})

test('reduced motion and hidden tabs clear paint immediately and resume without replaying missed text', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = 'first'
    await page.paint()
    page.reduce(true)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    surface.bubble.firstChild.appendData(' while reduced')
    await page.flush()
    page.reduce(false)
    await page.paint()
    assert.equal(page.ranges().length, 0)
    surface.bubble.firstChild.appendData(' new')
    await page.paint()
    assert.equal(page.ranges().length, 4)
    page.hide(true)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    surface.bubble.firstChild.appendData(' hidden')
    await page.flush()
    page.hide(false)
    await page.paint()
    assert.equal(page.ranges().length, 0)
    surface.bubble.firstChild.appendData(' visible')
    await page.paint()
    assert.equal(page.ranges().length, 8)
  } finally { stop(); page.close() }
})

test('separate canvas windows share highlight groups without clearing or stealing each other', async () => {
  const page = fixture(), first = page.surface(), other = page.surface()
  const stopFirst = page.observeStreamReveal(first.scope), stopOther = page.observeStreamReveal(other.scope)
  try {
    first.bubble.textContent = 'first'
    other.bubble.textContent = 'other'
    await page.paint()
    assert.equal(page.ranges().length, 10)
    stopFirst()
    assert.equal(page.ranges().length, 5)
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'other')
    assert.equal(first.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
    assert.ok(other.bubble.style.getPropertyValue('--bt-reveal-ink'))
    other.bubble.firstChild.appendData(' live')
    await page.paint()
    assert.equal(page.ranges().length, 10)
  } finally { stopFirst(); stopOther(); page.close() }
  assert.equal(page.registry.size, 0)
  assert.equal(page.frames.size, 0)
  assert.equal(page.changes.size, 0)
})

test('grapheme ranges keep emoji and combining marks intact and ignore copy buttons', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.innerHTML = '<code>👨‍👩‍👧‍👦é你好</code><button>Copy</button>'
    await page.paint()
    assert.deepEqual(page.ranges().map(range => range.toString()), ['👨‍👩‍👧‍👦', 'é', '你', '好'])
    assert.equal(surface.bubble.querySelector('button').textContent, 'Copy')
  } finally { stop(); page.close() }
})

test('a reader opening a thought fold reveals its full text immediately and only later tokens animate', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    const thought = page.document.createElement('details')
    thought.setAttribute('data-bt-streaming', '')
    thought.innerHTML = '<summary>Thought</summary><div data-bt-reveal-text>folded</div>'
    surface.scope.appendChild(thought)
    await page.paint()
    assert.equal(page.ranges().length, 0)
    thought.querySelector('summary').click()
    thought.open = true
    thought.querySelector('[data-bt-reveal-text]').firstChild.appendData(' expanded')
    await page.paint()
    assert.equal(page.ranges().length, 0)
    await page.paint(400)
    thought.querySelector('[data-bt-reveal-text]').firstChild.appendData(' new')
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), ' new')
  } finally { stop(); page.close() }
})

test('a stopped observer cannot clear a newly mounted observer after repeated cleanup', async () => {
  const page = fixture(), surface = page.surface(), old = page.observeStreamReveal(surface.scope)
  old()
  const stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = 'active'
    await page.paint()
    assert.equal(page.ranges().length, 6)
    old()
    assert.equal(page.ranges().length, 6)
    surface.bubble.firstChild.appendData(' new')
    await page.paint()
    assert.equal(page.ranges().length, 10)
  } finally { stop(); page.close() }
})

test('removed streams, teardown and unsupported browsers release observers and leave normal text', async () => {
  for (const supported of [true, false]) {
    const page = fixture({ supported }), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
    try {
      surface.bubble.textContent = 'reply'
      await page.paint()
      assert.equal(page.ranges().length, supported ? 5 : 0)
      surface.stream.remove()
      await page.paint()
      assert.equal(page.ranges().length, 0)
      stop()
      assert.equal(page.frames.size, 0)
      assert.equal(page.registry.size, 0)
      assert.equal(page.changes.size, 0)
      surface.scope.textContent = 'still readable'
      await page.flush()
      assert.equal(page.frames.size, 0)
    } finally { stop(); page.close() }
  }
})
