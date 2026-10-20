import { createElement as h, useEffect, useState } from 'react'
import { dateLocale, t } from './i18n.js'

const stages = [
  ['registry', 'Registered tools'],
  ['lastRequest', 'Last model request'],
  ['initial', 'Initial tool history'],
  ['additions', 'Added tool history'],
]
const stateLabel = state => ({ ready: 'Agent active', inactive: 'Agent inactive', 'not-started': 'Not started', unavailable: 'Unavailable', available: 'Snapshot available', connecting: 'Connecting', 'needs-approval': 'Awaiting approval', error: 'Needs attention', unknown: 'Unknown' })[state] ?? 'Unknown'
const capabilityStateLabel = state => state === 'ready' ? 'Ready' : stateLabel(state)

export function inspectionToolRows(session, { query = '', browserOnly = false } = {}) {
  const sources = { registry: session.registry?.tools, lastRequest: session.lastRequest?.tools, initial: session.history?.initial, additions: session.history?.additions }
  const rows = new Map()
  for (const [stage] of stages) {
    for (const tool of sources[stage] ?? []) {
      const row = rows.get(tool.name) ?? { name: tool.name, stages: {} }
      row.stages[stage] = { deferred: tool.deferLoading === true }
      rows.set(tool.name, row)
    }
  }
  const needle = query.trim().toLowerCase()
  return [...rows.values()].filter(row => (!needle || row.name.toLowerCase().includes(needle))
    && (!browserOnly || /browser|playwright|puppeteer|cdp|chrome/i.test(row.name))).sort((a, b) => a.name.localeCompare(b.name))
}

export function inspectionBrowserTarget(inspection, session) {
  return { sessionId: session.roomId ?? session.sessionId ?? inspection.sessionId, ...(session.botId ? { botId: session.botId } : {}) }
}

function sourceState(session, stage) {
  if (stage === 'initial' || stage === 'additions') return { state: session.history?.state ?? 'unavailable', count: session.history?.[stage]?.length ?? 0 }
  return { state: session[stage]?.state ?? 'unavailable', count: session[stage]?.tools?.length ?? 0 }
}

function InspectionSession({ session, inspection, actions, roster, query, browserOnly }) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const rows = inspectionToolRows(session, { query, browserOnly })
  const all = inspectionToolRows(session)
  const target = inspectionBrowserTarget(inspection, session)
  const name = roster?.byId?.[session.botId]?.name ?? roster?.agentsById?.[session.agentId]?.name ?? session.botId ?? session.agentId
  const openBrowser = async () => {
    if (opening) return
    setOpening(true); setError('')
    try { await actions.openNativeBrowser(target.sessionId, target.botId) }
    catch (error) { setError(error?.message ?? 'The operation browser could not open. Try again.') }
    finally { setOpening(false) }
  }
  return h('article', { className: 'bt-tool-inspection-session', 'data-inspected-session': session.sessionId ?? undefined },
    h('div', { className: 'bt-tool-inspection-heading' }, h('strong', null, name ?? t('Agent')),
      h('span', { 'data-state': session.state }, t(stateLabel(session.state))),
      actions.nativeBrowserAvailable === true && typeof actions.openNativeBrowser === 'function' ? h('button', { type: 'button', disabled: opening, onClick: openBrowser, title: t('Opens the actual execution conversation in classic view and uses its browser.') }, t(opening ? 'Opening browser…' : 'Open operation browser')) : null),
    roster?.browser === true && session.botId && typeof actions.openBrowser === 'function' ? h('button', { type: 'button', onClick: () => {
      actions.openBrowser(session.botId, session.roomId ? { roomId: session.roomId, label: roster.roomsById?.[session.roomId]?.name } : null)
      actions.closeToolInspection()
    }, title: t('An additional page-reading window; separate from the native operation browser.') }, t('Page reading panel')) : null,
    error ? h('p', { role: 'alert', className: 'bt-tool-inspection-error' }, t(error)) : null,
    h('dl', { className: 'bt-tool-inspection-identity' },
      h('dt', null, t('Conversation scope')), h('dd', null, t(session.kind === 'group' ? 'Group execution' : session.kind === 'private' ? 'Private conversation' : 'Agent conversation')),
      h('dt', null, t('Execution session')), h('dd', null, session.sessionId ? h('code', null, session.sessionId) : t('Not created')),
      h('dt', null, t('Agent preset')), h('dd', null, session.presetId ? h('code', null, session.presetId) : t('Unavailable'))),
    session.state === 'inactive' ? h('p', { className: 'bt-tool-inspection-note' }, t('This Agent is inactive. Inspection does not start it; its current tool list is unavailable.')) : null,
    session.state === 'not-started' ? h('p', { className: 'bt-tool-inspection-note' }, t('This employee has not started an execution session here. No session was created by inspection.')) : null,
    h('div', { className: 'bt-tool-inspection-sources' }, stages.map(([stage, label]) => {
      const source = sourceState(session, stage)
      return h('div', { key: stage }, h('span', null, t(label)), h('strong', null, source.state === 'available' ? source.count : t(stateLabel(source.state))))
    })),
    h('details', { className: 'bt-tool-inspection-tools', open: Boolean(query.trim() || browserOnly) },
      h('summary', null, t('Tool names ({count})', { count: rows.length }), rows.length !== all.length ? ` / ${all.length}` : ''),
      rows.length ? h('div', { className: 'bt-tool-inspection-table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('Tool name')), stages.map(([stage, label]) => h('th', { key: stage, scope: 'col' }, t(label))))),
        h('tbody', null, rows.map(row => h('tr', { key: row.name }, h('th', { scope: 'row' }, h('code', null, row.name)), stages.map(([stage]) => {
          const entry = row.stages[stage]
          const observed = sourceState(session, stage).state === 'available'
          return h('td', { key: stage }, entry ? h('span', { className: entry.deferred ? 'bt-tool-deferred' : 'bt-tool-present', title: t(entry.deferred ? 'Declared with deferLoading' : 'Present in this snapshot') }, t(entry.deferred ? 'Deferred' : 'Present'))
            : observed ? h('span', { 'aria-label': t('Absent from this snapshot') }, '—') : h('span', null, t(stateLabel(sourceState(session, stage).state))))
        })))))) : h('p', { className: 'bt-tool-inspection-note' }, t(query.trim() || browserOnly ? 'No tools match this filter.' : 'No tool names are available for this session.'))),
    h('details', { className: 'bt-tool-inspection-capabilities' }, h('summary', null, t('Employee capability mounts ({count})', { count: session.capabilities?.length ?? 0 })),
      h('p', { className: 'bt-tool-inspection-note' }, t('These mount states belong to the employee, not to one model request.')),
      session.capabilities?.length ? h('ul', null, session.capabilities.map(capability => h('li', { key: capability.name }, h('code', null, capability.name), h('span', null, t(capabilityStateLabel(capability.state))))))
        : h('p', { className: 'bt-tool-inspection-note' }, t('No employee capability packs assigned.'))))
}

