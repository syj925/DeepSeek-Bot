import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { createCanvasFiles } from '../src/client/canvas-files.js'

const requireHarness = createRequire(join(process.env.DSH_HARNESS, 'package.json'))
const { JSDOM } = requireHarness('jsdom')
const React = requireHarness('react')
const { createRoot } = requireHarness('react-dom/client')
const { act } = React
const { outputFiles } = await build({ entryPoints: ['src/client/canvas-file-window.js'], bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', '@deepseek-ai/dsh-client-ui-primitives'] })

async function page(t, reader, { size = { width: 1200, height: 850 }, failMarkdown, delegateProvider = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><textarea id="draft">Keep my draft</textarea><div id="mount"></div></body>', { pretendToBeVisual: true })
  const previous = Object.fromEntries(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  dom.window.HTMLElement.prototype.setPointerCapture = function (id) { this.pointerId = id }
  dom.window.HTMLElement.prototype.hasPointerCapture = function (id) { return this.pointerId === id }
  dom.window.HTMLElement.prototype.releasePointerCapture = function () { this.pointerId = undefined }
  dom.window.HTMLElement.prototype.scrollIntoView = function () { this.dataset.revealed = 'true' }
  const module = { exports: {} }, urls = [], revoked = [], downloads = [], classic = [], errors = [], delegates = []
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, Blob, Uint8Array, DOMException, AbortController, setTimeout, clearTimeout,
    URL: { createObjectURL: blob => { const url = `blob:file-${urls.length}`; urls.push({ url, blob }); return url }, revokeObjectURL: url => revoked.push(url) },
    require: name => name === 'react' ? React : {
      MarkdownText: props => {
        if (failMarkdown?.(props.text)) throw new Error('Injected preview rendering failure')
        return React.createElement('div', { 'data-markdown-preview': true }, props.text)
      },
      ...(delegateProvider ? { MarkdownDelegateProvider: props => { delegates.push(props); return React.createElement('div', { 'data-file-delegate': true }, props.children) } } : {}),
    },
  })
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, href: this.href }) }
  const files = createCanvasFiles(), root = createRoot(dom.window.document.getElementById('mount'))
  const actions = { canvasFileReader: () => reader, closeCanvasFile: files.close, focusCanvasFile: files.focus, updateCanvasFile: files.update,
    openCanvasFile: file => files.open(file, size), openCanvasFileClassic: file => classic.push(file), reportError: (error, context) => errors.push({ error, context }) }
  function App() {
    const useCanvasFiles = pick => pick(React.useSyncExternalStore(files.source.subscribe, files.source.getSnapshot))
    return React.createElement(React.Fragment, null, React.createElement('div', { 'data-canvas-background': true }, 'Canvas wallpaper'),
      React.createElement(module.exports.CanvasFiles, { useCanvasFiles, actions, size }))
  }
  const draft = dom.window.document.getElementById('draft')
  draft.focus(); draft.setSelectionRange(4, 7)
  await act(async () => root.render(React.createElement(App)))
  const settle = async () => act(async () => { await new Promise(resolve => setImmediate(resolve)) })
  const open = async file => { await act(async () => { files.open(file, size) }); await settle() }
  const button = label => dom.window.document.querySelector(`button[aria-label="${label}"]`)
  const click = async label => { const target = button(label); assert.ok(target, `button ${label}`); await act(async () => target.click()); await settle() }
  const pointer = async (target, type, x, y) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    await act(async () => target.dispatchEvent(event))
  }
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  })
  return { dom, files, open, click, pointer, settle, button, draft, urls, revoked, downloads, classic, errors, delegates }
}

for (const delegateProvider of [true, false]) test(`file previews render without the internal Markdown hook (public provider: ${delegateProvider})`, async t => {
  const reads = []
  const p = await page(t, {
    read: async (sessionId, path) => {
      reads.push([sessionId, path])
      return { ok: true, value: { text: path.endsWith('.md') ? '# Deliverable\n\nReady' : 'name,value\nAlice,1\n', offset: 1, lines: 3, eof: true, version: '1' } }
    },
    readBytes: async sessionId => {
      reads.push([sessionId, 'image'])
      return { ok: true, value: { data: new Uint8Array([1, 2, 3]), eof: true } }
    },
  }, { delegateProvider })
  await p.open({ sessionId: 'source-group-part', conversationId: 'room', path: '/report.md' })
  await p.open({ sessionId: 'source-group-part', conversationId: 'room', path: '/report.csv' })
  await p.open({ sessionId: 'source-group-part', conversationId: 'room', path: '/image.png' })
  const doc = p.dom.window.document
  assert.equal(doc.querySelector('[data-markdown-preview]')?.textContent, '# Deliverable\n\nReady')
  assert.equal(doc.querySelector('tbody tr')?.textContent, 'Alice1')
  assert.ok(doc.querySelector('.bt-file-image'))
  assert.equal(doc.querySelectorAll('[data-file-window]').length, 3)
  assert.ok(doc.querySelector('[data-canvas-background]'))
  assert.equal(doc.querySelector('[data-preview-failed]'), null)
  assert.ok(reads.every(([id]) => id === 'source-group-part'))
  assert.equal(p.classic.length, 0)
  assert.equal(p.errors.length, 0)
  assert.equal(p.draft.value, 'Keep my draft')
})

