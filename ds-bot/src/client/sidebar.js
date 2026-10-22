import { createElement as h, Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import { isMainOf } from './sources.js'
import { currentPart, previewOf, relativeShort } from './text.js'
import { PlusIcon, GaugeIcon, PlugIcon, ClockIcon, GearIcon, PinMarkIcon, ConnectorIcon, SwitchIcon, CloudDownloadIcon, PeopleIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons.js'
import { MAIN_LOOK } from './characters.js'
import { botState, BotMark, BotAvatar, RoomAvatar } from './mark.js'
import { reducedMotion } from './activity-row.js'
import { Shimmer, workPhrase } from './cells.js'
import { springEasing, SPRING_SHAPE } from './motion.js'
import { hostText, t } from './i18n.js'
import { showsDshRow } from './dsh-offer.js'
import { botUpdateHint, installedUpdateText } from './update-status.js'
import { CANVAS_PANEL } from './canvas-session.js'
import { useFloatingTeam, FLOATING_TEAM_CSS } from './floating-team.js'
import { ConversationTaskPanel } from './conversation-task-panel.js'
import { TeamAgentChat, TEAM_AGENT_CHAT_CSS } from './team-agent-chat.js'
import { useMainAgentDrag } from './main-agent-drag.js'
import { useChatPopoutDrag, stageChatPopout, takeChatPopout, CHAT_POPOUT_CSS } from './chat-popout.js'
import { conversationTimes, teamConversationOrder } from './team-order.js'

// -------------------------------------------------------------------------
// Sidebar

// Manual "Mark as Unread" lasts until the conversation is opened again.
function useMarkedUnread(id, active, marked, actions) {
  useEffect(() => {
    if (active && marked) actions.clearUnread(id)
  }, [active, marked])
}

const PinMark = () => h('span', { className: 'bt-pin', 'aria-hidden': true }, h(PinMarkIcon))

// Whether an approval waits for the user: for a Bot, in any of its Sessions; for a group,
// from any of its members there.
const useApproval = (useWork, match) => (useWork ? useWork(work => (work.approvals ?? []).some(match)) : false)

// Work running in group Sessions, as "botId|tool" keys so a row redraws only when it
// changes: the groups one Bot works in, or the members at work in one group.
const useGroupWork = (useWork, pick) => (useWork ? useWork(work => pick(work.rooms ?? {}).join(',')) : '')
const workKeys = text => (text === '' ? [] : text.split(',').map((key) => {
  const [id, tool] = key.split('|')
  return { id, tool: tool || undefined }
}))
const workLine = (lead, tool, more) => h(Shimmer, null, `${lead} · ${workPhrase(tool)}…${more > 0 ? ` +${more}` : ''}`)

function BotRow({ bot, roster, actions, useSessions, useSessionStatus, useSessionRetainInfo, useCompletions, useActivity, useWork, canvasActive, canvasEntity, wide, marked, teamChatId, onSelectTeamChat }) {
  const id = bot.id
  const contactDrag = useMainAgentDrag(canvasActive, id)
  const part = currentPart(bot)
  const preview = useSessions(list => previewOf(list, part, roster.exchangeTurns[part]))
  const running = useSessionStatus(map => map.get(part)?.running === true)
  const retained = useSessionRetainInfo(part, info => (info?.retainedBy?.mainView ?? 0) > 0)
  const active = canvasActive ? (teamChatId ? teamChatId === id : (canvasEntity?.kind === 'bot' && canvasEntity.entityId === id)) : retained
  const reading = active && (!canvasActive || teamChatId === id || !canvasEntity.compact)
  const completed = useCompletions(value => value[part] === true)
  const pending = useSessionStatus(map => map.get(part)?.pendingInteraction !== undefined)
  const unread = completed || pending || (marked && !reading)
  useMarkedUnread(id, reading, marked, actions)
  const main = isMainOf(roster, id)
  const tile = roster.mainBotId === id
  const approval = useApproval(useWork, entry => entry.botId === id)
  const alert = roster.questions?.[part] !== undefined || approval
  const doing = useActivity(map => map[id])
  // Work in a group runs in a Session of its own, so the Bot's chat stays idle meanwhile.
  const groups = workKeys(useGroupWork(useWork, rooms => Object.entries(rooms).flatMap(([roomId, entries]) => entries.filter(entry => entry.botId === id).map(entry => `${roomId}|${entry.tool ?? ''}`))))
  const away = !running && groups.length > 0
  const state = botState(running || away, doing, alert)
  const awayLine = away ? workLine(roster.roomsById[groups[0].id]?.name ?? t('a group chat'), groups[0].tool, groups.length - 1) : null
  if (bot.hidden && !active && !main) return null
  const onContextMenu = (event) => {
    event.preventDefault()
    actions.openMenu({ kind: 'bot', id, x: event.clientX, y: event.clientY })
  }
  const pinned = bot.pinned === true && !tile
  const label = [bot.name, main ? t('Main Bot') : '', pinned ? t('Pinned') : '', running || away ? t('Working') : '', approval ? t('Waiting for your approval') : alert ? t('Waiting for your answer') : '', unread ? t('Unread activity') : ''].filter(Boolean).join(', ')
  const dragStart = (event, kind) => {
    try {
      const payload = JSON.stringify({ id, kind })
      event.dataTransfer.setData('application/x-ds-bot', payload)
      event.dataTransfer.setData('text/plain', payload)
      event.dataTransfer.effectAllowed = 'copyMove'
    } catch { /* dataTransfer error */ }
  }
  const onRowClick = () => {
    if (canvasActive && onSelectTeamChat) onSelectTeamChat(id)
    else actions.openSession(id)
  }
  if (tile && wide && !canvasActive) {
    return h('div', { className: 'bt-tile-wrap' }, h('button', {
      type: 'button', className: 'bt-tile', 'aria-label': label, 'aria-current': active ? 'page' : undefined,
      'data-bot-id': id, title: preview || bot.name, onClick: onRowClick, onContextMenu,
      draggable: true, onDragStart: event => dragStart(event, 'bot'),
    },
    h(BotAvatar, { bot, size: 60, state, main: true }),
    h('span', { className: 'bt-tile-name' }, bot.name),
    bot.role ? h('span', { className: 'bt-chip' }, bot.role) : null))
  }
  return h('button', {
    type: 'button', className: 'bt-row team-item', 'aria-label': label, 'aria-current': active ? 'page' : undefined, 'aria-selected': active ? 'true' : undefined,
    'data-bot-id': id, title: bot.name, onClick: onRowClick, onContextMenu,
    draggable: false, ...contactDrag,
  },
  h(BotAvatar, { bot, size: 36, state, main }),
  pinned && !wide ? h(PinMark) : null,
  wide ? h('span', { className: 'bt-row-body' },
    h('span', { className: 'bt-row-name' }, h('span', { className: 'bt-row-title' }, bot.name), bot.generalAssistant ? h('span', { className: 'bt-assistant-badge' }, t('General Assistant')) : null, pinned ? h(PinMark) : null),
    awayLine ? h('span', { className: 'bt-row-preview' }, awayLine) : preview ? h('span', { className: 'bt-row-preview' }, preview) : null) : null,
  (wide || canvasActive) && unread && !reading ? h('span', { className: 'bt-unread', 'aria-hidden': true }) : null)
}

function RoomRow({ room, roster, actions, useSessions, useSessionRetainInfo, useCompletions, useWork, canvasActive, canvasEntity, wide, marked, teamChatId, onSelectTeamChat, selectedRoomIds, onRoomClick, onRoomContextMenu }) {
  const id = room.id
  const fallback = useSessions(list => previewOf(list, id))
  const preview = room.preview?.replace(/\s+/g, ' ').trim() || fallback
  const retained = useSessionRetainInfo(id, info => (info?.retainedBy?.mainView ?? 0) > 0)
  const active = canvasActive ? (teamChatId ? teamChatId === id : (canvasEntity?.kind === 'room' && canvasEntity.entityId === id)) : retained
  const reading = active && (!canvasActive || teamChatId === id || !canvasEntity.compact)
  const completed = useCompletions(value => value[id] === true)
  const unread = completed || (marked && !reading)
  useMarkedUnread(id, reading, marked, actions)
  const approval = useApproval(useWork, entry => entry.roomId === id)
  const members = workKeys(useGroupWork(useWork, rooms => (rooms[id] ?? []).map(entry => `${entry.botId}|${entry.tool ?? ''}`)))
  const first = roster.byId[members[0]?.id]
  const workingLine = first ? workLine(first.name, members[0].tool, members.length - 1) : null
  if (room.hidden && !active) return null
  const pinned = room.pinned === true
  const multiSelected = selectedRoomIds?.includes(id)
  const label = [room.name, pinned ? t('Pinned') : '', members.length > 0 ? t('Working') : '', approval ? t('Waiting for your approval') : ''].filter(Boolean).join(', ')
  const onRowClick = (event) => {
    // Shift-click range selection for rooms
    if (event.shiftKey && onRoomClick?.(id, true)) {
      event.preventDefault()
      return
    }
    // Normal click: clear multi-select and open
    if (onRoomClick) onRoomClick(id, false)
    if (canvasActive && onSelectTeamChat) onSelectTeamChat(id)
    else actions.openSession(id)
  }
  const handleContextMenu = (event) => {
    event.preventDefault()
    if (onRoomContextMenu) {
      onRoomContextMenu(id, event)
    } else {
      actions.openMenu({ kind: 'room', id, x: event.clientX, y: event.clientY })
    }
  }
  return h('button', {
    type: 'button', className: 'bt-row team-item', 'aria-label': label, 'aria-current': active ? 'page' : undefined, 'aria-selected': (active || multiSelected) ? 'true' : undefined,
    'data-room-id': id, 'data-room-drop-id': canvasActive ? id : undefined, 'data-multi-selected': multiSelected ? 'true' : undefined, title: room.name, onClick: onRowClick,
    onContextMenu: handleContextMenu,
    draggable: true, onDragStart: event => {
      try {
        const payload = JSON.stringify({ id, kind: 'room' })
        event.dataTransfer.setData('application/x-ds-bot', payload)
        event.dataTransfer.setData('text/plain', payload)
        event.dataTransfer.effectAllowed = 'copyMove'
      } catch { /* dataTransfer error */ }
    },
  },
  h(RoomAvatar, { room, roster, size: 36 }),
  pinned && !wide ? h(PinMark) : null,
  wide ? h('span', { className: 'bt-row-body' },
    h('span', { className: 'bt-row-name' }, h('span', { className: 'bt-row-title' }, room.name), pinned ? h(PinMark) : null),
    workingLine ? h('span', { className: 'bt-row-preview' }, workingLine) : preview ? h('span', { className: 'bt-row-preview' }, preview) : null) : null,
  (wide || canvasActive) && approval && !reading ? h('span', { className: 'bt-unread bt-unread-wait', 'aria-hidden': true })
    : (wide || canvasActive) && unread && !reading ? h('span', { className: 'bt-unread', 'aria-hidden': true }) : null)
}

// One expanded DSH Agent Session row: title, relative stamp, rename field, and a
// context menu for rename/archive.
function AgentSessionRow({ session, agent, actions, renaming, index }) {
  const input = useRef(null)
  useLayoutEffect(() => {
    if (!renaming) return
    input.current?.focus()
    input.current?.select()
  }, [renaming])
  if (renaming) {
    const commit = (keep) => {
      const value = input.current?.value ?? ''
      if (!keep || value.trim() === '' || value.trim() === session.title) { actions.endAgentRename(); return }
      // The editor closes only after the rename landed; a failure keeps it open.
      void (async () => {
        try {
          await actions.renameAgentSession(agent.id, session.id, value)
          actions.endAgentRename()
        } catch (error) {
          actions.reportError(error, 'agent-rename')
        }
      })()
    }
    return h('div', { className: 'bt-agent-sub-row bt-agent-edit', style: { '--i': index } },
      h('input', {
        ref: input, defaultValue: session.title, 'aria-label': t('Rename'),
        onKeyDown: (event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter') commit(true)
          else if (event.key === 'Escape') commit(false)
        },
        onBlur: () => commit(true),
      }))
  }
  return h('button', {
    type: 'button', className: 'bt-agent-sub-row', 'aria-current': session.active ? 'page' : undefined, style: { '--i': index },
    onClick: () => actions.openAgentSession(session.id),
    onContextMenu: (event) => {
      event.preventDefault()
      event.stopPropagation()
      actions.openMenu({ kind: 'agent-session', id: session.id, agentId: agent.id, x: event.clientX, y: event.clientY })
    },
  },
  h('span', { className: 'bt-agent-sub-title' }, session.title),
  h('span', { className: 'bt-agent-sub-time' }, session.at > 0 ? relativeShort(session.at) : ''))
}

// The DSH Agent row: a plain dsh Session list lives in the Bot workspace, so it
// sits among the Bots with the harness's own whale mark.
function AgentRow({ agent, actions, useSessions, useSessionStatus, useUi, wide, marked, canvasActive, teamChatId }) {
  const info = useSessions(list => JSON.stringify(agent.sessions.map((id) => {
    const row = list.byId[id]
    return {
      id,
      // A blank Session's title is the workspace folder name; show the label instead.
      title: row?.blank === true ? '' : (row?.displayTitle ?? row?.title ?? ''),
      at: row?.updatedAt ?? 0,
      running: row?.running === true,
      active: (row?.retainedBy?.mainView ?? 0) > 0,
    }
  }).sort((a, b) => b.at - a.at)))
  const statusInfo = useSessionStatus(map => JSON.stringify(agent.sessions.map(id => ({
    id, running: map.get(id)?.running === true, unread: map.get(id)?.completionUnread === true,
  }))))
  const statuses = Object.fromEntries(JSON.parse(statusInfo).map(entry => [entry.id, entry]))
  const sessions = JSON.parse(info).map(session => ({
    ...session,
    running: statuses[session.id]?.running ?? session.running,
    unread: statuses[session.id]?.unread ?? false,
    title: session.title === '' ? t('New session') : session.title,
  }))
  const renaming = useUi(value => value.renameAgent)
  const active = canvasActive ? (teamChatId ? teamChatId === agent.id : false) : sessions.some(session => session.active)
  const running = sessions.some(session => session.running)
  const unread = sessions.some(session => session.unread) || (marked && !active)
  useMarkedUnread(agent.id, active, marked, actions)
  const preview = sessions[0]?.title ?? t('New session')
  const label = ['DSH Agent', running ? t('Working') : '', unread ? t('Unread activity') : ''].filter(Boolean).join(', ')
  const open = active && wide
  return h('div', { className: 'bt-agent' },
    h('button', {
      type: 'button', className: 'bt-row team-item', 'aria-label': label, 'aria-current': active ? 'page' : undefined, 'aria-selected': active ? 'true' : undefined,
      'data-agent-id': agent.id, title: 'DSH Agent', onClick: () => actions.openAgent(agent.id),
      onContextMenu: (event) => { event.preventDefault(); actions.openMenu({ kind: 'agent', id: agent.id, x: event.clientX, y: event.clientY }) },
    },
    h('span', { className: `bt-agent-ava${running ? ' bt-run' : ''}` }, h(FishLogo, { size: 22 })),
    wide ? h('span', { className: 'bt-row-body' },
      h('span', { className: 'bt-row-name' }, 'DSH Agent'),
      preview ? h('span', { className: 'bt-row-preview' }, preview) : null) : null,
    (wide || canvasActive) && unread && !active ? h('span', { className: 'bt-unread', 'aria-hidden': true }) : null),
    h('div', { className: 'bt-agent-sub', 'data-open': open || undefined },
      h('div', { className: 'bt-agent-sub-in' },
        h('button', { type: 'button', className: 'bt-agent-sub-row bt-agent-new', style: { '--i': 0 }, onClick: () => { void actions.newAgentSession(agent.id).catch(error => actions.reportError(error, 'agent-session')) } },
          h(PlusIcon), h('span', { className: 'bt-agent-sub-title' }, t('New session'))),
        sessions.map((session, index) => h(AgentSessionRow, {
          key: session.id, session, agent, actions, index: index + 1,
          renaming: renaming === session.id,
        })))))
}

// List rows glide to new places on a spring.
const GLIDE = springEasing(1000, 63)

function useListGlide(listRef, layout, key) {
  const tops = useRef({ layout, map: new Map() })
  const animations = useRef(new Map())
  useEffect(() => () => { for (const animation of animations.current.values()) animation.cancel() }, [])
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const next = new Map()
    const still = reducedMotion() || tops.current.layout !== layout
    const rows = [...list.querySelectorAll('[data-bot-id],[data-room-id],[data-agent-id]')].map(row => ({ row, top: row.offsetTop }))
    for (const { row, top } of rows) {
      const id = row.dataset.botId ?? row.dataset.roomId ?? row.dataset.agentId
      // offsetTop ignores transforms, so a glide in flight does not skew the next one.
      next.set(id, top)
      const before = tops.current.map.get(id)
      animations.current.get(id)?.cancel()
      animations.current.delete(id)
      if (!still && before !== undefined && Math.abs(before - top) > 0.5) {
        const animation = row.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], GLIDE)
        animations.current.set(id, animation)
        animation.onfinish = () => { if (animations.current.get(id) === animation) animations.current.delete(id) }
      }
    }
    for (const [id, animation] of animations.current) if (!next.has(id)) { animation.cancel(); animations.current.delete(id) }
    tops.current = { layout, map: next }
  }, [layout, key])
}

