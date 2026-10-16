import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotAvatar, RoomAvatar } from './mark.js'
import { previewOf } from './text.js'
import { PlusIcon, PeopleIcon, ChatsIcon, GearIcon, CloseIcon, FolderIcon, DotsIcon, PencilIcon, InfoIcon, CalendarIcon, SearchIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { ROOM_MODES, shownMode } from './group-settings.js'
import { memberWork, busyMembers, summaryText } from './member-status.js'
import { CanvasSession, canvasSessionId } from './canvas-session.js'
import { CanvasQuickMessage, CanvasAgenda, SPATIAL_WIDGET_CSS, toggleSpatialWidget } from './spatial-widgets.js'
import { CanvasWallpaper } from './canvas-wallpaper.js'
import { addDraftMembers, createEmptyGroup, collapseWindow, groupWindows, resizeWindow, setCanvasSelection, setWindowCompact, ungroupWindows, windowHeight, windowWidth } from './canvas-state.js'
import { fixedDesktop, moveDesktop } from './canvas-desktop.js'
import { t } from './i18n.js'
import { MAIN_AGENT_DRAG, overlapMain, canvasDropPoint, groupDropTarget, marqueeWindows, selectedMains } from './canvas-collaboration.js'
import { MainAgentGroup, MAIN_GROUP_CSS } from './main-agent-group.js'
import { MAIN_AGENT_POINTER } from './main-agent-drag.js'

const button = (label, onClick, icon, extra = {}) => h('button', { type: 'button', className: 'bt-canvas-button', onClick, ...extra }, icon ? h(icon) : null, label)
const entityOf = (window, roster) => window.kind === 'room' ? roster.roomsById[window.entityId] : roster.byId[window.entityId]
const employeesOf = (windows, ids, roster) => [...new Set(windows.filter(window => window.open && window.kind === 'bot' && ids.includes(window.id) && roster.byId[window.entityId]).map(window => window.entityId))]

function RoomSummary({ room, roster, work, actions }) {
  const admin = roster.byId[room.admin]
  const mode = t(ROOM_MODES.find(([id]) => id === shownMode(room, roster))?.[1] ?? 'Everyone')
  const members = memberWork(room, work).filter(entry => roster.byId[entry.id])
  return h('div', { className: 'bt-canvas-room-summary' },
    h('button', { type: 'button', className: 'bt-canvas-room-mode', onClick: () => actions.openSettings('groups', room.id), title: t('Group settings') },
      mode, ' · ', admin ? t('Admin {name}', { name: admin.name }) : t('No admin')),
    h('div', { className: 'bt-canvas-members', 'aria-label': t('Members · {count}', { count: members.length }) },
      members.slice(0, 3).map(entry => {
        const bot = roster.byId[entry.id]
        return h('button', {
          type: 'button', onClick: () => actions.openCanvasEntity(bot.id), 'aria-label': bot.name,
          key: bot.id, className: 'bt-canvas-button bt-canvas-member', 'data-state': entry.state,
          title: [bot.name, room.admin === bot.id ? t('Admin') : null, entry.state === 'ask' ? t('Waiting for your approval') : entry.state === 'work' ? t('Working') : t('Available')].filter(Boolean).join(' · '),
        }, h(BotAvatar, { bot, size: 28, main: room.admin === bot.id }), h('span', null, bot.name))
      }),
      members.length > 3 ? button(`+${members.length - 3}`, () => actions.showDetails(room.id), null, { 'aria-label': t('Members · {count}', { count: members.length }) }) : null))
}

function GroupTitle({ group, start, actions }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const cancelled = useRef(false)
  const edit = () => { cancelled.current = false; setName(group.name); setEditing(true) }
  const save = () => {
    if (!cancelled.current && name.trim()) actions.updateCanvas(state => ({ ...state, groups: state.groups.map(value => value.id === group.id ? { ...value, name: name.trim().slice(0, 100) } : value) }))
    setEditing(false)
  }
  return editing ? h('input', { autoFocus: true, className: 'bt-canvas-group-name', 'aria-label': t('Window group name'), value: name, maxLength: 100,
    onChange: event => setName(event.target.value), onBlur: save,
    onKeyDown: event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur() } else if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false) } },
  }) : h('div', { className: 'bt-canvas-group-title' },
    button(group.name || t('Window group'), null, FolderIcon, { onPointerDown: event => start(event, 'group', group.id), title: t(group.draft ? 'Drag employees here' : 'Visual group only'), onDoubleClick: edit }),
    button(null, edit, PencilIcon, { 'aria-label': t('Rename window group'), title: t('Rename window group') }))
}

