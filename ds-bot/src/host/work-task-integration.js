import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const refused = message => Object.assign(new Error(message), { code: 'bot/refused' })

// Business records use the existing Bot executor. They never grant tools or create
// a second agent loop, and a recovered task only runs after an explicit user action.
export function install(rt) {
  const { state, ctx } = rt
  const executionBindings = task => (task.bindings ?? []).filter(item => item.purpose !== 'origin' && item.active !== false)
  rt.workTaskBusy = (task, exceptSession) => {
    const room = task.roomId && rt.roomOf(task.roomId)
    const sessions = new Set(executionBindings(task).map(item => item.sessionId))
    if (room) {
      sessions.add(room.id)
      for (const id of Object.values(room.sessions ?? {})) sessions.add(id)
      if (rt.roomInbox?.get(room.id)?.length) return true
      if (!exceptSession && [...(rt.roomProgress?.values() ?? [])].some(round => round.roomId === room.id)) return true
    }
    if ((rt.approvalsView?.() ?? []).some(item => sessions.has(item.sessionId))) return true
    if ([...sessions].some(id => state.questions?.[id])) return true
    if (Object.values(state.taskInputs ?? {}).some(item => sessions.has(item.sessionId))) return true
    if ([...sessions].some(id => id !== exceptSession && rt.live?.get(id)?.turn !== undefined && id !== room?.id)) return true
    const answered = new Set((state.exchanges ?? []).filter(item => item.role === 'reply').map(item => item.replyTo))
    return !!room && (state.exchanges ?? []).some(item => item.role === 'request' && item.fromRoomId === room.id && !answered.has(item.id))
  }
  rt.workTaskSubmissionBlocked = (task, input) => rt.workTaskBusy(task, input.sessionId)
  rt.workTaskAcceptanceBlocked = task => rt.workTaskBusy(task)

  rt.startWorkTaskForRoom = async (room, sessionId, plan = {}) => {
    if (!room?.task) return undefined
    const current = state.workTasks?.[room.task.workTaskId]
    if (current && current.status !== 'completed') return current
    if (plan.criteria !== undefined && (!Array.isArray(plan.criteria) || plan.criteria.length > 19)) throw refused('Provide at most 19 additional acceptance requirements.')
    const record = await rt.createWorkTask({ sessionId, originSessionId: sessionId, originBotId: room.task.originBotId,
      objective: room.task.objective, title: room.name, ownerBotId: room.admin, participantBotIds: room.members,
      roomId: room.id, criteria: [room.task.objective, ...(plan.criteria ?? [])], ...(plan.steps ? { steps: plan.steps } : {}) })
    room.task.workTaskId = record.id
    await rt.save()
    return record
  }

  rt.linkWorkTaskToRoom = async task => {
    if (!task.roomId) return
    const room = rt.roomOf(task.roomId)
    if (!room) throw refused('The task group is no longer available.')
    if (room.task?.workTaskId === task.id) return
    const previous = room.task
    if (previous?.workTaskId && state.workTasks?.[previous.workTaskId]?.status !== 'completed') throw refused('This group already has an independent task. Continue that record instead.')
    room.task = { objective: task.objective, originBotId: task.originBotId, status: 'active', cycle: (previous?.cycle ?? 0) + 1,
      createdAt: task.createdAt, managed: true, workTaskId: task.id }
    try { await rt.save() } catch (error) { room.task = previous; throw error }
  }

  rt.dispatchWorkTask = async (task, text) => {
    if (rt.workTaskBusy(task)) throw refused('This task is still working or awaiting a question or permission. Resolve that first.')
    const owner = rt.botOf(task.ownerBotId)
    if (!owner || owner.retiredAt) throw refused('The responsible employee is unavailable. The saved task and outputs are retained.')
    const room = task.roomId && rt.roomOf(task.roomId)
    if (task.roomId && (!room || !room.members.includes(owner.id) || room.admin !== owner.id)) throw refused('The task coordinator has changed. Reassign the task explicitly before continuing.')
    let sessionId = room ? (await rt.ensureGroupSession(room, owner)).id : rt.chatOf(owner.id)
    const agent = await rt.resolveAgent(sessionId)
    if (rt.live?.get(sessionId)?.turn !== undefined || (agent.inbox?.nextTurn?.length ?? 0) + (agent.inbox?.nextStep?.length ?? 0) > 0) throw refused('This employee already has pending work. Wait before continuing this task.')
    if (!room && !executionBindings(task).some(binding => binding.sessionId === sessionId)) {
      const current = rt.workTaskForSession?.(sessionId)
      if (current && current.id !== task.id && ['active', 'blocked'].includes(current.status)) throw refused('Another task is open in this employee conversation. Finish it or start a separate task context first.')
      if (await rt.privateContextBusy?.(sessionId) || !await rt.resetTaskSession?.(sessionId, { newTask: true })) throw refused('The task context could not be isolated. No continuation was sent; try again when the conversation is idle.')
      sessionId = rt.chatOf(owner.id)
    }
    await rt.bindWorkTaskSession(task.id, { sessionId, botId: owner.id, allowResume: true, ...(room ? { roomId: room.id } : {}) })
    if (room) {
      // A normal group user turn keeps member questions, replies and results in the group.
      await ctx.sessionController.prompt({ requestId: randomUUID(), sessionId: room.id, mode: 'queue', content: [{ type: 'text', text }] }, AbortSignal.timeout(30_000))
    } else {
      await rt.deliver({ toId: owner.id, sessionId, role: 'retry', audience: 'user', text })
    }
  }

  rt.nextWorkTaskForRoom = async room => {
    const previous = state.workTasks?.[room.task.workTaskId]
    const owner = rt.botOf(room.admin)
    if (!owner || owner.retiredAt) throw refused('Add an active coordinator before continuing this task group.')
    const { id: sessionId } = await rt.ensureGroupSession(room, owner)
    return rt.createWorkTask({ sessionId, originBotId: owner.id, objective: room.task.objective, title: room.name,
      ownerBotId: owner.id, participantBotIds: room.members.filter(id => rt.botOf(id) && !rt.botOf(id).retiredAt), roomId: room.id,
      criteria: previous?.criteria ?? [room.task.objective],
      ...(previous?.steps?.length ? { steps: previous.steps.map(({ id, title }) => ({ id, title })) } : {}) })
  }

  rt.acceptWorkTask = async (task, delivery) => {
    if (rt.workTaskBusy(task)) throw refused('New work is running in this conversation. The accepted delivery is saved; synchronize its task record after that work finishes.')
    const room = task.roomId && rt.roomOf(task.roomId)
    const noticeId = `work-task:${task.id}:${delivery.id}`
    const files = delivery.files ?? []
    const sessionId = delivery.sessionId ?? executionBindings(task).find(item => item.botId === task.ownerBotId)?.sessionId
    const result = { id: noticeId, at: task.completedAt ?? Date.now(), botId: task.ownerBotId,
      name: rt.botOf(task.ownerBotId)?.name ?? task.title, targetId: task.roomId ?? task.ownerBotId,
      ...(task.roomId ? { roomId: task.roomId } : {}), sessionId, title: delivery.title ?? task.title,
      summary: delivery.summary, files, workTaskId: task.id, deliveryId: delivery.id }
    if (!(state.taskNotices ?? []).some(item => item.id === noticeId)) state.taskNotices = [...(state.taskNotices ?? []), result].slice(-100)
    if (room?.task?.workTaskId === task.id) {
      room.task.status = 'completed'
      room.task.completedAt = result.at
      room.task.completedSeq = room.seq ?? 0
      room.task.result = { ...result, cycle: room.task.cycle }
      delete room.task.pendingCompletion
      delete room.task.review
    }
    await rt.save()
    // Keep the searchable result index, but do not turn an AI-authored checkpoint
    // or a simple acceptance click into a new confirmed business rule.
    await rt.recordTaskExperiences?.([...new Set([task.ownerBotId, ...(task.participantBotIds ?? []), task.originBotId].filter(Boolean))]
      .map(botId => ({ ...result, botId, key: noticeId, objective: task.objective })))
    if (room?.task?.workTaskId === task.id && room.task.status === 'completed') void rt.flushTaskContexts?.().catch(error => rt.warn('ds-bot: accepted task context cleanup deferred: %s', error))
    if (!task.roomId && sessionId && rt.chatOf(task.ownerBotId) === sessionId) {
      const current = rt.workTaskForSession?.(sessionId)
      if (current && current.id !== task.id) throw refused('Another task is using this conversation. The accepted result is preserved; finish the current work before resetting its context.')
      if (await rt.privateContextBusy?.(sessionId) || !await rt.resetTaskSession?.(sessionId)) throw refused('Acceptance is saved, but its conversation context could not be reset. Retry task record sync when the employee is idle.')
    }
  }

  rt.workTaskFile = async ({ taskId, deliveryId, fileIndex }) => {
    const task = state.workTasks?.[taskId]
    const file = task?.deliveries?.find(item => item.id === deliveryId)?.files?.[fileIndex]
    if (!Number.isInteger(fileIndex) || fileIndex < 0 || !file) throw refused('The saved delivery file was not found.')
    const archiveHome = resolve(rt.home), declaredRoot = resolve(archiveHome, 'task-records', task.id)
    const escaped = (root, path) => { const rel = relative(root, path); return !rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') }
    if (escaped(resolve(archiveHome, 'task-records'), declaredRoot) || escaped(declaredRoot, resolve(file.path))) throw refused('This file is outside the task archive.')
    let current = resolve(file.path)
    for (;;) {
      if ((await lstat(current)).isSymbolicLink()) throw refused('Linked paths cannot be used as saved delivery files.')
      if (relative(archiveHome, current) === '') break
      const parent = dirname(current)
      if (parent === current) throw refused('This file is outside the task archive.')
      current = parent
    }
    const root = await realpath(declaredRoot)
    const path = await realpath(file.path)
    const rel = relative(root, path)
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw refused('This file is outside the task archive.')
    const details = await lstat(file.path)
    if (!details.isFile() || details.isSymbolicLink() || details.size > 20 * 1024 * 1024) throw refused('The saved delivery file is unavailable.')
    const data = await readFile(path)
    if (data.length !== file.size || createHash('sha256').update(data).digest('hex') !== file.sha256) throw refused('The saved delivery file has changed. Do not use it as the accepted version.')
    return { name: file.name, mime: 'application/octet-stream', base64: data.toString('base64') }
  }
}
