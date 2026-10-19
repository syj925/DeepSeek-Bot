import { QiBitCommandCenter } from './qibit-command-center.js'
import { dragGeometry } from './canvas-drag.js'
import { RESTORED_CHAT_CSS } from './restored-chat-styles.js'
import { createElement as h, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BotAvatar, RoomAvatar, lookOf } from './mark.js'
import { previewOf } from './text.js'
import { PlusIcon, PeopleIcon, ChatsIcon, GearIcon, CloseIcon, FolderIcon, DotsIcon, PencilIcon, CalendarIcon, SearchIcon, ArrowRightIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { ROOM_MODES, shownMode } from './group-settings.js'
import { memberWork, busyMembers, summaryText } from './member-status.js'
import { CanvasSession, canvasSessionId, registerSessionBridge } from './canvas-session.js'
import { CanvasQuickMessage, CanvasAgenda, SPATIAL_WIDGET_CSS, toggleSpatialWidget } from './spatial-widgets.js'
import { CanvasWallpaper } from './canvas-wallpaper.js'
import { CANVAS_LIMITS, collapseWindow, groupWindows, moveWindow, openWindow, resizeWindow, setCanvasSelection, setCanvasViewport, setWindowCompact, ungroupWindows, windowHeight, windowWidth } from './canvas-state.js'
import { t } from './i18n.js'
import { departmentFor, managerFor, reportsFor } from './designer-data.js'
import { Dock, DockIcon, DockItem } from './dock.js'
import { overlapMain, groupDropTarget, selectedMains, canvasPoint, canvasDropPoint, mergeHintPosition, MERGE_PREVIEW_DISTANCE, MERGE_COMMIT_DISTANCE } from './canvas-collaboration.js'
import { addDraftMembers, createEmptyGroup } from './canvas-state.js'
import { fitChat, resizeChat } from './chat-geometry.js'
import { MAIN_AGENT_POINTER } from './main-agent-drag.js'
import { MainAgentGroup, MAIN_GROUP_CSS } from './main-agent-group.js'

function MergeHint({ pair, viewport, canvasRef }) {
  const badge = useRef(null)
  const [position, setPosition] = useState({ visibility: 'hidden' })
  const measured = useRef(null)
  const latest = useRef({ pair, viewport })
  latest.current = { pair, viewport }
  useLayoutEffect(() => {
    const place = () => {
      if (!badge.current || !canvasRef.current) return
      measured.current = { bounds: { width: canvasRef.current.clientWidth, height: canvasRef.current.clientHeight }, badge: { width: badge.current.offsetWidth, height: badge.current.offsetHeight } }
      const { pair, viewport } = latest.current
      setPosition(mergeHintPosition(pair.source, pair.target, viewport, measured.current.bounds, measured.current.badge))
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(badge.current)
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [canvasRef])
  useLayoutEffect(() => {
    if (measured.current) setPosition(mergeHintPosition(pair.source, pair.target, viewport, measured.current.bounds, measured.current.badge))
  }, [pair.source.x, pair.source.y, pair.target.x, pair.target.y, viewport.x, viewport.y, viewport.zoom])
  return h('div', { ref: badge, className: 'bt-metaball-badge glass-button glass-button--pill', style: position, role: 'status' },
    `${t(pair.ready ? 'Release to create group chat' : 'Move closer to create group chat')} · ${pair.sourceName} ＋ ${pair.targetName}`)
}

export const MERGE_DISTANCE_THRESHOLD = MERGE_PREVIEW_DISTANCE

function gooeyBridge(p1, p2, r1 = 28, r2 = 28, maxDist = MERGE_DISTANCE_THRESHOLD) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const d = Math.hypot(dx, dy)
  if (d === 0 || d > maxDist) return ''
  const angle = Math.atan2(dy, dx)
  const angle90 = angle + Math.PI / 2
  const ratio = Math.max(0, Math.min(1, d / maxDist))
  const pinch = Math.max(4, 20 * (1 - ratio))

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

const ROLE_TINT_COLORS = {
  qibit: '#E2EBF2',
  '总助': '#E2EBF2',
  '综合': '#E2EBF2',
  '技术': '#DFECED',
  '研发': '#DFECED',
  '工程': '#DFECED',
  '设计': '#ECE8F0',
  '行政': '#EFE9E1',
  '运营': '#E4ECE4',
  '财务': '#E0EBF0',
  '销售': '#F3E7E3',
}

function getRoleTintColor(bot) {
  if (!bot) return '#E2EBF2'
  if (bot.generalAssistant) return '#E2EBF2'
  const name = String(bot.name || '').toLowerCase()
  for (const [k, c] of Object.entries(ROLE_TINT_COLORS)) {
    if (name.includes(k)) return c
  }
  return '#E2EBF2'
}

function CanvasGlobalSearch({ actions, roster, work }) {
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

  return h(QiBitCommandCenter, { actions, roster, work, searchIcon: SearchIcon })
}

const button = (label, onClick, icon, extra = {}) => h('button', { type: 'button', className: `bt-canvas-button glass-button${extra.className ? ` ${extra.className}` : ''}`, onClick, ...extra }, icon ? h(icon) : null, label)
const entityOf = (window, roster) => window.kind === 'room' ? roster.roomsById[window.entityId] : roster.byId[window.entityId]
const employeesOf = (windows, ids, roster) => [...new Set(windows.filter(window => window.open && window.kind === 'bot' && ids.includes(window.id) && roster.byId[window.entityId]).map(window => window.entityId))]

export function RoomSummary({ room, roster, work, actions }) {
  const admin = roster.byId[room.admin]
  const mode = t(ROOM_MODES.find(([id]) => id === shownMode(room, roster))?.[1] ?? 'Everyone')
  const members = memberWork(room, work).filter(entry => roster.byId[entry.id])
  return h('div', { className: 'bt-canvas-room-summary' },
    h('button', { type: 'button', className: 'bt-canvas-room-mode', onClick: () => actions.openSettings('groups', room.id), title: t('Group settings'), 'aria-label': t('Group settings') },
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

function useRoomPreview(window, canvasRoot, drag, conversationOpen, viewport) {
  const [preview, setPreview] = useState(null)
  const anchor = useRef(null), popup = useRef(null), entry = useRef(null)
  const openTimer = useRef(null), closeTimer = useRef(null), focusEntry = useRef(false), outsideGesture = useRef(null)
  const cancel = () => {
    safeClearTimeout(openTimer.current); openTimer.current = null
    safeClearTimeout(closeTimer.current); closeTimer.current = null
  }
  const hide = (restoreFocus = false) => {
    cancel()
    focusEntry.current = false
    setPreview(null)
    if (restoreFocus) anchor.current?.querySelector('.bt-canvas-room-avatar-open')?.focus({ preventScroll: true })
  }
  const show = (focus = false) => {
    cancel()
    if (window.kind !== 'room' || conversationOpen || drag?.current || !anchor.current || !canvasRoot?.current) return
    const box = canvasRoot.current.getBoundingClientRect(), rect = anchor.current.getBoundingClientRect()
    const width = Math.min(320, Math.max(0, box.width - 24)), height = Math.min(300, Math.max(0, box.height - 24))
    const right = rect.right - box.left + 12, left = rect.left - box.left - width - 12
    let x, y = rect.top - box.top, side
    if (right + width <= box.width - 12) { x = right; side = 'right' }
    else if (left >= 12) { x = left; side = 'left' }
    else {
      x = Math.max(12, Math.min(box.width - width - 12, rect.left - box.left + rect.width / 2 - width / 2))
      const below = rect.bottom - box.top + 12
      side = below + height <= box.height - 12 ? 'below' : 'above'
      y = side === 'below' ? below : rect.top - box.top - height - 12
    }
    focusEntry.current = focus
    setPreview({ left: x, top: Math.max(12, Math.min(box.height - height - 12, y)), width, height, side })
  }
  const contains = target => {
    if (!target) return false
    const Node = anchor.current?.ownerDocument?.defaultView?.Node
    if (Node && !(target instanceof Node)) return false
    return Boolean(anchor.current?.contains(target) || popup.current?.contains(target))
  }
  const keep = () => cancel()
  const enter = event => {
    if (event.pointerType === 'touch' || event.buttons > 0 || drag?.current) return
    cancel()
    if (!preview && !conversationOpen) openTimer.current = safeSetTimeout(() => { openTimer.current = null; show() }, 120)
  }
  const leave = event => {
    if (contains(event?.relatedTarget)) { cancel(); return }
    safeClearTimeout(openTimer.current); openTimer.current = null
    safeClearTimeout(closeTimer.current)
    closeTimer.current = safeSetTimeout(() => {
      closeTimer.current = null
      if (!drag?.current && !outsideGesture.current?.moved && !contains(anchor.current?.ownerDocument?.activeElement)) hide()
    }, 240)
  }
  const key = event => {
    if (event.key === 'Escape' && !event.isComposing && !event.nativeEvent?.isComposing) {
      event.preventDefault(); event.stopPropagation()
      hide(Boolean(popup.current?.contains(anchor.current?.ownerDocument?.activeElement)))
    }
  }
  useEffect(() => cancel, [])
  useEffect(() => { hide() }, [window.x, window.y, conversationOpen, viewport?.x, viewport?.y, viewport?.zoom])
  useEffect(() => {
    if (!preview) return undefined
    if (focusEntry.current) { entry.current?.focus({ preventScroll: true }); focusEntry.current = false }
    const doc = anchor.current?.ownerDocument, view = doc?.defaultView
    const outside = target => target && !contains(target) && !target.closest?.('.bt-menu,[role=dialog],.bt-overlay,.bt-drawer')
    const down = event => {
      outsideGesture.current = event.button === 0 && outside(event.target) ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null
      if (outsideGesture.current) { safeClearTimeout(closeTimer.current); closeTimer.current = null }
    }
    const move = event => {
      const gesture = outsideGesture.current
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) gesture.moved = true
    }
    const up = event => {
      const gesture = outsideGesture.current
      if (gesture?.id !== event.pointerId) return
      outsideGesture.current = null
      const target = doc.elementFromPoint?.(event.clientX, event.clientY) ?? event.target
      if (outside(target)) {
        if (!gesture.moved && event.type !== 'pointercancel') hide()
        else leave({ relatedTarget: target })
      }
    }
    const escape = event => { if (!event.defaultPrevented && event.key === 'Escape' && !event.isComposing) key(event) }
    const resize = () => hide()
    const scroll = event => { if (!popup.current?.contains(event.target)) hide() }
    doc?.addEventListener?.('pointerdown', down, true)
    doc?.addEventListener?.('pointermove', move, { capture: true, passive: true })
    doc?.addEventListener?.('pointerup', up)
    doc?.addEventListener?.('pointercancel', up)
    doc?.addEventListener?.('keydown', escape)
    view?.addEventListener?.('resize', resize)
    view?.addEventListener?.('scroll', scroll, true)
    return () => {
      outsideGesture.current = null
      doc?.removeEventListener?.('pointerdown', down, true)
      doc?.removeEventListener?.('pointermove', move, true)
      doc?.removeEventListener?.('pointerup', up)
      doc?.removeEventListener?.('pointercancel', up)
      doc?.removeEventListener?.('keydown', escape)
      view?.removeEventListener?.('resize', resize)
      view?.removeEventListener?.('scroll', scroll, true)
    }
  }, [preview])
  return { preview, anchor, popup, entry, show, hide, enter, leave, keep, key }
}

function WindowCard({ window, roster, selected, active, actions, useSessions, useWork, SessionProvider, renderSlot, start, canvasRoot, drag, conversationOpen = false, viewport, isMergeTarget = false, dropTarget = false }) {
  const entity = entityOf(window, roster)
  const sessionId = canvasSessionId(window, roster)
  const preview = useSessions(list => previewOf(list, sessionId, roster.exchangeTurns?.[sessionId]))
  const work = useWork(value => value)
  const roomPreview = useRoomPreview(window, canvasRoot, drag, conversationOpen, viewport)
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
  const isCompactBot = window.compact && !room
  const isRoomAvatar = window.compact && room
  const isCompactAvatar = isCompactBot || isRoomAvatar
  const shell = {
    className: `bt-canvas-window${isCompactAvatar ? ' bt-canvas-avatar-window' : ' agent-window'}${room ? ' bt-canvas-group-card' : ''}${isRoomAvatar ? ' bt-canvas-room-avatar-window' : ''}${isMergeTarget ? ' bt-canvas-merge-target' : ''}`, 'data-window-id': window.id, 'data-entity-id': entity.id,
    'data-kind': window.kind, 'data-room-drop-id': room?.id,
    'data-drop-target': dropTarget || isMergeTarget || undefined,
    'data-mode': isRoomAvatar ? 'avatar' : window.compact ? 'card' : 'conversation',
    'data-room-stage': room ? isRoomAvatar ? 'avatar' : 'preview' : undefined,
    'data-active': active && selected || undefined, 'data-selected': selected || undefined, 'aria-label': entity.name,
    style: {
      left: window.x,
      top: window.y,
      width: windowWidth(window),
      height: windowHeight(window),
      zIndex: window.z + 2,
      ...(isCompactAvatar ? {
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        borderRadius: 0,
        outline: 'none',
      } : {}),
    },
    onPointerDownCapture: select, onFocusCapture: select, onContextMenu: event => { if (!event.target.closest('.bt-canvas-content')) openMenu(event) },
  }
  if (isCompactBot) return h('section', shell,
    h('div', { className: 'bt-canvas-avatar-node', style: { border: 'none', background: 'transparent', boxShadow: 'none' } },
      h('button', {
        type: 'button',
        className: 'bt-canvas-avatar-open',
        style: { width: 56, height: 56, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', outline: 'none', borderRadius: '50%' },
        'aria-label': t('Open conversation'),
        title: t('Click to open · Drag to move'),
        onPointerDown: event => start(event, 'avatar', window.id),
        onClick: event => { if (event.detail === 0) actions.openCanvasConversation(window.id) },
        onKeyDown: keyboard,
      },
        h(BotAvatar, { bot: entity, size: 56, main: isMainOf(roster, entity.id) })),
      h('button', { type: 'button', className: 'bt-canvas-window-title', onPointerDown: event => start(event, 'window', window.id), onKeyDown: keyboard, 'aria-label': t('Move {name}', { name: entity.name }) },
        h('strong', null, entity.name), h('span', { className: 'bt-canvas-window-meta text-secondary' }, entity.generalAssistant ? t('General Assistant') : isMainOf(roster, entity.id) ? t('Main Bot') : entity.role || t('Employee'))),
      h('span', { className: 'bt-canvas-avatar-status', 'data-state': statusKind, title: status, role: 'status', 'aria-label': status })))
  if (isRoomAvatar) {
    const begin = event => {
      roomPreview.keep()
      const touch = event.pointerType === 'touch'
      start(event, 'avatar', window.id,
        () => touch ? roomPreview.show(true) : roomPreview.enter({ pointerType: 'mouse', buttons: 0 }),
        () => roomPreview.hide())
    }
    const popupId = `bt-room-preview-${window.id}`
    return h('section', { ...shell, ref: roomPreview.anchor, onPointerLeave: roomPreview.leave, onBlurCapture: roomPreview.leave },
      h('div', { className: 'bt-canvas-avatar-node bt-canvas-room-avatar-node' },
        h('button', {
          type: 'button', className: 'bt-canvas-avatar-open bt-canvas-room-avatar-open',
          'aria-label': t('Expand group card'), 'aria-expanded': Boolean(roomPreview.preview), 'aria-haspopup': 'dialog',
          'aria-controls': roomPreview.preview ? popupId : undefined,
          title: t('Hover to preview · Drag to move'),
          onPointerEnter: roomPreview.enter,
          onPointerDown: begin,
          onClick: event => { if (event.detail === 0) roomPreview.show(true) },
          onKeyDown: event => { if (event.key === 'Escape') roomPreview.key(event); else keyboard(event) },
        }, h(RoomAvatar, { room, roster, size: 72 })),
        h('button', { type: 'button', className: 'bt-canvas-window-title',
          onPointerDown: event => { roomPreview.hide(); start(event, 'window', window.id) }, onKeyDown: keyboard,
          'aria-label': t('Move {name}', { name: entity.name }) },
          h('strong', null, entity.name), h('span', null, t('{count} members', { count: room.members.length }))),
        h('span', { className: 'bt-canvas-avatar-status', 'data-state': statusKind, title: status, role: 'status', 'aria-label': status }),
        button(null, () => roomPreview.show(true), DotsIcon,
          { className: 'bt-canvas-room-preview-toggle', 'aria-label': t('Group card details'), title: t('Group card details') })),
      roomPreview.preview && canvasRoot?.current ? createPortal(h('section', {
        ref: roomPreview.popup, id: popupId, role: 'dialog', 'aria-label': `${entity.name} · ${t('Group card details')}`,
        className: 'bt-canvas-window bt-canvas-group-card bt-canvas-room-hover-preview agent-window',
        'data-mode': 'card', 'data-kind': 'room', 'data-room-stage': 'preview', 'data-side': roomPreview.preview.side,
        'data-window-id': window.id, 'data-entity-id': entity.id, 'data-room-drop-id': room.id,
        'data-drop-target': dropTarget || undefined,
        style: { left: roomPreview.preview.left, top: roomPreview.preview.top,
          '--bt-room-preview-width': `${roomPreview.preview.width}px`, '--bt-room-preview-height': `${roomPreview.preview.height}px` },
        onPointerEnter: roomPreview.keep, onPointerLeave: roomPreview.leave, onBlurCapture: roomPreview.leave,
        onKeyDown: roomPreview.key, onContextMenu: openMenu,
      }, h('div', { className: 'bt-group-card-body' },
        h('header', { className: 'bt-group-card-header' },
          h('input', { type: 'checkbox', checked: selected, 'aria-label': t('Select {name}', { name: entity.name }),
            onChange: event => actions.selectCanvasWindow(window.id, event.target.checked, true), onPointerDown: event => event.stopPropagation() }),
          h(RoomAvatar, { room, roster, size: 40 }),
          h('div', { className: 'bt-group-card-heading' },
            h('strong', { className: 'bt-group-card-title' }, entity.name),
            h('span', { className: 'bt-group-card-count text-secondary' }, t('{count} members', { count: entity.members.length }))),
          button(null, openMenu, DotsIcon, { 'aria-label': t('{name} actions', { name: entity.name }), title: t('More'), 'aria-haspopup': 'menu' }),
          button(null, () => roomPreview.hide(true), CloseIcon, { 'aria-label': t('Collapse group card'), title: t('Collapse group card') })),
        h('button', { type: 'button', className: 'bt-canvas-card-state', 'data-state': statusKind,
          onClick: () => actions.showDetails(sessionId), title: statusText }, h('span', { 'aria-hidden': true }), statusText),
        h(RoomSummary, { room, roster, work, actions }),
        h('p', { className: 'bt-group-card-preview text-secondary', title: summary }, summary),
        h('button', { ref: roomPreview.entry, type: 'button', className: 'bt-group-card-enter',
          onClick: () => { roomPreview.hide(); actions.openCanvasConversation(window.id) }, 'aria-label': t('Open conversation') },
          t('Open conversation'), h(ArrowRightIcon, { size: 18 })))), canvasRoot.current) : null)
  }

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

export function getCollaboratorBots(department, roster, customTempBots = []) {
  const available = new Map((roster.bots ?? []).filter(bot => !bot.hidden).map(bot => [bot.id, bot]))
  const agents = [...new Map([...(department?.agents ?? []), ...customTempBots]
    .filter(agent => available.has(agent.id)).map(agent => [agent.id, { ...agent, ...available.get(agent.id) }])).values()]
  const regular = agents.filter(agent => agent.employment !== 'temporary')
  const temporary = agents.filter(agent => agent.employment === 'temporary')
  return [...regular, ...temporary]
}

export function groupDockEntities(entities, roster) {
  const seen = new Set(), groups = []
  const available = new Set((roster.bots ?? []).map(bot => bot.id))
  for (const entity of entities) {
    const isRoom = Boolean(roster.roomsById?.[entity.id])
    if (!isRoom && !available.has(entity.id)) continue
    const dept = isRoom ? null : getDepartmentForEntity(entity, roster)
    const key = dept?.key ?? `${isRoom ? 'room' : 'bot'}:${entity.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const leadEntity = dept ? roster.byId[dept.agents.find(agent => agent.isLead)?.id] ?? entity : entity
    groups.push({ key, leadEntity, dept, deptBadge: dept?.name ?? null,
      deptTitle: dept?.title ?? entity.name, name: dept?.name ?? entity.name })
  }
  return groups
}

export function DockCollaborationPopover({ entity, department: initialDept, pos, roster, work = { bots: {}, rooms: {} }, useSessions, actions, size, onMouseEnter, onMouseLeave, onClose }) {
  if (!entity || !pos) return null
  const department = initialDept || getDepartmentForEntity(entity, roster)
  const isRoom = Boolean(roster.roomsById?.[entity.id])
  const isMain = !isRoom && isMainOf(roster, entity.id)
  const sessionId = isRoom ? entity.id : (entity.sessionId ?? entity.id)
  const preview = useSessions ? useSessions(list => previewOf(list, sessionId, roster.exchangeTurns?.[sessionId])) : ''
  const manager = !isRoom ? managerFor(entity, roster) : null
  const reports = !isRoom ? reportsFor(entity, roster) : []
  const roomActivity = isRoom ? busyMembers(entity, work, roster) : []
  const waiting = (work.approvals ?? []).some(entry => isRoom ? entry.roomId === entity.id : entry.botId === entity.id) || roomActivity.some(entry => entry.state === 'ask')
  const question = roster.questions?.[sessionId] !== undefined
  const busy = isRoom ? (work.rooms?.[entity.id]?.length ?? 0) > 0
    : Boolean(work.bots?.[entity.id]) || Object.values(work.rooms ?? {}).some(entries => entries.some(entry => entry.botId === entity.id))
  const statusKind = waiting || question ? 'waiting' : busy ? 'working' : 'available'
  const statusLabel = waiting ? t('Waiting for approval') : question ? t('Waiting for response') : busy ? t('In Execution') : t('Ready to collaborate')
  const actualMembers = isRoom ? entity.members.map(id => roster.byId[id]).filter(Boolean) : reports
  const collaborators = department ? getCollaboratorBots(department, roster)
    : getCollaboratorBots({ agents: actualMembers }, roster)
  const role = entity.generalAssistant ? t('General Assistant') : entity.role || (isRoom ? t('Group collaboration') : t('Employee'))
  const openChat = target => { onClose?.(); actions.openCanvasEntity?.(target.id, size) }
  const place = target => {
    onClose?.()
    actions.updateCanvas?.(current => {
      const existing = current.windows.find(window => window.entityId === target.id)
      if (existing) return { ...current, windows: current.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window), active: existing.id, selected: [existing.id] }
      return openWindow(current, { id: target.id, kind: roster.roomsById[target.id] ? 'room' : 'bot' })
    })
    actions.saveCanvas?.()
  }
  const placeDepartment = () => {
    onClose?.()
    actions.updateCanvas?.(current => {
      let next = current
      for (const agent of department?.agents ?? []) {
        const existing = next.windows.find(window => window.kind === 'bot' && window.entityId === agent.id)
        next = existing ? { ...next, windows: next.windows.map(window => window.id === existing.id ? { ...window, open: true, compact: true } : window) }
          : openWindow(next, { id: agent.id, kind: 'bot' })
      }
      return next
    })
    actions.saveCanvas?.()
  }

  return h('div', {
    className: 'bt-dock-popover glass-card', style: { left: `${pos.x}px`, bottom: `${pos.bottom}px` },
    onMouseEnter, onMouseLeave, role: 'dialog', 'aria-label': `${entity.name} · ${t('Collaboration Progress')}`,
    'data-room-drop-id': isRoom ? entity.id : undefined,
  },
    h('div', { className: 'bt-dock-popover-header' },
      h('div', { className: 'bt-dock-popover-header-left' },
        isRoom ? h(RoomAvatar, { room: entity, roster, size: 40 }) : h(BotAvatar, { bot: entity, size: 40, main: isMain }),
        h('div', { className: 'bt-dock-popover-meta' },
          h('div', { className: 'bt-dock-popover-title-row' },
            h('span', { className: 'bt-dock-popover-name' }, entity.name),
            department ? h('span', { className: 'bt-dock-dept-badge' }, department.name) : null,
            h('span', { className: `bt-dock-status-pill bt-dock-status-${statusKind}` }, statusLabel)),
          h('div', { className: 'bt-dock-popover-role-desc' }, role))),
      department?.agents.length > 1 ? h('button', { type: 'button', className: 'bt-dock-popover-close',
        onClick: event => { event.stopPropagation(); placeDepartment() }, title: t('Place department on canvas'), 'aria-label': t('Place department on canvas') }, h(FolderIcon)) : null,
      h('button', { type: 'button', className: 'bt-dock-popover-close',
        onClick: event => { event?.stopPropagation?.(); onClose?.() }, title: t('Close'), 'aria-label': t('Close') }, h(CloseIcon))),
    !isRoom && manager && manager.id !== entity.id ? h('div', { className: 'bt-dock-supervision-chain' },
      h('span', null, t('Supervised by {name}', { name: manager.name }))) : null,
    isRoom ? h('div', { className: 'bt-dock-room-chain' },
      h('span', { className: 'bt-dock-room-admin-tag' }, roster.byId[entity.admin] ? t('Admin: {name}', { name: roster.byId[entity.admin].name }) : t('No admin')),
      h('span', { className: 'bt-dock-room-mode-tag' }, t(ROOM_MODES.find(([id]) => id === shownMode(entity, roster))?.[1] ?? 'Everyone'))) : null,
    h('div', { className: 'bt-dock-collab-section' },
      h('div', { className: 'bt-dock-section-title' }, h('span', null, department ? t('Department Members') : isRoom ? t('Members · {count}', { count: entity.members.length }) : t('Supervision & Sub-Agent Network'))),
      collaborators.length ? h('div', { className: 'bt-dock-collab-grid', style: { maxHeight: 'min(280px, 40vh)', overflowY: 'auto' } }, collaborators.map(agent => {
        const temporary = agent.employment === 'temporary'
        const badge = isRoom && entity.admin === agent.id ? t('Admin') : agent.isLead ? t('Team leader') : temporary ? t('Temporary employee') : t('Employee')
        return h('div', { key: agent.id, className: `bt-collab-card${temporary ? ' bt-collab-card--temp' : ''}`, title: `${agent.name} · ${agent.role || ''}`, draggable: true,
          onDragStart: event => {
            try { event.dataTransfer.setData('application/x-ds-bot', JSON.stringify({ id: agent.id, kind: 'bot' })); event.dataTransfer.effectAllowed = 'copyMove' } catch { /* dataTransfer */ }
          } },
          h('div', { className: 'bt-collab-card-top' },
            h(BotAvatar, { bot: agent, size: 28, main: isMainOf(roster, agent.id) }),
            h('div', { className: 'bt-collab-card-meta' },
              h('div', { className: 'bt-collab-card-name-row' }, h('span', { className: 'bt-collab-card-name' }, agent.name), h('span', { className: `bt-collab-badge${temporary ? ' bt-badge-temp' : ''}` }, badge)),
              h('div', { className: 'bt-collab-card-role' }, agent.role || t('Employee')))),
          h('div', { className: 'bt-collab-card-actions' },
            h('button', { type: 'button', className: 'bt-collab-mini-btn bt-collab-chat-btn', onClick: event => { event.stopPropagation(); openChat(agent) }, title: t('Open chat') }, h(ChatsIcon), t('Chat')),
            h('button', { type: 'button', className: 'bt-collab-mini-btn bt-collab-more-btn', onClick: event => { event.stopPropagation(); place(agent) }, title: t('Place on canvas') }, '…')))
      })) : h('div', { className: 'bt-dock-subagents-empty' }, t('No sub-agents in team yet'))),
    h('div', { className: 'bt-dock-task-preview' }, work.bots?.[entity.id]?.tool
      ? t('Working on: {tool}', { tool: work.bots[entity.id].tool })
      : preview ? preview.slice(0, 90) : department?.desc || ''),
    h('div', { className: 'bt-dock-popover-actions' },
      h('button', { type: 'button', className: 'bt-dock-action-btn bt-dock-action-chat', onClick: () => openChat(entity) }, h(ChatsIcon), t('Open chat')),
      h('button', { type: 'button', className: 'bt-dock-action-btn bt-dock-action-primary', onClick: () => place(entity) }, h(PlusIcon), t('Place on canvas'))))
}

const safeClearTimeout = timer => {
  if (typeof clearTimeout !== 'undefined') clearTimeout(timer)
}
const safeSetTimeout = (fn, ms) => {
  if (typeof setTimeout !== 'undefined') return setTimeout(fn, ms)
  return null
}

export function CanvasDepartmentDock({ roster, work, useSessions, actions, size, canvasRoot, activeDeptKey, onStartDrag, drag }) {
  const [dockHover, setDockHover] = useState(null)
  const [previewReady, setPreviewReady] = useState(false)
  const groups = useMemo(() => groupDockEntities([...roster.bots, ...roster.rooms].filter(entity => !entity.hidden), roster), [roster])
  const [selectedDeptKey, setSelectedDeptKey] = useState(activeDeptKey ?? groups[0]?.key)
  const hoverRegionRef = useRef(null)
  const dockScrollRef = useRef(null)
  const hoverRef = useRef(null)
  const closeTimer = useRef(null)
  const previewTimer = useRef(null)
  const scrollFrame = useRef(null)
  hoverRef.current = dockHover

  const cancelClose = () => {
    safeClearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const cancelPreview = () => {
    safeClearTimeout(previewTimer.current)
    previewTimer.current = null
  }
  const closeHover = () => {
    cancelClose()
    cancelPreview()
    hoverRef.current = null
    setDockHover(null)
    setPreviewReady(false)
  }
  const scheduleClose = () => {
    cancelClose()
    cancelPreview()
    if (!hoverRef.current) return
    closeTimer.current = safeSetTimeout(closeHover, 240)
  }
  const positionFor = tab => {
    const wrap = dockScrollRef.current, root = canvasRoot.current
    if (!tab || !wrap || !root) return null
    const rect = tab.getBoundingClientRect()
    const clip = wrap.getBoundingClientRect()
    if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) return null
    const container = root.getBoundingClientRect()
    const center = rect.left - container.left + rect.width / 2
    const tabBottom = container.bottom - rect.top
    const x = Math.max(240, Math.min(container.width - 240, center))
    return { x, bottom: tabBottom + 64, arrowOffset: center - x, tabCenterX: center, avatarBottom: tabBottom - 18 }
  }
  const showGroup = (group, tab, immediate = false) => {
    if (drag?.current) return
    cancelClose()
    cancelPreview()
    const pos = positionFor(tab)
    if (!pos) { closeHover(); return }
    const next = { entity: group.leadEntity, department: group.dept, deptKey: group.key, pos }
    hoverRef.current = next
    setDockHover(next)
    if (immediate || previewReady) { setPreviewReady(true); return }
    setPreviewReady(false)
    previewTimer.current = safeSetTimeout(() => {
      previewTimer.current = null
      if (hoverRef.current?.deptKey === group.key && !drag?.current) setPreviewReady(true)
    }, 120)
  }
  const startDrag = (event, entity) => {
    closeHover()
    onStartDrag(event, entity)
  }
  const onDockWheel = event => {
    if (dockScrollRef.current && event.deltaY !== 0 && event.deltaX === 0) {
      event.preventDefault()
      event.stopPropagation()
      dockScrollRef.current.scrollLeft += event.deltaY
    }
  }
  useEffect(() => {
    if (activeDeptKey) setSelectedDeptKey(activeDeptKey)
  }, [activeDeptKey])
  useEffect(() => {
    dockScrollRef.current?.querySelector(`[data-dept-key="${selectedDeptKey}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedDeptKey])
  useEffect(() => {
    const wrap = dockScrollRef.current
    if (!wrap) return () => { cancelClose(); cancelPreview() }
    const alignHover = () => {
      scrollFrame.current = null
      const current = hoverRef.current
      if (!current) return
      if (drag?.current) { closeHover(); return }
      const tab = wrap.querySelector(`[data-dept-key="${current.deptKey}"]`)
      const pos = positionFor(tab)
      if (!pos) { closeHover(); return }
      if (Object.keys(pos).every(key => pos[key] === current.pos[key])) return
      const next = { ...current, pos }
      hoverRef.current = next
      setDockHover(next)
    }
    const onScroll = () => {
      if (!hoverRef.current || scrollFrame.current !== null) return
      if (typeof requestAnimationFrame === 'undefined') { alignHover(); return }
      scrollFrame.current = requestAnimationFrame(alignHover)
    }
    wrap.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      wrap.removeEventListener('scroll', onScroll)
      if (scrollFrame.current !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = null
      cancelClose()
      cancelPreview()
    }
  }, [canvasRoot, drag])

  return h('div', { ref: hoverRegionRef, className: 'bt-dock-hover-region', 'data-hover-open': Boolean(dockHover), style: { display: 'contents' }, onMouseEnter: cancelClose, onMouseLeave: scheduleClose },
    h(Dock, {
      role: 'toolbar',
      className: 'bt-canvas-dock agent-dock',
      'aria-label': t('Employees and group chats'),
      hoverRegionRef,
      hoverLift: 30,
      focusedIconSize: 52,
      hoverExitDelay: 240,
    },
      h('div', {
        ref: dockScrollRef,
        className: 'bt-dock-scroll-wrap',
        onWheel: onDockWheel,
      },
        h('div', { className: 'bt-dock-scroll-row' }, groups.map((group, idx) => {
          const entity = group.leadEntity
          const isSelected = selectedDeptKey === group.key
          const isHovered = dockHover?.deptKey === group.key
          return h(DockItem, {
            key: group.key || entity.id,
            index: idx,
            className: `bt-canvas-button bt-canvas-dock-item bt-dock-dept-tab${isSelected ? ' bt-dock-dept-tab--selected' : ''}${isHovered ? ' bt-dock-dept-tab--hovered' : ''}`,
            'aria-label': group.name,
            'data-dept-key': group.key,
            'aria-pressed': isSelected,
            onClick: event => {
              if (event.detail !== 0 || drag?.current) return
              setSelectedDeptKey(group.key)
              const tab = dockScrollRef.current?.querySelector(`[data-dept-key="${group.key}"]`) || event.currentTarget
              showGroup(group, tab, true)
            },
            onPointerDown: event => startDrag(event, entity),
            onMouseEnter: event => showGroup(group, event.currentTarget),
            onMouseLeave: scheduleClose,
            draggable: true,
            onDragStart: event => {
              closeHover()
              try {
                event.dataTransfer.setData('application/x-ds-bot', JSON.stringify({ id: entity.id, kind: roster.roomsById[entity.id] ? 'room' : 'bot' }))
                event.dataTransfer.effectAllowed = 'copyMove'
              } catch { /* dataTransfer */ }
            },
          },
            h(DockIcon, { className: 'bt-dock-icon-wrap' },
              roster.roomsById[entity.id] ? h(RoomAvatar, { room: entity, roster, size: 36 }) : h(BotAvatar, { bot: entity, size: 36, main: isMainOf(roster, entity.id) })),
            h('span', { className: 'bt-dock-dept-name' }, group.name))
        })))),
    dockHover && previewReady ? h(DockCollaborationPopover, {
      entity: dockHover.entity,
      department: dockHover.department,
      pos: dockHover.pos,
      roster,
      work,
      useSessions,
      actions,
      size,
      onMouseEnter: cancelClose,
      onMouseLeave: scheduleClose,
      onClose: closeHover,
    }) : null)
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
    h('div', { ref: node, className: 'bt-canvas-chat-float', role: 'dialog', tabIndex: -1, 'aria-label': entityOf(displayWindow, roster)?.name,
      'data-entity-id': displayWindow.entityId, 'data-active': active || undefined,
      'data-room-drop-id': displayWindow.kind === 'room' && !closing ? displayWindow.entityId : undefined,
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
  const latest = useRef(state)
  latest.current = state
  const root = useRef(null)
  const drag = useRef(null)
  const dragFrame = useRef(null)
  const pendingMove = useRef(null)
  const releaseFrame = useRef(null)
  const releasedNodes = useRef([])
  const restoreTransitions = () => {
    if (releaseFrame.current !== null) cancelAnimationFrame(releaseFrame.current)
    releaseFrame.current = null
    for (const node of releasedNodes.current) node.style.transition = ''
    releasedNodes.current = []
  }
  useEffect(() => () => { if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current); restoreTransitions() }, [])
  const suppressContext = useRef(false)
  const [groupMembers, setGroupMembers] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [mergePair, setMergePair] = useState(null)
  const mergePairRef = useRef(null)
  mergePairRef.current = mergePair
  const [marquee, setMarquee] = useState(null)
  const [size, setSize] = useState({ width: 1000, height: 700 })
  const dragBounds = useRef(null)
  const visible = state.windows.filter(window => window.open && entityOf(window, roster))
  const focused = useRef(null)
  const activeBot = visible.find(window => window.id === state.active && window.kind === 'bot')
  if (activeBot) focused.current = activeBot.entityId
  const quickBot = roster.byId[focused.current] ?? roster.byId[roster.mainBotId] ?? roster.bots[0]
  const selectedBots = employeesOf(visible, state.selected, roster)
  const update = actions.updateCanvas

  useEffect(() => {
    const clearSelection = event => {
      if (event.button !== 0) return
      const target = event.composedPath().find(node => node instanceof Element)
      if (target?.closest('.bt-canvas-stage,.bt-qibit-home') && !target.closest('input,textarea,[contenteditable=true],.bt-canvas-window,.bt-canvas-group,button,a')) {
        document.getSelection?.()?.removeAllRanges()
      }
      if (!latest.current.selected.length) return
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
      setSize(previous => JSON.stringify(previous) === JSON.stringify(measured) ? previous : measured)
      dragBounds.current = { width: box.width, height: box.height, insets: { top: toolbarBottom + 20, bottom, left: 24, right: 24 } }
      actions.setCanvasSize(dragBounds.current)
    }
    const observer = new ResizeObserver(measure)
    for (const element of [node, toolbar, dock, controls].filter(Boolean)) observer.observe(element)
    const position = new MutationObserver(measure)
    if (team) { observer.observe(team); position.observe(team, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    for (const widget of widgets) { observer.observe(widget); position.observe(widget, { attributes: true, attributeFilter: ['style', 'data-folded'] }) }
    return () => { observer.disconnect(); position.disconnect(); if (actions.canvasArrangementLayout === arrangementLayout) delete actions.canvasArrangementLayout; actions.setCanvasSize(null) }
  }, [])
  const groupTargetAt = (canvas, ids, clientX, clientY) => {
    const node = root.current, box = drag.current?.box ?? node.getBoundingClientRect()
    const hit = node.ownerDocument?.elementFromPoint(clientX, clientY)?.closest('[data-room-drop-id]')
    const roomId = hit?.dataset.roomDropId
    const rect = hit?.dataset.roomStage === 'preview' ? hit.getBoundingClientRect() : null
    const inside = !rect || clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    if (inside && roomId && roster.roomsById[roomId] && ids.length && selectedMains(canvas, roster, ids).length === ids.length) {
      const window = canvas.windows.find(window => window.kind === 'room' && window.entityId === roomId && window.open)
      return { kind: 'room', id: roomId, ...(window ? { windowId: window.id } : {}), keepSurface: true }
    }
    const moving = drag.current
    const now = Date.now()
    if (!moving?.hitCache || now - moving.hitCache.at > 100) {
      const cards = [...(node.querySelectorAll?.('.bt-canvas-group-card[data-window-id]') ?? [])]
      const cache = { at: now, cards: cards.map(card => ({ id: card.dataset.windowId, rect: card.getBoundingClientRect() })) }
      if (moving) moving.hitCache = cache
    }
    const cards = moving?.hitCache?.cards ?? [...(node.querySelectorAll?.('.bt-canvas-group-card[data-window-id]') ?? [])].map(card => ({ id: card.dataset.windowId, rect: card.getBoundingClientRect() }))
    const point = canvasPoint(canvas, box, clientX, clientY)
    const target = groupDropTarget(canvas, roster, ids, point, window => {
      const bounds = cards.filter(card => card.id === window.id).map(card => {
        const rect = card.rect
        return { ...canvasPoint(canvas, box, rect.left, rect.top), width: rect.width / canvas.viewport.zoom, height: rect.height / canvas.viewport.zoom }
      }).filter(rect => rect.width > 0 && rect.height > 0)
      // The avatar and its portal are separate drop surfaces; their gap is not a target.
      return bounds.find(rect => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) ?? bounds[0]
    })
    return target?.kind === 'room' ? { ...target, keepSurface: true } : target
  }
  const start = (event, kind, id, onTap, onDragStart) => {
    if (event.button !== 0 && !(event.button === 2 && kind === 'marquee')) return
    restoreTransitions()
    event.preventDefault()
    event.stopPropagation()
    if (event.button === 0) root.current.ownerDocument?.getSelection?.()?.removeAllRanges()
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
    drag.current = { kind, id, ids, onTap, onDragStart, startX: event.clientX, startY: event.clientY, state: current, box, moved: false, right: event.button === 2 }
    root.current.setPointerCapture(event.pointerId)
  }
  const startDockDrag = (event, entity) => {
    if (event.button !== 0) return
    restoreTransitions()
    event.preventDefault()
    event.stopPropagation()
    const kind = roster.roomsById[entity.id] ? 'room' : 'bot'
    const box = root.current.getBoundingClientRect()
    drag.current = { kind: 'dock', entity, entityKind: kind, originState: latest.current, startX: event.clientX, startY: event.clientY, moved: false, box }
    root.current.setPointerCapture(event.pointerId)
  }
  const applyMove = event => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY, v = current.state?.viewport ?? latest.current.viewport
    if (!current.moved && Math.hypot(dx, dy) > 4) { current.moved = true; current.onDragStart?.() }
    if (current.kind === 'dock') {
      if (current.moved) {
        const x = (event.clientX - current.box.left - v.x) / v.zoom - (CANVAS_LIMITS.avatarWidth / 2)
        const y = (event.clientY - current.box.top - v.y) / v.zoom - (current.entityKind === 'bot' ? 34 : CANVAS_LIMITS.avatarHeight / 2)
        const nextState = openWindow(latest.current, { id: current.entity.id, kind: current.entityKind }, { x, y, compact: true })
        const win = nextState.windows.find(w => w.entityId === current.entity.id)
        if (win) {
          win.x = x
          win.y = y
          actions.markCanvasWindowMoved?.(win.id)
        }
        update(nextState, false)
        if (win) {
          const target = groupTargetAt(nextState, [win.id], event.clientX, event.clientY)
          setDropTarget(target?.windowId ?? target?.id ?? null)
          drag.current = { kind: 'avatar', id: win.id, ids: [win.id], startX: event.clientX, startY: event.clientY, state: nextState, latest: nextState, originState: current.originState, target, box: current.box, moved: true }
        }
      }
      return
    }
    if (current.kind === 'pan') update(() => setCanvasViewport(current.state, { ...v, x: v.x + dx, y: v.y + dy }), false)
    if (current.kind === 'window' || current.kind === 'group' || current.kind === 'avatar' && current.moved) {
      const next = dragGeometry(current.state, current.ids, dx / v.zoom, dy / v.zoom, dragBounds.current ?? current.box, current.kind === 'group' ? current.id : undefined)
      current.latest = next
      current.target = groupTargetAt(next, current.ids, event.clientX, event.clientY)
      setDropTarget(current.target?.windowId ?? current.target?.id ?? null)
      // Move only selected desktop nodes. Commit the observable layout on release.
      if (!current.nodes) current.nodes = [...(root.current.querySelectorAll?.('.bt-canvas-world > [data-window-id]') ?? [])].filter(node => current.ids.includes(node.dataset.windowId))
      for (const node of current.kind === 'group' ? [] : current.nodes) {
        const from = current.state.windows.find(window => window.id === node.dataset.windowId)
        const to = next.windows.find(window => window.id === node.dataset.windowId)
        if (from && to) { node.style.transition = 'none'; node.style.transform = `translate3d(${to.x - from.x}px,${to.y - from.y}px,0)`; node.style.willChange = 'transform' }
      }
      // A selected group frame also needs its geometry updated.
      if (current.kind === 'group') update(next, false)
      if (root.current.dataset) root.current.dataset.dragging = 'true'
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
        // Preview is wider than the strict, rechecked release threshold.
        const shown = { ...(current.latest ?? latest.current), windows: (current.latest ?? latest.current).windows.map(window => ({ ...window, compact: true })) }
        const other = current.target ? undefined : overlapMain(shown, roster, current.id, [], MERGE_PREVIEW_DISTANCE)
        const closest = other ? {
          sourceId: draggedWin.entityId, targetId: other.entityId,
          sourceWindowId: draggedWin.id, targetWindowId: other.id,
          sourceName: roster.byId[draggedWin.entityId]?.name || '',
          targetName: roster.byId[other.entityId]?.name || '',
          source: { x: draggedWin.x + 60, y: draggedWin.y + 34 },
          target: { x: other.x + 60, y: other.y + 34 },
          dist: Math.hypot(draggedWin.x - other.x, draggedWin.y - other.y),
          ready: Math.hypot(draggedWin.x - other.x, draggedWin.y - other.y) < MERGE_COMMIT_DISTANCE,
        } : null
        setMergePair(closest)
      } else if (mergePairRef.current) setMergePair(null)
    } else if (mergePairRef.current) {
      setMergePair(null)
    }
  }
  const move = event => {
    if (!drag.current) return
    if (!drag.current.moved && Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 4) {
      drag.current.moved = true; drag.current.onDragStart?.()
    }
    pendingMove.current = { clientX: event.clientX, clientY: event.clientY }
    if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null
      const point = pendingMove.current; pendingMove.current = null
      if (point) applyMove(point)
    })
  }
  const finish = event => {
    if (!drag.current) return
    if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null }
    if (event.type !== 'pointercancel' && (pendingMove.current || drag.current.moved)) applyMove(event)
    pendingMove.current = null
    const current = drag.current
    for (const node of current.nodes ?? []) { node.style.transform = ''; node.style.willChange = '' }
    // Keep transitions disabled until React has painted the committed left/top.
    // Otherwise clearing the temporary transform animates from the old origin.
    releasedNodes.current = current.nodes ?? []
    if (releasedNodes.current.length) releaseFrame.current = requestAnimationFrame(() => {
      releaseFrame.current = requestAnimationFrame(restoreTransitions)
    })
    if (root.current.dataset) delete root.current.dataset.dragging
    if (current.latest && event.type !== 'pointercancel') {
      current.hitCache = null
      current.target = groupTargetAt(current.latest, current.ids, event.clientX, event.clientY)
      update(current.latest, false)
    }
    drag.current = null
    setMarquee(null)
    setDropTarget(null)
    if (root.current.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId)
    if (event.type === 'pointercancel') {
      setMergePair(null)
      if (current.state) update(current.originState ?? current.state)
      actions.saveCanvas()
      return
    }
    if (current.moved && (current.kind === 'window' || current.kind === 'avatar' || current.kind === 'group')) {
      current.ids?.forEach(id => actions.markCanvasWindowMoved?.(id))
    }
    actions.saveCanvas()
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
      update(current.target.kind === 'room' ? current.originState ?? current.state : current.state)
      proposeGroup(selectedMains(current.state, roster, current.ids), current.target)
      return
    }
    if (current.moved && current.ids?.length === 1 && ['avatar', 'window'].includes(current.kind)) {
      const next = current.latest ?? latest.current
      const targetWin = overlapMain({ ...next, windows: next.windows.map(window => ({ ...window, compact: true })) }, roster, current.id)
      if (targetWin) {
        const source = next.windows.find(window => window.id === current.id)
        update(current.state)
        createMergedGroup(source.entityId, targetWin.entityId)
        return
      }
    }
    if (current.kind === 'dock' && !current.moved && event.type !== 'pointercancel') {
      actions.openCanvasEntity(current.entity.id, size)
    } else if (current.kind === 'avatar' && !current.moved && event.type !== 'pointercancel') {
      const window = latest.current.windows.find(window => window.id === current.id)
      if (window?.kind === 'room') current.onTap?.()
      else actions.openCanvasConversation(current.id)
    }
  }
  const createMergedGroup = (sourceId, targetId) => {
    const members = [sourceId, targetId]
    const existing = (roster.rooms ?? []).find(room => !room.task && room.members?.length === members.length && members.every(id => room.members.includes(id)))
    if (existing) { actions.openCanvasEntity?.(existing.id); return }
    const base = members.map(id => roster.byId[id]?.name).join(' + ')
    const names = new Set((roster.rooms ?? []).map(room => room.name))
    let name = base, suffix = 2
    while (names.has(name)) name = `${base} (${suffix++})`
    actions.createRoom?.(members, { admin: sourceId, name }).then(room => {
      if (room) actions.openCanvasEntity?.(room.id)
    }).catch(error => actions.reportError?.(error, 'canvas-group'))
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
    const point = canvasDropPoint(current, box, x, y)
    const probe = { ...current, windows: existing ? current.windows.map(window => window.id === existing.id ? { ...window, ...point, open: true, compact: true } : window) : [...current.windows, { id: 'contact-drop', kind: 'bot', entityId: id, ...point, open: true, compact: true }] }
    const target = groupTargetAt(probe, [existing?.id ?? 'contact-drop'], x, y)
    const other = !target && overlapMain(probe, roster, existing?.id ?? 'contact-drop', [], MERGE_PREVIEW_DISTANCE)
    const distance = other ? Math.hypot(point.x - other.x, point.y - other.y) : Infinity
    setMergePair(other ? { sourceId: id, targetId: other.entityId, sourceWindowId: existing?.id, targetWindowId: other.id,
      sourceName: roster.byId[id]?.name ?? '', targetName: roster.byId[other.entityId]?.name ?? '',
      source: { x: point.x + 60, y: point.y + 34 }, target: { x: other.x + 60, y: other.y + 34 }, dist: distance, ready: distance < MERGE_COMMIT_DISTANCE } : null)
    setDropTarget(target?.windowId ?? target?.id ?? null)
    if (!commit) return
    setDropTarget(null)
    setMergePair(null)
    if (other && distance < MERGE_COMMIT_DISTANCE) { createMergedGroup(id, other.entityId); return }
    if (!target || target.kind === 'draft' && !existing?.open) actions.placeCanvasMain(id, canvasDropPoint(current, box, x, y))
    if (target) proposeGroup([id], target)
  }
  const contactDropRef = useRef(contactDrop)
  contactDropRef.current = contactDrop
  useEffect(() => {
    const receive = event => {
      const { id, x, y, phase } = event.detail
      const node = root.current
      const hit = node.ownerDocument.elementFromPoint(x, y)
      const roomId = hit?.closest('[data-room-drop-id]')?.dataset.roomDropId
      if (phase === 'cancel' || !hit || !node.contains(hit) && !roomId) { setDropTarget(null); setMergePair(null); return }
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
      const y = Math.round((event.clientY - box.top - v.y) / v.zoom - (kind === 'bot' ? 34 : CANVAS_LIMITS.avatarHeight / 2))
      if (kind !== 'bot' && kind !== 'room' || !(kind === 'bot' ? roster.byId[id] : roster.roomsById[id])) return
      const probe = openWindow(latest.current, { id, kind }, { x, y, compact: true })
      const placed = probe.windows.find(window => window.entityId === id)
      if (placed) { placed.x = x; placed.y = y }
      const winId = probe.windows.find(window => window.entityId === id)?.id
      const target = kind === 'bot' ? groupTargetAt(probe, [winId], event.clientX, event.clientY) : null
      if (target?.kind === 'room') { proposeGroup([id], target); return }
      const other = kind === 'bot' && !target ? overlapMain(probe, roster, winId) : null
      if (other) { createMergedGroup(id, other.entityId); return }
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
  const nativeDropRef = useRef(handleDrop)
  nativeDropRef.current = handleDrop
  useEffect(() => {
    const doc = root.current.ownerDocument
    if (!doc) return undefined
    const isGroupDrop = event => event.target.closest?.('[data-room-drop-id]') && Array.from(event.dataTransfer?.types ?? []).includes('application/x-ds-bot')
    const over = event => {
      if (!isGroupDrop(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const drop = event => {
      if (!isGroupDrop(event)) return
      try {
        if (JSON.parse(event.dataTransfer.getData('application/x-ds-bot')).kind === 'bot') nativeDropRef.current(event)
      } catch { /* malformed drag */ }
    }
    doc.addEventListener('dragover', over, true)
    doc.addEventListener('drop', drop, true)
    return () => { doc.removeEventListener('dragover', over, true); doc.removeEventListener('drop', drop, true) }
  }, [])
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
    h(CanvasGlobalSearch, { actions, roster, work }),
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
        visible.map(window => h(WindowCard, { key: window.id, window: { ...window, compact: true }, canvasRoot: root, drag, conversationOpen: !window.compact, viewport: state.viewport, roster, selected: state.selected.includes(window.id), active: state.active === window.id, actions, useSessions, useWork, SessionProvider, renderSlot, start, dropTarget: dropTarget === window.id, isMergeTarget: mergePair?.targetWindowId === window.id && mergePair.ready })),
        mergePair ? (() => {
          const sourceBot = roster?.byId?.[mergePair.sourceId]
          const targetBot = roster?.byId?.[mergePair.targetId]
          const sourceColor = getRoleTintColor(sourceBot)
          const targetColor = getRoleTintColor(targetBot)
          const sourceImg = lookOf(sourceBot)?.image
          const targetImg = lookOf(targetBot)?.image
          const minX = Math.min(mergePair.source.x, mergePair.target.x) - 100
          const minY = Math.min(mergePair.source.y, mergePair.target.y) - 100
          const width = Math.max(mergePair.source.x, mergePair.target.x) - minX + 100
          const height = Math.max(mergePair.source.y, mergePair.target.y) - minY + 100
          const sX = mergePair.source.x - minX
          const sY = mergePair.source.y - minY
          const tX = mergePair.target.x - minX
          const tY = mergePair.target.y - minY
          const bridgePath = gooeyBridge({ x: sX, y: sY }, { x: tX, y: tY }, 28, 28)

          return h('div', {
            className: 'bt-metaball-container',
            style: {
              position: 'absolute',
              left: `${minX}px`,
              top: `${minY}px`,
              width: `${width}px`,
              height: `${height}px`,
              pointerEvents: 'none',
              zIndex: 9999,
            },
          },
            h('svg', {
              className: 'bt-metaball-svg',
              width,
              height,
              viewBox: `0 0 ${width} ${height}`,
              style: {
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                overflow: 'visible',
                filter: 'drop-shadow(0 6px 16px rgba(20, 35, 60, 0.08))',
              },
            },
              h('defs', null,
                h('filter', { id: 'canvas-gooey-filter', x: '-40%', y: '-40%', width: '180%', height: '180%' },
                  h('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 8, result: 'blur' }),
                  h('feColorMatrix', { in: 'blur', mode: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10' })),
                h('linearGradient', {
                  id: 'canvas-gooey-gradient',
                  gradientUnits: 'userSpaceOnUse',
                  x1: sX,
                  y1: sY,
                  x2: tX,
                  y2: tY,
                },
                  h('stop', { offset: '0%', stopColor: sourceColor }),
                  h('stop', { offset: '100%', stopColor: targetColor })),
                h('clipPath', { id: 'clip-source-avatar' },
                  h('circle', { cx: sX, cy: sY, r: 28 })),
                h('clipPath', { id: 'clip-target-avatar' },
                  h('circle', { cx: tX, cy: tY, r: 28 }))),
              h('g', { filter: 'url(#canvas-gooey-filter)' },
                h('circle', { cx: sX, cy: sY, r: 32, fill: sourceColor }),
                h('circle', { cx: tX, cy: tY, r: 32, fill: targetColor }),
                bridgePath ? h('path', { d: bridgePath, fill: 'url(#canvas-gooey-gradient)' }) : null),
              h('circle', { cx: sX, cy: sY, r: 30, fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, opacity: 0.6 }),
              h('circle', { cx: tX, cy: tY, r: 30, fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, opacity: 0.6 }),
              sourceImg ? h('image', { href: sourceImg, x: sX - 28, y: sY - 28, width: 56, height: 56, clipPath: 'url(#clip-source-avatar)' }) : null,
              targetImg ? h('image', { href: targetImg, x: tX - 28, y: tY - 28, width: 56, height: 56, clipPath: 'url(#clip-target-avatar)' }) : null,
              !sourceImg ? h('foreignObject', { x: sX - 28, y: sY - 28, width: 56, height: 56 }, h(BotAvatar, { bot: sourceBot, size: 56, badge: false, live: false })) : null,
              !targetImg ? h('foreignObject', { x: tX - 28, y: tY - 28, width: 56, height: 56 }, h(BotAvatar, { bot: targetBot, size: 56, badge: false, live: false })) : null))
        })() : null),
      visible.length === 0 ? h('div', { className: 'bt-canvas-empty' }, h('h2', null, t('Your team workspace')), h('p', null, t('Open employees from the directory. Their conversations stay with them.')), button(t('Employee directory'), () => actions.openNewChat('chat'), PeopleIcon)) : null),
    visible.filter(window => !window.compact).sort((a, b) => a.z - b.z).map((window, order) => h(CanvasChatWindow, { key: window.id, window, active: state.active === window.id, order, size, roster, actions, useSessions, SessionProvider, renderSlot })),
    mergePair ? h(MergeHint, { pair: mergePair, viewport: state.viewport, canvasRef: root }) : null,
    h(CanvasQuickMessage, { bot: quickBot, actions }),
    h(CanvasAgenda, { roster, actions }),
    marquee ? h('div', { className: 'bt-canvas-marquee', style: marquee }) : null,
    h(CanvasDepartmentDock, {
      roster, work, useSessions, actions, size, canvasRoot: root,
      activeDeptKey: activeBot ? getDepartmentForEntity(roster.byId[activeBot.entityId], roster)?.key ?? `bot:${activeBot.entityId}`
        : visible.find(window => window.id === state.active && window.kind === 'room') ? `room:${visible.find(window => window.id === state.active).entityId}` : undefined,
      onStartDrag: startDockDrag, drag,
    }),
    null)
}
