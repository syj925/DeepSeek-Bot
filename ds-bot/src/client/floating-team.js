import { canvasTheme } from './canvas-theme.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STORAGE } from './storage.js'

export function readTeamPanel(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE.teamPanel))
    return { x: Number.isFinite(value?.x) ? value.x : 20, y: Number.isFinite(value?.y) ? value.y : 104, folded: value?.folded === true }
  } catch { return { x: 20, y: 104, folded: false } }
}

const panelTop = area => Math.max(12, Math.min(area.minY ?? 12, area.height - 68))
function panelHeight(panel, area) {
  return Math.max(0, Math.min(area.height - panelTop(area) - 12, panel.folded ? 56 : Math.min(640, Math.max(180, area.height - 176))))
}

export function fitTeamPanel(panel, area) {
  const width = Math.min(panel.folded ? 164 : 288, Math.max(0, area.width - 24))
  const height = panelHeight(panel, area)
  return { ...panel, x: Math.max(12, Math.min(panel.x, area.width - width - 12)), y: Math.max(panelTop(area), Math.min(panel.y, area.height - height - 12)) }
}

export function teamChatLayout(panel, area) {
  const slot = Math.min(288, Math.max(164, area.width * .24), Math.max(0, area.width - 24))
  const width = panel.folded ? Math.min(164, slot) : slot
  // A stable left rail gives every conversation the same opening position.
  return { width, x: 20, left: slot + 40, right: 0 }
}

