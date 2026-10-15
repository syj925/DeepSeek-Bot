import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BotAvatar } from './mark.js'
import { ArrowUpIcon, ChatsIcon, ClockIcon } from './icons.js'
import { useSchedules, timingText } from './schedules.js'
import { dateLocale, hostText, t } from './i18n.js'

const WIDGET_KEY = 'ds-bot:spatial-widgets'
const DRAFT_KEY = 'ds-bot:canvas-quick-drafts'
const TOGGLE_EVENT = 'ds-bot:spatial-widget-toggle'
const SIZES = { quick: { width: 360, height: 200 }, agenda: { width: 260, height: 220 } }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const browserStorage = () => { try { return globalThis.localStorage } catch { return undefined } }
function readObject(key, storage) {
  try { const value = JSON.parse(storage.getItem(key)); return record(value) ? value : {} } catch { return {} }
}

export function readSpatialWidget(id, storage = browserStorage()) {
  const value = readObject(WIDGET_KEY, storage)[id]
  return { x: Number.isFinite(value?.x) ? value.x : null, y: Number.isFinite(value?.y) ? value.y : null, folded: typeof value?.folded === 'boolean' ? value.folded : null }
}

export function writeSpatialWidget(id, value, storage = browserStorage()) {
  try {
    const saved = readObject(WIDGET_KEY, storage)
    saved[id] = { x: Number.isFinite(value.x) ? value.x : null, y: Number.isFinite(value.y) ? value.y : null, folded: value.folded === true }
    storage.setItem(WIDGET_KEY, JSON.stringify(saved))
  } catch { /* browser storage may be unavailable */ }
}

export function fitSpatialWidget(id, panel, area) {
  const size = SIZES[id] ?? SIZES.quick
  const availableWidth = Math.max(0, area.width - 24)
  const narrow = area.width < 720
  const folded = typeof panel.folded === 'boolean' ? panel.folded : narrow
  const minimumTop = id === 'agenda' && !folded && area.width < 1100 ? Math.max(104, area.minY ?? 12) + SIZES.quick.height + 12 : area.minY ?? 12
  const top = Math.max(12, Math.min(minimumTop, Math.max(12, area.height - 56)))
  const width = Math.min(folded ? narrow ? 150 : 184 : size.width, availableWidth)
  const height = Math.min(folded ? 44 : size.height, Math.max(0, area.height - top - 12))
  const defaultX = narrow ? id === 'agenda' && folded ? area.width - width - 12 : 12 : id === 'agenda' ? area.width - width - 24 : 360
  const defaultY = narrow ? top : Math.max(top, 104)
  return { ...panel, folded, x: Math.max(12, Math.min(panel.x ?? defaultX, area.width - width - 12)), y: Math.max(top, Math.min(panel.y ?? defaultY, area.height - height - 12)), width, height }
}

export function toggleSpatialWidget(id) {
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: id }))
}

