import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BotAvatar } from './mark.js'
import { ArrowUpIcon, ChatsIcon, ClockIcon } from './icons.js'
import { useSchedules, timingText } from './schedules.js'
import { dateLocale, hostText, t } from './i18n.js'
import { hiddenWidgets, setWidgetHidden } from './desktop-widgets.js'

const WIDGET_KEY = 'ds-bot:spatial-widgets'
const DRAFT_KEY = 'ds-bot:canvas-quick-drafts'
const TOGGLE_EVENT = 'ds-bot:spatial-widget-toggle'
const SIZES = { quick: { width: 360, height: 200 }, agenda: { width: 260, height: 220 } }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const browserStorage = () => { try { return globalThis.localStorage } catch { return undefined } }
function readObject(key, storage) {
  try { const value = JSON.parse(storage.getItem(key)); return record(value) ? value : {} } catch { return {} }
}
const widgetAnchor = value => record(value) ? Object.fromEntries(['right', 'bottom'].filter(edge => Number.isFinite(value[edge]) && value[edge] >= 0).map(edge => [edge, value[edge]])) : null
const anchorFields = value => { const anchor = widgetAnchor(value?.anchor); return anchor ? { anchor } : {} }
const placementFields = (id, value) => id === 'qibit-command' && Number.isFinite(value?.placement?.width) && value.placement.width > 0 && Number.isFinite(value?.placement?.height) && value.placement.height > 0 ? { placement: { width: value.placement.width, height: value.placement.height } } : {}
const widgetHome = value => record(value) && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y, ...anchorFields(value) } : null

export function readSpatialWidget(id, storage = browserStorage()) {
  const value = readObject(WIDGET_KEY, storage)[id]
  const home = widgetHome(value?.home)
  return { x: Number.isFinite(value?.x) ? value.x : null, y: Number.isFinite(value?.y) ? value.y : null, folded: typeof value?.folded === 'boolean' ? value.folded : null, ...anchorFields(value), ...placementFields(id, value), ...(home ? { home } : {}) }
}

export function writeSpatialWidget(id, value, storage = browserStorage()) {
  try {
    const saved = readObject(WIDGET_KEY, storage)
    const home = widgetHome(value.home)
    saved[id] = { x: Number.isFinite(value.x) ? value.x : null, y: Number.isFinite(value.y) ? value.y : null, folded: value.folded === true, ...anchorFields(value), ...placementFields(id, value), ...(home ? { home } : {}) }
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
  const anchor = widgetAnchor(panel.anchor)
  const x = anchor?.right !== undefined ? area.width - width - anchor.right : panel.x ?? defaultX
  const y = anchor?.bottom !== undefined ? area.height - height - anchor.bottom : panel.y ?? defaultY
  return { ...panel, folded, x: Math.max(12, Math.min(x, area.width - width - 12)), y: Math.max(top, Math.min(y, area.height - height - 12)), width, height }
}

const edgeAnchor = (box, area) => Object.fromEntries([
  ['right', area.width - box.x - box.width], ['bottom', area.height - box.y - box.height],
].filter(([, gap]) => gap >= 0 && gap <= 64))

export function anchorSpatialWidget(id, panel, area) {
  const current = fitSpatialWidget(id, panel, area)
  const home = widgetHome(panel.home)
  return { ...panel, folded: current.folded, anchor: widgetAnchor(panel.anchor) ?? edgeAnchor(current, area), ...(home ? { home: { ...home, anchor: widgetAnchor(home.anchor) ?? edgeAnchor(fitSpatialWidget(id, { ...home, folded: true }, area), area) } } : {}) }
}

export function toggleSpatialWidget(id) {
  if (hiddenWidgets().includes(id)) { setWidgetHidden(id, false); return }
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: id }))
}

export function avoidSpatialWidgets(id, panel, area, peers) {
  const fitted = fitSpatialWidget(id, panel, area)
  const free = box => peers.every(peer => box.x + box.width + 12 <= peer.x || peer.x + peer.width + 12 <= box.x || box.y + box.height + 12 <= peer.y || peer.y + peer.height + 12 <= box.y)
  if (free(fitted)) return fitted
  const xs = [fitted.x, 12, area.width - fitted.width - 12]
  const ys = [fitted.y, area.minY ?? 12, area.height - fitted.height - 12]
  for (const peer of peers) {
    xs.push(peer.x - fitted.width - 12, peer.x + peer.width + 12)
    ys.push(peer.y - fitted.height - 12, peer.y + peer.height + 12)
  }
  const candidates = xs.flatMap(x => ys.map(y => fitSpatialWidget(id, { ...fitted, anchor: undefined, x, y }, area))).filter(free)
  candidates.sort((a, b) => Math.hypot(a.x - fitted.x, a.y - fitted.y) - Math.hypot(b.x - fitted.x, b.y - fitted.y))
  // Tight spaces keep the user's placement rather than pushing other content.
  const next = candidates[0] ?? fitted
  // Temporary avoidance uses absolute coordinates only, never a persistent edge anchor.
  const { anchor: _anchor, ...placement } = next
  return placement
}

