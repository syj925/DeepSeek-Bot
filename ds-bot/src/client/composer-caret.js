const INPUT = '[data-composer-input],textarea[data-bt-home-input],input[data-bt-home-input]'
const ACTIVE = 'data-bt-caret-active'
const FOREIGN = '[data-dsh-claude-caret],[data-dsh-chat-ux-caret]'
const MIRROR_STYLES = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings', 'font-variation-settings', 'font-kerning', 'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-indent', 'text-transform', 'direction', 'tab-size', 'word-break', 'overflow-wrap', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']

const usable = rect => rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.height > 0
const firstRect = range => [...(range.getClientRects?.() ?? [])].find(usable) ?? null

function richCaret(input, view, exact = false) {
  const selection = input.ownerDocument.getSelection()
  if (!selection?.isCollapsed || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!input.contains(range.startContainer)) return null
  const direct = firstRect(range)
  if (direct) return direct
  // A pre-edit selection belongs to the IME. Only its real collapsed Range
  // can position an overlay; neighboring glyphs cannot resolve that position.
  if (exact) return null
  const node = range.startContainer, offset = range.startOffset
  if (node.nodeType === 3 && node.data.length) {
    const probe = range.cloneRange()
    const before = offset > 0
    probe.setStart(node, before ? offset - 1 : 0)
    probe.setEnd(node, before ? offset : 1)
    const rect = firstRect(probe)
    if (rect) {
      const rtl = view.getComputedStyle(node.parentElement).direction === 'rtl'
      return { left: before !== rtl ? rect.right : rect.left, top: rect.top, height: rect.height }
    }
  }
  const element = node.nodeType === 1 ? node : node.parentElement
  if (!element || element.textContent.replace(/\u200b/g, '').length) return null
  const rect = element.getBoundingClientRect(), style = view.getComputedStyle(input)
  if (!usable(rect)) return null
  const size = parseFloat(style.fontSize) || 14, line = parseFloat(style.lineHeight) || size * 1.5
  const top = rect.top + (parseFloat(style.paddingTop) || 0) + Math.max(0, (line - size * 1.2) / 2)
  return { left: style.direction === 'rtl' ? rect.right - (parseFloat(style.paddingRight) || 0) : rect.left + (parseFloat(style.paddingLeft) || 0), top, height: Math.min(rect.height, size * 1.2) }
}

function plainCaret(input, view) {
  if (input.selectionStart === null || input.selectionStart !== input.selectionEnd) return null
  const rect = input.getBoundingClientRect()
  if (!usable(rect)) return null
  const mirror = input.ownerDocument.createElement('div'), marker = input.ownerDocument.createElement('span')
  const style = view.getComputedStyle(input)
  Object.assign(mirror.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: 'auto', visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box', margin: '0', borderStyle: 'solid', borderColor: 'transparent', whiteSpace: input.tagName === 'INPUT' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word' })
  for (const name of MIRROR_STYLES) mirror.style.setProperty(name, style.getPropertyValue(name))
  const offset = input.selectionStart
  mirror.appendChild(input.ownerDocument.createTextNode(input.value.slice(0, offset)))
  marker.textContent = input.value.slice(offset) || '\u200b'
  mirror.appendChild(marker)
  mirror.setAttribute('aria-hidden', 'true')
  input.ownerDocument.body.appendChild(mirror)
  try {
    const mark = [...marker.getClientRects()].find(usable)
    return mark ? { left: mark.left - input.scrollLeft, top: mark.top - input.scrollTop, height: mark.height } : null
  } finally { mirror.remove() }
}

