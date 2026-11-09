import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { indexRoster } from '../src/client/sources.js'

const { outputFiles } = await build({ entryPoints: ['src/client/work-tasks.js'], bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'] })
const plain = value => JSON.parse(JSON.stringify(value))
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.children?.map(text).join('') ?? ''
const nodes = (node, match) => !node || typeof node !== 'object' ? [] : [...(match(node) ? [node] : []), ...(node.children ?? []).flatMap(child => nodes(child, match))]
const button = (tree, label) => nodes(tree, node => node.type === 'button' && text(node) === label)[0]
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function runtime() {
  const slots = [], effects = [], copied = []
  let cursor = 0, mounted = true, lateUpdates = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== null && value !== undefined && value !== false) }),
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { if (!mounted) lateUpdates++; cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(run, deps) {
      const at = cursor++, previous = slots[at]
      if (previous && deps.length === previous.deps.length && deps.every((value, index) => Object.is(value, previous.deps[index]))) return
      const cell = slots[at] = { deps }
      effects.push(() => { previous?.cleanup?.(); cell.cleanup = run() })
    },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => react, navigator: { clipboard: { writeText: async value => { copied.push(value) } } } })
  return { ...module.exports, copied,
    draw(component, props) { cursor = 0; const tree = component(props); for (const run of effects.splice(0)) run(); return tree },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.() },
    get lateUpdates() { return lateUpdates },
  }
}

function task(overrides = {}) {
  return { id: 'task-a', revision: 4, title: 'Find manufacturers', objective: 'Find three matching manufacturers', criteria: ['Public source required'],
    ownerBotId: 'chief', participantBotIds: ['chief', 'researcher'], roomId: 'sales-group',
    bindings: [{ sessionId: 'research-old', botId: 'researcher', purpose: 'execution', roomId: 'sales-group', active: false }],
    status: 'blocked', blocker: { code: 'SOURCE_UNAVAILABLE', message: 'Source did not respond' },
    steps: [{ id: 'search', title: 'Collect candidates', status: 'done', checkpoint: 'Two companies saved' }, { id: 'verify', title: 'Verify sources', status: 'blocked', checkpoint: 'One source still missing' }],
    deliveries: [], createdAt: 10, updatedAt: 20, ...overrides }
}
const delivery = { id: 'delivery-a', version: 1, title: 'Customer list', summary: 'Three source-backed candidates', at: 20,
  files: [{ path: '/task-records/snapshot.csv', sourcePath: '/workspace/list.csv', name: 'list.csv', sha256: 'abc', size: 16 }] }

test('task mapping follows stable employee identity and keeps group views scoped', () => {
  const app = runtime()
  const one = task(), two = task({ id: 'task-b', roomId: 'other-group', bindings: [], createdAt: 30 })
  const roster = indexRoster({ bots: [{ id: 'researcher', sessionId: 'research-current', parts: ['research-old'] }], rooms: [{ id: 'sales-group' }, { id: 'other-group' }], workTasks: [one, two] })
  assert.deepEqual(plain(app.workTasksForConversation('research-current', roster).map(item => item.id)), ['task-b', 'task-a'])
  assert.deepEqual(plain(app.workTasksForConversation('research-old', roster).map(item => item.id)), ['task-b', 'task-a'])
  assert.deepEqual(plain(app.workTasksForConversation('sales-group', roster).map(item => item.id)), ['task-a'])
  assert.equal(app.workTasksForConversation('unrelated', roster).length, 0)
  assert.equal(app.workTasksForConversation('researcher', { ...roster, workTasks: undefined }).length, 0)
})

test('blocked work retains checkpoints and continues only after an explicit versioned action', async () => {
  const app = runtime(), calls = []
  const props = { task: task(), actions: { controlWorkTask: async payload => { calls.push(payload) } } }
  let tree = app.draw(app.WorkTaskDetails, props)
  assert.match(text(tree), /Two companies saved/)
  assert.match(text(tree), /One source still missing/)
  assert.match(text(tree), /SOURCE_UNAVAILABLE/)
  assert.equal(calls.length, 0)
  await button(tree, 'Copy error details').props.onClick()
  assert.match(app.copied[0], /SOURCE_UNAVAILABLE/)
  await button(tree, 'Continue unfinished steps').props.onClick()
  assert.deepEqual(plain(calls), [{ taskId: 'task-a', expectedRevision: 4, action: 'resume' }])
  tree = app.draw(app.WorkTaskDetails, props)
  assert.equal(tree.props['data-task-status'], 'blocked')
})