function WindowCard({ window, roster, selected, active, actions, useSessions, useWork, SessionProvider, renderSlot, start, dropTarget, floating, dismiss, size, arriving }) {
  const entity = entityOf(window, roster)
  const sessionId = canvasSessionId(window, roster)
  const preview = useSessions(list => previewOf(list, sessionId, roster.exchangeTurns?.[sessionId]))
  const work = useWork(value => value)
  if (!entity || !sessionId) return null
  const room = window.kind === 'room' ? entity : null
  const activity = room ? busyMembers(room, work, roster) : []
  const waiting = (work.approvals ?? []).some(entry => room ? entry.roomId === entity.id : entry.botId === entity.id) || activity.some(entry => entry.state === 'ask')
  const question = roster.questions?.[sessionId] !== undefined
  const busy = window.kind === 'room' ? (work.rooms?.[entity.id]?.length ?? 0) > 0 : Boolean(work.bots?.[entity.id]) || Object.values(work.rooms ?? {}).some(entries => entries.some(entry => entry.botId === entity.id))
  const status = waiting ? t('Waiting for your approval') : question ? t('Waiting for your answer') : busy ? t('Working') : t('Available')
  const statusKind = waiting || question ? 'waiting' : busy ? 'working' : 'available'
  const activityText = room ? summaryText(activity) : null
  const statusText = activityText?.waiting || activityText?.doing || status
  const groups = room ? [] : roster.rooms.filter(room => room.members.includes(entity.id))
  const summary = (preview || entity.preview || t(window.kind === 'room' ? 'Open group chat to collaborate' : 'Open conversation to work with this employee')).replace(/\s+/g, ' ').trim().slice(0, 240)
  const openMenu = event => {
    event.preventDefault()
    event.stopPropagation()
    const box = event.currentTarget.getBoundingClientRect()
    actions.openMenu({ id: entity.id, x: event.type === 'contextmenu' ? event.clientX : box.right, y: event.type === 'contextmenu' ? event.clientY : box.bottom })
  }
  const select = event => {
    if (event.button === 2 && selected) return
    if (event.target.closest('input[type=checkbox],.bt-canvas-window-title,.bt-canvas-avatar-open')) return
    actions.selectCanvasWindow(window.id)
  }
  const keyboard = (event, resizing = false) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta) return
    event.preventDefault()
    actions.selectCanvasWindow(window.id)
    const step = event.shiftKey ? 24 : 8
    actions.updateCanvas(state => resizing ? resizeWindow(state, window.id, delta[0] * step, delta[1] * step) : moveDesktop(state, [window.id], delta[0] * step, delta[1] * step, size))
  }
  const shell = {
    className: 'bt-canvas-window', 'data-window-id': window.id, 'data-entity-id': entity.id,
    'data-kind': window.kind,
    'data-arriving': arriving || undefined,
    'data-drop-target': dropTarget || undefined,
    'data-mode': window.compact ? 'card' : 'conversation',
    'data-active': active || undefined, 'data-selected': selected || undefined, 'aria-label': entity.name,
    style: floating ? { left: 0, top: 0, width: '100%', height: '100%' } : { left: window.x, top: window.y, width: windowWidth(window), height: windowHeight(window), zIndex: window.z + 2 },
    onPointerDownCapture: select, onFocusCapture: select, onContextMenu: event => {
      if (!event.target.closest('.bt-canvas-content')) openMenu(event)
    },
  }
  if (window.compact && !room) return h('section', shell,
    h('div', { className: 'bt-canvas-avatar-node' },
      h('button', { type: 'button', className: 'bt-canvas-avatar-open', 'aria-label': t('Open conversation'), title: t('Click to open · Drag to move'), onPointerDown: event => start(event, 'avatar', window.id), onClick: event => { if (event.detail === 0) actions.openCanvasConversation(window.id) }, onKeyDown: keyboard },
        h(BotAvatar, { bot: entity, size: 56, main: isMainOf(roster, entity.id) })),
      h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
        h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta' }, entity.generalAssistant ? t('General Assistant') : isMainOf(roster, entity.id) ? t('Main Bot') : entity.role || t('Employee'))),
      h('span', { className: 'bt-canvas-avatar-status', 'data-state': statusKind, title: status, role: 'status', 'aria-label': status })))
  if (floating) return h('section', shell,
    h('div', { className: 'bt-canvas-chat-chrome' },
      h('header', { className: 'bt-canvas-chat-pill' },
        h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: start, 'aria-label': t('Move {name}', { name: entity.name }) },
          room ? h(RoomAvatar, { room, roster, size: 32 }) : h(BotAvatar, { bot: entity, size: 32, main: isMainOf(roster, entity.id) }),
          h('span', null, h('strong', null, entity.name), h('span', { className: 'bt-canvas-chat-presence', role: 'status', 'data-state': statusKind }, status))),
        button(t('Search'), () => actions.openPalette(), SearchIcon, { className: 'bt-canvas-button bt-canvas-chat-search', title: t('Search') }),
        button(null, () => actions.showDetails(sessionId), InfoIcon, { 'aria-label': t('Details'), title: t('Details') }),
        button(null, () => actions.openSettings(room ? 'groups' : 'bots', entity.id), GearIcon, { 'aria-label': t(room ? 'Group settings' : 'Edit Bot'), title: t(room ? 'Group settings' : 'Edit Bot') }),
        button(null, openMenu, DotsIcon, { 'aria-label': t('{name} actions', { name: entity.name }), title: t('More'), 'aria-haspopup': 'menu' })),
      h('div', { className: 'bt-canvas-chat-controls' },
        button('−', dismiss, null, { 'aria-label': t('Compact window'), title: t('Compact window') }),
        button(null, dismiss, CloseIcon, { 'aria-label': t('Close window'), title: t('Close window') }))),
    h('div', { className: 'bt-canvas-content' }, h(CanvasSession, { sessionId, actions, useSessions, SessionProvider, renderSlot })))
  return h('section', shell,
  h('div', { className: 'bt-canvas-window-header' },
    floating ? null : h('input', { type: 'checkbox', checked: selected, 'aria-label': t('Select {name}', { name: entity.name }), onChange: event => actions.selectCanvasWindow(window.id, event.target.checked, true), onPointerDown: event => event.stopPropagation() }),
    h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: floating ? undefined : keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
      window.kind === 'room' ? h(RoomAvatar, { room: entity, roster, size: window.compact ? 36 : 28 }) : h(BotAvatar, { bot: entity, size: window.compact ? 36 : 28, main: isMainOf(roster, entity.id) }),
      h('span', null, h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta' }, window.kind === 'room' ? t('{count} members', { count: entity.members.length }) : [isMainOf(roster, entity.id) ? t('Main Bot') : null, entity.role || t('Employee')].filter(Boolean).join(' · ')))),
    h('div', { className: 'bt-canvas-window-actions' },
      window.compact ? null : button('−', dismiss ?? (() => actions.updateCanvas(state => setWindowCompact(state, window.id, true))), null, { 'aria-label': t('Compact window'), title: t('Compact window') }),
      button(null, openMenu, DotsIcon, { 'aria-label': t('{name} actions', { name: entity.name }), title: t('More'), 'aria-haspopup': 'menu' }),
      button(null, dismiss ?? (() => actions.updateCanvas(state => collapseWindow(state, window.id))), CloseIcon, { 'aria-label': t('Close window'), title: t('Close window') }))),
  window.compact ? null : h('div', { className: 'bt-canvas-window-meta' },
    h('span', { role: 'status', 'data-state': statusKind }, status),
    button(t('Details'), () => actions.showDetails(sessionId)),
    window.kind === 'bot' && roster.memory !== false ? button(t('Memory'), () => actions.openMemory(entity.id)) : null,
    button(t(room ? 'Group settings' : 'Edit Bot'), () => actions.openSettings(room ? 'groups' : 'bots', entity.id)),
    button(t('Scheduled tasks'), () => actions.openSettings('schedules', entity.id))),
  window.compact ? h('div', { className: 'bt-canvas-compact', 'data-has-groups': groups.length > 0 || undefined },
    h('button', { type: 'button', className: 'bt-canvas-card-state', 'data-state': statusKind, onClick: () => actions.showDetails(sessionId), title: statusText }, h('span', { 'aria-hidden': true }), statusText),
    room ? h(RoomSummary, { room, roster, work, actions }) : h('p', null, summary),
    groups.length > 0 ? h('div', { className: 'bt-canvas-members' }, groups.slice(0, 2).map(room => button(room.name, () => actions.openCanvasEntity(room.id), ChatsIcon, { key: room.id, className: 'bt-canvas-button bt-canvas-member', title: room.name })), groups.length > 2 ? button(`+${groups.length - 2}`, () => actions.showDetails(sessionId)) : null) : null,
    h('footer', null,
      button(t('Open conversation'), () => actions.openCanvasConversation(window.id), ChatsIcon, { className: 'bt-canvas-button bt-canvas-open-conversation', 'aria-expanded': false }),
      button(t(room ? 'Group settings' : 'Details'), () => room ? actions.openSettings('groups', entity.id) : actions.showDetails(sessionId))))
    : h('div', { className: 'bt-canvas-content' }, h(CanvasSession, { sessionId, actions, useSessions, SessionProvider, renderSlot })),
  window.compact || floating ? null : h('button', { type: 'button', className: 'bt-canvas-resize', 'aria-label': t('Resize {name}', { name: entity.name }), onPointerDown: event => start(event, 'resize', window.id), onKeyDown: event => keyboard(event, true) }, '⌟'))
}

