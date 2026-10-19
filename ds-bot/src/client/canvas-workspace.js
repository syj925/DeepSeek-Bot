import { RESTORED_CHAT_CSS } from './restored-chat-styles.js'
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BotAvatar, RoomAvatar } from './mark.js'
import { previewOf } from './text.js'
import { PlusIcon, PeopleIcon, ChatsIcon, GearIcon, CloseIcon, FolderIcon, DotsIcon, PencilIcon, CalendarIcon, SearchIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { ROOM_MODES, shownMode } from './group-settings.js'
import { memberWork, busyMembers, summaryText } from './member-status.js'
import { CanvasSession, canvasSessionId, registerSessionBridge } from './canvas-session.js'
import { CanvasQuickMessage, CanvasAgenda, SPATIAL_WIDGET_CSS, toggleSpatialWidget } from './spatial-widgets.js'
import { CanvasWallpaper } from './canvas-wallpaper.js'
import { CANVAS_LIMITS, collapseWindow, groupWindows, moveWindow, openWindow, resizeWindow, setCanvasSelection, setCanvasViewport, setWindowCompact, ungroupWindows, windowHeight, windowWidth } from './canvas-state.js'
import { t } from './i18n.js'
import { departmentFor, managerFor, reportsFor } from './designer-data.js'
import { Dock, DockIcon, DockItem, DockLabel } from './dock.js'
import { overlapMain, groupDropTarget, selectedMains, canvasDropPoint, mergeHintPosition } from './canvas-collaboration.js'
import { addDraftMembers, createEmptyGroup } from './canvas-state.js'
import { fitChat, resizeChat } from './chat-geometry.js'
import { MAIN_AGENT_POINTER } from './main-agent-drag.js'
import { MainAgentGroup, MAIN_GROUP_CSS } from './main-agent-group.js'

function MergeHint({ pair, viewport, canvasRef }) {
  const badge = useRef(null)
  const [position, setPosition] = useState({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const place = () => {
      if (!badge.current || !canvasRef.current) return
      setPosition(mergeHintPosition(pair.source, pair.target, viewport,
        { width: canvasRef.current.clientWidth, height: canvasRef.current.clientHeight },
        { width: badge.current.offsetWidth, height: badge.current.offsetHeight }))
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(badge.current)
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [pair, viewport, canvasRef])
  return h('div', { ref: badge, className: 'bt-metaball-badge glass-button glass-button--pill', style: position, role: 'status' },
    `${t('Release to create group chat')} · ${pair.sourceName} ＋ ${pair.targetName}`)
}

function gooeyBridge(p1, p2, r1 = 36, r2 = 36) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const d = Math.hypot(dx, dy)
  if (d === 0 || d > 240) return ''
  const angle = Math.atan2(dy, dx)
  const angle90 = angle + Math.PI / 2
  const pinch = Math.max(4, 18 * (1 - d / 240))

  const x1a = p1.x + r1 * Math.cos(angle90)
  const y1a = p1.y + r1 * Math.sin(angle90)
  const x1b = p1.x - r1 * Math.cos(angle90)
  const y1b = p1.y - r1 * Math.sin(angle90)

  const x2a = p2.x + r2 * Math.cos(angle90)
  const y2a = p2.y + r2 * Math.sin(angle90)
  const x2b = p2.x - r2 * Math.cos(angle90)
  const y2b = p2.y - r2 * Math.sin(angle90)

  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2

  const cx1 = mx + pinch * Math.cos(angle90)
  const cy1 = my + pinch * Math.sin(angle90)
  const cx2 = mx - pinch * Math.cos(angle90)
  const cy2 = my - pinch * Math.sin(angle90)

  return `M ${x1a} ${y1a} Q ${cx1} ${cy1} ${x2a} ${y2a} L ${x2b} ${y2b} Q ${cx2} ${cy2} ${x1b} ${y1b} Z`
}

function CanvasGlobalSearch({ actions }) {
  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        actions.openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  return h('div', { className: 'bt-canvas-global-search' },
    h('button', {
      type: 'button',
      className: 'bt-canvas-search-pill glass-button',
      'aria-label': t('Search Bots, chats and messages'),
      onClick: () => actions.openPalette(),
    },
      h('span', { className: 'bt-canvas-search-icon', 'aria-hidden': true }, h(SearchIcon)),
      h('span', { className: 'bt-canvas-search-label' }, t('Search Bots, chats and messages')),
      h('kbd', { className: 'bt-canvas-search-kbd' }, '⌘K')))
}

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

function WindowCard({ window, roster, selected, active, actions, useSessions, useWork, SessionProvider, renderSlot, start, isMergeTarget = false, dropTarget = false }) {
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
    className: `bt-canvas-window agent-window${isMergeTarget ? ' bt-canvas-merge-target' : ''}`, 'data-window-id': window.id, 'data-entity-id': entity.id,
    'data-kind': window.kind,
    'data-drop-target': dropTarget || isMergeTarget || undefined,
    'data-mode': window.compact ? 'card' : 'conversation',
    'data-active': active && selected || undefined, 'data-selected': selected || undefined, 'aria-label': entity.name,
    style: { left: window.x, top: window.y, width: windowWidth(window), height: windowHeight(window), zIndex: window.z + 2 },
    onPointerDownCapture: select, onFocusCapture: select, onContextMenu: event => { if (!event.target.closest('.bt-canvas-content')) openMenu(event) },
  }
  if (window.compact && !room) return h('section', shell,
    h('div', { className: 'bt-canvas-avatar-node' },
      h('button', { type: 'button', className: 'bt-canvas-avatar-open', 'aria-label': t('Open conversation'), title: t('Click to open · Drag to move'), onPointerDown: event => start(event, 'avatar', window.id), onClick: event => { if (event.detail === 0) actions.openCanvasConversation(window.id) }, onKeyDown: keyboard },
        h(BotAvatar, { bot: entity, size: 56, main: isMainOf(roster, entity.id) })),
      h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
        h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta text-secondary' }, entity.generalAssistant ? t('General Assistant') : isMainOf(roster, entity.id) ? t('Main Bot') : entity.role || t('Employee'))),
      h('span', { className: 'bt-canvas-avatar-status', 'data-state': statusKind, title: status, role: 'status', 'aria-label': status })))
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


export function getDepartmentForEntity(entity, roster) {
  return departmentFor(entity, roster)
}

export function groupDockEntities(entities, roster) {
  const seenDepts = new Set()
  const groups = []

  for (const entity of entities) {
    const isRoom = Boolean(roster?.roomsById?.[entity.id])
    if (isRoom) {
      groups.push({
        leadEntity: entity,
        dept: null,
        deptBadge: null,
        deptTitle: entity.name,
      })
      continue
    }

    const dept = getDepartmentForEntity(entity, roster)
    if (dept) {
      if (!seenDepts.has(dept.key)) {
        seenDepts.add(dept.key)
        groups.push({
          leadEntity: roster.byId[dept.agents.find(agent => agent.isLead)?.id] ?? entity,
          dept,
          deptBadge: dept.name,
          deptTitle: dept.title,
        })
      }
    } else {
      groups.push({
        leadEntity: entity,
        dept: null,
        deptBadge: entity.role || t('Employee'),
        deptTitle: entity.name,
      })
    }
  }
  return groups
}

export function DockCollaborationPopover({ entity, department: initialDept, pos, roster, work, useSessions, actions, size, onMouseEnter, onMouseLeave, onClose }) {
  if (!entity || !pos) return null
  const department = initialDept || getDepartmentForEntity(entity, roster)
  const isRoom = Boolean(roster?.roomsById?.[entity.id])
  const isMain = !isRoom && isMainOf(roster, entity.id)
  const sessionId = isRoom ? entity.id : (entity.sessionId ?? entity.id)
  const preview = useSessions ? useSessions(list => previewOf(list, sessionId, roster?.exchangeTurns?.[sessionId])) : ''
  const mainBot = managerFor(entity, roster)

  // Status calculation
  const botWork = !isRoom ? work?.bots?.[entity.id] : null
  const roomActivity = isRoom ? busyMembers(entity, work, roster) : []
  const isApproving = isRoom
    ? ((work?.approvals ?? []).some(entry => entry.roomId === entity.id) || roomActivity.some(entry => entry.state === 'ask'))
    : (work?.approvals ?? []).some(entry => entry.botId === entity.id)
  const isQuestion = !isRoom && roster?.questions?.[sessionId] !== undefined
  const isBusy = isRoom
    ? (work?.rooms?.[entity.id]?.length ?? 0) > 0
    : Boolean(botWork) || Object.values(work?.rooms ?? {}).some(entries => entries.some(entry => entry.botId === entity.id))

  const statusLabel = isApproving
    ? t('Waiting for approval')
    : isQuestion
      ? t('Waiting for response')
      : isBusy
        ? t('In Execution')
        : department
          ? t('All agents ready')
          : t('Ready to collaborate')

  const statusKind = isApproving || isQuestion ? 'waiting' : isBusy ? 'working' : 'available'

  // Sub-agents when entity is Main Agent
  const subBots = reportsFor(entity, roster)
  const anySubBusy = subBots.some(sub => Boolean(work?.bots?.[sub.id]))

  // Handlers
  const handleOpenChat = () => {
    onClose?.()
    actions.openCanvasEntity?.(entity.id, size)
  }
  const handlePlaceCanvas = () => {
    onClose?.()
    actions.updateCanvas?.(current => {
      const existing = current.windows.find(w => w.entityId === entity.id)
      if (existing) {
        return { ...current, windows: current.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window), active: existing.id, selected: [existing.id] }
      }
      return openWindow(current, { id: entity.id, kind: isRoom ? 'room' : 'bot' })
    })
    actions.saveCanvas?.()
  }

  const handlePlaceAgent = (targetAgent) => {
    onClose?.()
    actions.updateCanvas?.(current => {
      const existing = current.windows.find(w => w.entityId === targetAgent.id)
      if (existing) {
        return { ...current, windows: current.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window), active: existing.id, selected: [existing.id] }
      }
      return openWindow(current, { id: targetAgent.id, kind: 'bot' })
    })
    actions.saveCanvas?.()
  }

  const handlePlaceDepartment = () => {
    onClose?.()
    actions.updateCanvas?.(current => {
      let next = current
      const list = department?.agents || [entity]
      list.forEach(ag => {
        const existing = next.windows.find(w => w.entityId === ag.id)
        next = existing ? { ...next, windows: next.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window) } : openWindow(next, { id: ag.id, kind: 'bot' })
      })
      return next
    })
    actions.saveCanvas?.()
  }

  const popoverStyle = {
    left: `${pos.x}px`,
    bottom: `${pos.bottom}px`,
  }

  const arrowStyle = {
    left: `calc(50% + ${Math.round(pos.arrowOffset || 0)}px)`,
  }

  return h('div', {
    className: 'bt-dock-popover glass-card',
    style: popoverStyle,
    onMouseEnter,
    onMouseLeave,
    role: 'dialog',
    'aria-label': `${entity.name} · ${t('Collaboration Progress')}`,
  },
    // Header
    h('div', { className: 'bt-dock-popover-header' },
      isRoom
        ? h(RoomAvatar, { room: entity, roster, size: 40 })
        : h(BotAvatar, { bot: entity, size: 40, main: isMain }),
      h('div', { className: 'bt-dock-popover-meta' },
        h('div', { className: 'bt-dock-popover-title-row' },
          h('span', { className: 'bt-dock-popover-name' },
            department ? `${department.icon} ${entity.name}` : entity.name),
          department ? h('span', { className: 'bt-dock-dept-title-tag' }, department.title) : null,
          h('span', { className: `bt-dock-status-pill bt-dock-status-${statusKind}` },
            h('span', { className: `bt-pulse-dot bt-pulse-${statusKind}` }),
            statusLabel)),
        h('div', { className: 'bt-dock-role-badge' },
          entity.generalAssistant ? t('General Assistant') : isMain
            ? t('Main Agent · Supervision & Orchestration Hub')
            : isRoom
              ? t('Collaboration Group · Multi-Agent')
              : t('Sub-Agent · Specialized Collaboration')),
        department?.desc ? h('div', { className: 'bt-dock-dept-desc' }, department.desc) : null)),

    // Supervision Linkage / Topology
    isMain ? h('div', { className: 'bt-dock-supervision-section' },
      h('div', { className: 'bt-dock-section-title' },
        h('span', null, t('Supervision & Sub-Agent Network'))),
      subBots.length > 0
        ? h('div', { className: 'bt-dock-subagents-grid' },
          subBots.slice(0, 4).map(sub => {
            const subDoing = work?.bots?.[sub.id]
            const subTool = subDoing?.tool
            const subState = subDoing ? 'working' : 'available'
            return h('div', { key: sub.id, className: `bt-dock-subagent-card bt-subagent-${subState}` },
              h(BotAvatar, { bot: sub, size: 22 }),
              h('div', { className: 'bt-dock-subagent-info' },
                h('span', { className: 'bt-dock-subagent-name' }, sub.name),
                h('span', { className: 'bt-dock-subagent-state' },
                  subTool ? `🛠️ ${subTool}` : (subDoing ? t('Working') : t('Available')))))
          }),
          subBots.length > 4 ? h('div', { className: 'bt-dock-subagent-card bt-subagent-more' }, `+${subBots.length - 4}`) : null)
        : h('div', { className: 'bt-dock-subagents-empty' }, t('No sub-agents in team yet'))
    ) : (!isRoom && mainBot ? h('div', { className: 'bt-dock-supervision-chain' },
      h('div', { className: 'bt-dock-chain-node' },
        h(BotAvatar, { bot: mainBot, size: 24, main: true }),
        h('span', { className: 'bt-dock-chain-label' }, `👑 ${mainBot.name}`)),
      h('div', { className: 'bt-dock-chain-arrow' },
        h('span', { className: 'bt-dock-chain-arrow-text' }, t('Supervised by {name}', { name: mainBot.name })),
        h('span', { className: 'bt-dock-chain-arrow-icon' }, '➔')),
      h('div', { className: 'bt-dock-chain-node bt-node-active' },
        h(BotAvatar, { bot: entity, size: 24 }),
        h('span', { className: 'bt-dock-chain-label' }, `🤖 ${entity.name}`)))
    : (isRoom ? h('div', { className: 'bt-dock-room-chain' },
      h('span', { className: 'bt-dock-room-admin-tag' },
        entity.admin && roster?.byId?.[entity.admin] ? `👑 ${t('Admin: {name}', { name: roster.byId[entity.admin].name })}` : t('Group collaboration')),
      h('span', { className: 'bt-dock-room-mode-tag' }, entity.mode === 'admin' ? t('Admin reply only') : t('All members collaborative'))) : null)),

    // Department Agents Showcase (部门全部 Agent 成员展示矩阵)
    department && department.agents && department.agents.length > 0 ? h('div', { className: 'bt-dock-dept-section' },
      h('div', { className: 'bt-dock-section-title' },
        h('span', null, `🏢 ${department.title} · ${t('Department Members')} (${department.agents.length})`)),
      h('div', { className: 'bt-dock-dept-agents-grid' },
        department.agents.map(ag => {
          const isAgLead = ag.isLead || ag.id === entity.id
          return h('div', {
            key: ag.id,
            className: 'bt-dock-agent-card',
            draggable: true,
            title: `${ag.name} · ${t('Click to open · Drag to place on canvas')}`,
            onDragStart: event => {
              try {
                event.dataTransfer.setData('application/x-ds-bot', JSON.stringify({ id: ag.id, kind: 'bot' }))
                event.dataTransfer.effectAllowed = 'copyMove'
              } catch { /* ignored */ }
            },
          },
            h('div', { className: 'bt-dock-agent-card-top' },
              h(BotAvatar, { bot: ag, size: 28, main: ag.isMain, admin: isAgLead }),
              h('div', { className: 'bt-dock-agent-card-meta' },
                h('div', { className: 'bt-dock-agent-card-name-row' },
                  h('span', { className: 'bt-dock-agent-card-name' }, ag.name),
                  ag.badge ? h('span', { className: `bt-dock-agent-badge ${isAgLead ? 'bt-badge-lead' : ''}` }, ag.badge) : null),
                h('div', { className: 'bt-dock-agent-card-role' }, ag.role))),
            h('div', { className: 'bt-dock-agent-card-actions' },
              h('button', {
                type: 'button',
                className: 'bt-dock-agent-mini-btn',
                onClick: (e) => {
                  e?.stopPropagation?.()
                  onClose?.()
                  actions.openCanvasEntity?.(ag.id, size)
                },
                title: t('Open chat'),
              }, h(ChatsIcon), t('Chat')),
              h('button', {
                type: 'button',
                className: 'bt-dock-agent-mini-btn',
                onClick: (e) => {
                  e?.stopPropagation?.()
                  handlePlaceAgent(ag)
                },
                title: t('Place on canvas'),
              }, h(PlusIcon), '+')))
      }))) : null,

    // Collaboration Progress Stepper
    h('div', { className: 'bt-dock-pipeline' },
      h('div', { className: 'bt-dock-step bt-step-ready' },
        h('span', { className: 'bt-step-icon' }, '○'),
        h('span', { className: 'bt-step-label' }, t('Task Breakdown'))),
      h('div', { className: 'bt-step-connector bt-conn-active' }),
      h('div', { className: `bt-dock-step ${isBusy || anySubBusy ? 'bt-step-active' : 'bt-step-ready'}` },
        h('span', { className: 'bt-step-icon' }, isBusy || anySubBusy ? '⚡' : '○'),
        h('span', { className: 'bt-step-label' }, t('In Execution'))),
      h('div', { className: 'bt-step-connector' }),
      h('div', { className: 'bt-dock-step bt-step-pending' },
        h('span', { className: 'bt-step-icon' }, '○'),
        h('span', { className: 'bt-step-label' }, t('Result Audit')))),

    // Current Task Context / Progress
    h('div', { className: 'bt-dock-task-preview' },
      botWork?.tool
        ? h('span', { className: 'bt-dock-task-highlight' }, `🛠️ ${t('Working on: {tool}', { tool: botWork.tool })}`)
        : preview
          ? h('span', null, `💬 "${preview.slice(0, 90)}${preview.length > 90 ? '…' : ''}"`)
          : (isMain
            ? h('span', null, t('Main Agent oversees collaboration targets and supervises sub-agent deliverables.'))
            : (isRoom
              ? h('span', null, t('Collaborative group workspace for multi-agent synthesis and discussions.'))
              : h('span', null, entity.role ? `${t('Role')}: ${entity.role}` : t('Specialized collaboration ready, listening for commands.'))))),

    // Action buttons
    h('div', { className: 'bt-dock-popover-actions' },
      h('button', {
        type: 'button',
        className: 'bt-canvas-button glass-button bt-dock-action-btn',
        onClick: handleOpenChat,
      }, h(ChatsIcon), t('Open chat')),
      h('button', {
        type: 'button',
        className: 'bt-canvas-button glass-button bt-dock-action-btn bt-dock-action-primary',
        onClick: handlePlaceCanvas,
      }, h(PlusIcon), t('Place on canvas')),
      department && department.agents && department.agents.length > 1 ? h('button', {
        type: 'button',
        className: 'bt-canvas-button glass-button bt-dock-action-btn',
        onClick: handlePlaceDepartment,
      }, h(FolderIcon), t('Place department on canvas')) : null),

    h('div', { className: 'bt-dock-popover-arrow', style: arrowStyle }))
}

