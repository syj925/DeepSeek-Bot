import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCanvasFiles, fileFailure, fileKind, fileViewport, fitFileRect, readPreviewBytes, readPreviewPage, relatedFilePath, tablePreview, MAX_PREVIEW_CHARS } from '../src/client/canvas-files.js'
import { openTaskFile } from '../src/client/task-notice-navigation.js'

const signal = () => new AbortController().signal
const ok = value => ({ ok: true, value })

test('task files open after the canvas releases its measurement on unmount', async () => {
  const files = createCanvasFiles()
  // CanvasWorkspace cleanup calls setCanvasSize(null) when a floating chat or
  // another panel takes its place. A task result can arrive before it remounts.
  const canvasSize = null
  const opened = await openTaskFile({ sourceSessionId: 'original-part', path: '/work/report.md',
    canvas: file => files.open(file, canvasSize),
    navigate: () => assert.fail('Opening a canvas file must not enter classic view'),
  })
  assert.equal(opened, true)
  const [file] = files.source.getSnapshot().windows
  assert.equal(file.sessionId, 'original-part')
  assert.equal(file.path, '/work/report.md')
  assert.ok(Object.values(file.rect).every(Number.isFinite))
  assert.ok(file.rect.width > 0 && file.rect.height > 0)
})

test('unmeasured and temporarily hidden canvases use finite fallback dimensions', () => {
  for (const size of [undefined, null, {}, { width: 0, height: 0 }, { width: -1, height: -2 }, { width: NaN, height: Infinity }]) {
    assert.deepEqual(fileViewport(size), { width: 1000, height: 760 })
    assert.deepEqual(fitFileRect(null, size), fitFileRect({}))
    const files = createCanvasFiles()
    files.open({ sessionId: 'origin', path: '/a.csv' }, size)
    assert.ok(Object.values(files.source.getSnapshot().windows[0].rect).every(Number.isFinite))
  }
  assert.deepEqual(fileViewport({ width: 640, height: 480 }), { width: 640, height: 480 })
})

test('canvas files deduplicate within their source Session and keep other windows and geometry', () => {
  const files = createCanvasFiles()
  const first = files.open({ sessionId: 'worker-group-part', path: 'C:\\work\\report.md' })
  files.update(first, { x: 22, y: 30, width: 450, height: 420 })
  const other = files.open({ sessionId: 'worker-private', path: 'C:\\work\\report.md' })
  assert.notEqual(first, other, 'one workspace cannot borrow another workspace file authority')
  assert.equal(files.open({ sessionId: 'worker-group-part', path: 'C:/work/report.md', line: 24 }), first)
  assert.equal(files.open({ sessionId: 'worker-group-part', path: 'c:/WORK/runs/../report.md', line: 24 }), first)
  const state = files.source.getSnapshot()
  assert.equal(state.windows.length, 2)
  assert.equal(state.active, first)
  assert.deepEqual(state.windows.at(-1).rect, { x: 22, y: 30, width: 450, height: 420 })
  assert.equal(state.windows.at(-1).line, 24)
  assert.equal(state.windows.at(-1).navigation, 2)
  files.blur()
  assert.equal(files.source.getSnapshot().active, null)
  files.focus(other)
  files.close(other)
  assert.equal(files.source.getSnapshot().active, first)
  files.clear()
  assert.deepEqual(files.source.getSnapshot(), { windows: [], active: null })
  for (const path of ['https://example.com/file.md', 'javascript:alert(1)', '', 'a\0.md']) assert.throws(() => files.open({ sessionId: 'worker', path }), /local file/)
})

test('task artifact navigation stays on canvas and retains the original hidden member Session', async () => {
  const opened = []
  const result = await openTaskFile({ sessionId: 'room', sourceSessionId: 'member-room-segment', path: '/work/report.csv',
    canvas: file => opened.push(file), navigate: () => assert.fail('Canvas file clicks must not select a classic conversation'),
    sidebar: { openResource: () => assert.fail('Canvas files must not use a dormant sidebar') },
  })
  assert.equal(result, true)
  assert.deepEqual(opened, [{ sessionId: 'member-room-segment', path: '/work/report.csv' }])
  await assert.rejects(openTaskFile({ sourceSessionId: 'member', path: '/a', canvas: () => { throw new Error('unavailable') } }), /unavailable/)
})

