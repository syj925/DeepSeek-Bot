import { createElement as h, Fragment, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from './i18n.js'
import { EmployeeWorkContext, employeeGroupWork } from './employee-work-context.js'

export function ConversationTools({ sessionId, actions }) {
  return h('button', { type: 'button', className: 'bt-conversation-tools', onClick: () => actions.inspectTools(sessionId), title: t('Inspect this conversation and open an employee browser') }, t('Tools & browser'))
}

export function ClassicEmployeeWork({ sessionId, roster, actions }) {
  const [open, setOpen] = useState(false)
  if (!employeeGroupWork(sessionId, roster).length) return null
  return h(Fragment, null,
    h('button', { type: 'button', className: 'bt-conversation-tools bt-work-updates-button', onClick: () => setOpen(true) }, t('Recent group work')),
    open ? createPortal(h('div', { className: 'bt-work-updates-shade', onClick: event => { if (event.target === event.currentTarget) setOpen(false) }, onKeyDown: event => { if (event.key === 'Escape') setOpen(false) } },
      h('section', { className: 'bt-work-updates-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('Employee work updates') },
        h('button', { type: 'button', autoFocus: true, onClick: () => setOpen(false) }, t('Close')),
        h(EmployeeWorkContext, { sessionId, roster, actions, expanded: true, onOpenConversation: id => { setOpen(false); actions.openSession(id) } }))), document.body) : null)
}

// Kept outside the Bot surface: opening a native browser withdraws that surface.
export function NativeBrowserNotice({ useUi, useSurface, useRoster, actions }) {
  const browser = useUi(state => state.nativeBrowser)
  const mode = useSurface(state => state.mode)
  const roster = useRoster(state => state)
  if (!browser || mode !== 'agent') return null
  const employee = roster.byId[browser.botId]?.name
  const group = roster.roomsById[browser.roomId]?.name
  return h('aside', { className: 'bt-native-browser-notice', 'aria-label': t('Employee browser') },
    h('style', null, CONVERSATION_TOOLS_CSS),
    employee ? h('strong', null, [employee, group].filter(Boolean).join(' · ')) : null,
    h('span', { role: browser.error ? 'alert' : 'status' }, browser.error ?? t(browser.loading ? 'Opening employee browser…' : 'Browser tab opened in the employee execution view.')),
    h('button', { type: 'button', onClick: () => actions.setSurface('bot') }, t('Back to Bot')),
    h('button', { type: 'button', onClick: actions.closeNativeBrowserNotice }, t('Close')))
}

export const CONVERSATION_TOOLS_CSS = `
.bt-conversation-tools{pointer-events:auto;flex:none;border:1px solid var(--bt-line,#dce3e8);border-radius:10px;padding:5px 9px;background:var(--bt-card,#fff);color:var(--bt-ink-2,#64748b);font:11px/1.5 system-ui;cursor:pointer}.bt-conversation-tools:hover{color:var(--bt-ink,#334155);background:var(--bt-hover,#f1f5f9)}.bt-conversation-tools:focus-visible{outline:2px solid var(--bt-accent,#26745e);outline-offset:2px}.bt-canvas-session>.bt-conversation-tools{align-self:flex-end;margin:6px 14px 0}.bt-head>.bt-conversation-tools{position:absolute;right:14px;max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-native-browser-notice{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483100;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 28px);padding:10px 14px;border:1px solid #dce3e8;border-radius:12px;background:#fffffff2;backdrop-filter:blur(16px);box-shadow:0 8px 36px #0f172a20;color:#334155;font:12px/1.5 system-ui}.bt-native-browser-notice>span{overflow-wrap:anywhere}.bt-native-browser-notice button{flex:none;border:1px solid #dce3e8;border-radius:7px;padding:4px 8px;background:#f1f5f9;color:#334155;cursor:pointer;font:inherit}
.bt-head>.bt-work-updates-button{right:auto;left:14px;max-width:28%}.bt-work-updates-shade{position:fixed;inset:0;z-index:2147483100;display:grid;place-items:center;padding:24px;background:#0f172a24;backdrop-filter:blur(7px);pointer-events:auto}.bt-work-updates-dialog{width:min(640px,100%);max-height:75vh;overflow:auto;border:1px solid var(--bt-line,#dce3e8);border-radius:18px;padding:16px;background:var(--bt-main,#fff);color:var(--bt-ink,#334155);box-shadow:0 18px 64px #0f172a26}.bt-work-updates-dialog>button{display:block;margin-left:auto;border:0;border-radius:8px;padding:6px 12px;cursor:pointer}.bt-work-updates-dialog .bt-employee-work{max-height:none}.bt-work-updates-dialog .bt-employee-work>summary{pointer-events:none}
`
