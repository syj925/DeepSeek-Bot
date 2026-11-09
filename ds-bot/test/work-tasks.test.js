import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { install } from '../src/host/work-tasks.js'
import { fakeContext } from './fake-ctx.js'

async function setup(t, saved) {
  const root = await mkdtemp(resolve('.dsh-test-work-tasks-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'bot'), workspace = join(root, 'workspace')
  await mkdir(home)
  await mkdir(workspace)
  const ctx = fakeContext()
  t.after(() => ctx.dispose())
  const bots = Object.fromEntries(['chief', 'writer', 'other'].map(id => [id, { id, name: id }]))
  const room = { id: 'room', admin: 'writer', members: ['chief', 'writer'], sessions: { chief: 'gc', writer: 'gw' } }
  const state = { bots, rooms: { room }, workTasks: saved?.workTasks }
  const owners = new Map([['chief', 'chief'], ['writer', 'writer'], ['other', 'other']])
  const groups = new Map([['gc', { botId: 'chief', roomId: 'room' }], ['gw', { botId: 'writer', roomId: 'room' }]])
  const persisted = []
  const rt = { ctx, state, home, live: new Map(), groupOwners: groups,
    load: async () => {}, save: async () => { persisted.push(structuredClone(state)) }, readOnly: () => undefined,
    botOf: id => bots[id], roomOf: id => state.rooms[id], selfOf: id => owners.get(id) ?? groups.get(id)?.botId,
    isBotSession: id => owners.has(id) || groups.has(id), chatOf: id => bots[id].sessionId ?? id,
    resolveAgent: async id => ({ id, session: { id, header: { cwd: workspace } } }),
    warn: () => {}, workTaskBusy: () => false, workTaskSubmissionBlocked: () => false, workTaskAcceptanceBlocked: () => false,
    dispatchWorkTask: async () => {}, acceptWorkTask: async () => {},
  }
  install(rt)
  const create = (extra = {}) => rt.createWorkTask({ sessionId: 'writer', objective: 'Find five companies with source evidence and deliver a CSV.', criteria: ['Exactly five companies; preserve source evidence.'], steps: [{ id: 'research', title: 'Find evidence' }, { id: 'delivery', title: 'Check and deliver' }], ...extra })
  const progress = (task, stepId, status = 'done', checkpoint = 'Saved verified source notes and limitations in the workspace.') => rt.updateWorkTaskProgress({ sessionId: 'writer', taskId: task.id, expectedRevision: task.revision, stepId, status, checkpoint })
  const submit = async task => {
    let current = task
    for (const step of current.steps.filter(item => item.status !== 'done')) current = await progress(current, step.id)
    return rt.submitWorkTask(current.id, { sessionId: 'writer', summary: 'Five rows delivered, source notes included.', title: 'Company list', files: [] })
  }
  return { rt, root, home, workspace, state, bots, room, owners, groups, persisted, create, progress, submit }
}

test('registration preserves user requirements, deduplicates concurrent calls, and binds actual stable employee identity', async t => {
  const h = await setup(t)
  const [a, b] = await Promise.all([h.create(), h.create()])
  assert.equal(a.id, b.id)
  assert.equal(h.rt.workTasksView().length, 1)
  assert.equal(a.ownerBotId, 'writer')
  assert.deepEqual(a.bindings, [{ sessionId: 'writer', botId: 'writer', purpose: 'execution' }])
  assert.equal(a.criteria[0], 'Exactly five companies; preserve source evidence.')
  a.criteria[0] = 'tampered'
  assert.notEqual(h.rt.workTasksView()[0].criteria[0], 'tampered')
  await assert.rejects(h.create({ objective: 'Another outcome' }), /unfinished work/)
  await assert.rejects(h.create({ ownerBotId: 'other' }), /responsible employee/)
  await assert.rejects(h.create({ participantBotIds: ['writer', 'invented'] }), /actual employees/)
})

test('Chief origin links show several group tasks without consuming its execution conversation', async t => {
  const h = await setup(t)
  const task = await h.create({ sessionId: 'chief', ownerBotId: 'writer', roomId: 'room', participantBotIds: ['chief', 'writer'] })
  assert.equal(task.bindings[0].purpose, 'origin')
  assert.equal(h.rt.workTaskForSession('chief'), undefined)
  await assert.rejects(h.rt.updateWorkTaskProgress({ sessionId: 'chief', taskId: task.id, expectedRevision: task.revision, stepId: 'research', status: 'done', checkpoint: 'Claimed work' }), /not assigned/)
  const chiefTask = await h.create({ sessionId: 'chief', objective: 'Independent Chief task', ownerBotId: 'chief' })
  assert.equal(h.rt.workTaskForSession('chief').id, chiefTask.id)
  const bound = await h.rt.bindWorkTaskSession(task.id, { sessionId: 'gw', botId: 'writer', roomId: 'room' })
  const again = await h.rt.bindWorkTaskSession(task.id, { sessionId: 'gw', botId: 'writer', roomId: 'room' })
  assert.equal(bound.revision, again.revision)
  assert.equal(h.rt.workTaskForSession('gw').id, task.id)
  await assert.rejects(h.rt.bindWorkTaskSession(task.id, { sessionId: 'writer', botId: 'writer' }), /another task group/)
  await assert.rejects(h.rt.bindWorkTaskSession(task.id, { sessionId: 'other', botId: 'other' }), /participating employee/)
})

test('ordered checkpoints require evidence text and CAS rejects stale parallel writers', async t => {
  const h = await setup(t)
  const task = await h.create()
  await assert.rejects(h.progress(task, 'delivery'), /preceding steps/)
  await assert.rejects(h.progress(task, 'research', 'done', ' '), /checkpoint summary/)
  const results = await Promise.allSettled([h.progress(task, 'research'), h.progress(task, 'research')])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'bot/stale')
  const next = h.rt.workTasksView()[0]
  assert.equal(next.steps[0].status, 'done')
  await assert.rejects(h.progress(next, 'research'), /silently rewritten/)
  await assert.rejects(h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Done' }), /checkpoint/)
})

test('failed persistence rolls back only the task change and never reports successful progress', async t => {
  const h = await setup(t)
  const task = await h.create()
  h.rt.save = async () => { throw new Error('disk full') }
  await assert.rejects(h.progress(task, 'research'), /disk full/)
  assert.equal(h.state.workTasks[task.id].revision, task.revision)
  assert.equal(h.state.workTasks[task.id].steps[0].status, 'pending')
  h.rt.readOnly = () => 'Opened in another process'
  await assert.rejects(h.progress(task, 'research'), /another process/)
})

test('failure and a fresh module instance preserve partial results and require explicit continuation', async t => {
  const h = await setup(t)
  let task = await h.create()
  task = await h.progress(task, 'research')
  const reopened = await setup(t, structuredClone(h.state))
  assert.equal(reopened.rt.initializeWorkTasks(), true)
  task = reopened.rt.workTasksView()[0]
  assert.equal(task.status, 'blocked')
  assert.equal(task.blocker.code, 'INTERRUPTED')
  assert.equal(task.steps[0].status, 'done')
  assert.equal(reopened.rt.initializeWorkTasks(), false)
  let runs = 0
  reopened.rt.dispatchWorkTask = async saved => {
    runs += 1
    // A dispatcher may bind during delivery without deadlocking the task transaction.
    await reopened.rt.bindWorkTaskSession(saved.id, { sessionId: 'writer', botId: 'writer' })
  }
  await assert.rejects(reopened.progress(task, 'delivery'), /explicitly continue/)
  const results = await Promise.allSettled([1, 2].map(() => reopened.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'resume' })))
  assert.equal(runs, 1)
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(reopened.rt.workTasksView()[0].dispatch.status, 'sent')
  assert.equal(reopened.rt.workTasksView()[0].steps[0].status, 'done')
})

