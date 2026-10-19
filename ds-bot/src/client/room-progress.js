// All visible copies of a room share one request loop, including its live relay
// and work that outlives that relay. Historical tool cells never keep it alive.
const clients = new WeakMap()

export function subscribeRoomProgress(actions, roomId, listener) {
  let rooms = clients.get(actions)
  if (!rooms) { rooms = new Map(); clients.set(actions, rooms) }
  let entry = rooms.get(roomId)
  if (!entry) {
    entry = { listeners: new Set(), value: [], timer: undefined, stopped: false }
    rooms.set(roomId, entry)
  }
  entry.listeners.add(listener)
  listener(entry.value)
  if (!entry.started) {
    entry.started = true
    const tick = async () => {
      let value
      try { value = await actions.roomProgress(roomId) } catch { value = undefined }
      if (entry.stopped) return
      if (Array.isArray(value)) {
        entry.value = value
        for (const notify of [...entry.listeners]) notify(value)
      }
      entry.timer = setTimeout(tick, document.hidden ? 5000 : 150)
    }
    void tick()
  }
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size) return
    entry.stopped = true
    clearTimeout(entry.timer)
    rooms.delete(roomId)
  }
}
