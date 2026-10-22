import { normalizeCanvas } from './canvas-state.js'
import { desktopBounds } from './canvas-desktop.js'

export const DESKTOP_GRID = Object.freeze({ width: 160, height: 176, unitWidth: 120, unitHeight: 132 })

export function desktopGrid(size) {
  const bounds = desktopBounds(size)
  return { ...bounds, ...DESKTOP_GRID }
}

const overlaps = (a, b) => a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y

export function snapDesktopWindows(state, ids, size, obstacles = []) {
  const grid = desktopGrid(size), v = state.viewport
  const wanted = new Set(ids)
  const moving = state.windows.filter(window => window.open && wanted.has(window.id))
  const result = { state, grid, placements: [], fits: false }
  if (!moving.length || !Number.isFinite(v.zoom) || v.zoom <= 0) return result
  const box = window => ({ x: v.x + window.x * v.zoom, y: v.y + window.y * v.zoom, width: grid.unitWidth, height: grid.unitHeight })
  const occupied = [
    ...obstacles.filter(rect => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0),
    ...state.windows.filter(window => window.open && !wanted.has(window.id)).map(box),
    ...state.groups.filter(group => group.draft).map(group => ({ x: v.x + group.x * v.zoom, y: v.y + group.y * v.zoom, width: 280 * v.zoom, height: 180 * v.zoom })),
  ]
  const slots = []
  for (let y = grid.top; y + grid.unitHeight <= grid.bottom; y += grid.height) {
    for (let x = grid.left; x + grid.unitWidth <= grid.right; x += grid.width) {
      const slot = { x, y, width: grid.unitWidth, height: grid.unitHeight }
      if (!occupied.some(other => overlaps(slot, other))) slots.push(slot)
    }
  }
  const placements = []
  for (const window of moving) {
    const at = box(window)
    slots.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y) || a.y - b.y || a.x - b.x)
    const slot = slots.shift()
    if (!slot) return result
    placements.push({ id: window.id, x: (slot.x - v.x) / v.zoom, y: (slot.y - v.y) / v.zoom, left: slot.x, top: slot.y, width: slot.width, height: slot.height })
  }
  const next = normalizeCanvas(state)
  for (const place of placements) Object.assign(next.windows.find(window => window.id === place.id), { x: place.x, y: place.y })
  return { state: next, grid, placements, fits: true }
}
