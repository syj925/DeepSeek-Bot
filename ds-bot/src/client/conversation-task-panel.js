import { createElement as h, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ConversationResult, conversationResults, tasksForConversation, TASK_GROUP_CSS } from './task-groups.js'
import { CloseIcon } from './icons.js'
import { dayLabel } from './text.js'
import { t } from './i18n.js'
import { taskPanelReads } from './task-panel-reads.js'
import { ModelRecovery, MODEL_RECOVERY_CSS } from './model-recovery.js'
import { conversationFailures } from './recovery-state.js'
import { currentPart } from './text.js'
import { EmployeeWorkContext, employeeGroupWork } from './employee-work-context.js'

const pathKey = path => {
  const value = String(path ?? '').replace(/\\/g, '/')
  return /^[a-z]:\//i.test(value) ? value.toLowerCase() : value
}
export const fileRevision = ({ file, item }) => `${pathKey(file.path)}:${Number.isFinite(file.modifiedAt) ? file.modifiedAt : item.at ?? 0}:${file.size ?? ''}`

// Preserve completion records and merge in explicitly shared, verified files.
export function conversationFiles(results, discovered = []) {
  const identity = (sessionId, path) => /^(?:[a-z]:[\\/]|\/)/i.test(path) ? pathKey(path) : `${sessionId ?? ''}:${pathKey(path)}`
  const seen = new Map(), files = []
  for (const item of results) for (const file of item.files ?? []) {
    if (!file?.path) continue
    const id = identity(item.sessionId ?? item.targetId, file.path)
    if (seen.has(id)) continue
    seen.set(id, files.length); files.push({ key: id, item, file })
  }
  for (const file of discovered) {
    if (!file?.path) continue
    const id = identity(file.sessionId ?? file.targetId, file.path)
    const index = seen.get(id)
    const item = { id: file.id, targetId: file.targetId, sessionId: file.sessionId, roomId: file.roomId, title: file.title, at: file.at }
    const value = { key: file.id ?? id, item, file }
    if (index !== undefined) files[index] = value
    else { seen.set(id, files.length); files.push(value) }
  }
  return files.sort((a, b) => (b.item.at ?? 0) - (a.item.at ?? 0))
}

function conversationBot(sessionId, roster) {
  return roster.byId[sessionId] ?? roster.bots?.find(bot => currentPart(bot) === sessionId)
}

export function panelOwner(sessionId, roster) {
  const room = roster.roomsById[sessionId]
  const bot = conversationBot(sessionId, roster)
  return { owner: room?.id ?? bot?.id ?? sessionId, workspace: roster.workspaceId ?? '' }
}

export function informationRevisions(sessionId, roster, files) {
  const room = roster.roomsById[sessionId]
  const tasks = (room ? [room] : tasksForConversation(sessionId, roster)).filter(item => item.task && item.task.status !== 'completed')
  return [...new Set([
    ...files.filter(entry => entry.file.available !== false).map(fileRevision),
    ...employeeGroupWork(sessionId, roster).map(item => `work:${item.id}:${item.at ?? 0}`),
    ...conversationResults(sessionId, roster).map(item => `result:${item.id}:${item.at ?? 0}`),
    ...tasks.map(item => `task:${item.id}:${item.task.cycle ?? 0}:${item.task.objective ?? ''}`),
    ...conversationFailures(sessionId, roster).map(item => `error:${item.id}:${item.at}:${item.assistance?.status ?? ''}`),
    ...(conversationBot(sessionId, roster)?.contextResetError ? [`context:${sessionId}:${conversationBot(sessionId, roster).contextResetError}`] : []),
  ])]
}