export function observeComposerCaret(card, { reducedMotion, requestUpdate } = {}) {
  const document = card.ownerDocument, view = document.defaultView
  const motion = reducedMotion ?? view.matchMedia?.('(prefers-reduced-motion: reduce)')
  let stopped = false, frame = 0, composing = false, windowFocused = true, typed = false
  let editor = null, layer = null, last = null, blink = null, savedMark = null
  const hide = () => {
    if (editor) {
      if (savedMark === null) editor.removeAttribute(ACTIVE)
      else editor.setAttribute(ACTIVE, savedMark)
    }
    layer?.remove()
    blink?.cancel()
    blink = null; layer = null; editor = null; last = null; savedMark = null
  }
  const refresh = () => {
    frame = 0
    if (stopped) return
    const input = document.activeElement
    if (!windowFocused || document.hidden || motion?.matches || !card.isConnected || !input?.matches?.(INPUT) || !card.contains(input) || input.matches(FOREIGN)
      || input.disabled || input.readOnly || (input.hasAttribute('data-composer-input') && input.getAttribute('contenteditable') !== 'true')) { hide(); typed = false; return }
    const box = input.hasAttribute('data-composer-input') ? richCaret(input, view, composing) : composing ? null : plainCaret(input, view)
    const field = input.getBoundingClientRect()
    if (!usable(box) || !usable(field) || box.top >= field.bottom || box.top + box.height <= field.top || box.left < field.left - 1 || box.left > field.right + 1) { hide(); typed = false; return }
    const clipTop = Math.max(box.top, field.top), clipBottom = Math.min(box.top + box.height, field.bottom)
    if (editor !== input) { hide(); editor = input; savedMark = input.getAttribute(ACTIVE) }
    if (!layer) {
      layer = document.createElement('div')
      layer.setAttribute('data-bt-composer-caret', '')
      layer.setAttribute('aria-hidden', 'true')
      // Viewport coordinates keep the caret aligned inside transformed canvas
      // windows without changing the editor's content or containing blocks.
      document.body.appendChild(layer)
    }
    const color = view.getComputedStyle(input)
    if (!input.hasAttribute(ACTIVE)) layer.style.backgroundColor = color.caretColor && color.caretColor !== 'auto' && color.caretColor !== 'transparent' && color.caretColor !== 'rgba(0, 0, 0, 0)' ? color.caretColor : color.color
    const left = Math.round(box.left), top = Math.round(clipTop)
    const glide = typed && last && Math.abs(top - last.top) < 3 && Math.abs(left - last.left) < 140
    layer.style.transition = glide ? 'transform 80ms cubic-bezier(.2,.7,.3,1)' : 'none'
    layer.style.transform = `translate(${left}px,${top}px)`
    layer.style.height = `${Math.max(1, clipBottom - clipTop)}px`
    if (!last || last.left !== left || last.top !== top) {
      blink?.cancel()
      blink = layer.animate?.([{ opacity: 1, offset: 0 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: .5 }, { opacity: 0, offset: 1 }], { duration: 1000, iterations: Infinity }) ?? null
    }
    input.setAttribute(ACTIVE, '')
    last = { left, top }; typed = false
  }
  const queue = () => {
    if (stopped) return
    if (requestUpdate) { requestUpdate(); return }
    if (!frame) frame = view.requestAnimationFrame(refresh)
  }
  const input = event => { if (card.contains(event.target)) { typed = true; queue() } }
  const focus = () => { typed = false; queue() }
  const leave = () => { hide(); typed = false; queue() }
  const compose = event => { composing = event.type === 'compositionstart'; typed = false; if (composing) hide(); queue() }
  const blurWindow = () => { windowFocused = false; hide() }
  const focusWindow = () => { windowFocused = true; queue() }
  const visibility = () => { if (document.hidden || motion?.matches) hide(); queue() }
  const selection = () => { if (editor || card.contains(document.activeElement)) queue() }
  const pointer = () => { typed = false; queue() }
  const observer = new view.MutationObserver(queue)
  observer.observe(card, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['contenteditable', 'disabled', 'readonly'] })
  card.addEventListener('input', input)
  card.addEventListener('focusin', focus)
  card.addEventListener('focusout', leave)
  card.addEventListener('pointerdown', pointer)
  card.addEventListener('keydown', pointer)
  card.addEventListener('compositionstart', compose)
  card.addEventListener('compositionend', compose)
  document.addEventListener('selectionchange', selection)
  document.addEventListener('scroll', selection, true)
  document.addEventListener('visibilitychange', visibility)
  view.addEventListener('blur', blurWindow)
  view.addEventListener('focus', focusWindow)
  view.addEventListener('resize', queue)
  motion?.addEventListener?.('change', visibility)
  refresh()
  const stop = () => {
    if (stopped) return
    stopped = true
    view.cancelAnimationFrame(frame)
    observer.disconnect()
    hide()
    card.removeEventListener('input', input)
    card.removeEventListener('focusin', focus)
    card.removeEventListener('focusout', leave)
    card.removeEventListener('pointerdown', pointer)
    card.removeEventListener('keydown', pointer)
    card.removeEventListener('compositionstart', compose)
    card.removeEventListener('compositionend', compose)
    document.removeEventListener('selectionchange', selection)
    document.removeEventListener('scroll', selection, true)
    document.removeEventListener('visibilitychange', visibility)
    view.removeEventListener('blur', blurWindow)
    view.removeEventListener('focus', focusWindow)
    view.removeEventListener('resize', queue)
    motion?.removeEventListener?.('change', visibility)
  }
  stop.refresh = refresh
  return stop
}

export const COMPOSER_CARET_CSS = `
:is([data-composer-input],textarea[data-bt-home-input],input[data-bt-home-input])[data-bt-caret-active]{caret-color:transparent!important}
[data-bt-composer-caret]{position:fixed!important;left:0!important;top:0!important;width:2px!important;min-width:0!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:1px;pointer-events:none!important;z-index:2147483001;will-change:transform}
@media(prefers-reduced-motion:reduce){[data-bt-composer-caret]{display:none!important}}
`
