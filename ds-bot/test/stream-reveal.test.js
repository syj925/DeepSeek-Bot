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
  window.Highlight = supported ? class extends Set { priority = 0 } : undefined
  window.CSS = { highlights: registry, supports: () => true }
  window.performance.now = () => now
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
      return [...registry.values()].flatMap(highlight => [...highlight]).map(bounds => {
        const range = document.createRange()
        range.setStart(bounds.startContainer, bounds.startOffset); range.setEnd(bounds.endContainer, bounds.endOffset)
        return range
      })
        .sort((left, right) => left.compareBoundaryPoints(window.Range.START_TO_START, right))
    },
    stages() { return [...registry].filter(([name, highlight]) => highlight.size && !name.endsWith('pending')).map(([name]) => Number(name.split('-').at(-1))) },
    pending() { return [...(registry.get('bt-reveal-pending') ?? [])] },
    async paint(advance = 16) {
      await settle()
      now += advance
      const pending = Array.from(frames)
      frames.clear()
      for (const [, run] of pending) run(now)
      await settle()
    },
    async elapse(duration) {
      let remaining = duration
      while (remaining > 0) {
        const step = Math.min(16, remaining)
        await this.paint(step)
        remaining -= step
      }
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
    assert.ok(page.stages()[0] > 0)
    assert.ok(surface.bubble.style.getPropertyValue('--bt-reveal-ink'))
    assert.equal(selection.toString(), 'Exis')
    await page.paint(40)
    assert.ok(page.stages().every(stage => stage > 0 && stage < 24))
    await page.elapse(240)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
  } finally { stop(); page.close() }
})

test('new live streams animate even in a large first batch while pre-existing transcript text never replays', async () => {
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
    bulk.textContent = 'new live '.repeat(100)
    surface.scope.appendChild(bulk)
    await page.flush()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'Hello' + 'new live '.repeat(100))
    await page.elapse(260)
    assert.equal(page.ranges().length, 0)
    bulk.firstChild.appendData('now')
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'now')
  } finally { stop(); page.close() }
})

test('a completed tail can shrink or reparse during settling without stale ranges or missing cleanup', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = '重新排版中的回复文字'
    await page.flush()
    surface.stream.removeAttribute('data-bt-streaming')
    await page.flush()
    surface.bubble.firstChild.deleteData(4, 6)
    await page.flush()
    surface.bubble.innerHTML = '重新<strong>排版</strong>'
    await page.flush()
    assert.equal(page.ranges().map(range => range.toString()).join(''), '重新排版')
    await page.elapse(260)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
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
    await page.elapse(400)
    assert.equal(page.ranges().length, 0)
  } finally { stop(); page.close() }
})

test('completion including a final text batch lets the last letters settle before releasing paint', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = 'live'
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'live')
    surface.bubble.textContent = 'live and complete'
    surface.stream.removeAttribute('data-bt-streaming')
    await page.paint()
    assert.equal(surface.bubble.textContent, 'live and complete')
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'live and complete')
    await page.elapse(260)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
  } finally { stop(); page.close() }
})

test('large live batches sweep in compressed ranges and oversized batches remain readable immediately', async () => {
  const page = fixture(), surface = page.surface('prefix'), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.firstChild.appendData('a'.repeat(600))
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'a'.repeat(600))
    assert.ok(page.ranges().length < 30)
    assert.ok(page.pending().length)
    for (let index = 0; index < 4; index++) {
      surface.bubble.firstChild.appendData('b'.repeat(300))
      await page.paint()
      assert.ok(page.ranges().length < 100)
    }
    await page.paint(1000)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.textContent.length, 1806)
    surface.bubble.firstChild.appendData('x'.repeat(11000))
    await page.flush()
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
  } finally { stop(); page.close() }
})

test('temporary group tails hand the remaining sweep to the matching durable message only', async () => {
  const page = fixture(), surface = page.surface('History '), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.stream.setAttribute('data-bt-stream-key', 'group:employee:1:0')
    // Keys are set when a stream mounts; observe a new live row in this fixture.
    surface.stream.remove()
    const stream = page.document.createElement('div')
    stream.setAttribute('data-bt-streaming', '')
    stream.setAttribute('data-bt-stream-key', 'group:employee:2:0')
    stream.textContent = '回复开始'
    surface.scope.prepend(stream)
    await page.flush()
    assert.ok(page.pending().length)
    await page.paint(30)
    const durable = page.document.createElement('div')
    durable.setAttribute('data-bt-stream-key', 'group:employee:2:0')
    durable.innerHTML = '<strong>回复开始</strong>，这是最后几个字'
    stream.replaceWith(durable)
    await page.flush()
    assert.equal(page.ranges().map(range => range.toString()).join(''), durable.textContent)
    assert.ok(page.ranges().every(range => durable.contains(range.startContainer)))
    assert.ok(page.pending().length)
    await page.elapse(250)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(durable.textContent, '回复开始，这是最后几个字')
    // Reloading an already completed row does not replay it.
    durable.replaceWith(durable.cloneNode(true))
    await page.flush()
    assert.equal(page.ranges().length, 0)
  } finally { stop(); page.close() }
})

test('mutation batches paint before the next frame and ignore unrelated composers, IME and other streams', async () => {
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
    assert.equal(page.walks, initialWalks + 1)
    assert.equal(page.ranges().map(range => range.toString()).join(''), '字'.repeat(20))
    assert.equal(page.stages()[0], 0)
    assert.equal(page.pending().map(range => range.endOffset - range.startOffset).reduce((a, b) => a + b, 0), 19)
    await page.paint()
    assert.equal(page.walks, initialWalks + 1)
    assert.equal(first.input.textContent, '拼音')
  } finally { stop(); page.close() }
})

