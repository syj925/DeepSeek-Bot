export const WALLPAPER_MAX_BYTES = 25 * 1024 * 1024
const MAX_EDGE = 2560
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const DATABASE = 'ds-bot:wallpaper'
const STORE = 'images'
const KEY = 'canvas'

function failure(message, cause) {
  return new Error(message, cause ? { cause } : undefined)
}

async function validateFile(file) {
  if (!(file instanceof Blob) || !TYPES.has(file.type)) throw failure('Choose a JPEG, PNG, WebP or AVIF image.')
  if (!file.size) throw failure('The image file is empty.')
  if (file.size > WALLPAPER_MAX_BYTES) throw failure('Choose an image smaller than 25 MB.')
  let bytes
  try { bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer()) }
  catch (error) { throw failure('Could not open this image.', error) }
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  const matches = {
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10',
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
    'image/avif': ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 64)),
  }
  if (!matches[file.type]) throw failure('The image format does not match its file type.')
}

function decodeElement(file) {
  if (typeof Image !== 'function') return Promise.reject(failure('Image processing is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    const clean = () => {
      clearTimeout(timer)
      image.onload = image.onerror = null
      URL.revokeObjectURL(url)
    }
    const timer = setTimeout(() => {
      clean()
      image.src = ''
      reject(failure('The image took too long to open.'))
    }, 15000)
    image.onload = () => {
      clean()
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = '' } })
    }
    image.onerror = () => {
      clean()
      image.src = ''
      reject(failure('Could not open this image.'))
    }
    image.src = url
  })
}

async function decodeImage(file) {
  if (typeof createImageBitmap !== 'function') return decodeElement(file)
  try {
    const bitmap = await new Promise((resolve, reject) => {
      let expired = false
      const timer = setTimeout(() => {
        expired = true
        reject(failure('The image took too long to open.'))
      }, 15000)
      Promise.resolve().then(() => createImageBitmap(file)).then(bitmap => {
        clearTimeout(timer)
        if (expired) bitmap.close()
        else resolve(bitmap)
      }, error => { clearTimeout(timer); reject(error) })
    })
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch (error) {
    if (error.message === 'The image took too long to open.') throw error
    if (typeof Image === 'function') return decodeElement(file)
    throw failure('Could not open this image.', error)
  }
}

function encodeCanvas(canvas, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(failure('The image took too long to process.')), 15000)
    try {
      canvas.toBlob(blob => {
        clearTimeout(timer)
        if (blob?.size) resolve(blob)
        else reject(failure('Could not process this image.'))
      }, type, 0.86)
    } catch (error) {
      clearTimeout(timer)
      reject(failure('Could not process this image.', error))
    }
  })
}

export async function prepareWallpaper(file) {
  await validateFile(file)
  const decoded = await decodeImage(file)
  let canvas
  try {
    const { width, height } = decoded
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 32768 || height > 32768 || width * height > 100000000) {
      throw failure('The image dimensions are not supported.')
    }
    if (!globalThis.document?.createElement) throw failure('Image processing is unavailable in this browser.')
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw failure('Image processing is unavailable in this browser.')
    try { context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height) }
    catch (error) { throw failure('Could not process this image.', error) }
    let blob = await encodeCanvas(canvas, 'image/webp')
    if (blob.type !== 'image/webp') blob = await encodeCanvas(canvas, 'image/jpeg')
    if (!['image/webp', 'image/jpeg'].includes(blob.type)) throw failure('Could not process this image.')
    return blob
  } finally {
    decoded.close()
    // Release the temporary decoded canvas after its compressed Blob is ready.
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}

function storedImage(value) {
  return value instanceof Blob && ['image/webp', 'image/jpeg'].includes(value.type) && value.size > 0 && value.size <= WALLPAPER_MAX_BYTES
}

function accessWallpaper(operation, blob) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(failure('Wallpaper storage is unavailable.')); return }
    let database, transaction, settled = false, value = null
    const message = operation === 'put' ? 'Could not save the wallpaper.' : operation === 'delete' ? 'Could not remove the wallpaper.' : 'Could not load the wallpaper.'
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        try { transaction?.abort() } catch {}
      }
      database?.close()
      if (error) reject(error)
      else resolve(operation === 'get' ? value : undefined)
    }
    const fail = error => finish(failure(error?.name === 'QuotaExceededError' ? 'Wallpaper storage is full.' : message, error))
    const timer = setTimeout(() => finish(failure('Wallpaper storage took too long to respond.')), 8000)
    let request
    try { request = indexedDB.open(DATABASE, 1) } catch (error) { fail(error); return }
    request.onblocked = () => finish(failure('Wallpaper storage is busy. Close other app windows and try again.'))
    request.onerror = () => fail(request.error)
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return }
      try {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      } catch (error) { fail(error) }
    }
    request.onsuccess = () => {
      database = request.result
      if (settled) { database.close(); return }
      database.onversionchange = () => {
        database.close()
        finish(failure('Wallpaper storage changed. Please try again.'))
      }
      try {
        transaction = database.transaction(STORE, operation === 'get' ? 'readonly' : 'readwrite')
        transaction.oncomplete = () => finish()
        transaction.onerror = () => fail(transaction.error)
        transaction.onabort = () => fail(transaction.error)
        const store = transaction.objectStore(STORE)
        const result = operation === 'put' ? store.put(blob, KEY) : operation === 'delete' ? store.delete(KEY) : store.get(KEY)
        result.onerror = () => fail(result.error)
        if (operation === 'get') result.onsuccess = () => {
          if (result.result == null) value = null
          else if (storedImage(result.result)) value = result.result
          else finish(failure('The saved wallpaper is invalid. Choose another image.'))
        }
      } catch (error) { fail(error) }
    }
  })
}

export async function saveWallpaper(blob) {
  if (!storedImage(blob)) throw failure('Could not save the wallpaper.')
  await accessWallpaper('put', blob)
}

export async function loadWallpaper() {
  const blob = await accessWallpaper('get')
  if (!blob) return null
  let decoded
  try {
    decoded = await decodeImage(blob)
    if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) || decoded.width <= 0 || decoded.height <= 0 || decoded.width > MAX_EDGE || decoded.height > MAX_EDGE) {
      throw failure('The image dimensions are not supported.')
    }
    return blob
  } catch (error) {
    throw failure('The saved wallpaper is invalid. Choose another image.', error)
  } finally {
    decoded?.close()
  }
}
export const deleteWallpaper = () => accessWallpaper('delete')
