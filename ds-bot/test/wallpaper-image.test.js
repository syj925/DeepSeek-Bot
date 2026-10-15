import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareWallpaper, saveWallpaper, loadWallpaper, deleteWallpaper, WALLPAPER_MAX_BYTES } from '../src/client/wallpaper-image.js'

const jpeg = () => new Blob([new Uint8Array([255, 216, 255, 224, 0, 0])], { type: 'image/jpeg' })
const compressed = () => new Blob(['compressed local image'], { type: 'image/webp' })
function replace(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  })
}

function imageRuntime(t, { width = 6000, height = 4000, context = true, nullBlob = false, jpegOnly = false } = {}) {
  const calls = [], bitmap = { width, height, close() { calls.push(['close']) } }
  const blob = compressed()
  const canvas = {
    getContext() {
      return context ? { drawImage(image, ...args) { calls.push(['draw', image, ...args]) } } : null
    },
    toBlob(callback, type, quality) {
      calls.push(['encode', this.width, this.height, type, quality])
      callback(nullBlob ? null : jpegOnly ? new Blob(['image'], { type: type === 'image/webp' ? 'image/png' : type }) : blob)
    },
  }
  replace(t, 'createImageBitmap', async () => bitmap)
  replace(t, 'document', { createElement(type) { assert.equal(type, 'canvas'); return canvas } })
  return { calls, bitmap, blob, canvas }
}