export function TeamSidebar(props) {
  const { useRoster, useUi, useSessions, actions } = props
  const root = useRef(null)
  const listRef = useRef(null)
  const listId = useId()
  const roster = useRoster(value => value)
  const markedUnread = useUi(value => value.unread)
  const completions = props.useCompletions(value => value)
  const canvasActive = props.usePanelInfo(value => value.activePanelId === CANVAS_PANEL)
  const wide = canvasActive || props.wide
  const [teamChatId, setTeamChatId] = useState(null)
  const [chatClosing, setChatClosing] = useState(false)
  const chatCloseTimer = useRef(null)
  useEffect(() => () => clearTimeout(chatCloseTimer.current), [])
  const floating = useFloatingTeam(canvasActive, root, Boolean(teamChatId), chatClosing)
  const canvasEntity = props.useCanvas(value => value.windows.find(window => window.id === value.active && window.open))
  props.useRegistry(value => value)
  const conversationStamps = useRef({})
  const updated = useSessions(list => {
    conversationStamps.current = conversationTimes(list, roster, conversationStamps.current)
    return JSON.stringify(conversationStamps.current)
  })
  const order = useMemo(() => teamConversationOrder(roster, JSON.parse(updated), markedUnread, completions), [roster, updated, markedUnread, completions])
  const main = roster.byId[roster.mainBotId]
  useListGlide(listRef, `${wide}:${Boolean(teamChatId && !chatClosing)}:${floating.folded}`, order.map(entry => entry.item.id).join(','))
  useLandOnMainBot(roster, useSessions, actions, canvasActive)
  const collapseChat = () => {
    if (!teamChatId) return
    setChatClosing(true)
    clearTimeout(chatCloseTimer.current)
    chatCloseTimer.current = setTimeout(() => {
      setTeamChatId(null)
      setChatClosing(false)
    }, 240)
  }
  const onSelectTeamChat = (id) => {
    clearTimeout(chatCloseTimer.current)
    floating.expand()
    setChatClosing(false)
    floating.expand()
    setTeamChatId(id)
    actions.clearUnread(id)
  }
  useEffect(() => {
    if (!teamChatId) return
    let down
    const outside = event => {
      const target = event.target
      return target instanceof Element && !root.current?.contains(target) && !target.closest('.bt-menu,[role=dialog],[role=listbox],.bt-overlay,.bt-drawer')
    }
    const start = event => { down = event.button === 0 && outside(event) ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null }
    const end = event => { if (down?.id === event.pointerId && outside(event) && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) collapseChat(); down = null }
    const key = event => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && !document.querySelector('.bt-menu,[role=listbox],.bt-overlay,.bt-drawer')) collapseChat() }
    document.addEventListener('pointerdown', start)
    document.addEventListener('pointerup', end)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', start); document.removeEventListener('pointerup', end); document.removeEventListener('keydown', key) }
  }, [teamChatId])
  const savedScrollTop = useRef(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || savedScrollTop.current <= 0) return
    el.scrollTop = savedScrollTop.current
    const timer = setTimeout(() => {
      if (el) el.scrollTop = savedScrollTop.current
    }, 140)
    return () => clearTimeout(timer)
  }, [floating.folded])
  // ---- Multi-select state for Shift-click batch operations on rooms ----
  const [selectedRoomIds, setSelectedRoomIds] = useState([])
  const lastClickedRoomId = useRef(null)
  useEffect(() => {
    const clear = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && event.target?.closest?.('[data-room-id], [role="menu"]')) return
      setSelectedRoomIds([])
    }
    document.addEventListener('pointerdown', clear, true)
    document.addEventListener('keydown', clear, true)
    return () => {
      document.removeEventListener('pointerdown', clear, true)
      document.removeEventListener('keydown', clear, true)
    }
  }, [])

  // Use rendered rows: hidden rooms can still be visible when they are active.
  const visibleRoomIds = () => Array.from(listRef.current?.querySelectorAll('[data-room-id]') ?? [], row => row.dataset.roomId)

  const onRoomClick = (id, shift) => {
    if (shift && lastClickedRoomId.current) {
      const roomOrder = visibleRoomIds()
      // Shift-click: select range between lastClickedRoomId and id
      const startIdx = roomOrder.indexOf(lastClickedRoomId.current)
      const endIdx = roomOrder.indexOf(id)
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx)
        const hi = Math.max(startIdx, endIdx)
        setSelectedRoomIds(roomOrder.slice(lo, hi + 1))
        return true
      }
    }
    // Normal click: clear multi-select, record anchor
    lastClickedRoomId.current = id
    setSelectedRoomIds([])
    return false
  }

  const onRoomContextMenu = (id, event) => {
    const visible = new Set(visibleRoomIds())
    const ids = selectedRoomIds.filter(value => visible.has(value) && roster.roomsById[value])
    if (ids.length > 1 && ids.includes(id)) {
      // Right-click on an already-selected room: keep the whole selection
      setSelectedRoomIds(ids)
      actions.openMenu({ kind: 'rooms', ids, x: event.clientX, y: event.clientY })
    } else {
      // Right-click on unselected room: clear multi-select, single menu
      setSelectedRoomIds([])
      lastClickedRoomId.current = id
      actions.openMenu({ kind: 'room', id, x: event.clientX, y: event.clientY })
    }
  }

  const rowProps = {
    roster, actions, useSessions, useUi,
    useSessionStatus: props.useSessionStatus,
    useSessionRetainInfo: props.useSessionRetainInfo,
    useCompletions: props.useCompletions,
    useActivity: props.useActivity,
    useWork: props.useWork,
    canvasActive,
    canvasEntity,
    wide,
    teamChatId,
    onSelectTeamChat,
    selectedRoomIds, onRoomClick, onRoomContextMenu,
  }
  // Typing while the sidebar has focus starts global search.
  const typeToSearch = (event) => {
    if (event.defaultPrevented || event.key.length !== 1 || event.key === ' ' || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return
    if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]')) return
    event.preventDefault()
    actions.openPalette(event.key)
  }
  const onNewClick = (event) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    actions.openMenu({ kind: 'team-new', x: rect.left, y: rect.bottom + 6 })
  }

  const splitLayout = canvasActive && teamChatId && !floating.folded
  const activeEntity = teamChatId ? (roster.byId[teamChatId] ?? roster.roomsById[teamChatId]) : null
  const isRoom = Boolean(activeEntity && roster.roomsById[activeEntity.id])
  const popout = useChatPopoutDrag({
    enabled: Boolean(splitLayout && !chatClosing),
    id: activeEntity?.id,
    onPopout: ({ id, rect, bounds }) => {
      if (id !== activeEntity?.id) return
      const view = root.current?.ownerDocument.defaultView
      // Release the embedded editor before the canvas claims the same Session.
      clearTimeout(chatCloseTimer.current)
      flushSync(() => { setTeamChatId(null); setChatClosing(false) })
      try {
        stageChatPopout(id, rect, bounds, view)
        actions.openCanvasEntity(id)
      } catch (error) {
        takeChatPopout(id)
        onSelectTeamChat(id)
        throw error
      }
    },
  })
  const chatStatus = props.useWork(work => {
    if (!activeEntity) return 'Available'
    if ((work.approvals ?? []).some(item => isRoom ? item.roomId === activeEntity.id : item.botId === activeEntity.id)) return 'Waiting for your approval'
    if (roster.questions?.[isRoom ? activeEntity.id : currentPart(activeEntity)]) return 'Waiting for your answer'
    if (isRoom ? (work.rooms?.[activeEntity.id]?.length ?? 0) > 0 : work.bots?.[activeEntity.id]) return 'Working'
    return 'Available'
  })

  const navContent = [
    wide ? h('div', { key: 'top', className: 'bt-side-top' },
      canvasActive ? h('button', { type: 'button', className: 'bt-team-grip', 'aria-label': t('Move team panel'), title: t('Drag to move · Arrow keys to adjust · Home to reset'), ...floating.handle }, h(PeopleIcon), h('span', null, t('Team')))
        : h('span', { className: 'bt-brand' }, h(BrandMark, { size: 22 }), h(BrandName)),
      h(UpdateButton, { useUpdate: props.useUpdate, actions }),
      h('button', {
        type: 'button',
        className: 'bt-round',
        'aria-label': t('New…'),
        title: t('New…'),
        onClick: onNewClick,
      }, h(PlusIcon)),
      canvasActive ? h('button', {
        type: 'button',
        className: 'bt-round bt-team-fold',
        'aria-label': t(splitLayout ? 'Collapse conversation' : (floating.folded ? 'Expand team panel' : 'Collapse team panel')),
        title: t(splitLayout ? 'Collapse conversation' : (floating.folded ? 'Expand team panel' : 'Collapse team panel')),
        'aria-expanded': splitLayout ? true : !floating.folded,
        'aria-controls': listId,
        onClick: () => {
          if (splitLayout) {
            collapseChat()
          } else {
            floating.toggle()
          }
        },
      }, h(floating.folded ? ChevronRightIcon : ChevronLeftIcon)) : null)
      : h(Fragment, { key: 'top' },
          h(UpdateButton, { useUpdate: props.useUpdate, actions }),
          h('button', {
            type: 'button',
            className: 'bt-round',
            'aria-label': t('New…'),
            title: t('New…'),
            onClick: onNewClick,
          }, h(PlusIcon))),
    wide && roster.readOnly ? h('div', { key: 'read-only', className: 'bt-hint bt-read-only', role: 'status' }, hostText(roster.readOnly)) : null,
    h('div', {
      key: 'list',
      ref: listRef,
      id: listId,
      className: 'bt-list',
      role: 'region',
      'aria-label': t('Bot list'),
      onScroll: (event) => {
        savedScrollTop.current = event.currentTarget.scrollTop
      },
    },
      main ? h(BotRow, { ...rowProps, bot: main, marked: markedUnread[main.id] === true }) : roster.ready ? null : h('div', { className: 'bt-hint', role: 'status' }, t('Loading your team…')),
      order.filter(entry => !canvasActive || entry.kind !== 'agent').map(entry => (entry.kind === 'bot'
        ? h(BotRow, { key: entry.item.id, ...rowProps, bot: entry.item, marked: markedUnread[entry.item.id] === true })
        : entry.kind === 'room'
          ? h(RoomRow, { key: entry.item.id, ...rowProps, room: entry.item, marked: markedUnread[entry.item.id] === true })
          : h(AgentRow, { key: entry.item.id, ...rowProps, agent: entry.item, marked: markedUnread[entry.item.id] === true }))))
  ]

  if (canvasActive) {
    const isSplit = Boolean(splitLayout && activeEntity)
    return h('div', {
      ref: root,
      className: isSplit ? 'bt-team-split' : 'bt-side bt-team-single',
      onKeyDown: typeToSearch,
    },
      h('div', {
        key: 'nav-shell',
        className: isSplit ? 'bt-team-split-nav' : 'bt-team-nav-standard',
      },
        h('div', { className: 'bt-side' }, navContent)),
      isSplit ? h('div', {
        key: 'chat-shell',
        role: 'region',
        tabIndex: 0,
        'aria-label': activeEntity.name,
        'aria-description': 'Drag the title or empty space onto the canvas. Press Control or Command, Shift and Enter to open a separate window.',
        ...popout,
        className: `bt-team-split-chat${chatClosing ? ' bt-chat-closing' : ''}`,
        'data-room-drop-id': isRoom && !chatClosing ? activeEntity.id : undefined,
      },
        h('header', { className: 'bt-team-chat-bar' },
          h('div', { className: 'bt-team-chat-header-main' },
            isRoom ? h(RoomAvatar, { room: activeEntity, roster, size: 36 }) : h(BotAvatar, { bot: activeEntity, size: 36, main: isMainOf(roster, activeEntity.id) }),
            h('div', { className: 'bt-team-chat-title' },
              h('div', { className: 'bt-team-chat-title-row' },
                h('strong', { className: 'bt-team-chat-name' }, activeEntity.name),
                activeEntity.englishName ? h('span', { className: 'bt-team-chat-en-name' }, activeEntity.englishName) : null,
                h('span', { className: 'bt-team-chat-dept-role' }, isRoom ? t('{count} members', { count: activeEntity.members?.length ?? 0 }) : activeEntity.generalAssistant ? t('General Assistant') : [activeEntity.department, isMainOf(roster, activeEntity.id) ? t('Main Bot') : null, activeEntity.role || t('Employee')].filter(Boolean).join(' · '))),
              h('div', { className: 'bt-team-chat-status-row' },
                h('span', { className: 'bt-team-chat-status-dot' }),
                h('span', { className: 'bt-team-chat-status-text' }, t(chatStatus))))),
          h('div', { className: 'bt-team-chat-tools' },
            h(ConversationTaskPanel, { key: activeEntity.id, sessionId: isRoom ? activeEntity.id : currentPart(activeEntity), roster, actions, onOpenConversation: onSelectTeamChat }),
            h('button', {
              type: 'button',
              className: 'bt-team-chat-btn bt-team-chat-btn--icon',
              title: t('Close window'),
              'aria-label': t('Close window'),
              onClick: collapseChat,
            }, h(CloseIcon)))),
        h('div', { className: 'bt-team-chat-body' },
          h(TeamAgentChat, {
            key: activeEntity.id,
            entity: activeEntity,
            roster,
            actions,
            useSessions,
            useWork: props.useWork,
            onOpenConversation: onSelectTeamChat,
            onClose: collapseChat,
          })), h('div', { className: 'bt-team-chat-resize', role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuenow': Math.round(floating.chatWidth), 'aria-label': t('Resize conversation'), title: t('Drag to resize conversation'), ...floating.resizeChat })) : null)
  }

  return h('div', { ref: root, className: wide ? 'bt-side' : 'bt-side bt-rail', onKeyDown: typeToSearch }, navContent)
}

// The update button at the sidebar's top right: a cloud while a newer DS Bot —
// or a newer verified DSH — is available, then the install's progress and
// result. Its card has one row each for the bot and DSH, with their versions,
// the release notes link, and each row's own button.
function UpdateButton({ useUpdate, actions }) {
  const update = useUpdate(value => value)
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState(null)
  const [error, setError] = useState('')
  const [dshError, setDshError] = useState('')
  const button = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (event.target instanceof Element && (event.target.closest('.bt-update-pop') || button.current?.contains(event.target))) return
      setOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus() } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])
  const phase = update?.phase ?? 'idle'
  const dsh = update?.dsh
  const dshPhase = dsh?.phase ?? 'idle'
  const dshRow = showsDshRow(dsh, update?.app)
  if (!update?.available && !dshRow && phase === 'idle' && dshPhase === 'idle') return null
  const cloudPhase = phase === 'installing' || dshPhase === 'installing' ? 'installing' : phase !== 'idle' ? phase : dshPhase
  const toggle = () => {
    const rect = button.current?.getBoundingClientRect()
    if (rect) setBox({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: rect.bottom + 6 })
    setOpen(value => !value)
  }
  const start = () => {
    setError('')
    void actions.installUpdate().catch(failure => setError(hostText(failure?.message ?? String(failure))))
  }
  const startDsh = () => {
    setDshError('')
    void actions.installDshUpdate().catch(failure => setDshError(hostText(failure?.message ?? String(failure))))
  }
  const label = phase === 'installing' ? t('Updating DS Bot…')
    : dshPhase === 'installing' ? t('Updating DSH…')
      : phase === 'installed' ? installedUpdateText(update)
        : dshPhase === 'installed' ? t('Restart DSH to start using DSH {version}.', { version: dsh.installed ?? dsh.verified })
          : update?.available ? t('DS Bot {version} is available', { version: update.latest })
            : phase !== 'idle' ? botUpdateHint(update) : t('DSH {version} is available', { version: dsh?.verified })
  const message = error || (phase === 'failed' ? update.error : '')
  const dshMessage = dshError || (dshPhase === 'failed' ? dsh?.error : '')
  const dshText = dshPhase === 'installed'
    ? t('Restart DSH to start using DSH {version}.', { version: dsh.installed ?? dsh.verified })
    : dsh?.available === false && dsh?.blockedBy
      ? t('Update DS Bot {version} first.', { version: dsh.blockedBy })
      : t('You have {version}.', { version: dsh?.current })
  return h(Fragment, null,
    h('button', {
      ref: button, type: 'button', className: 'bt-round bt-update', 'data-phase': cloudPhase, 'aria-label': label, title: label,
      'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: toggle,
    }, h(CloudDownloadIcon, { done: phase === 'installed' }), phase === 'failed' || dshPhase === 'failed' ? h('span', { className: 'bt-update-dot', 'aria-hidden': true }) : null),
    open && box ? createPortal(h('div', { className: 'bt-update-pop', role: 'dialog', 'aria-label': update?.available || phase !== 'idle' ? t('DS Bot update') : t('DSH update'), style: box },
      update?.available || phase !== 'idle' ? h(Fragment, null,
        h('div', { className: 'bt-update-title' }, phase === 'installed' ? t('Update installed') : t('DS Bot {version}', { version: update.latest })),
        h('div', { className: 'bt-update-text' }, phase === 'installed'
          ? installedUpdateText(update)
          : phase === 'cancelled' || update.checkError || update.unavailableReason ? botUpdateHint(update) : t('You have {version}.', { version: update.current })),
        message ? h('div', { className: 'bt-update-error', role: 'alert' }, t('The update did not finish: {reason}', { reason: message })) : null,
        h('div', { className: 'bt-update-actions' },
          update.notesUrl ? h('a', { className: 'bt-update-notes', href: update.notesUrl, target: '_blank', rel: 'noopener noreferrer' }, t("What's new")) : null,
          phase === 'installed' ? null : h('button', {
            type: 'button', className: 'bt-update-go', disabled: phase === 'installing', onClick: update.available ? start : () => void actions.checkUpdate().catch(failure => setError(hostText(failure?.message ?? String(failure)))),
          }, phase === 'installing' ? t('Updating…') : !update.available ? t('Check for updates') : phase === 'failed' ? t('Try again') : t('Update')))) : null,
      dshRow ? h('div', { className: 'bt-update-dsh' },
        h('div', { className: 'bt-update-title' }, t('DSH {version}', { version: dsh.verified })),
        h('div', { className: 'bt-update-text' }, dshText),
        dshMessage ? h('div', { className: 'bt-update-error', role: 'alert' }, t('The update did not finish: {reason}', { reason: dshMessage })) : null,
        h('div', { className: 'bt-update-actions' },
          dsh.kind === 'app' ? (dsh.available
            ? h('button', { type: 'button', className: 'bt-update-go', onClick: () => void actions.openAppUpdates(dsh.verified).catch(() => {}) }, t('Open updates'))
            : null)
            : !dsh.available && dshPhase === 'idle' ? null
              : dshPhase === 'installed' ? null
                : h('button', {
                  type: 'button', className: 'bt-update-go', disabled: dshPhase === 'installing', onClick: startDsh,
                }, dshPhase === 'installing' ? t('Updating…') : dshPhase === 'failed' ? t('Try again') : t('Update')))) : null), document.body) : null)
}