export function FloatingWidget({ id, title, icon, children }) {
  const root = useRef(null), drag = useRef(null)
  const [panel, setPanel] = useState(() => readSpatialWidget(id))
  const [area, setArea] = useState({ width: 1200, height: 800, minY: 12 })
  const current = fitSpatialWidget(id, panel, area)
  const save = next => {
    const fitted = fitSpatialWidget(id, next, area)
    const value = { x: fitted.x, y: fitted.y, folded: fitted.folded }
    setPanel(value)
    writeSpatialWidget(id, value)
  }
  const toggle = () => save({ ...current, folded: !current.folded })
  useLayoutEffect(() => {
    const canvas = root.current?.closest('.bt-canvas')
    if (!canvas) return undefined
    const toolbar = canvas.querySelector('.bt-canvas-toolbar')
    const measure = () => {
      const box = canvas.getBoundingClientRect()
      const minY = toolbar ? toolbar.getBoundingClientRect().bottom - box.top + 12 : 12
      setArea({ width: box.width, height: box.height, minY })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    if (toolbar) observer.observe(toolbar)
    measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const receive = event => { if (event.detail === id) toggle() }
    window.addEventListener(TOGGLE_EVENT, receive)
    return () => window.removeEventListener(TOGGLE_EVENT, receive)
  }, [id, current.x, current.y, current.folded, area.width, area.height, area.minY])
  const finish = event => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handle = {
    onPointerDown: event => {
      if (event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      drag.current = { x: event.clientX, y: event.clientY, panel: current }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: event => {
      if (!drag.current) return
      const start = drag.current
      save({ ...start.panel, x: start.panel.x + event.clientX - start.x, y: start.panel.y + event.clientY - start.y })
    },
    onPointerUp: finish, onPointerCancel: finish,
    onKeyDown: event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!delta && event.key !== 'Home') return
      event.preventDefault(); event.stopPropagation()
      const step = event.shiftKey ? 24 : 8
      save(event.key === 'Home' ? { ...current, x: null, y: null } : { ...current, x: current.x + delta[0] * step, y: current.y + delta[1] * step })
    },
  }
  return h('section', {
    ref: root, className: `bt-spatial-widget bt-spatial-${id}`, 'aria-label': title, 'data-widget': id, 'data-folded': current.folded,
    style: { left: current.x, top: current.y, width: current.width, height: current.height },
    onPointerDown: event => event.stopPropagation(), onWheel: event => event.stopPropagation(),
  }, h('header', null,
    h('button', { type: 'button', className: 'bt-spatial-grip', 'aria-label': t('Move {name}', { name: title }), title: t('Drag to move · Arrow keys to adjust · Home to reset'), ...handle }, icon ? h(icon) : null, h('span', null, title)),
    h('button', { type: 'button', className: 'bt-spatial-fold', onClick: toggle, 'aria-expanded': !current.folded, 'aria-controls': `bt-spatial-body-${id}`, 'aria-label': t(current.folded ? 'Expand {name}' : 'Collapse {name}', { name: title }) }, current.folded ? '+' : '−')),
  h('div', { id: `bt-spatial-body-${id}`, className: 'bt-spatial-body', hidden: current.folded }, children))
}

export function readQuickDrafts(storage = browserStorage()) {
  return Object.fromEntries(Object.entries(readObject(DRAFT_KEY, storage)).filter(([, value]) => typeof value === 'string'))
}

function writeDraft(id, text) {
  try {
    const drafts = readQuickDrafts()
    if (text) drafts[id] = text
    else delete drafts[id]
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts))
  } catch { /* browser storage may be unavailable */ }
}

export function CanvasQuickMessage({ bot, actions }) {
  const [drafts, setDrafts] = useState(readQuickDrafts)
  const [sending, setSending] = useState({})
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState({})
  const draftsRef = useRef(drafts), pending = useRef(new Set()), revisions = useRef({}), mounted = useRef(true)
  draftsRef.current = drafts
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const id = bot?.id
  const draft = drafts[id] ?? ''
  const change = text => {
    if (!id) return
    revisions.current[id] = (revisions.current[id] ?? 0) + 1
    draftsRef.current = { ...draftsRef.current, [id]: text }
    setDrafts(draftsRef.current)
    setErrors(value => ({ ...value, [id]: '' })); setSent(value => ({ ...value, [id]: false }))
    writeDraft(id, text)
  }
  const send = async event => {
    event.preventDefault()
    const target = id, original = draftsRef.current[target] ?? '', text = original.trim()
    if (!target || !text || pending.current.has(target)) return
    const revision = revisions.current[target] ?? 0
    pending.current.add(target)
    setSending(value => ({ ...value, [target]: true })); setErrors(value => ({ ...value, [target]: '' })); setSent(value => ({ ...value, [target]: false }))
    try {
      await actions.send(target, text)
      if ((revisions.current[target] ?? 0) === revision) {
        if (readQuickDrafts()[target] === original) writeDraft(target, '')
        draftsRef.current = { ...draftsRef.current, [target]: '' }
        if (mounted.current) { setDrafts(draftsRef.current); setSent(value => ({ ...value, [target]: true })) }
      }
    } catch (error) {
      if (mounted.current) setErrors(value => ({ ...value, [target]: hostText(error?.message ?? t('Could not send message')) }))
    } finally {
      pending.current.delete(target)
      if (mounted.current) setSending(value => ({ ...value, [target]: false }))
    }
  }
  return h(FloatingWidget, { id: 'quick', title: t('Quick message'), icon: ChatsIcon },
    bot ? h('div', { className: 'bt-quick-person' }, h(BotAvatar, { bot, size: 56, live: false }),
      h('div', null, h('strong', null, bot.name), h('span', null, bot.role || t('Employee'))),
      h('button', { type: 'button', className: 'bt-spatial-link', onClick: () => actions.openCanvasEntity(bot.id), title: t('Open conversation'), 'aria-label': t('Open conversation') }, h(ChatsIcon)))
      : h('p', { className: 'bt-spatial-empty' }, t('Choose an employee to send a message')),
    bot ? h('form', { className: 'bt-quick-form', onSubmit: send },
      h('input', { value: draft, onChange: event => change(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }, placeholder: t('Message {name}', { name: bot.name }), 'aria-label': t('Send to {name}', { name: bot.name }), autoComplete: 'off' }),
      h('button', { type: 'submit', disabled: !draft.trim() || sending[id], 'aria-label': t(sending[id] ? 'Sending…' : 'Send'), title: t(sending[id] ? 'Sending…' : 'Send') }, h(ArrowUpIcon))) : null,
    bot ? h('div', { className: 'bt-quick-feedback' }, errors[id] ? h('span', { role: 'alert' }, errors[id]) : h('span', { role: 'status' }, sending[id] ? t('Sending…') : sent[id] ? t('Message sent') : t('Send to {name}', { name: bot.name }))) : null)
}

