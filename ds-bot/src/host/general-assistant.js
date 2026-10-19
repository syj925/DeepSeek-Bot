import { defineTool } from '@deepseek-ai/dsh-tools'
import { nameProblem } from '../shared/mentions.js'
import { assistantIdentityProblem } from '../shared/assistant-identity.js'

export const GENERAL_ASSISTANT_RULES = `# General Assistant
You are the user's General Assistant, the fixed entry point for organizing work across departments.
- You are the team's only General Assistant. Never create another employee or leader with that name or role; use your own existing conversation.
- First call list_bots. Reuse suitable existing departments instead of duplicating people for every request.
- A one-off task normally uses the existing team. Create a lasting department only when the user asks to build a team/department or clearly needs an ongoing function. Clarify only missing decisions that materially affect the structure.
- For an authorized new department, call create_department with a distinct leader and a small set of complementary members. The tool creates real conversations and a group; do not claim success before it returns successfully.
- After creation, show the department, leader and members. To begin work, use post_to_group to hand the goal to the responsible leader in the group. Requirements, execution, files and delivery stay there; use read_task_history to find results when asked. Do not fabricate a discussion or dispatch duplicate tasks.
- Teams are lasting organizations with a purpose, leader and fixed employees. Employees can remain independent and join multiple cross-team groups. Use organize_team to reuse existing employees; assign_employee explicitly changes affiliation only with user authorization. Creating or leaving a group never changes team membership.
- Employees may message or assign work directly across teams without leader approval. Leaders coordinate responsibilities, track progress and summarize outcomes, not relay every message. A new unrelated task queues until the employee finishes; corrections can use when now. Organizational roles grant no extra filesystem, network or approval permissions.
- Use the user's language. Keep replies concise and focused on the next useful outcome.`

