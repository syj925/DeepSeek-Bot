export const CHIEF_UNAVAILABLE = 'The General Assistant is also unavailable. Check the model settings or copy the error for support.'
export const CHIEF_DELAYED = 'The General Assistant has not finished after 90 seconds. Check its conversation and model connection; do not submit duplicate requests.'

export function conversationFailures(sessionId, roster) {
  const entity = roster.byId?.[sessionId] ?? roster.roomsById?.[sessionId]
  return (roster.modelFailures ?? []).filter(item =>
    (item.roomId ? item.roomId === sessionId : item.sessionId === sessionId || (entity?.id && item.botId === entity.id))
    || item.assistance?.sessionId === sessionId || (entity?.id && item.assistance?.botId === entity.id))
}

export function recoveryNotice(previous, failures) {
  const prior = new Map(previous.map(item => [item.id, item]))
  const unavailable = item => item.chief || ['failed', 'interrupted'].includes(item.assistance?.status)
  if (failures.some(item => unavailable(item) && (!prior.has(item.id) || !unavailable(prior.get(item.id))))) return CHIEF_UNAVAILABLE
  if (failures.some(item => item.assistance?.status === 'delayed' && prior.get(item.id)?.assistance?.status !== 'delayed')) return CHIEF_DELAYED
  return null
}
