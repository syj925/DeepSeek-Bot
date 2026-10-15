import { isMainOf } from './sources.js'
import { windowWidth, windowHeight } from './canvas-state.js'

export const MAIN_AGENT_DRAG = 'application/x-qibitai-main-agent'

export function overlapMain(state, roster, sourceId, excluded = []) {
  const source = state.windows.find(window => window.id === sourceId)
  const eligible = window => window?.open && window.compact && window.kind === 'bot' && isMainOf(roster, window.entityId) && roster.byId[window.entityId]
  if (!eligible(source)) return undefined
  // Match avatar centers, not labels or the larger conversation windows.
  return state.windows.filter(window => window.id !== sourceId && !excluded.includes(window.id) && eligible(window))
    .map(window => ({ window, distance: Math.hypot(window.x - source.x, window.y - source.y) }))
    .filter(entry => entry.distance < 58).sort((a, b) => a.distance - b.distance || b.window.z - a.window.z)[0]?.window
}

export function canvasDropPoint(state, box, clientX, clientY) {
  return { x: (clientX - box.left - state.viewport.x) / state.viewport.zoom - 60, y: (clientY - box.top - state.viewport.y) / state.viewport.zoom - 40 }
}

export function selectedMains(state, roster, ids, includeClosed = false) {
  return [...new Set(state.windows.filter(window => (window.open || includeClosed) && window.kind === 'bot' && ids.includes(window.id) && roster.byId[window.entityId] && isMainOf(roster, window.entityId)).map(window => window.entityId))]
}

export function groupDropTarget(state, roster, ids, point) {
  if (!ids.length || selectedMains(state, roster, ids).length !== ids.length) return null
  const inside = box => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
  const room = state.windows.filter(window => window.open && window.kind === 'room' && !ids.includes(window.id))
    .sort((a, b) => b.z - a.z).find(window => roster.roomsById[window.entityId]?.mainOnly === true && inside({ ...window, width: windowWidth(window), height: windowHeight(window) }))
  if (room) return { kind: 'room', id: room.entityId, windowId: room.id }
  const draft = [...state.groups].reverse().find(group => group.draft && inside({ ...group, width: 280, height: 180 }))
  return draft ? { kind: 'draft', id: draft.id } : null
}

export function marqueeWindows(state, roster, rect, mainOnly = false) {
  return state.windows.filter(window => window.open && (!mainOnly || window.kind === 'bot' && roster.byId[window.entityId] && isMainOf(roster, window.entityId)) &&
    window.x < rect.x + rect.width && window.x + windowWidth(window) > rect.x && window.y < rect.y + rect.height && window.y + windowHeight(window) > rect.y).map(window => window.id)
}
