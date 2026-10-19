import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function install(rt) {
  const { state, ctx } = rt
  const teams = () => Object.values(state.teams)
  const teamOf = id => state.teams[id]
  const findTeam = ref => teamOf(ref) ?? teams().find(team => team.name.toLowerCase() === String(ref).trim().toLowerCase())
  const organizationAdmin = actor => actor === undefined || rt.isGeneralAssistant(actor)
  const editable = (team, actor) => {
    if (!organizationAdmin(actor) && actor !== team.leaderId) throw new Error('Only the user, General Assistant or team leader can change this team')
  }
  const checkTeamAssignment = (botId, teamId) => {
    const current = teams().find(team => team.leaderId === botId)
    if (current && current.id !== teamId) throw new Error('Hand over team leadership before moving its leader')
    if (teamId !== null && !teamOf(teamId)) throw new Error('Unknown team')
    if (teamId !== null && rt.isGeneralAssistant(botId)) throw new Error('The General Assistant stays independent of departments')
    if (teamId !== null && rt.isTemporaryBot?.(botId)) throw new Error('Promote a temporary employee before assigning a lasting team')
  }
  const assign = (botId, teamId) => {
    for (const team of teams()) team.members = team.members.filter(id => id !== botId)
    const bot = rt.botOf(botId)
    bot.teamId = teamId
    // Explicit membership replaces only the legacy management relationship.
    delete bot.ownerId
    if (teamId !== null) teamOf(teamId).members.push(botId)
  }
  let organizationQueue = Promise.resolve()
  function saveChange(change) {
    const next = organizationQueue.then(async () => {
      await rt.load()
      const blocked = rt.readOnly()
      if (blocked) throw new Error(blocked)
      const beforeTeams = structuredClone(state.teams)
      const affiliations = new Map(Object.values(state.bots).map(bot => [bot, { teamId: bot.teamId, ownerId: bot.ownerId }]))
      try { const value = change(); await rt.save(); return value }
      catch (error) {
        for (const id of Object.keys(state.teams)) if (!beforeTeams[id]) delete state.teams[id]
        for (const [id, team] of Object.entries(beforeTeams)) {
          if (state.teams[id]) Object.assign(state.teams[id], team)
          else state.teams[id] = team
        }
        // Preserve live Bot references and unrelated model, task and conversation changes.
        for (const [bot, before] of affiliations) {
          for (const key of ['teamId', 'ownerId']) {
            if (before[key] === undefined) delete bot[key]
            else bot[key] = before[key]
          }
        }
        throw error
      }
    })
    organizationQueue = next.catch(() => {})
    return next
  }
  function validate(input, id) {
    const name = String(input.name ?? '').trim()
    const purpose = String(input.purpose ?? '').trim()
    if (!name || name.length > 60 || !purpose || purpose.length > 8000) throw new Error('Provide a team name (1–60 characters) and purpose (1–8000 characters)')
    if (teams().some(team => team.id !== id && team.name.toLowerCase() === name.toLowerCase())) throw new Error('A team with this name already exists')
    const members = [...new Set([input.leaderId, ...(input.members ?? [])])]
    if (!input.leaderId || members.some(member => !rt.botOf(member))) throw new Error('Choose an existing leader and employees')
    if (rt.isTemporaryBot?.(input.leaderId)) throw new Error('A temporary employee cannot lead a lasting team')
    if (members.some(member => rt.isTemporaryBot?.(member))) throw new Error('Temporary employees cannot belong to a lasting team')
    if (members.some(member => rt.isGeneralAssistant(member))) throw new Error('The General Assistant stays independent of departments')
    for (const member of members) {
      checkTeamAssignment(member, id ?? null)
      const existing = rt.botOf(member).teamId
      if (existing && existing !== id) throw new Error(`${rt.botOf(member).name} already belongs to another team; move it explicitly first`)
    }
    return { name, purpose, leaderId: input.leaderId, members }
  }
  function createTeam(input, actor) {
    return saveChange(() => {
      if (!organizationAdmin(actor)) throw new Error('Only the user or General Assistant can create lasting teams')
      const value = validate(input)
      if (input.roomId && !rt.roomOf(input.roomId)) throw new Error('Unknown group chat')
      const team = { id: `team-${randomUUID()}`, ...value, createdAt: Date.now(), createdBy: actor ?? null, ...(input.roomId ? { roomId: input.roomId } : {}) }
      state.teams[team.id] = team
      for (const member of value.members) assign(member, team.id)
      return team
    })
  }
  function updateTeam(id, patch, actor) {
    return saveChange(() => {
      const team = teamOf(id)
      if (!team) throw new Error('Unknown team')
      editable(team, actor)
      const next = validate({ ...team, ...patch }, id)
      const removed = team.members.filter(member => !next.members.includes(member))
      Object.assign(team, next)
      for (const member of removed) assign(member, null)
      for (const member of next.members) assign(member, id)
      return team
    })
  }
  function setTeam(botId, teamId, actor) {
    return saveChange(() => {
      if (!organizationAdmin(actor)) throw new Error('Only the user or General Assistant can move employees between teams')
      if (!rt.botOf(botId)) throw new Error('Unknown employee')
      checkTeamAssignment(botId, teamId)
      assign(botId, teamId)
      return rt.botOf(botId)
    })
  }
  function deleteTeam(id, actor) {
    return saveChange(() => {
      if (!organizationAdmin(actor)) throw new Error('Only the user or General Assistant can dissolve teams')
      const team = teamOf(id)
      if (!team) throw new Error('Unknown team')
      delete state.teams[id]
      for (const member of team.members) if (rt.botOf(member)) assign(member, null)
    })
  }
  function migrateTeams() {
    let changed = false
    if (!state.teams || typeof state.teams !== 'object' || Array.isArray(state.teams)) { state.teams = {}; changed = true }
    if (state.organizationVersion === 1) return changed
    // Only explicit departments migrate. An arbitrary chat never determines affiliation.
    for (const room of Object.values(state.rooms)) {
      if (!room.department?.name || !rt.botOf(room.admin)) continue
      const id = room.teamId ?? `team-${room.id}`
      if (!state.teams[id]) {
        const members = room.members.filter(member => rt.botOf(member) && !rt.botOf(member).generalAssistant && !rt.botOf(member).teamId)
        if (!members.includes(room.admin)) continue
        state.teams[id] = { id, name: room.department.name, purpose: room.department.purpose ?? room.notice ?? '', leaderId: room.admin, members, roomId: room.id, createdAt: room.createdAt, createdBy: room.department.coordinator ?? null }
        for (const member of members) assign(member, id)
        changed = true
      }
      if (room.teamId !== id) { room.teamId = id; changed = true }
    }
    state.organizationVersion = 1
    return true
  }
  Object.assign(rt, { teamOf, findTeam, createTeam, updateTeam, deleteTeam, setTeam, checkTeamAssignment, assignTeam: assign, migrateTeams })

  const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
  const resolvePeople = args => {
    const leaderId = rt.findBot(args.leader)?.id
    const members = (args.members ?? []).map(name => {
      const bot = rt.findBot(name)
      if (!bot) throw new Error(`Unknown employee: ${name}`)
      return bot.id
    })
    return { leaderId, members }
  }
  ctx.tools.register(defineTool({
    name: 'organize_team',
    description: 'Create or update a lasting organizational team using existing employees. General Assistant creates teams; a team leader may update its own team. Use only for user-authorized ongoing responsibilities. Groups and conversations are unchanged; moving employees requires assign_employee first.',
    parameters: {
      team: { type: 'string', description: 'Existing team name or id to update; omit to create' },
      name: { type: 'string', required: true }, purpose: { type: 'string', required: true },
      leader: { type: 'string', required: true, description: 'Existing employee name' },
      members: { type: 'array', items: { type: 'string' }, required: true, description: 'Complete employee list; the leader is included automatically' },
    }, output,
    async execute(args, exec) {
      try {
        await rt.load()
        const actor = rt.selfOf(exec.agent?.id)
        if (!rt.botOf(actor)) throw new Error('Only employees can use this tool')
        const input = { name: args.name, purpose: args.purpose, ...resolvePeople(args) }
        const team = args.team ? findTeam(args.team) : null
        if (args.team && !team) throw new Error('Unknown team')
        return JSON.stringify(team ? await updateTeam(team.id, input, actor) : await createTeam(input, actor))
      } catch (error) { return `Could not organize team: ${error.message}` }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'assign_employee', description: 'General Assistant only. Explicitly move an existing employee to a lasting team, or make it independent. Only when authorized by the user. Does not change chats, tasks or filesystem permissions.',
    parameters: { employee: { type: 'string', required: true }, team: { type: 'string', description: 'Team name or id; omit to make independent' } }, output,
    async execute(args, exec) {
      try {
        await rt.load()
        const actor = rt.selfOf(exec.agent?.id)
        if (!rt.isGeneralAssistant(actor)) throw new Error('Only the General Assistant can move employees')
        const bot = rt.findBot(args.employee), team = args.team ? findTeam(args.team) : null
        if (!bot || args.team && !team) throw new Error('Unknown employee or team')
        await setTeam(bot.id, team?.id ?? null, actor)
        return `Assigned ${bot.name} to ${team?.name ?? 'independent employees'}. Conversations, tasks and permissions are unchanged.`
      } catch (error) { return `Could not assign employee: ${error.message}` }
    },
  }))
}
