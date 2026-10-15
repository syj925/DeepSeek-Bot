// Legacy records keep their creator chain; opening a group never assigns ownership.
export function ownerOf(state, id) {
  const seen = new Set()
  while (state.bots[id] && !seen.has(id)) {
    if (state.mainBotIds.includes(id)) return id
    seen.add(id)
    id = state.bots[id].ownerId ?? state.bots[id].createdBy
  }
  return undefined
}

export function requestProblem(state, from, to) {
  if (!from || from === to) return undefined
  const owner = ownerOf(state, to)
  const senderOwner = ownerOf(state, from)
  if (!owner || owner === to || !senderOwner || senderOwner === owner) return undefined
  return `${state.bots[to]?.name ?? to} belongs to ${state.bots[owner]?.name ?? owner}. Send your request to that Main Bot; it delegates to its own child and returns the result. Do not call this child directly.`
}

export function manageProblem(state, from, to) {
  if (from === to) return undefined
  const problem = requestProblem(state, from, to)
  if (problem) return problem
  if (state.mainBotIds.includes(to)) return 'Another Main Bot is independent. Ask it through message_bot instead of changing or stopping it.'
  return undefined
}

export function checkRoomMembers(state, members, mainOnly = false, actor) {
  // Legacy groups may mix a Main Agent with its own children.  Only the
  // explicit Main-Agent collaboration rooms created from the canvas
  // (`mainOnly: true`) require every member to be a Main Agent.  All rooms
  // still reject a child that belongs to another Main Agent, so cross-owner
  // work must go through that owner's Main Agent.
  if (mainOnly && members.some(id => !state.mainBotIds.includes(id))) throw new Error('A Main Agent group can contain only Main Bots.')
  for (const from of actor ? [actor, ...members] : members) {
    for (const to of members) {
      const problem = requestProblem(state, from, to)
      if (problem) throw new Error(problem)
    }
  }
}
