import { isMainOf } from './sources.js'

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
