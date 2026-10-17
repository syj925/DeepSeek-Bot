import { createElement as h, useMemo, useRef, useState } from 'react'
import { BotAvatar, RoomAvatar } from './mark.js'
import { ChatsIcon, FolderIcon } from './icons.js'
import { isMainOf } from './sources.js'
import { useMainAgentDrag } from './main-agent-drag.js'
import { t } from './i18n.js'

const EMPTY_WORK = { bots: {}, rooms: {}, approvals: [] }

function entityState(entity, work = EMPTY_WORK) {
  const waiting = (work.approvals ?? []).some(entry => entry.botId === entity.id || entry.roomId === entity.id)
  const working = entity.kind === 'room'
    ? (work.rooms?.[entity.id]?.length ?? 0) > 0
    : Boolean(work.bots?.[entity.id]) || Object.values(work.rooms ?? {}).some(entries => entries.some(entry => entry.botId === entity.id))
  return waiting ? 'waiting' : working ? 'working' : 'available'
}

function stateLabel(state) {
  return state === 'waiting' ? t('Waiting for your approval') : state === 'working' ? t('Working') : t('Available')
}

function teamFor(entity, roster) {
  if (entity.generalAssistant) return { id: 'assistant', name: t('General Assistant'), purpose: t('Coordinates your teams') }
  const team = (roster.teams ?? []).find(value => value.id === entity.teamId || value.members?.includes(entity.id) || value.roomId === entity.id)
  return team ? { id: team.id, name: team.name, purpose: team.purpose } : { id: 'independent', name: t('Independent employees'), purpose: t('Employees without a department') }
}

function groupEntities(entities, roster) {
  const groups = new Map()
  for (const entity of entities) {
    const team = teamFor(entity, roster)
    if (!groups.has(team.id)) groups.set(team.id, { ...team, entities: [] })
    groups.get(team.id).entities.push(entity)
  }
  return [...groups.values()].sort((a, b) => (a.id === 'assistant' ? -1 : b.id === 'assistant' ? 1 : a.id === 'independent' ? 1 : b.id === 'independent' ? -1 : a.name.localeCompare(b.name)))
}

function DockIcon({ entity, roster, active, state }) {
  return h('span', { className: 'bt-agent-dock-icon', 'data-state': state, 'data-active': active || undefined },
    entity.kind === 'room' ? h(RoomAvatar, { room: entity, roster, size: 42 }) : h(BotAvatar, { bot: entity, size: 42, main: isMainOf(roster, entity.id), admin: entity.generalAssistant }),
    state === 'working' ? h('i', { className: 'bt-agent-dock-pulse', 'aria-hidden': true }) : null,
    state === 'waiting' ? h('i', { className: 'bt-agent-dock-alert', 'aria-hidden': true }, '!') : null)
}

function DockPopover({ entity, roster, group, work, actions, size, onClose, onOpen, style }) {
  const state = entityState(entity, work)
  const coworkers = group.entities.filter(value => value.id !== entity.id).slice(0, 5)
  const open = () => { actions.openCanvasEntity(entity.id, size); onClose() }
  const place = () => {
    if (entity.kind === 'bot') actions.placeCanvasMain(entity.id, { x: Math.max(48, size.width / 2 - 60), y: Math.max(100, size.height / 2 - 56) })
    else actions.openCanvasEntity(entity.id, size)
    onClose()
  }
  return h('div', { className: 'bt-agent-dock-popover', style, role: 'dialog', 'aria-label': entity.name, onPointerDown: event => event.stopPropagation(), onPointerEnter: () => onOpen(entity.id), onPointerLeave: onClose },
    h('div', { className: 'bt-agent-dock-popover-head' },
      h(DockIcon, { entity, roster, active: true, state }),
      h('div', { className: 'bt-agent-dock-popover-title' },
        h('strong', null, entity.name),
        h('span', { 'data-state': state }, stateLabel(state)),
        h('small', null, group.name))),
    group.purpose ? h('p', { className: 'bt-agent-dock-purpose' }, group.purpose) : null,
    coworkers.length > 0 ? h('div', { className: 'bt-agent-dock-coworkers' },
      h('span', { className: 'bt-agent-dock-section-label' }, t('Department members')),
      coworkers.map(value => h('button', { type: 'button', key: value.id, className: 'bt-agent-dock-coworker', onClick: () => actions.openCanvasEntity(value.id, size) },
        value.kind === 'room' ? h(RoomAvatar, { room: value, roster, size: 24 }) : h(BotAvatar, { bot: value, size: 24, main: isMainOf(roster, value.id) }),
        h('span', null, value.name)))) : null,
    h('div', { className: 'bt-agent-dock-actions' },
      h('button', { type: 'button', className: 'bt-agent-dock-action bt-agent-dock-action-primary', onClick: open }, h(ChatsIcon), t('Open conversation')),
      h('button', { type: 'button', className: 'bt-agent-dock-action', onClick: place }, h(FolderIcon), t('Place on canvas'))))
}

