import { normalizeCanvas, windowWidth, windowHeight, moveWindow, moveDraftGroup } from './canvas-state.js'

const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value))
const dimensions = window => ({ width: windowWidth({ ...window, compact: true }), height: windowHeight({ ...window, compact: true }) })

export function desktopBounds(size = {}) {
  const width = Math.max(1, size.width || 1000), height = Math.max(1, size.height || 700)
  const insets = size.insets ?? {}
  const left = clamp(insets.left ?? 16, 0, Math.max(0, width - 352))
  const top = clamp(insets.top ?? 70, 0, Math.max(0, height - 232))
  return { left, top, right: Math.max(left + 1, width - Math.min(insets.right ?? 16, Math.max(0, width - left - 320))), bottom: Math.max(top + 1, height - Math.min(insets.bottom ?? 96, Math.max(0, height - top - 200))) }
}

const intersects = (a, b) => a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x && a.y < b.y + b.height + 12 && a.y + a.height + 12 > b.y

// Recover off-screen layouts without moving healthy cards or changing sessions.
export function fixedDesktop(state, size) {
  const next = normalizeCanvas(state)
  next.viewport = { x: 0, y: 0, zoom: 1 }
  if (!size?.width || !size?.height) return next
  const bounds = desktopBounds(size)
  const items = [
    ...next.windows.filter(window => window.open).map(window => ({ node: window, ...dimensions(window) })),
    ...next.groups.filter(group => group.draft).map(group => ({ node: group, width: 280, height: 180 })),
  ]
  const valid = item => item.node.x >= bounds.left && item.node.y >= bounds.top && item.node.x + item.width <= bounds.right && item.node.y + item.height <= bounds.bottom
  const occupied = items.filter(valid).map(item => ({ ...item, x: item.node.x, y: item.node.y }))
  for (const item of items.filter(item => !valid(item))) {
    let point = { x: clamp(item.node.x, bounds.left, bounds.right - item.width), y: clamp(item.node.y, bounds.top, bounds.bottom - item.height), width: item.width, height: item.height }
    if (occupied.some(other => intersects(point, other))) {
      const slots = []
      for (let y = bounds.top; y <= bounds.bottom - item.height; y += 24) {
        for (let x = bounds.left; x <= bounds.right - item.width; x += 24) {
          const candidate = { ...point, x, y }
          slots.push({ ...candidate, collisions: occupied.filter(other => intersects(candidate, other)).length })
        }
      }
      // Crowded desktops keep every employee accessible through the directory/dock.
      slots.sort((a, b) => a.collisions - b.collisions || Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))
      point = slots[0] ?? point
    }
    item.node.x = point.x
    item.node.y = point.y
    occupied.push(point)
  }
  return next
}

export function moveDesktop(state, ids, dx, dy, size, draftId) {
  const bounds = desktopBounds(size)
  const draft = draftId && state.groups.find(group => group.id === draftId && group.draft)
  const windows = state.windows.filter(window => window.open && ids.includes(window.id))
  const items = draft ? [{ ...draft, width: 280, height: 180 }] : windows.map(window => ({ ...window, ...dimensions(window) }))
  if (!items.length) return state
  const left = Math.min(...items.map(item => item.x)), top = Math.min(...items.map(item => item.y))
  const right = Math.max(...items.map(item => item.x + item.width)), bottom = Math.max(...items.map(item => item.y + item.height))
  // Clamp the selection as a unit, preserving relative positions at the edge.
  dx = clamp(dx, bounds.left - left, bounds.right - right)
  dy = clamp(dy, bounds.top - top, bounds.bottom - bottom)
  return draft ? moveDraftGroup(state, draft.id, dx, dy) : moveWindow(state, ids, dx, dy)
}
