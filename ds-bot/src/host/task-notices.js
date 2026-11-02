import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute, basename } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { isPass } from './groups.js'

export const NOTICE_LIMIT = 100

export function install(rt) {
  const { state, ctx } = rt
  let stopped = false
  const tool = defineTool({
    name: 'complete_task',
    description: 'For a DS Bot employee executing an active task in its current conversation only: record a verified final user deliverable for the task notification center. Call once before the final delivery reply. Never for ordinary chat, progress, delegation, internal replies or work awaiting approval. Only a group coordinator reports its final combined deliverable.',
    parameters: {
      title: { type: 'string', required: true, description: 'Short name of the completed task (at most 100 characters)' },
      summary: { type: 'string', required: true, description: 'One factual sentence describing what was delivered (at most 240 characters)' },
      files: { type: 'array', items: { type: 'string' }, description: 'Up to 10 existing absolute paths of final output files, not scripts or intermediate files. Omit for an in-chat deliverable.' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      const id = exec.agent?.id, entry = rt.live.get(id)
      const bot = rt.botOf(rt.selfOf(id))
      if (stopped || !rt.isBotSession(id) || !bot || entry?.turn === undefined) throw new Error('Only an employee with an active task can report completion.')
      const turn = entry.turn
      const roomId = rt.groupOwners.get(id)?.roomId
      const room = roomId && rt.roomOf(roomId)
      const info = entry.info
      if (room ? room.admin !== bot.id : info && !['reply', 'retry'].includes(info.role) && !(info.role === 'request' && info.audience === 'user')) {
        return 'Internal work: report back in the conversation. Only the user-facing coordinator sends the completion notification.'
      }
      if (typeof args.title !== 'string' || !args.title.trim() || typeof args.summary !== 'string' || !args.summary.trim()) throw new Error('A task title and delivery summary are required.')
      if (args.files !== undefined && (!Array.isArray(args.files) || args.files.length > 10)) throw new Error('Provide at most 10 final output paths.')
      const files = []
      for (const path of new Set(args.files ?? [])) {
        if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Output paths must be absolute.')
        const details = await stat(path).catch(() => undefined)
        if (!details?.isFile()) throw new Error(`Output file is not available: ${path}`)
        files.push({ path, name: basename(path) })
      }
      if (stopped || rt.live.get(id) !== entry || entry.turn !== turn || !rt.isBotSession(id)
        || rt.botOf(rt.selfOf(id))?.id !== bot.id || rt.groupOwners.get(id)?.roomId !== roomId) {
        throw new Error('The task is no longer running.')
      }
      if (room?.task && rt.taskGroupBlocked?.(room, id)) return 'The group still has unfinished work or an approval. Wait for the actual results before completing the task.'
      entry.completion = { botId: bot.id, name: bot.name, sessionId: id, targetId: roomId ?? bot.id, ...(roomId ? { roomId } : {}), title: args.title.trim().slice(0, 100), summary: args.summary.trim().slice(0, 240), files }
      return 'Completion recorded. Deliver your final answer now; the notification is sent only after this turn finishes successfully.'
    },
  })
  const agents = new Map()
  const registered = new Map()
  const release = (agent) => {
    registered.get(agent)?.()
    registered.delete(agent)
  }
  const sync = (agent) => {
    if (stopped) return
    const id = agent.session?.id
    if (!rt.isBotSession(id) || !rt.botOf(rt.selfOf(id))) { release(agent); return }
    if (registered.has(agent)) return
    if (typeof agent.ctx?.tools?.register !== 'function') {
      rt.warn('ds-bot: completion reporting requires the employee Agent scoped-tool API')
      return
    }
    registered.set(agent, agent.ctx.tools.register(tool))
  }
  const track = (agent) => {
    const id = agent?.session?.id
    if (stopped || typeof id !== 'string') return
    if (agents.get(id)?.deref() !== agent) {
      const previous = agents.get(id)?.deref()
      if (previous) release(previous)
      agents.set(id, new WeakRef(agent))
      agent.ctx?.effect(() => () => {
        release(agent)
        if (agents.get(id)?.deref() === agent) agents.delete(id)
      }, 'ds-bot: employee completion tool')
    }
    sync(agent)
  }
  rt.prepareTaskNoticeAgent = track
  rt.syncTaskNoticeTools = () => {
    for (const [id, reference] of agents) {
      const agent = reference.deref()
      if (agent) sync(agent)
      else agents.delete(id)
    }
  }
  ctx.on('agent/created', async ({ agent }) => {
    track(agent)
    await rt.load()
    sync(agent)
  })
  ctx.effect(() => {
    const startup = rt.load().then(() => {
      if (stopped) return
      for (const agent of ctx.get?.('agents')?.list() ?? []) track(agent)
      rt.syncTaskNoticeTools()
    }).catch(error => rt.warn('ds-bot: completion tool initialization failed: %s', error))
    return async () => {
      stopped = true
      await startup
      for (const agent of registered.keys()) release(agent)
      agents.clear()
    }
  }, 'ds-bot: scoped completion tools')
  rt.finishTaskNotice = (entry, { reason, retry, switched, id, turn, info, opened, lastText, lastCalled }) => {
    let completion = entry.completion
    const handoff = entry.taskHandoff
    const epoch = entry.taskEpoch
    delete entry.taskHandoff
    delete entry.completion
    if (reason?.kind !== 'completed' || retry || switched || state.questions[id] || (rt.approvalsView?.() ?? []).some(value => value.sessionId === id)) return
    if (turn !== undefined && entry.notifiedTurn === turn) return
    const author = rt.botOf(rt.selfOf(id)), fileRoom = rt.groupOwners.get(id)?.roomId
    const outwardFile = !fileRoom && (info
      ? ['reply', 'report', 'retry', 'resume'].includes(info.role) || info.role === 'request' && info.audience === 'user' || info.role === 'handoff' && info.resume === true
      : opened === true)
    if (author && outwardFile && !lastCalled && lastText?.trim()) {
      void rt.recordConversationFiles?.({ text: lastText, sessionId: id, botId: author.id, targetId: author.id,
        title: author.name, at: Date.now() })
        .catch(error => rt.warn('ds-bot: shared file indexing deferred: %s', error))
    }
    if (handoff && !completion) {
      void rt.archiveCompletedTaskSession?.(id, { ...handoff, kind: 'handoff', epoch }).catch(error => rt.warn('ds-bot: task handoff cleanup deferred: %s', error))
    }
    if (!completion) {
      const bot = rt.botOf(rt.selfOf(id)), roomId = rt.groupOwners.get(id)?.roomId
      const outward = info
        ? ['reply', 'retry', 'report'].includes(info.role) || info.role === 'request' && info.audience === 'user'
          || info.role === 'handoff' && info.resume === true || roomId && info.role === 'room'
        : opened === true
      // Notify from the successful final reply, never a streaming chunk or an internal handoff.
      if (!bot || !outward || lastCalled || typeof lastText !== 'string' || !lastText.trim()) return
      if (roomId && (!rt.roomOf(roomId) || isPass(lastText))) return
      completion = { kind: 'message', botId: bot.id, name: bot.name, sessionId: id, targetId: roomId ?? bot.id, ...(roomId ? { roomId } : {}), title: 'New message', summary: lastText.replace(/\s+/g, ' ').trim().slice(0, 240), files: [] }
    }
    if (!rt.botOf(completion.botId) || completion.kind !== 'message' && completion.roomId && rt.roomOf(completion.roomId)?.admin !== completion.botId) return
    if (completion.kind !== 'message' && completion.roomId && rt.roomOf(completion.roomId)?.task) {
      rt.recordTaskGroupCompletion?.(completion)
      return
    }
    if (turn !== undefined) entry.notifiedTurn = turn
    const notice = { ...completion, id: randomUUID(), at: Date.now() }
    state.taskNotices = [...(state.taskNotices ?? []), notice].slice(-NOTICE_LIMIT)
    void rt.save().then(() => {
      if (entry.taskEpoch === epoch && completion.kind !== 'message' && !completion.roomId) {
        void rt.archiveCompletedTaskSession?.(id, { ...notice, evidence: lastText, epoch }).catch(error => rt.warn('ds-bot: task context cleanup deferred: %s', error))
      }
    }, error => {
      state.taskNotices = (state.taskNotices ?? []).filter(value => value.id !== notice.id)
      rt.warn('ds-bot: saving task completion failed: %s', error)
    })
  }
}