test('the public Markdown provider opens document-relative files under the same source Session', async t => {
  const p = await page(t, { read: async () => ({ ok: true, value: { text: 'Ready', offset: 1, lines: 1, eof: true, version: '1', absolutePath: '/work/report.md' } }) })
  await p.open({ sessionId: 'source-group-part', conversationId: 'room', path: 'report.md', ownerName: 'Writer' })
  await act(async () => p.delegates.at(-1).openFile('details/notes.md', { line: 8 }))
  await p.settle()
  const file = p.files.source.getSnapshot().windows.at(-1)
  assert.equal(file.path, '/work/details/notes.md')
  assert.equal(file.line, 8)
  assert.equal(file.sessionId, 'source-group-part')
  assert.equal(file.conversationId, 'room')
  assert.equal(file.ownerName, 'Writer')
  assert.equal(p.files.source.getSnapshot().windows.length, 2)
  assert.equal(p.classic.length, 0)
  assert.equal(p.errors.length, 0)
})

test('file preview mounts and maximizes with a null canvas measurement without losing the workspace', async t => {
  const p = await page(t, { read: async () => ({ ok: true, value: { text: 'Ready', offset: 1, lines: 1, eof: true, version: '1' } }) }, { size: null })
  await p.open({ sessionId: 'original-part', path: '/report.md' })
  const doc = p.dom.window.document
  assert.equal(doc.querySelector('[data-markdown-preview]').textContent, 'Ready')
  assert.ok(doc.querySelector('[data-canvas-background]'))
  await p.click('Maximize window')
  const node = doc.querySelector('[data-file-window]')
  assert.ok(parseFloat(node.style.width) > 0)
  assert.ok(parseFloat(node.style.height) > 0)
  await p.click('Restore window')
  await p.click('Close preview')
  assert.ok(doc.querySelector('[data-canvas-background]'))
  assert.equal(p.draft.value, 'Keep my draft')
  assert.equal(p.errors.length, 0)
})

test('one broken preview can retry without unmounting the background or another file window', async t => {
  let broken = true
  const p = await page(t, { read: async (_id, path) => ({ ok: true, value: { text: path, offset: 1, lines: 1, eof: true, version: '1' } }) },
    { failMarkdown: text => broken && text === '/broken.md' })
  await p.open({ sessionId: 'source', path: '/working.md' })
  await p.open({ sessionId: 'source', path: '/broken.md' })
  const doc = p.dom.window.document
  assert.ok(doc.querySelector('[data-canvas-background]'))
  assert.equal(doc.querySelectorAll('[data-file-window]').length, 2)
  assert.equal(doc.querySelector('[data-markdown-preview]').textContent, '/working.md')
  assert.match(doc.querySelector('[role=alert]').textContent, /workspace is still open/)
  assert.equal(p.errors.at(-1).context, 'canvas-file-preview')
  broken = false
  await p.click('Retry')
  assert.equal(doc.querySelector('[data-preview-failed]'), null)
  assert.equal(doc.querySelectorAll('[data-markdown-preview]').length, 2)
  assert.ok(doc.querySelector('[data-canvas-background]'))
})

test('canvas preview opens, drags, resizes and closes while the original draft and caret survive', async t => {
  const calls = []
  const p = await page(t, { read: async (...args) => { calls.push(args); return { ok: true, value: { text: '# Deliverable\n\nReady', offset: 1, lines: 3, eof: true, version: '1', absolutePath: '/work/report.md' } } } })
  await p.open({ sessionId: 'source-group', path: '/work/report.md', ownerName: 'Writer' })
  const doc = p.dom.window.document, file = doc.querySelector('[data-file-window]')
  assert.match(file.textContent, /Writer/)
  assert.equal(doc.querySelector('[data-markdown-preview]').textContent, '# Deliverable\n\nReady')
  assert.equal(calls[0][0], 'source-group')
  assert.equal(p.draft.value, 'Keep my draft')
  const before = p.files.source.getSnapshot().windows[0].rect
  await p.pointer(file.querySelector('header'), 'pointerdown', 500, 100)
  await p.pointer(file, 'pointermove', 450, 140)
  await p.pointer(file, 'pointerup', 450, 140)
  const moved = p.files.source.getSnapshot().windows[0].rect
  assert.equal(moved.x, before.x - 50)
  assert.equal(moved.y, before.y + 40)
  await p.pointer(p.button('Resize file preview'), 'pointerdown', 800, 600)
  await p.pointer(file, 'pointermove', 840, 620)
  await p.pointer(file, 'pointerup', 840, 620)
  assert.equal(p.files.source.getSnapshot().windows[0].rect.width, moved.width + 40)
  await p.click('Source')
  assert.match(doc.querySelector('.bt-file-source').textContent, /Deliverable/)
  await p.click('Close preview')
  assert.equal(doc.querySelector('[data-file-window]'), null)
  assert.equal(p.draft.value, 'Keep my draft')
  assert.equal(p.draft.selectionStart, 4)
  assert.equal(p.draft.selectionEnd, 7)
  assert.equal(doc.activeElement, p.draft)
})

