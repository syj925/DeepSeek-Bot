import { randomUUID } from 'node:crypto'

const LIMIT = 50
const invalid = message => Object.assign(new Error(message), { code: 'bot/refused' })
const RETRY = 'The user requests one retry of the task interrupted by the model error in this conversation. Read the existing task and tool results first. Continue only unfinished work; do not repeat completed side effects. Keep the original scope and approvals. If the same error persists, stop and explain the next action. Do not start an automatic retry loop.'

// Recovery metadata contains codes and identities only, never prompts or provider bodies.
export function install(rt) {
  const { state } = rt
  const pending = new Map()
  const records = () => (Array.isArray(state.modelFailures) ? state.modelFailures : [])
    .filter(item => item && typeof item.id === 'string' && rt.botOf(item.botId)
      && (!item.roomId || rt.roomOf(item.roomId)?.members.includes(item.botId))).slice(-LIMIT)
  const persist = () => { void rt.save().catch(error => rt.warn('ds-bot: saving recovery state failed: %s', error)) }
  const busy = id => pending.has(id) || rt.live.get(id)?.turn !== undefined

  rt.recordModelFailure = (sessionId, failure) => {
    const owner = rt.groupOwners.get(sessionId)
    const botId = owner?.botId ?? rt.selfOf(sessionId)
    if (!rt.botOf(botId)) return
    const previous = records().find(item => item.sessionId === sessionId)
    const item = { id: randomUUID(), sessionId, botId, ...(owner ? { roomId: owner.roomId } : {}),
      code: /^[A-Z_]{1,50}$/.test(failure.code) ? failure.code : 'UNKNOWN',
      ...(Number.isInteger(failure.status) ? { status: failure.status } : {}),
      at: Date.now(), count: (previous?.count ?? 0) + 1 }
    state.modelFailures = [...records().filter(value => value.sessionId !== sessionId), item].slice(-LIMIT)
    persist()
  }
  rt.finishRecovery = (sessionId, reason, info) => {
    const job = pending.get(sessionId)
    if (job && (!info?.exchangeId || info.exchangeId === job.exchangeId)) pending.delete(sessionId)
    let changed = false
    state.modelFailures = records().filter(item => {
      if (item.sessionId === sessionId && reason?.kind === 'completed') { changed = true; return false }
      if (item.assistance?.sessionId === sessionId && item.assistance.exchangeId === info?.exchangeId) {
        item.assistance.status = reason?.kind === 'completed' ? 'replied' : 'failed'
        changed = true
      }
      return true
    })
    if (changed) persist()
  }
  rt.failuresView = () => records().map(item => ({ ...item,
    retrying: pending.get(item.sessionId)?.action === 'retry',
    busy: busy(item.sessionId), chief: rt.isGeneralAssistant(item.botId),
    ...(item.assistance ? { assistance: { ...item.assistance,
      status: item.assistance.status === 'sent'
        ? !pending.has(item.assistance.sessionId) ? 'interrupted' : Date.now() - (item.assistance.at ?? Date.now()) > 90000 ? 'delayed' : 'sent'
        : item.assistance.status } } : {}),
  }))

  rt.recoverFailure = async ({ id, action }) => {
    await rt.load()
    const failure = records().find(item => item.id === id)
    if (!failure) throw invalid('This error is no longer current. Check the latest conversation.')
    if (!['retry', 'diagnose'].includes(action)) throw invalid('Unknown recovery action.')
    const chief = action === 'diagnose' ? rt.botOf(state.generalAssistantId) : undefined
    if (action === 'diagnose' && (!chief || chief.id === failure.botId)) throw invalid('The General Assistant is unavailable. Check the model settings.')
    if (action === 'diagnose' && failure.assistance) return { botId: failure.assistance.botId, action: 'diagnose' }
    const botId = chief?.id ?? failure.botId
    const sessionId = chief ? rt.chatOf(chief.id) : failure.sessionId
    // Never dispatch into an old conversation part or a running group round.
    const currentSession = failure.roomId ? rt.roomOf(failure.roomId)?.sessions?.[failure.botId] : rt.chatOf(failure.botId)
    if (action === 'retry' && currentSession !== sessionId) throw invalid('This conversation has moved to a new part. Continue in its current conversation.')
    if (busy(sessionId) || action === 'retry' && failure.roomId && [...rt.roomProgress.values()].some(round => round.roomId === failure.roomId)) throw invalid('This conversation is still working. Wait for it to finish before retrying.')
    if (Date.now() - failure.at < 2000) throw invalid('Please wait a moment before retrying.')
    const exchangeId = randomUUID()
    pending.set(sessionId, { action, exchangeId })
    try {
      const agent = await rt.resolveAgent(sessionId)
      if (rt.live.get(sessionId)?.turn !== undefined || (agent.inbox?.nextTurn?.length ?? 0) + (agent.inbox?.nextStep?.length ?? 0) > 0) throw invalid('This conversation is still working. Wait for it to finish before retrying.')
      const text = chief
        ? `The user asks for read-only diagnosis of an employee's model error. Employee: ${rt.botOf(failure.botId).name} (${failure.botId}). Error code: ${failure.code}${failure.status ? `; HTTP status: ${failure.status}` : ''}. Consecutive failures: ${failure.count}. Configured model: ${rt.botOf(failure.botId).model ?? 'default'}. No task history or raw provider response is included. Explain likely causes, distinguish evidence from guesses, and give concrete next steps. Use available read-only information if useful. Do not change models, keys, permissions, files or team membership; do not retry or delegate the task. Authentication, quota and provider outages need user or provider action. If you cannot resolve it, explicitly tell the user which model setting or support contact to check. Reply in ${rt.uiLanguage?.() ?? 'the user\'s language'}.`
        : RETRY
      if (chief) failure.assistance = { botId, sessionId, exchangeId, status: 'sent', at: Date.now() }
      await rt.deliver({ toId: botId, sessionId, role: chief ? 'request' : 'retry', audience: 'user', exchangeId,
        ...(!chief && failure.roomId ? { roomId: failure.roomId } : {}), text })
      persist()
      return { botId, action }
    } catch (error) {
      pending.delete(sessionId)
      if (chief) { failure.assistance = { botId, sessionId, exchangeId, status: 'failed' }; persist() }
      throw error
    }
  }
}
