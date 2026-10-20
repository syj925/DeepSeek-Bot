import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentAvatarPreview, AGENT_AVATARS, AGENT_AVATAR_CSS, AGENT_ANIMATION_DURATION_MS } from './agent-avatar-preview.js'
import { language, t } from './i18n.js'
import { readSpatialWidget, writeSpatialWidget } from './spatial-widgets.js'
import { useSchedules } from './schedules.js'
import { qibitWorkSummary } from './qibit-work-summary.js'
import { useComposerMotion } from './composer-motion.js'

const copy = (en, zh) => language().startsWith('zh') ? zh : en
const FEATURES = [
  ['plan', 'Plan my work', '整理工作计划', '☷'],
  ['data', 'Analyze data', '分析业务数据', '▥'],
  ['meeting', 'Meeting notes', '梳理会议纪要', '▤'],
  ['customer', 'Follow up customers', '跟进客户需求', '◎'],
]

const WIDGET_ID = 'qibit-command'
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback
const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value))

// Persist the character's center/baseline, so folding never changes its anchor.
export function qibitWidgetLayout(panel = {}, area = {}, metrics = {}) {
  const width = Math.max(48, finite(area.width, 1200)), height = Math.max(48, finite(area.height, 800))
  const folded = panel.folded === true
  const expandedHero = width <= 480 ? 312 : 284
  const heroHeight = folded ? 212 : expandedHero
  const available = width - (width > 1000 ? 390 : width > 760 ? 350 : 32)
  const boxWidth = Math.min(width - 24, folded ? 216 : Math.min(660, Math.max(220, available)))
  const expectedHeight = heroHeight + (folded ? 0 : width <= 480 ? 184 : 115)
  const boxHeight = metrics.folded === folded && Number.isFinite(metrics.height) && metrics.height > 0 ? metrics.height : expectedHeight
  // 1280×780 canvas reference: center x=708, composition top≈155.
  // Blend back to the viewport center on large windows.
  const compactOffset = Math.max(0, Math.min(1, (1600 - width) / 320))
  const defaultX = width / 2 + Math.min(68, width * .053125) * compactOffset
  // Align the expanded composition above center, keeping the character steady
  // when folding. Only an intentional move stores an absolute anchor.
  const expandedHeight = expandedHero + (width <= 480 ? 184 : 115)
  const defaultY = Math.max(12, (height - expandedHeight) * .35) + expandedHero + 22 * compactOffset
  const preferredX = panel.placement?.width > 0 ? panel.x * width / panel.placement.width : panel.x
  const preferredY = panel.placement?.height > 0 ? panel.y * height / panel.placement.height : panel.y
  const anchorX = clamp(finite(preferredX, defaultX), 12 + boxWidth / 2, width - 12 - boxWidth / 2)
  const anchorY = clamp(finite(preferredY, defaultY), 12 + heroHeight, height - 12 - (boxHeight - heroHeight))
  return { x: anchorX - boxWidth / 2, y: anchorY - heroHeight, width: boxWidth, height: boxHeight, anchorX, anchorY, heroHeight, folded }
}