test('download requests all original bytes, never the CSV page rendered in the table', async t => {
  const binaryReads = []
  const p = await page(t, {
    read: async () => ({ ok: true, value: { text: 'name,value\nAlice,1', offset: 1, lines: 2, eof: false, version: '1' } }),
    readBytes: async (...args) => { binaryReads.push(args); return { ok: true, value: { data: new TextEncoder().encode('name,value\nAlice,1\nBob,2\n'), eof: true } } },
  })
  await p.open({ sessionId: 'source', path: '/report.csv' })
  assert.equal(p.dom.window.document.querySelectorAll('tbody tr').length, 0, 'a partial last CSV record waits for the next page')
  await p.click('Download original')
  assert.deepEqual(JSON.parse(JSON.stringify(binaryReads[0].slice(0, 3))), ['source', '/report.csv', {}])
  assert.equal(p.downloads[0].name, 'report.csv')
  assert.equal(await p.urls.at(-1).blob.text(), 'name,value\nAlice,1\nBob,2\n')
  assert.equal(p.files.source.getSnapshot().windows.length, 1)
  assert.equal(p.classic.length, 0)
})

test('closing a loading preview aborts the read and a late response cannot resurrect it', async t => {
  let reply, readSignal
  const p = await page(t, { read: async (_session, _path, _range, signal) => { readSignal = signal; return new Promise(resolve => { reply = resolve }) } })
  await p.open({ sessionId: 'origin', path: '/late.md' })
  assert.equal(readSignal.aborted, false)
  await p.click('Close preview')
  assert.equal(readSignal.aborted, true)
  reply({ ok: true, value: { text: 'late', lines: 1, offset: 1, eof: true } })
  await p.settle()
  assert.equal(p.dom.window.document.querySelector('[data-file-window]'), null)
})

test('unsupported files stay on canvas until the user explicitly selects classic view', async t => {
  const p = await page(t, { read: async () => assert.fail('Do not decode an Office archive as text') })
  await p.open({ sessionId: 'owner', path: '/report.docx' })
  assert.match(p.dom.window.document.querySelector('[data-file-window]').textContent, /downloaded or opened in classic/)
  assert.equal(p.classic.length, 0)
  await p.click('Open in classic view')
  assert.equal(p.classic[0].sessionId, 'owner')
})

test('image preview releases its object URL on close and never navigates the workspace', async t => {
  const reads = []
  const p = await page(t, { readBytes: async (...args) => { reads.push(args); return { ok: true, value: { data: new Uint8Array([1, 2, 3]), eof: true } } } })
  await p.open({ sessionId: 'image-owner', path: '/work/image.png' })
  assert.equal(reads[0][0], 'image-owner')
  assert.equal(p.dom.window.document.querySelector('img').src, p.urls[0].url)
  assert.equal(p.urls[0].blob.type, 'image/png')
  await p.click('Close preview')
  assert.deepEqual(p.revoked, [p.urls[0].url])
  assert.equal(p.classic.length, 0)
})

test('read errors offer Retry inside the same window and keep the source identity', async t => {
  let reads = 0
  const p = await page(t, { read: async session => {
    assert.equal(session, 'owner')
    return ++reads === 1 ? { ok: false, error: { code: 'workspace-file/not-found' } }
      : { ok: true, value: { text: 'Restored', lines: 1, offset: 1, version: '2', eof: true } }
  } })
  await p.open({ sessionId: 'owner', path: '/work/report.md' })
  assert.match(p.dom.window.document.querySelector('[role=alert]').textContent, /no longer exists/)
  await p.click('Retry')
  assert.equal(p.dom.window.document.querySelector('[role=alert]'), null)
  assert.equal(p.dom.window.document.querySelector('[data-markdown-preview]').textContent, 'Restored')
  assert.equal(p.files.source.getSnapshot().windows.length, 1)
  assert.equal(p.classic.length, 0)
})