export function ToolInspectionDialog({ inspection, actions, roster }) {
  const [query, setQuery] = useState('')
  const [browserOnly, setBrowserOnly] = useState(false)
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') actions.closeToolInspection() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  const report = inspection.report
  return h('div', { className: 'bt-tool-inspection-shade', onClick: event => { if (event.target === event.currentTarget) actions.closeToolInspection() } },
    h('style', null, TOOL_INSPECTION_CSS),
    h('section', { className: 'bt-tool-inspection', role: 'dialog', 'aria-modal': true, 'aria-label': t('Tool availability') },
      h('header', null, h('strong', null, t('Tool availability')), h('button', { type: 'button', disabled: Boolean(inspection.loading), onClick: actions.refreshToolInspection }, t(inspection.loading ? 'Loading…' : 'Refresh tools')), h('button', { type: 'button', autoFocus: true, onClick: actions.closeToolInspection }, t('Close'))),
      h('p', { className: 'bt-tool-inspection-note' }, t('Registered tools, model request tools and tool history are different snapshots. Deferred does not mean the tool is missing.')),
      h('p', { className: 'bt-tool-inspection-note' }, t("Last model request is the last assembled request header, not the provider's final wire payload.")),
      h('p', { className: 'bt-tool-inspection-note' }, t('A request containing run_code can expose browser tools through code. Tool names alone cannot confirm a working browser connection.')),
      actions.nativeBrowserAvailable === true ? h('p', { className: 'bt-tool-inspection-note' }, t('Opening the browser switches to the employee execution view. Use Back to Bot to return.')) : null,
      h('div', { className: 'bt-tool-inspection-filters' }, h('input', { type: 'search', value: query, placeholder: t('Search tool names'), 'aria-label': t('Search tool names'), onChange: event => setQuery(event.target.value) }),
        h('button', { type: 'button', 'aria-pressed': browserOnly, onClick: () => setBrowserOnly(value => !value) }, t('Browser tools only'))),
      inspection.error ? h('p', { role: 'alert', className: 'bt-tool-inspection-error' }, t(typeof inspection.error === 'string' ? inspection.error : 'Could not inspect tools. Try refreshing.')) : null,
      inspection.loading ? h('p', { role: 'status', className: 'bt-tool-inspection-note' }, t('Loading…')) : null,
      report?.time ? h('time', { className: 'bt-tool-inspection-stamp', dateTime: new Date(report.time).toISOString() }, t('Snapshot: {time}', { time: new Date(report.time).toLocaleString(dateLocale()) })) : null,
      report?.sessions?.map((session, index) => h(InspectionSession, { key: `${session.botId ?? session.agentId ?? index}:${session.sessionId ?? 'pending'}`, session, inspection, actions, roster, query, browserOnly })),
      !inspection.loading && report && !report.sessions?.length ? h('p', { className: 'bt-tool-inspection-note' }, t('No execution sessions to inspect.')) : null))
}

