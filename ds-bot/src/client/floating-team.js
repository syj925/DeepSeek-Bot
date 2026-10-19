import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STORAGE } from './storage.js'

export function readTeamPanel(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE.teamPanel))
    return { x: Number.isFinite(value?.x) ? value.x : 20, y: Number.isFinite(value?.y) ? value.y : 104, folded: value?.folded === true }
  } catch { return { x: 20, y: 104, folded: false } }
}

const panelTop = area => Math.max(12, Math.min(area.minY ?? 12, area.height - 68))
export function readChatWidth(storage = globalThis.localStorage) {
  try {
    const width = JSON.parse(storage.getItem(`${STORAGE.teamPanel}:chat`))?.width
    return Number.isFinite(width) ? Math.max(680, Math.min(2400, width)) : 860
  } catch { return 860 }
}
export function teamPanelWidth(panel, area) {
  return Math.max(0, Math.min(panel.maximized ? area.width - 24 : panel.folded ? 68 : panel.chatOpen ? Math.max(680, panel.chatWidth ?? 860) : 300, area.width - 24))
}
function panelHeight(panel, area) {
  if (panel.maximized) return Math.max(0, area.height - panelTop(area) - 12)
  return Math.max(0, Math.min(area.height - panelTop(area) - 12, panel.chatOpen ? Math.min(700, Math.max(480, area.height - 120)) : Math.min(640, Math.max(180, area.height - 176))))
}

export function fitTeamPanel(panel, area) {
  const width = teamPanelWidth(panel, area)
  const height = panelHeight(panel, area)
  if (panel.maximized) return { ...panel, x: 12, y: panelTop(area) }
  return { ...panel, x: Math.max(12, Math.min(panel.x, area.width - width - 12)), y: Math.max(panelTop(area), Math.min(panel.y, area.height - height - 12)) }
}