test('dispatch failure retains checkpoints and blocks instead of looping', async t => {
  const h = await setup(t)
  let task = await h.create()
  task = await h.progress(task, 'research')
  task = await h.rt.blockWorkTaskForSession('writer', { code: 'NETWORK', message: 'Network interrupted' })
  let attempts = 0
  h.rt.dispatchWorkTask = async () => { attempts += 1; throw new Error('offline') }
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'resume' })
  assert.equal(attempts, 1)
  assert.equal(task.status, 'blocked')
  assert.equal(task.dispatch.status, 'failed')
  assert.equal(task.steps[0].status, 'done')
})

test('session part replacement keeps task identity and revokes old execution binding', async t => {
  const h = await setup(t)
  const task = await h.create()
  h.bots.writer.sessionId = 'writer-next'
  h.owners.set('writer-next', 'writer')
  h.owners.delete('writer')
  const [next] = await h.rt.replaceWorkTaskSession('writer', 'writer-next')
  assert.equal(next.id, task.id)
  assert.equal(next.bindings.find(item => item.sessionId === 'writer').active, false)
  assert.equal(h.rt.workTaskForSession('writer'), undefined)
  assert.equal(h.rt.workTaskForSession('writer-next').id, task.id)
  await assert.rejects(h.progress(next, 'research'), /current employee/)
})

