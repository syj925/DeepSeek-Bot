import { CANVAS_LIMITS, openWindow, windowHeight, windowWidth } from './canvas-state.js'
import { desktopBounds } from './canvas-desktop.js'

const GAP = 24
const overlaps = (a, b) => a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x && a.y < b.y + b.height + 12 && a.y + a.height + 12 > b.y

export function roomPlacementLayout(doc, size) {
  const canvas = [...(doc?.querySelectorAll?.('.bt-canvas') ?? [])].find(node => node.getClientRects().length)
  const team = canvas?.closest('.bt-canvas-frame')?.querySelector('.bt-floating-team')
  if (!canvas || !team?.getClientRects().length) return null
  const box = canvas.getBoundingClientRect(), panel = team.getBoundingClientRect()
  if (!box.width || !box.height) return null
  const bounds = desktopBounds({ ...size, width: box.width, height: box.height })
  return {
    left: Math.max(bounds.left, panel.right - box.left + GAP),
    top: Math.max(bounds.top, panel.top - box.top + 16),
    right: bounds.right,
    bottom: bounds.bottom,
  }
}

export function placeNewRoom(state, roomId, layout) {
  if (!roomId || !layout || state.windows.some(window => window.kind === 'room' && window.entityId === roomId)) return state
  const { x: panX, y: panY, zoom } = state.viewport
  if (![panX, panY, zoom, layout.left, layout.top, layout.right, layout.bottom].every(Number.isFinite) || zoom <= 0) return state
  const width = CANVAS_LIMITS.avatarWidth * zoom, height = CANVAS_LIMITS.roomAvatarHeight * zoom
  const occupied = state.windows.filter(window => window.open).map(window => ({
    x: panX + window.x * zoom, y: panY + window.y * zoom,
    width: windowWidth({ ...window, compact: true }) * zoom, height: windowHeight({ ...window, compact: true }) * zoom,
  }))
  occupied.push(...state.groups.filter(group => group.draft).map(group => ({ x: panX + group.x * zoom, y: panY + group.y * zoom, width: 280 * zoom, height: 180 * zoom })))
  for (let x = layout.left; x + width <= layout.right; x += width + GAP) {
    for (let y = layout.top; y + height <= layout.bottom; y += height + GAP) {
      if (occupied.some(box => overlaps({ x, y, width, height }, box))) continue
      const next = openWindow(state, { kind: 'room', id: roomId }, { x: (x - panX) / zoom, y: (y - panY) / zoom, compact: true })
      // Only seed the avatar; the caller still owns opening its conversation.
      return { ...next, active: state.active, selected: state.selected }
    }
  }
  return state
}
