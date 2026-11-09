import { createElement as h, useEffect, useRef, useState } from 'react'
import { hostText, t } from './i18n.js'
import { dayLabel } from './text.js'

const STATUS = { active: 'Task in progress', blocked: 'Task needs attention', awaiting_review: 'Awaiting your acceptance', completed: 'Accepted by you' }
const STEP_STATUS = { pending: 'Not started', working: 'In progress', blocked: 'Needs attention', done: 'Step saved' }

// Employee identities survive conversation segmentation. Group views remain scoped to that group.
export function workTasksForConversation(sessionId, roster) {
  const botId = roster.byId?.[sessionId]?.id
  const room = roster.roomsById?.[sessionId]
  return (roster.workTasks ?? []).filter(task => room
    ? task.roomId === room.id || task.bindings?.some(binding => binding.roomId === room.id)
    : botId ? task.ownerBotId === botId || task.originBotId === botId || task.participantBotIds?.includes(botId)
      || task.bindings?.some(binding => binding.botId === botId)
      : task.bindings?.some(binding => binding.sessionId === sessionId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export function taskStatusText(status) { return STATUS[status] ?? 'Task needs attention' }

export function savedWorkTaskFile(roster, item, file) {
  const pathKey = path => {
    const value = String(path ?? '').replace(/\\/g, '/')
    return /^[a-z]:\//i.test(value) ? value.toLowerCase() : value
  }
  if (!file?.path) return null
  for (const task of roster.workTasks ?? []) {
    if (item.workTaskId && item.workTaskId !== task.id) continue
    for (const delivery of task.deliveries ?? []) {
      if (item.deliveryId && item.deliveryId !== delivery.id) continue
      const fileIndex = (delivery.files ?? []).findIndex(saved => pathKey(saved.path) === pathKey(file.path))
      if (fileIndex >= 0) return { taskId: task.id, deliveryId: delivery.id, fileIndex }
    }
  }
  return null
}

export function saveTaskSnapshotDownload(value, environment = globalThis) {
  const binary = environment.atob(value.base64)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const url = environment.URL.createObjectURL(new environment.Blob([bytes], { type: value.mime ?? 'application/octet-stream' }))
  const link = environment.document.createElement('a')
  link.href = url
  link.download = value.name
  try {
    environment.document.body.append(link)
    link.click()
  } finally {
    link.remove()
    environment.setTimeout(() => environment.URL.revokeObjectURL(url), 1000)
  }
}

export function WorkTaskDetails({ task, actions, view = 'all', onShowOutputs, onShowAttention }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [editing, setEditing] = useState(false), [note, setNote] = useState(''), [stepId, setStepId] = useState('')
  const [copied, setCopied] = useState(false)
  const pending = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async operation => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await operation() }
    catch (failure) { if (mounted.current) setError(hostText(failure?.message ?? String(failure))) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const control = action => run(async () => {
    await actions.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action,
      ...(action === 'rework' ? { note: note.trim(), ...(stepId ? { stepId } : {}) } : {}) })
    if (mounted.current && action === 'rework') { setEditing(false); setNote(''); setStepId('') }
  })
  const canReview = task.status === 'awaiting_review'
  const steps = task.steps ?? [], deliveries = task.deliveries ?? []
  const showProgress = view === 'all' || view === 'progress'
  const showDeliveries = view === 'all' || view === 'deliveries'
  const showAttention = view === 'all' || view === 'attention'
  const currentStep = steps.find(step => step.status === 'blocked') ?? steps.find(step => step.status === 'working') ?? steps.find(step => step.status === 'pending')
  const completed = steps.filter(step => step.status === 'done').length
  const deliveryCard = delivery => h('div', { key: delivery.id, className: 'bt-work-task-delivery', 'data-delivery-id': delivery.id },
    h('strong', null, t('Version {version}', { version: delivery.version }), ' · ', delivery.title || task.title),
    h('small', null, dayLabel(delivery.at)),
    delivery.summary ? h('details', { className: 'bt-work-task-summary' }, h('summary', null, t('Delivery summary')), h('p', null, delivery.summary)) : null,
    (delivery.files ?? []).map((file, fileIndex) => h('button', { key: `${fileIndex}:${file.path}`, type: 'button', className: 'bt-work-task-file', disabled: busy,
      onClick: () => run(() => actions.downloadWorkTaskFile({ taskId: task.id, deliveryId: delivery.id, fileIndex })) },
    h('span', null, file.name), h('small', null, t('Download saved version')))))
  return h('article', { className: 'bt-work-task', 'data-work-task-id': task.id, 'data-task-status': task.status, 'aria-busy': busy },
    h('div', { className: 'bt-work-task-heading' }, h('strong', null, task.title || task.objective), h('span', null, t(taskStatusText(task.status)))),
    showProgress && task.title && task.title !== task.objective ? h('details', null, h('summary', null, t('Task goal')), h('p', null, task.objective)) : null,
    (showProgress || showDeliveries) && task.criteria?.length ? h('details', null, h('summary', null, t('Task acceptance requirements')), h('ul', null, task.criteria.map((criterion, index) => h('li', { key: index }, criterion)))) : null,
    showAttention && task.blocker ? h('div', { className: 'bt-work-task-blocker', role: 'status' },
      h('strong', null, t('Task blocker')), h('p', null, task.blocker.message),
      h('details', null, h('summary', null, t('Error details')), h('code', null, task.blocker.code),
      h('button', { type: 'button', disabled: busy, onClick: () => run(async () => {
        await navigator.clipboard.writeText(`${task.id}\n${task.blocker.code}\n${task.blocker.message}`)
        if (mounted.current) setCopied(true)
      }) }, t(copied ? 'Copied' : 'Copy error details')))) : null,
    showAttention && task.feedback?.note ? h('div', { className: 'bt-work-task-feedback' }, h('strong', null, t('Your requested changes')), h('p', null, task.feedback.note),
      h('small', null, task.feedback.stepId ? steps.find(step => step.id === task.feedback.stepId)?.title ?? task.feedback.stepId : t('Review from the first step'))) : null,
    showProgress ? h('div', { className: 'bt-work-task-progress' },
      h('div', null, h('strong', null, currentStep ? t('Current step: {step}', { step: currentStep.title }) : t(steps.length ? 'All steps saved' : 'Plan not recorded yet')),
        h('small', null, t('{completed} / {total} steps saved', { completed, total: steps.length }))),
      steps.length ? h('progress', { max: steps.length, value: completed, 'aria-label': t('Saved task steps') }) : null) : null,
    showProgress ? h('details', { className: 'bt-work-task-step-details' },
      h('summary', null, t('View task steps')),
      h('ol', { className: 'bt-work-task-steps' }, steps.map(step => h('li', { key: step.id, 'data-step-status': step.status },
        h('div', null, h('span', { className: 'bt-work-task-dot', 'aria-hidden': true }), h('strong', null, step.title), h('small', null, t(STEP_STATUS[step.status] ?? 'Not started'))),
        step.checkpoint ? h('details', null, h('summary', null, t('Saved work')), h('p', null, step.checkpoint)) : null)))) : null,
    showProgress && canReview && onShowOutputs ? h('button', { type: 'button', onClick: onShowOutputs }, t('View delivery and accept')) : null,
    showProgress && task.status === 'blocked' && onShowAttention ? h('button', { type: 'button', onClick: onShowAttention }, t('View pending actions')) : null,
    showDeliveries ? deliveries.length ? h('div', { className: 'bt-work-task-deliveries' },
      deliveryCard(deliveries.at(-1)),
      deliveries.length > 1 ? h('details', { className: 'bt-work-task-older' }, h('summary', null, t('Earlier versions ({count})', { count: deliveries.length - 1 })),
        deliveries.slice(0, -1).reverse().map(deliveryCard)) : null)
      : h('p', { className: 'bt-task-panel-empty' }, t('No output files recorded yet')) : null,
    showDeliveries && canReview ? h('p', { className: 'bt-work-task-help' }, t('Check the delivery against your requirements, then accept or request changes.')) : null,
    showAttention && task.status === 'completed' && task.acceptance?.postProcess === 'pending' ? h('div', { className: 'bt-work-task-feedback', role: 'status', 'data-task-finalization': task.acceptance.error ? 'failed' : 'pending' },
      h('p', null, t(task.acceptance.error
        ? 'Your acceptance is saved, but updating task history or the archive failed. Saved delivery versions remain available.'
        : 'Your acceptance is saved. Task history and archive updates are still pending.')),
      task.acceptance.error ? h('small', null, hostText(task.acceptance.error)) : null) : null,
    showAttention && task.status === 'blocked' ? h('p', { className: 'bt-work-task-help' }, task.feedback?.note
      ? t('Changes saved. Continue explicitly when ready; no work has restarted.')
      : t('Saved work is retained. Resolve the blocker, then continue the unfinished steps.')) : null,
    h('div', { className: 'bt-work-task-actions' },
      showDeliveries && canReview && deliveries.length ? h('button', { type: 'button', disabled: busy, onClick: () => control('accept') }, t('Accept delivery')) : null,
      showDeliveries && canReview ? h('button', { type: 'button', disabled: busy, onClick: () => setEditing(value => !value), 'aria-expanded': editing }, t('Request changes')) : null,
      showAttention && task.status === 'completed' && task.acceptance?.postProcess === 'pending' ? h('button', { type: 'button', disabled: busy, onClick: () => control('finalize') }, t('Retry task record sync')) : null,
      showAttention && task.status === 'blocked' ? h('button', { type: 'button', disabled: busy, onClick: () => control('resume') }, t('Continue unfinished steps')) : null),
    showDeliveries && editing && canReview ? h('form', { className: 'bt-work-task-rework', onSubmit: event => { event.preventDefault(); if (note.trim()) void control('rework') } },
      h('label', null, t('Step to revise'), h('select', { value: stepId, disabled: busy, onChange: event => setStepId(event.target.value) },
        h('option', { value: '' }, t('Review from the first step')), steps.map(step => h('option', { key: step.id, value: step.id }, step.title)))),
      h('p', { className: 'bt-work-task-help' }, t('The selected step and all following steps return to pending. Saved checkpoints and earlier deliveries are retained.')),
      h('label', null, t('What needs to change?'), h('textarea', { value: note, disabled: busy, maxLength: 4000, rows: 3, onChange: event => setNote(event.target.value) })),
      h('button', { type: 'submit', disabled: busy || !note.trim() }, t('Save change request'))) : null,
    error ? h('p', { className: 'bt-work-task-error', role: 'alert' }, t('Task action failed: {message}', { message: error })) : null)
}

export function ConversationWorkTasks({ tasks, actions, selectedId, onSelect, ...details }) {
  const [selected, setSelected] = useState(null)
  const task = tasks.find(item => item.id === (selectedId ?? selected)) ?? tasks.find(item => item.status !== 'completed') ?? tasks[0]
  if (!task) return null
  return h('div', { className: 'bt-conversation-work-tasks' },
    tasks.length > 1 ? h('label', { className: 'bt-work-task-select' }, t('Task record'),
      h('select', { value: task.id, onChange: event => (onSelect ?? setSelected)(event.target.value) }, tasks.map(item => h('option', { key: item.id, value: item.id }, `${item.title || item.objective} · ${t(taskStatusText(item.status))}`)))) : null,
    h(WorkTaskDetails, { key: task.id, task, actions, ...details }))
}

export const WORK_TASK_CSS = `
.bt-work-task-progress{margin:14px 0 10px;padding:11px;border-radius:10px;background:#f0f5f7}.bt-work-task-progress>div{display:flex;flex-direction:column;gap:4px}.bt-work-task-progress strong{font-size:12px;font-weight:500}.bt-work-task-progress small{color:#64748b;font-size:11px}.bt-work-task-progress progress{display:block;width:100%;height:4px;border:0;border-radius:3px;margin-top:9px;overflow:hidden;accent-color:#187761;background:#dce6e9}.bt-work-task-progress progress::-webkit-progress-bar{background:#dce6e9}.bt-work-task-progress progress::-webkit-progress-value{background:#187761}.bt-work-task-steps li>details{margin:4px 0 0 13px;font-size:11px;color:#64748b}.bt-work-task-older>summary{font-size:11px}.bt-work-task .bt-work-task-summary{font-size:11px;color:#64748b}.bt-work-task-actions:empty{display:none}
.bt-work-task{overflow-wrap:anywhere;font:inherit}.bt-work-task p{margin:6px 0;white-space:pre-wrap}.bt-work-task-heading{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}.bt-work-task-heading>strong{flex:1;min-width:0}.bt-work-task-heading>span{font-size:10px;color:#177c6c}.bt-work-task[data-task-status=blocked] .bt-work-task-heading>span{color:#b45309}.bt-work-task details{margin:9px 0}.bt-work-task summary{cursor:pointer;color:#475569}.bt-work-task-count{margin-left:7px;color:#94a3b8;font-size:10px}.bt-work-task-steps{padding:0;list-style:none;display:grid;gap:9px}.bt-work-task-steps li>div{display:flex;align-items:center;gap:7px}.bt-work-task-steps li strong{flex:1;min-width:0;font-weight:500}.bt-work-task-steps li small{flex:none;font-size:10px;color:#64748b}.bt-work-task-dot{flex:0 0 6px;width:6px;height:6px;border-radius:50%;background:#cbd5e1}.bt-work-task-steps [data-step-status=done] .bt-work-task-dot{background:#187761}.bt-work-task-steps [data-step-status=working] .bt-work-task-dot{background:#3b82f6}.bt-work-task-steps [data-step-status=blocked] .bt-work-task-dot{background:#b45309}.bt-work-task-steps li>p{margin:3px 0 0 13px;font-size:11px;color:#64748b}.bt-work-task-blocker,.bt-work-task-feedback{margin:9px 0;padding:8px;border:1px solid #e8edf2;border-radius:8px;background:#f8fafc}.bt-work-task-blocker code{display:block;font-size:10px;color:#b45309}.bt-work-task button{padding:5px 8px;border:0;border-radius:6px;background:#e5f3ee;color:#187761;font:inherit;cursor:pointer}.bt-work-task button:disabled{opacity:.5;cursor:default}.bt-work-task-blocker>button{margin-top:7px}.bt-work-task-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.bt-work-task-help,.bt-work-task-feedback small{font-size:11px;color:#64748b}.bt-work-task .bt-work-task-error{color:#b45309}.bt-work-task-delivery{border-top:1px solid #e8edf2;padding:8px 0}.bt-work-task-delivery>strong{display:block;font-weight:500}.bt-work-task-delivery>small{color:#94a3b8;font-size:10px}.bt-work-task-delivery>p{font-size:11px;color:#64748b}.bt-work-task .bt-work-task-file{display:flex;align-items:center;gap:8px;width:100%;text-align:start;margin-top:5px}.bt-work-task-file>span{min-width:0;flex:1;overflow-wrap:anywhere}.bt-work-task-file>small{font-size:10px;flex:none}.bt-work-task-rework,.bt-work-task-rework label,.bt-work-task-select{display:flex;flex-direction:column;gap:5px}.bt-work-task-rework{margin-top:9px;gap:8px}.bt-work-task-rework select,.bt-work-task-select select,.bt-work-task-rework textarea{box-sizing:border-box;width:100%;padding:6px 7px;border:1px solid #dce5e8;border-radius:7px;background:white;color:#334155;font:inherit}.bt-work-task-rework textarea{resize:vertical}.bt-work-task-select{margin-bottom:10px;font-size:11px;color:#64748b}.bt-work-task :is(button,select,textarea):focus-visible,.bt-work-task-select select:focus-visible{outline:2px solid #187761;outline-offset:2px}
`
