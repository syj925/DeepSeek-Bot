const finite = (value, fallback) => Number.isFinite(value) ? value : fallback

export function fitBrowserWindow(value = {}, viewport = {}) {
  const width = Math.max(240, finite(viewport.width, 1280))
  const height = Math.max(180, finite(viewport.height, 800))
  const top = Math.max(0, finite(viewport.top, 0))
  const gap = width < 480 ? 6 : 16
  const maxWidth = width - gap * 2
  const maxHeight = Math.max(120, height - top - gap * 2)
  const next = {
    width: Math.round(Math.max(Math.min(380, maxWidth), Math.min(finite(value.width, 760), maxWidth))),
    height: Math.round(Math.max(Math.min(320, maxHeight), Math.min(finite(value.height, 560), maxHeight))),
  }
  next.left = Math.round(Math.max(gap, Math.min(finite(value.left, width - next.width - 28), width - next.width - gap)))
  next.top = Math.round(Math.max(top + gap, Math.min(finite(value.top, top + 84), height - next.height - gap)))
  return next
}
