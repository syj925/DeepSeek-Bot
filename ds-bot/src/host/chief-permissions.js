// User-owned policy; Chief can issue short-lived grants, never change the policy.
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const TTL = 30 * 60_000
const within = (path, root) => path === root || path.startsWith(root + sep)
const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }

export async function prospectingOperation(name, args, cwd, policy) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false
  if (name === 'web_search') return Array.isArray(args.queries) && args.queries.length > 0 && args.queries.length <= 5
    && args.queries.every(query => typeof query === 'string' && query.trim() && query.length <= 1000)
  // Fetch, shell, code execution, connectors and editing existing files stay with
  // the host/user. A tool name or natural-language reason alone is not consent.
  if (name !== 'read' && name !== 'write') return false
  if (typeof args.file_path !== 'string' || !args.file_path || args.file_path.includes('\0')) return false
  if (!isAbsolute(args.file_path) && (!cwd || !isAbsolute(cwd))) return false
  const path = resolve(cwd || '.', args.file_path)
  if (process.platform === 'win32' && /[:]/.test(path.slice(2))) return false
  const root = name === 'read' ? policy.inputRoot : policy.outputRoot
  if (!root || !within(path, root) || path === root) return false
  try {
    if (await realpath(root) !== root) return false
    // Refuse links in every descendant, including links that point back inside.
    let current = root
    const pieces = relative(root, path).split(sep)
    for (let index = 0; index < pieces.length; index++) {
      current = join(current, pieces[index])
      let info
      try { info = await lstat(current) } catch (error) {
        if (error.code === 'ENOENT' && name === 'write' && index === pieces.length - 1) {
          return ['.csv', '.md', '.txt', '.json'].includes(extname(path).toLowerCase()) && typeof args.content === 'string' && args.content.length <= 2_000_000
        }
        return false
      }
      if (info.isSymbolicLink()) return false
      if (index === pieces.length - 1) return name === 'read' && info.isFile()
      if (!info.isDirectory()) return false
    }
  } catch { return false }
  return false
}