function DockItem({ entity, group, roster, visible, work, actions, size, activeId, pointerX, distance, onOpen, onClose }) {
  const ref = useRef(null)
  const [hovered, setHovered] = useState(false)
  const dragProps = useMainAgentDrag(entity.kind === 'bot', entity.kind === 'bot' ? entity.id : '')
  const state = entityState(entity, work)
  const center = ref.current ? ref.current.getBoundingClientRect().left + ref.current.getBoundingClientRect().width / 2 : 0
  const proximity = pointerX === null || center === 0 ? 0 : Math.max(0, 1 - Math.abs(pointerX - center) / distance)
  const scale = 1 + proximity * 0.28
  const active = visible.some(window => window.entityId === entity.id && window.id === activeId)
  const bounds = ref.current?.getBoundingClientRect()
  const popoverStyle = bounds ? { left: bounds.left + bounds.width / 2, bottom: (globalThis.innerHeight ?? 800) - bounds.top + 12 } : undefined
  return h('div', { ref, className: 'bt-agent-dock-slot', style: { '--bt-dock-scale': scale }, onPointerEnter: () => { setHovered(true); onOpen(entity.id) }, onPointerLeave: () => { setHovered(false); onClose() } },
    h('button', { type: 'button', className: 'bt-agent-dock-item bt-canvas-button', title: entity.name, 'aria-label': entity.name, 'aria-pressed': active, draggable: false, onClick: () => actions.openCanvasEntity(entity.id, size), onContextMenu: event => { event.preventDefault(); onOpen(entity.id) }, onDoubleClick: () => onOpen(entity.id), ...dragProps },
      h(DockIcon, { entity, roster, active, state }),
      h('span', { className: 'bt-agent-dock-label bt-row-title' }, entity.name),
      hovered ? h('span', { className: 'bt-agent-dock-status', 'data-state': state }, stateLabel(state)) : null),
    entity.id === actions.hoveredDockEntity ? h(DockPopover, { entity, group, roster, work, actions, size, onClose, onOpen, style: popoverStyle }) : null)
}

export function AgentDock({ entities, roster, visible, work = EMPTY_WORK, actions, size, activeId }) {
  const [pointerX, setPointerX] = useState(null)
  const [popover, setPopover] = useState(null)
  const closeTimer = useRef(null)
  const groups = useMemo(() => groupEntities(entities, roster), [entities, roster])
  const distance = 160
  const openPopover = id => {
    clearTimeout(closeTimer.current)
    closeTimer.current = null
    setPopover(id)
  }
  const closePopover = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setPopover(null), 180)
  }
  const dockActions = { ...actions, hoveredDockEntity: popover }
  return h('nav', { className: 'bt-canvas-dock bt-agent-dock', 'aria-label': t('Employees and group chats'), onPointerMove: event => setPointerX(event.clientX), onPointerLeave: () => setPointerX(null) },
    h('div', { className: 'bt-agent-dock-inner' },
      groups.map(group => h('div', { className: 'bt-agent-dock-group', key: group.id },
        h('span', { className: 'bt-agent-dock-group-label' }, group.name),
        group.entities.map(entity => h(DockItem, { key: entity.id, entity, group, roster, visible, work, actions: dockActions, size, activeId, pointerX, distance, onOpen: openPopover, onClose: closePopover }))))))
}