const safeClearTimeout = timer => {
  if (typeof clearTimeout !== 'undefined') clearTimeout(timer)
}
const safeSetTimeout = (fn, ms) => {
  if (typeof setTimeout !== 'undefined') return setTimeout(fn, ms)
  return null
}

function CanvasChatWindow(props) {
  const { window, roster, actions, active = true, order = 0, size } = props
  const [conversationId, setConversationId] = useState(window.entityId)
  const conversation = roster.byId[conversationId] ?? roster.roomsById[conversationId]
  const displayWindow = conversation ? { ...window, entityId: conversation.id, kind: roster.roomsById[conversation.id] ? 'room' : 'bot' } : window
  const [closing, setClosing] = useState(false)
  const [offset, setOffset] = useState(() => ({ x: Math.min((order % 5) * 28, Math.max(0, ((size?.width ?? 1000) - 860) / 2 - 24)), y: Math.min((order % 5) * 24, Math.max(0, ((size?.height ?? 800) - 700) / 2 - 24)) }))
  const [dimensions, setDimensions] = useState(null)
  const geometry = useRef(null)
  geometry.current = { dimensions, offset }
  const node = useRef(null)
  const drag = useRef(null)
  const backdropPress = useRef(null)
  const done = useRef(false)
  const restoreFocus = useRef(true)
  useEffect(() => {
    if (active && !closing && !node.current?.contains(document.activeElement)) node.current?.focus({ preventScroll: true })
  }, [active])
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
    return () => { if (restoreFocus.current && previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    const parent = node.current.parentElement
    const observer = new ResizeObserver(() => {
      const current = geometry.current
      if (!current.dimensions) return
      const padding = getComputedStyle(parent)
      const available = parent.getBoundingClientRect()
      const fitted = fitChat(current.dimensions, current.offset, available.width - (parseFloat(padding.paddingLeft) || 0) - (parseFloat(padding.paddingRight) || 0), available.height)
      setDimensions(fitted.size); setOffset(fitted.offset)
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let press
    const outside = target => target instanceof Element && Boolean(target.closest('.bt-canvas')) && !target.closest('.bt-canvas-window,.bt-canvas-group,.bt-canvas-dock,.bt-spatial-widget,button,input,textarea,a,[contenteditable],.bt-menu,[role=dialog],[role=listbox],.bt-overlay,.bt-drawer,.bt-floating-team')
    const down = event => { press = event.button === 0 && outside(event.target) ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null }
    const up = event => { if (press?.id === event.pointerId && outside(event.target) && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) { restoreFocus.current = false; dismiss() } press = null }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true) }
  }, [])
  const start = (event, edge) => {
    if (event.button !== 0 || closing) return
    event.preventDefault()
    event.stopPropagation()
    const box = node.current.getBoundingClientRect()
    const parent = node.current.parentElement.getBoundingClientRect()
    const padding = getComputedStyle(node.current.parentElement)
    const bounds = { left: parent.left + (parseFloat(padding.paddingLeft) || 0), right: parent.right - (parseFloat(padding.paddingRight) || 0), top: parent.top, bottom: parent.bottom }
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset, box, bounds, edge }
    node.current.setPointerCapture(event.pointerId)
  }
  const end = event => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (node.current.hasPointerCapture(event.pointerId)) node.current.releasePointerCapture(event.pointerId)
  }
  return h('div', { className: 'bt-canvas-chat-layer', 'data-closing': closing || undefined, style: { zIndex: 40 },
    onPointerDown: event => {
      backdropPress.current = null
      if (event.target !== event.currentTarget) return
      event.stopPropagation()
      if (event.button !== 0 || closing) return
      event.preventDefault()
      backdropPress.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    },
    onPointerUp: event => {
      const press = backdropPress.current
      backdropPress.current = null
      if (event.target !== event.currentTarget) return
      event.stopPropagation()
      // Only a click begun on the backdrop closes the chat, not text selection or a drag released outside.
      if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 6) {
        restoreFocus.current = false
        actions.updateCanvas(state => setCanvasSelection(state, []))
        dismiss()
      }
    },
    onPointerCancel: () => { backdropPress.current = null },
    onContextMenu: event => { if (event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation() } },
  },
    h('div', { ref: node, className: 'bt-canvas-chat-float', role: 'dialog', tabIndex: -1, 'aria-label': entityOf(window, roster)?.name,
      'data-entity-id': window.entityId, 'data-active': active || undefined,
      'data-closing': closing || undefined, 'data-sized': dimensions ? true : undefined,
      style: { translate: `${offset.x}px ${offset.y}px`, ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}) },
      onPointerDown: event => { event.stopPropagation(); if (!active) actions.updateCanvas(state => setCanvasSelection(state, [], window.id)) },
      onPointerMove: event => {
        const current = drag.current
        if (current?.id !== event.pointerId) return
        const { box, bounds } = current
        if (current.edge) {
          const resized = resizeChat(box, bounds, current.edge, event.clientX - current.x, event.clientY - current.y)
          setDimensions({ width: resized.width, height: resized.height })
          setOffset({ x: current.offset.x + resized.x, y: current.offset.y + resized.y })
          event.stopPropagation()
          return
        }
        const dx = Math.max(bounds.left + 12 - box.left, Math.min(bounds.right - 12 - box.right, event.clientX - current.x))
        const dy = Math.max(bounds.top + 12 - box.top, Math.min(bounds.bottom - 12 - box.bottom, event.clientY - current.y))
        setOffset({ x: current.offset.x + dx, y: current.offset.y + dy })
        event.stopPropagation()
      }, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { drag.current = null },
      onKeyDown: event => {
        if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent?.isComposing && !event.target.closest('[role=combobox],[aria-expanded=true]')) { event.preventDefault(); event.stopPropagation(); dismiss() }
      },
      onAnimationEnd: event => { if (closing && event.target === event.currentTarget) finish() },
    }, h('div', { className: 'bt-restored-chat-shell' },
      h('header', { className: 'bt-team-chat-bar', onPointerDown: event => { if (!event.target.closest('button')) start(event) } },
        h('div', { className: 'bt-team-chat-header-main' },
          displayWindow.kind === 'room' ? h(RoomAvatar, { room: entityOf(displayWindow, roster), roster, size: 36 }) : h(BotAvatar, { bot: entityOf(displayWindow, roster), size: 36 }),
          h('strong', { className: 'bt-team-chat-name' }, entityOf(displayWindow, roster)?.name),
          entityOf(displayWindow, roster)?.generalAssistant ? h('span', { className: 'bt-assistant-badge' }, t('General Assistant')) : null),
        h('div', { className: 'bt-team-chat-tools' },
          button(null, () => actions.openSettings(displayWindow.kind === 'room' ? 'groups' : 'bots', displayWindow.entityId), GearIcon, { title: t('Settings'), 'aria-label': t('Settings') }),
          button(null, dismiss, CloseIcon, { title: t('Close window'), 'aria-label': t('Close window') }))),
      h('div', { className: 'bt-agent-chat-container bt-restored-chat' },
        h(CanvasSession, { sessionId: canvasSessionId(displayWindow, roster), actions, useSessions: props.useSessions, SessionProvider: props.SessionProvider, renderSlot: props.renderSlot, onOpenConversation: setConversationId }))),
    ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map(edge => h('div', {
      key: edge, className: 'bt-chat-resize', 'data-edge': edge, 'aria-hidden': true,
      title: t('Drag to resize'), onPointerDown: event => start(event, edge),
    }))))
}

