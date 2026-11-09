// Approvals. A member's group Session is hidden, so DSH's approval card never shows
// there and the turn would wait forever: DS Bot answers those requests itself, from
// the group chat. A Bot's own chat keeps DSH's card; its requests are only noted, so
// the team view can say who is waiting.
import { randomUUID } from 'node:crypto'

const OUTCOMES = { allow: 'allowed-once', reject: 'rejected' }

export function install(rt) {
  const { ctx } = rt
  /** @type {Map<string, {id:string, sessionId:string, botId:string, roomId?:string, tool:string, reason:string, detail:{text?:string, code?:string}, at:number, answer?:(outcome:string)=>void}>} */
  const pending = new Map()
  const requests = new Map()

  // Ahead of DSH's own answerer, which would hold a hidden Session's request unseen.
  function hold(request, next) {
    const sessionId = request.agent?.session?.id ?? request.agent?.id
    const owner = sessionId === undefined ? undefined : rt.groupOwners.get(sessionId)
    const botId = owner?.botId ?? (sessionId === undefined ? undefined : rt.chatOwners.get(sessionId))
    if (botId === undefined) return next()
    const id = randomUUID()
    const entry = {
      id,
      sessionId,
      botId,
      ...(owner ? { roomId: owner.roomId } : {}),
      tool: String(request.toolName ?? ''),
      reason: String(request.reason ?? '').slice(0, 500),
      detail: rt.callDetail?.(sessionId, request.callId) ?? {},
      at: Date.now(),
    }
    pending.set(id, entry)
    requests.set(id, request)
    rt.noteApproval?.(sessionId, { tool: entry.tool, reason: entry.reason.slice(0, 200) })
    const settled = () => {
      pending.delete(id)
      requests.delete(id)
      rt.noteApproval?.(sessionId, undefined)
    }
    if (owner === undefined) return Promise.resolve(next()).finally(settled)
    rt.yieldRoomTurn?.(sessionId)
    return new Promise((resolve) => {
      entry.answer = (outcome) => {
        if (!pending.has(id)) return
        settled()
        resolve(outcome)
      }
      if (request.signal?.aborted) entry.answer('cancelled')
      request.signal?.addEventListener('abort', () => entry.answer('cancelled'), { once: true })
    })
  }
  ctx.on('approval/request', (request, next) => {
    if (!rt.chiefPermissionView?.().policy.enabled) return hold(request, next)
    return Promise.resolve(rt.reviewChiefApproval(request)).catch(() => false)
      .then(allowed => allowed ? 'allowed-once' : hold(request, next))
  }, { prepend: true })

  const approvalsView = () => [...pending.values()].map(({ answer, ...entry }) => ({ ...entry, answerable: answer !== undefined }))
  const waitsForApproval = sessionId => [...pending.values()].some(entry => entry.sessionId === sessionId)

  function answerApproval(id, choice) {
    const entry = pending.get(String(id ?? ''))
    if (entry?.answer === undefined) throw Object.assign(new Error('This approval is no longer open'), { code: 'bot/stale' })
    const outcome = OUTCOMES[choice]
    if (outcome === undefined) throw Object.assign(new Error('Choose allow or reject'), { code: 'bot/invalid' })
    entry.answer(outcome)
  }

  async function reviewApprovalWithChief(id) {
    const entry = pending.get(id)
    if (!entry?.answer) throw Object.assign(new Error('This approval is no longer open'), { code: 'bot/stale' })
    const chief = Object.values(rt.state.bots).find(bot => bot.generalAssistant && !bot.retiredAt)
    await rt.grantTaskAccess(chief?.id, { botId: entry.botId, roomId: entry.roomId, objective: 'Resume the prospecting task requested by the user' })
    if (pending.get(id) !== entry) throw new Error('This approval is no longer open')
    if (!await rt.reviewChiefApproval(requests.get(id))) throw new Error('This operation is outside the prospecting preset. Review it and choose Allow once or Reject.')
    entry.answer('allowed-once')
  }

  async function resumeChiefApprovals(sessionId) {
    let resumed = 0
    for (const [id, entry] of pending) {
      if (entry.sessionId !== sessionId || !entry.answer) continue
      if (await rt.reviewChiefApproval(requests.get(id)) && pending.get(id) === entry) {
        entry.answer('allowed-once')
        resumed++
      }
    }
    return resumed
  }

  // A group Session that leaves its group has no card left to answer from.
  const cancelApprovals = (sessionId) => {
    for (const entry of pending.values()) {
      if (entry.sessionId === sessionId) entry.answer?.('cancelled')
    }
  }

  Object.assign(rt, { approvalsView, waitsForApproval, answerApproval, cancelApprovals, reviewApprovalWithChief, resumeChiefApprovals })
}
