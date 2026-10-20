import { createElement as h, useLayoutEffect, useRef, useState } from 'react'
import { t } from './i18n.js'

const TAIL_GAP = 18
const SCROLL_KEYS = new Set(['ArrowUp', 'PageUp', 'Home'])

export const REASONING_STREAM_CSS = `
.bt-think[data-bt-reasoning]{max-width:min(560px,90%)}
.bt-think[data-bt-reasoning] summary{min-height:24px;user-select:none}
.bt-think[data-bt-reasoning] summary::before{content:'›';display:inline-block;font-size:18px;line-height:16px;transition:transform .12s ease}
.bt-think[data-bt-reasoning][open] summary::before{transform:rotate(90deg)}
.bt-think[data-bt-reasoning][data-bt-streaming] summary::after{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;animation:bt-reason-pulse 1.2s ease-in-out infinite}
.bt-think [data-bt-reason-viewport]{box-sizing:border-box;position:relative;max-height:min(220px,32vh);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;margin-top:4px;padding:0 10px;border-left:2px solid var(--bt-line-2);outline-offset:3px;overflow-anchor:none}
.bt-think [data-bt-reason-viewport]>.bt-think-text{margin:0;padding:8px 0 18px;border:0;white-space:pre-wrap;overflow-wrap:anywhere}
.bt-think [data-bt-reason-capped]{-webkit-mask-image:linear-gradient(transparent,#000 14px,#000 calc(100% - 14px),transparent);mask-image:linear-gradient(transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.bt-think .bt-reason-follow{display:none;align-items:center;gap:4px;border:0;border-radius:9px;background:var(--bt-hover);color:var(--bt-ink-2);font:inherit;font-size:11px;line-height:18px;padding:2px 7px;margin:4px 0 0 10px;cursor:pointer}
.bt-think[data-bt-reason-following=false][data-bt-streaming] .bt-reason-follow{display:inline-flex}
@keyframes bt-reason-pulse{50%{opacity:.35}}
@media(prefers-reduced-motion:reduce){.bt-think[data-bt-reasoning] summary::before{transition:none}.bt-think[data-bt-reasoning][data-bt-streaming] summary::after{animation:none}.bt-think [data-bt-reason-capped]{-webkit-mask-image:none;mask-image:none}}
`