test('submission saves an immutable verified copy immediately and a later turn error cannot destroy it', async t => {
  const h = await setup(t)
  let task = await h.create()
  task = await h.progress(task, 'research')
  task = await h.progress(task, 'delivery')
  const source = join(h.workspace, '名单.csv')
  await writeFile(source, 'name,source\nExample,https://example.test\n')
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'List delivered; fit still requires business review.', files: [{ path: source }] })
  assert.equal(task.status, 'awaiting_review')
  const file = task.deliveries[0].files[0]
  assert.equal(file.sourcePath, source)
  assert.match(file.sha256, /^[a-f0-9]{64}$/)
  assert.match(file.path, /task-records/)
  await writeFile(source, 'user edited the source')
  assert.match(await readFile(file.path, 'utf8'), /name,source/)
  task = await h.rt.blockWorkTaskForSession('writer', { code: 'STREAM_FAILED' })
  assert.equal(task.status, 'awaiting_review')
  let accepted = 0
  h.rt.acceptWorkTask = async () => { accepted += 1 }
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'accept' })
  assert.equal(task.status, 'completed')
  assert.equal(task.acceptance.postProcess, 'done')
  assert.equal(accepted, 1)
  assert.equal(h.bots.writer.taskExperience, undefined)
})

test('acceptance rejects damaged delivery without overwriting it or marking work completed', async t => {
  const h = await setup(t)
  let task = await h.create()
  for (const step of task.steps) task = await h.progress(task, step.id)
  const source = join(h.workspace, 'report.md')
  await writeFile(source, 'verified report')
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Report submitted', files: [source] })
  await writeFile(task.deliveries[0].files[0].path, 'external edit')
  await assert.rejects(h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'accept' }), /changed or is missing/)
  assert.equal(h.rt.workTasksView()[0].status, 'awaiting_review')
})

test('outputs outside the assigned workspace and symlinked paths are rejected', async t => {
  const h = await setup(t)
  let task = await h.create()
  for (const step of task.steps) task = await h.progress(task, step.id)
  const outside = join(h.root, 'outside.txt')
  await writeFile(outside, 'outside')
  await assert.rejects(h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Not allowed', files: [outside] }), /outside/)
  const linked = join(h.workspace, 'linked')
  await symlink(h.root, linked, 'junction')
  await assert.rejects(h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Not allowed', files: [join(linked, 'outside.txt')] }), /Linked/)
  assert.equal(h.rt.workTasksView()[0].deliveries.length, 0)
})

test('feedback retains prior delivery versions and does not execute until Continue is clicked', async t => {
  const h = await setup(t)
  let task = await h.submit(await h.create())
  let runs = 0
  h.rt.dispatchWorkTask = async () => { runs += 1 }
  const first = structuredClone(task.deliveries[0])
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'rework', note: 'Add an explicit source confidence column.', stepId: 'delivery' })
  assert.equal(runs, 0)
  assert.equal(task.status, 'blocked')
  assert.equal(task.steps[0].status, 'done')
  assert.equal(task.steps[1].status, 'pending')
  assert.ok(task.steps[1].previousCheckpoint)
  assert.deepEqual(task.deliveries[0], first)
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'resume' })
  task = await h.progress(task, 'delivery', 'done', 'Added confidence labels and checked all five rows.')
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Revised output' })
  assert.equal(runs, 1)
  assert.equal(task.deliveries.length, 2)
  assert.deepEqual(task.deliveries[0], first)
  assert.equal(task.deliveries[1].version, 2)
})

