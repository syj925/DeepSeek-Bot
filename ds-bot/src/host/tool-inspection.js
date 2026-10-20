// Tool inspection observes live Agents without activating a cold conversation or
// waiting for capability mounts, which could otherwise hide a first-turn failure.
const TOOL_NAME_MAX = 256
const MOUNT_STATES = new Set(['ready', 'connecting', 'needs-approval', 'error'])

const toolNames = schemas => {
  const names = new Map()
  for (const schema of Array.isArray(schemas) ? schemas : []) {
    if (typeof schema?.name !== 'string' || !schema.name || schema.name.length > TOOL_NAME_MAX) continue
    const item = { name: schema.name, ...(schema.deferLoading === true ? { deferLoading: true } : {}) }
    const previous = names.get(item.name)
    // A history can contain several declarations of one name. Keep the deferred
    // marker only when every retained declaration of that name has it.
    if (previous && previous.deferLoading !== true) delete item.deferLoading
    names.set(item.name, item)
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function install(rt) {
  const { ctx, state } = rt
  const botOf = id => typeof id === 'string' && Object.hasOwn(state.bots ?? {}, id) ? rt.botOf(id) : undefined
  const roomOf = id => typeof id === 'string' && Object.hasOwn(state.rooms ?? {}, id) ? rt.roomOf(id) : undefined

  const capabilitiesFor = botId => {
    const bot = botOf(botId)
    if (!bot) return []
    let statuses = {}
    try { statuses = rt.capabilityStatusesView?.()[botId] ?? {} } catch {}
    return (bot.capabilities ?? []).filter(name => typeof name === 'string').map(name => ({
      name,
      state: MOUNT_STATES.has(statuses[name]?.state) ? statuses[name].state : 'unknown',
    }))
  }

  function targetsFor(sessionId, botId) {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Unknown team conversation')
    const room = roomOf(sessionId)
    if (room) {
      if (botId !== undefined && !room.members.includes(botId)) throw new Error('Bot is not a member of this group')
      return room.members.filter(id => botId === undefined || id === botId).map(id => {
        if (!botOf(id)) throw new Error('Unknown Bot')
        return { kind: 'group', botId: id, roomId: room.id, sessionId: room.sessions?.[id] }
      })
    }
    const directBot = botOf(sessionId)
    const privateBotId = directBot?.id ?? rt.chatOwners?.get(sessionId)
    if (privateBotId !== undefined && botOf(privateBotId)) {
      if (botId !== undefined && botId !== privateBotId) throw new Error('Bot does not own this conversation')
      return [{ kind: 'private', botId: privateBotId, sessionId: rt.chatOf(privateBotId) }]
    }
    const owner = rt.groupOwners?.get(sessionId)
    const ownedRoom = owner && roomOf(owner.roomId)
    if (ownedRoom?.members.includes(owner.botId) && ownedRoom.sessions?.[owner.botId] === sessionId && botOf(owner.botId)) {
      if (botId !== undefined && botId !== owner.botId) throw new Error('Bot does not own this conversation')
      return [{ kind: 'group', botId: owner.botId, roomId: owner.roomId, sessionId }]
    }
    const plainAgent = rt.agentOf?.(sessionId)
    if (plainAgent && state.agents?.[plainAgent.id]?.sessions?.includes(sessionId)) {
      if (botId !== undefined) throw new Error('A DSH Agent conversation has no Bot owner')
      return [{ kind: 'agent', agentId: plainAgent.id, sessionId }]
    }
    throw new Error('Unknown team conversation')
  }

  const inspect = target => {
    const result = {
      ...target,
      state: target.sessionId ? 'inactive' : 'not-started',
      registry: { state: 'unavailable', tools: [] },
      lastRequest: { state: 'unavailable', tools: [] },
      history: { state: 'unavailable', initial: [], additions: [] },
      capabilityScope: 'employee',
      capabilities: capabilitiesFor(target.botId),
    }
    if (!target.sessionId) return result
    let agent
    try {
      const agents = ctx.get?.('agents')
      if (typeof agents?.get !== 'function') { result.state = 'unavailable'; return result }
      agent = agents.get(target.sessionId)
    } catch { result.state = 'unavailable'; return result }
    if (!agent || agent.session?.id !== target.sessionId || !agent.ctx) return result
    result.state = 'ready'
    try {
      const presets = ctx.get?.('agentPresets')
      const presetId = (typeof presets?.composedPreset === 'function' ? presets.composedPreset(agent.ctx) : undefined) ?? agent.session.header?.agentPreset
      if (typeof presetId === 'string' && presetId) result.presetId = presetId
    } catch {}
    try {
      if (typeof ctx.tools?.schemas === 'function') result.registry = { state: 'available', tools: toolNames(ctx.tools.schemas(agent)) }
    } catch {}
    try {
      if (typeof agent.session.requestHeader === 'function') {
        const header = agent.session.requestHeader()
        result.lastRequest = { state: header ? 'available' : 'not-started', tools: toolNames(header?.tools) }
      }
    } catch {}
    try {
      if (typeof agent.session.toolHistory === 'function') {
        const history = agent.session.toolHistory()
        result.history = {
          state: 'available',
          initial: toolNames(history?.tools),
          additions: toolNames((history?.updates ?? []).flatMap(update => update?.additions ?? [])),
        }
      }
    } catch {}
    return result
  }

  rt.toolInspection = async (sessionId, botId) => {
    await rt.load()
    return { time: Date.now(), sessions: targetsFor(sessionId, botId).map(inspect) }
  }

  // Opening an operation browser is an explicit user action. Unlike inspection,
  // it may prepare that member's group Session through the usual ownership path.
  rt.browserSession = async (sessionId, botId) => {
    await rt.load()
    const targets = targetsFor(sessionId, botId)
    if (roomOf(sessionId) && botId === undefined) throw new Error('Choose a Bot before opening a group browser')
    if (targets.length !== 1) throw new Error('Choose one Bot before opening a browser')
    const target = targets[0]
    if (target.kind === 'group') {
      const room = roomOf(target.roomId)
      const bot = botOf(target.botId)
      const prepared = await rt.ensureGroupSession(room, bot)
      return { sessionId: prepared.id, botId: target.botId, roomId: target.roomId }
    }
    return { sessionId: target.sessionId, ...(target.botId ? { botId: target.botId } : {}) }
  }
}