export function upcomingTasks(view) {
  return view?.available && Array.isArray(view.tasks) ? view.tasks.filter(task => task?.status === 'active' && Number.isFinite(Date.parse(task.scheduledAt))).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)) : []
}

const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
export function agendaWeek(now, tasks) {
  const today = new Date(now), first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7)
  const marked = new Set(tasks.map(task => dayKey(new Date(task.scheduledAt))))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index)
    return { date, today: dayKey(date) === dayKey(today), marked: marked.has(dayKey(date)) }
  })
}

export function CanvasAgenda({ actions, roster }) {
  const view = useSchedules(actions)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, [])
  const tasks = upcomingTasks(view)
  const date = new Intl.DateTimeFormat(dateLocale(), { month: 'long', day: 'numeric' }).format(now)
  return h(FloatingWidget, { id: 'agenda', title: `${t('Agenda')} · ${date}`, icon: ClockIcon },
    h('div', { className: 'bt-agenda-week', 'aria-label': date }, agendaWeek(now, tasks).map(day => h('span', { key: dayKey(day.date), 'data-today': day.today || undefined, 'data-task': day.marked || undefined, title: day.date.toLocaleDateString(dateLocale()) },
      h('small', null, day.date.toLocaleDateString(dateLocale(), { weekday: 'narrow' })), h('b', null, day.date.getDate()), h('i', { 'aria-hidden': true })))),
    view === null ? h('p', { className: 'bt-spatial-empty', role: 'status' }, t('Loading…'))
      : !view.available ? h('p', { className: 'bt-spatial-empty' }, t('Switch on Automation tasks on the Plugins page in Harness settings.'))
        : tasks.length === 0 ? h('p', { className: 'bt-spatial-empty' }, t('No upcoming tasks'))
          : h('div', { className: 'bt-agenda-tasks' }, tasks.slice(0, 3).map(task => {
            const owner = task.botId ? roster.byId[task.botId] : roster.roomsById[task.roomId]
            const next = new Date(task.scheduledAt).toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            return h('button', { type: 'button', className: 'bt-agenda-task', key: `${task.sessionId}:${task.id}`, title: [owner?.name, timingText(task)].filter(Boolean).join(' · '), onClick: () => actions.openSettings('schedules', task.botId ?? task.roomId) },
              h('strong', null, task.title), h('span', null, [owner?.name, next].filter(Boolean).join(' · ')))
          })),
    h('button', { type: 'button', className: 'bt-spatial-link bt-agenda-manage', onClick: () => actions.openSettings('schedules') }, t('Manage scheduled tasks')))
}

