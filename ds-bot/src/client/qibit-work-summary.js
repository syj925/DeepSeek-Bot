// Read existing task records. Never infer completion from an idle employee or
// invent dates, priorities, metrics or meeting decisions from a task title.
const categories = {
  data: /数据|分析|指标|报表|data|analy[sz]|metric|spreadsheet/i,
  meeting: /会议|纪要|例会|meeting|minutes/i,
  customer: /客户|跟进|销售|customer|client|sales/i,
}
const text = value => typeof value === 'string' ? value : ''
const stamp = value => typeof value === 'number' ? value : Date.parse(value) || 0

export function qibitWorkSummary(feature, roster = {}, work = {}, schedules = null) {
  const matches = value => feature === 'plan' || categories[feature]?.test(value)
  const rooms = (roster.rooms ?? []).filter(room => room.task && !room.hidden)
  const tasks = rooms.map(room => ({
    id: room.id, targetId: room.id, title: room.task.objective || room.name,
    done: room.task.status === 'completed', at: stamp(room.task.resumedAt ?? room.task.createdAt),
    summary: text(room.task.result?.summary),
    completedAt: stamp(room.task.completedAt),
  })).filter(task => matches(`${task.title} ${task.summary}`))
  const roomIds = new Set(rooms.map(room => room.id))
  for (const notice of roster.taskNotices ?? []) {
    if (notice.kind === 'message' || notice.roomId || roomIds.has(notice.targetId) || !notice.title) continue
    if (!matches(`${notice.title} ${notice.summary ?? ''}`)) continue
    tasks.push({ id: notice.id, targetId: notice.botId ?? notice.targetId, title: notice.title, summary: text(notice.summary), done: true, at: stamp(notice.at), completedAt: stamp(notice.at) })
  }
  tasks.sort((a, b) => Number(a.done) - Number(b.done) || b.at - a.at)
  const targetIds = new Set(tasks.map(task => task.targetId))
  const upcoming = schedules?.available ? (schedules.tasks ?? []).filter(task => task.status === 'active' && Number.isFinite(Date.parse(task.scheduledAt)) && matches(task.title ?? ''))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)) : []
  const approvals = (work.approvals ?? []).filter(item => feature === 'plan' || targetIds.has(item.roomId ?? item.sessionId))
  const failures = (roster.modelFailures ?? []).filter(item => feature === 'plan' || targetIds.has(item.roomId ?? item.botId))
  const running = feature === 'plan' ? Object.entries(work.bots ?? {}).filter(([, entry]) => !entry.roomId)
    .map(([id]) => ({ id, name: roster.byId?.[id]?.name ?? id })) : []
  return { tasks, upcoming, approvals, failures, running, completed: tasks.filter(task => task.done).length,
    results: tasks.filter(task => task.done && task.summary).sort((a, b) => b.completedAt - a.completedAt) }
}
