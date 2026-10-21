import { createElement as h, Component, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { CloseIcon, DownloadIcon } from './icons.js'
import { fileFailure, fileKind, fileViewport, fitFileRect, readPreviewBytes, readPreviewPage, relatedFilePath, tablePreview } from './canvas-files.js'
import { MarkdownFileLinks } from './file-navigation.js'
import { t } from './i18n.js'

const tool = (label, onClick, content = label, extra = {}) => h('button', { type: 'button', className: 'bt-file-tool', title: t(label), 'aria-label': t(label), onClick, ...extra }, typeof content === 'string' ? t(content) : content)
const mimeOf = file => fileKind(file.path) === 'pdf' ? 'application/pdf'
  : ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' })[file.name.split('.').at(-1).toLowerCase()] ?? 'application/octet-stream'

function FileTable({ text, kind, eof }) {
  const { rows, truncated } = useMemo(() => tablePreview(text, kind === 'tsv' ? '\t' : ',', eof), [text, kind, eof])
  return h(Fragment, null,
    rows.length ? h('table', { className: 'bt-file-table' },
      h('thead', null, h('tr', null, rows[0].map((cell, index) => h('th', { key: index, scope: 'col' }, cell || '—')))),
      h('tbody', null, rows.slice(1).map((row, index) => h('tr', { key: index }, row.map((cell, column) => h('td', { key: column }, cell)))))) : h('p', null, t('No complete rows to display yet.')),
    truncated ? h('p', { className: 'bt-file-note', role: 'status' }, t('Table preview is limited to 500 rows and 80 columns. Download the original for all data.')) : null)
}

export function CanvasFileWindow({ file, active, order = 0, size, actions }) {
  size = fileViewport(size)
  const node = useRef(null), body = useRef(null), gesture = useRef(null), downloadController = useRef(null), pageController = useRef(null), previousFocus = useRef(null)
  const [view, setView] = useState({ loading: true })
  const [source, setSource] = useState(Boolean(file.line))
  const [revision, setRevision] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const [maximized, setMaximized] = useState(false)
  const rect = maximized ? fitFileRect({ x: 12, y: 12, width: size.width, height: size.height }, size) : fitFileRect(file.rect, size)
  const kind = fileKind(file.path), binary = kind === 'image' || kind === 'pdf'
  const labels = useMemo(() => ({ code: { copyLabel: t('Copy'), copiedLabel: t('Copied') }, footnotes: t('Footnotes') }), [t('Copy'), t('Copied'), t('Footnotes')])
  const [mediaUrl, setMediaUrl] = useState(null)
  useEffect(() => {
    if (!view.data) { setMediaUrl(null); return undefined }
    const url = URL.createObjectURL(new Blob([view.data], { type: mimeOf(file) }))
    setMediaUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [view.data, file.path])
  useEffect(() => {
    previousFocus.current = node.current?.ownerDocument.activeElement
    return () => {
      downloadController.current?.abort()
      pageController.current?.abort()
    }
  }, [])
  useEffect(() => { if (active) node.current?.focus({ preventScroll: true }) }, [file.navigation])
  useEffect(() => {
    const controller = new AbortController()
    pageController.current?.abort()
    pageController.current = controller
    downloadController.current?.abort()
    setDownloading(false)
    setSource(Boolean(file.line))
    setView({ loading: kind !== 'unsupported' })
    setDownloadError(null)
    if (body.current) body.current.scrollTop = 0
    if (kind !== 'unsupported') {
      const reader = actions.canvasFileReader()
      void (binary ? readPreviewBytes(reader, file, controller.signal) : readPreviewPage(reader, file, controller.signal)).then(
        value => { if (!controller.signal.aborted) setView({ ...value, loading: false }) },
        error => { if (!controller.signal.aborted) setView({ loading: false, error }) },
      )
    }
    return () => { controller.abort(); pageController.current?.abort() }
  }, [file.sessionId, file.path, file.line, file.navigation, revision])
  useEffect(() => {
    if (!source || !file.line || view.loading) return
    body.current?.querySelector(`[data-file-line="${file.line}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [source, file.line, view.offset, view.loading])
  const more = () => {
    if (view.loading || view.eof || view.limited) return
    const controller = new AbortController()
    pageController.current?.abort()
    pageController.current = controller
    setView(value => ({ ...value, loading: true, error: undefined }))
    void readPreviewPage(actions.canvasFileReader(), file, controller.signal, view).then(
      value => { if (!controller.signal.aborted) setView({ ...value, loading: false }) },
      error => { if (!controller.signal.aborted) setView(value => ({ ...value, loading: false, error })) },
    )
  }
  const download = async () => {
    if (downloading) return
    const controller = new AbortController()
    downloadController.current?.abort()
    downloadController.current = controller
    setDownloading(true); setDownloadError(null)
    try {
      // Never export the paged or truncated preview as if it were the original.
      const original = await readPreviewBytes(actions.canvasFileReader(), file, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(new Blob([original.data], { type: mimeOf(file) }))
      const anchor = node.current.ownerDocument.createElement('a')
      anchor.href = url; anchor.download = file.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { if (!controller.signal.aborted) setDownloadError(error) }
    finally { if (!controller.signal.aborted) setDownloading(false) }
  }
  const close = () => {
    if (node.current?.contains(node.current.ownerDocument.activeElement) && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    actions.closeCanvasFile(file.id)
  }
  const start = (event, edge) => {
    if (event.button !== 0 || maximized) return
    event.preventDefault(); event.stopPropagation()
    actions.focusCanvasFile(file.id)
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect, edge }
    node.current.setPointerCapture(event.pointerId)
  }
  const end = event => {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    if (node.current.hasPointerCapture(event.pointerId)) node.current.releasePointerCapture(event.pointerId)
  }
  const updateRect = next => actions.updateCanvasFile(file.id, fitFileRect(next, size))
  const filePath = view.absolutePath ?? file.path
  return h('section', {
    ref: node, className: 'bt-canvas-file glass-card', role: 'dialog', tabIndex: -1, 'aria-label': `${t('File preview')} · ${file.name}`,
    'data-file-window': file.id, 'data-active': active || undefined,
    style: { left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: active ? 60 : 35 + order / 100 },
    onPointerDown: event => { event.stopPropagation(); if (!active) actions.focusCanvasFile(file.id) },
    onFocusCapture: () => { if (!active) actions.focusCanvasFile(file.id) },
    onWheel: event => event.stopPropagation(),
    onPointerMove: event => {
      const current = gesture.current
      if (current?.id !== event.pointerId) return
      const dx = event.clientX - current.x, dy = event.clientY - current.y
      const next = current.edge ? { ...current.rect, width: Math.min(size.width - current.rect.x - 12, current.rect.width + dx), height: Math.min(size.height - current.rect.y - 92, current.rect.height + dy) }
        : { ...current.rect, x: current.rect.x + dx, y: current.rect.y + dy }
      updateRect(next); event.stopPropagation()
    },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { gesture.current = null },
    onKeyDown: event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close() } },
  },
  h('header', { className: 'bt-file-titlebar', onDoubleClick: event => { if (!event.target.closest('button')) setMaximized(value => !value) }, onPointerDown: event => { if (!event.target.closest('button')) start(event) } },
    h('div', { className: 'bt-file-heading' }, h('strong', null, file.name), h('span', null, file.ownerName ? t('From {name}', { name: file.ownerName }) : t('File preview'))),
    h('div', { className: 'bt-file-tools' }, tool(maximized ? 'Restore window' : 'Maximize window', () => setMaximized(value => !value), maximized ? '❐' : '□'), tool('Close preview', close, h(CloseIcon)))),
  h('div', { className: 'bt-file-toolbar' },
    h('span', { className: 'bt-file-path', title: filePath }, filePath),
    ['markdown', 'csv', 'tsv'].includes(kind) ? tool(source ? 'Preview' : 'Source', () => setSource(value => !value), source ? 'Preview' : 'Source', { 'aria-pressed': source }) : null,
    tool('Reload file', () => { downloadController.current?.abort(); setDownloading(false); setRevision(value => value + 1) }, '↻', { disabled: view.loading }),
    tool(downloading ? 'Downloading…' : 'Download original', download, h(DownloadIcon), { disabled: downloading })),
  h('div', { ref: body, className: 'bt-file-body', 'aria-busy': view.loading },
    kind === 'unsupported' ? h('div', { className: 'bt-file-empty' }, h('p', null, t('This format can be downloaded or opened in classic view.'))) : null,
    binary && mediaUrl ? kind === 'image' ? h('img', { className: 'bt-file-image', src: mediaUrl, alt: file.name, onError: () => setView(value => ({ ...value, error: new Error('Image decode failed') })) })
      : h('iframe', { className: 'bt-file-pdf', title: file.name, src: mediaUrl, sandbox: '', referrerPolicy: 'no-referrer' }) : null,
    typeof view.text === 'string' ? h(Fragment, null,
      view.offset > 1 ? h('p', { className: 'bt-file-note' }, t('Showing from line {line}', { line: view.offset })) : null,
      source || kind === 'text' ? h('pre', { className: 'bt-file-source' }, view.text.split('\n').map((text, index) => h('span', { key: index + view.offset, 'data-file-line': index + view.offset }, h('span', { className: 'bt-file-line-number', 'aria-hidden': true }, index + view.offset), text)))
        : kind === 'markdown' ? h('article', { className: 'bt-file-markdown' }, h(MarkdownFileLinks, {
          openFile: (path, options) => actions.openCanvasFile({ sessionId: file.sessionId, conversationId: file.conversationId, path: relatedFilePath(path, filePath), line: options?.line, ownerName: file.ownerName }),
        }, h(MarkdownText, { text: view.text, labels })))
          : h(FileTable, { text: view.text, kind, eof: view.eof && !view.limited }),
      view.limited ? h('p', { className: 'bt-file-note', role: 'status' }, t('Preview limit reached. Download the original file for the complete contents.'))
        : !view.eof && !view.loading ? tool('Load more', more) : null) : null,
    view.loading ? h('div', { className: 'bt-file-loading', role: 'status' }, t('Loading file…')) : null,
    view.error ? h('div', { className: 'bt-file-error', role: 'alert' }, h('p', null, t(fileFailure(view.error))), tool('Retry', () => setRevision(value => value + 1))) : null,
    downloadError ? h('p', { className: 'bt-file-error', role: 'alert' }, t(fileFailure(downloadError))) : null),
  h('footer', { className: 'bt-file-footer' }, h('span', null, t('Preview only · original file unchanged')), tool('Open in classic view', () => actions.openCanvasFileClassic(file))),
  !maximized ? h('button', { type: 'button', className: 'bt-file-resize', title: t('Drag to resize'), 'aria-label': t('Resize file preview'),
    onPointerDown: event => start(event, 'se'), onKeyDown: event => {
      const step = event.shiftKey ? 40 : 16
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      updateRect({ ...rect, width: rect.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), height: rect.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) })
    },
  }, '⌟') : null)
}

class FilePreviewBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { this.props.actions.reportError?.(error, 'canvas-file-preview') }
  componentDidUpdate(previous) {
    if (this.state.failed && previous.file.navigation !== this.props.file.navigation) this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    const { file, size, active, order, actions } = this.props
    const rect = fitFileRect(file.rect, size)
    return h('section', { className: 'bt-canvas-file glass-card', role: 'dialog', 'aria-label': `${t('File preview')} · ${file.name}`,
      'data-file-window': file.id, 'data-preview-failed': true,
      style: { left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: active ? 60 : 35 + order / 100 },
      onPointerDown: event => { event.stopPropagation(); actions.focusCanvasFile(file.id) },
    }, h('header', { className: 'bt-file-titlebar' }, h('strong', null, file.name), tool('Close preview', () => actions.closeCanvasFile(file.id), h(CloseIcon))),
    h('div', { className: 'bt-file-body' }, h('div', { className: 'bt-file-error', role: 'alert' },
      h('p', null, t('This preview could not be displayed. Your workspace is still open.')),
      tool('Retry', () => this.setState({ failed: false })),
      tool('Open in classic view', () => actions.openCanvasFileClassic(file)))))
  }
}

export function CanvasFiles({ useCanvasFiles, actions, size }) {
  const files = useCanvasFiles(state => state)
  return h(Fragment, null, files.windows.map((file, order) => {
    const props = { file, order, active: files.active === file.id, size, actions }
    return h(FilePreviewBoundary, { key: file.id, ...props }, h(CanvasFileWindow, props))
  }))
}

export const CANVAS_FILES_CSS = `
.bt-canvas-file{position:absolute;display:flex;flex-direction:column;min-width:0;box-sizing:border-box;border:1px solid var(--glass-border,rgba(255,255,255,.65));border-radius:20px;background:var(--glass-floating,rgba(246,249,252,.83));color:var(--bt-ink,#253047);backdrop-filter:blur(30px) saturate(1.15);-webkit-backdrop-filter:blur(30px) saturate(1.15);box-shadow:0 20px 70px rgba(22,37,64,.2);isolation:isolate;animation:bt-file-open .2s ease-out}
.bt-canvas-file:focus{outline:none}.bt-canvas-file:focus-visible{outline:2px solid var(--bt-accent,#3e80e9);outline-offset:2px}.bt-canvas-file[data-active]{box-shadow:0 24px 80px rgba(22,37,64,.26)}
.bt-file-titlebar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none;padding:14px 16px;cursor:grab;touch-action:none;user-select:none}.bt-file-titlebar:active{cursor:grabbing}
.bt-file-heading{display:flex;flex-direction:column;gap:3px;min-width:0}.bt-file-heading strong{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-file-heading>span{font-size:11px;opacity:.65}
.bt-file-tools,.bt-file-toolbar{display:flex;align-items:center;gap:6px;min-width:0}.bt-file-tools{flex:none}.bt-file-toolbar{padding:8px 14px;border-block:1px solid var(--glass-border,rgba(255,255,255,.5));flex:none}
.bt-file-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;font:11px/20px ui-monospace,monospace;opacity:.65}
.bt-file-tool{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:30px;min-height:30px;padding:4px 8px;border:1px solid var(--glass-border,rgba(255,255,255,.5));border-radius:9px;background:rgba(255,255,255,.42);color:inherit;font:500 11px/18px system-ui;cursor:pointer;flex:none}.bt-file-tool:hover{background:rgba(255,255,255,.7)}.bt-file-tool:disabled{opacity:.5;cursor:default}.bt-file-tool svg{width:16px;height:16px}
.bt-file-body{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;padding:20px;background:color-mix(in srgb,var(--bt-ground,#fff) 88%,transparent);border-radius:0;user-select:text;scrollbar-width:thin}
.bt-file-markdown{max-width:960px;margin:auto}.bt-file-markdown table{font-size:13px}.bt-file-source{font:12px/1.8 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;tab-size:4}.bt-file-source>span{display:block;min-height:1.8em}.bt-file-line-number{display:inline-block;min-width:4ch;margin-right:16px;opacity:.4;user-select:none;text-align:right}
.bt-file-table{border-collapse:collapse;font-size:12px;line-height:1.65;min-width:100%;text-align:left}.bt-file-table th,.bt-file-table td{vertical-align:top;min-width:88px;max-width:520px;white-space:pre-wrap;overflow-wrap:anywhere;padding:9px 12px;border-bottom:1px solid var(--glass-border,rgba(127,145,170,.2))}.bt-file-table th{font-weight:600;background:var(--glass-floating,rgba(232,239,247,.85));position:sticky;top:-20px;z-index:1}.bt-file-table tbody tr:hover{background:rgba(127,145,170,.06)}
.bt-file-loading,.bt-file-empty,.bt-file-error{padding:20px 8px;font-size:13px;line-height:1.7}.bt-file-error{color:var(--bt-danger,#b84b47)}.bt-file-note{font-size:11px;line-height:1.7;opacity:.65;margin:16px 0}.bt-file-image{display:block;max-width:100%;height:auto;margin:auto}.bt-file-pdf{display:block;width:100%;height:100%;min-height:240px;border:0;background:#fff}
.bt-file-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:7px 18px}.bt-file-footer>span{font-size:10px;opacity:.55}.bt-file-footer .bt-file-tool{border:0;background:transparent}.bt-file-resize{position:absolute;right:1px;bottom:1px;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;opacity:.45;cursor:nwse-resize;touch-action:none}
@keyframes bt-file-open{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.bt-canvas-file{animation:none}}`