test('a newer execution task cannot be hijacked by rework of an old submitted task', async t => {
  const h = await setup(t)
  const previous = await h.submit(await h.create())
  await assert.rejects(h.create({ objective: 'A separate new requested outcome' }), /Start a new task/)
  h.bots.writer.sessionId = 'writer-new'
  h.owners.set('writer-new', 'writer')
  await h.rt.replaceWorkTaskSession('writer', 'writer-new', { detach: true })
  const current = await h.create({ sessionId: 'writer-new', objective: 'A separate new requested outcome' })
  const saved = h.state.workTasks[previous.id]
  await h.rt.controlWorkTask({ taskId: saved.id, expectedRevision: saved.revision, action: 'rework', note: 'Change the old result' })
  await assert.rejects(h.rt.bindWorkTaskSession(saved.id, { sessionId: 'writer-new', botId: 'writer', allowResume: true }), /unfinished work/)
  assert.equal(h.rt.workTaskForSession('writer-new').id, current.id)
  assert.equal(h.state.workTasks[previous.id].bindings.every(binding => binding.active === false), true)
  assert.deepEqual(h.state.workTasks[previous.id].deliveries, previous.deliveries)
})

test('pending work blocks submission and acceptance; failures do not erase checkpoints', async t => {
  const h = await setup(t)
  let task = await h.create()
  for (const step of task.steps) task = await h.progress(task, step.id)
  h.rt.workTaskSubmissionBlocked = () => true
  await assert.rejects(h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Done' }), /still pending/)
  h.rt.workTaskSubmissionBlocked = () => false
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Done' })
  h.rt.workTaskAcceptanceBlocked = () => true
  await assert.rejects(h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'accept' }), /running work/)
  assert.equal(h.state.workTasks[task.id].steps.every(item => item.status === 'done'), true)
})

test('accepted task post-processing is recoverable without redoing task execution', async t => {
  const h = await setup(t)
  let task = await h.submit(await h.create())
  h.rt.acceptWorkTask = async () => { throw new Error('index unavailable') }
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'accept' })
  assert.equal(task.status, 'completed')
  assert.equal(task.acceptance.postProcess, 'pending')
  let calls = 0
  h.rt.acceptWorkTask = async () => { calls += 1 }
  task = await h.rt.repairWorkTaskAcceptance(task.id)
  assert.equal(task.acceptance.postProcess, 'done')
  await h.rt.repairWorkTaskAcceptance(task.id)
  assert.equal(calls, 1)
})

test('real tool entry points enforce employee identity and task scope, and expose no accept tool', async t => {
  const h = await setup(t)
  const call = (name, args, sessionId = 'writer') => h.rt.ctx.registeredTools.get(name).execute(args, { agent: { id: sessionId } })
  const task = JSON.parse(await call('register_task', { objective: 'A saved task', criteria: ['Preserve the requested outcome'], steps: [{ id: 'one', title: 'Deliver' }] }))
  const updated = JSON.parse(await call('update_task_progress', { task_id: task.id, expected_revision: task.revision, step_id: 'one', status: 'done', checkpoint: 'Actual in-chat answer saved and checked.' }))
  assert.equal(updated.steps[0].status, 'done')
  assert.equal(JSON.parse(await call('read_task_record', { task_id: task.id })).id, task.id)
  await assert.rejects(call('read_task_record', { task_id: task.id }, 'other'), /not linked/)
  await assert.rejects(call('register_task', { task_id: task.id }, 'other'), /participating employee/)
  await assert.rejects(call('register_task', { objective: 'Fake', criteria: ['fake'], steps: [{ id: 'a', title: 'Fake' }] }, 'invented'), /current employee/)
  assert.equal(h.rt.ctx.registeredTools.has('accept_task'), false)
})

