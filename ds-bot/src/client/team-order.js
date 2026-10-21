import { currentPart } from './text.js'

const time = value => Number.isFinite(value) ? value : 0

// Only visible chat turns count: private delegation and group-worker sessions
// must not promote an employee's unrelated personal conversation.
export function conversationTimes(list, roster, previous = {}) {
  const stamps = {}
  for (const id of list.ids ?? []) {
    const row = list.byId[id]
    const outline = list.projectionsBySession?.[id]?.values?.turnOutline ?? row?.projectionValues?.turnOutline
    const hidden = roster.exchangeTurns?.[id] ?? []
    // Turn outlines contain previews and sequence numbers, not timestamps.
    // Preserve the last public activity while internal exchange turns run.
    const last = Array.isArray(outline) ? outline.at(-1) : undefined
    stamps[id] = last && hidden.includes(last.turn) ? (previous[id] ?? 0) : time(row?.updatedAt)
  }
  return stamps
}

export function teamConversationOrder(roster, stamps, unread = {}, completions = {}) {
  const notices = {}
  for (const item of roster.taskNotices ?? []) {
    const id = item.roomId ?? item.targetId
    if (id) notices[id] = Math.max(notices[id] ?? 0, time(item.at))
  }
  const entries = [
    ...roster.bots.filter(bot => bot.id !== roster.mainBotId).map(item => ({ kind: 'bot', item, sessions: [currentPart(item), ...(item.parts ?? [])] })),
    ...roster.rooms.filter(room => room.task?.status !== 'completed' || unread[room.id] || completions[room.id]).map(item => ({ kind: 'room', item, sessions: [item.id] })),
    ...(roster.agents ?? []).map(item => ({ kind: 'agent', item, sessions: item.sessions ?? [] })),
  ]
  return entries.map(entry => ({ ...entry,
    at: Math.max(time(entry.item.createdAt), notices[entry.item.id] ?? 0, ...entry.sessions.map(id => stamps[id] ?? 0)),
    unread: Boolean(unread[entry.item.id] || entry.sessions.some(id => completions[id])),
  })).sort((a, b) => Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned))
    || Number(b.unread) - Number(a.unread) || b.at - a.at)
}