export const TOOL_INSPECTION_CSS = `
.bt-tool-inspection-shade{position:fixed;inset:0;z-index:2147483100;display:grid;place-items:center;background:#0f172a24;backdrop-filter:blur(7px);padding:24px}.bt-tool-inspection{width:min(850px,100%);max-height:82vh;overflow:auto;overscroll-behavior:contain;border:1px solid var(--bt-line,#e2e8f0);border-radius:20px;padding:20px;background:var(--bt-main,#fff);color:var(--bt-ink,#334155);box-shadow:0 20px 70px #0f172a26;font:12px/1.6 system-ui}.bt-tool-inspection header{display:flex;align-items:center;gap:8px}.bt-tool-inspection header>strong{margin-right:auto;font-size:15px}.bt-tool-inspection button{border:1px solid var(--bt-line,#e2e8f0);border-radius:8px;padding:5px 10px;background:var(--bt-hover,#f3f5f7);color:inherit;font:inherit;cursor:pointer}.bt-tool-inspection button:disabled{opacity:.55;cursor:wait}.bt-tool-inspection button[aria-pressed=true]{background:#26745e;color:white;border-color:#26745e}.bt-tool-inspection button:focus-visible,.bt-tool-inspection input:focus-visible,.bt-tool-inspection summary:focus-visible{outline:2px solid var(--bt-accent,#26745e);outline-offset:2px}
.bt-tool-inspection-note{margin:7px 0;color:var(--bt-ink-2,#64748b);font-size:11px}.bt-tool-inspection-filters{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}.bt-tool-inspection-filters input{flex:1;min-width:160px;border:1px solid var(--bt-line,#e2e8f0);border-radius:8px;padding:7px 10px;background:var(--bt-card,#fff);color:inherit;font:inherit}.bt-tool-inspection-error{color:#b45309}.bt-tool-inspection-stamp{display:block;font-size:10px;color:var(--bt-ink-2,#64748b)}
.bt-tool-inspection-session{padding:15px 0;border-top:1px solid var(--bt-line,#e2e8f0);margin-top:10px}.bt-tool-inspection-heading{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.bt-tool-inspection-heading>strong{font-size:13px}.bt-tool-inspection-heading>span{font-size:11px;color:var(--bt-ink-2,#64748b)}.bt-tool-inspection-heading>button{margin-left:auto}.bt-tool-inspection-identity{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:10px 0;font-size:11px}.bt-tool-inspection-identity dt{color:var(--bt-ink-2,#64748b)}.bt-tool-inspection-identity dd{margin:0;overflow-wrap:anywhere}.bt-tool-inspection-sources{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.bt-tool-inspection-sources>div{display:flex;flex-direction:column;padding:7px 9px;border:1px solid var(--bt-line,#e2e8f0);border-radius:9px}.bt-tool-inspection-sources span{color:var(--bt-ink-2,#64748b);font-size:10px}.bt-tool-inspection-sources strong{font-weight:500}
.bt-tool-inspection summary{cursor:pointer;padding:5px 0}.bt-tool-inspection-table-wrap{overflow:auto;margin:5px 0 10px;max-height:340px}.bt-tool-inspection table{border-collapse:collapse;width:100%;font-size:10px}.bt-tool-inspection th,.bt-tool-inspection td{text-align:left;border-bottom:1px solid var(--bt-line,#e2e8f0);padding:7px 8px;vertical-align:top}.bt-tool-inspection thead th{font-weight:500;color:var(--bt-ink-2,#64748b)}.bt-tool-inspection tbody th{font-weight:400;overflow-wrap:anywhere;min-width:160px}.bt-tool-present{color:#26745e}.bt-tool-deferred{color:#b45309}.bt-tool-inspection-capabilities ul{list-style:none;padding:0;margin:5px 0}.bt-tool-inspection-capabilities li{display:flex;gap:12px;padding:3px 0;overflow-wrap:anywhere}.bt-tool-inspection-capabilities li>span{color:var(--bt-ink-2,#64748b)}
@media(max-width:600px){.bt-tool-inspection-shade{padding:12px}.bt-tool-inspection{padding:14px}.bt-tool-inspection-sources{grid-template-columns:repeat(2,minmax(0,1fr))}}
`
