import { createElement as h, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { ConversationResult, conversationResults, tasksForConversation, TASK_GROUP_CSS } from './task-groups.js'
import { CloseIcon } from './icons.js'
import { dayLabel } from './text.js'
import { t } from './i18n.js'
import { taskPanelReads } from './task-panel-reads.js'
import { ModelRecovery, MODEL_RECOVERY_CSS } from './model-recovery.js'
import { conversationFailures } from './recovery-state.js'
import { currentPart } from './text.js'
import { employeeGroupWork } from './employee-work-context.js'
import { TaskPermissions, conversationPermissions } from './task-permissions.js'
import { ToolIssues, conversationToolIssues } from './tool-issues.js'
import { WorkTaskDetails, taskStatusText, workTasksForConversation, savedWorkTaskFile, WORK_TASK_CSS } from './work-tasks.js'
import { JobExperience, JOB_EXPERIENCE_CSS } from './job-experience.js'
import { panelSection } from './panel-section.js'
import { taskPanelPreferences } from './task-panel-preferences.js'

const pathKey = path => {
  const value = String(path ?? '').replace(/\\/g, '/')
  return /^[a-z]:\//i.test(value) ? value.toLowerCase() : value
}
export const fileRevision = ({ file, item }) => `${pathKey(file.path)}:${Number.isFinite(file.modifiedAt) ? file.modifiedAt : item.at ?? 0}:${file.size ?? ''}`
export const fileRecordKey = ({ file, item }) => /^(?:[a-z]:[\\/]|\/)/i.test(file.path) ? pathKey(file.path) : `${item.sessionId ?? item.targetId ?? ''}:${pathKey(file.path)}`

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
    const previous = index !== undefined ? files[index].item : undefined
    const item = { id: file.id, targetId: file.targetId, sessionId: file.sessionId, roomId: file.roomId, title: file.title, at: file.at,
      ...(file.workTaskId ?? previous?.workTaskId ? { workTaskId: file.workTaskId ?? previous.workTaskId } : {}),
      ...(file.deliveryId ?? previous?.deliveryId ? { deliveryId: file.deliveryId ?? previous.deliveryId } : {}) }
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
  const tasks = (room ? [room] : tasksForConversation(sessionId, roster)).filter(item => item.task && !item.task.workTaskId && item.task.status !== 'completed')
  return [...new Set([
    ...files.filter(entry => entry.file.available !== false).map(fileRevision),
    ...employeeGroupWork(sessionId, roster).map(item => `work:${item.id}:${item.at ?? 0}`),
    ...conversationResults(sessionId, roster).map(item => `result:${item.id}:${item.at ?? 0}`),
    ...tasks.map(item => `task:${item.id}:${item.task.cycle ?? 0}:${item.task.objective ?? ''}`),
    ...workTasksForConversation(sessionId, roster).map(task => `work-task:${task.id}:${task.revision}`),
    ...conversationFailures(sessionId, roster).map(item => `error:${item.id}:${item.at}:${item.assistance?.status ?? ''}`),
    ...conversationToolIssues(sessionId, roster).map(item => `tool:${item.id}:${item.at}`),
    ...(conversationBot(sessionId, roster)?.contextResetError ? [`context:${sessionId}:${conversationBot(sessionId, roster).contextResetError}`] : []),
  ])]
}

const PANEL_TABS = ['tasks', 'outputs', 'attention']

export function relatedGroupLinks(sessionId, roster) {
  const bot = conversationBot(sessionId, roster)
  if (!bot || roster.roomsById?.[sessionId]) return []
  const linked = new Set([...employeeGroupWork(sessionId, roster).map(record => record.roomId),
    ...workTasksForConversation(sessionId, roster).map(task => task.roomId)])
  return (roster.rooms ?? []).filter(room => room.members?.includes(bot.id) || room.task?.originBotId === bot.id || linked.has(room.id))
    .sort((a, b) => (b.task?.completedAt ?? b.createdAt ?? 0) - (a.task?.completedAt ?? a.createdAt ?? 0))
}

