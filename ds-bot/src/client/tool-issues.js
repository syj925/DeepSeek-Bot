import { createElement as h } from 'react'
import { t } from './i18n.js'
import { panelSection } from './panel-section.js'
import { conversationToolIssues } from './recovery-state.js'
export { conversationToolIssues } from './recovery-state.js'

export const ISSUE_ADVICE = {
  SHELL_INIT_FAILED: 'The command process failed to initialize (0xC0000142). Chief authorization cannot fix this environment error. Preserve existing results and use structured file tools when sufficient. Check the desktop execution environment before retrying commands; do not repeat the failed command.',
  WORKSPACE_ACCESS: 'The command could not start because the workspace owner or permissions are incorrect. Chief authorization cannot repair Windows folder ownership. Use structured file tools if available; ask an administrator to repair this workspace before retrying commands.',
  BROWSER_SESSION: 'This employee browser needs its own execution conversation open. Open the employee browser below, then ask the employee to continue. Public research can use web_search and web_fetch instead.',
}
export function ToolIssues({ sessionId, roster, actions, section }) {
  const issues = conversationToolIssues(sessionId, roster)
  return issues.length ? panelSection({ ...section, title: 'Tool and environment issues', count: issues.length, className: 'bt-task-panel-errors' },
    ...issues.map(item => h('div', { key: item.id, role: 'status' },
      h('strong', null, `${roster.byId?.[item.botId]?.name ?? item.tool} · ${item.tool}`),
      h('p', null, t(ISSUE_ADVICE[item.code] ?? 'Check this employee execution history for details.')),
      h('button', { type: 'button', onClick: () => actions.inspectTools(sessionId, item.botId) }, t('Tools & browser'))))) : null
}