function useQiBitPlacement(actions) {
  const root = useRef(null), drag = useRef(null), frame = useRef(null), suppressClick = useRef(false)
  const [panel, setPanel] = useState(() => {
    const saved = readSpatialWidget(WIDGET_ID)
    // Older builds saved absolute positions even for automatic placement.
    return saved.placement ? saved : { x: null, y: null, folded: saved.folded }
  })
  const [area, setArea] = useState({ width: 1200, height: 800 })
  const [metrics, setMetrics] = useState({})
  const layout = qibitWidgetLayout(panel, area, metrics)
  const persist = next => { setPanel(next); writeSpatialWidget(WIDGET_ID, next) }
  useLayoutEffect(() => {
    const reset = () => {
      if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
      drag.current = null
      const next = { x: null, y: null, folded: panel.folded }
      const position = qibitWidgetLayout(next, area, metrics)
      persist(next)
      if (root.current) {
        Object.assign(root.current.style, { left: `${position.x}px`, top: `${position.y}px`, transform: 'none' })
        delete root.current.dataset.dragging
      }
      return { x: position.x, y: position.y, width: position.width, height: position.height }
    }
    actions.resetQiBitPlacement = reset
    return () => { if (actions.resetQiBitPlacement === reset) delete actions.resetQiBitPlacement }
  }, [actions, panel.folded, area, metrics])
  useLayoutEffect(() => {
    const node = root.current, canvas = node?.closest('.bt-canvas')
    if (!canvas) return undefined
    const measure = () => {
      const box = canvas.getBoundingClientRect(), widget = node.getBoundingClientRect()
      setArea(old => old.width === box.width && old.height === box.height ? old : { width: box.width, height: box.height })
      const folded = node.dataset.folded === 'true'
      setMetrics(old => old.height === widget.height && old.folded === folded ? old : { height: widget.height, folded })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(canvas); observer.observe(node); measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  const paint = next => {
    const node = root.current
    if (node) node.style.transform = `translate3d(${next.x - layout.x}px,${next.y - layout.y}px,0)`
  }
  const finish = event => {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    drag.current = null
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    const cancelled = event.type === 'pointercancel' || event.type === 'lostpointercapture'
    suppressClick.current = cancelled || !!current.next
    const next = !cancelled && current.next ? current.next : layout
    const node = root.current
    if (node) { node.style.left = `${next.x}px`; node.style.top = `${next.y}px`; node.style.transform = 'none'; delete node.dataset.dragging }
    if (!cancelled && current.next) persist({ x: next.anchorX, y: next.anchorY, folded: layout.folded, placement: area })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handle = {
    onPointerDown: event => {
      if (event.button !== 0 || event.isPrimary === false) return
      event.preventDefault(); event.stopPropagation()
      suppressClick.current = false
      drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: layout.anchorX, y: layout.anchorY, next: null }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: event => {
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      const dx = event.clientX - current.startX, dy = event.clientY - current.startY
      if (!current.next && Math.hypot(dx, dy) < 6) return
      current.next = qibitWidgetLayout({ x: current.x + dx, y: current.y + dy, folded: layout.folded }, area, metrics)
      root.current.dataset.dragging = 'true'
      if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; if (drag.current?.next) paint(drag.current.next) })
    },
    onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish,
    onKeyDown: event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!delta && event.key !== 'Home') return
      event.preventDefault(); event.stopPropagation()
      if (event.key === 'Home') { persist({ x: null, y: null, folded: layout.folded }); return }
      const step = event.shiftKey ? 24 : 8
      const next = qibitWidgetLayout({ x: layout.anchorX + delta[0] * step, y: layout.anchorY + delta[1] * step, folded: layout.folded }, area, metrics)
      persist({ x: next.anchorX, y: next.anchorY, folded: layout.folded, placement: area })
    },
  }
  const toggle = () => {
    persist({ ...panel, folded: !layout.folded })
  }
  const clickCharacter = () => { if (suppressClick.current) { suppressClick.current = false; return } toggle() }
  return { root, layout, handle, clickCharacter }
}

export function generalAgent(roster) {
  const bots = roster?.bots ?? []
  return bots.find(bot => bot.generalAssistant === true)
}

export function searchFromHome(actions, query) {
  actions.openPalette(String(query ?? '').trim())
}

