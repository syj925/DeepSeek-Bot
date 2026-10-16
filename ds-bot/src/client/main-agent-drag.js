import { useEffect, useRef } from 'react'

export const MAIN_AGENT_POINTER = 'ds-bot:main-agent-pointer'

// Use a pointer-following avatar instead of the browser's screenshot of the row.
export function beginMainAgentDrag(event, id, dragged) {
  const row = event.currentTarget, doc = row.ownerDocument, view = doc.defaultView
  const start = { x: event.clientX, y: event.clientY }, pointerId = event.pointerId
  let ghost, frame, point = start, moving = false, ended = false
  const send = phase => view.dispatchEvent(new view.CustomEvent(MAIN_AGENT_POINTER, { detail: { id, phase, x: point.x, y: point.y } }))
  const paint = () => {
    frame = null
    ghost.style.transform = `translate3d(${point.x - 60}px,${point.y - 40}px,0)`
    send('move')
  }
  const move = event => {
    if (event.pointerId !== pointerId) return
    point = { x: event.clientX, y: event.clientY }
    if (!moving && Math.hypot(point.x - start.x, point.y - start.y) < 6) return
    event.preventDefault()
    if (!moving) {
      moving = true
      ghost = doc.createElement('div')
      ghost.className = 'bt-canvas-contact-ghost'
      ghost.setAttribute('aria-hidden', 'true')
      const avatar = row.querySelector('.bt-mark')?.cloneNode(true)
      if (avatar) {
        for (const mark of [avatar, ...avatar.querySelectorAll('.bt-mark')]) {
          mark.style.width = '56px'; mark.style.height = '56px'; mark.style.setProperty('--bt-size', '56px')
        }
        ghost.append(avatar)
      }
      const name = doc.createElement('strong')
      name.textContent = row.querySelector('.bt-row-title')?.textContent ?? row.title
      ghost.append(name)
      doc.body.append(ghost)
      row.dataset.contactDragging = 'true'
      paint()
    }
    if (!frame) frame = view.requestAnimationFrame(paint)
  }
  const clean = () => {
    ended = true
    if (frame) view.cancelAnimationFrame(frame)
    ghost?.remove()
    delete row.dataset.contactDragging
    for (const [name, handler] of listeners) view.removeEventListener(name, handler, true)
  }
  const cancel = () => { if (ended) return; if (moving) { dragged(); send('cancel') } clean() }
  const end = event => {
    if (event.pointerId !== pointerId) return
    point = { x: event.clientX, y: event.clientY }
    if (moving) { dragged(); send('end') }
    clean()
  }
  const key = event => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
  const listeners = [['pointermove', move], ['pointerup', end], ['pointercancel', cancel], ['blur', cancel], ['keydown', key]]
  for (const [name, handler] of listeners) view.addEventListener(name, handler, { capture: true, passive: false })
  return cancel
}

export function useMainAgentDrag(enabled, id) {
  const cleanup = useRef(null), suppress = useRef(0)
  useEffect(() => () => cleanup.current?.(), [enabled, id])
  return {
    onDragStart: event => event.preventDefault(),
    onPointerDown: event => {
      if (!enabled || event.button !== 0) return
      cleanup.current?.()
      suppress.current = 0
      cleanup.current = beginMainAgentDrag(event, id, () => { suppress.current = Date.now() + 500 })
    },
    onClickCapture: event => {
      if (event.detail !== 0 && Date.now() < suppress.current) { event.preventDefault(); event.stopPropagation(); suppress.current = 0 }
    },
  }
}