export function outputFileList(results, discovered, tasks) {
  const roster = { workTasks: tasks }
  const shared = conversationFiles(results, discovered).filter(({ item, file }) => !savedWorkTaskFile(roster, item, file))
  const saved = tasks.flatMap(task => {
    const delivery = task.deliveries?.at(-1)
    return (delivery?.files ?? []).map((file, fileIndex) => ({ key: `${task.id}:${delivery.id}:${fileIndex}`, file,
      item: { id: `work-task:${task.id}:${delivery.id}`, workTaskId: task.id, deliveryId: delivery.id,
        targetId: task.roomId ?? task.ownerBotId, roomId: task.roomId, title: task.title || task.objective, at: delivery.at } }))
  })
  return [...saved, ...shared].sort((a, b) => (b.item.at ?? 0) - (a.item.at ?? 0))
}

export function TaskPanelContent({ sessionId, roster, actions, open, discovered = [], loading = false, failed = false, retry,
  tab = 'tasks', onTabChange = () => {}, id = 'bt-information', contentRef,
  collapsed = {}, onToggleSection = () => {}, removedFiles = {}, onRemoveFile, undoRemoval, onUndoRemoval }) {
  const room = roster.roomsById[sessionId]
  const entity = room ?? conversationBot(sessionId, roster)
  const failures = conversationFailures(sessionId, roster)
  const results = conversationResults(sessionId, roster)
  const workTasks = workTasksForConversation(sessionId, roster)
  const files = outputFileList(results, discovered, workTasks).filter(entry => entry.file.available === true
    || entry.item.workTaskId && entry.item.deliveryId || removedFiles[fileRecordKey(entry)] !== fileRevision(entry))
  const availableFiles = files.filter(entry => entry.file.available !== false)
  const unavailableFiles = files.filter(entry => entry.file.available === false)
  const groups = relatedGroupLinks(sessionId, roster)
  const attentionTasks = workTasks.filter(task => task.status === 'blocked' || task.acceptance?.postProcess === 'pending')
  const permissions = conversationPermissions(sessionId, roster)
  const attentionCount = attentionTasks.length + failures.length + conversationToolIssues(sessionId, roster).length + permissions.pending.length + Number(Boolean(entity?.contextResetError))
  const reviewCount = workTasks.filter(task => task.status === 'awaiting_review').length
  const history = results.filter(item => !workTasks.some(task => task.id === item.workTaskId || item.id?.startsWith(`work-task:${task.id}:`)))
  const selectTab = next => onTabChange(next)
  const sectionProps = key => ({ sectionKey: key, id: `${id}-${key}-content`, collapsed: collapsed[key] === true, onToggle: () => onToggleSection(key) })
  const section = (key, title, count, children, className) => panelSection({ ...sectionProps(key), title, count, className }, ...children)
  const tabProps = key => ({ id: `${id}-${key}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-${key}-tab`, hidden: tab !== key, tabIndex: 0, className: 'bt-task-panel-category' })
  const fileCard = ({ key, item, file }) => file.available === false
    ? h('div', { key, className: 'bt-task-panel-file bt-task-panel-file--missing', title: file.path },
      h('span', null, h('strong', null, file.name ?? file.path)),
      h('button', { type: 'button', className: 'bt-task-panel-file-remove', title: t('Only remove this list entry; keep the file and task history.'),
        'aria-label': t('Remove {name} from this list', { name: file.name ?? file.path }), onClick: () => onRemoveFile?.({ key, item, file }) }, t('Remove entry')))
    : h('button', { key, type: 'button', className: 'bt-task-panel-file', title: file.path,
      onClick: () => actions.openTaskResult(item, file) },
    h('svg', { width: 24, height: 28, viewBox: '0 0 24 28', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true },
      h('path', { d: 'M5 2h9l5 5v19H5zM14 2v6h5M8 14h8M8 18h8' })),
    h('span', null, h('strong', null, file.name ?? file.path), h('small', null, item.title)), h('span', { className: 'bt-task-panel-file-open' }, t('Open file')))
  return h('div', { ref: contentRef, className: 'bt-task-panel-content' },
    h('div', { className: 'bt-task-panel-tabs', role: 'tablist', 'aria-label': t('Information categories') },
      PANEL_TABS.map((key, index) => h('button', { key, type: 'button', id: `${id}-${key}-tab`, role: 'tab',
        'aria-selected': tab === key, 'aria-controls': `${id}-${key}-panel`, tabIndex: tab === key ? 0 : -1,
        onClick: () => selectTab(key), onKeyDown: event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1
          if (next < 0) return
          event.preventDefault(); selectTab(PANEL_TABS[next]); event.currentTarget.parentElement.children[next]?.focus()
        } }, t({ tasks: 'Tasks', outputs: 'Deliveries', attention: 'Pending actions' }[key]),
      key === 'attention' && attentionCount ? h('span', null, attentionCount) : key === 'tasks' && reviewCount ? h('span', null, reviewCount) : null))),
    h('div', tabProps('tasks'),
      section('history', 'Task history', history.length + workTasks.length, [
        workTasks.map(task => h('details', { key: task.id, className: 'bt-task-history-record' },
          h('summary', null, h('span', null, task.title || task.objective), h('small', null, t(taskStatusText(task.status)))),
          h(WorkTaskDetails, { task, actions, view: 'all', onShowAttention: () => selectTab('attention') }))),
        history.map(item => h(ConversationResult, { key: item.id, item: { ...item, files: [] }, sessionId, actions, open })),
        !history.length && !workTasks.length ? h('p', { className: 'bt-task-panel-empty' }, t('No task history yet')) : null], 'bt-task-panel-results'),
      section('groups', 'Related collaboration', groups.length, [
        groups.length ? groups.map(group => h('button', { key: group.id, type: 'button', className: 'bt-related-group-link', onClick: () => open(group.id) },
          h('span', null, group.name), h('small', null, t('Open group')), h('span', { 'aria-hidden': true }, '↗')))
          : h('p', { className: 'bt-task-panel-empty' }, t('No related group chats'))], 'bt-related-groups')),
    h('div', tabProps('outputs'),
      section('files', 'Output files', availableFiles.length, [
      loading && !files.length ? h('p', { className: 'bt-task-panel-empty', role: 'status' }, t('Checking shared files…'))
        : availableFiles.length ? [availableFiles.slice(0, 4).map(fileCard), availableFiles.length > 4 ? h('details', { className: 'bt-task-panel-fold' },
          h('summary', null, t('More files ({count})', { count: availableFiles.length - 4 })), availableFiles.slice(4).map(fileCard)) : null]
          : !unavailableFiles.length ? h('p', { className: 'bt-task-panel-empty' }, failed ? t('Could not check shared files') : t(Object.keys(removedFiles).length ? 'No output files to show' : 'No output files recorded yet')) : null,
      unavailableFiles.length ? h('details', { className: 'bt-task-panel-unavailable' },
        h('summary', null, t('Unavailable files ({count})', { count: unavailableFiles.length })),
        h('div', { className: 'bt-task-panel-unavailable-list', role: 'region', 'aria-label': t('Unavailable files'), tabIndex: 0 }, unavailableFiles.map(fileCard)),
        h('button', { type: 'button', className: 'bt-task-panel-retry', onClick: retry, disabled: loading }, t(loading ? 'Checking files…' : 'Retry file check'))) : null,
      failed && !unavailableFiles.length ? h('button', { type: 'button', className: 'bt-task-panel-retry', onClick: retry, disabled: loading }, t(loading ? 'Checking files…' : 'Retry file check')) : null,
      undoRemoval ? h('div', { className: 'bt-task-panel-undo', role: 'status' }, h('span', null, t('Entry removed from this list')),
        h('button', { type: 'button', onClick: onUndoRemoval, title: undoRemoval.name }, t('Undo removal'))) : null]),
      section('experience', 'Job experience', 0, [h(JobExperience, { key: sessionId, sessionId, roster, actions, open, active: tab === 'outputs' && !collapsed.experience })])),
    h('div', tabProps('attention'),
      !attentionCount ? h('p', { className: 'bt-task-panel-clear' }, t('Nothing needs your attention')) : null,
      attentionTasks.length ? section('blocked', 'Task issues', attentionTasks.length, attentionTasks.map(task => h(WorkTaskDetails, { key: task.id, task, actions, view: 'attention' }))) : null,
      h(TaskPermissions, { sessionId, roster, actions, section: sectionProps('permissions') }),
      h(ToolIssues, { sessionId, roster, actions, section: sectionProps('tools') }),
      failures.length || entity?.contextResetError ? section('errors', 'Errors and recovery', failures.length + Number(Boolean(entity?.contextResetError)), [
        h(ModelRecovery, { sessionId, roster, actions, onOpenConversation: open, embedded: true }),
        entity?.contextResetError ? h('p', { role: 'alert' }, t('Context could not be cleared. Your history is safe; try /clear again.')) : null], 'bt-task-panel-errors') : null))
}