// The footer entry to the shell's plugin panel, marked as not yet adapted: the red
// badge and a hover tip explain that plugin support lands step by step.
export function ConnectPlugins({ wide, actions, usePanelInfo }) {
  const canvasActive = usePanelInfo(value => value.activePanelId === CANVAS_PANEL)
  const tipId = useId()
  const [tip, setTip] = useState(false)
  const timer = useRef(0)
  const button = useRef(null)
  const [box, setBox] = useState(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  if (canvasActive || !wide) return null
  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const rect = button.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268))
      setBox({ left, bottom: window.innerHeight - rect.top + 10 })
      setTip(true)
    }, 250)
  }
  const hide = () => { clearTimeout(timer.current); setTip(false) }
  return h('span', { className: 'bt-connect-wrap' },
    h('button', {
      ref: button, type: 'button', className: 'bt-connect bt-connect-foot', 'aria-describedby': tip ? tipId : undefined,
      onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
      onClick: () => actions.selectPanel('plugins'),
    },
    h(PlugIcon), h('span', { className: 'bt-connect-label' }, t('Connect plugins')), h('span', { className: 'bt-connect-warn', 'aria-hidden': true }, '!')),
    tip && box ? createPortal(h('span', { role: 'tooltip', id: tipId, className: 'bt-connect-tip', style: box },
      t('Plugin compatibility is not fully verified.')), document.body) : null)
}