export function install(rt) {
  const { state, ctx } = rt
  let departmentQueue = Promise.resolve()
  rt.generalAssistantRules = GENERAL_ASSISTANT_RULES
  rt.isGeneralAssistant = id => rt.botOf(id)?.generalAssistant === true && rt.isMain(id)
  rt.reconcileGeneralAssistant = () => {
    const mains = state.mainBotIds.map(id => state.bots[id]).filter(Boolean)
    const chief = mains.find(bot => bot.id === state.generalAssistantId)
      ?? mains.find(bot => bot.name.trim().toLowerCase() === 'chief')
      ?? mains.find(bot => !bot.generalAssistant && !bot.formerGeneralAssistant)
      ?? mains[0]
    if (!chief) return false
    let changed = state.generalAssistantId !== chief.id || !chief.generalAssistant
    for (const bot of Object.values(state.bots)) {
      if (bot.id === chief.id || !bot.generalAssistant) continue
      // Keep the former dedicated assistant's Sessions, children and groups intact.
      delete bot.generalAssistant
      if (!state.generalAssistantId) {
        bot.formerGeneralAssistant = true
        bot.hidden = true
      }
      changed = true
    }
    state.generalAssistantId = chief.id
    chief.generalAssistant = true
    delete chief.formerGeneralAssistant
    return changed
  }
  rt.ensureGeneralAssistant = async () => {
    await rt.bootstrap()
    return rt.botOf(state.generalAssistantId)
  }

  async function createDepartment(actor, input) {
    await rt.load()
    if (!rt.isGeneralAssistant(actor)) throw new Error('Only the General Assistant can create departments')
    const name = String(input.name ?? '').trim()
    const purpose = String(input.purpose ?? '').trim()
    if (!name || name.length > 60 || !purpose || purpose.length > 8000) throw new Error('Provide a department name (1–60 characters) and purpose (1–8000 characters)')
    const existing = rt.findTeam(name)
    if (existing) {
      if (existing.purpose !== purpose) throw new Error('A department with this name already exists. Reuse it or choose a distinct name.')
      return { reused: true, team: existing, room: rt.roomOf(existing.roomId), leader: rt.botOf(existing.leaderId), members: existing.members.map(rt.botOf) }
    }
    const members = input.members
    if (!Array.isArray(members) || members.length < 1 || members.length > 7) throw new Error('A department needs 1–7 members in addition to its leader')
    const specs = [input.leader, ...members].map(spec => {
      const person = { name: String(spec?.name ?? '').trim(), role: String(spec?.role ?? '').trim(), instructions: String(spec?.instructions ?? '').trim() }
      const problem = nameProblem(person.name) ?? assistantIdentityProblem(person)
      if (problem || person.name.length > 40 || !person.role || person.role.length > 24 || !person.instructions || person.instructions.length > 8000) throw new Error(problem ?? 'Each person needs a name (up to 40 characters), role (up to 24), and instructions (up to 8000)')
      if (rt.findBot(person.name)) throw new Error(`A Bot named ${person.name} already exists; reuse its department or choose another name`)
      return person
    })
    if (new Set(specs.map(person => person.name.toLowerCase())).size !== specs.length) throw new Error('Department member names must be distinct')
    const model = rt.botOf(actor).model ?? await rt.defaultModel()
    if (!model) throw new Error('Choose a model for the General Assistant before creating a department')
    const created = []
    let room
    let team
    try {
      const leader = await rt.createBot({ ...specs[0], main: true, model, quiet: true, createdBy: actor })
      created.push(leader)
      for (const spec of specs.slice(1)) created.push(await rt.createBot({ ...spec, model, quiet: true, createdBy: leader.id, employment: 'long-term' }))
      room = await rt.createRoom({ name, notice: purpose, members: created.map(bot => bot.id), admin: leader.id, createdBy: leader.id, mode: 'admin' })
      team = await rt.createTeam({ name, purpose, leaderId: leader.id, members: created.map(bot => bot.id), roomId: room.id }, actor)
      room.teamId = team.id
      room.department = { name, purpose, coordinator: actor }
      await rt.save()
      return { reused: false, team, room, leader, members: created }
    } catch (error) {
      // These conversations have never been dispatched; roll back only this operation.
      const failures = []
      if (team) {
        try { await rt.deleteTeam(team.id, actor) } catch (failure) { failures.push(failure.message) }
      }
      if (room) {
        try { await rt.deleteRoom(room.id) } catch (failure) { failures.push(failure.message) }
      }
      for (const bot of created.reverse()) {
        try {
          if (rt.isMain(bot.id)) await rt.setMain(bot.id, false)
          await rt.deleteBot(bot.id)
        } catch (failure) { failures.push(failure.message) }
      }
      throw new Error(`${error.message}${failures.length ? `; cleanup needs attention: ${failures.join('; ')}` : ''}`)
    }
  }
  rt.createDepartment = (actor, input) => {
    const next = departmentQueue.then(() => createDepartment(actor, input))
    departmentQueue = next.catch(() => {})
    return next
  }
  const person = { type: 'object', properties: {
    name: { type: 'string', required: true }, role: { type: 'string', required: true }, instructions: { type: 'string', required: true },
  }, additionalProperties: false }
  ctx.tools.register(defineTool({
    name: 'create_department',
    description: 'General Assistant only. Create a lasting department with a leader, 1–7 employees, a lasting team record and a separate group chat. Reuse existing departments first. No messages are sent by this tool.',
    parameters: {
      name: { type: 'string', required: true, description: 'Unique department name' },
      purpose: { type: 'string', required: true, description: 'The user-authorized purpose of this department' },
      leader: { ...person, required: true, description: 'The employee responsible for coordinating the department' },
      members: { type: 'array', items: person, required: true, description: '1–7 specialists, each with a distinct name and responsibility' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      try {
        const result = await rt.createDepartment(rt.selfOf(exec.agent?.id), args)
        return JSON.stringify({ status: result.reused ? 'existing' : 'created', department: result.team.name, teamId: result.team.id, groupId: result.room?.id ?? null, leader: result.leader.name, members: result.members.map(bot => ({ name: bot.name, id: bot.id, teamId: bot.teamId ?? null })), next: 'Contact the leader to begin work in this group.' })
      } catch (error) { return `Could not create department: ${error.message}` }
    },
  }))
}