function CanvasChatWindow(props) {
  const { window, roster, actions } = props
  const [closing, setClosing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const node = useRef(null)
  const drag = useRef(null)
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    actions.updateCanvas(state => setWindowCompact(state, window.id, true))
  }
  const dismiss = () => setClosing(true)
  useEffect(() => {
    if (!closing) return
    // Also finish when animations are disabled or the window loses visibility.
    const timer = setTimeout(finish, 240)
    return () => clearTimeout(timer)
  }, [closing])
  useEffect(() => {
    const previous = document.activeElement
    node.current.focus({ preventScroll: true })
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  const start = event => {
    if (event.button !== 0 || closing) return
    event.preventDefault()
    event.stopPropagation()
    const box = node.current.getBoundingClientRect()
    const parent = node.current.parentElement.getBoundingClientRect()
    const padding = getComputedStyle(node.current.parentElement)
    const bounds = { left: parent.left + (parseFloat(padding.paddingLeft) || 0), right: parent.right - (parseFloat(padding.paddingRight) || 0), top: parent.top, bottom: parent.bottom }
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset, box, bounds }
    node.current.setPointerCapture(event.pointerId)
  }
  const end = event => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (node.current.hasPointerCapture(event.pointerId)) node.current.releasePointerCapture(event.pointerId)
  }
  return h('div', { className: 'bt-canvas-chat-layer' },
    h('div', { ref: node, className: 'bt-canvas-chat-float', role: 'dialog', tabIndex: -1, 'aria-label': entityOf(window, roster)?.name,
      'data-closing': closing || undefined, style: { translate: `${offset.x}px ${offset.y}px` },
      onPointerDown: event => event.stopPropagation(),
      onPointerMove: event => {
        const current = drag.current
        if (current?.id !== event.pointerId) return
        const { box, bounds } = current
        const dx = Math.max(bounds.left + 12 - box.left, Math.min(bounds.right - 12 - box.right, event.clientX - current.x))
        const dy = Math.max(bounds.top + 12 - box.top, Math.min(bounds.bottom - 12 - box.bottom, event.clientY - current.y))
        setOffset({ x: current.offset.x + dx, y: current.offset.y + dy })
        event.stopPropagation()
      }, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { drag.current = null },
      onKeyDown: event => {
        if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent?.isComposing && !event.target.closest('[role=combobox],[aria-expanded=true]')) { event.preventDefault(); event.stopPropagation(); dismiss() }
      },
      onAnimationEnd: event => { if (closing && event.target === event.currentTarget) finish() },
    }, h(WindowCard, { ...props, floating: true, selected: false, active: true, start, dismiss })))
}