export const AGENT_DOCK_CSS = `
.bt-agent-dock{left:50%;bottom:18px;display:flex;align-items:flex-end;width:auto;max-width:calc(100% - 32px);padding:8px 10px;border-radius:22px;transform:translateX(-50%);overflow:visible;z-index:34}
.bt-agent-dock-inner{display:flex;align-items:flex-end;gap:12px;max-width:min(900px,calc(100vw - 64px));overflow-x:auto;overflow-y:visible;padding:12px 8px 3px;scrollbar-width:thin}
.bt-agent-dock-group{display:flex;align-items:flex-end;gap:5px;position:relative;padding:0 8px;border-left:1px solid var(--bt-line-2)}
.bt-agent-dock-group:first-child{border-left:0}
.bt-agent-dock-group-label{position:absolute;left:10px;bottom:calc(100% + 4px);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-3);font-size:9px;letter-spacing:.04em;text-transform:uppercase;pointer-events:none}
.bt-agent-dock-slot{position:relative;display:flex;align-items:flex-end;justify-content:center;width:58px;height:62px;flex:none}
.bt-agent-dock-item{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;width:58px;height:62px;padding:0 2px;border:0;border-radius:16px;background:transparent;color:var(--bt-ink);cursor:pointer;transform:scale(var(--bt-dock-scale,1));transform-origin:bottom center;transition:transform .22s cubic-bezier(.16,1,.3,1),background .16s ease;z-index:1}
.bt-agent-dock-item:hover,.bt-agent-dock-item[aria-pressed=true]{background:color-mix(in srgb,var(--bt-hover) 74%,transparent)}
.bt-agent-dock-icon{position:relative;display:grid;place-items:center;width:44px;height:44px;filter:drop-shadow(0 6px 10px rgba(24,30,36,.15));transition:filter .18s ease}
.bt-agent-dock-item:hover .bt-agent-dock-icon{filter:drop-shadow(0 8px 14px rgba(24,30,36,.22))}
.bt-agent-dock-label{display:block;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;line-height:13px;color:var(--bt-ink-2)}
.bt-agent-dock-status{position:absolute;top:-13px;left:50%;padding:2px 5px;border:1px solid var(--bt-line);border-radius:999px;background:var(--bt-canvas-chrome);color:var(--bt-ink-3);font-size:8px;white-space:nowrap;transform:translateX(-50%);box-shadow:var(--bt-canvas-shadow);pointer-events:none}
.bt-agent-dock-status[data-state=working]{color:#287e70}.bt-agent-dock-status[data-state=waiting]{color:#aa7017}
.bt-agent-dock-pulse,.bt-agent-dock-alert{position:absolute;right:0;top:0;display:grid;place-items:center;width:13px;height:13px;border:2px solid var(--bt-canvas-chrome);border-radius:50%;background:#62c7b0;box-shadow:0 2px 6px rgba(30,90,80,.25)}
.bt-agent-dock-pulse{animation:bt-agent-dock-pulse 1.5s ease-in-out infinite}.bt-agent-dock-alert{background:#e4a247;color:#fff;font-size:9px;font-style:normal;font-weight:700}
@keyframes bt-agent-dock-pulse{0%,100%{box-shadow:0 0 0 0 rgba(98,199,176,.5)}50%{box-shadow:0 0 0 4px rgba(98,199,176,0)}}
.bt-agent-dock-popover{position:fixed;bottom:var(--bt-agent-dock-pop-bottom,120px);left:50%;width:254px;max-width:calc(100vw - 32px);padding:14px;border:1px solid var(--bt-canvas-border);border-radius:18px;background:var(--bt-canvas-chat);box-shadow:var(--bt-canvas-shadow);-webkit-backdrop-filter:blur(20px) saturate(125%);backdrop-filter:blur(20px);color:var(--bt-ink);transform:translateX(-50%);animation:bt-agent-dock-pop .18s cubic-bezier(.16,1,.3,1) both;z-index:200}
.bt-agent-dock-popover-head{display:flex;align-items:center;gap:10px}.bt-agent-dock-popover-title{display:flex;flex-direction:column;min-width:0;gap:2px}.bt-agent-dock-popover-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bt-agent-dock-popover-title span{font-size:10px;color:var(--bt-ink-3)}.bt-agent-dock-popover-title span[data-state=working]{color:#287e70}.bt-agent-dock-popover-title span[data-state=waiting]{color:#aa7017}.bt-agent-dock-popover-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-3);font-size:10px}
.bt-agent-dock-purpose{margin:10px 0 8px;color:var(--bt-ink-2);font-size:11px;line-height:1.45}.bt-agent-dock-section-label{display:block;margin-bottom:5px;color:var(--bt-ink-3);font-size:10px}.bt-agent-dock-coworkers{display:flex;flex-direction:column;gap:2px;padding-top:2px;border-top:1px solid var(--bt-line-2)}.bt-agent-dock-coworker{display:flex;align-items:center;gap:8px;width:100%;padding:5px 4px;border:0;border-radius:9px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:11px;text-align:left;cursor:pointer}.bt-agent-dock-coworker:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-agent-dock-actions{display:flex;gap:6px;margin-top:11px}.bt-agent-dock-action{display:flex;align-items:center;justify-content:center;gap:5px;flex:1;min-width:0;padding:7px 6px;border:1px solid var(--bt-line);border-radius:10px;background:var(--bt-canvas-button);color:var(--bt-ink-2);font:inherit;font-size:10px;cursor:pointer}.bt-agent-dock-action:hover{background:var(--bt-hover);color:var(--bt-ink)}.bt-agent-dock-action-primary{border-color:color-mix(in srgb,var(--bt-accent) 35%,var(--bt-line));color:var(--bt-ink)}.bt-agent-dock-action svg{width:13px;height:13px;flex:none}
@keyframes bt-agent-dock-pop{from{opacity:0;transform:translateX(-50%) translateY(8px) scale(.96)}}
@media(max-width:720px){.bt-agent-dock{bottom:10px;max-width:calc(100% - 16px)}.bt-agent-dock-inner{max-width:calc(100vw - 28px);gap:4px;padding-left:2px;padding-right:2px}.bt-agent-dock-group{padding:0 4px}.bt-agent-dock-popover{width:230px}}
@media(prefers-reduced-motion:reduce){.bt-agent-dock-item,.bt-agent-dock-popover{transition:none;animation:none}.bt-agent-dock-pulse{animation:none}}
@media(forced-colors:active){.bt-agent-dock,.bt-agent-dock-popover{background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}.bt-agent-dock-item:hover{background:Highlight;color:HighlightText}}
`
