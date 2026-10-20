import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/client/tool-inspection.js'], bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'] })
const module = { exports: {} }, effects = []
runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports,
  require: () => ({ createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }), useState: value => [value, () => {}], useEffect: effect => effects.push(effect) }) })
const { inspectionToolRows, inspectionBrowserTarget, ToolInspectionDialog } = module.exports
const plain = value => JSON.parse(JSON.stringify(value))
const find = (node, predicate) => predicate(node) ? node : node?.children?.map(child => find(child, predicate)).find(Boolean)
const hasText = (node, text) => Boolean(find(node, child => child === text))

const session = () => ({ kind: 'group', botId: 'writer', roomId: 'research', sessionId: 'group-writer', state: 'ready', presetId: 'standard',
  registry: { state: 'available', tools: [{ name: 'read_browser' }, { name: 'mcp__browser__click', deferLoading: true }] },
  lastRequest: { state: 'available', tools: [{ name: 'run_code' }] },
  history: { state: 'available', initial: [{ name: 'read_browser', deferLoading: true }], additions: [{ name: 'mcp__browser__click' }] }, capabilities: [{ name: 'browser', state: 'connecting' }] })

test('tool rows retain snapshot membership and deferred markers separately', () => {
  const input = session()
  input.registry.tools[0].parameters = { credential: 'never-visible' }
  const rows = inspectionToolRows(input)
  assert.deepEqual(plain(rows), [
    { name: 'mcp__browser__click', stages: { registry: { deferred: true }, additions: { deferred: false } } },
    { name: 'read_browser', stages: { registry: { deferred: false }, initial: { deferred: true } } },
    { name: 'run_code', stages: { lastRequest: { deferred: false } } },
  ])
  assert.doesNotMatch(JSON.stringify(rows), /credential|never-visible|parameters/)
  assert.equal(input.registry.tools[0].parameters.credential, 'never-visible')
})

test('name search spans every snapshot and browser filter preserves exact tool names', () => {
  const input = session()
  assert.deepEqual(plain(inspectionToolRows(input, { query: ' RUN_ ' }).map(row => row.name)), ['run_code'])
  assert.equal(inspectionToolRows(input, { browserOnly: true }).length, 2)
  input.history.additions.push({ name: 'playwright_navigate' })
  assert.equal(inspectionToolRows(input, { browserOnly: true, query: 'navigate' })[0].name, 'playwright_navigate')
  assert.deepEqual(plain(inspectionToolRows({})), [])
})

test('browser action uses the group parent and member identity to prepare their true execution session', () => {
  assert.deepEqual(plain(inspectionBrowserTarget({ sessionId: 'research' }, session())), { sessionId: 'research', botId: 'writer' })
  assert.deepEqual(plain(inspectionBrowserTarget({ sessionId: 'writer' }, { kind: 'private', sessionId: 'writer-current', botId: 'writer' })), { sessionId: 'writer-current', botId: 'writer' })
  assert.deepEqual(plain(inspectionBrowserTarget({ sessionId: 'plain-chat' }, { kind: 'agent', sessionId: 'plain-chat', agentId: 'plain' })), { sessionId: 'plain-chat' })
  assert.deepEqual(plain(inspectionBrowserTarget({ sessionId: 'research' }, { kind: 'group', roomId: 'research', botId: 'writer', state: 'not-started' })), { sessionId: 'research', botId: 'writer' })
})

test('dialog refresh is explicit and each session shows separate registry, request and history sources', () => {
  const refreshed = [], opened = [], closed = [], input = session()
  const tree = ToolInspectionDialog({ inspection: { sessionId: 'research', report: { time: 1000, sessions: [input] } },
    actions: { nativeBrowserAvailable: true, refreshToolInspection: () => refreshed.push(1), closeToolInspection: () => closed.push(1), openNativeBrowser: (...args) => opened.push(args) } })
  assert.deepEqual(refreshed, [], 'rendering and effects do not poll or refresh')
  find(tree, node => node?.type === 'button' && node.children.includes('Refresh tools')).props.onClick()
  assert.deepEqual(refreshed, [1])
  const element = find(tree, node => node?.type?.name === 'InspectionSession')
  const detail = element.type(element.props)
  for (const label of ['Registered tools', 'Last model request', 'Initial tool history', 'Added tool history', 'Deferred', 'Present']) assert.ok(hasText(detail, label), label)
  find(detail, node => node?.type === 'button' && node.children.includes('Open operation browser')).props.onClick()
  assert.deepEqual(opened, [['research', 'writer']])
  tree.props.onClick({ target: tree, currentTarget: tree })
  assert.deepEqual(closed, [1])
  assert.equal(find(detail, node => node?.type === 'details' && node.props.className === 'bt-tool-inspection-tools').props.open, false)
})

