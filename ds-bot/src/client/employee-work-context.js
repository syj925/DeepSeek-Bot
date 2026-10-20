import { createElement as h } from 'react'
import { dateLocale, t } from './i18n.js'
import { currentPart, relativeShort } from './text.js'

const stamp = value => Number.isFinite(value) && value > 0 ? value : undefined
const filesOf = record => (record.files ?? []).filter(file => typeof file?.path === 'string' && file.path)

// The durable task index is authoritative; ordinary replies are labelled separately.
export function employeeGroupWork(sessionId, roster, limit = 6) {
  if (roster.roomsById?.[sessionId]) return []
  const bot = roster.byId?.[sessionId] ?? (roster.bots ?? []).find(bot => currentPart(bot) === sessionId || bot.parts?.includes(sessionId))
  if (!bot) return []
  const rooms = roster.roomsById ?? Object.fromEntries((roster.rooms ?? []).map(room => [room.id, room]))
  const records = []
  const add = (record, completed) => {
    if (!record.roomId || !(record.title || record.summary || filesOf(record).length)) return
    const room = rooms[record.roomId]
    const files = filesOf(record)
    if (record.key && records.some(item => item.key === record.key)) return
    // Notices lack cycle keys; match their saved result without merging task cycles.
    if (!record.key && completed && records.some(item => item.completed && item.roomId === record.roomId
      && item.title === (record.title ?? '') && item.summary === (record.summary ?? '')
      && Math.abs((item.at ?? 0) - (record.at ?? 0)) < 60000
      && item.files.map(file => file.path).join('\n') === files.map(file => file.path).join('\n'))) return
    records.push({ ...record, id: record.id ?? record.key ?? `${record.roomId}:${record.at ?? records.length}`,
      title: record.title ?? '', summary: record.summary ?? '', at: stamp(record.at), files, completed,
      targetId: record.roomId, sessionId: record.sessionId ?? record.roomId,
      roomName: room?.name, available: Boolean(room) })
  }
  for (const record of [...(bot.taskIndex ?? [])].reverse()) {
    if (!String(record.key ?? '').startsWith('handoff:')) add(record, true)
  }
  for (const room of roster.rooms ?? []) {
    if (room.task?.status !== 'completed' || !room.task.result || !(room.members?.includes(bot.id) || room.task.originBotId === bot.id)) continue
    add({ ...room.task.result, key: `${room.id}:${room.task.cycle ?? 1}`, roomId: room.id,
      sessionId: room.task.result.sessionId ?? room.id, at: room.task.completedAt ?? room.task.result.at }, true)
  }
  for (const notice of [...(roster.taskNotices ?? [])].reverse()) {
    if (notice.botId !== bot.id || !notice.roomId) continue
    add(notice, notice.kind !== 'message')
  }
  return records.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, limit)
}

export function EmployeeWorkContext({ sessionId, roster, actions, onOpenConversation, expanded = false }) {
  const records = employeeGroupWork(sessionId, roster)
  if (!records.length) return null
  const latest = records[0]
  const open = onOpenConversation ?? actions.openSession
  return h('details', { key: sessionId, className: 'bt-employee-work', open: expanded || undefined, 'aria-label': t('Employee work updates') },
    h('style', null, EMPLOYEE_WORK_CONTEXT_CSS),
    h('summary', null, h('span', { className: 'bt-employee-work-mark', 'aria-hidden': true }, '↗'),
      h('span', { className: 'bt-employee-work-latest' }, h('strong', null, t('Recent group work')), h('span', null, latest.completed ? latest.title : latest.roomName ?? t('Group chat'))),
      latest.at ? h('time', { dateTime: new Date(latest.at).toISOString(), title: new Date(latest.at).toLocaleString(dateLocale()) }, relativeShort(latest.at)) : null),
    h('p', { className: 'bt-employee-work-note' }, t('Group and private chats keep separate histories. Open the original group for the full discussion.')),
    h('div', { className: 'bt-employee-work-list' }, records.map(record => h('article', { key: record.id, 'data-work-room': record.roomId },
      h('div', { className: 'bt-employee-work-meta' }, h('strong', null, record.roomName ?? t('Group history unavailable')), h('span', null, t(record.completed ? 'Group task delivered' : 'Replied in group'))),
      record.completed && record.title ? h('div', { className: 'bt-employee-work-title' }, record.title) : null,
      record.summary ? h('p', null, record.summary) : null,
      record.at ? h('time', { dateTime: new Date(record.at).toISOString() }, new Date(record.at).toLocaleString(dateLocale())) : null,
      record.available ? h('div', { className: 'bt-employee-work-actions' },
        h('button', { type: 'button', onClick: () => open(record.roomId) }, t('Open original group')),
        typeof actions.openTaskResult === 'function' ? record.files.map(file => h('button', { key: file.path, type: 'button', title: file.path, onClick: () => actions.openTaskResult(record, file) }, '↗ ', file.name || file.path.split(/[\\/]/).at(-1))) : null)
        : h('small', null, t('The original group is no longer available.'))))))
}

export const EMPLOYEE_WORK_CONTEXT_CSS = `
.bt-employee-work{flex:none;min-height:0;max-height:32%;overflow:auto;scrollbar-width:thin;margin:7px 14px 3px;border:1px solid var(--bt-line-2,rgba(100,116,139,.16));border-radius:12px;background:var(--bt-hover,rgba(255,255,255,.32));color:var(--bt-ink,#334155);font:12px/1.5 system-ui;overscroll-behavior:contain}
.bt-employee-work>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;padding:8px 10px;min-width:0}.bt-employee-work>summary::-webkit-details-marker{display:none}.bt-employee-work>summary:after{content:'⌄';color:var(--bt-ink-2,#64748b);flex:none}.bt-employee-work[open]>summary:after{transform:rotate(180deg)}
.bt-employee-work-mark{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#26745e14;color:#26745e;flex:none}.bt-employee-work-latest{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0}.bt-employee-work-latest strong{font-size:11px;font-weight:500;color:var(--bt-ink-2,#64748b);flex:none}.bt-employee-work-latest>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bt-employee-work time{font-size:10px;color:var(--bt-ink-2,#64748b);flex:none}
.bt-employee-work-note{padding:0 10px 8px;margin:0;color:var(--bt-ink-2,#64748b);font-size:11px}.bt-employee-work-list{padding:0 10px 8px}.bt-employee-work-list article{padding:9px 0;border-top:1px solid var(--bt-line-2,rgba(100,116,139,.13))}.bt-employee-work-meta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.bt-employee-work-meta strong{font-weight:500}.bt-employee-work-meta>span{font-size:10px;color:#26745e}.bt-employee-work-title{margin-top:4px;font-weight:500}.bt-employee-work-list p{margin:4px 0;color:var(--bt-ink-2,#64748b);overflow-wrap:anywhere}.bt-employee-work-list small{display:block;margin-top:5px;color:var(--bt-ink-2,#64748b)}
.bt-employee-work-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.bt-employee-work-actions button{border:1px solid var(--bt-line-2,rgba(100,116,139,.16));border-radius:7px;background:var(--bt-card,rgba(255,255,255,.7));color:inherit;padding:4px 8px;font:11px/1.5 system-ui;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-employee-work-actions button:hover{background:var(--bt-hover,#f1f5f9)}
`