export function toggleWidgetPlacement(id, panel, area) {
  const current = fitSpatialWidget(id, panel, area)
  if (!current.folded) {
    const home = widgetHome(panel.home)
    const collapsed = fitSpatialWidget(id, { ...current, folded: true }, area)
    const right = current.x + current.width / 2 > area.width / 2
    return { x: home?.x ?? (right ? current.x + current.width - collapsed.width : current.x), y: home?.y ?? current.y, folded: true, ...anchorFields(home ?? panel) }
  }
  const expanded = fitSpatialWidget(id, { ...current, folded: false }, area)
  const right = current.x + current.width / 2 > area.width / 2
  return { x: right ? current.x + current.width - expanded.width : current.x, y: current.y, folded: false, ...anchorFields(panel), home: { x: panel.x ?? current.x, y: panel.y ?? current.y, ...anchorFields(panel) } }
}

export function moveWidgetPlacement(id, panel, visible, dx, dy, area) {
  const next = fitSpatialWidget(id, { ...visible, anchor: undefined, x: visible.x + dx, y: visible.y + dy }, area)
  const home = widgetHome(panel.home)
  const homeBox = home ? fitSpatialWidget(id, { ...home, folded: true }, area) : null
  const movedHome = home ? { x: (home.anchor ? homeBox.x : home.x) + next.x - visible.x, y: (home.anchor ? homeBox.y : home.y) + next.y - visible.y } : null
  return { x: next.x, y: next.y, folded: next.folded, ...(panel.anchor ? { anchor: edgeAnchor(next, area) } : {}), ...(movedHome ? { home: { ...movedHome, ...(panel.anchor ? { anchor: edgeAnchor({ ...movedHome, width: homeBox.width, height: homeBox.height }, area) } : {}) } } : {}) }
}

function widgetPeers(node) {
  const canvas = node?.closest('.bt-canvas')
  if (!canvas) return []
  const origin = canvas.getBoundingClientRect()
  const frame = canvas.closest('.bt-canvas-frame') ?? canvas.parentElement
  return [...canvas.querySelectorAll('.bt-spatial-widget'), ...frame.querySelectorAll('.bt-floating-team')]
    .filter(peer => peer !== node).map(peer => {
      const box = peer.getBoundingClientRect()
      return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height }
    }).filter(box => box.width > 0 && box.height > 0)
}

