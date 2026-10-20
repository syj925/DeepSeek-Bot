import { useLayoutEffect, useRef } from 'react'
import { COMPOSER_CARET_CSS, observeComposerCaret } from './composer-caret.js'

const EDITOR = '[data-composer-input],textarea[data-bt-home-input],input[data-bt-home-input]'
const PRIMARY = 'button[class*="_primary"],button[type="submit"]'
const SHAPE_DURATION = 210
const EASE = 'cubic-bezier(.2,.75,.25,1)'

const stamp = (node, name, value) => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

// Decorate only this surface. The shell still owns its editor, selection, IME,
// submission and scroll position; no input character is wrapped or animated.
export function observeComposerMotion(card, { reducedMotion } = {}) {
  const view = card.ownerDocument.defaultView
  const motion = reducedMotion ?? view.matchMedia?.('(prefers-reduced-motion: reduce)')
  const savedAttributes = new Map()
  const owned = new Set()
  let editor = null, resize = null, frame = 0, stopped = false, composing = false
  let targetHeight = 0, shape = null, geometry = '', homeHeight = '', homeOverflow = ''
  const glyphs = new Map()
  const animations = new Set()
  const mark = (node, name, value) => {
    let attributes = savedAttributes.get(node)
    if (!attributes) { attributes = new Map(); savedAttributes.set(node, attributes) }
    if (!attributes.has(name)) attributes.set(name, node.getAttribute(name))
    stamp(node, name, value)
  }
  const restore = node => {
    for (const [name, value] of savedAttributes.get(node) ?? []) { if (value === null) node.removeAttribute(name); else node.setAttribute(name, value) }
    savedAttributes.delete(node)
  }
  const cancelShape = () => { shape?.cancel(); shape = null }
  const cancelAnimations = () => {
    cancelShape()
    for (const animation of animations) animation.cancel()
    animations.clear()
  }
  const animate = (node, frames, options) => {
    if (motion?.matches || typeof node.animate !== 'function') return null
    const animation = node.animate(frames, options)
    animations.add(animation)
    animation.onfinish = () => animations.delete(animation)
    return animation
  }
  const refresh = () => {
    frame = 0
    if (stopped) return
    const next = card.querySelector(EDITOR)
    if (next !== editor) {
      if (editor) resize?.unobserve(editor)
      editor = next
      if (editor) {
        resize?.observe(editor)
        if (editor.matches('textarea[data-bt-home-input]')) {
          homeHeight = editor.style.height
          homeOverflow = editor.style.overflowY
        }
      }
    }
    mark(card, 'data-bt-composer-motion', '')
    mark(card, 'data-bt-composer-focused', card.contains(card.ownerDocument.activeElement) ? 'true' : 'false')
    mark(card, 'data-bt-composer-composing', composing ? 'true' : 'false')
    const text = editor ? ('value' in editor ? editor.value : editor.textContent) : ''
    mark(card, 'data-bt-composer-draft', text?.replace(/\u200b/g, '').trim() ? 'filled' : 'empty')

    // A home draft has no host autosizer. Size its textarea, never the shell's
    // contenteditable, and leave it alone while a composition is in progress.
    if (editor?.matches('textarea[data-bt-home-input]') && !composing) {
      const { minHeight, maxHeight } = view.getComputedStyle(editor)
      const min = parseFloat(minHeight) || 36, max = parseFloat(maxHeight) || 144
      editor.style.height = 'auto'
      const height = Math.max(min, Math.min(max, editor.scrollHeight))
      editor.style.height = `${height}px`
      editor.style.overflowY = editor.scrollHeight > max ? 'auto' : 'hidden'
    }

    let enabled = false, busy = false
    const buttons = [...card.querySelectorAll(PRIMARY)]
    for (const button of buttons) {
      owned.add(button)
      const glyph = button.querySelector('svg')
      const kind = glyph?.querySelector('rect') ? 'stop' : 'send'
      mark(button, 'data-bt-composer-control', kind)
      if (!button.disabled) { if (kind === 'stop') busy = true; else enabled = true }
      const previous = glyphs.get(button)
      if (glyph && previous && (previous.node !== glyph || previous.kind !== kind)) animate(glyph, [{ opacity: 0, scale: '.78' }, { opacity: 1, scale: '1' }], { duration: 150, easing: EASE })
      glyphs.set(button, { node: glyph, kind })
    }
    for (const button of owned) if (!card.contains(button)) { glyphs.delete(button); owned.delete(button); restore(button) }
    mark(card, 'data-bt-composer-send', enabled ? 'ready' : busy ? 'busy' : 'idle')

    const editorHeight = editor?.offsetHeight ?? 0
    const nextGeometry = [card.offsetWidth, editorHeight, ...[...card.children].map(child => child.offsetHeight)].join(':')
    mark(card, 'data-bt-composer-lines', editorHeight > 44 ? 'multiple' : 'single')
    caret.refresh()
    if (shape && geometry === nextGeometry) return
    geometry = nextGeometry
    const before = shape ? card.offsetHeight : targetHeight
    cancelShape()
    const height = card.offsetHeight
    if (height > 0) {
      targetHeight = height
      if (before > 0 && Math.abs(height - before) > .75 && Math.abs(height - before) < 300 && !motion?.matches && !composing && typeof card.animate === 'function') {
        shape = card.animate([{ height: `${before}px` }, { height: `${height}px` }], { duration: SHAPE_DURATION, easing: EASE })
        const current = shape
        current.onfinish = () => { if (shape === current) shape = null }
      }
    }
  }
  const schedule = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(refresh) }
  const focus = () => {
    mark(card, 'data-bt-composer-focused', card.contains(card.ownerDocument.activeElement) ? 'true' : 'false')
    schedule()
  }
  const compose = event => {
    composing = event.type === 'compositionstart'
    if (composing) cancelShape()
    mark(card, 'data-bt-composer-composing', composing ? 'true' : 'false')
    schedule()
  }
  const changeMotion = () => { if (motion?.matches) cancelAnimations(); schedule() }
  const caret = observeComposerCaret(card, { reducedMotion: motion, requestUpdate: schedule })
  resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null
  const mutations = new view.MutationObserver(schedule)
  mutations.observe(card, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-phase', 'aria-busy'] })
  for (const type of ['input', 'change']) card.addEventListener(type, schedule)
  for (const type of ['focusin', 'focusout']) card.addEventListener(type, focus)
  for (const type of ['compositionstart', 'compositionend']) card.addEventListener(type, compose)
  motion?.addEventListener?.('change', changeMotion)
  refresh()

  const stop = () => {
    if (stopped) return
    stopped = true
    view.cancelAnimationFrame(frame)
    mutations.disconnect()
    resize?.disconnect()
    caret()
    cancelAnimations()
    for (const type of ['input', 'change']) card.removeEventListener(type, schedule)
    for (const type of ['focusin', 'focusout']) card.removeEventListener(type, focus)
    for (const type of ['compositionstart', 'compositionend']) card.removeEventListener(type, compose)
    motion?.removeEventListener?.('change', changeMotion)
    if (editor?.matches('textarea[data-bt-home-input]')) { editor.style.height = homeHeight; editor.style.overflowY = homeOverflow }
    for (const node of savedAttributes.keys()) restore(node)
  }
  stop.refresh = schedule
  return stop
}

