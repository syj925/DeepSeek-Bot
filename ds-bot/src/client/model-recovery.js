import { createElement as h, useState } from 'react'
import { t } from './i18n.js'
import { failureLabel } from './diagnostics.js'
import { conversationFailures } from './recovery-state.js'

export function recoveryAdvice(code) {
  if (['AUTH', 'QUOTA', 'ACCOUNT_QUOTA'].includes(code)) return 'Check the API key and account balance before retrying.'
  if (code === 'INVALID_REQUEST') return 'Check model compatibility and request settings. Repeating the same request may fail again.'
  if (code === 'CONTEXT_WINDOW_EXCEEDED') return 'The model context limit was exceeded. Check the model or continue in a new conversation part.'
  if (code === 'RATE_LIMIT') return 'The service is busy. Wait a moment before retrying.'
  return 'Check your network and model service, then retry the unfinished work.'
}

function RecoveryCard({ failure, roster, actions, openConversation }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const bot = roster.byId[failure.botId]
  const assistance = failure.assistance
  const chiefFailed = failure.chief || ['failed', 'interrupted'].includes(assistance?.status)
  const run = async action => {
    if (working) return
    setWorking(true); setError('')
    try {
      const result = await actions.recoverFailure(failure.id, action)
      if (action === 'diagnose') openConversation(result.botId)
    } catch (err) { setError(t(err?.message ?? 'Recovery could not start. Check the connection and try again.')) }
    finally { setWorking(false) }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`QibitAI model error\nEmployee: ${bot?.name ?? failure.botId}\nCode: ${failure.code}\nHTTP: ${failure.status ?? '-'}\nModel: ${bot?.model ?? 'default'}\nTime: ${new Date(failure.at).toISOString()}\nFailures: ${failure.count}`)
      setCopied(true)
    } catch { setError(t('Could not copy the error. You can share a screenshot instead.')) }
  }
  return h('section', { className: 'bt-recovery-card', role: 'alert', 'data-failure-id': failure.id },
    h('strong', null, t('{name} could not answer: {reason}', { name: bot?.name ?? '', reason: failureLabel(failure.code) })),
    h('p', null, chiefFailed ? t('The General Assistant is also unavailable. Check the model settings or copy the error for support.') : t(recoveryAdvice(failure.code))),
    failure.count > 1 ? h('p', null, t('This failed {count} times. Automatic retries are stopped; check the cause first.', { count: failure.count })) : null,
    assistance?.status === 'replied' ? h('p', null, t('The General Assistant has replied. Review the advice before retrying.')) : null,
    assistance?.status === 'sent' ? h('p', null, t('The General Assistant is checking. Your task has not been retried.')) : null,
    assistance?.status === 'delayed' ? h('p', null, t('The General Assistant has not finished after 90 seconds. Check its conversation and model connection; do not submit duplicate requests.')) : null,
    h('div', { className: 'bt-recovery-actions' },
      h('button', { type: 'button', disabled: working || failure.busy, onClick: () => run('retry') }, t(failure.retrying ? 'Retrying…' : 'Retry unfinished work')),
      !failure.chief && !assistance ? h('button', { type: 'button', disabled: working, onClick: () => run('diagnose') }, t('Ask General Assistant to diagnose')) : null,
      assistance ? h('button', { type: 'button', onClick: () => openConversation(assistance.botId) }, t('View diagnosis')) : null,
      h('button', { type: 'button', onClick: () => actions.openSettings('bots', chiefFailed && assistance ? assistance.botId : failure.botId) }, t('Check model settings')),
      h('button', { type: 'button', onClick: copy }, t(copied ? 'Copied' : 'Copy error details'))),
    error ? h('p', { role: 'status' }, error) : null)
}

export function ModelRecovery({ sessionId, roster, actions, onOpenConversation }) {
  const openConversation = onOpenConversation ?? actions.openCanvasEntity
  const failures = conversationFailures(sessionId, roster)
  if (!failures.length) return null
  return h('div', { className: 'bt-model-recovery' }, failures.map(failure => h(RecoveryCard, { key: failure.id, failure, roster, actions, openConversation })))
}

export const MODEL_RECOVERY_CSS = `
.bt-model-recovery{flex:none;max-height:36%;min-height:0;overflow:auto;padding:8px 14px;scrollbar-width:thin}
.bt-recovery-card{padding:10px 12px;margin:0 0 6px;border:1px solid rgba(217,119,6,.2);border-radius:12px;background:#fffbeb;color:#92400e;font:12px/1.6 system-ui}
.bt-recovery-card strong{font-weight:600}.bt-recovery-card p{margin:4px 0}
.bt-recovery-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.bt-recovery-actions button{border:1px solid rgba(217,119,6,.2);border-radius:7px;background:rgba(255,255,255,.9);color:#92400e;padding:4px 8px;font:inherit;cursor:pointer}
.bt-recovery-actions button:hover{background:#fef3c7}.bt-recovery-actions button:disabled{opacity:.5;cursor:default}
`