export function CanvasWorkspace({ useRoster, useCanvas, useSessions, useWork, actions, SessionProvider, renderSlot }) {
  const roster = useRoster(value => value)
  const knownDepartments = useRef(null)
  useEffect(() => {
    if (!roster.ready) return
    const departments = roster.teams ? roster.teams.map(team => roster.roomsById[team.roomId]).filter(Boolean) : roster.rooms.filter(room => room.department)
    for (const room of departments) {
      if (!knownDepartments.current?.has(room.id)) actions.showDepartment(room)
    }
    knownDepartments.current = new Set(departments.map(room => room.id))
  }, [roster.teams, roster.rooms, roster.ready, actions])
  const savedState = useCanvas(value => value)
  const state = { ...savedState, viewport: { x: 0, y: 0, zoom: 1 } }
  const latest = useRef(state)
  latest.current = state
  const root = useRef(null)
  const drag = useRef(null)
  const [marquee, setMarquee] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [arriving, setArriving] = useState(null)
  const [groupMembers, setGroupMembers] = useState(null)
  const [menu, setMenu] = useState(null)
  const suppressContext = useRef(false)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const visible = state.windows.filter(window => window.open && entityOf(window, roster))
  const desktop = visible.filter(window => !roster.byId[window.entityId]?.hidden).map(window => window.compact ? window : { ...window, compact: true })
  const conversation = visible.filter(window => !window.compact).sort((a, b) => b.z - a.z)[0]
  const focused = useRef(null)
  const activeBot = visible.find(window => window.id === state.active && window.kind === 'bot')
  if (activeBot) focused.current = activeBot.entityId
  const quickBot = roster.byId[focused.current] ?? roster.byId[roster.mainBotId] ?? roster.bots[0]
  const selectedBots = employeesOf(visible, state.selected, roster)
  const mains = selectedMains(state, roster, state.selected)
  const update = actions.updateCanvas
  useEffect(() => {
    if (!menu) return
    const dismiss = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !event.target.closest('.bt-canvas-context')) setMenu(null) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [menu])
  useEffect(() => {
    const node = root.current
    const toolbar = node.querySelector('.bt-canvas-toolbar')
    const dock = node.querySelector('.bt-canvas-dock')
    const measure = () => {
      const box = node.getBoundingClientRect()
      // Floating components overlay the desktop; only its fixed chrome reserves space.
      const top = toolbar.getBoundingClientRect().bottom - box.top + 20
      const bottom = box.bottom - dock.getBoundingClientRect().top + 20
      const measured = { width: box.width, height: box.height, insets: { top, bottom, left: 24, right: 24 } }
      setSize(measured)
      actions.setCanvasSize(measured)
    }
    const observer = new ResizeObserver(measure)
    for (const element of [node, toolbar, dock]) observer.observe(element)
    measure()
    return () => { observer.disconnect(); actions.setCanvasSize(null) }
  }, [])
  useEffect(() => {
    if (!arriving) return
    const timer = setTimeout(() => setArriving(null), 280)
    return () => clearTimeout(timer)
  }, [arriving])
  const contactDrop = (id, x, y, commit) => {
    if (!roster.byId[id]) return
    const current = latest.current, box = root.current.getBoundingClientRect()
    const existing = current.windows.find(window => window.kind === 'bot' && window.entityId === id)
    const probe = { ...current, windows: existing ? current.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window) : [...current.windows, { id: 'contact-drop', kind: 'bot', entityId: id, open: true, compact: true }] }
    const target = groupDropTarget(probe, roster, [existing?.id ?? 'contact-drop'], { x: x - box.left, y: y - box.top })
    setDropTarget(target?.windowId ?? target?.id ?? null)
    if (!commit) return
    setDropTarget(null)
    if (!target || !existing?.open) actions.placeCanvasMain(id, canvasDropPoint(current, box, x, y))
    if (target) proposeGroup([id], target)
    setArriving(id)
  }
  const contactDropRef = useRef(contactDrop)
  contactDropRef.current = contactDrop
  useEffect(() => {
    const receive = event => {
      const { id, x, y, phase } = event.detail
      const node = root.current
      const hit = node.ownerDocument.elementFromPoint(x, y)
      if (phase === 'cancel' || !hit || !node.contains(hit)) { setDropTarget(null); return }
      contactDropRef.current(id, x, y, phase === 'end')
    }
    window.addEventListener(MAIN_AGENT_POINTER, receive)
    return () => window.removeEventListener(MAIN_AGENT_POINTER, receive)
  }, [])
  const start = (event, kind, id) => {
    if (event.button !== 0 && !(event.button === 2 && kind === 'marquee')) return
    event.preventDefault()
    event.stopPropagation()
    let current = latest.current
    setMenu(null)
    suppressContext.current = false
    const box = root.current.getBoundingClientRect()
    let ids = kind === 'group' ? current.groups.find(group => group.id === id)?.members ?? [] : current.selected.includes(id) ? current.selected : [id]
    ids = ids.filter(value => current.windows.some(window => window.id === value && window.open))
    if ((kind === 'window' || kind === 'avatar') && event.shiftKey) { actions.selectCanvasWindow(id, !current.selected.includes(id), true); return }
    if (kind === 'resize') ids = [id]
    if (kind === 'window' || kind === 'avatar' || kind === 'group' || kind === 'resize') {
      current = setCanvasSelection(current, ids, kind === 'group' ? ids[0] : id)
      update(current, false)
    }
    drag.current = { kind, id, ids, startX: event.clientX, startY: event.clientY, state: current, box, moved: false, right: event.button === 2 }
    root.current.setPointerCapture(event.pointerId)
  }
  const move = event => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY
    if (Math.hypot(dx, dy) > 4) current.moved = true
    if (current.kind === 'window' || current.kind === 'group' || current.kind === 'avatar' && current.moved) {
      const draft = current.kind === 'group' && current.state.groups.find(group => group.id === current.id && group.draft)
      const next = moveDesktop({ ...current.state, selected: current.ids }, current.ids, dx, dy, size, draft ? current.id : undefined)
      current.latest = next
      update(next, false)
      current.target = ['avatar', 'window'].includes(current.kind) ? groupDropTarget(next, roster, current.ids, { x: event.clientX - current.box.left, y: event.clientY - current.box.top }) : null
      setDropTarget(current.target ? current.target.windowId ?? current.target.id : current.ids.length === 1 && ['avatar', 'window'].includes(current.kind) ? overlapMain(next, roster, current.id)?.id ?? null : null)
    }
    if (current.kind === 'resize') update(() => resizeWindow(current.state, current.id, dx, dy), false)
    if (current.kind === 'marquee') {
      if (current.right && !current.moved) return
      const left = Math.min(current.startX, event.clientX) - current.box.left, top = Math.min(current.startY, event.clientY) - current.box.top
      const rect = { left, top, width: Math.abs(dx), height: Math.abs(dy) }
      setMarquee(rect)
      const ids = marqueeWindows(current.state, roster, { x: left, y: top, width: rect.width, height: rect.height }, current.right)
      update(value => setCanvasSelection(value, ids), false)
    }
  }
  const finish = event => {
    if (!drag.current) return
    const current = drag.current
    drag.current = null
    setMarquee(null)
    setDropTarget(null)
    if (root.current.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId)
    const cancelled = event.type === 'pointercancel'
    const restore = () => update(value => ({ ...value, groups: current.kind === 'group' ? current.state.groups : value.groups, windows: value.windows.map(window => {
      const original = current.state.windows.find(item => item.id === window.id)
      return original && current.ids.includes(window.id) ? { ...window, x: original.x, y: original.y, width: original.width, height: original.height } : window
    }) }))
    if (cancelled) restore()
    if (current.right) {
      suppressContext.current = true
      if (!cancelled && !current.moved) setMenu({ x: current.startX - current.box.left, y: current.startY - current.box.top })
    }
    if (!cancelled && current.moved && current.target) {
      restore()
      proposeGroup(selectedMains(current.state, roster, current.ids), current.target)
    } else if (!cancelled && current.moved && current.ids.length === 1 && ['avatar', 'window'].includes(current.kind)) {
      const next = current.latest ?? latest.current
      const target = overlapMain(next, roster, current.id)
      if (target) {
        const source = next.windows.find(window => window.id === current.id)
        // Restore the dragged card so cancelling leaves two independently usable icons.
        restore()
        setGroupMembers({ members: [source.entityId, target.entityId] })
      }
    }
    if (current.kind === 'avatar' && !current.moved && event.type !== 'pointercancel') actions.openCanvasConversation(current.id)
    actions.saveCanvas()
  }
  const proposeGroup = (members, target) => {
    if (target?.kind === 'draft') {
      const group = latest.current.groups.find(group => group.id === target.id && group.draft)
      if (!group) return
      setGroupMembers({ members: [...new Set([...selectedMains(latest.current, roster, group.members, true), ...members])], target: { ...target, name: group.name } })
    } else if (target) setGroupMembers({ members, target: { ...target, name: roster.roomsById[target.id]?.name } })
    else setGroupMembers({ members })
    setMenu(null)
  }
  const completeGroup = ({ room, members, name }) => {
    const target = groupMembers?.target
    if (target?.kind !== 'draft') return
    update(current => {
      if (room) return ungroupWindows(current, target.id)
      const ids = current.windows.filter(window => window.kind === 'bot' && members.includes(window.entityId)).map(window => window.id)
      const next = addDraftMembers(current, target.id, ids)
      return { ...next, groups: next.groups.map(group => group.id === target.id ? { ...group, name: name || group.name } : group) }
    })
  }
  const newEmptyGroup = () => {
    update(current => fixedDesktop(createEmptyGroup(current, { x: menu?.x ?? size.width / 2, y: menu?.y ?? size.height / 2, name: t('New group') }), size))
    setMenu(null)
  }
  const drop = event => {
    const id = event.dataTransfer.getData(MAIN_AGENT_DRAG)
    if (!roster.byId[id]) return
    event.preventDefault()
    contactDrop(id, event.clientX, event.clientY, true)
  }
  return h('div', { ref: root, className: 'bt-canvas', 'aria-label': t('Employee canvas'), onPointerMove: move, onPointerUp: finish, onPointerCancel: finish,
    onDragOver: event => { if (Array.from(event.dataTransfer.types).includes(MAIN_AGENT_DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }, onDrop: drop },
    h('style', null, SPATIAL_WIDGET_CSS),
    h('style', null, MAIN_GROUP_CSS),
    groupMembers ? h(MainAgentGroup, { ...groupMembers, roster, actions, onComplete: completeGroup, onClose: () => setGroupMembers(null) }) : null,
    h('nav', { className: 'bt-canvas-toolbar', 'aria-label': t('Canvas tools') },
      h('strong', null, t('Employee canvas')),
      button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon),
      button(t('Create employee'), () => actions.openNewChat('create'), PlusIcon),
      button(t(selectedBots.length >= 2 ? 'Create group with selected' : 'Create group chat'), () => actions.openNewChat('group', selectedBots.length >= 2 ? selectedBots : []), ChatsIcon),
      button(t('New empty group'), newEmptyGroup, FolderIcon),
      selectedBots.length === 2 ? button(t('Bot exchange'), () => actions.openExchange(...selectedBots), ChatsIcon) : null,
      button(t('Arrange cards'), () => actions.arrangeCanvasCards(), null, { disabled: visible.length === 0 }),
      button(t('Group windows'), () => update(current => groupWindows(current, current.selected, { name: t('Window group') })), FolderIcon, { disabled: state.selected.length < 2 }),
      button(t('Ungroup'), () => update(current => ungroupWindows(current, current.selected)), null, { disabled: !state.groups.some(group => group.members.some(id => state.selected.includes(id))) }),
      button(t('Collapse conversations'), () => actions.compactCanvasConversations(), null, { disabled: !visible.some(window => !window.compact) }),
      button(t('Quick message'), () => toggleSpatialWidget('quick'), ChatsIcon),
      button(t('Agenda'), () => toggleSpatialWidget('agenda'), CalendarIcon),
      h(CanvasWallpaper, { canvasRef: root }),
      button(t('Settings'), () => actions.openSettings(), GearIcon),
      button(t('Classic Agent mode'), () => actions.setSurface('agent'))),
    h('main', { className: 'bt-canvas-stage', onContextMenu: event => {
      if (event.target.closest('.bt-canvas-window,.bt-canvas-group-header,button,input,textarea,a,[contenteditable]')) return
      event.preventDefault()
      if (!drag.current && !suppressContext.current) { const box = root.current.getBoundingClientRect(); setMenu({ x: event.clientX - box.left, y: event.clientY - box.top }) }
      suppressContext.current = false
    }, onPointerDown: event => { if (!event.target.closest('.bt-canvas-window,.bt-canvas-group-header,button,input,textarea,a,[contenteditable]')) start(event, 'marquee') } },
      h('div', { className: 'bt-canvas-background', 'aria-hidden': true }),
      h('div', { className: 'bt-canvas-world', style: { transform: 'none' } },
        state.groups.map(group => {
          if (group.draft) return h('section', { key: group.id, className: 'bt-canvas-group bt-canvas-draft', 'data-group-id': group.id, 'data-drop-target': dropTarget === group.id || undefined, style: { left: group.x, top: group.y, width: 280, height: 180 } },
            h('div', { className: 'bt-canvas-group-header' }, h(GroupTitle, { group, start, actions }), button(null, () => update(current => ungroupWindows(current, group.id)), CloseIcon, { title: t('Remove empty group'), 'aria-label': t('Remove empty group') })),
            h('div', { className: 'bt-canvas-draft-members' }, selectedMains(state, roster, group.members, true).map(id => h(BotAvatar, { key: id, bot: roster.byId[id], size: 36, main: true }))),
            h('p', null, t(group.members.length ? 'Add another employee to start a group conversation.' : 'Drag employees here')),
            selectedMains(state, roster, group.members, true).length >= 2 ? button(t('Create group chat'), () => proposeGroup([], { kind: 'draft', id: group.id }), ChatsIcon) : null)
          const members = desktop.filter(window => group.members.includes(window.id))
          if (!members.length) return null
          const x = Math.min(...members.map(window => window.x)) - 16, y = Math.min(...members.map(window => window.y)) - 45
          return h('section', { key: group.id, className: 'bt-canvas-group', style: { left: x, top: y, width: Math.max(...members.map(window => window.x + windowWidth(window))) - x + 16, height: Math.max(...members.map(window => window.y + windowHeight(window))) - y + 16 } },
            h('div', { className: 'bt-canvas-group-header' }, h(GroupTitle, { group, start, actions }),
              employeesOf(visible, group.members, roster).length >= 2 ? button(null, () => actions.openNewChat('group', employeesOf(visible, group.members, roster)), ChatsIcon, { title: t('Create group chat'), 'aria-label': t('Create group chat') }) : null,
              button(null, () => update(current => ungroupWindows(current, group.id)), CloseIcon, { title: t('Ungroup'), 'aria-label': t('Ungroup') })))
        }),
        desktop.map(window => h(WindowCard, { key: window.id, window, roster, selected: state.selected.includes(window.id), active: state.active === window.id, arriving: arriving === window.entityId, dropTarget: dropTarget === window.id, actions, useSessions, useWork, SessionProvider, renderSlot, start, size }))),
      visible.length === 0 && !state.groups.some(group => group.draft) ? h('div', { className: 'bt-canvas-empty' }, h('h2', null, t('Your team workspace')), h('p', null, t('Open employees from the directory. Their conversations stay with them.')), button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon)) : null),
    conversation ? h(CanvasChatWindow, { key: conversation.id, window: conversation, roster, actions, useSessions, useWork, SessionProvider, renderSlot }) : null,
    menu ? h('div', { className: 'bt-canvas-context', role: 'menu', 'aria-label': t('Canvas actions'), style: { left: Math.max(0, Math.min(menu.x, size.width - 230)), top: Math.max(0, Math.min(menu.y, size.height - 150)) }, onContextMenu: event => event.preventDefault() },
      button(t('New empty group'), newEmptyGroup, FolderIcon, { role: 'menuitem' }),
      button(t('Create collaboration group'), () => proposeGroup(mains), ChatsIcon, { role: 'menuitem', disabled: mains.length < 2 }),
      button(t('Clear selection'), () => { update(current => setCanvasSelection(current, [])); setMenu(null) }, null, { role: 'menuitem', disabled: !state.selected.length })) : null,
    h(CanvasQuickMessage, { bot: quickBot, actions }),
    h(CanvasAgenda, { roster, actions }),
    marquee ? h('div', { className: 'bt-canvas-marquee', style: marquee }) : null,
    h('nav', { className: 'bt-canvas-dock', 'aria-label': t('Employees and group chats') }, [...roster.bots, ...roster.rooms].filter(entity => !entity.hidden).map(entity => h('button', { type: 'button', onClick: () => actions.openCanvasEntity(entity.id, size), key: entity.id, className: 'bt-canvas-button bt-canvas-dock-item', 'aria-label': entity.name, title: entity.name, 'aria-pressed': visible.some(window => window.entityId === entity.id && window.id === state.active) },
      roster.roomsById[entity.id] ? h(RoomAvatar, { room: entity, roster, size: 36 }) : h(BotAvatar, { bot: entity, size: 36, main: isMainOf(roster, entity.id) }), h('span', null, entity.name)))),
    h('div', { className: 'bt-canvas-status' }, t('Fixed desktop · Drag to arrange · Right-drag to select')))
}
