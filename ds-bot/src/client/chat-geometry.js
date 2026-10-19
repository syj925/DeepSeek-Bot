const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function resizeChat(box, bounds, edge, dx, dy) {
  const minWidth = Math.min(560, bounds.right - bounds.left - 24)
  const minHeight = Math.min(360, bounds.bottom - bounds.top - 24)
  let { left, right, top, bottom } = box
  if (edge.includes('w')) left = clamp(left + dx, bounds.left + 12, right - minWidth)
  if (edge.includes('e')) right = clamp(right + dx, left + minWidth, bounds.right - 12)
  if (edge.includes('n')) top = clamp(top + dy, bounds.top + 12, bottom - minHeight)
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minHeight, bounds.bottom - 12)
  return { width: right - left, height: bottom - top, x: (left + right - box.left - box.right) / 2, y: (top + bottom - box.top - box.bottom) / 2 }
}

export function fitChat(size, offset, width, height) {
  const next = { width: Math.min(size.width, Math.max(1, width - 24)), height: Math.min(size.height, Math.max(1, height - 24)) }
  const x = Math.max(0, (width - next.width) / 2 - 12), y = Math.max(0, (height - next.height) / 2 - 12)
  return { size: next, offset: { x: clamp(offset.x, -x, x) || 0, y: clamp(offset.y, -y, y) || 0 } }
}