// The actual scroll position stays at the newest public text. A short paint-only
// compensation eases a new line into the capped window without delaying tokens.
export function observeReasoningStream(row, viewport, text, { reducedMotion } = {}) {
  const view = row.ownerDocument.defaultView
  const motion = reducedMotion ?? view.matchMedia?.('(prefers-reduced-motion: reduce)')
  let following = true, frame = 0, animation = null, lifted = 0, automaticTop = null, stopped = false, readAway = false
  const cancel = () => { animation?.cancel(); animation = null; lifted = 0 }
  const setFollowing = value => {
    following = value
    row.setAttribute('data-bt-reason-following', String(value))
    if (!value) { automaticTop = null; cancel(); viewport.removeAttribute('data-bt-reason-capped') }
  }
  const selected = () => {
    const selection = row.ownerDocument.getSelection()
    return selection && !selection.isCollapsed && (text.contains(selection.anchorNode) || text.contains(selection.focusNode))
  }
  const measure = () => {
    frame = 0
    if (stopped) return
    const live = row.hasAttribute('data-bt-streaming')
    if (!row.open || !live) { cancel(); viewport.removeAttribute('data-bt-reason-capped') }
    if (!row.open || !live) return
    if (selected()) setFollowing(false)
    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const capped = live && following && !motion?.matches && target > 2
    viewport.toggleAttribute('data-bt-reason-capped', capped)
    if (!following) return
    const before = viewport.scrollTop
    if (Math.abs(target - before) < 1) return
    const timing = animation?.effect?.getComputedTiming?.()
    const remaining = animation && typeof timing?.progress === 'number' ? lifted * (1 - timing.progress) : 0
    cancel()
    viewport.scrollTop = target
    automaticTop = viewport.scrollTop
    const line = Number.parseFloat(view.getComputedStyle(text).lineHeight) || 18
    const distance = Math.min(line * 1.5, Math.max(0, target - before + remaining))
    if (!live || motion?.matches || distance < 1 || typeof text.animate !== 'function') return
    const current = text.animate([{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0px)' }], { duration: 150, easing: 'cubic-bezier(.2,.65,.3,1)' })
    lifted = distance
    animation = current
    current.onfinish = () => { if (animation === current) { animation = null; lifted = 0 } }
  }
  const sync = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(measure) }
  const pause = () => {
    readAway = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > TAIL_GAP
    setFollowing(false)
  }
  const wheel = event => { if (event.deltaY < 0) pause() }
  const key = event => { if (SCROLL_KEYS.has(event.key)) pause() }
  const scroll = () => {
    if (automaticTop !== null && Math.abs(viewport.scrollTop - automaticTop) < 1) { automaticTop = null; return }
    automaticTop = null
    const atTail = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= TAIL_GAP
    if (!atTail) { readAway = true; setFollowing(false) }
    else if (following || readAway) { readAway = false; setFollowing(true) }
    sync()
  }
  const changedMotion = () => { cancel(); sync() }
  const observer = new view.MutationObserver(sync)
  observer.observe(text, { childList: true, characterData: true, subtree: true })
  const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(sync) : null
  resize?.observe(viewport); resize?.observe(text)
  viewport.addEventListener('scroll', scroll, { passive: true })
  viewport.addEventListener('wheel', wheel, { passive: true })
  viewport.addEventListener('pointerdown', pause)
  viewport.addEventListener('touchstart', pause, { passive: true })
  viewport.addEventListener('keydown', key)
  motion?.addEventListener?.('change', changedMotion)
  setFollowing(true)
  sync()
  return {
    sync,
    follow() { readAway = false; setFollowing(true); sync() },
    stop() {
      stopped = true
      view.cancelAnimationFrame(frame)
      observer.disconnect(); resize?.disconnect(); cancel()
      viewport.removeEventListener('scroll', scroll)
      viewport.removeEventListener('wheel', wheel)
      viewport.removeEventListener('pointerdown', pause)
      viewport.removeEventListener('touchstart', pause)
      viewport.removeEventListener('keydown', key)
      motion?.removeEventListener?.('change', changedMotion)
      viewport.removeAttribute('data-bt-reason-capped')
      row.removeAttribute('data-bt-reason-following')
    },
  }
}

export function ThinkingRow({ text, streaming, streamId }) {
  const row = useRef(null), viewport = useRef(null), content = useRef(null), follow = useRef(null)
  const [choice, setChoice] = useState(null)
  const open = choice ?? streaming
  const expected = useRef(open)
  expected.current = open
  useLayoutEffect(() => {
    if (!row.current || !viewport.current || !content.current) return undefined
    const controller = observeReasoningStream(row.current, viewport.current, content.current)
    follow.current = controller
    return () => { follow.current = null; controller.stop() }
  }, [])
  useLayoutEffect(() => { follow.current?.sync() }, [text, streaming, open])
  const toggled = event => {
    const value = event.currentTarget.open
    // Programmatic defaults must not turn into a permanent reader preference.
    if (value !== expected.current) setChoice(value)
  }
  return h('details', { ref: row, className: 'bt-think', open, onToggle: toggled, 'data-bt-reasoning': '', 'data-bt-streaming': streaming ? '' : undefined, 'data-bt-stream-key': streamId },
    h('summary', null, t(streaming ? 'Thinking…' : 'Thought it through')),
    h('div', { ref: viewport, 'data-bt-reason-viewport': '', tabIndex: 0, role: 'region', 'aria-label': t('Model reasoning') },
      h('div', { ref: content, className: 'bt-think-text', 'data-bt-reveal-text': '' }, text)),
    h('button', { type: 'button', className: 'bt-reason-follow', onClick: () => follow.current?.follow() }, '↓ ', t('Follow latest')))
}