export function CanvasWorkspace({ useRoster, useCanvas, useSessions, useWork, actions, SessionProvider, renderSlot }) {
  registerSessionBridge(SessionProvider, renderSlot)
  const roster = useRoster(value => value)
  const state = useCanvas(value => value)
  const work = useWork ? useWork(value => value) : { bots: {}, rooms: {}, approvals: [] }
  const [dockHover, setDockHover] = useState(null)
  const dockHoverTimer = useRef(null)
  useEffect(() => () => safeClearTimeout(dockHoverTimer.current), [])
  const latest = useRef(state)
  latest.current = state
  const root = useRef(null)
  const drag = useRef(null)
  const suppressContext = useRef(false)
  const [groupMembers, setGroupMembers] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [mergePair, setMergePair] = useState(null)
  const mergePairRef = useRef(null)
  mergePairRef.current = mergePair
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
    const clearSelection = event => {
      if (event.button !== 0 || !latest.current.selected.length) return
      const target = event.composedPath().find(node => node instanceof Element)
      // Context menu commands act on the selected employees until the command runs.
      if (target?.closest('.bt-canvas-window,.bt-canvas-group,.bt-menu')) return
      update(state => setCanvasSelection(state, []))
    }
    document.addEventListener('pointerdown', clearSelection, true)
    return () => document.removeEventListener('pointerdown', clearSelection, true)
  }, [])
  useEffect(() => {
    const node = root.current
    const toolbar = node.querySelector('.bt-canvas-toolbar')
    const dock = node.querySelector('.bt-canvas-dock')
    const controls = node.querySelector('.bt-canvas-zoom')
    const team = node.closest('.bt-canvas-frame')?.querySelector('.bt-floating-team')
    const widgets = [...node.querySelectorAll('.bt-spatial-widget')]
    const arrangementLayout = () => {
      const box = node.getBoundingClientRect()
      const elements = [toolbar, dock, controls, team, ...node.querySelectorAll('.bt-spatial-widget')]
      const obstacles = elements.filter(element => element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height }
      })
      return { size: { width: box.width, height: box.height, insets: { top: 24, left: 24, right: 24, bottom: 24 } }, obstacles }
    }
    actions.canvasArrangementLayout = arrangementLayout
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
      actions.setCanvasSize({ width: box.width, height: box.height, insets: { top: toolbarBottom + 20, bottom, left: 24, right: 24 } })
    }
    const observer = new ResizeObserver(measure)
    for (const element of [node, toolbar, dock, controls].filter(Boolean)) observer.observe(element)
    const position = new MutationObserver(measure)
    if (team) { observer.observe(team); position.observe(team, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    for (const widget of widgets) { observer.observe(widget); position.observe(widget, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    return () => { observer.disconnect(); position.disconnect(); if (actions.canvasArrangementLayout === arrangementLayout) delete actions.canvasArrangementLayout; actions.setCanvasSize(null) }
  }, [])
  const start = (event, kind, id) => {
    if (event.button !== 0 && !(event.button === 2 && kind === 'marquee')) return
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
    suppressContext.current = false
    drag.current = { kind, id, ids, startX: event.clientX, startY: event.clientY, state: current, box, moved: false, right: event.button === 2 }
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
    if (current.kind === 'window' || current.kind === 'group' || current.kind === 'avatar' && current.moved) {
      const next = current.ids.reduce((value, id) => moveWindow(value, id, dx / v.zoom, dy / v.zoom), { ...current.state, selected: current.ids })
      if (current.kind === 'group') next.groups = next.groups.map(group => group.id === current.id && group.draft ? { ...group, x: group.x + dx / v.zoom, y: group.y + dy / v.zoom } : group)
      current.latest = next
      current.target = groupDropTarget(next, roster, current.ids, { x: (event.clientX - current.box.left - v.x) / v.zoom, y: (event.clientY - current.box.top - v.y) / v.zoom })
      setDropTarget(current.target?.windowId ?? current.target?.id ?? null)
      update(next, false)
    }
    if (current.kind === 'resize') update(() => resizeWindow(current.state, current.id, dx / v.zoom, dy / v.zoom), false)
    if (current.kind === 'marquee') {
      if (current.right && !current.moved) return
      const left = Math.min(current.startX, event.clientX) - current.box.left, top = Math.min(current.startY, event.clientY) - current.box.top
      const rect = { left, top, width: Math.abs(dx), height: Math.abs(dy) }
      setMarquee(rect)
      const x = (left - v.x) / v.zoom, y = (top - v.y) / v.zoom
      const ids = current.state.windows.filter(window => window.open && (!current.right || window.kind === 'bot') && window.x < x + rect.width / v.zoom && window.x + windowWidth(window) > x && window.y < y + rect.height / v.zoom && window.y + windowHeight(window) > y).map(window => window.id)
      update(value => setCanvasSelection(value, ids), false)
    }
    if (current.moved && (current.kind === 'avatar' || current.kind === 'window') && current.ids?.length === 1) {
      const draggedWin = (current.latest ?? latest.current).windows.find(w => w.id === current.id)
      if (draggedWin && draggedWin.kind === 'bot' && roster.byId[draggedWin.entityId]) {
        // Preview and drop use the same displayed avatar geometry and threshold.
        const shown = { ...(current.latest ?? latest.current), windows: (current.latest ?? latest.current).windows.map(window => ({ ...window, compact: true })) }
        const other = current.target ? undefined : overlapMain(shown, roster, current.id)
        const closest = other ? {
          sourceWindowId: draggedWin.id, targetWindowId: other.id,
          sourceName: roster.byId[draggedWin.entityId]?.name || '',
          targetName: roster.byId[other.entityId]?.name || '',
          source: { x: draggedWin.x + 60, y: draggedWin.y + 38 },
          target: { x: other.x + 60, y: other.y + 38 },
          dist: Math.hypot(draggedWin.x - other.x, draggedWin.y - other.y),
        } : null
        setMergePair(closest)
      } else if (mergePairRef.current) setMergePair(null)
    } else if (mergePairRef.current) {
      setMergePair(null)
    }
  }
  const finish = event => {
    if (!drag.current) return
    const current = drag.current
    drag.current = null
    setMarquee(null)
    setDropTarget(null)
    if (root.current.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId)
    if (current.moved && (current.kind === 'window' || current.kind === 'avatar' || current.kind === 'group')) {
      current.ids?.forEach(id => actions.markCanvasWindowMoved?.(id))
    }
    actions.saveCanvas()
    if (event.type === 'pointercancel') {
      setMergePair(null)
      if (current.state) update(current.state)
      return
    }
    setMergePair(null)
    if (current.kind === 'marquee' && !current.right && !current.moved) {
      update(state => setCanvasSelection(state, []))
      return
    }
    if (current.right && current.moved) suppressContext.current = true
    if (current.right && !current.moved) {
      onCanvasContextMenu({ target: event.target, clientX: current.startX, clientY: current.startY, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() })
      suppressContext.current = true
    }
    if (current.moved && current.target) {
      update(current.state)
      proposeGroup(selectedMains(current.state, roster, current.ids), current.target)
      return
    }
    if (current.moved && current.ids?.length === 1 && ['avatar', 'window'].includes(current.kind)) {
      const next = current.latest ?? latest.current
      const target = overlapMain({ ...next, windows: next.windows.map(window => ({ ...window, compact: true })) }, roster, current.id)
      if (target) {
        const source = next.windows.find(window => window.id === current.id)
        update(current.state)
        proposeGroup([source.entityId, target.entityId])
        return
      }
    }
    if (current.kind === 'dock' && !current.moved && event.type !== 'pointercancel') {
      actions.openCanvasEntity(current.entity.id, size)
    } else if (current.kind === 'avatar' && !current.moved && event.type !== 'pointercancel') {
      actions.openCanvasConversation(current.id)
    }
  }
  const proposeGroup = (members, target) => {
    const group = target?.kind === 'draft' ? latest.current.groups.find(group => group.id === target.id) : null
    setGroupMembers({ members: [...new Set([...(group ? selectedMains(latest.current, roster, group.members, true) : []), ...members])], target: target ? { ...target, name: group?.name ?? roster.roomsById[target.id]?.name } : undefined })
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
  const onCanvasContextMenu = event => {
    if (event.target.closest('.bt-canvas-window,.bt-canvas-toolbar,.bt-canvas-dock,.bt-spatial-widget,.bt-wallpaper-menu,.bt-canvas-zoom,.bt-drawer')) return
    event.preventDefault()
    event.stopPropagation()
    if (suppressContext.current) { suppressContext.current = false; return }
    const box = root.current ? root.current.getBoundingClientRect() : { left: 0, top: 0 }
    const v = latest.current.viewport
    const worldX = (event.clientX - box.left - v.x) / v.zoom
    const worldY = (event.clientY - box.top - v.y) / v.zoom
    actions.openMenu({ kind: 'canvas', x: event.clientX, y: event.clientY, worldX, worldY,
      createEmptyGroup: () => update(current => createEmptyGroup(current, { x: worldX, y: worldY, name: t('New group') })),
      createSelectedGroup: selectedBots.length >= 2 ? () => proposeGroup(selectedBots) : undefined })
  }
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
      if (kind !== 'bot' && kind !== 'room' || !(kind === 'bot' ? roster.byId[id] : roster.roomsById[id])) return
      const probe = openWindow(latest.current, { id, kind }, { x, y, compact: true })
      const winId = probe.windows.find(window => window.entityId === id)?.id
      const target = kind === 'bot' ? groupDropTarget(probe, roster, [winId], { x: (event.clientX - box.left - v.x) / v.zoom, y: (event.clientY - box.top - v.y) / v.zoom }) : null
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
      if (target) proposeGroup([id], target)
    } catch { /* malformed drag */ }
  }
  return h('div', { ref: root, className: 'bt-canvas canvas-viewport', 'aria-label': t('Employee canvas'), onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onContextMenu: onCanvasContextMenu, onDragEnter: handleDragOver, onDragOver: handleDragOver, onDrop: handleDrop },
    h('style', null, SPATIAL_WIDGET_CSS + RESTORED_CHAT_CSS),
    h('style', null, MAIN_GROUP_CSS),
    groupMembers ? h(MainAgentGroup, { ...groupMembers, roster, actions, onComplete: completeGroup, onClose: () => setGroupMembers(null) }) : null,
    h('nav', { className: 'bt-canvas-toolbar', 'aria-label': t('Canvas tools') },
      h('strong', null, t('Employee canvas')),
      button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon),
      button(t('Create employee'), () => actions.openNewChat('create'), PlusIcon),
      button(t(selectedBots.length >= 2 ? 'Create group with selected' : 'Create group chat'), () => actions.openNewChat('group', selectedBots.length >= 2 ? selectedBots : []), ChatsIcon),
      selectedBots.length === 2 ? button(t('Bot exchange'), () => actions.openExchange(...selectedBots), ChatsIcon) : null,
      button(t('Arrange cards'), () => actions.arrangeCanvasCards(), null, { disabled: visible.length === 0 }),
      button(t('Group windows'), () => update(current => groupWindows(current, current.selected, { name: t('Window group') })), FolderIcon, { disabled: state.selected.length < 2 }),
      button(t('Ungroup'), () => update(current => ungroupWindows(current, current.selected)), null, { disabled: !state.groups.some(group => group.members.some(id => state.selected.includes(id))) }),
      button(t('Collapse conversations'), () => actions.compactCanvasConversations(), null, { disabled: !visible.some(window => !window.compact) }),
      button(t('Quick message'), () => toggleSpatialWidget('quick'), ChatsIcon),
      button(t('Agenda'), () => toggleSpatialWidget('agenda'), CalendarIcon),
      h(CanvasWallpaper, { canvasRef: root }),
      button(t('Settings'), () => actions.openSettings(), GearIcon),
      button(t('Classic view'), () => actions.openClassicSession())),
    h(CanvasGlobalSearch, { actions }),
    h('main', {
      className: 'bt-canvas-stage',
      onContextMenu: onCanvasContextMenu,
      onPointerDown: event => { if (!event.target.closest('.bt-canvas-window,.bt-canvas-group-header,button,input,textarea,a,[contenteditable]')) start(event, 'marquee') },
      onDragEnter: handleDragOver,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
      h('div', { className: 'bt-canvas-background', 'aria-hidden': true }),
      h('div', { className: 'bt-canvas-world', style: { transform: `translate(${state.viewport.x}px,${state.viewport.y}px) scale(${state.viewport.zoom})` } },
        state.groups.map(group => {
          if (group.draft) return h('section', { key: group.id, className: 'bt-canvas-group bt-canvas-draft', 'data-group-id': group.id, 'data-drop-target': dropTarget === group.id || undefined, style: { left: group.x, top: group.y, width: 280, height: 180 } },
            h('div', { className: 'bt-canvas-group-header' }, h(GroupTitle, { group, start, actions }), button(null, () => update(current => ungroupWindows(current, group.id)), CloseIcon, { title: t('Remove empty group'), 'aria-label': t('Remove empty group') })),
            h('div', { className: 'bt-canvas-draft-members' }, selectedMains(state, roster, group.members, true).map(id => h(BotAvatar, { key: id, bot: roster.byId[id], size: 36 }))),
            h('p', null, t(group.members.length ? 'Add another employee to start a group conversation.' : 'Drag employees here')),
            selectedMains(state, roster, group.members, true).length >= 2 ? button(t('Create group chat'), () => proposeGroup([], { kind: 'draft', id: group.id }), ChatsIcon) : null)
          const members = visible.filter(window => group.members.includes(window.id))
          if (!members.length) return null
          const x = Math.min(...members.map(window => window.x)) - 16, y = Math.min(...members.map(window => window.y)) - 45
          return h('section', { key: group.id, className: 'bt-canvas-group', style: { left: x, top: y, width: Math.max(...members.map(window => window.x + windowWidth({ ...window, compact: true }))) - x + 16, height: Math.max(...members.map(window => window.y + windowHeight({ ...window, compact: true }))) - y + 16 } },
            h('div', { className: 'bt-canvas-group-header' }, h(GroupTitle, { group, start, actions }),
              employeesOf(visible, group.members, roster).length >= 2 ? button(null, () => actions.openNewChat('group', employeesOf(visible, group.members, roster)), ChatsIcon, { title: t('Create group chat'), 'aria-label': t('Create group chat') }) : null,
              button(null, () => update(current => ungroupWindows(current, group.id)), CloseIcon, { title: t('Ungroup'), 'aria-label': t('Ungroup') })))
        }),
        visible.map(window => h(WindowCard, { key: window.id, window: { ...window, compact: true }, roster, selected: state.selected.includes(window.id), active: state.active === window.id, actions, useSessions, useWork, SessionProvider, renderSlot, start, dropTarget: dropTarget === window.id, isMergeTarget: mergePair?.targetWindowId === window.id })),
        mergePair ? h('div', {
          className: 'bt-metaball-container',
          style: { position: 'absolute', left: 0, top: 0, width: '1px', height: '1px', pointerEvents: 'none', zIndex: 1 },
        },
          h('svg', {
            className: 'bt-metaball-svg',
            style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible' },
          },
            h('defs', null,
              h('filter', { id: 'canvas-gooey-filter', x: '-50%', y: '-50%', width: '200%', height: '200%' },
                h('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 12, result: 'blur' }),
                h('feColorMatrix', { in: 'blur', mode: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12', result: 'goo' }),
                h('feComposite', { in: 'SourceGraphic', in2: 'goo', operator: 'atop' }))),
            h('g', { filter: 'url(#canvas-gooey-filter)' },
              h('circle', {
                cx: mergePair.source.x,
                cy: mergePair.source.y,
                r: Math.max(32, 46 - mergePair.dist * 0.08),
                fill: 'rgba(56, 120, 250, 0.88)',
              }),
              h('circle', {
                cx: mergePair.target.x,
                cy: mergePair.target.y,
                r: Math.max(38, 52 - mergePair.dist * 0.08),
                fill: 'rgba(56, 120, 250, 0.88)',
              }),
              h('path', {
                d: gooeyBridge(mergePair.source, mergePair.target, 36, 40),
                fill: 'rgba(56, 120, 250, 0.88)',
              }))),
          ) : null),
      visible.length === 0 ? h('div', { className: 'bt-canvas-empty' }, h('h2', null, t('Your team workspace')), h('p', null, t('Open employees from the directory. Their conversations stay with them.')), button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon)) : null),
    visible.filter(window => !window.compact).sort((a, b) => a.z - b.z).map((window, order) => h(CanvasChatWindow, { key: window.id, window, active: state.active === window.id, order, size, roster, actions, useSessions, SessionProvider, renderSlot })),
    mergePair ? h(MergeHint, { pair: mergePair, viewport: state.viewport, canvasRef: root }) : null,
    h(CanvasQuickMessage, { bot: quickBot, actions }),
    h(CanvasAgenda, { roster, actions }),
    marquee ? h('div', { className: 'bt-canvas-marquee', style: marquee }) : null,
    h(Dock, {
      role: 'toolbar',
      className: 'bt-canvas-dock agent-dock',
      'aria-label': t('Employees and group chats'),
    },
      groupDockEntities([...roster.bots, ...roster.rooms].filter(entity => !entity.hidden), roster).map((group, idx) => {
        const entity = group.leadEntity
        return h(DockItem, {
          key: entity.id,
          index: idx,
          className: 'bt-canvas-button bt-canvas-dock-item dock-item',
          'aria-label': entity.name,
          title: `${group.deptTitle || entity.name} · ${t('Click to open · Drag to place on canvas')}`,
          'aria-pressed': visible.some(window => window.entityId === entity.id && window.id === state.active),
          onPointerDown: event => {
            setDockHover(null)
            startDockDrag(event, entity)
          },
          onMouseEnter: event => {
            safeClearTimeout(dockHoverTimer.current)
            const rect = event.currentTarget?.getBoundingClientRect?.()
            const container = root.current?.getBoundingClientRect?.()
            if (container && rect) {
              const center = rect.left - container.left + rect.width / 2
              const bottom = container.bottom - rect.top + 10
              const x = Math.max(220, Math.min(container.width - 220, center))
              dockHoverTimer.current = safeSetTimeout(() => setDockHover({ entity, department: group.dept, pos: { x, bottom, arrowOffset: center - x } }), 140)
            }
          },
          onMouseLeave: () => {
            safeClearTimeout(dockHoverTimer.current)
            dockHoverTimer.current = safeSetTimeout(() => setDockHover(null), 240)
          },
          draggable: false,
          onDragStart: event => {
            setDockHover(null)
            try {
              event.dataTransfer.setData('application/x-ds-bot', JSON.stringify({ id: entity.id, kind: roster.roomsById[entity.id] ? 'room' : 'bot' }))
              event.dataTransfer.effectAllowed = 'copyMove'
            } catch { /* dataTransfer */ }
          },
        },
          h(DockLabel, { className: 'bt-dock-label-floating' }, group.deptTitle || entity.name),
          h(DockIcon, { className: 'bt-dock-icon-wrap' },
            roster.roomsById[entity.id] ? h(RoomAvatar, { room: entity, roster, size: 36 }) : h(BotAvatar, { bot: entity, size: 36, main: isMainOf(roster, entity.id) })),
          h('span', { className: 'bt-dock-item-name' }, entity.generalAssistant ? t('General Assistant') : entity.name))
      })),
    dockHover ? h(DockCollaborationPopover, {
      entity: dockHover.entity,
      department: dockHover.department,
      pos: dockHover.pos,
      roster,
      work,
      useSessions,
      actions,
      size,
      onMouseEnter: () => safeClearTimeout(dockHoverTimer.current),
      onMouseLeave: () => { dockHoverTimer.current = safeSetTimeout(() => setDockHover(null), 200) },
      onClose: () => setDockHover(null),
    }) : null,
    null)
}