test('Chief can read origin tasks after a private conversation part switch without gaining execution permission', async t => {
  const h = await setup(t)
  const task = await h.create({ sessionId: 'chief', ownerBotId: 'writer', roomId: 'room', participantBotIds: ['chief', 'writer'] })
  h.bots.chief.sessionId = 'chief-next'
  h.owners.delete('chief')
  h.owners.set('chief-next', 'chief')
  const result = await h.rt.ctx.registeredTools.get('read_task_record').execute({ task_id: task.id }, { agent: { id: 'chief-next' } })
  assert.equal(JSON.parse(result).id, task.id)
  assert.equal(h.rt.workTaskForSession('chief-next'), undefined)
  await assert.rejects(h.rt.updateWorkTaskProgress({ sessionId: 'chief-next', taskId: task.id, expectedRevision: task.revision, stepId: 'research', status: 'done', checkpoint: 'Claimed work' }), /not assigned/)
})

test('a read-only observer does not interrupt tasks running in the owning host', async t => {
  const h = await setup(t)
  const task = await h.create()
  const other = await setup(t, structuredClone(h.state))
  other.rt.readOnly = () => 'The team is open in another host'
  assert.equal(other.rt.initializeWorkTasks(), false)
  assert.equal(other.state.workTasks[task.id].status, 'active')
  const read = await other.rt.ctx.registeredTools.get('read_task_record').execute({ task_id: task.id }, { agent: { id: 'writer' } })
  assert.equal(JSON.parse(read).status, 'active')
  await assert.rejects(other.progress(task, 'research'), /another host/)
  assert.equal(other.persisted.length, 0)
})

test('finalize uses CAS and compensates accepted task bookkeeping exactly once without dispatching work', async t => {
  const h = await setup(t)
  let task = await h.submit(await h.create())
  h.rt.acceptWorkTask = async () => { throw new Error('index unavailable') }
  task = await h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'accept' })
  const staleRevision = task.revision - 1
  let calls = 0, dispatches = 0
  h.rt.acceptWorkTask = async () => { calls += 1 }
  h.rt.dispatchWorkTask = async () => { dispatches += 1 }
  await assert.rejects(h.rt.controlWorkTask({ taskId: task.id, expectedRevision: staleRevision, action: 'finalize' }), { code: 'bot/stale' })
  const responses = await Promise.allSettled([1, 2].map(() => h.rt.controlWorkTask({ taskId: task.id, expectedRevision: task.revision, action: 'finalize' })))
  assert.equal(responses.filter(value => value.status === 'fulfilled').length, 1)
  assert.equal(calls, 1)
  assert.equal(dispatches, 0)
  assert.equal(h.state.workTasks[task.id].acceptance.postProcess, 'done')
  const accepted = h.rt.workTasksView()[0]
  await assert.rejects(h.rt.controlWorkTask({ taskId: accepted.id, expectedRevision: accepted.revision, action: 'finalize' }), /does not need/)
})

test('an archive directory junction cannot redirect delivery snapshots outside Bot storage', async t => {
  const h = await setup(t)
  let task = await h.create()
  for (const step of task.steps) task = await h.progress(task, step.id)
  const outside = join(h.root, 'outside-archive')
  await mkdir(outside)
  await symlink(outside, join(h.home, 'task-records'), 'junction')
  const source = join(h.workspace, 'report.txt')
  await writeFile(source, 'The actual result')
  await assert.rejects(h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'No redirected archive', files: [source] }), /archive directory is linked/)
  await assert.rejects(readFile(join(outside, task.id)), { code: 'ENOENT' })
  assert.equal(h.rt.workTasksView()[0].deliveries.length, 0)
})

