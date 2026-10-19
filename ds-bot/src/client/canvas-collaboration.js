import { windowWidth, windowHeight } from './canvas-state.js'

export const MAIN_AGENT_DRAG = 'application/x-qibitai-main-agent'

export function mergeHintPosition(source, target, viewport, bounds, badge) {
  const centerX = (source.x + target.x) / 2 * viewport.zoom + viewport.x
  const above = Math.min(source.y, target.y) * viewport.zoom + viewport.y - 44 - badge.height
  const below = Math.max(source.y, target.y) * viewport.zoom + viewport.y + 48
  const clamp = (value, limit, extent) => Math.max(8, Math.min(value, limit - extent - 8))
  return { left: clamp(centerX - badge.width / 2, bounds.width, badge.width), top: clamp(above >= 8 ? above : below, bounds.height, badge.height) }
}

export const MERGE_PREVIEW_DISTANCE = 120
export const MERGE_COMMIT_DISTANCE = 58

export function overlapMain(state, roster, sourceId, excluded = [], distance = MERGE_COMMIT_DISTANCE) {
  const source = state.windows.find(window => window.id === sourceId)
  const eligible = window => window?.open && window.compact && window.kind === 'bot' && roster.byId[window.entityId]
  if (!eligible(source)) return undefined
  // Match avatar centers, not labels or the larger conversation windows.
  return state.windows.filter(window => window.id !== sourceId && !excluded.includes(window.id) && eligible(window))
    .map(window => ({ window, distance: Math.hypot(window.x - source.x, window.y - source.y) }))
    .filter(entry => distance === MERGE_COMMIT_DISTANCE ? entry.distance < distance : entry.distance <= distance)
    .sort((a, b) => a.distance - b.distance || b.window.z - a.window.z)[0]?.window
}

export function canvasPoint(state, box, clientX, clientY) {
  return { x: (clientX - box.left - state.viewport.x) / state.viewport.zoom, y: (clientY - box.top - state.viewport.y) / state.viewport.zoom }
}

export function canvasDropPoint(state, box, clientX, clientY) {
  const point = canvasPoint(state, box, clientX, clientY)
  return { x: point.x - 60, y: point.y - 34 }
}

export function selectedMains(state, roster, ids, includeClosed = false) {
  return [...new Set(state.windows.filter(window => (window.open || includeClosed) && window.kind === 'bot' && ids.includes(window.id) && roster.byId[window.entityId]).map(window => window.entityId))]
}

export function groupDropTarget(state, roster, ids, point, boundsOf) {
  if (!ids.length || selectedMains(state, roster, ids).length !== ids.length) return null
  const inside = box => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
  const room = state.windows.filter(window => window.open && window.kind === 'room' && !ids.includes(window.id))
    .sort((a, b) => b.z - a.z).find(window => roster.roomsById[window.entityId] && inside(boundsOf?.(window) ?? { ...window, width: windowWidth(window), height: windowHeight(window) }))
  if (room) return { kind: 'room', id: room.entityId, windowId: room.id }
  const draft = [...state.groups].reverse().find(group => group.draft && inside({ ...group, width: 280, height: 180 }))
  return draft ? { kind: 'draft', id: draft.id } : null
}

export function marqueeWindows(state, roster, rect, mainOnly = false) {
  return state.windows.filter(window => window.open && (!mainOnly || window.kind === 'bot' && roster.byId[window.entityId]) &&
    window.x < rect.x + rect.width && window.x + windowWidth(window) > rect.x && window.y < rect.y + rect.height && window.y + windowHeight(window) > rect.y).map(window => window.id)
}