function FeatureCards({ feature, roster, work, actions }) {
  const schedules = useSchedules(actions)
  const summary = qibitWorkSummary(feature, roster, work, schedules)
  const { tasks, upcoming, results, completed, approvals, failures, running } = summary
  const open = item => actions.openCanvasEntity(item.targetId)
  const rows = (items, empty, render) => items.length ? items.slice(0, 3).map(render) : h('p', { className: 'bt-qibit-empty' }, empty)
  const taskRow = item => h('button', { type: 'button', key: item.id, className: 'bt-qibit-record', title: item.title, onClick: () => open(item) },
    h('span', { 'aria-hidden': true }, item.done ? '✓' : '○'), h('span', null, item.title))
  const names = {
    plan: [copy('Work in progress', '当前工作'), copy('Scheduled tasks', '时间安排'), copy('Needs attention', '待处理事项'), copy('Recorded progress', '任务进度')],
    data: [copy('Analysis tasks', '分析任务'), copy('Scheduled analysis', '分析安排'), copy('Latest result', '最新分析结果'), copy('Recorded progress', '任务进度')],
    meeting: [copy('Meeting tasks', '会议任务'), copy('Scheduled meetings', '会议安排'), copy('Latest notes', '最新会议成果'), copy('Recorded progress', '任务进度')],
    customer: [copy('Customer tasks', '客户跟进'), copy('Follow-up schedule', '跟进安排'), copy('Latest result', '最新跟进结果'), copy('Recorded progress', '任务进度')],
  }[feature]
  const sections = [
    h('div', null, running.slice(0, 2).map(item => h('button', { key: item.id, type: 'button', className: 'bt-qibit-record', onClick: () => actions.openCanvasEntity(item.id) }, copy(`${item.name} · Working`, `${item.name} · 正在处理任务`))),
      tasks.length || !running.length ? rows(tasks, copy('No tasks yet. Describe your request below.', '暂无相关任务，在下方输入你的需求。'), taskRow) : null),
    schedules === null ? h('p', null, t('Loading…')) : !schedules.available ? h('p', null, copy('Scheduling is not enabled.', '尚未开启自动化日程。'))
      : rows(upcoming, copy('No schedule recorded.', '暂未设置时间安排。'), item => h('button', { type: 'button', key: `${item.sessionId}:${item.id}`, className: 'bt-qibit-record', onClick: () => actions.openSettings('schedules', item.botId ?? item.roomId) },
        h('span', null, new Date(item.scheduledAt).toLocaleString(language(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })), h('span', null, item.title))),
    feature === 'plan' ? h('div', null,
      approvals.length ? h('button', { type: 'button', className: 'bt-qibit-record', onClick: () => actions.openCanvasEntity(approvals[0].roomId ?? approvals[0].botId) }, copy(`${approvals.length} approvals waiting`, `${approvals.length} 项等待你授权`)) : null,
      failures.length ? h('button', { type: 'button', className: 'bt-qibit-record', onClick: () => actions.openCanvasEntity(failures[0].roomId ?? failures[0].botId) }, copy(`${failures.length} task errors`, `${failures.length} 项任务报错`)) : null,
      !approvals.length && !failures.length ? h('p', null, copy('No approvals or errors waiting.', '暂无待授权事项或任务报错。')) : null)
      : rows(results, copy('Results appear after a task is completed.', '完成任务后在这里显示实际成果。'), item => h('button', { type: 'button', key: item.id, className: 'bt-qibit-record bt-qibit-result', title: item.summary, onClick: () => open(item) }, item.summary)),
    tasks.length ? h('div', null, h('strong', { className: 'bt-qibit-count', 'aria-live': 'polite' }, `${completed} / ${tasks.length}`),
      h('progress', { value: completed, max: tasks.length, 'aria-label': copy('Completed recorded tasks', '已完成的已记录任务') }), h('p', null, copy('Completed / recorded tasks', '已完成 / 已记录任务')))
      : h('p', null, copy('Progress appears when tasks are recorded.', '任务记录产生后显示进度。')),
  ]
  return h('div', { className: 'bt-qibit-cards', id: 'bt-qibit-feature-cards', 'aria-label': copy('Actual work overview', '实际工作概览') }, sections.map((content, index) => h('section', { key: `${feature}:${index}`, className: 'bt-qibit-card bt-qibit-glass', style: { '--card-index': index } }, h('h3', null, names[index]), content)))
}

