import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotAvatar, RoomAvatar } from './mark.js'
import { previewOf } from './text.js'
import { PlusIcon, PeopleIcon, ChatsIcon, GearIcon, CloseIcon, FolderIcon, DotsIcon, PencilIcon, InfoIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SwitchIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { ROOM_MODES, shownMode } from './group-settings.js'
import { memberWork, busyMembers, summaryText } from './member-status.js'
import { CanvasSession, canvasSessionId } from './canvas-session.js'
import { CanvasQuickMessage, CanvasAgenda, SPATIAL_WIDGET_CSS, toggleSpatialWidget } from './spatial-widgets.js'
import { CanvasWallpaper } from './canvas-wallpaper.js'
import { CANVAS_LIMITS, collapseWindow, fitViewport, groupWindows, moveWindow, openWindow, resizeWindow, setCanvasSelection, setCanvasViewport, setWindowCompact, ungroupWindows, windowHeight, windowWidth } from './canvas-state.js'
import { t } from './i18n.js'

const button = (label, onClick, icon, extra = {}) => h('button', { type: 'button', className: `bt-canvas-button glass-button${extra.className ? ` ${extra.className}` : ''}`, onClick, ...extra }, icon ? h(icon) : null, label)
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
    button(group.name || t('Window group'), null, FolderIcon, { onPointerDown: event => start(event, 'group', group.id), title: t('Visual group only'), onDoubleClick: edit }),
    button(null, edit, PencilIcon, { 'aria-label': t('Rename window group'), title: t('Rename window group') }))
}

function WindowCard({ window, roster, selected, active, actions, useSessions, useWork, SessionProvider, renderSlot, start }) {
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
    const box = event.currentTarget.getBoundingClientRect()
    actions.openMenu({ id: entity.id, x: event.type === 'contextmenu' ? event.clientX : box.right, y: event.type === 'contextmenu' ? event.clientY : box.bottom })
  }
  const select = event => {
    if (event.target.closest('input[type=checkbox],.bt-canvas-window-title,.bt-canvas-avatar-open')) return
    actions.selectCanvasWindow(window.id)
  }
  const keyboard = (event, resizing = false) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta) return
    event.preventDefault()
    actions.selectCanvasWindow(window.id)
    actions.markCanvasWindowMoved?.(window.id)
    const step = event.shiftKey ? 24 : 8
    actions.updateCanvas(state => (resizing ? resizeWindow : moveWindow)(state, window.id, delta[0] * step, delta[1] * step))
  }
  const shell = {
    className: 'bt-canvas-window agent-window', 'data-window-id': window.id, 'data-entity-id': entity.id,
    'data-kind': window.kind,
    'data-mode': window.compact ? 'card' : 'conversation',
    'data-active': active || undefined, 'data-selected': selected || undefined, 'aria-label': entity.name,
    style: { left: window.x, top: window.y, width: windowWidth(window), height: windowHeight(window), zIndex: window.z + 2 },
    onPointerDownCapture: select, onFocusCapture: select, onContextMenu: event => { if (!event.target.closest('.bt-canvas-content')) openMenu(event) },
  }
  if (window.compact && !room) return h('section', shell,
    h('div', { className: 'bt-canvas-avatar-node' },
      h('div', { className: 'bt-canvas-avatar-tools floating-toolbar' },
        h('input', { type: 'checkbox', checked: selected, 'aria-label': t('Select {name}', { name: entity.name }), onChange: event => actions.selectCanvasWindow(window.id, event.target.checked, true), onPointerDown: event => event.stopPropagation() }),
        button(null, openMenu, DotsIcon, { 'aria-label': t('{name} actions', { name: entity.name }), title: t('More'), 'aria-haspopup': 'menu' }),
        button(null, () => actions.updateCanvas(state => collapseWindow(state, window.id)), CloseIcon, { 'aria-label': t('Close window'), title: t('Close window') })),
      h('button', { type: 'button', className: 'bt-canvas-avatar-open', 'aria-label': t('Open conversation'), title: t('Click to open · Drag to move'), onPointerDown: event => start(event, 'avatar', window.id), onClick: event => { if (event.detail === 0) actions.openCanvasConversation(window.id) }, onKeyDown: keyboard },
        h(BotAvatar, { bot: entity, size: 56, main: isMainOf(roster, entity.id) })),
      h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
        h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta text-secondary' }, isMainOf(roster, entity.id) ? t('Main Bot') : entity.role || t('Employee'))),
      button(null, () => actions.showDetails(sessionId), InfoIcon, { className: 'bt-canvas-avatar-status', 'data-state': statusKind, title: status, 'aria-label': t('Details') })))
  return h('section', shell,
  h('div', { className: 'bt-canvas-window-header agent-window__header' },
    h('input', { type: 'checkbox', checked: selected, 'aria-label': t('Select {name}', { name: entity.name }), onChange: event => actions.selectCanvasWindow(window.id, event.target.checked, true), onPointerDown: event => event.stopPropagation() }),
    h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
      window.kind === 'room' ? h(RoomAvatar, { room: entity, roster, size: window.compact ? 36 : 28 }) : h(BotAvatar, { bot: entity, size: window.compact ? 36 : 28, main: isMainOf(roster, entity.id) }),
      h('span', null, h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta text-secondary' }, window.kind === 'room' ? t('{count} members', { count: entity.members.length }) : [isMainOf(roster, entity.id) ? t('Main Bot') : null, entity.role || t('Employee')].filter(Boolean).join(' · ')))),
    h('div', { className: 'bt-canvas-window-actions agent-window__toolbar' },
      window.compact ? null : button('−', () => actions.updateCanvas(state => setWindowCompact(state, window.id, true)), null, { 'aria-label': t('Compact window'), title: t('Compact window') }),
      button(null, openMenu, DotsIcon, { 'aria-label': t('{name} actions', { name: entity.name }), title: t('More'), 'aria-haspopup': 'menu' }),
      button(null, () => actions.updateCanvas(state => collapseWindow(state, window.id)), CloseIcon, { 'aria-label': t('Close window'), title: t('Close window') }))),
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
  window.compact ? null : h('button', { type: 'button', className: 'bt-canvas-resize', 'aria-label': t('Resize {name}', { name: entity.name }), onPointerDown: event => start(event, 'resize', window.id), onKeyDown: event => keyboard(event, true) }, '⌟'))
}

