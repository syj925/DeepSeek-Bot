import { createHash, randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { textOf } from './text.js'

// Only explicit intent is automatic. A topic change alone is not permission to
// discard working context; ambiguous input waits outside the model conversation.
export function taskInputIntent(text) {
  const value = String(text ?? '').trim()
  if (/^(?:(?:请|帮我|我们|现在|接下来)[，,\s]*)*(?:开始(?:一个|一项|新的)?新任务|开启新任务|新任务|另开(?:一个|一项)?任务|换个任务|换一件事|这是(?:一个|一项)?新任务)(?:[：:,，。.!！\s]|$)/u.test(value)
    || /^(?:please\s+)?(?:start\s+(?:a\s+)?new\s+task|new\s+task|switch\s+(?:to\s+)?(?:a\s+)?new\s+task)(?:[:,.!\s]|$)/i.test(value)) return 'new'
  if (/^(?:请[，,\s]*)?(?:这(?:个|份)(?:文件|报告|表格|结果)|刚才(?:的|那)|上面(?:的|这)|把(?:刚才|上面|这份|这个结果))/u.test(value)) return 'continue'
  if (/^(?:继续(?:当前任务|这个任务|刚才的任务)?|接着(?:做|处理|刚才)?|重试(?:一下)?|再试一次|补充(?:一下|说明)?|修改(?:一下|刚才的结果)?|把(?:刚才|上面|这份|这个结果)|刚才|上面的)(?:[：:,，。.!！\s]|$)/u.test(value)
    || /^(?:continue(?:\s+(?:this|the current)\s+task)?|retry|revise\s+(?:this|the last)\s+(?:result|answer)|add\s+to\s+(?:this|the current)\s+task)(?:[:,.!\s]|$)/i.test(value)) return 'continue'
  return 'ask'
}

const contentOf = messages => messages.flatMap((message, index) => [...(index ? [{ type: 'text', text: '\n\n' }] : []), ...message.content])
const fingerprint = content => createHash('sha256').update(JSON.stringify(content)).digest('hex')
const refused = message => Object.assign(new Error(message), { code: 'bot/refused' })

export function install(rt) {
  const { state, ctx } = rt
  const resolving = new Set()
  rt.initializeTaskInputs = () => {
    if (rt.readOnly?.() !== undefined) return false
    let changed = false
    for (const pending of Object.values(state.taskInputs ?? {})) {
      if (!pending.approvedHash) continue
      delete pending.approvedHash
      pending.id = randomUUID()
      changed = true
    }
    return changed
  }
  rt.taskInputsView = () => Object.fromEntries(Object.entries(state.taskInputs ?? {}).map(([botId, pending]) => [botId, {
    id: pending.id, botId, sessionId: pending.sessionId, title: pending.title,
    text: textOf(contentOf(pending.messages)).slice(0, 1200),
    attachments: contentOf(pending.messages).filter(block => block.type !== 'text').length,
    sending: Boolean(pending.approvedHash), newContext: pending.newContext === true,
  }]))

  rt.inspectTaskInput = async (sessionId, messages, { forceAsk = false } = {}) => {
    const botId = rt.chatOwners.get(sessionId)
    if (!botId || rt.isTemporaryBot(botId)) return 'continue'
    const userMessages = messages.filter(message => message.source?.kind === 'user')
    if (!userMessages.length) return 'continue'
    const pending = state.taskInputs?.[botId]
    if (pending?.approvedHash === fingerprint(contentOf(userMessages))) {
      delete state.taskInputs[botId]
      delete rt.botOf(botId).taskInputFreshSession
      try { await rt.save() } catch (error) { state.taskInputs[botId] = pending; throw error }
      return 'continue'
    }
    if (!forceAsk && !pending && rt.botOf(botId).taskInputFreshSession === sessionId) {
      delete rt.botOf(botId).taskInputFreshSession
      await rt.save()
      return 'continue'
    }
    if (messages.length !== userMessages.length) return 'continue'
    const task = rt.workTaskForSession?.(sessionId)
    const intent = taskInputIntent(textOf(contentOf(messages)))
    if (!forceAsk && !pending && intent === 'new') return 'new'
    if (!forceAsk && !pending && (!task || intent === 'continue')) return 'continue'
    // Actual permission/question replies keep their established route.
    if (state.questions?.[sessionId]) return 'continue'
    const saved = { id: randomUUID(), botId, sessionId, taskId: task?.id ?? pending?.taskId,
      title: task?.title ?? task?.objective ?? pending?.title ?? '',
      messages: [...(pending?.messages ?? []), ...messages.filter(message => !pending?.messages.some(item => item.id === message.id))].map(message => ({ id: message.id, content: message.content })),
      ...(pending?.newContext || rt.botOf(botId).taskInputFreshSession === sessionId ? { newContext: true } : {}) }
    state.taskInputs ??= {}
    state.taskInputs[botId] = saved
    try { await rt.save() } catch (error) {
      if (pending) state.taskInputs[botId] = pending
      else delete state.taskInputs[botId]
      throw error
    }
    return 'ask'
  }

  rt.resolveTaskInput = async ({ botId, requestId, decision }) => {
    await rt.load()
    if (rt.readOnly?.() !== undefined) throw refused('This host is read-only.')
    const pending = state.taskInputs?.[botId]
    if (!pending || pending.id !== requestId || resolving.has(botId)) throw refused('This task choice changed. Refresh and choose again.')
    if (!['new', 'continue'].includes(decision)) throw refused('Choose whether to continue this task or start a new one.')
    if (pending.approvedHash) throw refused('This message is already being sent. Please wait.')
    const current = rt.chatOf(botId)
    if (current !== pending.sessionId) throw refused('This conversation changed. Your unsent message is preserved.')
    resolving.add(botId)
    try {
      if (await rt.privateContextBusy(current, { ignoreInputId: requestId })) throw refused('Finish or stop the current work and resolve pending questions, approvals and employee replies before starting a new task.')
      if (state.taskInputs[botId] !== pending || rt.chatOf(botId) !== current) throw refused('This task choice changed. Refresh and choose again.')
      if (decision === 'new' && !pending.newContext) {
        if (!await rt.resetTaskSession(current, { newTask: true, ignoreInputId: requestId })) throw refused('The new task context could not be created. Your history and experience are preserved; try again.')
        pending.newContext = true
        pending.sessionId = rt.chatOf(botId)
      }
      const content = contentOf(pending.messages)
      pending.approvedHash = fingerprint(content)
      await rt.save()
      await rt.ensureCapabilities(pending.sessionId)
      if (state.taskInputs[botId] !== pending) throw refused('This task choice changed. Refresh and choose again.')
      const agent = await rt.resolveAgent(pending.sessionId)
      agent.followup(createUserMessage({ content, source: { kind: 'user' } }))
      await ctx.sessions.flush(agent.session)
      return { sessionId: pending.sessionId }
    } catch (error) {
      if (state.taskInputs?.[botId] === pending) {
        delete pending.approvedHash
        await rt.save().catch(() => {})
      }
      throw error
    } finally { resolving.delete(botId) }
  }
}