// Account seat of the Settings trigger: the visible label stays for assistive tech only.
export function YouAvatar() {
  return h('span', { className: 'bt-you-wrap' },
    h('span', { className: 'bt-you', 'aria-hidden': true }, h(BotMark, { look: MAIN_LOOK, size: 24 })),
    h('span', { style: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, t('Settings')))
}

let openShellSettings = null
let openShellOnboarding = null
let shellShortcuts = null

export function holdShellShortcuts(shortcuts) {
  shellShortcuts = shortcuts
  return () => { if (shellShortcuts === shortcuts) shellShortcuts = null }
}

// DeepSeek Harness hands its settings opener only to the settings.launcher seat. When
// the Desktop's account menu holds that seat, its first item (Settings) is the way in;
// the Desktop on Windows and macOS takes shortcuts natively, so a synthetic key press
// reaches the shell only where the page delivers them (the Web, Linux).
export function openHarnessSettings() {
  // A frame first, so a Bot dialog that closes on this click leaves the modal stack.
  requestAnimationFrame(() => {
    if (openShellSettings) { openShellSettings(); return }
    const desktop = document.querySelector('button[aria-haspopup="menu"][data-signed-out]')
    if (desktop) openThroughMenu(desktop)
    else pressSettingsShortcut()
  })
}

// Opens one of the shell's own onboarding editors, such as the DeepSeek API key form.
export function openHarnessOnboarding(id) {
  requestAnimationFrame(() => {
    if (openShellOnboarding) openShellOnboarding(id)
    else openHarnessSettings()
  })
}

function openThroughMenu(trigger) {
  const before = new Set(document.querySelectorAll('[role="menu"]'))
  trigger.click()
  let frames = 0
  const look = () => {
    const menu = [...document.querySelectorAll('[role="menu"]')].find(node => !before.has(node))
    const item = menu?.querySelector('button[role="menuitem"]')
    if (item) item.click()
    else if (++frames < 30) requestAnimationFrame(look)
    else pressSettingsShortcut()
  }
  requestAnimationFrame(look)
}

function pressSettingsShortcut() {
  const binding = shellShortcuts?.catalog.getSnapshot().find(row => row.id === 'settings.open')?.binding
  if (!binding) return
  const held = new Set(binding.modifiers)
  window.dispatchEvent(new KeyboardEvent('keydown', {
    code: binding.code, key: binding.code === 'Comma' ? ',' : '', bubbles: true, cancelable: true,
    ctrlKey: held.has('control'), altKey: held.has('alt'), shiftKey: held.has('shift'), metaKey: held.has('meta'),
  }))
}

// The footer avatar opens an account menu above itself, with Bot settings as one
// entry. Shell panels hidden from the Bot sidebar (plugins, automation) live here too.
// `seat` is the shell's settings.launcher seat: at priority -10 the whale wins it
// over a shell account plugin's own launcher (the Desktop's "··· More"), which comes
// back in Agent mode; FooterAccount stands in while no seat exists at all.
export function AccountLauncher({ seat = true, settingsOpen, openSettings, openOnboarding, actions, usePanelInfo }) {
  const canvasActive = usePanelInfo(value => value.activePanelId === CANVAS_PANEL)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    if (!seat) return undefined
    actions.seatAccount(true)
    return () => actions.seatAccount(false)
  }, [seat])
  const [box, setBox] = useState(null)
  const button = useRef(null)
  useEffect(() => { if (settingsOpen) setOpen(false) }, [settingsOpen])
  // The settings dialog links back to the shell's own settings (models, providers).
  useEffect(() => {
    if (!openSettings) return undefined
    openShellSettings = openSettings
    return () => { if (openShellSettings === openSettings) openShellSettings = null }
  }, [openSettings])
  useEffect(() => {
    if (!openOnboarding) return undefined
    openShellOnboarding = openOnboarding
    return () => { if (openShellOnboarding === openOnboarding) openShellOnboarding = null }
  }, [openOnboarding])
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (event.target instanceof Element && (event.target.closest('.bt-account-menu') || button.current?.contains(event.target))) return
      setOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus() } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])
  const toggle = () => {
    const rect = button.current?.getBoundingClientRect()
    if (rect) setBox({ left: rect.left, bottom: window.innerHeight - rect.top + 5 })
    setOpen(value => !value)
  }
  const groups = [
    [
      [t('Usage'), GaugeIcon, () => actions.openSettings('usage')],
      [t('Connectors'), ConnectorIcon, () => actions.openConnectors()],
      [t('Automation tasks'), ClockIcon, () => actions.selectPanel('schedules')],
      [t('Bot settings'), GearIcon, () => actions.openSettings('general')],
    ],
    [
      [t('Switch to classic Agent mode'), SwitchIcon, () => actions.setSurface('agent')],
    ],
  ]
  if (canvasActive) return null
  return h(Fragment, null,
    h('button', { ref: button, type: 'button', className: 'bt-account', 'aria-label': t('Account'), 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: toggle },
      h('span', { className: 'bt-you', 'aria-hidden': true }, h(BotMark, { look: MAIN_LOOK, size: 24 }))),
    open && box ? createPortal(h('div', { className: 'bt-menu bt-menu-up bt-account-menu', role: 'menu', 'aria-label': t('Account'), style: box },
      groups.map((group, index) => h(Fragment, { key: index },
        index > 0 ? h('div', { className: 'bt-menu-sep', role: 'separator' }) : null,
        group.map(([label, Icon, run, hint]) => h('button', {
          key: label, type: 'button', role: 'menuitem',
          onClick: () => { setOpen(false); void Promise.resolve(run()).catch(error => actions.reportError(error, 'menu')) },
        }, h(Icon), h('span', { className: 'bt-menu-label' }, label), hint ? h('span', { className: 'bt-menu-hint' }, hint) : null))))), document.body) : null)
}

