// Harness owns one editor per Session. Only one plugin occurrence may mount it.
export function createChatSurfaces() {
  const sessions = new Map()
  const publish = entries => { for (const entry of entries) entry.update(entry === entries.at(-1)) }
  return {
    register(sessionId, update) {
      const entry = { update }
      const entries = sessions.get(sessionId) ?? []
      sessions.set(sessionId, entries)
      entries.push(entry)
      publish(entries)
      return {
        activate() {
          const index = entries.indexOf(entry)
          if (index < 0 || index === entries.length - 1) return
          entries.splice(index, 1)
          entries.push(entry)
          publish(entries)
        },
        release() {
          const index = entries.indexOf(entry)
          if (index < 0) return
          entries.splice(index, 1)
          if (entries.length) publish(entries)
          else sessions.delete(sessionId)
        },
      }
    },
  }
}

export const chatSurfaces = createChatSurfaces()
