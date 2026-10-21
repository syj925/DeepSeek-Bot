import { createSource } from './sources.js'

export const MAX_PREVIEW_CHARS = 1000000
export const MAX_PREVIEW_LINES = 5000
export const fileName = path => path.replace(/\\/g, '/').split('/').at(-1) || path

export function fileKind(path) {
  const extension = fileName(path).split('.').at(-1).toLowerCase()
  if (['md', 'markdown', 'mdown'].includes(extension)) return 'markdown'
  if (['csv', 'tsv'].includes(extension)) return extension
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(extension)) return 'image'
  if (extension === 'pdf') return 'pdf'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'gz', 'tgz', '7z', 'rar', 'exe', 'dll', 'woff', 'woff2', 'ttf', 'mp4', 'mov', 'mp3', 'wav'].includes(extension)) return 'unsupported'
  return 'text'
}

const localPath = path => typeof path === 'string' && path.trim() && !path.includes('\0')
  && (!/^[a-z][a-z\d+.-]*:/i.test(path) || /^[a-z]:[/\\]/i.test(path)) && !path.startsWith('//')

function pathKey(path) {
  const slash = path.replace(/\\/g, '/')
  const parts = []
  for (const part of slash.split('/')) {
    if (part === '.') continue
    if (part === '..' && parts.length && parts.at(-1) !== '..' && parts.at(-1) !== '' && !/^[a-z]:$/i.test(parts.at(-1))) parts.pop()
    else parts.push(part)
  }
  const normalized = parts.join('/')
  return /^[a-z]:\//i.test(slash) || slash.startsWith('//') ? normalized.toLowerCase() : normalized
}

export function relatedFilePath(path, baseFile) {
  if (!localPath(path)) throw new Error('This is not a local file path.')
  if (/^(?:[/\\]|[a-z]:[/\\])/i.test(path) || !baseFile) return path
  const base = baseFile.replace(/\\/g, '/')
  return base.slice(0, base.lastIndexOf('/') + 1) + path
}

export function fileViewport(size) {
  return {
    width: Number.isFinite(size?.width) && size.width > 0 ? size.width : 1000,
    height: Number.isFinite(size?.height) && size.height > 0 ? size.height : 760,
  }
}

export function fitFileRect(rect, size) {
  rect ??= {}
  size = fileViewport(size)
  const width = Math.min(Math.max(1, size.width - 24), Math.max(360, rect.width || 680))
  const height = Math.min(Math.max(1, size.height - 104), Math.max(260, rect.height || 600))
  return { width, height,
    x: Math.max(12, Math.min(rect.x ?? 48, size.width - width - 12)),
    y: Math.max(12, Math.min(rect.y ?? 64, size.height - height - 92)),
  }
}

// File contents stay in the mounted viewer. This source holds only window identity
// and geometry; opening a preview never selects or starts a Session.
export function createCanvasFiles() {
  const source = createSource({ windows: [], active: null })
  let serial = 0
  const focus = id => source.set(state => state.windows.some(file => file.id === id)
    ? { ...state, active: id, windows: [...state.windows.filter(file => file.id !== id), state.windows.find(file => file.id === id)] } : state)
  return {
    source,
    open({ sessionId, path, line, ownerName, conversationId }, size) {
      if (typeof sessionId !== 'string' || !sessionId || !localPath(path)) throw new Error('This is not a local file path.')
      const key = JSON.stringify([sessionId, pathKey(path)])
      const state = source.getSnapshot(), existing = state.windows.find(file => file.key === key)
      const id = existing?.id ?? `file:${++serial}`
      const order = state.windows.length % 5
      size = fileViewport(size)
      const rect = fitFileRect({ x: size.width - 720 + order * 24, y: 52 + order * 24 }, size)
      const file = { ...existing, id, key, sessionId, path, name: fileName(path), ownerName, conversationId,
        line: Number.isSafeInteger(line) && line > 0 ? line : undefined,
        navigation: (existing?.navigation ?? 0) + 1, rect: existing?.rect ?? rect }
      source.set({ active: id, windows: [...state.windows.filter(file => file.id !== id), file] })
      return id
    },
    focus,
    blur() { source.set(state => state.active === null ? state : { ...state, active: null }) },
    update(id, rect) { source.set(state => ({ ...state, windows: state.windows.map(file => file.id === id ? { ...file, rect } : file) })) },
    close(id) { source.set(state => {
      const windows = state.windows.filter(file => file.id !== id)
      return { windows, active: state.active === id ? windows.at(-1)?.id ?? null : state.active }
    }) },
    clear() { source.set({ windows: [], active: null }) },
  }
}

const resultValue = result => {
  if (result?.ok === true) return result.value
  throw Object.assign(new Error('Could not load this file. Try again.'), { code: result?.error?.code })
}

export async function readPreviewPage(reader, file, signal, previous) {
  if (!reader?.read) throw Object.assign(new Error('The file reader is unavailable. Open this file in classic view.'), { code: 'file/reader-unavailable' })
  const offset = previous ? previous.offset + previous.lines : Math.max(1, (file.line ?? 1) - 20)
  const page = resultValue(await reader.read(file.sessionId, file.path, { offset, limit: 300 }, signal))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (previous && page.version !== previous.version) return readPreviewPage(reader, file, signal)
  const text = previous ? previous.text + (previous.lines ? '\n' : '') + page.text : page.text
  const lines = (previous?.lines ?? 0) + page.lines
  return { ...page, offset: previous?.offset ?? page.offset, text: text.slice(0, MAX_PREVIEW_CHARS), lines,
    limited: text.length >= MAX_PREVIEW_CHARS || lines >= MAX_PREVIEW_LINES }
}

export async function readPreviewBytes(reader, file, signal) {
  if (!reader?.readBytes) throw Object.assign(new Error('The file reader is unavailable. Open this file in classic view.'), { code: 'file/reader-unavailable' })
  const value = resultValue(await reader.readBytes(file.sessionId, file.path, {}, signal))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!(value.data instanceof Uint8Array) || !value.eof) throw new Error('The original file could not be read completely.')
  return value
}

export function fileFailure(error) {
  return ({
    'workspace-file/not-found': 'This file no longer exists or has moved.',
    'workspace-file/not-regular-file': 'This path is not a regular file.',
    'workspace-file/not-text': 'This file cannot be previewed as text. Download it or open it in classic view.',
    'workspace-file/too-large': 'This file exceeds the host file reader limit. Open it in classic view.',
    'workspace-file/outside-workspace': 'This file is not readable in its original workspace.',
    'gateway/lookup-not-found': 'The original workspace is no longer available.',
    'file/reader-unavailable': 'The file reader is unavailable. Open this file in classic view.',
  })[error?.code] ?? 'Could not load this file. Try again.'
}

// RFC 4180 quoting, including multiline cells. A paged prefix must not present
// its unfinished final record as a complete row.
export function tablePreview(text, delimiter = ',', eof = true, limit = 500) {
  const rows = []
  let row = [], cell = '', quoted = false, cut = false
  const endCell = () => { if (row.length < 80) row.push(cell); else cut = true; cell = '' }
  const endRow = () => { endCell(); rows.push(row); row = [] }
  text = text.replace(/^\uFEFF/, '')
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') { cell += '"'; at++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && !cell) quoted = true
    else if (char === delimiter) endCell()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[at + 1] === '\n') at++
      endRow()
      if (rows.length >= limit) return { rows, truncated: at < text.length - 1 || !eof || cut }
    } else cell += char
  }
  if (eof && !quoted && (cell || row.length)) endRow()
  return { rows, truncated: !eof || quoted || cut }
}
