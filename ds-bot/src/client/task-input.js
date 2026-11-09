import { createElement as h, useRef, useState } from 'react'
import { hostText, t } from './i18n.js'

export function TaskInputChoice({ pending, actions }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const lock = useRef(false)
  const choose = async decision => {
    if (lock.current || pending.sending) return
    lock.current = true; setBusy(true); setError('')
    try { await actions.resolveTaskInput({ botId: pending.botId, requestId: pending.id, decision }) }
    catch (failure) { setError(hostText(failure?.message ?? String(failure))) }
    finally { lock.current = false; setBusy(false) }
  }
  return h('div', { className: 'bt-task-input-choice', role: 'group', 'aria-label': t('Choose task context') },
    h('style', null, TASK_INPUT_CSS),
    h('p', null, t(pending.newContext ? 'The new task is ready. Send this message?' : 'Continue the current task, or start something new?')),
    !pending.newContext && pending.title ? h('small', { title: pending.title }, t('Current task: {title}', { title: pending.title })) : null,
    h('div', { className: 'bt-task-input-options' },
      !pending.newContext ? h('button', { type: 'button', disabled: busy || pending.sending, onClick: () => choose('continue') }, t('Continue current task')) : null,
      h('button', { type: 'button', disabled: busy || pending.sending, onClick: () => choose('new'), title: t('Start with a fresh context; keep history and experience.') }, t(pending.newContext ? 'Send message' : 'Start new task'))),
    h('details', null, h('summary', null, t('Message waiting to send')), h('p', { className: 'bt-task-input-preview' }, pending.text), pending.attachments ? h('small', null, t('Attachments retained: {count}', { count: pending.attachments })) : null),
    error ? h('p', { role: 'alert' }, error) : busy || pending.sending ? h('small', { role: 'status' }, t('Sending…')) : null)
}

export function TaskInputDock({ sessionId, useRoster, actions }) {
  const roster = useRoster(value => value)
  const bot = roster.byId[sessionId]
  const pending = bot && roster.taskInputs?.[bot.id]
  if (!pending || roster.roomsById[sessionId]) return null
  return h(TaskInputChoice, { key: pending.id, pending, actions })
}

export const TASK_INPUT_CSS = `
.bt-task-input-choice{margin:6px 0;padding:10px 12px;border:1px solid var(--bt-line,#dce6e4);border-radius:12px;background:var(--bt-bg,#fff);color:var(--bt-ink,#23343a);font:12px/1.6 var(--bt-font-sans,system-ui);box-sizing:border-box;min-width:0;max-width:100%}
.bt-task-input-choice p{margin:0 0 6px}.bt-task-input-choice>small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--bt-ink-3,#6a7e85)}
.bt-task-input-options{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.bt-task-input-options button{padding:5px 10px;border:1px solid var(--bt-line,#dce6e4);border-radius:7px;background:transparent;color:var(--bt-ink,#23343a);font:inherit;cursor:pointer}.bt-task-input-options button:first-child{background:var(--bt-accent-soft,#e4f3ee);color:var(--bt-accent,#128175)}.bt-task-input-options button:disabled{opacity:.5;cursor:default}
.bt-task-input-choice summary{cursor:pointer;color:var(--bt-ink-3,#6a7e85)}.bt-task-input-preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px;overflow:auto}.bt-task-input-choice [role=alert]{color:#ad471c}
`