function storageRuntime(t, options = {}) {
  const values = new Map(), calls = [], requests = []
  let commit
  const indexedDB = {
    open(name, version) {
      calls.push(['open', name, version])
      const request = {}, database = {
        objectStoreNames: { contains: () => values.size > 0 },
        createObjectStore: name => { calls.push(['create', name]) },
        close: () => { calls.push(['close']) },
        transaction(storeName, mode) {
          calls.push(['transaction', storeName, mode])
          let aborted = false
          const transaction = {
            abort() { aborted = true; calls.push(['abort']); queueMicrotask(() => transaction.onabort?.()) },
            objectStore(name) {
              assert.equal(name, 'images')
              function action(operation, value, key) {
                const result = {}
                queueMicrotask(() => {
                  if (options.quota) {
                    result.error = new DOMException('quota', 'QuotaExceededError')
                    result.onerror?.()
                    return
                  }
                  if (operation === 'get') result.result = values.get(key)
                  result.onsuccess?.()
                  commit = () => {
                    if (aborted) return
                    if (options.abort) { transaction.error = new DOMException('aborted', 'AbortError'); transaction.onabort?.(); return }
                    if (operation === 'put') values.set(key, value)
                    if (operation === 'delete') values.delete(key)
                    transaction.oncomplete?.()
                  }
                  if (!options.manualCommit) queueMicrotask(() => commit())
                })
                return result
              }
              return { put: (value, key) => action('put', value, key), get: key => action('get', null, key), delete: key => action('delete', null, key) }
            },
          }
          return transaction
        },
      }
      request.result = database
      requests.push(request)
      queueMicrotask(() => {
        if (options.timeout) return
        if (options.blocked) { request.onblocked?.(); return }
        if (options.openError) { request.error = new DOMException('denied', 'SecurityError'); request.onerror?.(); return }
        request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
  replace(t, 'indexedDB', indexedDB)
  return { values, calls, requests, commit: () => commit() }
}

test('wallpaper rejects unsupported, empty, oversized and disguised image files before decoding', async t => {
  let decoded = false
  replace(t, 'createImageBitmap', () => { decoded = true; throw new Error('must not decode') })
  await assert.rejects(prepareWallpaper(new Blob(['<svg></svg>'], { type: 'image/svg+xml' })), /Choose a JPEG/)
  await assert.rejects(prepareWallpaper(new Blob([], { type: 'image/png' })), /empty/)
  await assert.rejects(prepareWallpaper(new Blob([new Uint8Array(WALLPAPER_MAX_BYTES + 1)], { type: 'image/jpeg' })), /smaller than 25 MB/)
  await assert.rejects(prepareWallpaper(new Blob(['<svg></svg>'], { type: 'image/jpeg' })), /does not match/)
  assert.equal(decoded, false)
})

test('large wallpaper is compressed proportionally with a 2560 pixel edge and bitmap memory is released', async t => {
  const runtime = imageRuntime(t)
  assert.equal(await prepareWallpaper(jpeg()), runtime.blob)
  assert.deepEqual(runtime.calls[0], ['draw', runtime.bitmap, 0, 0, 2560, 1707])
  assert.deepEqual(runtime.calls[1], ['encode', 2560, 1707, 'image/webp', 0.86])
  assert.deepEqual(runtime.calls[2], ['close'])
  assert.equal(runtime.canvas.width, 0)
  assert.equal(runtime.canvas.height, 0)
})

test('all supported raster file signatures can reach the image decoder', async t => {
  const runtime = imageRuntime(t)
  for (const image of [
    jpeg(),
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
    new Blob(['RIFF0000WEBP'], { type: 'image/webp' }),
    new Blob(['0000ftypavif'], { type: 'image/avif' }),
  ]) assert.equal(await prepareWallpaper(image), runtime.blob)
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 4)
})

test('a bitmap that finishes decoding after the timeout is still closed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let resolveBitmap, closed = false
  replace(t, 'createImageBitmap', () => new Promise(resolve => { resolveBitmap = resolve }))
  const pending = assert.rejects(prepareWallpaper(jpeg()), /took too long to open/)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(15000)
  await pending
  resolveBitmap({ close() { closed = true } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, true)
})

test('unresponsive image encoding fails and releases the decoded bitmap', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = imageRuntime(t)
  runtime.canvas.toBlob = () => {}
  const pending = assert.rejects(prepareWallpaper(jpeg()), /took too long to process/)
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(15000)
  await pending
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
})

test('small wallpaper keeps its original resolution and portrait wallpaper uses its longer edge', async t => {
  for (const [width, height, expected] of [[640, 480, [640, 480]], [2000, 5000, [1024, 2560]]]) {
    await t.test(`${width} by ${height}`, async t => {
      const runtime = imageRuntime(t, { width, height })
      await prepareWallpaper(jpeg())
      assert.deepEqual(runtime.calls[0].slice(-2), expected)
    })
  }
})

test('unsupported WebP encoder falls back to JPEG with the same quality', async t => {
  const runtime = imageRuntime(t, { jpegOnly: true })
  assert.equal((await prepareWallpaper(jpeg())).type, 'image/jpeg')
  assert.deepEqual(runtime.calls.filter(call => call[0] === 'encode').map(call => call.slice(-2)), [['image/webp', 0.86], ['image/jpeg', 0.86]])
})

test('invalid dimensions, unavailable drawing and failed encoders still close their decoded bitmap', async t => {
  for (const [options, message] of [[{ width: 0 }, /dimensions/], [{ width: 20000, height: 20000 }, /dimensions/], [{ context: false }, /unavailable/], [{ nullBlob: true }, /Could not process/]]) {
    await t.test(JSON.stringify(options), async t => {
      const runtime = imageRuntime(t, options)
      await assert.rejects(prepareWallpaper(jpeg()), message)
      assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
    })
  }
})

test('image element fallback revokes its local object URL and releases its source', async t => {
  const runtime = imageRuntime(t), urls = [], images = []
  replace(t, 'createImageBitmap', undefined)
  replace(t, 'Image', class {
    constructor() { this.naturalWidth = 800; this.naturalHeight = 600; images.push(this) }
    set src(value) { this.source = value; if (value) queueMicrotask(() => this.onload?.()) }
  })
  t.mock.method(URL, 'createObjectURL', () => 'blob:local-wallpaper')
  t.mock.method(URL, 'revokeObjectURL', url => urls.push(url))
  await prepareWallpaper(jpeg())
  assert.deepEqual(urls, ['blob:local-wallpaper'])
  assert.equal(images[0].source, '')
  assert.deepEqual(runtime.calls[0].slice(-2), [800, 600])
})

test('wallpaper save, reload and removal use one local IndexedDB record and close all connections', async t => {
  const decoded = imageRuntime(t, { width: 1600, height: 900 })
  const runtime = storageRuntime(t), image = compressed()
  assert.equal(await loadWallpaper(), null)
  await saveWallpaper(image)
  assert.equal(await loadWallpaper(), image)
  await deleteWallpaper()
  assert.equal(await loadWallpaper(), null)
  assert.deepEqual(runtime.calls.filter(call => call[0] === 'open'), Array.from({ length: 5 }, () => ['open', 'ds-bot:wallpaper', 1]))
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 5)
  assert.equal(runtime.values.size, 0)
  assert.equal(decoded.calls.filter(call => call[0] === 'close').length, 1)
})

test('save only reports success after the write transaction commits', async t => {
  const runtime = storageRuntime(t, { manualCommit: true }), image = compressed()
  let complete = false
  const saved = saveWallpaper(image).then(() => { complete = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(complete, false)
  assert.equal(runtime.values.size, 0)
  runtime.commit()
  await saved
  assert.equal(runtime.values.get('canvas'), image)
})

test('an aborted write and quota exhaustion reject without replacing the prior wallpaper', async t => {
  for (const [options, message] of [[{ abort: true }, /Could not save/], [{ quota: true }, /storage is full/]]) {
    await t.test(JSON.stringify(options), async t => {
      const runtime = storageRuntime(t, options), old = compressed()
      runtime.values.set('canvas', old)
      await assert.rejects(saveWallpaper(compressed()), message)
      assert.equal(runtime.values.get('canvas'), old)
      assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
    })
  }
})

test('missing, blocked and denied IndexedDB produce actionable errors', async t => {
  await t.test('missing storage', async t => {
    replace(t, 'indexedDB', undefined)
    await assert.rejects(loadWallpaper(), /storage is unavailable/)
  })
  await t.test('denied access', async t => {
    storageRuntime(t, { openError: true })
    await assert.rejects(loadWallpaper(), /Could not load/)
  })
  await t.test('blocked database closes a late connection', async t => {
    const runtime = storageRuntime(t, { blocked: true })
    await assert.rejects(loadWallpaper(), /storage is busy/)
    runtime.requests[0].onsuccess()
    assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
  })
})

test('unresponsive IndexedDB times out and closes any late connection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const runtime = storageRuntime(t, { timeout: true })
  const pending = assert.rejects(loadWallpaper(), /took too long/)
  t.mock.timers.tick(8000)
  await pending
  runtime.requests[0].onsuccess()
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
})

test('invalid persisted data is rejected rather than used as a wallpaper', async t => {
  const runtime = storageRuntime(t)
  runtime.values.set('canvas', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }))
  await assert.rejects(loadWallpaper(), /saved wallpaper is invalid/)
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
  await assert.rejects(saveWallpaper(new Blob(['no type'])), /Could not save/)
})

test('persisted blobs with a valid MIME but undecodable data report a corrupt saved wallpaper', async t => {
  const runtime = storageRuntime(t)
  runtime.values.set('canvas', compressed())
  replace(t, 'createImageBitmap', async () => { throw new Error('invalid WebP payload') })
  replace(t, 'Image', undefined)
  await assert.rejects(loadWallpaper(), /saved wallpaper is invalid/)
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
})

test('persisted images outside prepared size limits are rejected and decoded memory is released', async t => {
  const runtime = storageRuntime(t)
  runtime.values.set('canvas', compressed())
  const decoded = imageRuntime(t, { width: 2561, height: 1440 })
  await assert.rejects(loadWallpaper(), /saved wallpaper is invalid/)
  assert.equal(decoded.calls.filter(call => call[0] === 'close').length, 1)
  assert.equal(runtime.calls.filter(call => call[0] === 'close').length, 1)
})