export function install(rt) {
  const { ctx, state } = rt
  const grants = new Map()
  const policy = () => state.chiefPermissionPolicy?.enabled === true ? state.chiefPermissionPolicy : undefined
  const chief = () => Object.values(state.bots).find(bot => bot.generalAssistant && !bot.retiredAt)
  const audit = async entry => {
    state.chiefPermissionAudit = [...(Array.isArray(state.chiefPermissionAudit) ? state.chiefPermissionAudit : []), { id: randomUUID(), at: Date.now(), ...entry }].slice(-100)
    await rt.save()
  }
  const valid = grant => grant && grants.get(grant.sessionId) === grant && policy() && grant.revision === policy().revision && grant.expiresAt > Date.now()
    && chief()?.id === grant.chiefId && rt.botOf(grant.botId) && !rt.botOf(grant.botId).retiredAt && rt.selfOf(grant.sessionId) === grant.botId
    && (!grant.roomId || rt.roomOf(grant.roomId)?.members.includes(grant.botId) && rt.roomOf(grant.roomId)?.task?.status !== 'completed')

  async function setChiefPermissionPolicy(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Choose whether Chief can authorize prospecting tasks')
    const workspace = ctx.workspaceRegistry?.get?.(state.workspaceId)?.path
    if (enabled && !workspace) throw new Error('Choose a team workspace before enabling task authorization')
    let inputRoot, outputRoot
    if (enabled) {
      const root = await realpath(workspace)
      inputRoot = join(root, 'prospecting-inputs')
      outputRoot = join(root, 'outputs', 'prospecting')
      for (const directory of [inputRoot, join(root, 'outputs'), outputRoot]) {
        await mkdir(directory, { recursive: true })
        if (await realpath(directory) !== directory) throw new Error('Prospecting folders must not be symbolic links')
      }
    }
    const previous = state.chiefPermissionPolicy
    state.chiefPermissionPolicy = { enabled, revision: randomUUID(), ...(enabled ? { inputRoot, outputRoot } : {}) }
    grants.clear()
    try { await audit({ action: enabled ? 'enabled' : 'disabled' }) } catch (error) { state.chiefPermissionPolicy = previous; throw error }
    return permissionView()
  }

  async function grantTaskAccess(callerId, { botId, roomId, objective }) {
    if (!chief() || callerId !== chief().id) throw new Error('Only the General Assistant can authorize a task')
    if (!policy()) throw new Error('Task authorization is off. The user can enable the prospecting preset in Settings.')
    const bot = rt.botOf(botId)
    if (!bot || bot.retiredAt) throw new Error('Choose an active employee')
    if (typeof objective !== 'string' || !objective.trim()) throw new Error('Describe the task being authorized')
    const room = roomId ? rt.roomOf(roomId) : undefined
    if (roomId && (!room?.members.includes(botId) || room.task?.status === 'completed')) throw new Error('Choose an active group containing this employee')
    const sessionId = room ? (await rt.ensureGroupSession(room, bot)).id : rt.chatOf(botId)
    const grant = { id: randomUUID(), chiefId: callerId, botId, sessionId, ...(roomId ? { roomId } : {}),
      objective: objective.trim().slice(0, 300), revision: policy().revision, expiresAt: Date.now() + TTL,
      turn: rt.live.get(sessionId)?.turn }
    grants.set(sessionId, grant)
    try { await audit({ action: 'granted', botId, sessionId, ...(roomId ? { roomId } : {}) }) } catch (error) { grants.delete(sessionId); throw error }
    return grant
  }

  async function reviewChiefApproval(request) {
    const sessionId = request.agent?.session?.id ?? request.agent?.id
    const grant = grants.get(sessionId)
    if (!valid(grant) || request.signal?.aborted || grant.turn === undefined || grant.turn !== rt.live.get(sessionId)?.turn) return false
    const call = rt.live.get(sessionId)?.calls?.get(request.callId)
    if (!call || call.name !== request.toolName) return false
    let args
    try { args = JSON.parse(call.args) } catch { return false }
    if (!await prospectingOperation(call.name, args, request.agent?.session?.header?.cwd, policy())) return false
    if (!valid(grant) || request.signal?.aborted) return false
    await audit({ action: 'allowed-once', botId: grant.botId, sessionId, ...(grant.roomId ? { roomId: grant.roomId } : {}), tool: call.name })
    return valid(grant) && !request.signal?.aborted
  }

  function permissionView() {
    for (const [id, grant] of grants) if (!valid(grant)) grants.delete(id)
    return { policy: state.chiefPermissionPolicy ?? { enabled: false },
      grants: [...grants.values()].map(({ turn, revision, ...entry }) => entry),
      audit: (Array.isArray(state.chiefPermissionAudit) ? state.chiefPermissionAudit : []).slice(-30) }
  }

  ctx.on('session/event', (session, event) => {
    const grant = grants.get(session.id)
    if (!grant) return
    if (event.type === 'turn/start') {
      if (grant.turn !== undefined && grant.turn !== event.data?.turn) grants.delete(session.id)
      else grant.turn = event.data?.turn
    }
    if (event.type === 'turn/end') grants.delete(session.id)
  })
  ctx.tools.register(defineTool({
    name: 'authorize_prospecting_task',
    description: 'General Assistant only. Before dispatching a prospecting task, grant the employee the user-enabled prospecting preset for one execution turn, at most 30 minutes. Never changes permanent permissions. Shell, arbitrary browsing, external messaging, paid purchases and file overwrites still require the user/host. If disabled, direct the user to task authorization settings.',
    parameters: {
      bot: { type: 'string', required: true, description: 'Exact employee name from list_bots' },
      group: { type: 'string', description: 'Exact active group name, if the work runs in a group' },
      objective: { type: 'string', required: true, description: 'The specific prospecting task being delegated' },
    }, output,
    async execute(args, exec) {
      await rt.load()
      const bot = rt.findBot(args.bot)
      const room = args.group ? Object.values(state.rooms).find(item => item.name === args.group) : undefined
      if (args.group && !room) throw new Error('Group not found')
      const grant = await grantTaskAccess(rt.selfOf(exec.agent?.id), { botId: bot?.id, roomId: room?.id, objective: args.objective })
      await rt.resumeChiefApprovals?.(grant.sessionId)
      return `Authorized ${bot.name} for this turn only, until ${new Date(grant.expiresAt).toISOString()}. Public web_search; read files under ${policy().inputRoot}; create new CSV/Markdown/text/JSON files under ${policy().outputRoot}. Use the structured read/write tools; do not bypass shell or connector approvals. Dispatch to this same conversation now. Missing tools, authentication and service errors still need their own resolution.`
    },
  }))
  Object.assign(rt, { setChiefPermissionPolicy, grantTaskAccess, reviewChiefApproval, chiefPermissionView: permissionView,
    revokeTaskAccess: async id => { const grant = grants.get(id); grants.delete(id); if (grant) await audit({ action: 'revoked', botId: grant.botId, sessionId: id }) } })
}