test('review accepts saved delivery with its revision and never marks it complete optimistically', async () => {
  const app = runtime(), calls = []
  const props = { task: task({ status: 'awaiting_review', blocker: undefined, deliveries: [delivery] }), actions: { controlWorkTask: async payload => { calls.push(payload) } } }
  let tree = app.draw(app.WorkTaskDetails, props)
  await button(tree, 'Accept delivery').props.onClick()
  assert.deepEqual(plain(calls), [{ taskId: 'task-a', expectedRevision: 4, action: 'accept' }])
  tree = app.draw(app.WorkTaskDetails, props)
  assert.equal(tree.props['data-task-status'], 'awaiting_review')
  assert.equal(button(app.draw(app.WorkTaskDetails, { ...props, task: { ...props.task, status: 'completed' } }), 'Accept delivery'), undefined)
})

test('change requests save feedback without resuming and retain previous delivery versions', async () => {
  const app = runtime(), calls = []
  const props = { task: task({ status: 'awaiting_review', blocker: undefined, deliveries: [delivery] }), actions: { controlWorkTask: async payload => { calls.push(payload) } } }
  let tree = app.draw(app.WorkTaskDetails, props)
  button(tree, 'Request changes').props.onClick()
  tree = app.draw(app.WorkTaskDetails, props)
  assert.match(text(tree), /Review from the first step/)
  assert.match(text(tree), /selected step and all following steps return to pending/)
  nodes(tree, node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Check the second company again' } })
  nodes(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'verify' } })
  tree = app.draw(app.WorkTaskDetails, props)
  nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(plain(calls), [{ taskId: 'task-a', expectedRevision: 4, action: 'rework', note: 'Check the second company again', stepId: 'verify' }])
  tree = app.draw(app.WorkTaskDetails, { ...props, task: { ...props.task, revision: 5, status: 'blocked', feedback: { note: 'Check the second company again', stepId: 'verify' } } })
  assert.match(text(tree), /no work has restarted/)
  assert.match(text(tree), /Version 1/)
  assert.ok(button(tree, 'Continue unfinished steps'))
  assert.equal(calls.length, 1)
})

test('a stale or failed control retains saved work and duplicate pending clicks are suppressed', async () => {
  const app = runtime(), pending = deferred(), calls = []
  const props = { task: task(), actions: { controlWorkTask: payload => { calls.push(payload); return pending.promise } } }
  let tree = app.draw(app.WorkTaskDetails, props)
  const first = button(tree, 'Continue unfinished steps').props.onClick()
  await button(tree, 'Continue unfinished steps').props.onClick()
  assert.equal(calls.length, 1)
  pending.reject(new Error('This task changed. Refresh it.'))
  await first
  tree = app.draw(app.WorkTaskDetails, props)
  assert.match(text(nodes(tree, node => node.props.role === 'alert')[0]), /This task changed/)
  assert.match(text(tree), /Two companies saved/)
})

test('accepted deliveries distinguish pending or failed finalization from synchronized history', () => {
  const app = runtime(), base = task({ status: 'completed', blocker: undefined, deliveries: [delivery] })
  const props = { task: { ...base, acceptance: { postProcess: 'pending' } }, actions: {} }
  let tree = app.draw(app.WorkTaskDetails, props)
  assert.match(text(tree), /Accepted by you/)
  assert.match(text(tree), /history and archive updates are still pending/)
  assert.equal(nodes(tree, node => node.props['data-task-finalization'] === 'pending').length, 1)
  tree = app.draw(app.WorkTaskDetails, { ...props, task: { ...base, acceptance: { postProcess: 'pending', error: 'Index unavailable' } } })
  assert.match(text(tree), /updating task history or the archive failed/)
  assert.match(text(tree), /Index unavailable/)
  assert.match(text(tree), /Version 1/)
  assert.equal(button(tree, 'Accept delivery'), undefined)
  tree = app.draw(app.WorkTaskDetails, { ...props, task: { ...base, acceptance: { postProcess: 'done' } } })
  assert.equal(nodes(tree, node => node.props['data-task-finalization']).length, 0)
  assert.equal(button(tree, 'Retry task record sync'), undefined)
})