test('a delayed old turn error cannot block a new task or a newer execution epoch', async t => {
  const h = await setup(t)
  const delivered = await h.submit(await h.create())
  const oldFailure = h.rt.blockWorkTaskForSession('writer', { code: 'OLD_ERROR', epoch: 1, turn: 1 })
  h.bots.writer.sessionId = 'writer-new'
  h.owners.set('writer-new', 'writer')
  await h.rt.replaceWorkTaskSession('writer', 'writer-new', { detach: true })
  const current = await h.create({ sessionId: 'writer-new', objective: 'A new independent outcome' })
  await oldFailure
  assert.equal(h.state.workTasks[current.id].status, 'active')
  assert.equal(h.state.workTasks[delivered.id].status, 'awaiting_review')
  h.rt.live.set('writer-new', { taskEpoch: 3, turn: 3 })
  await h.rt.blockWorkTaskForSession('writer-new', { code: 'OLD_ERROR', epoch: 2, turn: 2 })
  assert.equal(h.state.workTasks[current.id].status, 'active')
  const failure = h.rt.blockWorkTaskForSession('writer-new', { code: 'OLD_ERROR', epoch: 3, turn: 3 })
  h.rt.live.get('writer-new').taskEpoch = 4
  h.rt.live.get('writer-new').turn = 4
  await failure
  assert.equal(h.state.workTasks[current.id].status, 'active')
})

test('a task group cannot replace an unaccepted task with a different outcome', async t => {
  const h = await setup(t)
  let task = await h.create({ sessionId: 'chief', ownerBotId: 'writer', roomId: 'room', participantBotIds: ['chief', 'writer'] })
  task = await h.rt.bindWorkTaskSession(task.id, { sessionId: 'gw', botId: 'writer', roomId: 'room' })
  for (const step of task.steps) task = await h.rt.updateWorkTaskProgress({ sessionId: 'gw', taskId: task.id, expectedRevision: task.revision, stepId: step.id, status: 'done', checkpoint: 'Saved actual combined work for this step.' })
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'gw', summary: 'Submitted for business acceptance' })
  await assert.rejects(h.create({ sessionId: 'chief', ownerBotId: 'writer', roomId: 'room', participantBotIds: ['chief', 'writer'], objective: 'Unrelated second task' }), /unaccepted task/)
  assert.equal(h.rt.workTasksView().length, 1)
  assert.equal(h.state.workTasks[task.id].status, 'awaiting_review')
})

test('registering a task in an ordinary group links the saved record before binding execution', async t => {
  const h = await setup(t)
  let linked
  h.rt.linkWorkTaskToRoom = async task => {
    assert.equal(h.state.workTasks[task.id].id, task.id)
    linked = task.id
    h.room.task = { objective: task.objective, status: 'active', workTaskId: task.id }
  }
  const raw = await h.rt.ctx.registeredTools.get('register_task').execute({ objective: 'Turn this discussion into a real task', criteria: ['Save the delivery for review'], steps: [{ id: 'write', title: 'Write the result' }] }, { agent: { id: 'gw' } })
  const task = JSON.parse(raw)
  assert.equal(linked, task.id)
  assert.equal(h.rt.workTaskForSession('gw').id, task.id)
  assert.equal(h.room.task.workTaskId, task.id)
})

test('Windows delivery paths may differ in letter case from the assigned workspace', { skip: process.platform !== 'win32', timeout: 5000 }, async t => {
  const h = await setup(t)
  let task = await h.create()
  for (const step of task.steps) task = await h.progress(task, step.id)
  const source = join(h.workspace, 'Report.txt')
  await writeFile(source, 'Verified result with a mixed-case path.')
  task = await h.rt.submitWorkTask(task.id, { sessionId: 'writer', summary: 'Mixed-case delivery', files: [source.toUpperCase()] })
  assert.equal(task.status, 'awaiting_review')
  assert.equal(await readFile(task.deliveries[0].files[0].path, 'utf8'), 'Verified result with a mixed-case path.')
})