test('one 100 ms main-thread task preserves a visible fade on the next frame and then settles normally', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = '文字渐入仍然跟随'
    await page.paint()
    await page.paint(100)
    assert.ok(page.ranges().length, 'one long task must not consume an unseen fade')
    assert.ok(page.stages().some(stage => stage > 0 && stage < 23))
    assert.equal(surface.bubble.textContent, '文字渐入仍然跟随')
    await page.elapse(260)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
    assert.equal(surface.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
  } finally { stop(); page.close() }
})

test('four consecutive 80 ms frames yield reveals for 1.5 seconds and later deltas resume without replay', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.textContent = 'a'.repeat(100)
    await page.paint()
    for (let index = 0; index < 3; index++) {
      await page.paint(80)
      assert.ok(page.ranges().length, 'the first slow frames retain their reveal')
    }
    await page.paint(80)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0, 'yielding must stop the animation loop')
    surface.bubble.firstChild.appendData(' during cooldown')
    await page.flush()
    assert.equal(page.ranges().length, 0)
    await page.elapse(1499)
    surface.bubble.firstChild.appendData(' still quiet')
    await page.flush()
    assert.equal(page.ranges().length, 0)
    await page.elapse(2)
    surface.bubble.firstChild.appendData(' resumes')
    await page.flush()
    assert.equal(page.ranges().map(range => range.toString()).join(''), ' resumes')
    await page.elapse(260)
    assert.equal(page.ranges().length, 0)
    assert.equal(page.frames.size, 0)
  } finally { stop(); page.close() }
})

test('pending letters retain 20 percent ink rather than becoming fully transparent', () => {
  const page = fixture()
  try {
    const pending = page.STREAM_REVEAL_CSS.match(/::highlight\(bt-reveal-pending\)\{([^}]+)\}/)?.[1]
    assert.ok(pending)
    assert.match(pending, /color:color-mix\(in srgb,var\(--bt-reveal-ink,currentColor\) 20%,transparent\)/)
    assert.doesNotMatch(pending, /color:\s*transparent(?:;|$)/)
  } finally { page.close() }
})

test('private bubbles use priority one while an independent priority-zero highlight remains untouched', async () => {
  const page = fixture(), surface = page.surface('Existing ')
  const externalRange = page.document.createRange()
  externalRange.selectNodeContents(surface.bubble)
  const external = new page.window.Highlight([externalRange])
  page.registry.set('external-skin', external)
  const stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.firstChild.appendData('private reveal')
    await page.flush()
    const own = [...page.registry].filter(([name, highlight]) => name.startsWith('bt-reveal-') && highlight.size)
    assert.ok(own.length)
    assert.ok(own.every(([, highlight]) => highlight.priority === 1))
    assert.equal(page.registry.get('external-skin'), external)
    assert.equal(external.priority, 0)
    assert.equal(external.size, 1)
    assert.equal([...external][0], externalRange)
    await page.elapse(260)
    stop()
    assert.deepEqual([...page.registry.keys()], ['external-skin'])
    assert.equal(external.priority, 0)
    assert.equal([...external][0], externalRange)
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
    assert.equal(page.ranges().map(range => range.toString()).join(''), ' new')
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
    assert.equal(page.ranges().map(range => range.toString()).join(''), ' visible')
  } finally { stop(); page.close() }
})

test('separate canvas windows share highlight groups without clearing or stealing each other', async () => {
  const page = fixture(), first = page.surface(), other = page.surface()
  const stopFirst = page.observeStreamReveal(first.scope), stopOther = page.observeStreamReveal(other.scope)
  try {
    first.bubble.textContent = 'first'
    other.bubble.textContent = 'other'
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'firstother')
    stopFirst()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'other')
    assert.equal(first.bubble.style.getPropertyValue('--bt-reveal-ink'), '')
    assert.ok(other.bubble.style.getPropertyValue('--bt-reveal-ink'))
    other.bubble.firstChild.appendData(' live')
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'other live')
  } finally { stopFirst(); stopOther(); page.close() }
  assert.equal(page.registry.size, 0)
  assert.equal(page.frames.size, 0)
  assert.equal(page.changes.size, 0)
})

test('grapheme ranges keep emoji and combining marks intact and ignore copy buttons', async () => {
  const page = fixture(), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
  try {
    surface.bubble.innerHTML = '<code>👨‍👩‍👧‍👦é你好</code><button>Copy</button>'
    await page.flush()
    assert.deepEqual(page.ranges().map(range => range.toString()), ['👨‍👩‍👧‍👦', 'é你好'])
    await page.paint(3)
    assert.deepEqual(page.ranges().map(range => range.toString()), ['👨‍👩‍👧‍👦é', '你好'])
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
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'active')
    old()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'active')
    surface.bubble.firstChild.appendData(' new')
    await page.paint()
    assert.equal(page.ranges().map(range => range.toString()).join(''), 'active new')
  } finally { stop(); page.close() }
})

test('removed streams, teardown and unsupported browsers release observers and leave normal text', async () => {
  for (const supported of [true, false]) {
    const page = fixture({ supported }), surface = page.surface(), stop = page.observeStreamReveal(surface.scope)
    try {
      surface.bubble.textContent = 'reply'
      await page.paint()
      assert.equal(page.ranges().map(range => range.toString()).join(''), supported ? 'reply' : '')
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
