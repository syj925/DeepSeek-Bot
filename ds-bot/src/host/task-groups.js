import { randomUUID } from 'node:crypto'

// Task rooms retain their conversations. Completing a round alone never archives one.
export function install(rt) {
  const { state } = rt
  rt.taskGroupBlocked = (room, exceptSession) => {
    if ((rt.roomInbox?.get(room.id)?.length ?? 0) > 0) return true
    const sessions = new Set([room.id, ...Object.values(room.sessions ?? {})])
    if ((rt.approvalsView?.() ?? []).some(item => sessions.has(item.sessionId))) return true
    if ([...sessions].some(id => state.questions?.[id])) return true
    if ((state.modelFailures ?? []).some(item => item.roomId === room.id)) return true
    if ([...(rt.roomProgress?.values() ?? [])].some(round => round.roomId === room.id && round.slots.some(slot => ['waiting', 'working', 'waiting-approval', 'failed', 'missed'].includes(slot.status)))) return true
    if ([...(rt.live ?? [])].some(([id, entry]) => id !== exceptSession && sessions.has(id) && id !== room.id && entry.turn !== undefined)) return true
    // Delegated private work must return before the coordinator can finish the group.
    const answered = new Set((state.exchanges ?? []).filter(item => item.role === 'reply').map(item => item.replyTo))
    return (state.exchanges ?? []).some(item => item.role === 'request' && item.fromRoomId === room.id && !answered.has(item.id))
  }
  rt.reopenTaskGroup = async room => {
    if (!room?.task || room.task.status !== 'completed') return
    if (rt.botOf(room.admin)?.retiredAt) {
      const successor = room.members.find(id => !rt.botOf(id)?.retiredAt && rt.isMain?.(id))
        ?? room.members.find(id => rt.botOf(id) && !rt.botOf(id).retiredAt)
        ?? (rt.botOf(room.task.originBotId) && !rt.botOf(room.task.originBotId).retiredAt ? room.task.originBotId : undefined)
      if (!successor) throw new Error('All employees in this completed task have retired. Add an active employee before continuing.')
      if (!room.members.includes(successor)) room.members.push(successor)
      room.admin = successor
    }
    room.task = { ...room.task, status: 'active', cycle: (room.task.cycle ?? 1) + 1, resumedAt: Date.now() }
    delete room.task.pendingCompletion
    delete room.task.reportFailed
    delete room.task.contextArchivedAt
    delete room.task.contextPolicy
    delete room.task.resetSessions
    delete room.task.retirementQueued
    await rt.save()
  }
  rt.recordTaskGroupCompletion = completion => {
    const room = rt.roomOf(completion.roomId)
    if (!room?.task || room.task.status === 'completed' || room.admin !== completion.botId) return
    room.task.pendingCompletion = { cycle: room.task.cycle, sessionId: completion.sessionId, title: completion.title, summary: completion.summary, files: completion.files, at: Date.now() }
  }
  rt.finishTaskGroupRound = async (room, round, aborted = false) => {
    if (!room.task) return
    const pending = room.task.pendingCompletion
    delete room.task.pendingCompletion
    const blocked = aborted || round.failed.length > 0 || round.slots.some(slot => ['waiting', 'speaking', 'working', 'waiting-answer', 'waiting-approval', 'failed', 'missed'].includes(slot.status))
      || round.replies.some(reply => ['failed', 'working', 'approval', 'missed', 'stopped', 'cut', 'resumed'].includes(reply.kind)) || rt.taskGroupBlocked(room)
    if (!pending || pending.cycle !== room.task.cycle || blocked) { await rt.save(); return }
    room.task = { ...room.task, status: 'completed', completedAt: Date.now(), completedSeq: room.seq ?? 0, result: pending }
    state.taskNotices = [...(state.taskNotices ?? []), { id: randomUUID(), at: Date.now(), botId: room.admin, name: rt.botOf(room.admin)?.name ?? room.name,
      targetId: room.id, roomId: room.id, sessionId: pending.sessionId ?? room.id, title: pending.title, summary: pending.summary, files: pending.files }].slice(-100)
    await rt.save()
    await rt.recordTaskExperiences?.(room.members.map(botId => ({
      botId, title: pending.title, summary: pending.summary, roomId: room.id, cycle: pending.cycle,
      sessionId: room.sessions?.[botId], files: pending.files,
      evidence: round.replies.filter(reply => reply.botId === botId && !reply.kind).map(reply => reply.text).join('\n'),
    })))
    // The group owns the full result. Keep a compact task index for its origin Bot;
    // do not send a second report turn through the General Assistant's conversation.
    await rt.recordTaskExperiences?.([{ botId: room.task.originBotId, title: pending.title,
      summary: pending.summary, files: pending.files, roomId: room.id, cycle: pending.cycle, objective: room.task.objective, at: Date.now() }])
    room.task.reportedCycle = pending.cycle
    await rt.save()
    void rt.flushTaskContexts?.().catch(error => rt.warn('ds-bot: task cleanup deferred: %s', error))
  }
}
