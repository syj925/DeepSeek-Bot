import { createElement as h, useEffect, useRef, useState } from 'react'
import { currentPart } from './text.js'
import { conversationFailures } from './recovery-state.js'
import { t } from './i18n.js'
import { workPhrase } from './cells.js'

export function executionState({ sessionId, roster, work, running, entries, pending }) {
  const bot = roster.byId[sessionId] ?? roster.bots?.find(item => currentPart(item) === sessionId)
  const room = roster.roomsById[sessionId]
  const belongs = item => room ? item.roomId === room.id : !item.roomId && (item.sessionId === sessionId || item.botId === bot?.id)
  if (conversationFailures(sessionId, roster).some(item => !item.retrying)) return { kind: 'error', label: 'Execution needs attention' }
  if ((work.approvals ?? []).some(belongs)) return { kind: 'approval', label: 'Waiting for your approval' }
  if (roster.questions?.[sessionId] || Object.values(roster.questions ?? {}).some(belongs)) return { kind: 'question', label: 'Waiting for your answer' }
  const doing = room ? work.rooms?.[room.id] ?? [] : work.bots?.[bot?.id] && !work.bots[bot.id].roomId ? [work.bots[bot.id]] : []
  if (!running && !doing.length) return pending ? { kind: 'queued', label: 'Request submitted · waiting to start' } : null
  const tools = entries.filter(item => !item.text && !item.relay).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const rawTool = tools.at(-1)?.label ?? doing.find(item => item.tool)?.tool
  const tool = rawTool ? (tools.at(-1)?.label ?? workPhrase(rawTool)) : tools.length ? t('Running tool') : undefined
  const since = Math.min(...doing.map(item => item.since).filter(Number.isFinite))
  return { kind: entries.some(item => item.text) ? 'reply' : tool ? 'tool' : 'waiting',
    label: entries.some(item => item.text) ? 'Writing reply' : tool ? 'Running tool' : 'Waiting for model response',
    tool, activity: doing.map(item => [item.botId, item.tool, item.since]), since: Number.isFinite(since) ? since : undefined }
}

export function ExecutionStatus({ sessionId, useRoster, useWork, useSessionStatus, useLive, useSession, actions }) {
  const roster = useRoster(value => value)
  const work = useWork(value => value)
  const running = useSessionStatus(map => map.get(sessionId)?.running === true)
  const liveKey = useLive(value => JSON.stringify(value[sessionId] ?? {}))
  const pending = useSession(value => (value?.pendingSubmissions?.length ?? 0) > 0)
  const state = executionState({ sessionId, roster, work, running, entries: Object.values(JSON.parse(liveKey)), pending })
  const signal = JSON.stringify([sessionId, state?.kind, state?.tool, state?.activity, state?.since, liveKey])
  const activity = useRef({ signal, at: Date.now() })
  if (activity.current.signal !== signal) activity.current = { signal, at: Date.now() }
  const run = useRef({ sessionId, active: !!state, at: Date.now() })
  if (run.current.sessionId !== sessionId || run.current.active !== !!state) run.current = { sessionId, active: !!state, at: Date.now() }
  const [now, setNow] = useState(Date.now)
  const active = !!state
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active, sessionId])
  if (!state) return h('div', { className: 'bt-execution-status', 'data-state': 'idle', 'aria-hidden': true })
  const working = ['waiting', 'tool', 'reply', 'queued'].includes(state.kind)
  const seconds = Math.max(0, Math.floor((now - (state.since ?? run.current.at)) / 1000))
  const elapsed = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`
  const slow = working && now - activity.current.at >= 45000
  return h('div', { className: 'bt-execution-status', 'data-state': state.kind },
    h('span', { className: 'bt-execution-status-dot', 'aria-hidden': true }),
    h('span', { role: 'status' }, state.kind === 'tool' ? state.tool : t(state.label)),
    working ? h('span', { className: 'bt-execution-elapsed', 'aria-label': t('Elapsed time') }, elapsed) : null,
    slow ? h('span', { className: 'bt-execution-slow' }, t('No new progress yet · check execution details')) : null,
    h('button', { type: 'button', onClick: () => actions.showExecution(sessionId) }, t('Execution details')))
}

export const EXECUTION_STATUS_CSS = `
.bt-execution-status{flex:none;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 14px;border-top:1px solid var(--bt-line);color:var(--bt-ink-2);font:12px/18px var(--bt-font-sans);min-height:32px;box-sizing:border-box}
.bt-execution-status-dot{width:6px;height:6px;border-radius:50%;background:var(--bt-accent);flex:none}
.bt-execution-status[data-state=idle]{border-top-color:transparent}
.bt-execution-status:is([data-state=waiting],[data-state=tool],[data-state=reply],[data-state=queued]) .bt-execution-status-dot{animation:bt-status-breathe 1.8s ease-in-out infinite}
@keyframes bt-status-breathe{50%{opacity:.35;box-shadow:0 0 0 3px color-mix(in srgb,var(--bt-accent) 12%,transparent)}}
@media(prefers-reduced-motion:reduce){.bt-execution-status-dot{animation:none!important}}
.bt-execution-status[data-state=error] .bt-execution-status-dot,.bt-execution-status[data-state=approval] .bt-execution-status-dot,.bt-execution-status[data-state=question] .bt-execution-status-dot{background:#d97706}
.bt-execution-elapsed{font-variant-numeric:tabular-nums;white-space:nowrap}.bt-execution-slow{flex-basis:100%;font-size:11px}
.bt-execution-status button{margin-inline-start:auto;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
`
