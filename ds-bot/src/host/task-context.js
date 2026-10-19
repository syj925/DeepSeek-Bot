import { defineTool } from '@deepseek-ai/dsh-tools'

// Records live outside model messages. Context switches retain searchable transcripts.
export function install(rt) {
  const { state, ctx } = rt
  rt.botEmployment = bot => bot?.employment === 'temporary' ? 'temporary' : 'long-term'
  rt.isTemporaryBot = id => rt.botEmployment(rt.botOf(id)) === 'temporary'
  const running = new Set()

  rt.taskSessionBusy = async id => {
    if (state.questions?.[id] || rt.live?.get(id)?.turn !== undefined) return true
    if ((rt.approvalsView?.() ?? []).some(item => item.sessionId === id)) return true
    const agent = await rt.resolveAgent(id)
    return agent.status !== 'idle' || (agent.inbox?.nextStep?.length ?? 0) + (agent.inbox?.nextTurn?.length ?? 0) > 0
  }
  const unanswered = predicate => {
    const answered = new Set((state.exchanges ?? []).filter(item => item.role === 'reply').map(item => item.replyTo))
    return (state.exchanges ?? []).some(item => item.role === 'request' && item.audience !== 'user' && !answered.has(item.id) && predicate(item))
  }
  rt.temporaryBotBusy = async id => {
    if (unanswered(item => item.from === id || item.to === id)) return true
    for (const room of Object.values(state.rooms)) {
      if (!room.members.includes(id)) continue
      if (!room.task || room.task.status !== 'completed' || rt.roomBusy?.(room.id)) return true
    }
    const sessions = [rt.chatOf(id), ...rt.groupSessionsOf(id)]
    for (const session of sessions) if (await rt.taskSessionBusy(session)) return true
    const schedules = await rt.scheduleEndpoint?.('schedules')
    return (schedules?.tasks ?? []).some(item => sessions.includes(item.sessionId))
  }

  rt.recordTaskExperiences = async entries => {
    let changed = false
    for (const entry of entries ?? []) {
      const bot = rt.botOf(entry.botId)
      if (!bot || bot.retiredAt) continue
      const key = entry.key ?? `${entry.kind === 'handoff' ? 'handoff:' : ''}${entry.roomId ?? entry.sessionId}:${entry.cycle ?? 1}`
      bot.taskIndex ??= []
      if (bot.taskIndex.some(item => item.key === key)) continue
      bot.taskIndex.push({ key, at: entry.at ?? Date.now(), title: String(entry.title ?? 'Completed task').slice(0, 120),
        summary: String(entry.summary ?? '').slice(0, 360), roomId: entry.roomId ?? null,
        sessionId: entry.sessionId ?? null, files: entry.files ?? [] })
      if (rt.memoryEnabled !== false && !rt.isTemporaryBot(bot.id) && entry.evidence) {
        bot.pendingTaskLessons ??= []
        bot.pendingTaskLessons.push({ key, title: entry.title, evidence: String(entry.evidence).slice(-10000), sessionId: entry.sessionId, attempts: 0 })
      }
      changed = true
    }
    if (changed) await rt.save()
  }

  rt.archiveCompletedTaskContext = async room => {
    if (room?.task?.status !== 'completed' || room.task.contextArchivedAt || running.has(room.id)) return
    running.add(room.id)
    try {
      if (rt.taskGroupBlocked?.(room)) return
      const task = room.task
      task.completedSeq ??= room.seq ?? 0
      task.resetSessions ??= { ...room.sessions }
      await rt.save()
      for (const [botId, sessionId] of Object.entries(task.resetSessions)) {
        if (room.task !== task || task.status !== 'completed') return
        if (room.sessions[botId] === sessionId) {
          if (await rt.taskSessionBusy(sessionId) || !await rt.resetTaskSession(sessionId)) return
        }
        room.seen ??= {}
        room.seen[botId] = Math.max(room.seen[botId] ?? 0, task.completedSeq)
        delete task.resetSessions[botId]
        await rt.save()
      }
      if (room.task !== task || task.status !== 'completed') return
      task.contextArchivedAt = Date.now()
      task.contextPolicy = 'task-scoped'
      await rt.save()
    } finally { running.delete(room.id) }
  }

  rt.archiveCompletedTaskSession = async (sessionId, completion) => {
    const bot = rt.botOf(rt.chatOwners.get(sessionId))
    if (!bot || completion?.kind === 'message' || !completion) return
    await rt.recordTaskExperiences([{ ...completion, botId: bot.id, sessionId, key: completion.id ?? (completion.kind === 'handoff' ? `handoff:${completion.roomId}:${completion.cycle}` : sessionId) }])
    if (completion.epoch !== undefined && rt.live.get(sessionId)?.taskEpoch !== completion.epoch) return
    bot.pendingTaskReset = { sessionId }
    if (rt.isTemporaryBot(bot.id) && completion.kind !== 'handoff') bot.retirePending = true
    await rt.save()
    await rt.flushTaskContexts()
  }

  let flushing = false
  let learning = false
  const learnPending = async () => {
    if (learning || !rt.learnCompletedTask) return
    learning = true
    try {
      for (const bot of Object.values(state.bots)) {
        if (bot.retiredAt || rt.isTemporaryBot(bot.id)) continue
        for (const record of bot.pendingTaskLessons ?? []) {
          if (record.attempts >= 3) continue
          record.attempts += 1
          await rt.save()
          try {
            await rt.learnCompletedTask(bot, record)
            bot.pendingTaskLessons = bot.pendingTaskLessons.filter(item => item !== record)
            await rt.save()
          } catch (error) { rt.warn('ds-bot: task lesson extraction deferred: %s', error) }
        }
      }
    } finally { learning = false }
  }
  rt.flushTaskContexts = async () => {
    if (flushing || rt.readOnly?.() !== undefined) return
    flushing = true
    try {
      const archived = [...Object.values(state.bots).flatMap(bot => bot.segments ?? []),
        ...Object.values(state.rooms).flatMap(room => Object.values(room.segments ?? {}).flat())]
      for (const segment of archived.filter(item => item.archivePending)) {
        try {
          await ctx.workspaceRegistry.archiveSession(segment.sessionId)
          delete segment.archivePending
          await rt.save()
        } catch (error) { rt.warn('ds-bot: transcript archive deferred: %s', error) }
      }
      for (const room of Object.values(state.rooms)) {
        try {
          await rt.archiveCompletedTaskContext(room)
          if (room.task?.status === 'completed' && room.task.contextArchivedAt && !room.task.retirementQueued) {
            for (const id of room.members) {
              if (rt.isTemporaryBot(id) && !rt.botOf(id)?.retiredAt) rt.botOf(id).retirePending = true
            }
            room.task.retirementQueued = true
            await rt.save()
          }
        } catch (error) { rt.warn('ds-bot: group context cleanup deferred: %s', error) }
      }
      for (const bot of Object.values(state.bots)) {
        if (bot.retiredAt) continue
        try {
          const pending = bot.pendingTaskReset
          if (pending && !unanswered(item => item.from === bot.id && !item.fromRoomId)) {
            if (rt.chatOf(bot.id) !== pending.sessionId || !await rt.taskSessionBusy(pending.sessionId) && await rt.resetTaskSession(pending.sessionId)) {
              delete bot.pendingTaskReset
              await rt.save()
            }
          }
          if (bot.retirePending) await rt.retireTemporaryBot(bot.id)
        } catch (error) { rt.warn('ds-bot: employee context cleanup deferred: %s', error) }
      }
    } finally {
      flushing = false
      void learnPending().catch(error => rt.warn('ds-bot: task memory write deferred: %s', error))
    }
  }

  ctx.tools.register(defineTool({
    name: 'read_task_history',
    description: 'Find your completed task summaries and output paths without loading old conversations. Use read_own_chat for the original private transcript and read_group_chat for group details.',
    parameters: { query: { type: 'string', description: 'Optional task title or keyword' }, before: { type: 'number', description: 'Return records older than this timestamp for pagination' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      await rt.load?.()
      const bot = rt.botOf(rt.selfOf(exec.agent?.id))
      if (!bot || bot.retiredAt) return 'Only active employees can read their task history.'
      const query = String(args.query ?? '').toLowerCase()
      const records = (bot.taskIndex ?? []).filter(item => (!args.before || item.at < args.before) && `${item.title} ${item.summary}`.toLowerCase().includes(query))
      return JSON.stringify(records.slice(-20).reverse())
    },
  }))
  ctx.effect(() => {
    const timer = setInterval(() => { void rt.load().then(() => rt.flushTaskContexts()).catch(error => rt.warn('ds-bot: task cleanup deferred: %s', error)) }, 15000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'ds-bot: task context cleanup')
}
