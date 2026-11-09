// Real Bot Host with a local deterministic model. Never runs against desktop data.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
process.env.DS_BOT_TEST_BENCH ??= '.dsh-test-task-isolation-20261109'
const { WorkTaskBench, HOME, digest } = await import('./work-tasks-smoke.mjs')
const bench = new WorkTaskBench()
const sentinel = 'OLD_CUSTOMER_CONTEXT_SENTINEL'
const workspace = `${HOME}-workspace`
let worker, chief, oldTask, newTask, savedExperience, archivedDelivery
const current = async id => (await bench.tasks()).find(task => task.id === id)
const part = () => bench.state().bots[worker.id].sessionId ?? worker.id
const send = async text => {
  const before = bench.calls().length
  await bench.api('send', { sessionId: worker.id, text })
  await bench.settle()
  return bench.calls().slice(before)
}
const startNew = async () => {
  const before = part(), count = bench.calls().length
  const next = await bench.api('start-new-task', { botId: worker.id, expectedSessionId: before })
  await bench.settle()
  assert.notEqual(next.sessionId, before)
  assert.equal(part(), next.sessionId)
  assert.equal(bench.calls().length, count, 'An empty context switch must not send a model request')
  return next.sessionId
}
try {
  await bench.prepare()
  const patch = join(HOME, 'bench.patch.yml')
  writeFileSync(patch, readFileSync(patch, 'utf8').replace('    presetOrganization: false', '    presetOrganization: false\n    memoryReview: false'))
  bench.env.MOCK_WATCH = sentinel
  bench.env.MOCK_LOG_CHARS = '24000'
  await bench.start()
  await bench.step('initialize employee and durable memories in an isolated real Host', async () => {
    mkdirSync(workspace, { recursive: true })
    const initial = await bench.api('state')
    chief = initial.bots[0]
    await bench.api('update-bot', { id: chief.id, model: initial.models.at(-1).ref })
    worker = await bench.api('create-bot', { name: 'Isolation Researcher', role: 'Fixture reviewer', instructions: 'Use only explicit test instructions and mock fixtures.', workDir: workspace })
    await bench.settle()
    await bench.tool(worker.id, 'remember', { text: `${sentinel}: this old customer required ten names.` })
    await bench.tool(chief.id, 'remember', { scope: 'team', text: `${sentinel}: a previous team delivery used an old filter.` })
    const empty = await bench.api('job-experience-view', { botId: worker.id })
    savedExperience = await bench.api('job-experience-save', { botId: worker.id, revision: empty.revision, action: 'add', text: 'For fixture CSV delivery, read back the file and check source links.' })
    await bench.tool(worker.id, 'register_task', { objective: `${sentinel}: find ten old companies.`, criteria: ['Keep old sources'], steps: [{ id: 'collect', title: 'Collect' }, { id: 'deliver', title: 'Deliver' }] })
    oldTask = (await bench.tasks()).find(task => task.ownerBotId === worker.id)
    await bench.tool(worker.id, 'update_task_progress', { task_id: oldTask.id, expected_revision: oldTask.revision, step_id: 'collect', status: 'done', checkpoint: `${sentinel}: two old sources verified.` })
    oldTask = await current(oldTask.id)
    const calls = await send('继续当前任务：Keep this old task unchanged for now.')
    assert(calls.some(call => call.watchHit === true))
    return { oldPromptContainsSentinel: true, savedCheckpoint: true, experienceCount: savedExperience.entries.length }
  })
  await bench.step('new task has no old messages, summaries or bulk memories in its actual model request', async () => {
    const previous = part(), count = bench.calls().length
    await send('A completely different task: reply with a short greeting.')
    let pending = (await bench.api('state')).taskInputs[worker.id]
    assert(pending && !pending.sending)
    assert.equal(bench.calls().length, count, 'Ambiguous input must not reach the model before a user choice')
    await bench.restart()
    pending = (await bench.api('state')).taskInputs[worker.id]
    assert.match(pending.text, /short greeting/)
    await bench.api('resolve-task-input', { botId: worker.id, requestId: pending.id, decision: 'new' })
    await bench.settle()
    assert.notEqual(part(), previous)
    await assert.rejects(bench.api('start-new-task', { botId: worker.id, expectedSessionId: previous }), /conversation changed/)
    const calls = bench.calls().slice(count)
    assert(calls.length > 0)
    assert(calls.every(call => call.watchHit === false))
    const saved = await current(oldTask.id)
    assert.equal(saved.status, 'blocked')
    assert(['TASK_SWITCHED', 'INTERRUPTED'].includes(saved.blocker.code))
    assert.deepEqual(saved.steps, oldTask.steps)
    assert(saved.bindings.every(binding => binding.active === false))
    assert.deepEqual(await bench.api('job-experience-view', { botId: worker.id }), savedExperience)
    assert.equal(bench.state().bots[chief.id].sessionId ?? chief.id, chief.sessionId ?? chief.id)
    return { observedModelCalls: calls.length, oldContextAbsent: true, oldTaskAndExperienceRetained: true }
  })
  await bench.step('explicit new-task language switches once without asking or carrying the old task', async () => {
    const previous = part()
    const calls = await send('新任务：只回复一句问候。')
    assert.notEqual(part(), previous)
    assert.equal((await bench.api('state')).taskInputs[worker.id], undefined)
    assert(calls.length > 0 && calls.length < 4)
    assert(calls.every(call => call.watchHit === false))
    return { automaticallySwitched: true, noRepeatedSwitch: true }
  })
  await bench.step('default task reads stay empty while relevant job experience is available on demand', async () => {
    let before = bench.calls().length
    await bench.tool(worker.id, 'read_task_record', {})
    assert(bench.calls().slice(before).every(call => call.watchHit === false))
    before = bench.calls().length
    await bench.tool(worker.id, 'recall', { topic: 'task-lessons', query: 'fixture source' })
    const calls = bench.calls().slice(before)
    assert(calls.every(call => call.watchHit === false))
    assert(JSON.stringify(calls).includes('read back the file and check source links'))
    return { noImplicitHistory: true, relevantExperienceRetrieved: true }
  })
  await bench.step('explicitly continuing an old task restores only its selected saved task record', async () => {
    const saved = await current(oldTask.id), previous = part()
    const resumed = await bench.api('control-work-task', { taskId: saved.id, expectedRevision: saved.revision, action: 'resume' })
    await bench.settle()
    assert.notEqual(part(), previous)
    assert.equal(resumed.status, 'active')
    assert.equal((await current(oldTask.id)).dispatch.status, 'sent')
    const before = bench.calls().length
    await bench.tool(worker.id, 'read_task_record', { task_id: oldTask.id })
    assert(bench.calls().slice(before).some(call => call.watchHit === true), 'Selected history should be available only after explicit continuation/read')
    await startNew()
    return { separateContext: true, explicitHistoryRestored: true }
  })
  await bench.step('private acceptance archives the actual file and resets without losing history or experience', async () => {
    await bench.tool(worker.id, 'register_task', { objective: 'Deliver one checked fixture CSV.', criteria: ['One fixture row with a source'], steps: [{ id: 'deliver', title: 'Check and deliver' }] })
    newTask = (await bench.tasks()).find(task => task.id !== oldTask.id)
    await bench.tool(worker.id, 'update_task_progress', { task_id: newTask.id, expected_revision: newTask.revision, step_id: 'deliver', status: 'done', checkpoint: 'Checked the fixture row and source column.' })
    const path = join(workspace, 'checked.csv'), bytes = 'company,source\nFixture,https://example.test\n'
    writeFileSync(path, bytes)
    await bench.tool(worker.id, 'complete_task', { task_id: newTask.id, title: 'Checked fixture', summary: `${sentinel}: accepted old delivery summary.`, files: [path] })
    newTask = await current(newTask.id)
    assert.equal(newTask.status, 'awaiting_review')
    archivedDelivery = structuredClone(newTask.deliveries.at(-1))
    const previous = part(), count = bench.calls().length
    newTask = await bench.api('control-work-task', { taskId: newTask.id, expectedRevision: newTask.revision, action: 'accept' })
    await bench.settle()
    assert.equal(newTask.status, 'completed')
    assert.equal(newTask.acceptance.postProcess, 'done')
    assert.notEqual(part(), previous)
    assert.equal(bench.calls().length, count)
    assert.deepEqual(newTask.deliveries.at(-1), archivedDelivery)
    const file = await bench.api('work-task-file', { taskId: newTask.id, deliveryId: archivedDelivery.id, fileIndex: 0 })
    assert.equal(digest(Buffer.from(file.base64, 'base64')), digest(bytes))
    assert(bench.state().bots[worker.id].taskIndex.some(item => item.workTaskId === newTask.id || item.key.includes(newTask.id)))
    const calls = await send('New daily task: say hello only.')
    assert(calls.length && calls.every(call => call.watchHit === false))
    assert.deepEqual(await bench.api('job-experience-view', { botId: worker.id }), savedExperience)
    return { resetAfterAcceptance: true, archivedFileVerified: true, nextRequestHasNoOldContext: true }
  })
  await bench.step('restart preserves isolation, task history and editable job experience', async () => {
    const previous = part(), calls = bench.calls().length
    await bench.restart()
    await bench.settle()
    assert.equal(part(), previous)
    assert.equal(bench.calls().length, calls)
    assert.equal((await current(oldTask.id)).status, 'blocked')
    assert.equal((await current(newTask.id)).status, 'completed')
    assert.deepEqual((await current(newTask.id)).deliveries.at(-1), archivedDelivery)
    assert.deepEqual(await bench.api('job-experience-view', { botId: worker.id }), savedExperience)
    const freshCalls = await send('Continue the new greeting request.')
    assert(freshCalls.length && freshCalls.every(call => call.watchHit === false))
    return { persisted: true, noAutomaticResume: true }
  })
  await bench.step('old model errors can be marked handled without running the failed work again', async () => {
    await send('报错')
    const failure = (await bench.api('state')).modelFailures.find(item => item.botId === worker.id)
    assert(failure)
    const before = bench.calls().length
    await bench.api('recover-failure', { id: failure.id, action: 'handled' })
    assert.equal((await bench.api('state')).modelFailures.some(item => item.id === failure.id), false)
    assert.equal(bench.state().modelFailures.find(item => item.id === failure.id).resolution, 'user-handled')
    assert.equal(bench.calls().length, before)
    return { pendingRemoved: true, historyRetained: true, noReplay: true }
  })
  await bench.step('a successful later reply clears an old-part error, but the context handoff alone does not', async () => {
    await startNew()
    await send('报错')
    const failure = (await bench.api('state')).modelFailures.find(item => item.botId === worker.id)
    assert(failure)
    await startNew()
    assert((await bench.api('state')).modelFailures.some(item => item.id === failure.id))
    await send('Say a short greeting.')
    assert.equal((await bench.api('state')).modelFailures.some(item => item.id === failure.id), false)
    assert.equal(bench.state().modelFailures.find(item => item.id === failure.id).resolution, 'successful-reply')
    return { automaticRecovery: true, handoffNotMistakenForRecovery: true }
  })
  writeFileSync(join(HOME, 'task-isolation-report.json'), JSON.stringify({ passed: true, mockOnly: true, results: bench.results }, null, 2))
  console.log(`Passed ${bench.results.length} real-Host isolation checks.`)
} catch (error) { console.error(error.stack); process.exitCode = 1 }
finally { await bench.stop() }