export function TaskPanelContent({ sessionId, roster, actions, open, discovered = [], loading = false, failed = false, retry }) {
  const room = roster.roomsById[sessionId]
  const entity = room ?? conversationBot(sessionId, roster)
  const failures = conversationFailures(sessionId, roster)
  const results = conversationResults(sessionId, roster)
  const files = conversationFiles(results, discovered)
  const tasks = (room ? [room] : tasksForConversation(sessionId, roster)).filter(item => item.task && item.task.status !== 'completed')
  return h('div', { className: 'bt-task-panel-content' },
    failures.length || entity?.contextResetError ? h('section', { className: 'bt-task-panel-errors' },
      h('h3', null, t('Errors and recovery')),
      h(ModelRecovery, { sessionId, roster, actions, onOpenConversation: open, embedded: true }),
      entity?.contextResetError ? h('p', { role: 'alert' }, t('Context could not be cleared. Your history is safe; try /clear again.')) : null) : null,
    h('section', null, h('h3', null, t('Current tasks')),
      tasks.length ? tasks.map(item => h('button', { key: item.id, type: 'button', className: 'bt-task-panel-task',
        onClick: () => item.id === sessionId ? actions.showExecution(item.id) : open(item.id) },
      h('strong', null, item.name), h('span', null, item.task.objective)))
        : h('p', { className: 'bt-task-panel-empty' }, t('No active task groups in this conversation'))),
    h('section', null, h('h3', null, t('Output files'), files.length ? h('span', null, files.length) : null),
      loading && !files.length ? h('p', { className: 'bt-task-panel-empty', role: 'status' }, t('Checking shared files…'))
        : files.length ? files.map(({ key, item, file }) => file.available === false
          ? h('div', { key, className: 'bt-task-panel-file bt-task-panel-file--missing', title: file.path, role: 'status' },
            h('span', null, h('strong', null, file.name ?? file.path), h('small', null, t('File not found: {name}', { name: file.path }))))
          : h('button', { key, type: 'button', className: 'bt-task-panel-file', title: file.path,
            onClick: () => actions.openTaskResult(item, file) },
          h('svg', { width: 24, height: 28, viewBox: '0 0 24 28', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true },
            h('path', { d: 'M5 2h9l5 5v19H5zM14 2v6h5M8 14h8M8 18h8' })),
          h('span', null, h('strong', null, file.name ?? file.path), h('small', null, item.title)), h('span', { className: 'bt-task-panel-file-open' }, t('Open file'))))
        : h('p', { className: 'bt-task-panel-empty' }, failed ? t('Could not check shared files') : t('No output files recorded yet')),
      failed || files.some(entry => entry.file.available === false) ? h('button', { type: 'button', className: 'bt-task-panel-retry', onClick: retry }, t('Retry file check')) : null),
    employeeGroupWork(sessionId, roster).length ? h('section', { className: 'bt-task-panel-work' }, h(EmployeeWorkContext, { sessionId, roster, actions, onOpenConversation: open, expanded: true })) : null,
    h('section', { className: 'bt-task-panel-results' }, h('h3', null, t('Recently completed tasks')),
      results.length ? results.map(item => h(ConversationResult, { key: item.id, item: { ...item, files: [] }, sessionId, actions, open }))
        : h('p', { className: 'bt-task-panel-empty' }, t('No completed tasks in this conversation'))))
}