export function FloatingWidget({ id, title, icon, children }) {
  const root = useRef(null), drag = useRef(null)
  const [panel, setPanel] = useState(() => readSpatialWidget(id))
  const [temporary, setTemporary] = useState(null)
  const [area, setArea] = useState({ width: 1200, height: 800, minY: 12, measured: false })
  const current = fitSpatialWidget(id, temporary ?? panel, area)
  const save = next => {
    const preferred = area.measured ? anchorSpatialWidget(id, next, area) : next
    setPanel(preferred)
    writeSpatialWidget(id, preferred)
  }
  const raise = () => {
    const canvas = root.current?.closest('.bt-canvas')
    canvas?.querySelectorAll('.bt-spatial-widget').forEach(node => { node.dataset.raised = String(node === root.current) })
  }
  const toggle = () => {
    raise()
    const next = toggleWidgetPlacement(id, panel, area)
    setTemporary(next.folded ? null : avoidSpatialWidgets(id, next, area, widgetPeers(root.current)))
    save(next)
  }
  useLayoutEffect(() => {
    const canvas = root.current?.closest('.bt-canvas')
    if (!canvas) return undefined
    const toolbar = canvas.querySelector('.bt-canvas-toolbar')
    const measure = () => {
      const box = canvas.getBoundingClientRect()
      if (box.width <= 24 || box.height <= 56) return
      const minY = toolbar ? toolbar.getBoundingClientRect().bottom - box.top + 12 : 12
      setArea({ width: box.width, height: box.height, minY, measured: true })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    if (toolbar) observer.observe(toolbar)
    measure()
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!area.measured) return
    // Migrate old coordinates only after measuring the real viewport.
    const preferred = anchorSpatialWidget(id, panel, area)
    if (!panel.anchor) save(preferred)
    // Avoidance is a display offset, never the user's saved placement.
    setTemporary(current.folded ? null : avoidSpatialWidgets(id, preferred, area, widgetPeers(root.current)))
  }, [area.measured, area.width, area.height, area.minY])
  useEffect(() => {
    const receive = event => { if (event.detail === id) toggle() }
    window.addEventListener(TOGGLE_EVENT, receive)
    return () => window.removeEventListener(TOGGLE_EVENT, receive)
  }, [id, panel, area.width, area.height, area.minY])
  const finish = event => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handle = {
    onPointerDown: event => {
      if (event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      drag.current = { x: event.clientX, y: event.clientY, panel, visible: current }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: event => {
      if (!drag.current) return
      const start = drag.current
      setTemporary(null)
      save(moveWidgetPlacement(id, start.panel, start.visible, event.clientX - start.x, event.clientY - start.y, area))
    },
    onPointerUp: finish, onPointerCancel: finish,
    onKeyDown: event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!delta && event.key !== 'Home') return
      event.preventDefault(); event.stopPropagation()
      const step = event.shiftKey ? 24 : 8
      setTemporary(null)
      save(event.key === 'Home' ? { x: null, y: null, folded: current.folded } : moveWidgetPlacement(id, panel, current, delta[0] * step, delta[1] * step, area))
    },
  }
  return h('section', {
    ref: root, className: `bt-spatial-widget bt-spatial-${id}`, 'aria-label': title, 'data-widget': id, 'data-folded': current.folded,
    style: { left: current.x, top: current.y, width: current.width, height: current.height },
    onPointerDownCapture: raise, onFocusCapture: raise,
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
.bt-spatial-widget{position:absolute;z-index:20;display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--glass-border,rgba(255,255,255,.85));border-radius:24px;background:#f8f8f8;box-shadow:var(--glass-shadow,0 8px 28px rgba(0,0,0,.05),inset 0 1px 0 rgba(255,255,255,.8));color:var(--text-primary,#262626);overflow:hidden;transition:border-color .14s ease,box-shadow .14s ease}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .bt-spatial-widget{background:var(--glass-floating,rgba(255,255,255,.65));-webkit-backdrop-filter:blur(var(--glass-blur,24px));backdrop-filter:blur(var(--glass-blur,24px))}
}
.bt-spatial-widget:focus-within{z-index:21;border-color:rgba(0,0,0,.15)}
.bt-spatial-widget>header{display:flex;align-items:center;flex:none;height:40px;padding:0 8px 0 10px;gap:6px;box-sizing:border-box}
.bt-spatial-grip{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:32px;border:0;border-radius:8px;padding:0 4px;background:none;color:inherit;font:inherit;font-size:12px;font-weight:600;letter-spacing:-0.01em;text-align:start;touch-action:none;cursor:grab;user-select:none}
.bt-spatial-grip:active{cursor:grabbing}.bt-spatial-grip>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bt-spatial-grip>svg{flex:none;width:15px;height:15px;opacity:.75}
.bt-spatial-fold{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid rgba(255,255,255,.9);border-radius:8px;background:rgba(255,255,255,.9);color:var(--text-primary,#262626);font:inherit;font-size:14px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.03);transition:background-color .12s ease,color .12s ease,transform .12s cubic-bezier(0.16,1,0.3,1)}
.bt-spatial-fold:hover{background:#ffffff;box-shadow:0 3px 8px rgba(0,0,0,.06)}
.bt-spatial-fold:active{transform:scale(0.94)}
.bt-spatial-widget button:focus-visible{outline:2px solid #888;outline-offset:2px}
.bt-spatial-body{flex:1;min-height:0;overflow:auto;padding:0 14px 14px;scrollbar-width:thin}.bt-spatial-widget[data-folded=true]{border-radius:18px}.bt-spatial-widget[data-folded=true]>header{height:40px}
.bt-quick-person{display:flex;align-items:center;gap:10px;margin:2px 0 10px}.bt-quick-person>.bt-mark{flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}.bt-quick-person>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.bt-quick-person strong{font-size:13px;font-weight:600;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary,#262626)}.bt-quick-person>div>span{font-size:11px;color:var(--text-secondary,#757575);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-spatial-link{flex:none;padding:4px 8px;border:1px solid transparent;border-radius:7px;background:none;color:var(--text-secondary,#757575);font:inherit;font-size:11px;font-weight:500;cursor:pointer;transition:background-color .12s ease,color .12s ease}.bt-spatial-link:hover{background:rgba(0,0,0,.04);color:var(--text-primary,#262626)}
.bt-quick-form{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 12px;border:1px solid var(--divider,rgba(0,0,0,.06));border-radius:12px;background:rgba(255,255,255,.75);transition:border-color .14s ease,box-shadow .14s ease}
.bt-quick-form:focus-within{border-color:rgba(56,120,250,.45);box-shadow:0 0 0 2px rgba(56,120,250,.12);outline:none}
.bt-quick-form input{flex:1;min-width:0;width:0;height:26px;padding:0;border:0;background:none;color:var(--text-primary,#262626);font:inherit;font-size:12px;outline:none!important;box-shadow:none!important}
.bt-quick-form input:focus,.bt-quick-form input:focus-visible{outline:none!important;box-shadow:none!important;border:none!important}
.bt-quick-form input::placeholder{color:var(--text-secondary,#757575)}.bt-quick-form>button{display:flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;border:0;border-radius:7px;background:var(--text-primary,#262626);color:#ffffff;cursor:pointer;transition:transform .12s ease,opacity .12s ease}.bt-quick-form>button:active:not(:disabled){transform:scale(0.92)}.bt-quick-form>button:disabled{opacity:.35;cursor:default}
.bt-quick-feedback{min-height:16px;margin:5px 3px 0;font-size:11px;line-height:15px;color:var(--text-secondary,#757575);overflow-wrap:anywhere}.bt-quick-feedback [role=alert]{color:#dc2626}
.bt-spatial-empty{margin:8px 2px;font-size:12px;line-height:18px;color:var(--text-secondary,#757575)}.bt-agenda-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin-bottom:8px}.bt-agenda-week>span{display:flex;align-items:center;flex-direction:column;gap:1px;padding:3px 2px;border-radius:8px;font-size:10px;font-variant-numeric:tabular-nums;color:var(--text-secondary,#757575)}.bt-agenda-week small{font-size:9px;color:var(--text-secondary,#757575);text-transform:uppercase}.bt-agenda-week b{font-weight:600}.bt-agenda-week i{width:3px;height:3px;margin-top:2px;border-radius:50%;background:transparent}.bt-agenda-week [data-today]{background:rgba(255,255,255,.9);color:var(--text-primary,#262626);box-shadow:0 1px 3px rgba(0,0,0,.04)}.bt-agenda-week [data-task]>i{background:var(--bt-accent,#10a37f)}
.bt-agenda-tasks{display:flex;flex-direction:column;gap:5px}.bt-agenda-task{display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 10px;text-align:start;border:1px solid var(--divider,rgba(0,0,0,.06));border-radius:10px;background:rgba(255,255,255,.8);color:var(--text-primary,#262626);font:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.02);transition:background-color .12s ease,border-color .12s ease}.bt-agenda-task strong{font-size:11px;font-weight:600;letter-spacing:-0.005em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.bt-agenda-task>span{font-size:10px;color:var(--text-secondary,#757575);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.bt-agenda-task:hover{background:#ffffff;border-color:rgba(0,0,0,.1)}.bt-agenda-manage{display:block;margin:6px 0 0 auto}
@media (prefers-reduced-transparency:reduce){.bt-spatial-widget{background:#f8f8f8;-webkit-backdrop-filter:none;backdrop-filter:none}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.bt-spatial-widget{background:#f8f8f8}}
@media (forced-colors:active){.bt-spatial-widget{background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}.bt-spatial-widget button{color:ButtonText;border:1px solid ButtonText;background:ButtonFace}.bt-quick-form{border-color:CanvasText}.bt-quick-form input{color:CanvasText}.bt-agenda-week [data-task]>i{background:Highlight}.bt-spatial-widget :is(.bt-spatial-empty,.bt-quick-feedback,.bt-quick-person>div>span,.bt-agenda-week>span,.bt-agenda-week small,.bt-agenda-task>span){color:CanvasText}}
@media (pointer:coarse){.bt-spatial-fold{width:36px;height:36px}.bt-quick-form>button{width:36px;height:36px}.bt-spatial-link{min-height:32px}}
`