// Opens the Main Bot whenever the main view holds no Bot conversation, the way
// The view always lands on a Bot rather than an empty New Session page.
// When a Bot's chat moves on to a fresh part, the shell clears the view of the part
// it archived; the chat then goes on in the Bot's current part instead.
function useLandOnMainBot(roster, useSessions, actions, canvasActive) {
  const mainView = useSessions((list) => {
    const row = Object.values(list.byId).find(session => (session?.retainedBy?.mainView ?? 0) > 0)
    return row ? `${row.id}|${row.blank ? 1 : 0}` : ''
  })
  const lastBot = useRef(null)
  useEffect(() => {
    // The retained main view is hidden behind the canvas and must not navigate it.
    if (canvasActive) { lastBot.current = null; return undefined }
    if (!roster.ready || !roster.mainBotId) return undefined
    const [id, blank] = mainView.split('|')
    const bot = id === '' ? undefined : roster.byId[id]
    if (bot !== undefined) {
      lastBot.current = { botId: bot.id, sessionId: id }
      if (currentPart(bot) !== id) actions.landOn(bot.id)
      return undefined
    }
    // A DSH Agent Session, blank or not, is a real destination: it stays.
    if (id !== '' && (roster.roomsById[id] || (actions.isAgentSession?.(id) ?? roster.agentOf[id] !== undefined) || blank !== '1')) {
      lastBot.current = null
      return undefined
    }
    const last = lastBot.current
    const timer = setTimeout(() => actions.landOn(roster.mainBotId, last), last ? 0 : 400)
    return () => clearTimeout(timer)
  }, [mainView, roster, canvasActive])
}