export function QiBitCommandCenter({ actions, roster, work = {}, searchIcon: SearchIcon }) {
  const [query, setQuery] = useState('')
  const [feature, setFeature] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const pending = useRef(false)
  const composer = useRef(null)
  const composing = useRef(false)
  useComposerMotion(composer, query)
  const [replay, setReplay] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [visible, setVisible] = useState(true)
  const { root, layout, handle, clickCharacter } = useQiBitPlacement(actions)
  const bot = generalAgent(roster)
  const lastHoverTrigger = useRef(0)
  const isHoveredRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(media.matches)
    const visibility = () => setVisible(!document.hidden)
    motion(); visibility()
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  const triggerHoverAnimation = () => {
    if (reduced || !visible) return
    const now = Date.now()
    if (now - lastHoverTrigger.current < AGENT_ANIMATION_DURATION_MS) return
    lastHoverTrigger.current = now
    setReplay(prev => prev + 1)
  }

  const handleCharacterPointerEnter = () => {
    if (layout.folded && !root.current?.dataset?.dragging) {
      if (!isHoveredRef.current) {
        isHoveredRef.current = true
        triggerHoverAnimation()
      }
    }
  }

  const handleCharacterPointerLeave = () => {
    isHoveredRef.current = false
  }

  const handleCharacterPointerMove = event => {
    if (layout.folded && !root.current?.dataset?.dragging && (event?.buttons ?? 0) === 0) {
      if (!isHoveredRef.current) {
        isHoveredRef.current = true
        triggerHoverAnimation()
      }
    }
  }

  const dismissFeature = () => {
    if (feature) setFeature(null)
  }

  const choose = id => {
    setFeature(value => value === id ? null : id); setSendError(''); setReplay(value => value + 1)
    const prompts = { plan: copy('Help me plan ', '帮我安排一下'), data: copy('Help me analyze ', '帮我分析一下'), meeting: copy('Help me organize meeting notes for ', '帮我整理会议记录：'), customer: copy('Help me follow up with ', '帮我跟进客户：') }
    setQuery(value => !value.trim() || Object.values(prompts).includes(value) ? prompts[id] : value)
  }
  const submit = async event => {
    event.preventDefault()
    if (pending.current || !bot || !query.trim()) return
    const original = query
    pending.current = true; setSending(true); setSendError('')
    try {
      await actions.send(bot.id, original.trim())
      setQuery(value => value === original ? '' : value)
      actions.openCanvasEntity(bot.id)
    } catch (error) { setSendError(error?.message || copy('Could not send. Please try again.', '发送失败，请重试。')) }
    finally { pending.current = false; setSending(false) }
  }

  return h('section', {
    ref: root, className: `bt-qibit-home${feature ? ' has-feature' : ''}${layout.folded ? ' is-collapsed' : ''}`, 'data-folded': layout.folded, 'data-widget': WIDGET_ID,
    style: { left: layout.x, top: layout.y, width: layout.width, transform: 'none' },
    'aria-label': copy('QiBit assistant and search', 'QiBit 总 Agent 与搜索栏'),
    onPointerDown: event => event.stopPropagation(), onDoubleClick: event => event.stopPropagation(), onWheel: event => event.stopPropagation(),
    onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); dismissFeature() } },
  },
  h('style', null, AGENT_AVATAR_CSS + QIBIT_HOME_CSS),
  h('div', { className: 'bt-qibit-hero' },
    h('div', { className: 'bt-qibit-greeting', hidden: layout.folded }, h('h2', null, copy('Hi, I’m QiBit.', 'Hi，我是 QiBit。')), h('p', null, feature ? copy('One task, a clearer way forward.', '把每一项工作，变得更有条理。') : copy('What would you like to work on today?', '今天，想先完成哪件事？'))),
    h('div', {
      className: 'bt-qibit-character',
      onPointerEnter: handleCharacterPointerEnter,
      onPointerLeave: handleCharacterPointerLeave,
    },
      visible && !reduced ? h(AgentAvatarPreview, { agent: AGENT_AVATARS[0], size: 184, triggerKey: replay }) : h('img', { src: AGENT_AVATARS[0].poster, alt: 'QiBit', className: 'bt-qibit-static' }),
      h('button', {
        type: 'button',
        className: 'bt-qibit-drag',
        'aria-label': layout.folded ? copy('Expand QiBit', '展开 QiBit') : copy('Collapse QiBit', '收起 QiBit'),
        'aria-expanded': !layout.folded, 'aria-controls': 'bt-qibit-command-body',
        title: t('Drag to move · Arrow keys to adjust · Home to reset'),
        ...handle,
        onPointerEnter: handleCharacterPointerEnter,
        onPointerLeave: handleCharacterPointerLeave,
        onPointerMove: event => {
          handleCharacterPointerMove(event)
          handle.onPointerMove?.(event)
        },
        onClick: clickCharacter,
      })),
    !layout.folded && feature ? h(FeatureCards, { feature, roster, work, actions }) : null),
  h('div', { id: 'bt-qibit-command-body', hidden: layout.folded },
  h('form', {
    ref: composer,
    className: 'bt-qibit-search bt-qibit-glass',
    onSubmit: submit
  },
    h('button', { type: 'button', className: 'bt-qibit-search-entry', title: t('Search Bots, chats and messages'), 'aria-label': t('Search Bots, chats and messages'), onClick: () => searchFromHome(actions, '') }, h(SearchIcon)),
    h('textarea', {
      rows: 1,
      'data-bt-home-input': '',
      value: query,
      'aria-label': copy('Message the General Assistant', '与总助理对话'),
      placeholder: copy('Tell the General Assistant what you want to get done', '告诉总助理，你想完成什么事…'),
      onChange: event => setQuery(event.target.value),
      onCompositionStart: () => { composing.current = true },
      onCompositionEnd: () => { composing.current = false },
      onKeyDown: event => {
        if (event.key !== 'Enter' || event.shiftKey) return
        if (composing.current || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      },
    }),
    h('button', { type: 'submit', className: 'bt-action-primary', disabled: !bot || !query.trim() || sending, 'aria-label': t('Send'), title: t('Send') }, sending ? '…' : '↗')),
  h('div', { className: 'bt-qibit-functions', role: 'group', 'aria-label': copy('Quick functions', '常用功能') }, FEATURES.map(([id, en, zh, icon]) => h('button', { key: id, type: 'button', className: 'bt-qibit-glass', 'aria-pressed': feature === id, 'aria-controls': 'bt-qibit-feature-cards', onClick: () => choose(id) }, h('span', { 'aria-hidden': true }, icon), copy(en, zh)))),
  sendError ? h('p', { className: 'bt-qibit-send-error', role: 'alert' }, sendError) : null,
  !bot ? h('p', { role: 'status' }, copy('Create a general assistant to start a task.', '请先创建总助理，再发起任务。')) : null))
}