export function useComposerMotion(anchor, value) {
  const controller = useRef(null)
  useLayoutEffect(() => {
    const node = anchor.current
    const card = node?.closest('[data-composer-card],.bt-qibit-search')
    if (controller.current?.card === card) return
    controller.current?.stop()
    controller.current = card ? { card, stop: observeComposerMotion(card) } : null
  })
  useLayoutEffect(() => () => { controller.current?.stop(); controller.current = null }, [anchor])
  useLayoutEffect(() => { controller.current?.stop.refresh() }, [value])
}

// Both the concrete surface and its installed marker outrank the conversation's
// legacy control rules even when a later slot installs those styles after us.
const SURFACE = ':is([data-composer-card],.bt-qibit-search)[data-bt-composer-motion]'

export const COMPOSER_MOTION_CSS = COMPOSER_CARET_CSS + `
[data-composer-card][data-bt-composer-motion],.bt-qibit-search[data-bt-composer-motion]{
  position:relative;isolation:isolate;outline:none!important;
  transition:border-color 210ms ease,background-color 230ms ease,box-shadow 260ms cubic-bezier(.2,.75,.25,1),border-radius 210ms ease!important;
}
[data-composer-card][data-bt-composer-motion]:hover,.bt-qibit-search[data-bt-composer-motion]:hover{border-color:color-mix(in srgb,var(--bt-ink,#334155) 18%,transparent)!important}
[data-composer-card][data-bt-composer-motion][data-bt-composer-focused=true],.bt-qibit-search[data-bt-composer-motion][data-bt-composer-focused=true]{
  border-color:color-mix(in srgb,var(--bt-accent,#4054f4) 42%,transparent)!important;
  background:color-mix(in srgb,var(--glass-floating,var(--bt-main,rgba(255,255,255,.8))) 96%,var(--bt-accent,#4054f4) 4%)!important;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--bt-accent,#4054f4) 9%,transparent),0 8px 26px rgba(24,39,68,.1),inset 0 1px rgba(255,255,255,.4)!important;
}
[data-composer-card][data-bt-composer-motion][data-bt-composer-lines=multiple]{border-radius:18px!important}
${SURFACE} [data-composer-input]{caret-color:var(--bt-accent,currentColor)}
${SURFACE} [data-composer-placeholder]{animation:bt-composer-hint-in 180ms ease both}
${SURFACE} :is(button[data-bt-composer-control],.bt-voice){
  animation:none!important;
  transition:opacity 150ms ease,scale 210ms cubic-bezier(.2,.75,.25,1),background-color 170ms ease,color 170ms ease,visibility 150ms!important;
}
${SURFACE} button[data-bt-composer-control]{display:inline-grid!important;place-items:center;flex:none;opacity:1;scale:1}
${SURFACE} button[data-bt-composer-control]:disabled{display:inline-grid!important;opacity:.28;scale:.88;pointer-events:none}
${SURFACE} button[data-bt-composer-control]:active:not(:disabled){scale:.9}
${SURFACE} [class*="_trailing"]{position:relative}
${SURFACE} .bt-voice{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-grid!important;opacity:0;scale:.78;visibility:hidden;pointer-events:none}
${SURFACE}[data-bt-composer-send=idle] .bt-voice{opacity:1;scale:1;visibility:visible;pointer-events:auto}
[data-composer-card][data-bt-composer-motion]:has(.bt-voice)[data-bt-composer-send=idle] button[data-bt-composer-control=send]:disabled{opacity:0;visibility:hidden}
[data-bt-room] ${SURFACE} .bt-voice{display:none!important}
[data-bt-room] [data-composer-card][data-bt-composer-motion][data-bt-composer-send=idle] button[data-bt-composer-control=send]:disabled{opacity:.28;visibility:visible}
.bt-qibit-search[data-bt-composer-motion]{height:auto;min-height:60px;box-sizing:border-box;align-items:flex-end}
.bt-qibit-search[data-bt-composer-motion]>:is(.bt-qibit-search-entry,button[type=submit]){align-self:flex-end;margin-bottom:2px}
.bt-qibit-search[data-bt-composer-motion] textarea[data-bt-home-input]{display:block;flex:1;min-width:0;min-height:36px;max-height:144px;resize:none;border:0!important;outline:none!important;box-shadow:none!important;background:transparent;color:var(--text-primary);font:inherit;font-size:13px;line-height:24px;padding:6px 0;margin:0;box-sizing:border-box;caret-color:var(--bt-accent,currentColor);scrollbar-width:thin}
.bt-qibit-search[data-bt-composer-motion] textarea::placeholder{color:var(--text-secondary);transition:color 180ms ease}
.bt-qibit-search[data-bt-composer-motion][data-bt-composer-focused=true] textarea::placeholder{color:color-mix(in srgb,var(--text-secondary) 68%,transparent)}
.bt-qibit-search[data-bt-composer-motion] button[type=submit]:disabled{opacity:.4;visibility:visible;scale:.9}
@keyframes bt-composer-hint-in{from{opacity:0}to{opacity:1}}
@media(max-width:480px){.bt-qibit-search[data-bt-composer-motion] textarea[data-bt-home-input]{font-size:12px}}
@media(prefers-reduced-motion:reduce){
  [data-composer-card][data-bt-composer-motion],.bt-qibit-search[data-bt-composer-motion],${SURFACE} :is(button[data-bt-composer-control],.bt-voice,textarea),${SURFACE} [data-composer-placeholder]{transition:none!important;animation:none!important}
}
@media(forced-colors:active){[data-bt-composer-motion][data-bt-composer-focused=true]{outline:2px solid Highlight!important;outline-offset:2px;box-shadow:none!important}}
`