test('text pages read under their original Session and restart if the file version changes', async () => {
  const calls = [], file = { sessionId: 'origin', path: 'runs/report.md' }
  const pages = [
    { absolutePath: '/work/runs/report.md', version: 'v1', text: 'one\ntwo', offset: 1, lines: 2, eof: false },
    { version: 'v2', text: 'new tail', offset: 3, lines: 1, eof: true },
    { absolutePath: '/work/runs/report.md', version: 'v2', text: 'new complete', offset: 1, lines: 1, eof: true },
  ]
  const reader = { read: async (...args) => { calls.push(args); return ok(pages.shift()) } }
  const first = await readPreviewPage(reader, file, signal())
  const second = await readPreviewPage(reader, file, signal(), first)
  assert.equal(second.text, 'new complete')
  assert.equal(second.offset, 1)
  assert.deepEqual(calls.map(([id, path, range]) => [id, path, range.offset]), [['origin', file.path, 1], ['origin', file.path, 3], ['origin', file.path, 1]])
  assert.equal(calls[0][2].limit, 300)
})

test('page joins preserve empty lines; preview limits never become download bytes', async () => {
  const file = { sessionId: 'original', path: '/report.txt' }
  const reader = { read: async () => ok({ version: '1', text: '\nthird', lines: 2, offset: 3, eof: true }) }
  assert.equal((await readPreviewPage(reader, file, signal(), { version: '1', text: 'first\nsecond', lines: 2, offset: 1 })).text, 'first\nsecond\n\nthird')
  const limited = await readPreviewPage({ read: async () => ok({ version: '1', text: 'x'.repeat(MAX_PREVIEW_CHARS + 5), lines: 1, offset: 1, eof: true }) }, file, signal())
  assert.equal(limited.limited, true)
  assert.equal(limited.text.length, MAX_PREVIEW_CHARS)
  const bytes = new Uint8Array([0, 1, 2, 255]), reads = []
  const original = await readPreviewBytes({ readBytes: async (...args) => { reads.push(args); return ok({ data: bytes, eof: true }) } }, file, signal())
  assert.equal(original.data, bytes)
  assert.deepEqual(reads[0].slice(0, 3), ['original', '/report.txt', {}])
  await assert.rejects(readPreviewBytes({ readBytes: async () => ok({ data: bytes, eof: false }) }, file, signal()), /completely/)
})

test('file failures retain permission errors and cancellation never delivers stale content', async () => {
  const file = { sessionId: 'worker', path: '/file.md' }, controller = new AbortController()
  controller.abort()
  await assert.rejects(readPreviewPage({ read: async () => ok({ text: 'late' }) }, file, controller.signal), { name: 'AbortError' })
  await assert.rejects(readPreviewBytes({ readBytes: async () => ({ ok: false, error: { code: 'workspace-file/too-large' } }) }, file, signal()), { code: 'workspace-file/too-large' })
  await assert.rejects(readPreviewPage(undefined, file, signal()), { code: 'file/reader-unavailable' })
  assert.match(fileFailure({ code: 'workspace-file/not-found' }), /no longer exists/)
  assert.match(fileFailure({ message: 'private host diagnostics' }), /^Could not load/)
})

test('CSV and TSV previews retain quoted delimiters, escaped quotes, Unicode and multiline records', () => {
  const text = '\uFEFF公司,说明,备注\r\n"A,B","第一行\n第二行","a""b"\r\n空值,,末列'
  assert.deepEqual(tablePreview(text).rows, [['公司', '说明', '备注'], ['A,B', '第一行\n第二行', 'a"b'], ['空值', '', '末列']])
  assert.deepEqual(tablePreview('name\tvalue\n小明\t"a\tb"', '\t').rows, [['name', 'value'], ['小明', 'a\tb']])
  assert.deepEqual(tablePreview('name,value\nrow,"unfinished\nline', ',', false).rows, [['name', 'value']])
  assert.equal(tablePreview('a,b\n1,2\n3,4', ',', true, 2).truncated, true)
  assert.equal(tablePreview(Array(90).fill('column').join(',')).rows[0].length, 80)
})

test('nested file links resolve from the preview document and small screens keep controls reachable', () => {
  assert.equal(relatedFilePath('reports/next.md', 'C:\\work\\output\\report.md'), 'C:/work/output/reports/next.md')
  assert.equal(relatedFilePath('/other.csv', '/work/report.md'), '/other.csv')
  assert.throws(() => relatedFilePath('javascript:alert(1)', '/work/report.md'), /local file/)
  assert.equal(fileKind('REPORT.MD'), 'markdown')
  assert.equal(fileKind('table.CSV'), 'csv')
  assert.equal(fileKind('unsafe.html'), 'text', 'HTML is rendered as source, never executed in the application origin')
  assert.equal(fileKind('report.docx'), 'unsupported')
  const rect = fitFileRect({ x: 1000, y: -100, width: 1200, height: 900 }, { width: 400, height: 500 })
  assert.deepEqual(rect, { width: 376, height: 396, x: 12, y: 12 })
})
