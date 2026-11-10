// Only explicit chat navigation calls this; mounting or selecting an icon must not
// undo the user's hidden-conversation preferences.
export function createEmployeeConversationRestore({ roster, setFlags, onError }) {
  const pending = new Map()
  return id => {
    const bot = roster.getSnapshot().byId[id]
    if (!bot?.hidden || bot.retiredAt) return Promise.resolve()
    if (pending.has(bot.id)) return pending.get(bot.id)
    const request = Promise.resolve().then(() => setFlags(bot.id, { hidden: false }))
      .catch(error => onError(error))
      .finally(() => pending.delete(bot.id))
    pending.set(bot.id, request)
    return request
  }
}
