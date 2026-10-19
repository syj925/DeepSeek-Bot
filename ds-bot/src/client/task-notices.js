import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotAvatar } from './mark.js'
import { CloseIcon } from './icons.js'
import { dateLocale, t } from './i18n.js'

export function BellIcon() {
  return h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4' }))
}

export function TaskNotificationButton({ useTaskNotices, actions }) {
  const count = useTaskNotices(state => state.items.filter(item => !state.read.includes(item.id)).length)
  return h('button', { type: 'button', className: 'bt-round bt-notice-bell', title: t('Task notifications'), 'aria-label': `${t('Task notifications')}${count ? ` · ${count}` : ''}`, onClick: actions.toggleTaskNotices }, h(BellIcon), count ? h('span', { className: 'bt-notice-badge' }, count > 9 ? '9+' : count) : null)
}

function Delivery({ item, roster, actions }) {
  const bot = roster.byId[item.botId]
  const open = () => actions.openTaskConversation(item)
  return h('div', { className: 'bt-notice-delivery', role: 'button', tabIndex: 0,
    'aria-label': `${bot?.name ?? item.name} · ${t('Open conversation')}`,
    onClick: event => { if (!event.target.closest('button')) open() },
    onKeyDown: event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); open() } } },
    bot ? h(BotAvatar, { bot, size: 38, state: 'idle' }) : h('span', { className: 'bt-notice-check' }, '✓'),
    h('div', { className: 'bt-notice-copy' },
      h('div', { className: 'bt-notice-meta' }, h('strong', null, bot?.name ?? item.name), h('span', { 'data-message': item.kind === 'message' || undefined }, t(item.kind === 'message' ? 'New message' : 'Task completed'))),
      item.kind !== 'message' ? h('div', { className: 'bt-notice-title', title: item.title }, item.title) : null,
      h('p', null, item.summary),
      item.files.length ? h('div', { className: 'bt-notice-files' }, item.files.map(file => h('button', { key: file.path, type: 'button', title: file.path, onClick: () => actions.openTaskResult(item, file) }, '↗ ', file.name))) : null,
      item.files.length ? h('div', { className: 'bt-notice-actions' },
        h('button', { type: 'button', className: 'bt-notice-primary', onClick: () => actions.openTaskResult(item, item.files[0]) }, t('View result'))) : null))
}

function Toast({ ids, children, dismiss, onOpen }) {
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(6000), started = useRef(0), timer = useRef(), exit = useRef()
  const element = useRef(null)
  const key = ids.join(',')
  const hide = () => { if (exit.current) return; clearTimeout(timer.current); setLeaving(true); exit.current = setTimeout(() => dismiss(ids), 180) }
  const pause = () => { clearTimeout(timer.current); if (started.current) remaining.current = Math.max(0, remaining.current - (Date.now() - started.current)); started.current = 0 }
  const resume = () => {
    clearTimeout(timer.current)
    if (exit.current || document.hidden || !document.hasFocus() || element.current?.matches(':hover') || element.current?.contains(document.activeElement)) return
    started.current = Date.now(); timer.current = setTimeout(hide, remaining.current)
  }
  useEffect(() => {
    remaining.current = 6000; started.current = 0; exit.current = undefined; setLeaving(false); resume()
    const visibility = () => { if (document.hidden) pause(); else resume() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', pause); window.addEventListener('focus', resume)
    return () => { clearTimeout(timer.current); clearTimeout(exit.current); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', pause); window.removeEventListener('focus', resume) }
  }, [key])
  return h('article', { ref: element, className: 'bt-task-toast', 'data-leaving': leaving || undefined,
    onClick: event => { if (!event.target.closest('button,[role="button"]')) onOpen?.() },
    onMouseEnter: pause, onMouseLeave: resume, onFocus: pause, onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) queueMicrotask(resume) } }, children,
    h('button', { type: 'button', className: 'bt-icon-btn bt-notice-dismiss', 'aria-label': t('Dismiss'), onClick: hide }, h(CloseIcon)))
}