export const SPATIAL_WIDGET_CSS = `
.bt-spatial-widget{position:absolute;z-index:20;display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--bt-canvas-border);border-radius:24px;background:var(--bt-canvas-glass);box-shadow:var(--bt-canvas-shadow);color:var(--bt-ink);overflow:hidden;-webkit-backdrop-filter:blur(28px) saturate(120%);backdrop-filter:blur(28px) saturate(120%)}
.bt-spatial-widget:focus-within{z-index:21}
.bt-spatial-widget>header{display:flex;align-items:center;flex:none;height:42px;padding:0 8px;gap:4px;box-sizing:border-box}
.bt-spatial-grip{flex:1;min-width:0;display:flex;align-items:center;gap:7px;height:36px;border:0;border-radius:12px;padding:0 6px;background:none;color:inherit;font:inherit;font-size:12px;font-weight:600;text-align:start;touch-action:none;cursor:grab;user-select:none}
.bt-spatial-grip:active{cursor:grabbing}.bt-spatial-grip>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bt-spatial-grip>svg{flex:none;width:15px;height:15px;opacity:.7}
.bt-spatial-fold{flex:none;width:30px;height:30px;border:0;border-radius:50%;background:var(--bt-hover);color:var(--bt-ink-2);font:inherit;cursor:pointer}
.bt-spatial-widget button:focus-visible,.bt-quick-form input:focus-visible{outline:2px solid var(--bt-accent);outline-offset:-2px}
.bt-spatial-body{flex:1;min-height:0;overflow:auto;padding:0 14px 12px;scrollbar-width:thin}.bt-spatial-widget[data-folded=true]{border-radius:17px}.bt-spatial-widget[data-folded=true]>header{height:42px}
.bt-quick-person{display:flex;align-items:center;gap:12px;margin:0 0 10px}.bt-quick-person>.bt-mark{flex:none}.bt-quick-person>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.bt-quick-person strong{font-size:16px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-quick-person>div>span{font-size:12px;color:var(--bt-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-spatial-link{flex:none;padding:5px;border:0;border-radius:8px;background:none;color:var(--bt-ink-2);font:inherit;font-size:11px;cursor:pointer}.bt-spatial-link:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-quick-form{display:flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border:1px solid var(--bt-line-2);border-radius:24px;background:var(--bt-hover)}.bt-quick-form input{flex:1;min-width:0;width:0;height:28px;padding:0;border:0;background:none;color:var(--bt-ink);font:inherit;font-size:12px;outline:none}.bt-quick-form input::placeholder{color:var(--bt-ink-3)}.bt-quick-form>button{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:0;border-radius:50%;background:var(--bt-accent);color:var(--bt-accent-ink);cursor:pointer}.bt-quick-form>button:disabled{opacity:.4;cursor:default}
.bt-quick-feedback{min-height:16px;margin:5px 3px 0;font-size:10px;line-height:14px;color:var(--bt-ink-3);overflow-wrap:anywhere}.bt-quick-feedback [role=alert]{color:#ffc0b6}
.bt-spatial-empty{margin:8px 2px;font-size:12px;line-height:18px;color:var(--bt-ink-2)}.bt-agenda-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;margin-bottom:8px}.bt-agenda-week>span{display:flex;align-items:center;flex-direction:column;gap:0;padding:2px;border-radius:9px;font-size:10px;color:var(--bt-ink-2)}.bt-agenda-week small{font-size:9px;color:var(--bt-ink-3)}.bt-agenda-week b{font-weight:500}.bt-agenda-week i{width:3px;height:3px;margin-top:2px;border-radius:50%;background:transparent}.bt-agenda-week [data-today]{background:var(--bt-hover);color:var(--bt-ink)}.bt-agenda-week [data-task]>i{background:var(--bt-accent)}
.bt-agenda-tasks{display:flex;flex-direction:column;gap:5px}.bt-agenda-task{display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 10px;text-align:start;border:0;border-radius:12px;background:var(--bt-hover);color:var(--bt-ink);font:inherit;cursor:pointer}.bt-agenda-task strong{font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.bt-agenda-task>span{font-size:10px;color:var(--bt-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.bt-agenda-task:hover{background:var(--bt-active)}.bt-agenda-manage{display:block;margin:5px 0 0 auto}
@media (prefers-reduced-transparency:reduce){.bt-spatial-widget{background:var(--bt-card);-webkit-backdrop-filter:none;backdrop-filter:none}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.bt-spatial-widget{background:var(--bt-card)}}
@media (forced-colors:active){.bt-spatial-widget{background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}.bt-spatial-widget button{color:ButtonText;border:1px solid ButtonText;background:ButtonFace}.bt-quick-form{border-color:CanvasText}.bt-quick-form input{color:CanvasText}.bt-agenda-week [data-task]>i{background:Highlight}.bt-spatial-widget :is(.bt-spatial-empty,.bt-quick-feedback,.bt-quick-person>div>span,.bt-agenda-week>span,.bt-agenda-week small,.bt-agenda-task>span){color:CanvasText}}
@media (pointer:coarse){.bt-spatial-fold{width:36px;height:36px}.bt-quick-form>button{width:36px;height:36px}.bt-spatial-link{min-height:32px}}
`