export function InformationPanelBody(props) {
  const [tab, setTab] = useState('tasks')
  const [undo, setUndo] = useState(null)
  const id = useId(), contentRef = useRef(null)
  const { workspace, owner } = panelOwner(props.sessionId, props.roster)
  useSyncExternalStore(taskPanelPreferences.subscribe, taskPanelPreferences.getSnapshot, taskPanelPreferences.getSnapshot)
  const preferences = taskPanelPreferences.get(workspace, owner)
  const restored = JSON.stringify((props.discovered ?? []).filter(file => file.available === true).map(file => fileRecordKey({ file, item: file })))
  useEffect(() => { taskPanelPreferences.clearRestoredFiles(workspace, owner, JSON.parse(restored)) }, [workspace, owner, restored])
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0 }, [tab])
  const undoRemoval = undo?.workspace === workspace && undo.owner === owner && preferences.removedFiles[undo.key] === undo.revision ? undo : null
  return h(TaskPanelContent, { ...props, tab, onTabChange: setTab, id, contentRef, ...preferences,
    onToggleSection: key => taskPanelPreferences.setCollapsed(workspace, owner, key, !preferences.collapsed[key]),
    onRemoveFile: entry => {
      const key = fileRecordKey(entry), revision = fileRevision(entry)
      taskPanelPreferences.removeFile(workspace, owner, key, revision)
      setUndo({ workspace, owner, key, revision, name: entry.file.name })
    }, undoRemoval, onUndoRemoval: () => {
      if (undoRemoval) taskPanelPreferences.restoreFile(workspace, owner, undoRemoval.key, undoRemoval.revision)
      setUndo(null)
    } })
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
  const unread = revisions.filter(revision => !taskPanelReads.isRead(workspace, owner, revision)).length + conversationPermissions(sessionId, roster).pending.length
  const errors = conversationFailures(sessionId, roster).filter(item => !item.busy && !item.retrying)
  const workTasks = workTasksForConversation(sessionId, roster)
  const taskAttention = workTasks.some(task => task.status === 'blocked')
  const newest = [...results, ...discovered, ...workTasks.map(task => ({ at: task.updatedAt }))].reduce((latest, item) => !latest || item.at > latest.at ? item : latest, null)

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
    h('style', null, TASK_GROUP_CSS + MODEL_RECOVERY_CSS + TASK_PANEL_CSS + WORK_TASK_CSS + JOB_EXPERIENCE_CSS),
    h('button', { ref: trigger, type: 'button', className: 'bt-team-chat-btn bt-team-chat-btn--icon bt-task-panel-toggle',
      title: unread ? t('New updates ({count})', { count: unread }) : t('Conversation information'), 'aria-label': t('Conversation information'), 'aria-expanded': opened, 'aria-controls': id, 'aria-haspopup': 'dialog', 'data-needs-attention': errors.length > 0 || taskAttention || undefined,
      onClick: () => opened ? close(true) : reveal() },
    h('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
      h('path', { d: 'M4 4h2v2H4zM9 5h7M4 9h2v2H4zM9 10h7M4 14h2v2H4zM9 15h7' })),
    !opened && unread ? h('span', { className: 'bt-task-panel-count', 'aria-hidden': true }, unread > 9 ? '9+' : unread) : null),
    opened ? h('aside', { ref: panel, id, className: 'bt-task-panel', role: 'dialog', tabIndex: -1, 'aria-label': t('Conversation information') },
      h('header', null, h('div', null, h('strong', null, t('Conversation information')),
        h('small', null, newest ? `${t('Updated')} · ${dayLabel(newest.at)}` : t('Only this conversation'))),
      h('button', { type: 'button', 'aria-label': t('Close task panel'), onClick: () => close(true) }, h(CloseIcon))),
      h(InformationPanelBody, { key: sessionId, sessionId, roster, actions, open, discovered, loading: data.sessionId !== sessionId || data.loading, failed: data.sessionId === sessionId && data.failed,
        retry: () => { setData(value => ({ ...value, loading: true })); setRetry(value => value + 1) } })) : null)
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
.bt-related-group-link{display:flex;align-items:center;gap:8px;width:100%;padding:9px 5px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:start;font:inherit;cursor:pointer}.bt-related-group-link:hover{background:#edf3f6}.bt-related-group-link>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-related-group-link small{color:#187761;flex:none;font-size:11px}.bt-task-history-record{padding:8px 0;border-bottom:1px solid #e8edf2}.bt-task-history-record>summary{display:flex;align-items:baseline;gap:8px;cursor:pointer}.bt-task-history-record>summary>span{flex:1;min-width:0;overflow-wrap:anywhere}.bt-task-history-record>summary>small{font-size:10px;color:#64748b;flex:none}.bt-task-history-record[open]>summary{margin-bottom:9px}.bt-task-history-record .bt-work-task-heading{display:none}
.bt-task-panel-tabs{position:sticky;top:0;z-index:2;display:flex;gap:4px;padding:10px 0;background:#fbfcfe;border-bottom:1px solid #e8edf2}.bt-task-panel-tabs>button{display:flex;align-items:center;justify-content:center;gap:5px;flex:1;min-width:0;padding:7px 3px;border:0;border-radius:8px;background:transparent;color:#64748b;font:inherit;cursor:pointer}.bt-task-panel-tabs>button[aria-selected=true]{background:#e5f3ee;color:#187761;font-weight:600}.bt-task-panel-tabs span,.bt-task-panel-fold>summary>span{font-size:10px;padding:0 5px;border-radius:8px;background:#e8edf2;color:#64748b}.bt-task-panel-tabs>button:last-child span{background:#fff0db;color:#b45309}.bt-task-panel-category[hidden]{display:none}.bt-task-panel-category>section{padding:12px 0;border-bottom:1px solid #e8edf2}.bt-task-panel-category>section:last-child{border:0;padding-bottom:0}.bt-task-panel-category>section:empty{display:none}.bt-task-panel-fold{padding:11px 0;border-top:1px solid #e8edf2}.bt-task-panel-fold>summary{cursor:pointer;color:#64748b}.bt-task-panel-fold>summary>span{margin-left:7px}.bt-task-panel-attention{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:10px;padding:8px 10px;border:1px solid #f3e1c4;border-radius:8px;background:#fff9ef;color:#975b16;font:inherit;text-align:start;cursor:pointer}.bt-task-panel-clear{margin:16px 0;color:#64748b;text-align:center}
.bt-task-panel .bt-model-recovery{padding:0;max-height:none;overflow:visible}.bt-task-panel .bt-recovery-card{margin-bottom:8px}.bt-task-panel-errors{overflow-wrap:anywhere}
.bt-task-panel .bt-employee-work{max-height:none;overflow:visible;margin:0;border:0;background:transparent}.bt-task-panel .bt-employee-work>summary{padding:0}.bt-task-panel .bt-employee-work-note{padding:8px 0}.bt-task-panel .bt-employee-work-list{padding:0}
.bt-task-panel-content>section{padding:12px 0;border-bottom:1px solid #e8edf2}.bt-task-panel-content>section:last-child{border:0;padding-bottom:0}
.bt-task-panel-content h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;font-size:12px;font-weight:600;color:#334155}.bt-task-panel-content h3>span{color:#64748b;font-weight:400}
.bt-task-panel-empty{margin:0;color:#94a3b8;font-size:12px}
.bt-task-permissions{overflow-wrap:anywhere}.bt-task-permissions .bt-permission-card{padding:8px;border:1px solid #e8edf2;border-radius:8px;background:white;margin-bottom:8px}.bt-task-permissions p{margin:0 0 8px}.bt-task-permissions details{margin-top:8px;color:#64748b}.bt-task-permissions summary{cursor:pointer}.bt-task-permissions details p{margin:6px 0;font-size:11px}.bt-task-permissions [role=alert]{color:#b45309}
.bt-task-panel-task,.bt-task-panel-file{display:flex;align-items:center;gap:10px;width:100%;padding:9px 8px;box-sizing:border-box;border:0;border-radius:8px;background:transparent;text-align:start;font:inherit;color:inherit;cursor:pointer}
.bt-task-panel-task:hover,.bt-task-panel-file:hover{background:#edf3f6}.bt-task-panel-task{flex-direction:column;align-items:flex-start;gap:2px}
.bt-task-panel-task strong,.bt-task-panel-file strong{font-weight:500;overflow-wrap:anywhere}.bt-task-panel-task>span{color:#64748b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bt-task-panel-file>svg{flex:none;color:#46877c}.bt-task-panel-file>span:first-of-type{min-width:0;flex:1}.bt-task-panel-file strong{display:block}.bt-task-panel-file small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#94a3b8}.bt-task-panel-file-open{flex:none;color:#187761;font-size:11px}.bt-task-panel-file--missing{cursor:default;color:#64748b}.bt-task-panel-file--missing small{white-space:normal;overflow-wrap:anywhere;color:#b45309}
.bt-task-panel-retry{margin:6px 0 0;padding:5px 8px;border:0;border-radius:6px;background:#f1f5f9;color:#475569;font:inherit;cursor:pointer}
.bt-task-panel-unavailable{margin-top:4px;color:#64748b;font-size:11px}.bt-task-panel-unavailable>summary{padding:4px 0;cursor:pointer}.bt-task-panel-unavailable-list{max-height:152px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;margin-top:4px}.bt-task-panel-unavailable .bt-task-panel-file--missing{padding:6px 8px}.bt-task-panel-unavailable .bt-task-panel-file--missing strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.bt-task-panel-file--missing:hover{background:transparent}.bt-task-panel-retry:disabled{opacity:.6;cursor:wait}
.bt-task-panel-file-remove{flex:none;border:0;border-radius:5px;padding:4px 6px;background:transparent;font:inherit;color:#64748b;cursor:pointer}.bt-task-panel-file-remove:hover{color:#a33f35;background:#fff1ef}.bt-task-panel-undo{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:11px;color:#64748b}.bt-task-panel-undo>button{flex:none;border:0;border-radius:5px;padding:4px 6px;background:transparent;color:#187761;font:inherit;cursor:pointer}
.bt-panel-section-toggle{display:flex;align-items:center;gap:7px;width:100%;min-height:28px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}.bt-panel-section-title{flex:1;min-width:0}.bt-panel-section-count{margin-left:7px;font-weight:400;color:#64748b}.bt-panel-section-action{flex:none;font-size:10px;font-weight:400;color:#64748b}.bt-panel-section-toggle>svg{flex:none;color:#64748b}.bt-panel-section-toggle:hover .bt-panel-section-action{color:#187761}.bt-task-panel-content h3:has(.bt-panel-section-toggle){width:100%;margin-bottom:0}.bt-panel-section-body{margin-top:8px}.bt-panel-section-body[hidden]{display:none!important}
.bt-task-panel .bt-conversation-result{border:0;background:transparent;margin:0;border-radius:8px}.bt-task-panel .bt-conversation-result+details{border-top:1px solid #e8edf2;border-radius:0}.bt-task-panel .bt-conversation-result>summary{padding:9px 0;gap:7px}.bt-task-panel .bt-result-check{font-size:13px}.bt-task-panel .bt-result-heading strong{display:none}.bt-task-panel .bt-result-heading time{font-size:10px}.bt-task-panel .bt-result-title{white-space:normal;overflow-wrap:anywhere}.bt-task-panel .bt-result-expand{font-size:10px;white-space:nowrap}.bt-task-panel .bt-result-details{padding:0 0 10px 20px}.bt-task-panel .bt-result-details p{font-size:12px}.bt-task-panel .bt-result-actions button{border:0;border-radius:6px;padding:5px 8px;background:#e5f3ee;color:#187761;font:inherit;cursor:pointer}
.bt-task-panel :is(button,summary):focus-visible{outline:2px solid #187761;outline-offset:2px}
@keyframes bt-task-panel-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.bt-task-panel{animation:none}}
`
