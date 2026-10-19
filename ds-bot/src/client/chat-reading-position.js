// Preserve the visible message while the dock changes width, including text reflow.
export function preserveReadingPosition(root) {
  let scroll, observer, snapshot, frame, restoring = false
  const capture = () => {
    if (!scroll || restoring) return
    const top = scroll.getBoundingClientRect().top
    const anchor = [...scroll.querySelectorAll('[data-chat-flow-key]')]
      .find(item => item.getBoundingClientRect().bottom > top)
    snapshot = { bottom: scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 24,
      top: scroll.scrollTop, anchor, offset: anchor ? anchor.getBoundingClientRect().top - top : 0 }
  }
  const attach = () => {
    const next = root.querySelector('[data-conversation-scroll]')
    if (!next || next === scroll) return
    observer?.disconnect()
    scroll?.removeEventListener('scroll', capture)
    scroll = next
    capture()
    scroll.addEventListener('scroll', capture, { passive: true })
    observer = new ResizeObserver(() => {
      if (!snapshot) return
      restoring = true
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (snapshot.bottom) scroll.scrollTop = scroll.scrollHeight
        else if (snapshot.anchor?.isConnected) scroll.scrollTop += snapshot.anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top - snapshot.offset
        else scroll.scrollTop = snapshot.top
        restoring = false
        capture()
      })
    })
    observer.observe(scroll)
  }
  const mount = new MutationObserver(attach)
  mount.observe(root, { childList: true, subtree: true })
  attach()
  return () => {
    mount.disconnect(); observer?.disconnect(); cancelAnimationFrame(frame)
    scroll?.removeEventListener('scroll', capture)
  }
}