test('retrying record sync only finalizes the accepted task at the displayed revision', async () => {
  const app = runtime(), calls = []
  const props = { task: task({ status: 'completed', revision: 9, blocker: undefined, deliveries: [delivery],
    acceptance: { postProcess: 'pending', error: 'Index unavailable' } }), actions: { controlWorkTask: async payload => { calls.push(payload) } } }
  const tree = app.draw(app.WorkTaskDetails, props)
  await button(tree, 'Retry task record sync').props.onClick()
  assert.deepEqual(plain(calls), [{ taskId: 'task-a', expectedRevision: 9, action: 'finalize' }])
  assert.equal(button(tree, 'Accept delivery'), undefined)
  assert.equal(button(tree, 'Continue unfinished steps'), undefined)
  assert.equal(app.draw(app.WorkTaskDetails, props).props['data-task-status'], 'completed')
})

test('task selection survives updates and newly created records', () => {
  const app = runtime(), one = task(), two = task({ id: 'task-b', title: 'Another task' })
  let tree = app.draw(app.ConversationWorkTasks, { tasks: [one, two], actions: {} })
  nodes(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'task-b' } })
  tree = app.draw(app.ConversationWorkTasks, { tasks: [task({ id: 'task-c' }), { ...two, revision: 6 }, one], actions: {} })
  assert.equal(nodes(tree, node => node.type === app.WorkTaskDetails)[0].props.task.id, 'task-b')
  assert.equal(nodes(tree, node => node.type === app.WorkTaskDetails)[0].props.task.revision, 6)
})

test('saved version downloads use task and delivery indices rather than an arbitrary path', async () => {
  const app = runtime(), downloads = []
  const older = { ...delivery, id: 'delivery-old', version: 1 }, newer = { ...delivery, id: 'delivery-new', version: 2 }
  const props = { task: task({ status: 'completed', deliveries: [older, newer] }), actions: { downloadWorkTaskFile: async payload => { downloads.push(payload) } } }
  const tree = app.draw(app.WorkTaskDetails, props)
  const versions = nodes(tree, node => node.props['data-delivery-id'])
  assert.deepEqual(plain(versions.map(item => item.props['data-delivery-id'])), ['delivery-new', 'delivery-old'])
  await nodes(versions[1], node => node.type === 'button')[0].props.onClick()
  assert.deepEqual(plain(downloads), [{ taskId: 'task-a', deliveryId: 'delivery-old', fileIndex: 0 }])
  assert.equal(button(tree, 'Request changes'), undefined)
})

test('snapshot download cleans up its link and object URL, including failed clicks', () => {
  const app = runtime(), events = [], timers = []
  const link = { click() { events.push('click') }, remove() { events.push('remove') } }
  const env = { atob: value => Buffer.from(value, 'base64').toString('binary'), Blob,
    URL: { createObjectURL: () => 'blob:saved', revokeObjectURL: value => events.push(value) },
    document: { createElement: () => link, body: { append: () => events.push('append') } }, setTimeout: run => timers.push(run) }
  app.saveTaskSnapshotDownload({ name: 'old.csv', base64: Buffer.from('one,two').toString('base64') }, env)
  assert.equal(link.download, 'old.csv')
  assert.deepEqual(events, ['append', 'click', 'remove'])
  timers.shift()(); assert.equal(events.at(-1), 'blob:saved')
  link.click = () => { throw new Error('Download unavailable') }
  assert.throws(() => app.saveTaskSnapshotDownload({ name: 'old.csv', base64: '' }, env), /Download unavailable/)
  timers.shift()(); assert.equal(events.at(-1), 'blob:saved')
})

test('legacy file entry points recognize snapshots without confusing them with editable source files', () => {
  const app = runtime(), roster = { workTasks: [task({ deliveries: [delivery] })] }
  assert.deepEqual(plain(app.savedWorkTaskFile(roster, {}, { path: delivery.files[0].path })), { taskId: 'task-a', deliveryId: 'delivery-a', fileIndex: 0 })
  assert.equal(app.savedWorkTaskFile(roster, {}, { path: delivery.files[0].sourcePath }), null)
  assert.equal(app.savedWorkTaskFile(roster, { workTaskId: 'other-task' }, { path: delivery.files[0].path }), null)
  assert.equal(app.savedWorkTaskFile(roster, { deliveryId: 'other-version' }, { path: delivery.files[0].path }), null)
})

test('closing the panel while control is pending never writes state after unmount', async () => {
  const app = runtime(), pending = deferred()
  const tree = app.draw(app.WorkTaskDetails, { task: task(), actions: { controlWorkTask: () => pending.promise } })
  const done = button(tree, 'Continue unfinished steps').props.onClick()
  app.unmount(); pending.reject(new Error('Connection lost')); await done
  assert.equal(app.lateUpdates, 0)
})
