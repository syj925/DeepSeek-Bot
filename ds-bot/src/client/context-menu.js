import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isMainOf } from './sources.js'
import { currentPart } from './text.js'
import { GearIcon, PinIcon, UnreadIcon, PencilIcon, StarLineIcon, CopyIcon, HideIcon, TrashIcon, DuplicateIcon, MemoryIcon, ClockIcon, PlusIcon, ChatsIcon, PeopleIcon, CalendarIcon, ChevronRightIcon, SlidersIcon } from './icons.js'
import { toggleSpatialWidget } from './spatial-widgets.js'
import { setWidgetHidden } from './desktop-widgets.js'
import { collapseWindow } from './canvas-state.js'
import { GlobeIcon } from './browser-pane.js'
import { useEscape } from './overlay-hooks.js'
import { t } from './i18n.js'

const RefreshIcon = () => h('svg', { width: 15, height: 15, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
  h('path', { d: 'M3.5 10a6.5 6.5 0 0 1 11.5-4.2L17 7.5' }),
  h('path', { d: 'M17 3v4.5h-4.5' }),
  h('path', { d: 'M16.5 10a6.5 6.5 0 0 1-11.5 4.2L3 12.5' }),
  h('path', { d: 'M3 17v-4.5h4.5' }))

const WallpaperIcon = () => h('svg', { width: 15, height: 15, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
  h('rect', { x: 3, y: 3, width: 14, height: 14, rx: 2.5 }),
  h('circle', { cx: 7.5, cy: 7.5, r: 1.5 }),
  h('path', { d: 'M17 13l-4-4-6 6' }))

function CanvasContextMenu({ menu, actions, leaving }) {
  const ref = useRef(null)
  const [place, setPlace] = useState({ left: menu.x, top: menu.y })
  const [activeSubmenu, setActiveSubmenu] = useState(null)
  const timeoutRef = useRef(null)
  const submenuRef = useRef(null)
  const newRef = useRef(null)
  const [submenuPlace, setSubmenuPlace] = useState({ left: '100%', top: 0 })

  useEffect(() => () => clearTimeout(timeoutRef.current), [])
  useLayoutEffect(() => {
    const parent = ref.current
    const submenu = submenuRef.current
    const trigger = newRef.current
    if (!parent || !submenu || !trigger) return
    const box = parent.getBoundingClientRect()
    const width = submenu.offsetWidth, height = submenu.offsetHeight
    const right = box.right + 4
    const x = right + width <= window.innerWidth - 8 ? right : Math.max(8, box.left - width - 4)
    const y = Math.max(8, Math.min(box.top + trigger.offsetTop, window.innerHeight - height - 8))
    // Absolute children use the parent's padding box, not viewport coordinates.
    setSubmenuPlace({ left: x - box.left - parent.clientLeft, top: y - box.top - parent.clientTop })
  }, [activeSubmenu, place.left, place.top])

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPlace({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - ref.current.offsetWidth - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - ref.current.offsetHeight - 8)),
    })
  }, [menu.x, menu.y])

  const setSubmenu = name => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setActiveSubmenu(name)
  }

  const delayedCloseSubmenu = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setActiveSubmenu(null), 250)
  }

  const run = fn => {
    actions.closeMenu()
    if (fn) fn()
  }

  const newItems = [
    [t('Create employee'), PlusIcon, () => actions.openNewChat('create')],
    [t(menu.createSelectedGroup ? 'Create group with selected' : 'Create group chat'), ChatsIcon, menu.createSelectedGroup ?? (() => actions.openNewChat('group'))],
    [t('Employee directory'), PeopleIcon, () => actions.openNewChat('chat')],
    ...(menu.createEmptyGroup ? [[t('New empty group'), PlusIcon, menu.createEmptyGroup]] : []),
  ]

  return h('div', {
    ref,
    className: 'bt-menu bt-canvas-menu',
    role: 'menu',
    'aria-label': t('Canvas options'),
    style: place,
    'data-leaving': leaving || undefined,
    onMouseLeave: delayedCloseSubmenu,
  },
    h('button', {
      type: 'button', role: 'menuitem', className: 'bt-menu-item', ref: newRef,
      'data-active': activeSubmenu === 'new' || undefined,
      onMouseEnter: () => setSubmenu('new'), onClick: () => setActiveSubmenu(v => v === 'new' ? null : 'new'),
    }, h(PlusIcon), h('span', { className: 'bt-menu-label' }, t('New…')), h(ChevronRightIcon, { className: 'bt-menu-chevron' })),
    ...[
      [t('Auto arrange cards'), SlidersIcon, () => actions.arrangeCanvasCards()],
      [t('Reset canvas view'), RefreshIcon, () => actions.updateCanvas(c => ({ ...c, viewport: { x: 0, y: 0, zoom: 1 } }))],
      [t('Agenda'), CalendarIcon, () => toggleSpatialWidget('agenda')],
      [t('Personalize'), WallpaperIcon, () => window.dispatchEvent(new CustomEvent('ds-bot:open-wallpaper'))],
      [t('Display settings'), GearIcon, () => actions.openSettings()],
    ].map(([label, Icon, action], index) => h(Fragment, { key: label },
      index === 2 || index === 4 ? h('div', { className: 'bt-menu-sep', role: 'separator' }) : null,
      h('button', { type: 'button', role: 'menuitem', className: 'bt-menu-item', onMouseEnter: () => setSubmenu(null), onClick: () => run(action) },
        h(Icon), h('span', { className: 'bt-menu-label' }, label)))),

    activeSubmenu === 'new' ? h('div', {
      className: 'bt-menu bt-canvas-menu-submenu',
      ref: submenuRef, style: submenuPlace,
      onMouseEnter: () => setSubmenu('new'),
      onMouseLeave: delayedCloseSubmenu,
    },
      newItems.map(([label, Icon, action]) => h('button', {
        key: label,
        type: 'button',
        className: 'bt-menu-item',
        onClick: () => run(action),
      }, h(Icon), h('span', { className: 'bt-menu-label' }, label)))) : null
  )
}

