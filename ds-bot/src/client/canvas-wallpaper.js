import { canvasTheme } from './canvas-theme.js'
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderIcon, CloseIcon } from './icons.js'
import { loadWallpaper, saveWallpaper, deleteWallpaper, prepareWallpaper } from './wallpaper-image.js'
import { t } from './i18n.js'

function WallpaperMenu({ anchor, onClose, choose, reset, busy, custom, error, loading }) {
  const panel = useRef(null)
  const [position, setPosition] = useState({ left: 12, top: 72 })
  useLayoutEffect(() => {
    const place = () => {
      const box = anchor.current.getBoundingClientRect()
      const height = panel.current?.getBoundingClientRect().height ?? 220
      setPosition({ left: Math.max(8, Math.min(box.left, innerWidth - 288)), top: Math.max(8, Math.min(box.bottom + 8, innerHeight - height - 8)) })
    }
    place()
    panel.current?.querySelector('.bt-wallpaper-choose')?.focus()
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place); observer.disconnect() }
  }, [])
  useEffect(() => {
    const down = event => { if (!panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose() }
    const key = event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); anchor.current?.focus() } }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true) }
  }, [onClose])
  return createPortal(h('section', { ref: panel, className: 'bt-wallpaper-menu', role: 'dialog', 'aria-label': t('Canvas wallpaper'), style: position },
    h('header', null, h('strong', null, t('Canvas wallpaper')), h('button', { type: 'button', onClick: () => { onClose(); anchor.current?.focus() }, 'aria-label': t('Close') }, h(CloseIcon))),
    h('p', null, t('Choose a lake, forest or any image you like.')),
    h('button', { type: 'button', className: 'bt-wallpaper-choose', onClick: choose, disabled: busy || loading }, h(FolderIcon), busy ? t('Saving wallpaper…') : t('Choose local image')),
    h('button', { type: 'button', onClick: reset, disabled: busy || loading || (!custom && !error) }, t('Restore default background')),
    h('small', null, t('Saved on this device only. Images are not uploaded.')),
    h('small', null, t('JPG, PNG, WebP or AVIF · Up to 25 MB')),
    error ? h('p', { role: 'alert', className: 'bt-wallpaper-error' }, error) : h('span', { className: 'bt-wallpaper-feedback', role: 'status' }, busy ? t('Saving wallpaper…') : loading ? t('Loading…') : custom ? t('Your wallpaper is saved') : '')), document.body)
}

export function CanvasWallpaper({ canvasRef }) {
  const input = useRef(null), anchor = useRef(null), url = useRef(null), generation = useRef(0)
  const [open, setOpen] = useState(false), [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const apply = blob => {
    const previous = url.current
    const next = blob ? URL.createObjectURL(blob) : null
    url.current = next
    const canvas = canvasRef.current
    if (next) { canvas?.style.setProperty('--bt-wallpaper-image', `url("${next}")`); canvas?.setAttribute('data-wallpaper', 'custom') }
    else { canvas?.style.removeProperty('--bt-wallpaper-image'); canvas?.removeAttribute('data-wallpaper') }
    if (previous) URL.revokeObjectURL(previous)
    setCustom(Boolean(next))
  }
  useEffect(() => {
    const current = ++generation.current
    const canvas = canvasRef.current
    loadWallpaper().then(blob => { if (current === generation.current) apply(blob) })
      .catch(failure => { if (current === generation.current) setError(t(failure.message)) })
      .finally(() => { if (current === generation.current) setLoading(false) })
    return () => {
      generation.current++
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = null
      canvas?.style.removeProperty('--bt-wallpaper-image')
      canvas?.removeAttribute('data-wallpaper')
    }
  }, [])
  const change = async file => {
    if (!file || busy || loading) return
    const current = ++generation.current
    setBusy(true); setError('')
    try {
      const blob = await prepareWallpaper(file)
      if (current !== generation.current) return
      await saveWallpaper(blob)
      if (current === generation.current) apply(blob)
    } catch (failure) { if (current === generation.current) setError(t(failure.message)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  const reset = async () => {
    if (busy || loading) return
    const current = ++generation.current
    setBusy(true); setError('')
    try { await deleteWallpaper(); if (current === generation.current) apply(null) }
    catch (failure) { if (current === generation.current) setError(t(failure.message)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  return h('span', { className: 'bt-wallpaper-control' },
    h('style', null, WALLPAPER_CSS),
    h('button', { type: 'button', ref: anchor, className: 'bt-canvas-button', onClick: () => setOpen(value => !value), 'aria-label': t('Canvas wallpaper'), 'aria-haspopup': 'dialog', 'aria-expanded': open }, h(FolderIcon), t('Wallpaper')),
    h('input', { ref: input, type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', hidden: true, 'aria-label': t('Choose local image'), onChange: event => { const file = event.target.files?.[0]; event.target.value = ''; void change(file) } }),
    open ? h(WallpaperMenu, { anchor, onClose: () => setOpen(false), choose: () => input.current?.click(), reset, busy, loading, custom, error }) : null)
}

const WALLPAPER_CSS = `
${canvasTheme('.bt-wallpaper-menu')}
.bt-wallpaper-control{display:inline-flex}
.bt-wallpaper-menu{position:fixed;z-index:90;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;width:280px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;overscroll-behavior:contain;padding:14px;border:1px solid var(--bt-canvas-border);border-radius:24px;background:var(--bt-canvas-chat);box-shadow:var(--bt-canvas-shadow);color:var(--bt-ink);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px)}
.bt-wallpaper-menu header{display:flex;align-items:center;justify-content:space-between;gap:8px}.bt-wallpaper-menu header button{padding:4px;min-height:30px}
.bt-wallpaper-menu p{margin:0;color:var(--bt-ink-2)}.bt-wallpaper-menu small{font-size:11px;color:var(--bt-ink-3)}
.bt-wallpaper-menu button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 10px;border:1px solid var(--bt-line);border-radius:10px;background:var(--bt-canvas-button);color:inherit;font:inherit;cursor:pointer}
.bt-wallpaper-menu button:hover:not(:disabled){background:var(--bt-hover)}.bt-wallpaper-menu button:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}.bt-wallpaper-menu button:disabled{opacity:.45;cursor:default}
.bt-wallpaper-menu .bt-wallpaper-choose{background:var(--bt-accent);color:var(--bt-accent-ink)}.bt-wallpaper-menu .bt-wallpaper-choose:hover:not(:disabled){background:color-mix(in srgb,var(--bt-accent) 88%,var(--bt-card))}
.bt-wallpaper-menu .bt-wallpaper-error{color:var(--bt-canvas-error);overflow-wrap:anywhere}.bt-wallpaper-feedback{font-size:11px;color:var(--bt-accent)}.bt-wallpaper-feedback:empty{display:none}
@media (pointer:coarse){.bt-wallpaper-menu button{min-height:44px}}
@media (prefers-reduced-transparency:reduce){.bt-wallpaper-menu{background:var(--bt-card);-webkit-backdrop-filter:none;backdrop-filter:none}}
@media (forced-colors:active){.bt-wallpaper-menu{background:Canvas;color:CanvasText;border-color:CanvasText}.bt-wallpaper-menu :is(p,small,.bt-wallpaper-error,.bt-wallpaper-feedback){color:CanvasText}.bt-wallpaper-menu button,.bt-wallpaper-menu .bt-wallpaper-choose{background:ButtonFace;color:ButtonText;border-color:ButtonText}}
`