export function FooterAccount(props) {
  const seated = props.useUi(value => value.accountSeated === true)
  if (seated) return null
  return h('span', { className: 'bt-foot-account' }, h(AccountLauncher, { ...props, seat: false }))
}

// The only entry registered in every mode: in Agent mode the whole Bot surface is
// withdrawn, and this button in the shell's own footer is the way back.
export function BotReturn({ wide, useSurface, actions }) {
  const mode = useSurface(value => value.mode)
  if (mode !== 'agent') return null
  return h('button', { type: 'button', className: 'bt-return', 'aria-label': t('DS Bot'), title: t('DS Bot'), onClick: () => actions.setSurface('bot') },
    h(BotMark, { look: MAIN_LOOK, size: 20 }),
    wide ? h('span', { className: 'bt-return-name' }, t('DS Bot')) : null)
}

// Agent mode has none of the shell-group styles, so the return button carries its own.
export const RETURN_CSS = `
.bt-return{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:none;color:inherit;font:inherit;font-size:14px;line-height:20px;cursor:pointer;transition:background-color .12s ease}
.bt-return:hover{background:rgba(127,127,127,.14)}
.bt-return:active{transform:scale(.96)}
.bt-return .bt-mark{display:inline-flex;flex:none;line-height:0}
.bt-return .bt-mark svg{width:100%;height:100%;overflow:visible}
/* Shell styles carry --bt-ink-deepseek and Agent mode withdraws them; pin it here. */
.bt-return .bt-mark{--bt-ink-deepseek:#4D6BFE}
.bt-return-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

export function BrandMark({ size = 24 }) {
  return h('span', { className: 'bt-brand-whale' }, h(BotMark, { look: MAIN_LOOK, size }))
}
export function BrandName() {
  return h('span', { style: { fontWeight: 600, fontSize: 14 } }, 'DS Bot')
}

// With the whale holding the settings seat, the footer row is just the account menu
// and Connect plugins; FooterAccount only shows when the seat went to no one. The
// shell's footer classes are CSS-module names, so they match on their stems.
export const SIDEBAR_CSS = `
${FLOATING_TEAM_CSS}
${TEAM_AGENT_CHAT_CSS}
${CHAT_POPOUT_CSS}
.bt-side-top .bt-brand{cursor:default;padding-left:6px}
.bt-side-top .bt-brand:hover{background:none}
.bt-brand .bt-mark{flex:none}
.bt-pin{flex:none;display:inline-flex;color:var(--bt-ink-3)}
.bt-rail .bt-row{position:relative}
.bt-rail .bt-pin{position:absolute;top:3px;left:calc(50% + 12px)}
.bt-side .bt-read-only{margin:4px 8px 6px;padding:8px 10px;border-radius:10px;background:var(--bt-hover);font-size:12px;line-height:1.45;text-align:left}
[class*="_footArea"]:has(.bt-foot-account){display:flex!important;flex-direction:row!important;align-items:center;gap:6px}
[class*="_footArea"]:has(.bt-foot-account)>[class*="_footerActions"],[class*="_footArea"]:has(.bt-foot-account)>[class*="_footerActions"]>div{display:contents!important}
.bt-foot-account{order:-1;flex:none;display:inline-flex}
[class*="_footArea"]:has(.bt-foot-account) .bt-connect-foot{order:0;flex:1 1 auto;min-width:0;width:auto}
[class*="_footArea"]:has(.bt-foot-account)>[class*="_settingsArea"]{order:1;flex:none}
[class*="_footArea"]:has(.bt-foot-account)>[class*="_settingsArea"] button[class*="_trigger"] [class*="_label"]{display:none!important}