export function ContextMenu({ menu, roster, actions, leaving = false }) {
  useEscape(() => actions.closeMenu())
  useEffect(() => {
    const onDown = (event) => { if (!(event.target instanceof Element) || !event.target.closest('.bt-menu')) actions.closeMenu() }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [])
  const ref = useRef(null)
  const [place, setPlace] = useState({ left: menu.x, top: menu.y })
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPlace({ left: Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8)) })
  }, [menu.x, menu.y])
  if (menu.kind === 'canvas') return h(CanvasContextMenu, { menu, roster, actions, leaving })
  if (menu.kind === 'agent' || menu.kind === 'agent-session') return h(AgentMenu, { menu, roster, actions, leaving })
  if (menu.kind === 'widget') return h('div', { ref, className: 'bt-menu', role: 'menu', style: place, 'aria-label': t('Widget options'), 'data-leaving': leaving || undefined },
    h('button', { type: 'button', role: 'menuitem', onClick: () => { actions.closeMenu(); setWidgetHidden(menu.id, true) } }, h(TrashIcon), t('Remove widget')))
  if (menu.kind === 'team-new') {
    const items = [
      [t('Create employee'), PlusIcon, () => actions.openNewChat('create')],
      [t('Create group chat'), ChatsIcon, () => actions.openNewChat('group')],
      [t('New chat'), PeopleIcon, () => actions.openNewChat('new')],
      [t('Task notifications'), ClockIcon, () => actions.toggleTaskNotices()],
    ]
    return h('div', {
      ref,
      className: 'bt-menu bt-canvas-menu',
      role: 'menu',
      'aria-label': t('New…'),
      style: place,
      'data-leaving': leaving || undefined,
    },
      items.map(([label, Icon, run]) => h('button', {
        key: label,
        type: 'button',
        role: 'menuitem',
        className: 'bt-menu-item',
        onClick: () => {
          actions.closeMenu()
          if (run) run()
        },
      }, h(Icon), h('span', { className: 'bt-menu-label' }, label))))
  }
  const bot = roster.byId[menu.id]
  const room = roster.roomsById[menu.id]
  const entry = bot ?? room
  if (entry === undefined) return null
  const isMainBot = isMainOf(roster, menu.id)
  const isTile = roster.mainBotId === menu.id
  const mainCount = (roster.mainBotIds ?? []).length
  const groups = [
    ...(menu.canvasWindowId ? [[[t('Remove from desktop'), TrashIcon, () => actions.updateCanvas(state => collapseWindow(state, menu.canvasWindowId))]]] : []),
    [
      [t(bot ? 'Employee settings' : 'Group settings'), GearIcon, () => actions.openSettings(bot ? 'bots' : 'groups', entry.id)],
      bot && roster.memory !== false ? [t('Memory'), MemoryIcon, () => actions.openMemory(bot.id)] : null,
      [t('Scheduled tasks'), ClockIcon, () => actions.openSettings('schedules', entry.id)],
      bot && roster.browser === true && actions.openBrowser ? [t('Open browser'), GlobeIcon, () => actions.openBrowser(bot.id)] : null,
    ],
    [
      isTile ? null : [entry.pinned ? t('Unpin') : t('Pin'), PinIcon, () => actions.setFlags(menu.id, { pinned: !entry.pinned })],
      [t('Mark as Unread'), UnreadIcon, () => actions.markUnread(menu.id)],
    ],
    [
      bot ? [t('Rename Bot'), PencilIcon, () => actions.renameBot(bot.id)] : null,
      room ? [t('Rename group'), PencilIcon, () => actions.renameBot(room.id)] : null,
      bot && !bot.generalAssistant ? [t('Duplicate'), DuplicateIcon, async () => { const copy = await actions.duplicateBot(bot.id); actions.openSession(copy.id) }] : null,
      bot && !isMainBot ? [t('Make Main Bot'), StarLineIcon, () => actions.setMain(bot.id, true)] : null,
      bot && isMainBot && mainCount > 1 ? [t('Remove Main Bot role'), StarLineIcon, () => actions.setMain(bot.id, false)] : null,
    ],
    [[t('Copy conversation ID'), CopyIcon, () => navigator.clipboard?.writeText(bot ? currentPart(bot) : menu.id)]],
    [
      isMainBot ? null : [t('Hide from sidebar'), HideIcon, () => actions.setFlags(menu.id, { hidden: true })],
      isMainBot ? null : [room ? t('Delete group') : t('Delete'), TrashIcon, () => (bot ? actions.deleteBot(bot.id) : actions.deleteRoom(menu.id)), true],
    ],
  ].map(group => group.filter(Boolean)).filter(group => group.length > 0)
  return h('div', { ref, className: 'bt-menu', role: 'menu', 'aria-label': t('{name} actions', { name: bot?.name ?? room.name }), style: place, 'data-leaving': leaving || undefined },
    groups.map((group, index) => h(Fragment, { key: index },
      index > 0 ? h('div', { className: 'bt-menu-sep', role: 'separator' }) : null,
      group.map(([label, Icon, run, danger]) => h('button', {
        key: label, type: 'button', role: 'menuitem', className: danger ? 'bt-danger' : undefined,
        onClick: () => { actions.closeMenu(); void Promise.resolve(run()).catch(error => actions.reportError(error, 'menu')) },
      }, h(Icon), label)))))
}

