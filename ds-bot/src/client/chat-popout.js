import { useEffect, useRef } from 'react'
import { fitChat } from './chat-geometry.js'
import { t } from './i18n.js'

export const CHAT_POPOUT_EVENT = 'bt:chat-popout'
export const CHAT_POPOUT_CSS = '.bt-team-split-chat > .bt-team-chat-bar{cursor:grab;touch-action:none}'
const placements = new Map()
const clickBlockers = new WeakMap()
const interactive = 'button,a,input,textarea,select,option,label,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="slider"],[role="combobox"],[role="textbox"],[role="menuitem"],[role="listbox"],[role="option"],[role="separator"],[role="scrollbar"],[draggable="true"],audio,video,canvas,iframe,embed,object,img,svg,[data-no-chat-drag],.bt-team-chat-resize,.bt-canvas-chat-resize'
const blockedDrop = 'nav,[role="navigation"],[role="menu"],[role="listbox"],[role="dialog"],.bt-menu,.bt-overlay,.bt-drawer,.bt-team-sidebar-nav'
const pointInside = (rect, x, y) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
const composing = event => event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229

function rectangle(value) {
  if (!value) return undefined
  const { left, top, width, height } = value
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined
  return { left, top, width, height, right: left + width, bottom: top + height }
}

export function stageChatPopout(id, rect, bounds, view = typeof window === 'undefined' ? undefined : window) {
  const target = rectangle(rect), canvas = rectangle(bounds)
  if (!id || !target || !canvas) return undefined
  const fit = fitChat({ width: target.width, height: target.height }, {
    x: target.left + target.width / 2 - canvas.left - canvas.width / 2,
    y: target.top + target.height / 2 - canvas.top - canvas.height / 2,
  }, canvas.width, canvas.height)
  const request = { entityId: id, size: fit.size, offset: fit.offset }
  placements.set(id, request)
  if (view?.dispatchEvent && view.CustomEvent) view.dispatchEvent(new view.CustomEvent(CHAT_POPOUT_EVENT, { detail: request }))
  return request
}

export function takeChatPopout(id) {
  const request = placements.get(id)
  placements.delete(id)
  return request
}

function suppressPointerClick(document, view) {
  clickBlockers.get(document)?.()
  let timer
  const clear = () => {
    document.removeEventListener('click', click, true)
    document.removeEventListener('pointerdown', clear, true)
    view.clearTimeout(timer)
    if (clickBlockers.get(document) === clear) clickBlockers.delete(document)
  }
  const click = event => {
    if (event.detail === 0) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    clear()
  }
  clickBlockers.set(document, clear)
  document.addEventListener('click', click, true)
  document.addEventListener('pointerdown', clear, true)
  timer = view.setTimeout(clear, 600)
}

function textAtPoint(document, target, x, y) {
  for (const node of target.childNodes ?? []) {
    if (node.nodeType !== 3 || !node.textContent?.trim()) continue
    if (!document.createRange) return true
    const range = document.createRange()
    range.selectNodeContents(node)
    const hits = [...range.getClientRects()].some(rect => pointInside(rect, x, y))
    range.detach?.()
    if (hits) return true
  }
  return false
}

function scrollbarAtPoint(target, x, y) {
  if (!target?.getBoundingClientRect) return false
  const rect = target.getBoundingClientRect()
  const vertical = Number.isFinite(target.offsetWidth) && Number.isFinite(target.clientWidth) && target.offsetWidth - target.clientWidth > 2 && target.scrollHeight > target.clientHeight
  const horizontal = Number.isFinite(target.offsetHeight) && Number.isFinite(target.clientHeight) && target.offsetHeight - target.clientHeight > 2 && target.scrollWidth > target.clientWidth
  return vertical && x >= rect.left + target.clientLeft + target.clientWidth || horizontal && y >= rect.top + target.clientTop + target.clientHeight
}