/* The update cloud springs in when a newer DS Bot shows up; its arrow drops in a
   loop while the install runs. */
.bt-round.bt-update{position:relative;color:var(--bt-accent,#4D6BFE);animation:bt-update-in ${SPRING_SHAPE.duration}ms ${SPRING_SHAPE.easing}}
.bt-round.bt-update svg{width:17px;height:17px}
.bt-round.bt-update[data-phase=installed]{color:var(--bt-ink-2)}
@keyframes bt-update-in{from{opacity:0;transform:scale(.6);filter:blur(4px)}}
.bt-update[data-phase=installing] .bt-cloud-arrow{animation:bt-cloud-drop 1.1s cubic-bezier(.45,0,.55,1) infinite}
@keyframes bt-cloud-drop{0%{transform:translateY(-3px);opacity:0}35%{opacity:1}70%{transform:translateY(1px);opacity:1}100%{transform:translateY(2px);opacity:0}}
.bt-update-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#E5484D;box-shadow:0 0 0 1.5px var(--bt-sidebar)}
.bt-update-pop{position:fixed;z-index:60;width:280px;padding:14px 14px 12px;border-radius:14px;background:var(--bt-main);border:.5px solid var(--bt-line-2);box-shadow:0 10px 20px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);color:var(--bt-ink);box-sizing:border-box;transform-origin:top left;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;animation:bt-update-pop ${SPRING_SHAPE.duration}ms ${SPRING_SHAPE.easing}}
@keyframes bt-update-pop{from{opacity:0;transform:scale(.96);filter:blur(4px)}}
.bt-update-title{font-size:14px;line-height:20px;font-weight:600}
.bt-update-text{margin-top:2px;font-size:12.5px;line-height:18px;color:var(--bt-ink-2)}
.bt-update-error{margin-top:8px;font-size:12px;line-height:17px;color:#c21d2e;overflow-wrap:anywhere;max-height:90px;overflow:auto}
.bt-update-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px}
.bt-update-notes{margin-right:auto;font-size:12.5px;color:var(--bt-ink-2);text-decoration:none}
.bt-update-notes:hover{color:var(--bt-ink);text-decoration:underline}
.bt-update-go{height:30px;padding:0 14px;border:0;border-radius:999px;background:var(--bt-accent,#4D6BFE);color:var(--bt-accent-ink,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .12s ease,transform .12s ease}
.bt-update-go:hover:not(:disabled){opacity:.9}
.bt-update-go:active:not(:disabled){transform:scale(.96)}
.bt-update-go:disabled{opacity:.6;cursor:default}
.bt-update-dsh:not(:first-child){margin-top:12px;padding-top:12px;border-top:.5px solid var(--bt-line-2)}
@media (prefers-reduced-motion:reduce){.bt-round.bt-update,.bt-update-pop,.bt-update .bt-cloud-arrow{animation:none}}

/* The DSH Agent row and its expanding Session list. The black whale is the
   harness's own mark, so the row reads as "plain dsh" next to the Bot marks. */
.bt-agent-ava{flex:none;width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--bt-hover);color:var(--bt-ink)}
.bt-agent-ava.bt-run{animation:bt-agent-pulse 1.4s ease-in-out infinite}
@keyframes bt-agent-pulse{0%,100%{opacity:1}50%{opacity:.55}}
.bt-agent-sub{display:grid;grid-template-rows:0fr;transition:grid-template-rows ${SPRING_SHAPE.duration}ms ${SPRING_SHAPE.easing}}
.bt-agent-sub[data-open]{grid-template-rows:1fr}
.bt-agent-sub-in{overflow:hidden;min-height:0;margin-left:44px}
.bt-agent-sub-row{display:flex;align-items:center;gap:8px;width:100%;padding:5px 10px 5px 8px;border:0;border-radius:8px;background:none;color:var(--bt-ink-2);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.bt-agent-sub-row:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-agent-sub-row[aria-current=page]{background:var(--bt-hover);color:var(--bt-ink);font-weight:500}
.bt-agent-sub-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-agent-sub-time{flex:none;font-size:11px;color:var(--bt-ink-3)}
.bt-agent-new{color:var(--bt-ink-3)}
.bt-agent-new svg{width:14px;height:14px;flex:none}
.bt-agent-edit{padding:3px 10px 3px 4px}
.bt-agent-edit input{width:100%;border:0;border-radius:6px;background:var(--bt-hover);color:var(--bt-ink);font:inherit;font-size:13px;line-height:20px;padding:2px 8px;outline:none;box-shadow:inset 0 0 0 .5px var(--bt-line-2)}
.bt-agent-sub[data-open] .bt-agent-sub-row{animation:bt-agent-row-in .24s ease both;animation-delay:calc(var(--i, 0)*30ms)}
@keyframes bt-agent-row-in{from{opacity:0;filter:blur(4px)}to{opacity:1;filter:blur(0)}}
@media (prefers-reduced-motion:reduce){.bt-agent-sub{transition:none}.bt-agent-sub .bt-agent-sub-row{animation:none}}
`
