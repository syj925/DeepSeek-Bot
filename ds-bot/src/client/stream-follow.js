import { createElement as h, useLayoutEffect, useRef } from 'react'
import { roomContentRoot } from './room-streams.js'

const FOLLOW_DURATION = 170
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

// The host owns scroll position. This layer smooths only the pixels it already
// followed, and yields immediately to a reader touching the transcript.
export function observeStreamFollow(scope, { reducedMotion } = {}) {
  const view = scope.ownerDocument.defaultView
  const motion = reducedMotion ?? view.matchMedia?.('(prefers-reduced-motion: reduce)')
  let flow = null, height = 0, animation = null, lifted = 0, frame = 0
  let blocked = false, sawUnfollowed = false, stopped = false
  const cancel = () => { animation?.cancel(); animation = null; lifted = 0 }
  const intent = event => {
    // Editing a draft and opening its model menu leave the reader at the tail.
    // The host excludes its composer from transcript scroll intent as well.
    if (event.target?.closest?.('[data-composer-seat]')) return
    if (event.type === 'keydown' && (!SCROLL_KEYS.has(event.key) || event.target?.closest?.('input,textarea,[contenteditable="true"]'))) return
    blocked = true
    sawUnfollowed = false
    cancel()
  }
  const measure = () => {
    frame = 0
    if (stopped) return
    const next = [...scope.querySelectorAll('[data-chat-flow]')]
      .find(node => !node.parentElement?.closest('[data-chat-flow]'))
    if (next !== flow) {
      if (flow) resize?.unobserve(flow)
      cancel()
      flow = next ?? null
      height = flow?.offsetHeight ?? 0
      blocked = false
      sawUnfollowed = false
      if (flow) resize?.observe(flow)
      return
    }
    if (!flow) return
    const before = height
    height = flow.offsetHeight
    const following = flow.closest('[data-chat-following-tail]')
    if (!following) { sawUnfollowed = true; cancel(); return }
    if (blocked && sawUnfollowed) { blocked = false; sawUnfollowed = false }
    const growth = height - before
    if (blocked || motion?.matches || !flow.querySelector('[data-bt-streaming]')) { cancel(); return }
    // Layout replacements and history pages belong to the host, not a text
    // animation. A normal line or two is small enough to ease without trailing.
    if (growth <= 0 || growth > 160 || typeof flow.animate !== 'function') return
    const timing = animation?.effect?.getComputedTiming?.()
    const remaining = animation && typeof timing?.progress === 'number' ? lifted * (1 - timing.progress) : 0
    cancel()
    lifted = Math.min(160, remaining + growth)
    const current = flow.animate([{ transform: `translateY(${lifted}px)` }, { transform: 'translateY(0px)' }], {
      duration: FOLLOW_DURATION, easing: 'cubic-bezier(.2,.65,.3,1)',
    })
    animation = current
    current.onfinish = () => { if (animation === current) { animation = null; lifted = 0 } }
  }
  const schedule = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(measure) }
  const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null
  const mutations = new view.MutationObserver(schedule)
  mutations.observe(scope, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-chat-following-tail', 'data-bt-streaming'] })
  const changedMotion = () => { if (motion?.matches) cancel(); schedule() }
  motion?.addEventListener?.('change', changedMotion)
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) scope.addEventListener(type, intent, { capture: true, passive: true })
  measure()
  return () => {
    stopped = true
    view.cancelAnimationFrame(frame)
    mutations.disconnect()
    resize?.disconnect()
    motion?.removeEventListener?.('change', changedMotion)
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) scope.removeEventListener(type, intent, { capture: true })
    cancel()
  }
}

export function StreamFollow({ sessionId, rootRef }) {
  const anchor = useRef(null)
  useLayoutEffect(() => {
    if (!anchor.current) return undefined
    const scope = rootRef?.current ?? anchor.current.closest('header')?.parentElement ?? anchor.current.parentElement
    if (!scope) return undefined
    let release = null, current = null
    const sync = () => {
      const content = roomContentRoot(anchor.current, sessionId, rootRef?.current)
      if (content === current) return
      release?.()
      current = content
      release = current ? observeStreamFollow(current) : null
    }
    const observer = new scope.ownerDocument.defaultView.MutationObserver(sync)
    observer.observe(scope, { childList: true, subtree: true })
    sync()
    return () => { observer.disconnect(); release?.() }
  }, [sessionId, rootRef])
  return h('span', { hidden: true, ref: anchor, 'data-bt-stream-follow': sessionId })
}