// Menus for the DSH Agent row and its Sessions; none of the Bot entries apply.
function AgentMenu({ menu, roster, actions, leaving }) {
  const ref = useRef(null)
  const [place, setPlace] = useState({ left: menu.x, top: menu.y })
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPlace({ left: Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8)) })
  }, [menu.x, menu.y])
  const agent = roster.agentsById[menu.kind === 'agent' ? menu.id : menu.agentId]
  if (agent === undefined) return null
  const groups = menu.kind === 'agent'
    ? [
        [
          [agent.pinned ? t('Unpin') : t('Pin'), PinIcon, () => actions.setFlags(agent.id, { pinned: !agent.pinned })],
        ],
        [
          [t('Remove DSH Agent'), TrashIcon, () => actions.removeAgent(agent.id), true],
        ],
      ]
    : [
        [
          [t('Rename'), PencilIcon, () => actions.beginAgentRename(menu.id)],
        ],
        [
          [t('Archive'), TrashIcon, () => actions.archiveAgentSession(agent.id, menu.id), true],
        ],
      ]
  return h('div', { ref, className: 'bt-menu', role: 'menu', 'aria-label': menu.kind === 'agent' ? 'DSH Agent' : t('Session actions'), style: place, 'data-leaving': leaving || undefined },
    groups.map((group, index) => h(Fragment, { key: index },
      index > 0 ? h('div', { className: 'bt-menu-sep', role: 'separator' }) : null,
      group.map(([label, Icon, run, danger]) => h('button', {
        key: label, type: 'button', role: 'menuitem', className: danger ? 'bt-danger' : undefined,
        onClick: () => { actions.closeMenu(); void Promise.resolve(run()).catch(error => console.warn('[ds-bot]', error)) },
      }, h(Icon), label)))))
}