function CanvasDrawer({ selectedBots, visible, state, update, actions, canvasRef }) {
  const [open, setOpen] = useState(false)
  const drawerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const down = event => {
      if (drawerRef.current && !drawerRef.current.contains(event.target) && !event.target.closest('.bt-wallpaper-menu')) {
        setOpen(false)
      }
    }
    const key = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const item = (label, onClick, icon, extra = {}) =>
    h('button', {
      type: 'button',
      className: 'bt-drawer-item',
      onClick: () => {
        onClick()
        if (extra.closeOnClick !== false) setOpen(false)
      },
      ...extra,
    }, icon ? h(icon) : null, h('span', null, label))

  return h('nav', {
    ref: drawerRef,
    className: 'bt-canvas-toolbar bt-canvas-drawer floating-toolbar',
    'data-open': open ? 'true' : undefined,
    'aria-label': t('Canvas tools'),
  },
    !open
      ? h('button', {
          type: 'button',
          className: 'bt-canvas-drawer-trigger glass-button floating-toolbar',
          onClick: () => setOpen(true),
          'aria-expanded': false,
          'aria-label': t('Expand navigation menu'),
          title: t('Expand navigation menu'),
        },
          h('span', { className: 'bt-drawer-trigger-icon', 'aria-hidden': true }, '▦'),
          h('span', { className: 'bt-drawer-trigger-text' }, t('Employee canvas')),
          h(ChevronRightIcon))
      : h('div', { className: 'bt-drawer-content' },
          h('header', { className: 'bt-drawer-header' },
            h('div', { className: 'bt-drawer-title' },
              h('span', { className: 'bt-drawer-trigger-icon', 'aria-hidden': true }, '▦'),
              h('strong', null, t('Employee canvas'))),
            h('button', {
              type: 'button',
              className: 'bt-drawer-close glass-button',
              onClick: () => setOpen(false),
              'aria-label': t('Collapse navigation menu'),
              title: t('Collapse navigation menu'),
            }, h(ChevronLeftIcon))),
          h('div', { className: 'bt-drawer-body' },
            h('div', { className: 'bt-drawer-section-title' }, t('Collaboration')),
            item(t('Create employee'), () => actions.openNewChat('create'), PlusIcon),
            item(t(selectedBots.length >= 2 ? 'Create group with selected' : 'Create group chat'), () => actions.openNewChat('group', selectedBots.length >= 2 ? selectedBots : []), ChatsIcon),
            item(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon),
            selectedBots.length === 2 ? item(t('Bot exchange'), () => actions.openExchange(...selectedBots), ChatsIcon) : null,

            h('div', { className: 'bt-drawer-separator', role: 'separator' }),

            h('div', { className: 'bt-drawer-section-title' }, t('Canvas layout')),
            item(t('Arrange cards'), () => actions.arrangeCanvasCards(), null, { disabled: visible.length === 0, closeOnClick: false }),
            item(t('Group windows'), () => update(current => groupWindows(current, current.selected, { name: t('Window group') })), FolderIcon, { disabled: state.selected.length < 2, closeOnClick: false }),
            item(t('Ungroup'), () => update(current => ungroupWindows(current, current.selected)), null, { disabled: !state.groups.some(group => group.members.some(id => state.selected.includes(id))), closeOnClick: false }),
            item(t('Collapse conversations'), () => actions.compactCanvasConversations(), null, { disabled: !visible.some(window => !window.compact), closeOnClick: false }),

            h('div', { className: 'bt-drawer-separator', role: 'separator' }),

            h('div', { className: 'bt-drawer-section-title' }, t('Spatial widgets')),
            item(t('Quick message'), () => toggleSpatialWidget('quick'), ChatsIcon, { closeOnClick: false }),
            item(t('Agenda'), () => toggleSpatialWidget('agenda'), CalendarIcon, { closeOnClick: false }),
            h(CanvasWallpaper, { canvasRef }),

            h('div', { className: 'bt-drawer-separator', role: 'separator' }),

            h('div', { className: 'bt-drawer-section-title' }, t('System')),
            item(t('Settings'), () => actions.openSettings(), GearIcon),
            item(t('Classic view'), () => actions.openClassicSession(), SwitchIcon))))
}