// The sidebar slot keeps the original list and footer occupants. Only its shell
// geometry changes in canvas mode; leaving that mode removes every owned style.
export function useFloatingTeam(enabled, root, chatOpen = false, chatClosing = false) {
  const activeChat = Boolean(chatOpen && !chatClosing)
  const [panel, setPanel] = useState(() => ({ ...readTeamPanel(), chatOpen: activeChat }))
  const [area, setArea] = useState({ width: 1200, height: 800, top: 0 })
  const [chatWidth, setChatWidth] = useState(readChatWidth)
  const [maximized, setMaximized] = useState(false)
  const [moving, setMoving] = useState(false)
  const drag = useRef(null)
  const resize = useRef(null)
  const widthChanged = useRef(false)

  const geometry = { ...panel, chatOpen: activeChat, chatWidth, maximized: activeChat && maximized }
  const current = fitTeamPanel(geometry, area)
  const panelWidth = teamPanelWidth(geometry, area)
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const column = root.current?.closest('[class*="_sidebarCol"]')
    const frame = column?.parentElement
    if (!frame) return undefined
    column.classList.add('bt-floating-team', 'team-panel')
    frame.classList.add('bt-canvas-frame')
    const center = frame.querySelector('[class*="_centerCol"]')
    const toolbar = root.current?.ownerDocument?.querySelector('.bt-canvas-toolbar')
    const measure = () => {
      const box = frame.getBoundingClientRect()
      const content = center?.getBoundingClientRect()
      const top = Math.max(0, (content?.top ?? box.top) - box.top)
      const width = content?.width ?? box.width
      const minY = width < 720 && toolbar ? toolbar.getBoundingClientRect().bottom - box.top - top + 68 : 12
      const next = { width, height: content?.height ?? box.height - top, top, minY }
      setArea(previous => Object.keys(next).every(key => Math.abs((previous[key] ?? 0) - next[key]) < .5) ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    if (center) observer.observe(center)
    if (toolbar) observer.observe(toolbar)
    measure()
    return () => {
      observer.disconnect()
      column.classList.remove('bt-floating-team', 'team-panel')
      frame.classList.remove('bt-canvas-frame')
      column.removeAttribute('data-folded')
      column.removeAttribute('data-chat-open')
      column.removeAttribute('data-chat-closing')
      column.removeAttribute('data-moving')
      column.removeAttribute('data-maximized')
      for (const name of ['--bt-team-x', '--bt-team-y', '--bt-team-height', '--bt-team-width', '--bt-team-chat-width']) column.style.removeProperty(name)
    }
  }, [enabled])
  useLayoutEffect(() => {
    if (!enabled) return
    const column = root.current?.closest('.bt-floating-team')
    if (!column) return
    column.dataset.folded = String(panel.folded)
    column.dataset.chatOpen = String(Boolean(activeChat))
    column.dataset.chatClosing = String(Boolean(chatClosing))
    column.dataset.moving = String(moving)
    column.dataset.maximized = String(geometry.maximized)
    column.style.setProperty('--bt-team-x', `${current.x}px`)
    column.style.setProperty('--bt-team-y', `${current.y + area.top}px`)
    column.style.setProperty('--bt-team-height', `${panelHeight(geometry, area)}px`)
    column.style.setProperty('--bt-team-width', `${panelWidth}px`)
    // Lay out the transcript once at its final width while the outer shell reveals it.
    // Keep this width during close, so every frame does not reflow long messages.
    if (activeChat) column.style.setProperty('--bt-team-chat-width', `${panelWidth}px`)
  }, [enabled, current.x, current.y, area.top, area.height, area.minY, panel.folded, panelWidth, activeChat, chatClosing, maximized, moving])
  useEffect(() => {
    if (!enabled || !widthChanged.current) return undefined
    const timer = setTimeout(() => {
      try { localStorage.setItem(`${STORAGE.teamPanel}:chat`, JSON.stringify({ width: chatWidth })) } catch { /* storage unavailable */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [enabled, chatWidth])
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE.teamPanel, JSON.stringify({ x: panel.x, y: panel.y, folded: panel.folded })) } catch { /* storage unavailable */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [enabled, panel.x, panel.y, panel.folded])
  const finish = event => {
    drag.current = null
    resize.current = null
    setMoving(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    folded: panel.folded,
    chatWidth: panelWidth,
    maximized: geometry.maximized,
    maximize: () => setMaximized(value => !value),
    expand: () => setPanel(value => value.folded ? { ...value, folded: false } : value),
    toggle: () => setPanel(value => ({ ...value, folded: !value.folded })),
    resizeChat: {
      onPointerDown: event => {
        if (event.button !== 0 || !activeChat || maximized) return
        event.preventDefault(); event.stopPropagation()
        resize.current = { x: event.clientX, width: panelWidth }
        setMoving(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: event => {
        if (!resize.current) return
        const next = Math.max(Math.min(680, area.width - current.x - 12), Math.min(area.width - current.x - 12, resize.current.width + event.clientX - resize.current.x))
        setChatWidth(next)
        widthChanged.current = true
        event.stopPropagation()
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: () => { resize.current = null; setMoving(false) },
      onKeyDown: event => {
        if (maximized || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        widthChanged.current = true
        setChatWidth(Math.max(680, Math.min(area.width - current.x - 12, panelWidth + (event.key === 'ArrowRight' ? 32 : -32))))
      },
    },
    handle: {
      onPointerDown: event => {
        if (event.button !== 0 || geometry.maximized) return
        event.preventDefault()
        event.stopPropagation()
        drag.current = { x: event.clientX, y: event.clientY, panel: current }
        setMoving(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: event => {
        if (!drag.current) return
        const start = drag.current
        const fitted = fitTeamPanel({ ...start.panel, x: start.panel.x + event.clientX - start.x, y: start.panel.y + event.clientY - start.y }, area)
        setPanel(value => ({ ...value, x: fitted.x, y: fitted.y }))
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: () => { drag.current = null; setMoving(false) },
      onKeyDown: event => {
        if (geometry.maximized) return
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
        if (!delta && event.key !== 'Home') return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 24 : 8
        setPanel(fitTeamPanel(event.key === 'Home' ? { ...current, x: 20, y: 104 } : { ...current, x: current.x + delta[0] * step, y: current.y + delta[1] * step }, area))
      },
    },
  }
}

export const FLOATING_TEAM_CSS = `
.bt-classic-return{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:38px;padding:8px 12px;border:1px solid rgba(255,255,255,.9);border-radius:12px;background:rgba(255,255,255,.85);color:#475569;font:inherit;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.03)}
.bt-classic-return svg{width:16px;height:16px;flex:none}
.bt-classic-return:hover{background:#fff;color:#172033}
.bt-floating-team [class*="_footArea"]>[class*="_settingsArea"],.bt-floating-team .bt-foot-account{display:none!important}
.bt-floating-team [class*="_footerActions"]{width:100%;flex:1}
.bt-floating-team[data-folded=true] .bt-classic-return span{display:none}
.bt-assistant-badge{flex:none;padding:1px 5px;border-radius:5px;background:rgba(16,163,127,.09);color:#16816b;font-size:10px;font-weight:500}
.bt-canvas-frame>[class*="_centerCol"]{grid-column:1 / 3;grid-row:1;border-left:0;border-radius:0}
.bt-canvas-frame>[class*="_rightbarCol"]{grid-column:3;grid-row:1}
.bt-canvas-frame>[data-side=sidebar]{display:none}
.bt-canvas-frame>.bt-floating-team,
.team-panel{
  --bt-ink:var(--text-primary,#262626);--bt-ink-2:var(--text-secondary,#757575);--bt-ink-3:#8c8c8c;
  --bt-card:#ffffff;--bt-main:#ffffff;--bt-sidebar:#ffffff;
  --bt-line:var(--divider,rgba(0,0,0,.06));--bt-line-2:rgba(0,0,0,.1);
  --bt-hover:rgba(0,0,0,.04);--bt-active:rgba(0,0,0,.08);--bt-accent:#10a37f;--bt-accent-ink:#ffffff;
  --bt-tag-bg:rgba(0,0,0,.05);--bt-tag-ink:var(--text-secondary,#757575);
  position:absolute;z-index:18;left:var(--bt-team-x,20px);top:var(--bt-team-y,104px);
  width:min(300px,calc(100% - 24px));height:var(--bt-team-height,640px);box-sizing:border-box;
  border:1px solid var(--glass-border,rgba(255,255,255,.85))!important;border-radius:24px!important;
  background:#f8f8f8!important;
  box-shadow:var(--glass-shadow,0 8px 28px rgba(0,0,0,.05),inset 0 1px 0 rgba(255,255,255,.8))!important;
  color:var(--text-primary,#262626);overflow:hidden;contain:layout style;
  width:var(--bt-team-width,300px);
  transition:width 240ms cubic-bezier(0.2,0,0,1),height 240ms cubic-bezier(0.2,0,0,1),left 240ms cubic-bezier(0.2,0,0,1),top 240ms cubic-bezier(0.2,0,0,1);
}
.bt-floating-team[data-moving=true]{transition:none!important;user-select:none}
.bt-floating-team[data-chat-open=true]{will-change:width,height;}
.bt-floating-team[data-maximized=true] .bt-team-chat-resize{display:none}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .bt-canvas-frame>.bt-floating-team,
  .team-panel{
    background:var(--glass-floating,rgba(255,255,255,.65))!important;
    -webkit-backdrop-filter:blur(var(--glass-blur,24px));
    backdrop-filter:blur(var(--glass-blur,24px));
  }
}
.bt-floating-team::before{display:none!important}
.bt-floating-team>[class*="_root"],.bt-floating-team>[data-slot=sidebar]>[class*="_root"]{display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;padding:10px 10px!important;background:transparent!important;box-sizing:border-box!important;overflow:hidden!important}
.bt-floating-team [class*="_regionArea"]{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;min-height:0!important;padding:0!important;margin:0!important;overflow:hidden!important}
.bt-floating-team [class*="_footArea"]{flex:0 0 auto!important;display:flex!important;gap:6px!important;padding-top:8px!important;border-top:1px solid var(--bt-line)!important}
.bt-floating-team .bt-side{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;height:100%!important;min-height:0!important;padding:0!important;overflow:hidden!important}
.bt-floating-team .bt-team-single{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;padding:0!important}
.bt-floating-team .bt-team-nav-standard{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important}
.bt-floating-team .bt-team-nav-standard .bt-side{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;width:100%!important;height:100%!important;min-height:0!important;padding:0!important;overflow:hidden!important}
.bt-floating-team .bt-side-top{flex:0 0 auto!important;min-height:38px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 0 8px!important;gap:4px!important}
.bt-floating-team .bt-side-top .bt-round{width:32px;height:32px;flex:none;background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.9);color:var(--text-primary,#262626);border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.04);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,transform .12s ease}
.bt-floating-team .bt-side-top .bt-round:hover{background:#ffffff!important;box-shadow:0 4px 10px rgba(0,0,0,.06)!important}
.bt-floating-team .bt-side-top .bt-round:active{transform:scale(0.95)}
.bt-team-grip{display:flex;align-items:center;gap:7px;flex:1;min-width:0;height:36px;padding:0 5px;border:0;border-radius:10px;background:transparent;color:var(--text-primary,#262626);font:inherit;font-size:13px;font-weight:600;cursor:grab;touch-action:none;user-select:none;text-align:start}
.bt-team-grip:active{cursor:grabbing}
.bt-team-grip>svg{flex:none;width:17px;height:17px;opacity:.7}
.bt-team-grip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity 150ms ease 130ms}
.bt-team-grip:focus-visible{outline:2px solid #888;outline-offset:3px}
.bt-floating-team .bt-list{flex:1 1 0%!important;min-height:0%!important;overflow-y:auto!important;overflow-x:hidden!important;display:flex!important;flex-direction:column!important;gap:4px!important;padding-bottom:8px!important;scrollbar-width:thin}
.bt-floating-team .bt-row{display:flex!important;align-items:center!important;position:relative!important;border:1px solid transparent!important;border-radius:10px!important;color:var(--text-primary,#262626)!important;box-sizing:border-box!important;transition:background-color .12s ease,box-shadow .12s ease,border-color .12s ease,width 280ms cubic-bezier(0.2,0,0,1),padding 280ms cubic-bezier(0.2,0,0,1)!important}
.bt-floating-team .bt-row .bt-mark,
.bt-floating-team .bt-row .bt-avatar,
.bt-floating-team .bt-agent-ava{flex:none!important;width:36px!important;height:36px!important;background:transparent!important;background-color:transparent!important}
.bt-floating-team .bt-row:hover{border-color:var(--bt-line)!important;background:rgba(0,0,0,.04)!important}
.bt-floating-team .bt-row:is([aria-current=page],[aria-selected="true"]),
.team-item[aria-selected="true"]{background:rgba(255,255,255,.95)!important;border-radius:10px!important;box-shadow:0 4px 14px rgba(0,0,0,.06),inset 0 0 0 1px rgba(255,255,255,.9)!important;color:var(--text-primary,#262626)!important}
.bt-floating-team .bt-connect{background:rgba(255,255,255,.9)}
.bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,.bt-you,[class*="_footArea"] button){background:rgba(255,255,255,.9)!important;color:var(--text-primary,#262626)!important;border:1px solid rgba(255,255,255,.9)!important;border-radius:12px!important;box-shadow:0 2px 8px rgba(0,0,0,.04)!important}
.bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,[class*="_footArea"] button):hover{background:#ffffff!important;box-shadow:0 4px 12px rgba(0,0,0,.06)!important}
.bt-floating-team:not([data-folded=true]) .bt-row{width:100%!important;min-height:48px!important;height:48px!important;padding:6px 8px!important;gap:8px!important}
.bt-floating-team:not([data-folded=true]) .bt-row-body{display:flex!important;flex-direction:column!important;min-width:0!important;flex:1 1 auto!important;opacity:1!important;visibility:visible!important;white-space:nowrap!important;overflow:hidden!important;transition:opacity 150ms ease 130ms!important}
.bt-floating-team:not([data-folded=true]) .bt-connect-label{opacity:1!important;visibility:visible!important;transition:opacity 150ms ease 130ms!important}
.bt-floating-team[data-folded=true]{width:68px!important}
.bt-floating-team[data-folded=true] .bt-side-top{justify-content:center!important;padding:0 0 6px!important}
.bt-floating-team[data-folded=true] .bt-team-grip{display:none!important}
.bt-floating-team[data-folded=true] .bt-side-top .bt-round:not(.bt-team-fold){display:none!important}
.bt-floating-team[data-folded=true] .bt-update{display:none!important}
.bt-floating-team[data-folded=true] .bt-team-fold{width:36px!important;height:36px!important;margin:0 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:12px!important}
.bt-floating-team[data-folded=true] .bt-list{align-items:center!important;scrollbar-width:none!important}
.bt-floating-team[data-folded=true] .bt-list::-webkit-scrollbar{display:none!important}
.bt-floating-team[data-folded=true] .bt-row{width:44px!important;height:44px!important;min-height:44px!important;padding:4px!important;margin:0 auto!important;justify-content:center!important;gap:0!important}
.bt-floating-team[data-folded=true] .bt-row-body{opacity:0!important;visibility:hidden!important;width:0!important;max-width:0!important;margin:0!important;padding:0!important;pointer-events:none!important;overflow:hidden!important;white-space:nowrap!important;transition:opacity 100ms ease,visibility 0s 100ms!important}
.bt-floating-team[data-folded=true] .bt-row .bt-unread{position:absolute!important;top:2px!important;right:2px!important;width:8px!important;height:8px!important;border-radius:50%!important;border:1.5px solid #ffffff!important;margin:0!important;z-index:3!important}
.bt-floating-team[data-folded=true] .bt-read-only{display:none!important}
.bt-floating-team[data-folded=true] [class*="_footArea"]{flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:8px 0 2px!important}
.bt-floating-team[data-folded=true] .bt-foot-account{order:0!important;margin:0 auto!important;width:36px!important;height:36px!important;display:flex!important;align-items:center!important;justify-content:center!important}
.bt-floating-team[data-folded=true] .bt-account{width:36px!important;height:36px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:12px!important}
.bt-floating-team[data-folded=true] .bt-connect-wrap{order:1!important;margin:0 auto!important;width:36px!important;height:36px!important;display:flex!important;align-items:center!important;justify-content:center!important;position:relative!important}
.bt-floating-team[data-folded=true] .bt-connect-foot{width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:12px!important;position:relative!important}
.bt-floating-team[data-folded=true] .bt-connect-label{display:none!important}
.bt-floating-team[data-folded=true] .bt-connect-warn{position:absolute!important;top:-2px!important;right:-2px!important;width:12px!important;height:12px!important;font-size:9px!important;line-height:12px!important;border:1.5px solid #ffffff!important;box-shadow:0 1px 3px rgba(0,0,0,0.15)!important}
.bt-floating-team[data-folded=true] [class*="_footArea"]>[class*="_settingsArea"]{order:2!important;margin:0 auto!important;width:36px!important;height:36px!important;display:flex!important;align-items:center!important;justify-content:center!important}
.bt-floating-team[data-folded=true] [class*="_footArea"]>[class*="_settingsArea"] button{width:36px!important;height:36px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:12px!important}
.bt-floating-team[data-folded=true] [class*="_footArea"]>[class*="_settingsArea"] button[class*="_trigger"] [class*="_label"]{display:none!important}
.bt-floating-team[data-chat-open=true]{
  width:var(--bt-team-width,860px)!important;
  border-radius:24px!important;
  border:1px solid var(--glass-border,rgba(255,255,255,.85))!important;
  background:#f8f8f8!important;
  box-shadow:var(--glass-shadow,0 16px 48px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.8))!important;
  overflow:hidden!important;
}
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .bt-floating-team[data-chat-open=true]{
    background:var(--glass-floating,rgba(255,255,255,.65))!important;
    -webkit-backdrop-filter:blur(var(--glass-blur,30px))!important;
    backdrop-filter:blur(var(--glass-blur,30px))!important;
  }
}
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true])>[class*="_root"],
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true])>[data-slot=sidebar]>[class*="_root"]{
  padding:0!important;
  border-radius:24px!important;
  position:relative!important;
  background:transparent!important;
}
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true]) [class*="_footArea"]{
  position:absolute!important;
  left:0!important;
  bottom:0!important;
  width:236px!important;
  height:48px!important;
  padding:0 10px!important;
  background:rgba(255,255,255,0.4)!important;
  border-top:1px solid var(--divider,rgba(0,0,0,0.06))!important;
  border-right:1px solid var(--glass-border,rgba(255,255,255,0.6))!important;
  box-sizing:border-box!important;
  z-index:10!important;
  display:flex!important;
  align-items:center!important;
  gap:6px!important;
}
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true]) [class*="_footArea"] .bt-connect-foot{
  height:32px!important;
  border-radius:8px!important;
  font-size:12px!important;
  background:rgba(255,255,255,0.85)!important;
  border:1px solid rgba(255,255,255,0.9)!important;
  color:#475569!important;
  box-shadow:0 1px 3px rgba(0,0,0,0.03)!important;
}
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true]) [class*="_footArea"] .bt-connect-foot:hover{
  background:#ffffff!important;
  color:#0f172a!important;
}
.bt-floating-team:is([data-chat-open=true],[data-chat-closing=true]) [class*="_footArea"] :is(.bt-account,[class*="_settingsArea"] button){
  width:32px!important;
  height:32px!important;
  border-radius:8px!important;
  background:rgba(255,255,255,0.85)!important;
  border:1px solid rgba(255,255,255,0.9)!important;
  color:#475569!important;
  box-shadow:0 1px 3px rgba(0,0,0,0.03)!important;
}
.bt-team-chat-resize{position:absolute;right:0;top:24px;bottom:24px;width:8px;cursor:ew-resize;z-index:30;touch-action:none}
.bt-team-chat-resize:hover{background:rgba(16,163,127,.18);border-radius:999px}
.bt-team-split{
  width:var(--bt-team-chat-width,860px)!important;min-width:var(--bt-team-chat-width,860px)!important;flex-shrink:0!important;
  display:flex!important;
  flex-direction:row!important;
  height:100%!important;
  overflow:hidden!important;
  border-radius:24px!important;
  background:transparent!important;
}
.bt-team-split-nav{
  width:236px!important;
  flex:0 0 236px!important;
  display:flex!important;
  flex-direction:column!important;
  height:100%!important;
  background:rgba(255,255,255,0.3)!important;
  border-right:1px solid var(--glass-border,rgba(255,255,255,0.6))!important;
  box-sizing:border-box!important;
  overflow:hidden!important;
  position:relative!important;
}
.bt-team-split-nav .bt-side{
  width:100%!important;
  height:100%!important;
  display:flex!important;
  flex-direction:column!important;
  padding:10px 10px 52px!important;
  box-sizing:border-box!important;
  overflow:hidden!important;
}
.bt-team-split-nav .bt-row{
  min-height:48px!important;
  height:48px!important;
  padding:6px 8px!important;
  border-radius:10px!important;
  gap:8px!important;
  border:1px solid transparent!important;
  transition:background-color .12s ease,border-color .12s ease!important;
}
.bt-team-split-nav .bt-row:hover:not([aria-current=page]):not([aria-selected="true"]){
  background:rgba(255,255,255,0.45)!important;
}
.bt-team-split-nav .bt-row:is([aria-current=page],[aria-selected="true"]){
  background:rgba(255,255,255,0.9)!important;
  border:1px solid rgba(255,255,255,0.95)!important;
  box-shadow:0 4px 12px rgba(0,0,0,0.05),inset 0 0 0 1px rgba(255,255,255,0.9)!important;
  color:#1e40af!important;
}
.bt-team-split-nav .bt-row:is([aria-current=page],[aria-selected="true"]) .bt-row-title{
  color:#1e40af!important;
  font-weight:600!important;
}
.bt-team-split-nav .bt-row-body{
  display:flex!important;
  flex-direction:column!important;
  min-width:0!important;
  flex:1 1 auto!important;
  gap:2px!important;
  overflow:hidden!important;
}
.bt-team-split-nav .bt-row-name{
  display:flex!important;
  align-items:center!important;
  gap:4px!important;
  font-size:13px!important;
  font-weight:500!important;
  color:#0f172a!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  line-height:18px!important;
}
.bt-team-split-nav .bt-row-title{
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
.bt-team-split-nav .bt-row-preview{
  font-size:11.5px!important;
  line-height:16px!important;
  color:#64748b!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  display:block!important;
}
.bt-team-split-chat{
  flex:1 1 0%!important;
  min-width:0!important;
  display:flex!important;
  flex-direction:column!important;
  height:100%!important;
  background:transparent!important;
  overflow:hidden!important;
  position:relative!important;
  animation:bt-chat-slide-in .24s cubic-bezier(0.16,1,0.3,1)!important;
  transition:transform .24s cubic-bezier(0.16,1,0.3,1),opacity .2s ease!important;
}
.bt-team-split-chat.bt-chat-closing{
  transform:translateX(-36px) scale(0.98)!important;
  opacity:0!important;
  pointer-events:none!important;
}
@keyframes bt-chat-slide-in{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:translateX(0)}}
.bt-team-chat-bar{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  height:72px!important;
  min-height:72px!important;
  max-height:72px!important;
  padding:0 20px!important;
  border-bottom:1px solid var(--divider,rgba(0,0,0,0.06))!important;
  background:rgba(255,255,255,0.35)!important;
  flex:none!important;
  user-select:none!important;
  box-sizing:border-box!important;
}
.bt-team-chat-header-main{
  display:flex!important;
  align-items:center!important;
  gap:10px!important;
  min-width:0!important;
  flex:1 1 0%!important;
}
.bt-team-chat-title{
  display:flex!important;
  flex-direction:column!important;
  min-width:0!important;
  justify-content:center!important;
  gap:1px!important;
}
.bt-team-chat-title-row{
  display:flex!important;
  align-items:baseline!important;
  gap:8px!important;
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
.bt-team-chat-title strong,
.bt-team-chat-name{
  font-size:18px!important;
  font-weight:600!important;
  color:#0f172a!important;
  line-height:22px!important;
  letter-spacing:-0.01em!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
.bt-team-chat-en-name{
  font-size:13px!important;
  color:#64748b!important;
  font-weight:500!important;
  line-height:18px!important;
}
.bt-team-chat-title span,
.bt-team-chat-badge,
.bt-team-chat-dept-role{
  font-size:12px!important;
  font-weight:500!important;
  color:#64748b!important;
  line-height:18px!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
.bt-team-chat-status-row{
  display:flex!important;
  align-items:center!important;
  gap:5px!important;
  margin-top:1px!important;
  font-size:11.5px!important;
  line-height:15px!important;
  color:#64748b!important;
}
.bt-team-chat-status-dot{
  width:6px!important;
  height:6px!important;
  border-radius:50%!important;
  background:#10b981!important;
  flex:none!important;
}
.bt-team-chat-tools{
  display:flex!important;
  align-items:center!important;
  gap:8px!important;
  flex:none!important;
  align-self:center!important;
}
.bt-team-chat-btn{
  display:inline-flex!important;
  align-items:center!important;
  gap:5px!important;
  height:30px!important;
  padding:0 10px!important;
  border-radius:6px!important;
  border:1px solid rgba(255,255,255,0.9)!important;
  background:rgba(255,255,255,0.85)!important;
  color:#475569!important;
  font:inherit!important;
  font-size:12px!important;
  font-weight:500!important;
  cursor:pointer!important;
  box-shadow:0 1px 3px rgba(0,0,0,.03)!important;
  transition:background-color .12s ease,color .12s ease!important;
}
.bt-team-chat-btn:hover{
  background:#ffffff!important;
  color:#0f172a!important;
  border-color:#ffffff!important;
}
.bt-team-chat-btn:active{
  transform:scale(0.97)!important;
}
.bt-team-chat-btn svg{
  width:14px!important;
  height:14px!important;
}
.bt-team-chat-btn--icon{
  width:32px!important;
  padding:0!important;
  justify-content:center!important;
}
.bt-team-chat-body{
  flex:1 1 0%!important;
  min-height:0!important;
  display:flex!important;
  flex-direction:column!important;
  overflow:hidden!important;
  position:relative!important;
  background:transparent!important;
}
.bt-team-chat-body .bt-canvas-session{
  flex:1!important;
  height:100%!important;
  width:100%!important;
  display:flex!important;
  flex-direction:column!important;
  overflow:hidden!important;
}
.bt-team-chat-body .bt-canvas-session .bt-canvas-content{
  flex:1!important;
  height:100%!important;
  min-height:0!important;
}
@media(max-width:700px){
  .bt-team-split-nav{width:68px!important;flex-basis:68px!important}
  .bt-floating-team:is([data-chat-open=true],[data-chat-closing=true]) [class*="_footArea"]{width:68px!important}
  .bt-team-split-nav :is(.bt-row-body,.bt-team-grip,.bt-update),.bt-team-split-nav .bt-side-top .bt-round:not(.bt-team-fold){display:none!important}
  .bt-team-chat-bar{padding:0 12px!important;gap:6px}
  .bt-team-chat-btn span{display:none}
  .bt-team-chat-title-row{flex-wrap:wrap!important}
  .bt-team-chat-name{font-size:15px!important}
}
@media (prefers-reduced-motion:reduce){.bt-canvas-frame>.bt-floating-team{transition:none}}
@media (prefers-reduced-motion:reduce){.bt-team-split-chat{animation:none!important;transition:none!important}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.bt-floating-team::before{display:none}}
@media (prefers-reduced-transparency:reduce){.bt-floating-team::before{display:none}}
@media(pointer:coarse){.bt-floating-team .bt-side-top .bt-round{width:44px;height:44px}.bt-team-grip{min-height:44px}.bt-floating-team[data-folded=true]>[class*="_root"],.bt-floating-team[data-folded=true]>[data-slot=sidebar]>[class*="_root"]{padding:4px!important}}
@media(forced-colors:active){
  .bt-canvas-frame>.bt-floating-team{--bt-ink:CanvasText;--bt-ink-2:CanvasText;--bt-ink-3:CanvasText;--bt-card:Canvas;--bt-main:Canvas;--bt-accent:Highlight;border-color:CanvasText!important;box-shadow:none}
  .bt-floating-team::before{display:none}
  .bt-floating-team .bt-row[aria-current=page]{border-color:Highlight;background:Canvas}
  .bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,.bt-you,[class*="_footArea"] button){background:ButtonFace!important;color:ButtonText!important;border-color:ButtonText!important}
  .bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,[class*="_footArea"] button):hover{background:Highlight!important;color:HighlightText!important}
}
`