export const QIBIT_HOME_CSS = `
.bt-qibit-home{position:absolute;top:24px;left:50%;transform:translateX(-50%);width:min(660px,calc(100% - 390px));z-index:14;pointer-events:none;color:var(--text-primary);font-family:var(--bt-font-sans)}
.bt-qibit-home button,.bt-qibit-home input{font:inherit}.bt-qibit-home button{cursor:pointer}.bt-qibit-home button:focus-visible,.bt-qibit-home input:focus-visible{outline:2px solid var(--bt-accent);outline-offset:3px}
.bt-qibit-glass{background:var(--glass-floating);border:1px solid var(--glass-border);box-shadow:var(--glass-shadow);-webkit-backdrop-filter:blur(var(--glass-blur));backdrop-filter:blur(var(--glass-blur))}
.bt-qibit-hero{position:relative;height:284px}.bt-qibit-greeting{text-align:center;position:absolute;top:0;left:0;right:0;pointer-events:none;text-shadow:0 1px 10px rgba(255,255,255,.8);z-index:2}
.bt-qibit-greeting h2{font-size:26px;font-weight:550;letter-spacing:-1px;line-height:1.3;margin:0 0 8px}.bt-qibit-greeting p{font-size:12px;margin:0;color:var(--text-secondary)}
.bt-qibit-character{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:184px;height:184px;pointer-events:none;z-index:3}.bt-qibit-character .bt-agent-stage{pointer-events:none;cursor:default;transition:transform .28s cubic-bezier(.16,1,.3,1),filter .28s ease;transform-origin:bottom center}.bt-qibit-static{height:184px;width:327px;position:absolute;left:50%;transform:translateX(-50%);max-width:none}
.bt-qibit-character{pointer-events:auto}.bt-qibit-character:before{content:'';position:absolute;left:calc(50% - 24px);top:-39px;width:48px;height:40px}.bt-qibit-drag{position:absolute;inset:0;width:100%;height:100%;border:0!important;background:transparent!important;box-shadow:none!important;padding:0;cursor:grab!important;touch-action:none;border-radius:22px}.bt-qibit-home[data-dragging=true] .bt-qibit-drag{cursor:grabbing!important}.bt-qibit-fold{position:absolute;left:50%;top:-31px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;width:27px;height:27px;padding:0;border-radius:50%;font-size:20px!important;line-height:1;color:var(--text-primary);opacity:0;pointer-events:none;transition:opacity .15s ease;z-index:4}.bt-qibit-character:hover .bt-qibit-fold,.bt-qibit-character:focus-within .bt-qibit-fold{opacity:1;pointer-events:auto}.bt-qibit-home.is-collapsed .bt-qibit-hero{height:212px}.bt-qibit-home [hidden]{display:none!important}.bt-qibit-home[data-dragging=true]{user-select:none}
.bt-qibit-home.is-collapsed .bt-qibit-character:hover .bt-agent-stage{transform:translateY(-4px) scale(1.04);filter:drop-shadow(0 10px 20px rgba(0,0,0,.14))}
.bt-qibit-home.is-collapsed .bt-qibit-character:active .bt-agent-stage{transform:translateY(-2px) scale(1.02)}
.bt-qibit-home.is-collapsed .bt-qibit-drag{cursor:pointer!important}
.bt-qibit-home.is-collapsed[data-dragging=true] .bt-qibit-drag{cursor:grabbing!important}
.bt-qibit-search{display:flex;align-items:center;gap:10px;height:60px;border-radius:30px;padding:8px 10px 8px 20px;pointer-events:auto;position:relative;z-index:2;cursor:text}
.bt-qibit-search-icon{display:flex;color:var(--text-secondary)}.bt-qibit-search-icon svg{width:18px;height:18px}.bt-qibit-search input{flex:1;min-width:0;background:transparent;border:0!important;box-shadow:none!important;outline:none;height:40px;color:var(--text-primary);font-size:13px}.bt-qibit-search input::placeholder{color:var(--text-secondary)}.bt-qibit-search input:focus-visible{outline:none}.bt-qibit-search:focus-within{outline:2px solid color-mix(in srgb,var(--bt-accent) 35%,transparent);outline-offset:2px}
.bt-qibit-search>button{width:38px;height:38px;border-radius:50%;border:0;background:#171717;color:white;font-size:23px;flex-shrink:0}.bt-qibit-search>button.bt-qibit-search-entry{background:transparent;color:var(--text-secondary);width:24px;height:30px;padding:0;display:grid;place-items:center}.bt-qibit-search-entry svg{width:18px;height:18px}
.bt-qibit-functions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 2px 0;pointer-events:auto}.bt-qibit-functions button{border-radius:13px;min-height:43px;padding:8px 5px;display:flex;justify-content:center;align-items:center;gap:6px;color:var(--text-primary);font-size:11px}.bt-qibit-functions button>span{font-size:15px;color:var(--text-secondary)}.bt-qibit-functions button[aria-pressed=true]{outline:1px solid var(--bt-accent);outline-offset:-1px;color:var(--bt-accent)}
.bt-qibit-foot{min-height:22px;display:flex;justify-content:center;align-items:center;gap:15px;margin-top:10px;color:var(--text-secondary);font-size:10px;pointer-events:auto}.bt-qibit-foot button{border:0;padding:3px 0;background:transparent;color:var(--text-secondary);font-size:10px}
.bt-qibit-cards{position:absolute;inset:0;pointer-events:none;z-index:1}
.bt-qibit-card{position:absolute;box-sizing:border-box;max-height:112px;overflow:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--text-secondary) 35%,transparent) transparent;pointer-events:auto;transform-origin:center center;animation:bt-qibit-scatter .42s cubic-bezier(.16,1,.3,1) backwards;animation-delay:var(--card-delay,0ms)}
.bt-qibit-card:nth-child(4){max-height:none;overflow:hidden}
.bt-qibit-card:nth-child(1){left:0;top:66px;width:calc(50% - 75px);min-height:94px;padding:12px 14px;border-radius:18px;--scatter-x:min(220px,34vw);--scatter-y:84px;--scatter-rot:-6deg;--card-delay:0ms}
.bt-qibit-card:nth-child(2){right:0;top:72px;width:calc(50% - 118px);min-height:82px;padding:10px 13px;border-radius:15px;--scatter-x:max(-220px,-34vw);--scatter-y:78px;--scatter-rot:6deg;--card-delay:40ms}
.bt-qibit-card:nth-child(3){left:0;top:178px;width:calc(50% - 110px);min-height:80px;padding:10px 12px;border-radius:16px;--scatter-x:min(210px,32vw);--scatter-y:-28px;--scatter-rot:-4deg;--card-delay:80ms}
.bt-qibit-card:nth-child(4){right:0;top:168px;width:calc(50% - 85px);min-height:90px;padding:12px 14px;border-radius:19px;--scatter-x:max(-210px,-32vw);--scatter-y:-22px;--scatter-rot:5deg;--card-delay:110ms}
.bt-qibit-card h3{font-size:11px;font-weight:600;margin:0 0 7px}
.bt-qibit-card p{font-size:10px;line-height:1.7;color:var(--text-secondary);margin:2px 0}
.bt-qibit-record{display:flex;gap:5px;width:100%;padding:3px 0;text-align:start;border:0;background:none;color:var(--text-secondary);font-size:10px!important;line-height:1.5}.bt-qibit-record>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-qibit-result{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.bt-qibit-send-error{pointer-events:auto;color:#b42318;font-size:12px}.bt-qibit-task{font-size:10px;display:flex;align-items:center;gap:5px;margin:4px 0;cursor:pointer;line-height:1.5}
.bt-qibit-task input{width:11px;height:11px;accent-color:var(--bt-accent);margin:0}
.bt-qibit-task:has(input:checked){text-decoration:line-through;color:var(--text-secondary)}
.bt-qibit-count{font-size:20px;font-weight:500;color:var(--bt-accent)}
.bt-qibit-card progress{display:block;width:100%;height:4px;margin:8px 0;border:0;border-radius:99px;overflow:hidden;appearance:none;background:color-mix(in srgb,var(--bt-accent) 12%,transparent)}
.bt-qibit-card progress::-webkit-progress-bar{background:color-mix(in srgb,var(--bt-accent) 12%,transparent);border-radius:99px}
.bt-qibit-card progress::-webkit-progress-value{background:var(--bt-accent);border-radius:99px}
.bt-qibit-card progress::-moz-progress-bar{background:var(--bt-accent);border-radius:99px}
@keyframes bt-qibit-scatter{
  0%{opacity:0;transform:translate3d(var(--scatter-x),var(--scatter-y),0) scale(.28) rotate(var(--scatter-rot));filter:blur(8px)}
  65%{opacity:1;transform:translate3d(calc(var(--scatter-x)*-.05),calc(var(--scatter-y)*-.05),0) scale(1.02) rotate(0deg);filter:blur(0)}
  100%{opacity:1;transform:translate3d(0,0,0) scale(1) rotate(0deg);filter:blur(0)}
}
@media(max-width:1000px){
  .bt-qibit-home{width:calc(100% - 350px);left:50%}
  .bt-qibit-card:nth-child(1){width:calc(50% - 60px)}
  .bt-qibit-card:nth-child(2){width:calc(50% - 95px)}
  .bt-qibit-card:nth-child(3){width:calc(50% - 90px)}
  .bt-qibit-card:nth-child(4){width:calc(50% - 70px)}
  .bt-qibit-character{transform:translateX(-50%) scale(.86);transform-origin:bottom center}
  .bt-qibit-functions{gap:5px}
  .bt-qibit-functions button{font-size:10px;gap:3px}
  .bt-qibit-functions button>span{display:none}
}
@media(max-width:760px){
  .bt-qibit-home{top:16px;left:50%;width:calc(100% - 32px)}
  .bt-qibit-greeting h2{font-size:24px}
  .bt-qibit-card:nth-child(1){width:calc(50% - 70px)}
  .bt-qibit-card:nth-child(2){width:calc(50% - 105px)}
  .bt-qibit-card:nth-child(3){width:calc(50% - 100px)}
  .bt-qibit-card:nth-child(4){width:calc(50% - 80px)}
  .bt-qibit-functions button{font-size:11px}
  .bt-qibit-character{transform:translateX(-50%) scale(.95)}
}
@media(max-width:480px){
  .bt-qibit-hero{height:312px}
  .bt-qibit-character{transform:translateX(-50%) scale(.74)}
  .bt-qibit-card:nth-child(1){top:88px;width:calc(50% - 55px)}
  .bt-qibit-card:nth-child(2){top:94px;width:calc(50% - 80px)}
  .bt-qibit-card:nth-child(3){top:200px;width:calc(50% - 75px)}
  .bt-qibit-card:nth-child(4){top:196px;width:calc(50% - 60px)}
  .bt-qibit-card p,.bt-qibit-record{display:flex;gap:5px;width:100%;padding:3px 0;text-align:start;border:0;background:none;color:var(--text-secondary);font-size:10px!important;line-height:1.5}.bt-qibit-record>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-qibit-result{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.bt-qibit-send-error{pointer-events:auto;color:#b42318;font-size:12px}.bt-qibit-task{font-size:9px}
  .bt-qibit-functions{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bt-qibit-search input{font-size:11px}
  .bt-qibit-search{padding-left:12px}
}
@media(prefers-reduced-motion:reduce){
  .bt-qibit-card{animation:none!important;transform:none!important}
  .bt-qibit-fold{transition:none}
  .bt-qibit-character .bt-agent-stage{transition:none!important;transform:none!important}
}
@media(pointer:coarse){.bt-qibit-fold{opacity:1;pointer-events:auto;width:34px;height:34px;top:-38px}}
`