export function TaskNotifications({ useTaskNotices, useRoster, actions }) {
  const state = useTaskNotices(value => value), roster = useRoster(value => value)
  const [mounted, setMounted] = useState(state.open), [permission, setPermission] = useState(globalThis.Notification?.permission ?? 'unsupported')
  const center = useRef(null)
  useEffect(() => {
    if (state.open) { setMounted(true); return undefined }
    const timer = setTimeout(() => setMounted(false), 180)
    return () => clearTimeout(timer)
  }, [state.open])
  useEffect(() => {
    if (!state.open) return undefined
    center.current?.focus()
    const close = event => { if (event.key === 'Escape' || event.type === 'pointerdown' && !center.current?.contains(event.target) && !event.target.closest?.('.bt-notice-bell')) actions.closeTaskNotices() }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [state.open, mounted])
  const items = state.toasts.map(id => state.items.find(item => item.id === id)).filter(Boolean)
  const visible = items.length > 3 ? items.slice(0, 2) : items
  const more = items.length > 3 ? items.slice(2).map(item => item.id) : []
  return h('div', { className: 'bt-task-notifications' },
    h('div', { className: 'bt-task-toast-stack', 'aria-live': 'polite', 'aria-relevant': 'additions' }, !state.open && visible.map(item => h(Toast, { key: item.id, ids: [item.id], dismiss: actions.dismissTaskNotices, onOpen: () => actions.openTaskConversation(item) }, h(Delivery, { item, roster, actions }))),
      !state.open && more.length ? h(Toast, { key: 'more', ids: more, dismiss: actions.dismissTaskNotices }, h('div', { className: 'bt-notice-summary' }, h('strong', null, t('{count} more notifications', { count: more.length })), h('button', { type: 'button', onClick: actions.toggleTaskNotices }, t('View all')))) : null),
    mounted ? h('section', { ref: center, tabIndex: -1, role: 'dialog', 'aria-label': t('Task notifications'), className: 'bt-notice-center', 'data-open': state.open || undefined },
      h('header', null, h(BellIcon), h('strong', null, t('Task notifications')), h('button', { type: 'button', onClick: actions.readAllTaskNotices }, t('Mark all read')), h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Close'), onClick: actions.closeTaskNotices }, h(CloseIcon))),
      h('div', { className: 'bt-notice-history' }, state.items.length ? state.items.map(item => h('article', { key: item.id, 'data-unread': !state.read.includes(item.id) || undefined }, h('time', null, new Date(item.at).toLocaleString(dateLocale())), h(Delivery, { item, roster, actions }))) : h('div', { className: 'bt-notice-empty' }, h(BellIcon), t('Completed tasks will appear here.'))),
      h('footer', null,
        h('label', null, h('input', { type: 'checkbox', checked: state.enabled, onChange: event => actions.configureTaskNotices({ enabled: event.target.checked }) }), t('Completion pop-ups')),
        h('label', null, h('input', { type: 'checkbox', checked: state.sound, onChange: event => actions.configureTaskNotices({ sound: event.target.checked }) }), t('Notification sound')),
        permission === 'default' ? h('button', { type: 'button', onClick: async () => { try { setPermission(await Notification.requestPermission()) } catch { setPermission('unsupported') } } }, t('Enable system notifications')) : permission === 'denied' ? h('small', null, t('System notifications are blocked in your system or browser settings.')) : permission === 'unsupported' ? h('small', null, t('System notifications are unavailable here.')) : null)) : null)
}

export const TASK_NOTICE_CSS = `
.bt-notice-bell{position:relative}.bt-notice-badge{position:absolute;right:-4px;top:-4px;background:#26745e;color:#fff;border-radius:10px;padding:0 4px;font:10px/15px system-ui;min-width:15px}
.bt-task-toast-stack{position:fixed;right:24px;bottom:24px;z-index:1050;display:flex;flex-direction:column;gap:12px;width:min(370px,calc(100vw - 32px));pointer-events:none}
.bt-task-toast,.bt-notice-center{color:var(--bt-ink,#20232a);background:var(--bt-card,#fff);border:1px solid var(--bt-line-2,#e6e8ec);box-shadow:0 10px 40px #00000016;border-radius:18px;pointer-events:auto}
.bt-task-toast{cursor:pointer;position:relative;padding:20px 30px 18px 18px;animation:bt-task-arrive .32s cubic-bezier(.2,.8,.2,1)}
.bt-task-toast[data-leaving]{opacity:0;transform:translateX(24px) scale(.98);transition:opacity .18s,transform .18s}
.bt-notice-delivery{cursor:pointer;outline-offset:5px;border-radius:8px;display:flex;align-items:flex-start;gap:12px}.bt-notice-copy{flex:1;min-width:0}.bt-notice-meta{display:flex;align-items:center;gap:8px;font-size:12px}.bt-notice-meta strong{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-notice-meta span{color:#278368;font-size:11px}.bt-notice-meta span:before{content:'✓';margin-right:4px}
.bt-notice-meta span[data-message]:before{content:'•'}.bt-notice-title{margin-top:8px;font-size:14px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.bt-notice-copy p{margin:5px 0 12px;font-size:12px;line-height:1.65;color:var(--bt-ink-2,#69717d);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.bt-task-notifications button{font:inherit;cursor:pointer}.bt-notice-actions{display:flex;gap:8px}.bt-notice-actions button,.bt-notice-files button,.bt-notice-summary button,.bt-notice-center header>button:not(.bt-icon-btn),.bt-notice-center footer button{border:0;border-radius:7px;padding:5px 9px;background:var(--bt-hover,#f3f5f7);color:inherit;font-size:11px}.bt-notice-actions .bt-notice-primary{background:#26745e;color:#fff}.bt-notice-dismiss{position:absolute;right:7px;top:7px}.bt-notice-check{display:grid;place-items:center;width:38px;height:38px;background:#2d8a6815;color:#26745e;border-radius:12px;flex-shrink:0}
.bt-notice-files{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 10px}.bt-notice-files button{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-notice-summary{display:flex;flex-direction:column;gap:10px;align-items:flex-start;font-size:13px}
.bt-notice-center{position:fixed;right:24px;bottom:24px;z-index:1060;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 80px);display:flex;flex-direction:column;opacity:0;transform:translateY(12px);transition:opacity .18s,transform .18s;outline:none}.bt-notice-center[data-open]{opacity:1;transform:none;animation:bt-task-arrive .25s ease-out}.bt-notice-center header{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid var(--bt-line-2,#e6e8ec);font-size:14px}.bt-notice-center header strong{flex:1}.bt-notice-history{overflow:auto;overscroll-behavior:contain;min-height:120px}.bt-notice-history article{padding:16px;border-bottom:1px solid var(--bt-line-2,#e6e8ec)}.bt-notice-history article[data-unread]{background:#2d8a6808}.bt-notice-history time{display:block;text-align:right;font-size:10px;color:var(--bt-ink-2);margin-bottom:10px}.bt-notice-center footer{padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;font-size:12px}.bt-notice-center footer label{display:flex;align-items:center;gap:6px}.bt-notice-center footer small{color:var(--bt-ink-2);line-height:1.5}.bt-notice-empty{padding:42px 20px;display:flex;align-items:center;flex-direction:column;gap:16px;font-size:12px;color:var(--bt-ink-2)}
@keyframes bt-task-arrive{from{opacity:0;transform:translate(16px,10px) scale(.97)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.bt-task-toast,.bt-notice-center{animation:none;transition:none}.bt-task-toast[data-leaving]{transition:none}}
`