export function useChatPopoutDrag({ enabled, id, onPopout }) {
  const latest = useRef(null), gesture = useRef(null), suppressedClick = useRef(null)
  latest.current = { enabled, id, onPopout }
  const cancel = () => gesture.current?.cleanup()
  useEffect(() => {
    suppressedClick.current = null
    return cancel
  }, [enabled, id])

  const onPointerDownCapture = event => {
    if (gesture.current) { cancel(); return }
    if (!latest.current.enabled || !latest.current.id || event.button !== 0 || event.isPrimary === false || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const pane = event.currentTarget, target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
    const document = pane?.ownerDocument, view = document?.defaultView
    if (!target?.closest || !document || !view || !pane.contains(target) || target.closest(interactive)) return
    const header = target.closest('.bt-team-chat-bar'), inHeader = header && pane.contains(header)
    if (event.pointerType === 'touch' && !inHeader) return
    if (!inHeader && (document.getSelection?.()?.isCollapsed === false || textAtPoint(document, target, event.clientX, event.clientY))) return
    for (let node = target; node; node = node.parentElement) {
      if (scrollbarAtPoint(node, event.clientX, event.clientY)) return
      if (node === pane) break
    }
    const canvas = pane.closest('.bt-canvas-frame')?.querySelector('.bt-canvas') ?? document.querySelector('.bt-canvas')
    const source = rectangle(pane.getBoundingClientRect()), bounds = rectangle(canvas?.getBoundingClientRect())
    if (!source || !bounds) return
    suppressedClick.current = null
    const state = {
      id: latest.current.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: source.left, y: source.top, source, dragging: false, frame: null, ghost: null,
    }
    const listeners = []
    const listen = (node, type, run) => { node.addEventListener(type, run, true); listeners.push(() => node.removeEventListener(type, run, true)) }
    state.cleanup = () => {
      if (gesture.current !== state) return
      gesture.current = null
      for (const remove of listeners) remove()
      if (state.frame !== null) view.cancelAnimationFrame(state.frame)
      state.ghost?.remove()
      if (pane.hasPointerCapture?.(state.pointerId)) pane.releasePointerCapture(state.pointerId)
      if (state.dragging) suppressedClick.current = { pane, until: Date.now() + 600 }
    }
    const draw = () => {
      state.frame = null
      if (state.ghost) {
        state.ghost.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`
        state.ghost.style.visibility = 'visible'
      }
    }
    const move = next => {
      if (next.pointerId !== state.pointerId) return
      if (!latest.current.enabled || latest.current.id !== state.id) { state.cleanup(); return }
      if (!state.dragging && Math.hypot(next.clientX - state.startX, next.clientY - state.startY) < 6) return
      if (!state.dragging) {
        state.dragging = true
        pane.setPointerCapture?.(state.pointerId)
        const ghost = state.ghost = document.createElement('div')
        ghost.className = 'bt-chat-popout-ghost'
        ghost.setAttribute('data-chat-popout-ghost', '')
        ghost.setAttribute('aria-hidden', 'true')
        ghost.textContent = t('Move conversation to canvas')
        Object.assign(ghost.style, {
          position: 'fixed', left: '0', top: '0', width: `${source.width}px`, height: `${source.height}px`,
          boxSizing: 'border-box', border: '1px solid rgba(23,23,23,.45)', borderRadius: '24px',
          background: 'rgba(255,255,255,.35)', color: '#171717', padding: '20px', pointerEvents: 'none',
          zIndex: '2147483000', willChange: 'transform', visibility: 'hidden',
        })
        document.body.appendChild(ghost)
      }
      next.preventDefault()
      next.stopPropagation()
      state.x = source.left + next.clientX - state.startX
      state.y = source.top + next.clientY - state.startY
      if (state.frame === null) state.frame = view.requestAnimationFrame(draw)
    }
    const up = next => {
      if (next.pointerId !== state.pointerId) return
      const currentBounds = rectangle(canvas.getBoundingClientRect())
      const hit = document.elementFromPoint?.(next.clientX, next.clientY)
      const rejected = hit && !pane.contains(hit) && hit.closest?.(blockedDrop)
      const commit = state.dragging && latest.current.enabled && latest.current.id === state.id && currentBounds && pointInside(currentBounds, next.clientX, next.clientY) && !rejected
      const rect = rectangle({ ...source, left: source.left + next.clientX - state.startX, top: source.top + next.clientY - state.startY })
      if (state.dragging) { next.preventDefault(); next.stopPropagation() }
      state.cleanup()
      if (commit) {
        // The source pane may unmount before the browser dispatches its pointer click.
        suppressPointerClick(document, view)
        latest.current.onPopout?.({ id: state.id, rect, bounds: currentBounds })
      }
    }
    listen(document, 'pointermove', move)
    listen(document, 'pointerup', up)
    listen(document, 'pointercancel', next => { if (next.pointerId === state.pointerId) state.cleanup() })
    listen(document, 'pointerdown', next => { if (next.pointerId !== state.pointerId) state.cleanup() })
    listen(document, 'lostpointercapture', next => { if (next.pointerId === state.pointerId) state.cleanup() })
    listen(document, 'keydown', next => { if (next.key === 'Escape' && !next.defaultPrevented && !composing(next)) { if (state.dragging) { next.preventDefault(); next.stopPropagation() }; state.cleanup() } })
    listen(document, 'scroll', state.cleanup)
    // Captured input blur is normal when moving from the composer to the title.
    listen(view, 'blur', next => { if (next.target === view) state.cleanup() })
    listen(view, 'resize', state.cleanup)
    gesture.current = state
  }
  const onClickCapture = event => {
    const blocked = suppressedClick.current
    if (event.detail === 0 || !blocked) return
    suppressedClick.current = null
    if (blocked.pane === event.currentTarget && Date.now() <= blocked.until) { event.preventDefault(); event.stopPropagation() }
  }
  const onKeyDownCapture = event => {
    if (event.key === 'Escape' && gesture.current && !event.defaultPrevented && !composing(event)) { if (gesture.current.dragging) { event.preventDefault(); event.stopPropagation() }; cancel(); return }
    if (!latest.current.enabled || !latest.current.id || event.defaultPrevented || event.repeat || composing(event) || event.target !== event.currentTarget || !event.shiftKey || !(event.ctrlKey || event.metaKey) || event.altKey || event.key !== 'Enter') return
    const pane = event.currentTarget, document = pane.ownerDocument
    const canvas = pane.closest('.bt-canvas-frame')?.querySelector('.bt-canvas') ?? document.querySelector('.bt-canvas')
    const rect = rectangle(pane.getBoundingClientRect()), bounds = rectangle(canvas?.getBoundingClientRect())
    if (!rect || !bounds) return
    cancel()
    event.preventDefault(); event.stopPropagation()
    latest.current.onPopout?.({ id: latest.current.id, rect, bounds })
  }
  return { onPointerDownCapture, onClickCapture, onKeyDownCapture }
}