export function ConversationTaskPanel({ sessionId, roster, actions, onOpenConversation }) {
  const [opened, setOpened] = useState(false)
  const [data, setData] = useState({ sessionId, files: [], loading: true, failed: false })
  const [retry, setRetry] = useState(0)
  const root = useRef(null), trigger = useRef(null), panel = useRef(null)
  const id = useId()
  useSyncExternalStore(taskPanelReads.subscribe, taskPanelReads.getSnapshot, taskPanelReads.getSnapshot)
  const results = conversationResults(sessionId, roster)
  const { owner, workspace } = panelOwner(sessionId, roster)
  const discovered = data.sessionId === sessionId ? data.files : []
  const files = conversationFiles(results, discovered)
  const revisions = informationRevisions(sessionId, roster, files)
  const revisionKey = JSON.stringify(revisions)
  const unread = revisions.filter(revision => !taskPanelReads.isRead(workspace, owner, revision)).length
  const errors = conversationFailures(sessionId, roster).filter(item => !item.busy && !item.retrying)
  const newest = results[0] ?? discovered.reduce((latest, file) => !latest || file.at > latest.at ? file : latest, null)

  const close = (focus = false) => { setOpened(false); if (focus) trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    let stopped = false, timer
    const refresh = async () => {
      try {
        if (typeof actions.conversationFiles !== 'function') throw new Error('Files unavailable')
        const response = await actions.conversationFiles(sessionId, { force: opened })
        if (!stopped) setData({ sessionId, files: Array.isArray(response?.files) ? response.files : [], loading: false, failed: Boolean(response?.partial) })
      } catch {
        if (!stopped) setData(value => ({ sessionId, files: value.sessionId === sessionId ? value.files : [], loading: false, failed: true }))
      }
      if (!stopped) timer = setTimeout(refresh, opened ? 10000 : 30000)
    }
    // Coalesce roster updates; never let a late response replace another conversation.
    timer = setTimeout(refresh, opened ? 0 : 250)
    return () => { stopped = true; clearTimeout(timer) }
  }, [sessionId, opened, roster.revision, retry, actions.conversationFiles])
  useEffect(() => { if (opened) taskPanelReads.markRead(workspace, owner, JSON.parse(revisionKey)) }, [opened, workspace, owner, revisionKey])
  useEffect(() => {
    if (!opened) return undefined
    panel.current?.focus({ preventScroll: true })
    const outside = event => { if (!root.current?.contains(event.target)) close() }
    const escape = event => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
      event.preventDefault(); event.stopPropagation(); close(true)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true) }
  }, [opened])
  useEffect(() => setOpened(false), [sessionId])
  const open = target => { close(); (onOpenConversation ?? actions.openSession)(target) }
  const reveal = () => { setOpened(true); taskPanelReads.markRead(workspace, owner, revisions) }
  return h('div', { ref: root, className: 'bt-task-panel-anchor', 'data-no-chat-drag': true },
    h('style', null, TASK_GROUP_CSS + MODEL_RECOVERY_CSS + TASK_PANEL_CSS),
    h('button', { ref: trigger, type: 'button', className: 'bt-team-chat-btn bt-team-chat-btn--icon bt-task-panel-toggle',
      title: unread ? t('New updates ({count})', { count: unread }) : t('Conversation information'), 'aria-label': t('Conversation information'), 'aria-expanded': opened, 'aria-controls': id, 'aria-haspopup': 'dialog', 'data-needs-attention': errors.length > 0 || undefined,
      onClick: () => opened ? close(true) : reveal() },
    h('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
      h('path', { d: 'M4 4h2v2H4zM9 5h7M4 9h2v2H4zM9 10h7M4 14h2v2H4zM9 15h7' })),
    !opened && unread ? h('span', { className: 'bt-task-panel-count', 'aria-hidden': true }, unread > 9 ? '9+' : unread) : null),
    opened ? h('aside', { ref: panel, id, className: 'bt-task-panel', role: 'dialog', tabIndex: -1, 'aria-label': t('Conversation information') },
      h('header', null, h('div', null, h('strong', null, t('Conversation information')),
        h('small', null, newest ? `${t('Updated')} · ${dayLabel(newest.at)}` : t('Only this conversation'))),
      h('button', { type: 'button', 'aria-label': t('Close task panel'), onClick: () => close(true) }, h(CloseIcon))),
      h(TaskPanelContent, { sessionId, roster, actions, open, discovered, loading: data.sessionId !== sessionId || data.loading, failed: data.sessionId === sessionId && data.failed, retry: () => setRetry(value => value + 1) })) : null)
}

