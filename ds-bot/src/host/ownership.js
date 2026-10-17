// Creation history, organizational membership and management rights are separate.
export function ownerOf(state, id) {
  const seen = new Set()
  while (state.bots[id] && !seen.has(id)) {
    const bot = state.bots[id]
    if (Object.hasOwn(bot, 'teamId')) return state.teams?.[bot.teamId]?.leaderId
    if (state.mainBotIds.includes(id)) return id
    seen.add(id)
    id = Object.hasOwn(bot, 'ownerId') ? bot.ownerId : bot.createdBy
  }
  return undefined
}

// Messages and task requests may go directly to any employee, across teams.
export function requestProblem() { return undefined }

export function manageProblem(state, from, to) {
  if (!from || from === to) return undefined
  if (state.mainBotIds.includes(to)) return 'Another Main Bot is independent. Ask it through message_bot instead of changing or stopping it.'
  const owner = ownerOf(state, to)
  if (owner && owner !== from) return `${state.bots[to]?.name ?? to} is managed by ${state.bots[owner]?.name ?? owner}. You can message it directly, but cannot change its settings, memory or stop its work.`
  if (!owner && Object.hasOwn(state.bots[to] ?? {}, 'teamId') && state.generalAssistantId !== from) return 'This employee is independent. Ask the General Assistant or the user to change its settings.'
  return undefined
}

export function checkRoomMembers(state, members) {
  if (members.some(id => !state.bots[id])) throw new Error('Unknown employee in group')
}
