import { createElement as h, useState } from 'react'
import { ApprovalCard } from './member-status.js'
import { t } from './i18n.js'
import { panelSection } from './panel-section.js'

export function conversationPermissions(sessionId, roster) {
  const room = roster.roomsById?.[sessionId]
  const bot = roster.byId?.[sessionId]
  const belongs = entry => room ? entry.roomId === room.id : !entry.roomId && (entry.sessionId === sessionId || bot && entry.botId === bot.id)
  return { pending: (roster.pendingApprovals ?? []).filter(belongs),
    grants: (roster.chiefPermissions?.grants ?? []).filter(belongs),
    audit: (roster.chiefPermissions?.audit ?? []).filter(belongs).slice(-5).reverse() }
}

export function TaskPermissions({ sessionId, roster, actions, section }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const { pending, grants, audit } = conversationPermissions(sessionId, roster)
  if (!pending.length && !grants.length && !audit.length) return null
  const run = async operation => {
    setBusy(true); setError('')
    try { await operation() } catch (failure) { setError(t(failure.message)) } finally { setBusy(false) }
  }
  return panelSection({ ...section, title: 'Task permissions', count: pending.length, className: 'bt-task-permissions' },
    error ? h('p', { role: 'alert' }, error) : null,
    pending.map(approval => h('div', { key: approval.id, className: 'bt-permission-card' },
      h(ApprovalCard, { approval, bot: roster.byId?.[approval.botId] ?? { id: approval.botId, name: t('Employee') }, actions }),
      approval.answerable && roster.chiefPermissions?.policy.enabled ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: busy,
        onClick: () => run(() => actions.reviewApprovalWithChief(approval.id)) }, t('Let Chief review this task')) : null)),
    grants.map(grant => h('div', { key: grant.id, className: 'bt-permission-card' },
      h('p', null, t('Chief authorized this turn · expires at {time}', { time: new Date(grant.expiresAt).toLocaleTimeString() })),
      h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: busy,
        onClick: () => run(() => actions.revokeTaskPermission(grant.sessionId)) }, t('Revoke task authorization')))),
    audit.length ? h('details', null, h('summary', null, t('Recent authorization activity')),
      audit.map(entry => h('p', { key: entry.id }, `${new Date(entry.at).toLocaleTimeString()} · ${t(`Authorization: ${entry.action}`)}${entry.tool ? ` · ${entry.tool}` : ''}`))) : null)
}
