import { currentPart } from './text.js'

export function canvasReading(state, size) {
  const window = state.windows.find(value => value.id === state.active && value.open && !value.compact)
  if (!window) return undefined
  if (size && size.width > 0 && size.height > 0) {
    const { x, y, zoom } = state.viewport
    const left = x + window.x * zoom, top = y + window.y * zoom
    const insets = size.insets ?? {}
    if (left + window.width * zoom <= (insets.left ?? 0) || left >= size.width - (insets.right ?? 0)
      || top + window.height * zoom <= (insets.top ?? 0) || top >= size.height - (insets.bottom ?? 0)) return undefined
  }
  return window
}

// DSH acknowledges completion through mainView, even when a canvas hides it.
// Keep this observer with the plugin, so withdrawing the sidebar in Agent mode
// cannot discard acknowledgements or miss a background completion.
export function watchCompletions({ sessions, roster, canvas, panels, completions, canvasSize = () => undefined, page = globalThis.document }) {
  const running = new Map()
  const sync = () => {
    const team = roster.getSnapshot()
    if (!team.ready) return
    const ids = new Set([...team.bots.map(currentPart), ...team.rooms.map(room => room.id)])
    const list = sessions.getSnapshot(), next = { ...completions.getSnapshot() }
    for (const id of running.keys()) if (!ids.has(id)) running.delete(id)
    for (const id of Object.keys(next)) if (!ids.has(id)) delete next[id]
    for (const id of ids) {
      const current = list.byId[id]?.running
      if (typeof current !== 'boolean') continue
      if (current) delete next[id]
      else if (running.get(id) === true) next[id] = true
      running.set(id, current)
    }
    if (page?.visibilityState !== 'hidden') {
      const panel = panels.getSnapshot().activePanelId
      let shown
      if (panel === 'ds-bot-canvas') {
        const window = canvasReading(canvas.getSnapshot(), canvasSize())
        const entity = window && (window.kind === 'room' ? team.roomsById[window.entityId] : team.byId[window.entityId])
        shown = entity && (window.kind === 'room' ? entity.id : currentPart(entity))
      } else if (panel === null || panel === undefined) {
        shown = Object.values(list.byId).find(value => (value.retainedBy?.mainView ?? 0) > 0)?.id
      }
      if (shown) delete next[shown]
    }
    const previous = completions.getSnapshot()
    if (Object.keys(previous).length !== Object.keys(next).length || Object.keys(next).some(id => previous[id] !== next[id])) completions.set(next)
  }
  const offs = [sessions, roster, canvas, panels].map(source => source.subscribe(sync))
  page?.addEventListener('visibilitychange', sync)
  sync()
  return () => { offs.forEach(off => off()); page?.removeEventListener('visibilitychange', sync) }
}