// The sidebar slot keeps the original list. Canvas mode replaces the shell's
// footer with a return button; leaving that mode removes every owned style.
export function useFloatingTeam(enabled, root) {
  const [panel, setPanel] = useState(readTeamPanel)
  const [area, setArea] = useState({ width: 1200, height: 800, top: 0 })
  const drag = useRef(null)
  const current = fitTeamPanel(panel, area)
  useLayoutEffect(() => {
    if (!enabled) return undefined
    const column = root.current?.closest('[class*="_sidebarCol"]')
    const frame = column?.parentElement
    if (!frame) return undefined
    column.classList.add('bt-floating-team')
    frame.classList.add('bt-canvas-frame')
    const center = frame.querySelector('[class*="_centerCol"]')
    const toolbar = root.current?.ownerDocument?.querySelector('.bt-canvas-toolbar')
    const measure = () => {
      const box = frame.getBoundingClientRect()
      const content = center?.getBoundingClientRect()
      const top = Math.max(0, (content?.top ?? box.top) - box.top)
      const width = content?.width ?? box.width
      const minY = width < 720 && toolbar ? toolbar.getBoundingClientRect().bottom - box.top - top + 68 : 12
      setArea({ width, height: content?.height ?? box.height - top, top, minY })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    if (center) observer.observe(center)
    if (toolbar) observer.observe(toolbar)
    measure()
    return () => {
      observer.disconnect()
      column.classList.remove('bt-floating-team')
      frame.classList.remove('bt-canvas-frame')
      column.removeAttribute('data-folded')
      for (const name of ['--bt-team-x', '--bt-team-y', '--bt-team-height', '--bt-team-chat-x', '--bt-team-chat-width']) column.style.removeProperty(name)
      for (const name of ['--bt-chat-left', '--bt-chat-right']) frame.style.removeProperty(name)
    }
  }, [enabled])
  useLayoutEffect(() => {
    if (!enabled) return
    const column = root.current?.closest('.bt-floating-team')
    if (!column) return
    column.dataset.folded = String(panel.folded)
    column.style.setProperty('--bt-team-x', `${current.x}px`)
    column.style.setProperty('--bt-team-y', `${current.y + area.top}px`)
    column.style.setProperty('--bt-team-height', `${panelHeight(panel, area)}px`)
    const chat = teamChatLayout(current, area)
    column.style.setProperty('--bt-team-chat-x', `${chat.x}px`)
    column.style.setProperty('--bt-team-chat-width', `${chat.width}px`)
    column.parentElement.style.setProperty('--bt-chat-left', `${chat.left}px`)
    column.parentElement.style.setProperty('--bt-chat-right', `${chat.right}px`)
  }, [enabled, current.x, current.y, area.top, area.width, area.height, area.minY, panel.folded])
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE.teamPanel, JSON.stringify(current)) } catch { /* storage unavailable */ }
    }, 180)
    return () => clearTimeout(timer)
  }, [enabled, current.x, current.y, panel.folded])
  const finish = event => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    folded: panel.folded,
    toggle: () => setPanel({ ...current, folded: !panel.folded }),
    handle: {
      onPointerDown: event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        drag.current = { x: event.clientX, y: event.clientY, panel: current }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: event => {
        if (!drag.current) return
        const start = drag.current
        setPanel(fitTeamPanel({ ...start.panel, x: start.panel.x + event.clientX - start.x, y: start.panel.y + event.clientY - start.y }, area))
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onKeyDown: event => {
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
${canvasTheme('.bt-canvas-frame>.bt-floating-team')}
.bt-canvas-frame>[class*="_centerCol"]{grid-column:1 / 3;grid-row:1;border-left:0;border-radius:0}
.bt-canvas-frame>[class*="_rightbarCol"]{grid-column:3;grid-row:1}
.bt-canvas-frame>[data-side=sidebar]{display:none}
.bt-canvas-frame>.bt-floating-team{
  position:absolute;z-index:18;left:var(--bt-team-x,20px);top:var(--bt-team-y,104px);
  width:min(288px,calc(100% - 24px));height:var(--bt-team-height,640px);box-sizing:border-box;
  border:1px solid var(--bt-canvas-border)!important;border-radius:26px;
  background:transparent!important;
  box-shadow:var(--bt-canvas-shadow);
  color:var(--bt-ink);overflow:hidden;transition:width .18s ease,height .18s ease;
}
.bt-floating-team::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:var(--bt-canvas-glass);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px)}
.bt-canvas-frame:has(.bt-canvas-chat-float)>.bt-floating-team{left:var(--bt-team-chat-x);width:var(--bt-team-chat-width)}
.bt-floating-team>[class*="_root"],.bt-floating-team>[data-slot=sidebar]>[class*="_root"]{width:100%!important;padding:8px!important;background:transparent!important;box-sizing:border-box}
.bt-floating-team [class*="_regionArea"]{display:flex!important;min-height:0;padding:0!important;margin:0!important}
.bt-canvas-frame>.bt-floating-team [class*="_footArea"]{display:none!important}
.bt-team-footer{flex:none;padding-top:8px;border-top:1px solid var(--bt-line)}
.bt-team-return{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:36px;padding:0 12px;border:1px solid var(--bt-line);border-radius:12px;background:var(--bt-canvas-button);color:var(--bt-ink);font:inherit;font-size:13px;cursor:pointer}
.bt-team-return>svg{width:16px;height:16px;flex:none}
.bt-team-return:hover{background:var(--bt-hover)}
.bt-team-return:focus-visible{outline:2px solid var(--bt-accent);outline-offset:-2px}
.bt-floating-team .bt-side{padding:0;overflow:hidden}
.bt-floating-team .bt-side-top{gap:4px;padding:0 0 8px;min-height:40px;flex:none}
.bt-floating-team .bt-side-top .bt-round{width:30px;height:30px;flex:none;background:var(--bt-canvas-button);border-color:var(--bt-line)}
.bt-team-grip{display:flex;align-items:center;gap:7px;flex:1;min-width:0;height:36px;padding:0 5px;border:0;border-radius:10px;background:transparent;color:var(--bt-ink);font:inherit;font-size:13px;font-weight:600;cursor:grab;touch-action:none;user-select:none;text-align:start}
.bt-team-grip:active{cursor:grabbing}
.bt-team-grip>svg{flex:none;width:17px;height:17px;opacity:.7}
.bt-team-grip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-team-grip:focus-visible{outline:2px solid var(--bt-accent);outline-offset:-2px}
.bt-floating-team .bt-list{gap:4px;scrollbar-width:thin}
.bt-floating-team .bt-row{min-height:58px;border:1px solid transparent;border-radius:15px}
.bt-floating-team .bt-row:hover{border-color:var(--bt-line);background:var(--bt-canvas-button)}
.bt-floating-team .bt-row[aria-current=page]{border-color:var(--bt-canvas-border);background:var(--bt-active);box-shadow:0 3px 10px rgba(28,32,40,.04)}
.bt-floating-team .bt-connect{background:var(--bt-canvas-button)}
.bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,.bt-you,[class*="_footArea"] button){background:var(--bt-canvas-button)!important;color:var(--bt-ink)!important;border-color:var(--bt-line)!important}
.bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,[class*="_footArea"] button):hover{background:var(--bt-hover)!important}
.bt-floating-team[data-folded=true]{width:min(164px,calc(100% - 24px));border-radius:18px}
.bt-floating-team[data-folded=true] .bt-side-top{padding:0;gap:3px}
.bt-floating-team[data-folded=true] :is(.bt-list,.bt-read-only,.bt-team-footer,[class*="_footArea"],.bt-side-top>.bt-round:not(.bt-team-fold)){display:none!important}
@media (prefers-reduced-motion:reduce){.bt-canvas-frame>.bt-floating-team{transition:none}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.bt-floating-team::before{background:var(--bt-card)!important}}
@media (prefers-reduced-transparency:reduce){.bt-floating-team::before{background:var(--bt-card)!important;-webkit-backdrop-filter:none;backdrop-filter:none}}
@media(pointer:coarse){.bt-floating-team .bt-side-top .bt-round{width:44px;height:44px}.bt-team-grip,.bt-team-return{min-height:44px}.bt-floating-team[data-folded=true]>[class*="_root"],.bt-floating-team[data-folded=true]>[data-slot=sidebar]>[class*="_root"]{padding:4px!important}}
@media(forced-colors:active){
  .bt-canvas-frame>.bt-floating-team{--bt-ink:CanvasText;--bt-ink-2:CanvasText;--bt-ink-3:CanvasText;--bt-card:Canvas;--bt-main:Canvas;--bt-accent:Highlight;border-color:CanvasText!important;box-shadow:none}
  .bt-floating-team::before{background:Canvas!important;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-floating-team .bt-row[aria-current=page]{border-color:Highlight;background:Canvas}
  .bt-team-return{background:ButtonFace;color:ButtonText;border-color:ButtonText}
  .bt-team-return:hover{background:Highlight;color:HighlightText}
  .bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,.bt-you,[class*="_footArea"] button){background:ButtonFace!important;color:ButtonText!important;border-color:ButtonText!important}
  .bt-canvas-frame>.bt-floating-team :is(.bt-round,.bt-connect,.bt-account,[class*="_footArea"] button):hover{background:Highlight!important;color:HighlightText!important}
}
`
