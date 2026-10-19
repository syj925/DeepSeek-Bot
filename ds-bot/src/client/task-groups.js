import { createElement as h, createContext, useContext, useState } from 'react'
import { t } from './i18n.js'
import { BotAvatar } from './mark.js'

export const TaskGroupNavigation = createContext(null)

export function tasksForConversation(sessionId, roster) {
  const bot = roster.byId[sessionId]
  return (roster.rooms ?? []).filter(room => room.task && room.task.originBotId === (bot?.id ?? sessionId))
}

export function TaskGroupCard({ room, roster, open }) {
  const navigate = useContext(TaskGroupNavigation) ?? open
  const [stay, setStay] = useState(false)
  const completed = room.task.status === 'completed'
  const progress = roster.taskProgress?.[room.id]
  return h('article', { className: 'bt-task-group-card', 'data-task-room': room.id },
    h('style', null, TASK_GROUP_CSS),
    h('div', { className: 'bt-task-group-heading' }, h('strong', null, room.name), h('span', null, t(completed ? 'Task completed' : 'Task collaboration'))),
    h('p', null, completed ? room.task.result?.summary : room.task.objective),
    completed && room.task.reportFailed ? h('p', { role: 'status' }, t('Result saved. The coordinator could not be reached; you can read it here.')) : null,
    h('div', { className: 'bt-task-group-members' }, room.members.map(id => {
      const bot = roster.byId[id] ?? roster.retiredById?.[id]
      const slot = progress?.slots?.findLast(slot => slot.id === id)
      const working = progress?.working?.some(item => item.botId === id)
      const waiting = Object.values(roster.questions ?? {}).some(question => question.roomId === room.id && question.botId === id)
      const status = completed ? 'Delivered' : waiting ? 'Waiting for your answer' : working || slot?.status === 'speaking' ? 'Working' : slot?.status === 'waiting-approval' ? 'Awaiting approval' : slot?.status === 'failed' ? 'Needs attention' : slot?.status === 'posted' ? 'Replied' : slot?.status === 'waiting' ? 'Waiting for turn' : 'Joined'
      return bot ? h('span', { key: id, title: [bot.name, bot.role].filter(Boolean).join(' · ') }, h(BotAvatar, { bot, size: 26 }), h('span', null, bot.name, h('small', null, t(status)))) : null
    })),
    h('div', { className: 'bt-task-group-actions' },
      h('button', { type: 'button', onClick: () => navigate(room.id) }, t(completed ? 'View result and continue' : 'Enter collaboration')),
      !completed ? h('button', { type: 'button', className: 'bt-task-group-stay', onClick: () => setStay(true) }, t(stay ? 'Updates will stay here' : 'Stay here for updates')) : null))
}

export function TaskGroupJourney({ sessionId, roster, actions, onOpenConversation }) {
  const open = onOpenConversation ?? actions.openSession
  const room = roster.roomsById[sessionId]
  const tasks = tasksForConversation(sessionId, roster)
  if (!room?.task && !tasks.length) return null
  const completed = tasks.filter(item => item.task.status === 'completed')
  return h('section', { className: 'bt-task-journey', 'aria-label': t('Task collaboration') },
    h('style', null, TASK_GROUP_CSS),
    room?.task ? h('div', { className: 'bt-task-group-status' },
      h('strong', null, room.name),
      h('span', null, t(room.task.status === 'completed' ? 'Archived · send a message to continue this task' : 'Members reply in turn · results stay in this group'))) : null,
    completed.length ? h('details', { className: 'bt-task-group-archive' }, h('summary', null, t('Completed tasks ({count})', { count: completed.length })),
      [...completed].reverse().map(item => h(TaskGroupCard, { key: item.id, room: item, roster, open }))) : null)
}

export const TASK_GROUP_CSS = `
.bt-task-journey{flex:none;max-height:38%;overflow:auto;padding:8px 14px;scrollbar-width:thin;color:#334155;font:12px/1.6 system-ui}
.bt-task-group-card{border:1px solid #dce9e7;background:linear-gradient(135deg,#f2faf8,#fff 70%);border-radius:14px;padding:12px 14px;margin:8px 0;animation:bt-task-enter .28s ease both;font:12px/1.6 system-ui;color:#334155}
.bt-task-group-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.bt-task-group-heading strong{font-size:13px}.bt-task-group-heading>span{color:#487c72;font-size:11px}.bt-task-group-card p{margin:6px 0;color:#64748b;overflow-wrap:anywhere}
.bt-task-group-members{display:flex;flex-wrap:wrap;gap:9px;margin:9px 0}.bt-task-group-members>span{display:flex;align-items:center;gap:5px}
.bt-task-group-members small{display:block;color:#72857e;font-size:10px}
.bt-task-group-actions{display:flex;flex-wrap:wrap;gap:8px}.bt-task-journey button,.bt-task-group-card button{border:0;border-radius:8px;padding:6px 10px;background:#177c6c;color:white;font:inherit;cursor:pointer}.bt-task-group-card button:hover{filter:brightness(1.06)}.bt-task-group-card .bt-task-group-stay{background:transparent;color:#64748b}
.bt-task-group-archive>summary{cursor:pointer;padding:6px 0;color:#64748b}.bt-task-group-archive[open]>summary{margin-bottom:6px}.bt-task-group-status{display:flex;flex-direction:column;gap:2px;align-items:flex-start}.bt-task-group-status>span{width:100%;color:#64748b;font-size:11px}
.bt-canvas-session:has(.bt-task-journey){animation:bt-task-enter .28s ease both}
@keyframes bt-task-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.bt-task-group-card,.bt-canvas-session:has(.bt-task-journey){animation:none}}
`