export const TASK_PANEL_CSS = `
.bt-task-panel-anchor{display:inline-flex}
.bt-task-panel-toggle{position:relative}
.bt-task-panel-toggle[data-needs-attention=true]{color:#b45309!important}
.bt-task-panel-toggle[data-needs-attention=true] .bt-task-panel-count{background:#b45309}
.bt-task-panel-toggle[aria-expanded=true]{background:#e5f3ee!important;color:#187761!important}
.bt-task-panel-count{position:absolute;right:-5px;top:-5px;min-width:14px;height:14px;padding:0 2px;box-sizing:border-box;border-radius:7px;background:#187761;color:white;font:9px/14px system-ui;text-align:center}
.bt-task-panel{position:absolute;right:12px;top:78px;width:352px;max-width:calc(100% - 24px);max-height:calc(100% - 90px);display:flex;flex-direction:column;z-index:30;box-sizing:border-box;border:1px solid #e4e9ef;border-radius:16px;background:#fbfcfe;color:#334155;box-shadow:0 8px 30px #0f172a20;outline:none;touch-action:auto;cursor:auto;user-select:text;font:12px/1.6 var(--bt-font-sans,system-ui);animation:bt-task-panel-in .16s ease-out}
.bt-task-panel>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:14px 16px;border-bottom:1px solid #e8edf2}
.bt-task-panel>header strong{font-size:14px;color:#1e293b}.bt-task-panel>header small{display:block;color:#64748b;font-size:11px;margin-top:2px}
.bt-task-panel>header button{display:grid;place-items:center;border:0;border-radius:7px;width:26px;height:26px;background:transparent;color:#64748b;cursor:pointer}
.bt-task-panel>header button:hover{background:#edf1f5}
.bt-task-panel-content{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:0 16px 12px}
.bt-task-panel .bt-model-recovery{padding:0;max-height:none;overflow:visible}.bt-task-panel .bt-recovery-card{margin-bottom:8px}.bt-task-panel-errors{overflow-wrap:anywhere}
.bt-task-panel .bt-employee-work{max-height:none;overflow:visible;margin:0;border:0;background:transparent}.bt-task-panel .bt-employee-work>summary{padding:0}.bt-task-panel .bt-employee-work-note{padding:8px 0}.bt-task-panel .bt-employee-work-list{padding:0}
.bt-task-panel-content>section{padding:12px 0;border-bottom:1px solid #e8edf2}.bt-task-panel-content>section:last-child{border:0;padding-bottom:0}
.bt-task-panel-content h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;font-size:12px;font-weight:600;color:#334155}.bt-task-panel-content h3>span{color:#64748b;font-weight:400}
.bt-task-panel-empty{margin:0;color:#94a3b8;font-size:12px}
.bt-task-panel-task,.bt-task-panel-file{display:flex;align-items:center;gap:10px;width:100%;padding:9px 8px;box-sizing:border-box;border:0;border-radius:8px;background:transparent;text-align:start;font:inherit;color:inherit;cursor:pointer}
.bt-task-panel-task:hover,.bt-task-panel-file:hover{background:#edf3f6}.bt-task-panel-task{flex-direction:column;align-items:flex-start;gap:2px}
.bt-task-panel-task strong,.bt-task-panel-file strong{font-weight:500;overflow-wrap:anywhere}.bt-task-panel-task>span{color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bt-task-panel-file>svg{flex:none;color:#46877c}.bt-task-panel-file>span:first-of-type{min-width:0;flex:1}.bt-task-panel-file strong{display:block}.bt-task-panel-file small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#94a3b8}.bt-task-panel-file-open{flex:none;color:#187761;font-size:11px}.bt-task-panel-file--missing{cursor:default;color:#64748b}.bt-task-panel-file--missing small{white-space:normal;overflow-wrap:anywhere;color:#b45309}
.bt-task-panel-retry{margin:6px 0 0;padding:5px 8px;border:0;border-radius:6px;background:#f1f5f9;color:#475569;font:inherit;cursor:pointer}
.bt-task-panel .bt-conversation-result{border:0;background:transparent;margin:0;border-radius:8px}.bt-task-panel .bt-conversation-result+details{border-top:1px solid #e8edf2;border-radius:0}.bt-task-panel .bt-conversation-result>summary{padding:9px 0;gap:7px}.bt-task-panel .bt-result-check{font-size:13px}.bt-task-panel .bt-result-heading strong{display:none}.bt-task-panel .bt-result-heading time{font-size:10px}.bt-task-panel .bt-result-title{white-space:normal;overflow-wrap:anywhere}.bt-task-panel .bt-result-expand{font-size:10px;white-space:nowrap}.bt-task-panel .bt-result-details{padding:0 0 10px 20px}.bt-task-panel .bt-result-details p{font-size:12px}.bt-task-panel .bt-result-actions button{border:0;border-radius:6px;padding:5px 8px;background:#e5f3ee;color:#187761;font:inherit;cursor:pointer}
.bt-task-panel :is(button,summary):focus-visible{outline:2px solid #187761;outline-offset:2px}
@keyframes bt-task-panel-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.bt-task-panel{animation:none}}
`
