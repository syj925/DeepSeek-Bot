import { createElement as h, useEffect, useState } from 'react'
import { BotMark } from './mark.js'
import { workPhrase } from './cells.js'
import { t } from './i18n.js'

export function ExecutionDialog({ target, roster, actions }) {
  const [view, setView] = useState({ rows: [], error: false })
  useEffect(() => {
    let stopped = false
    let timer
    const tick = async () => {
      try {
        const rows = await actions.execution(target.sessionId, target.botId)
        if (!stopped) setView({ rows, error: false })
      } catch { if (!stopped) setView(current => ({ ...current, error: true })) }
      if (!stopped) timer = setTimeout(tick, 1000)
    }
    void tick()
    const key = event => { if (event.key === 'Escape') actions.closeExecution() }
    document.addEventListener('keydown', key)
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('keydown', key) }
  }, [target.sessionId, target.botId])
  return h('div', { className: 'bt-execution-shade', onClick: event => { if (event.target === event.currentTarget) actions.closeExecution() } },
    h('section', { className: 'bt-execution', role: 'dialog', 'aria-modal': true, 'aria-label': t('Execution details') },
      h('header', null, h('strong', null, t('Execution details')), h('button', { type: 'button', autoFocus: true, onClick: actions.closeExecution }, t('Close'))),
      h('button', { type: 'button', onClick: () => actions.inspectTools(target.sessionId, target.botId) }, t('Tools & browser')),
      view.error ? h('p', { role: 'status' }, t('Could not load progress. Retrying…')) : null,
      view.rows.map(row => h('article', { key: row.botId },
        h('h3', null, h(BotMark, { bot: roster.byId[row.botId], size: 24 }), roster.byId[row.botId]?.name),
        h('p', { role: 'status' }, row.waiting ? t('Waiting for your answer') : row.running ? `${workPhrase(row.tool)}…` : t('This turn has ended')),
        row.progress.length ? h('ol', null, row.progress.map((step, index) => h('li', { key: index },
          h('time', null, new Date(step.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), workPhrase(step.tool)))) : null,
        row.reasoning ? h('details', { open: true }, h('summary', null, t('Model reasoning')), h('div', { className: 'bt-execution-reasoning' }, row.reasoning))
          : h('p', { className: 'bt-execution-note' }, t('No reasoning text has been returned yet. The progress above reflects actual execution.'))))))
}

export const EXECUTION_CSS = `
.bt-execution-shade{position:fixed;inset:0;z-index:2147483100;display:grid;place-items:center;background:rgba(15,23,42,.12);padding:24px}
.bt-execution{width:min(520px,100%);max-height:75vh;overflow:auto;border:1px solid var(--bt-line);border-radius:20px;padding:20px;background:var(--bt-main,#fff);color:var(--bt-ink,#334155);box-shadow:0 20px 70px #0f172a26;font:14px/1.6 system-ui}
.bt-execution header,.bt-execution h3{display:flex;align-items:center;gap:10px}.bt-execution header{justify-content:space-between}.bt-execution button{border:0;border-radius:8px;padding:6px 12px;cursor:pointer}.bt-execution h3{font-size:14px;margin-bottom:4px}.bt-execution article+article{border-top:1px solid var(--bt-line)}.bt-execution ol{padding-left:20px}.bt-execution time{margin-right:12px;color:var(--bt-ink-3)}.bt-execution-reasoning{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 0}.bt-execution-note{font-size:12px;color:var(--bt-ink-3)}
.bt-work-event{justify-content:flex-start!important}.bt-work-button{border:0;background:none;text-align:left;cursor:pointer;padding:4px 0;font:inherit}.bt-work-button:hover{color:var(--bt-ink)}
`