test('inactive and not-started sessions describe missing observations without claiming tools are absent', () => {
  for (const state of ['inactive', 'not-started', 'unavailable']) {
    const input = { kind: 'group', botId: 'writer', roomId: 'research', state, registry: { state: 'unavailable', tools: [] }, lastRequest: { state: 'not-started', tools: [] }, history: { state: 'unavailable', initial: [], additions: [] }, capabilities: [] }
    const tree = ToolInspectionDialog({ inspection: { sessionId: 'research', report: { sessions: [input] } }, actions: {} })
    const element = find(tree, node => node?.type?.name === 'InspectionSession')
    const detail = element.type(element.props)
    assert.ok(hasText(detail, 'Unavailable'))
    assert.ok(hasText(detail, 'Not started'))
    assert.ok(hasText(detail, 'No tool names are available for this session.'))
    assert.ok(hasText(detail, 'Not created'))
  }
})

test('Web inspection does not expose a native browser action and ready capability stays distinct from Agent state', () => {
  const input = session()
  input.capabilities[0].state = 'ready'
  const tree = ToolInspectionDialog({ inspection: { sessionId: 'research', report: { sessions: [input] } }, actions: { openNativeBrowser: () => {} } })
  const element = find(tree, node => node?.type?.name === 'InspectionSession')
  const detail = element.type(element.props)
  assert.equal(find(detail, node => node?.type === 'button' && node.children.includes('Open operation browser')), undefined)
  assert.ok(hasText(detail, 'Ready'))
  assert.ok(hasText(detail, 'Agent active'))
  assert.ok(hasText(tree, "Last model request is the last assembled request header, not the provider's final wire payload."))
})

test('native browser action shows busy feedback and a visible failure without an unhandled rejection', async () => {
  const cells = [], runtime = { exports: {} }
  let cursor = 0, rejectOpen
  runInNewContext(bundle.outputFiles[0].text, { module: runtime, exports: runtime.exports,
    require: () => ({ createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }), useState: value => {
      const index = cursor++
      if (!cells[index]) cells[index] = { value }
      return [cells[index].value, next => { cells[index].value = next }]
    }, useEffect() {} }) })
  const tree = runtime.exports.ToolInspectionDialog({ inspection: { sessionId: 'research', report: { sessions: [session()] } }, actions: {
    nativeBrowserAvailable: true, openNativeBrowser: () => new Promise((_, reject) => { rejectOpen = reject }),
  } })
  const element = find(tree, node => node?.type?.name === 'InspectionSession')
  const render = () => { cursor = 2; return element.type(element.props) }
  const pending = find(render(), node => node?.type === 'button' && node.children.includes('Open operation browser')).props.onClick()
  const busy = find(render(), node => node?.type === 'button' && node.children.includes('Opening browser…'))
  assert.equal(busy.props.disabled, true)
  rejectOpen(new Error('The native browser bridge is unavailable.'))
  await pending
  const final = render()
  assert.equal(find(final, node => node?.props?.role === 'alert').children[0], 'The native browser bridge is unavailable.')
  assert.equal(find(final, node => node?.type === 'button').props.disabled, false)
})


test('page-reading window keeps its employee and group and does not open the operation browser', () => {
  const calls = [], input = session()
  const tree = ToolInspectionDialog({ inspection: { sessionId: 'research', report: { sessions: [input] } },
    roster: { browser: true, roomsById: { research: { name: 'Research' } } },
    actions: { openBrowser: (...args) => calls.push(args), closeToolInspection: () => calls.push('close') } })
  const element = find(tree, node => node?.type?.name === 'InspectionSession')
  const detail = element.type(element.props)
  find(detail, node => node?.type === 'button' && node.children.includes('Page reading panel')).props.onClick()
  assert.deepEqual(plain(calls), [['writer', { roomId: 'research', label: 'Research' }], 'close'])
})