export function CanvasWorkspace({ useRoster, useCanvas, useSessions, useWork, actions, SessionProvider, renderSlot }) {
  const roster = useRoster(value => value)
  const state = useCanvas(value => value)
  const latest = useRef(state)
  latest.current = state
  const root = useRef(null)
  const drag = useRef(null)
  const [marquee, setMarquee] = useState(null)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const visible = state.windows.filter(window => window.open && entityOf(window, roster))
  const focused = useRef(null)
  const activeBot = visible.find(window => window.id === state.active && window.kind === 'bot')
  if (activeBot) focused.current = activeBot.entityId
  const quickBot = roster.byId[focused.current] ?? roster.byId[roster.mainBotId] ?? roster.bots[0]
  const selectedBots = employeesOf(visible, state.selected, roster)
  const update = actions.updateCanvas
  useEffect(() => {
    const node = root.current
    const toolbar = node.querySelector('.bt-canvas-toolbar')
    const dock = node.querySelector('.bt-canvas-dock')
    const controls = node.querySelector('.bt-canvas-zoom')
    const team = node.closest('.bt-canvas-frame')?.querySelector('.bt-floating-team')
    const widgets = [...node.querySelectorAll('.bt-spatial-widget')]
    const measure = () => {
      const box = node.getBoundingClientRect()
      const widgetBottom = widgets.map(widget => widget.getBoundingClientRect().bottom - box.top).filter(bottom => bottom < box.height * .55)
      const panel = team?.getBoundingClientRect()
      const isTeamFolded = team?.dataset.folded === 'true'
      const foldedTeamBottom = isTeamFolded && panel ? panel.bottom - box.top : 0
      const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom - box.top : 0
      const top = Math.max(toolbarBottom, ...widgetBottom, foldedTeamBottom) + 20
      const dockTop = dock ? dock.getBoundingClientRect().top : box.bottom
      const controlsTop = controls ? controls.getBoundingClientRect().top : box.bottom
      const bottom = box.bottom - Math.min(dockTop, controlsTop) + 20
      const isTeamLeft = panel && (panel.left - box.left < box.width / 2)
      const isTeamRight = panel && (panel.right - box.left > box.width / 2)
      const left = isTeamLeft ? Math.max(24, Math.round(panel.right - box.left + (isTeamFolded ? 16 : 24))) : 24
      const right = isTeamRight ? Math.max(24, Math.round(box.right - panel.left + (isTeamFolded ? 16 : 24))) : 24
      const measured = { width: box.width, height: box.height, insets: { top, bottom, left, right } }
      setSize(measured)
      actions.setCanvasSize(measured)
    }
    const observer = new ResizeObserver(measure)
    for (const element of [node, toolbar, dock, controls]) observer.observe(element)
    const position = new MutationObserver(measure)
    if (team) { observer.observe(team); position.observe(team, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    for (const widget of widgets) { observer.observe(widget); position.observe(widget, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    return () => { observer.disconnect(); position.disconnect(); actions.setCanvasSize(null) }
  }, [])
  const zoom = (factor, point = { x: size.width / 2, y: size.height / 2 }) => update(current => {
    const v = current.viewport, next = Math.max(.2, Math.min(2, v.zoom * factor))
    return setCanvasViewport(current, { zoom: next, x: point.x - (point.x - v.x) * next / v.zoom, y: point.y - (point.y - v.y) * next / v.zoom })
  })
  const start = (event, kind, id) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    let current = latest.current
    const box = root.current.getBoundingClientRect()
    let ids = kind === 'group' ? current.groups.find(group => group.id === id)?.members ?? [] : current.selected.includes(id) ? current.selected : [id]
    ids = ids.filter(value => current.windows.some(window => window.id === value && window.open))
    if ((kind === 'window' || kind === 'avatar') && event.shiftKey) { actions.selectCanvasWindow(id, !current.selected.includes(id), true); return }
    if (kind === 'resize') ids = [id]
    if (kind === 'window' || kind === 'avatar' || kind === 'group' || kind === 'resize') {
      current = setCanvasSelection(current, ids, kind === 'group' ? ids[0] : id)
      update(current, false)
    }
    drag.current = { kind, id, ids, startX: event.clientX, startY: event.clientY, state: current, box, moved: false }
    root.current.setPointerCapture(event.pointerId)
  }
  const startDockDrag = (event, entity) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const kind = roster.roomsById[entity.id] ? 'room' : 'bot'
    const box = root.current.getBoundingClientRect()
    drag.current = { kind: 'dock', entity, entityKind: kind, startX: event.clientX, startY: event.clientY, moved: false, box }
    root.current.setPointerCapture(event.pointerId)
  }
  const move = event => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY, v = current.state?.viewport ?? latest.current.viewport
    if (Math.hypot(dx, dy) > 4) current.moved = true
    if (current.kind === 'dock') {
      if (current.moved) {
        const x = (event.clientX - current.box.left - v.x) / v.zoom - (CANVAS_LIMITS.avatarWidth / 2)
        const y = (event.clientY - current.box.top - v.y) / v.zoom - (CANVAS_LIMITS.avatarHeight / 2)
        const nextState = openWindow(latest.current, { id: current.entity.id, kind: current.entityKind }, { x, y, compact: true })
        const win = nextState.windows.find(w => w.entityId === current.entity.id)
        if (win) {
          win.x = x
          win.y = y
          actions.markCanvasWindowMoved?.(win.id)
        }
        update(nextState, false)
        if (win) {
          drag.current = { kind: 'avatar', id: win.id, ids: [win.id], startX: event.clientX, startY: event.clientY, state: nextState, box: current.box, moved: true }
        }
      }
      return
    }
    if (current.kind === 'pan') update(() => setCanvasViewport(current.state, { ...v, x: v.x + dx, y: v.y + dy }), false)
    if (current.kind === 'window' || current.kind === 'group' || current.kind === 'avatar' && current.moved) update(() => current.ids.reduce((value, id) => moveWindow(value, id, dx / v.zoom, dy / v.zoom), { ...current.state, selected: current.ids }), false)
    if (current.kind === 'resize') update(() => resizeWindow(current.state, current.id, dx / v.zoom, dy / v.zoom), false)
    if (current.kind === 'marquee') {
      const left = Math.min(current.startX, event.clientX) - current.box.left, top = Math.min(current.startY, event.clientY) - current.box.top
      const rect = { left, top, width: Math.abs(dx), height: Math.abs(dy) }
      setMarquee(rect)
      const x = (left - v.x) / v.zoom, y = (top - v.y) / v.zoom
      const ids = current.state.windows.filter(window => window.open && window.x < x + rect.width / v.zoom && window.x + windowWidth(window) > x && window.y < y + rect.height / v.zoom && window.y + windowHeight(window) > y).map(window => window.id)
      update(value => setCanvasSelection(value, ids), false)
    }
  }
  const finish = event => {
    if (!drag.current) return
    const current = drag.current
    drag.current = null
    setMarquee(null)
    if (root.current.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId)
    if (current.moved && (current.kind === 'window' || current.kind === 'avatar' || current.kind === 'group')) {
      current.ids?.forEach(id => actions.markCanvasWindowMoved?.(id))
    }
    actions.saveCanvas()
    if (current.kind === 'dock' && !current.moved && event.type !== 'pointercancel') {
      actions.openCanvasEntity(current.entity.id, size)
    } else if (current.kind === 'avatar' && !current.moved && event.type !== 'pointercancel') {
      actions.openCanvasConversation(current.id)
    }
  }
  useEffect(() => {
    const node = root.current
    const wheel = event => {
      if (event.target.closest('.bt-spatial-widget,.bt-wallpaper-menu')) return
      if (!event.ctrlKey && event.target.closest('.bt-canvas-window,.bt-canvas-toolbar,.bt-canvas-dock')) return
      event.preventDefault()
      if (event.ctrlKey) {
        const rect = node.getBoundingClientRect()
        zoom(Math.exp(-event.deltaY * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top })
      } else update(value => setCanvasViewport(value, { ...value.viewport, x: value.viewport.x - event.deltaX, y: value.viewport.y - event.deltaY }))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [size.width, size.height])
  const fit = () => update(current => fitViewport(current, size, size.insets))
  const onCanvasContextMenu = event => {
    if (event.target.closest('.bt-canvas-window,.bt-canvas-toolbar,.bt-canvas-dock,.bt-spatial-widget,.bt-wallpaper-menu,.bt-canvas-zoom,.bt-drawer')) return
    event.preventDefault()
    event.stopPropagation()
    const box = root.current ? root.current.getBoundingClientRect() : { left: 0, top: 0 }
    const v = latest.current.viewport
    const worldX = (event.clientX - box.left - v.x) / v.zoom
    const worldY = (event.clientY - box.top - v.y) / v.zoom
    actions.openMenu({ kind: 'canvas', x: event.clientX, y: event.clientY, worldX, worldY })
  }
  const handleDragOver = event => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = event => {
    event.preventDefault()
    event.stopPropagation()
    const raw = event.dataTransfer?.getData('application/x-ds-bot') || event.dataTransfer?.getData('text/plain')
    if (!raw) return
    try {
      const { id, kind } = JSON.parse(raw)
      if (!id) return
      const box = root.current ? root.current.getBoundingClientRect() : { left: 0, top: 0 }
      const v = latest.current.viewport
      const x = Math.round((event.clientX - box.left - v.x) / v.zoom - (CANVAS_LIMITS.avatarWidth / 2))
      const y = Math.round((event.clientY - box.top - v.y) / v.zoom - (CANVAS_LIMITS.avatarHeight / 2))
      update(current => {
        const next = openWindow(current, { id, kind }, { x, y, compact: true })
        const win = next.windows.find(w => w.entityId === id || w.id === id || String(w.entityId) === String(id))
        if (win) {
          win.open = true
          win.compact = true
          win.x = x
          win.y = y
          actions.markCanvasWindowMoved?.(win.id)
        }
        return next
      })
      actions.saveCanvas?.()
    } catch { /* malformed drag */ }
  }
  return h('div', { ref: root, className: 'bt-canvas canvas-viewport', 'aria-label': t('Employee canvas'), onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onContextMenu: onCanvasContextMenu, onDragEnter: handleDragOver, onDragOver: handleDragOver, onDrop: handleDrop },
    h('style', null, SPATIAL_WIDGET_CSS),
    h(CanvasDrawer, { selectedBots, visible, state, update, actions, canvasRef: root }),
    h('main', {
      className: 'bt-canvas-stage',
      onContextMenu: onCanvasContextMenu,
      onPointerDown: event => { if (!event.target.closest('.bt-canvas-window,.bt-canvas-group-header,button,input,textarea,a,[contenteditable]')) start(event, event.shiftKey ? 'marquee' : 'pan') },
      onDragEnter: handleDragOver,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
      h('div', { className: 'bt-canvas-background', 'aria-hidden': true }),
      h('div', { className: 'bt-canvas-world', style: { transform: `translate(${state.viewport.x}px,${state.viewport.y}px) scale(${state.viewport.zoom})` } },
        state.groups.map(group => {
          const members = visible.filter(window => group.members.includes(window.id))
          if (!members.length) return null
          const x = Math.min(...members.map(window => window.x)) - 16, y = Math.min(...members.map(window => window.y)) - 45
          return h('section', { key: group.id, className: 'bt-canvas-group', style: { left: x, top: y, width: Math.max(...members.map(window => window.x + windowWidth(window))) - x + 16, height: Math.max(...members.map(window => window.y + windowHeight(window))) - y + 16 } },
            h('div', { className: 'bt-canvas-group-header' }, h(GroupTitle, { group, start, actions }),
              employeesOf(visible, group.members, roster).length >= 2 ? button(null, () => actions.openNewChat('group', employeesOf(visible, group.members, roster)), ChatsIcon, { title: t('Create group chat'), 'aria-label': t('Create group chat') }) : null,
              button(null, () => update(current => ungroupWindows(current, group.id)), CloseIcon, { title: t('Ungroup'), 'aria-label': t('Ungroup') })))
        }),
        visible.map(window => h(WindowCard, { key: window.id, window, roster, selected: state.selected.includes(window.id), active: state.active === window.id, actions, useSessions, useWork, SessionProvider, renderSlot, start }))),
      visible.length === 0 ? h('div', { className: 'bt-canvas-empty' }, h('h2', null, t('Your team workspace')), h('p', null, t('Open employees from the directory. Their conversations stay with them.')), button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon)) : null),
    h(CanvasQuickMessage, { bot: quickBot, actions }),
    h(CanvasAgenda, { roster, actions }),
    marquee ? h('div', { className: 'bt-canvas-marquee', style: marquee }) : null,
    h('nav', { className: 'bt-canvas-dock agent-dock', 'aria-label': t('Employees and group chats') }, [...roster.bots, ...roster.rooms].filter(entity => !entity.hidden).map(entity => h('button', {
      type: 'button',
      key: entity.id,
      className: 'bt-canvas-button bt-canvas-dock-item dock-item',
      'aria-label': entity.name,
      title: t('Click to open · Drag to place on canvas'),
      'aria-pressed': visible.some(window => window.entityId === entity.id && window.id === state.active),
      onPointerDown: event => startDockDrag(event, entity),
      draggable: true,
      onDragStart: event => {
        try {
          event.dataTransfer.setData('application/x-ds-bot', JSON.stringify({ id: entity.id, kind: roster.roomsById[entity.id] ? 'room' : 'bot' }))
          event.dataTransfer.effectAllowed = 'copyMove'
        } catch { /* dataTransfer */ }
      },
    },
      roster.roomsById[entity.id] ? h(RoomAvatar, { room: entity, roster, size: 36 }) : h(BotAvatar, { bot: entity, size: 36, main: isMainOf(roster, entity.id) }), h('span', null, entity.name)))),
    h('div', { className: 'bt-canvas-zoom floating-toolbar' }, button('−', () => zoom(1 / 1.15), null, { 'aria-label': t('Zoom out') }), h('output', null, `${Math.round(state.viewport.zoom * 100)}%`), button('+', () => zoom(1.15), null, { 'aria-label': t('Zoom in') }), button(t('Fit windows'), fit)),
    h('div', { className: 'bt-canvas-status' }, t('Drag background to pan · Shift-drag to select · Ctrl-scroll to zoom')))
}
