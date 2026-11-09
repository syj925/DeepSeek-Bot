// Isolated real-Host smoke for independent Bot tasks. The only model is the
// local scripted mock; profile data and all outputs stay below this checkout.
// Run from ds-bot: node dev/work-tasks-smoke.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = dirname(dirname(fileURLToPath(import.meta.url)))
const ROOT = dirname(PLUGIN)
const BENCH_NAME = process.env.DS_BOT_TEST_BENCH ?? '.dsh-test-work-tasks-20261109'
assert(/^\.dsh-test-[a-z0-9-]+$/.test(BENCH_NAME), 'Test data must use an isolated .dsh-test-* directory.')
const HOME = join(ROOT, BENCH_NAME)
const CLI = join(PLUGIN, 'dev/harness/node_modules/@deepseek-ai/dsh/lib/bin.js')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const digest = value => createHash('sha256').update(value).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

export class WorkTaskBench {
  processes = new Map()
  results = []
  cookie = ''

  async prepare() {
    assert.equal(resolve(HOME), join(resolve(ROOT), BENCH_NAME))
    assert(existsSync(CLI), 'Install the pinned mock test harness first.')
    assert(!existsSync(join(HOME, 'bot/state.json')), 'An earlier isolated run exists. Inspect and archive it before starting a fresh run.')
    const profile = join(HOME, 'profiles/web')
    mkdirSync(profile, { recursive: true })
    mkdirSync(join(HOME, 'tmp'), { recursive: true })
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    const linkedBot = join(profile, 'node_modules/ds-bot')
    if (!existsSync(linkedBot)) symlinkSync(PLUGIN, linkedBot, process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-work-task-smoke', private: true,
      dependencies: { 'ds-bot': `link:${PLUGIN.replaceAll('\\', '/')}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'ds-bot'] } },
    }, null, 2))
    writeFileSync(join(HOME, 'bench.patch.yml'), [
      '- id: bot', '  config:', '    checkRatio: 0.45', '    presetOrganization: false',
      '- id: llm-deepseek', '  config:', '    models:',
      '      - { id: deepseek-flash, contextWindow: 100000, maxTokens: 8000, inputModalities: [text, image] }',
      '      - { id: deepseek-v4-pro, contextWindow: 100000, maxTokens: 8000 }',
      '- id: ui-chat', '  config:', '    transcriptView: compact', '',
    ].join('\n'))
    this.mockPort = await freePort()
    this.webPort = await freePort()
    this.base = `http://127.0.0.1:${this.webPort}`
    // Do not make inherited provider credentials available to a test process.
    this.env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/.test(key)))
    Object.assign(this.env, {
      DSH_HOME: HOME, TEMP: join(HOME, 'tmp'), TMP: join(HOME, 'tmp'),
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${this.mockPort}/v1`, DEEPSEEK_API_KEY: 'mock-key',
      MOCK_PORT: String(this.mockPort), MOCK_DELAY_MS: '30', MOCK_LOG: join(HOME, 'mock.jsonl'),
      MOCK_LOG_TOOLS: '1', MOCK_WORK_TASKS: '1', CONTEXT_WINDOW: '100000', CHECK_RATIO: '0.45',
    })
  }

  startProcess(name, args) {
    const output = openSync(join(HOME, `${name}.log`), 'a')
    const errors = openSync(join(HOME, `${name}.err`), 'a')
    const child = spawn(process.execPath, args, { cwd: ROOT, env: this.env, windowsHide: true, stdio: ['ignore', output, errors] })
    closeSync(output); closeSync(errors)
    this.processes.set(name, child)
    child.on('error', error => { this.startError = error })
    writeFileSync(join(HOME, 'runtime.json'), JSON.stringify({
      home: HOME, webPort: this.webPort, mockPort: this.mockPort,
      pids: Object.fromEntries([...this.processes].map(([key, value]) => [key, value.pid])),
    }, null, 2))
  }

  async start() {
    this.startProcess('mock', [join(PLUGIN, 'dev/mock-llm.mjs'), HOME])
    await this.startWeb()
  }

  async startWeb() {
    this.startProcess('web', ['--expose-internals', CLI, '--profile', 'web', '--patch', join(HOME, 'bench.patch.yml'), '--no-open', '--port', String(this.webPort)])
    const started = Date.now()
    while (Date.now() - started < 45000) {
      if (this.startError) throw this.startError
      const web = this.processes.get('web')
      if (web.exitCode !== null) throw new Error(`Isolated Host exited (${web.exitCode}); inspect its local logs.`)
      const log = readFileSync(join(HOME, 'web.log'), 'utf8')
      const urls = [...log.matchAll(new RegExp(`http://127\\.0\\.0\\.1:${this.webPort}/\\?token=[^\\s]+`, 'g'))]
      const url = urls.at(-1)?.[0]
      if (url) {
        try {
          const response = await fetch(url, { redirect: 'manual' })
          const cookies = response.headers.getSetCookie().map(cookie => cookie.split(';')[0])
          if (cookies.length) { this.cookie = cookies.join('; '); return }
        } catch { /* The listener may still be starting. */ }
      }
      await sleep(150)
    }
    throw new Error('Isolated Host did not become ready; inspect its local logs.')
  }

  async stopProcess(name) {
    const child = this.processes.get(name)
    if (!child) return
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      else child.kill('SIGTERM')
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)])
    }
    this.processes.delete(name)
  }

  async restart() {
    await this.stopProcess('web')
    writeFileSync(join(HOME, 'web.log'), '')
    await this.startWeb()
  }

  async stop() {
    await this.stopProcess('web')
    await this.stopProcess('mock')
    writeFileSync(join(HOME, 'runtime.json'), JSON.stringify({ home: HOME, stopped: true }, null, 2))
  }

  async api(endpoint, payload = {}, cookie = this.cookie) {
    const response = await fetch(`${this.base}/api/bot`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ endpoint, payload }),
    })
    const result = await response.json()
    if (!result.ok) throw Object.assign(new Error(`${endpoint}: ${result.error?.message ?? 'Request failed'}`), { code: result.error?.code })
    return result.value
  }

  state() { return json(join(HOME, 'bot/state.json')) }
  calls() {
    const path = join(HOME, 'mock.jsonl')
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }
  tasks() { return this.api('work-tasks') }

  async settle() {
    let calls = this.calls().length, since = Date.now()
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      const state = await this.api('state')
      const count = this.calls().length
      if (count !== calls || Object.keys(state.activity ?? {}).length) { calls = count; since = Date.now() }
      else if (Date.now() - since >= 800) return state
      await sleep(100)
    }
    throw new Error('Isolated task execution did not settle.')
  }

  async tool(sessionId, name, input) {
    const before = this.calls().length
    await this.api('send', { sessionId, text: `继续当前任务：smoke:work-task ${JSON.stringify({ name, input })}` })
    await this.settle()
    const used = this.calls().slice(before).flatMap(call => call.out ?? []).filter(block => block.type === 'tool_use')
    assert(used.some(block => block.name === name), `Mock did not call the real ${name} tool.`)
  }

  async step(name, run) {
    const started = Date.now()
    try {
      const evidence = await run()
      this.results.push({ name, passed: true, durationMs: Date.now() - started, evidence })
      console.log(`ok ${name}`)
    } catch (error) {
      this.results.push({ name, passed: false, durationMs: Date.now() - started, error: error.message })
      throw error
    } finally {
      writeFileSync(join(HOME, 'work-tasks-report.json'), JSON.stringify({ version: json(join(PLUGIN, 'package.json')).version, mockOnly: true, results: this.results }, null, 2))
    }
  }
}

export { HOME, digest }

export async function runWorkTaskSmoke(bench) {
  // Bot workspace validation intentionally rejects the DSH profile tree.
  const work = join(ROOT, '.dsh-test-work-tasks-20261109-workspace')
  mkdirSync(work, { recursive: true })
  const file = join(work, 'five-companies.csv')
  const first = 'company,source\r\n' + Array.from({ length: 5 }, (_, index) => `Mock Company ${index + 1},https://example.test/company-${index + 1}\r\n`).join('')
  const second = first.replace('Mock Company 3,', 'Revised Mock Company 3,')
  writeFileSync(file, first)
  let chief, employee, taskId, groupTaskId, oldDeliveryId, oldRevision
  const current = async id => {
    const task = (await bench.tasks()).find(item => item.id === id)
    assert(task, `Independent task ${id} was not returned.`)
    return task
  }
  const update = async (sessionId, id, stepId, status, checkpoint) => {
    const task = await current(id)
    await bench.tool(sessionId, 'update_task_progress', { task_id: id, expected_revision: task.revision, step_id: stepId, status, checkpoint })
    return current(id)
  }
  const savedFile = async (id, deliveryId) => {
    const data = await bench.api('work-task-file', { taskId: id, deliveryId, fileIndex: 0 })
    return Buffer.from(data.base64, 'base64')
  }

  await bench.step('bootstrap real Bot Host against the local mock model', async () => {
    const initial = await bench.api('state')
    assert.equal(initial.bots.length, 1)
    chief = initial.bots[0]
    assert.equal(bench.calls().length, 0)
    const model = initial.models.at(-1)?.ref
    assert(model, 'Mock model route was not available.')
    await bench.api('update-bot', { id: chief.id, model })
    await bench.settle()
    employee = await bench.api('create-bot', { name: 'Work Task Researcher', role: 'Smoke-test specialist', instructions: 'Follow the explicit smoke instructions. All company data is a mock fixture.', workDir: work })
    await bench.settle()
    return { botCount: (await bench.api('state')).bots.length, mockOnly: true }
  })

  await bench.step('register a private task through the actual employee tool', async () => {
    await bench.tool(employee.id, 'register_task', {
      objective: 'Deliver a five-company CSV using the provided mock fixture.',
      criteria: ['Include exactly five mock companies and a source URL for each; do not describe these as real prospects.'],
      steps: [{ id: 'collect', title: 'Collect five mock entries' }, { id: 'deliver', title: 'Prepare and check the CSV' }],
    })
    const task = (await bench.tasks()).find(item => item.ownerBotId === employee.id && !item.roomId)
    assert(task)
    taskId = task.id
    assert.equal(task.steps.length, 2)
    assert.notEqual(task.status, 'completed')
    assert(task.bindings.some(binding => binding.botId === employee.id))
    return { taskId, revision: task.revision, stepCount: task.steps.length }
  })

  await bench.step('save partial progress and a concrete blocker', async () => {
    await update(employee.id, taskId, 'collect', 'working', 'Verified two of the five mock entries; three remain.')
    const task = await update(employee.id, taskId, 'collect', 'blocked', 'The fixture review needs the user to confirm the remaining three entries.')
    assert.equal(task.status, 'blocked')
    assert.equal(task.steps.find(step => step.id === 'collect').status, 'blocked')
    return { taskId, status: task.status, revision: task.revision }
  })

  await bench.step('restart preserves the blocked task and does not restart its model work', async () => {
    const before = await current(taskId)
    const calls = bench.calls().length
    await bench.restart()
    await sleep(3500)
    await bench.settle()
    const after = await current(taskId)
    assert.equal(after.status, 'blocked')
    assert.deepEqual(after.steps, before.steps)
    assert.deepEqual(after.criteria, before.criteria)
    assert.equal(bench.calls().length, calls, 'Restart unexpectedly sent new model work.')
    return { taskId, preservedRevision: after.revision, newModelCalls: 0 }
  })

  await bench.step('only a user resume request dispatches the saved task again', async () => {
    const task = await current(taskId)
    const calls = bench.calls().length
    await bench.api('control-work-task', { taskId, expectedRevision: task.revision, action: 'resume', stepId: 'collect', note: 'Confirmed the remaining mock entries. Continue this task.' })
    await bench.settle()
    assert(bench.calls().length > calls, 'Explicit resume did not dispatch work.')
    const resumed = await current(taskId)
    assert.notEqual(resumed.status, 'completed')
    return { taskId, dispatchedModelCalls: bench.calls().length - calls }
  })

  await bench.step('submission snapshots the file and waits for human review', async () => {
    await update(employee.id, taskId, 'collect', 'done', 'All five mock entries have been checked.')
    await update(employee.id, taskId, 'deliver', 'done', 'The mock CSV has five rows with company and source columns.')
    oldRevision = (await current(taskId)).revision
    await bench.tool(employee.id, 'complete_task', { task_id: taskId, title: 'Five mock companies', summary: 'Five synthetic company rows are ready for human review.', files: [file] })
    const task = await current(taskId)
    assert.equal(task.status, 'awaiting_review')
    assert.equal(task.deliveries.length, 1)
    const delivery = task.deliveries[0]
    oldDeliveryId = delivery.id
    assert.equal((await savedFile(taskId, delivery.id)).toString('utf8'), first)
    assert.equal(delivery.files[0].sha256, digest(first))
    assert(!bench.state().bots[employee.id].taskIndex?.some(item => item.key?.includes(taskId)), 'Submitted work was already indexed as accepted.')
    return { taskId, status: task.status, deliveryId: delivery.id, sha256: delivery.files[0].sha256 }
  })

  await bench.step('stale acceptance fails without changing the pending delivery', async () => {
    const before = await current(taskId)
    await assert.rejects(bench.api('control-work-task', { taskId, expectedRevision: oldRevision, action: 'accept' }))
    const after = await current(taskId)
    assert.equal(after.status, 'awaiting_review')
    assert.equal(after.revision, before.revision)
    return { taskId, staleRevision: oldRevision, currentRevision: after.revision }
  })

  await bench.step('rework preserves version one and waits for explicit continuation', async () => {
    const task = await current(taskId)
    const calls = bench.calls().length
    await bench.api('control-work-task', { taskId, expectedRevision: task.revision, action: 'rework', note: 'Correct the third mock company name.', stepId: 'deliver' })
    await bench.settle()
    const rejected = await current(taskId)
    assert.equal(rejected.status, 'blocked')
    assert.equal(rejected.deliveries.length, 1)
    assert.equal(bench.calls().length, calls, 'Rework dispatched an employee without an explicit resume.')
    writeFileSync(file, second)
    assert.equal((await savedFile(taskId, oldDeliveryId)).toString('utf8'), first)
    return { taskId, preservedDeliveryId: oldDeliveryId, sourceFileChanged: true }
  })

  await bench.step('a new delivery keeps the first version and its fixed criteria', async () => {
    const rejected = await current(taskId)
    await bench.api('control-work-task', { taskId, expectedRevision: rejected.revision, action: 'resume', stepId: 'deliver', note: 'Apply only the requested name correction.' })
    await bench.settle()
    await update(employee.id, taskId, 'deliver', 'done', 'Corrected the third mock name; five source URLs remain present.')
    await bench.tool(employee.id, 'complete_task', { task_id: taskId, title: 'Five mock companies, corrected', summary: 'The requested mock name correction is ready for review.', files: [file] })
    const task = await current(taskId)
    assert.equal(task.status, 'awaiting_review')
    assert.equal(task.deliveries.length, 2)
    assert.deepEqual(task.criteria, rejected.criteria)
    assert.equal((await savedFile(taskId, oldDeliveryId)).toString('utf8'), first)
    assert.equal((await savedFile(taskId, task.deliveries.at(-1).id)).toString('utf8'), second)
    return { taskId, deliveryCount: task.deliveries.length, oldHash: digest(first), newHash: digest(second) }
  })

  await bench.step('human acceptance completes this version without teaching a business rule', async () => {
    const task = await current(taskId)
    await bench.api('control-work-task', { taskId, expectedRevision: task.revision, action: 'accept', note: 'Accepted the five-row mock CSV and the requested correction.' })
    await bench.settle()
    const accepted = await current(taskId)
    assert.equal(accepted.status, 'completed')
    const bot = bench.state().bots[employee.id]
    assert(bot.taskIndex?.some(item => item.key?.includes(taskId)))
    assert(!bot.pendingTaskLessons?.some(item => item.key?.includes(taskId)))
    const memory = await bench.api('memory-view', { botId: employee.id })
    assert(!JSON.stringify(memory.entries).includes(taskId))
    return { taskId, status: accepted.status, compactIndexSaved: true, noAutomaticTaskRule: true }
  })

  await bench.step('task groups receive independent records without copying the whole roster', async () => {
    await bench.api('create-bot', { name: 'Unrelated Employee', role: 'Unrelated smoke fixture', instructions: 'Do not join the task.' })
    await bench.settle()
    await bench.tool(chief.id, 'create_group', {
      name: 'Independent Task Group Smoke', members: [employee.name], admin: employee.name,
      task_objective: 'Review the five-company mock CSV in this group.',
      task_steps: [{ id: 'read', title: 'Read the supplied mock CSV' }, { id: 'check', title: 'Check the five rows and source URLs' }, { id: 'deliver', title: 'Submit the checked CSV for human review' }],
      acceptance_criteria: ['Five synthetic companies only; retain each source URL.'],
    })
    const room = Object.values(bench.state().rooms).find(item => item.name === 'Independent Task Group Smoke')
    assert(room?.task?.workTaskId)
    groupTaskId = room.task.workTaskId
    const task = await current(groupTaskId)
    assert.equal(task.roomId, room.id)
    assert.equal(task.ownerBotId, employee.id)
    assert.equal(task.participantBotIds.length, 2)
    assert.equal(task.steps.length, 3)
    await bench.api('update-room', { id: room.id, workDir: work })
    // First opening the group creates/binds its real execution session, which
    // itself advances the record revision before an employee can report work.
    await bench.tool(room.id, 'read_task_record', { task_id: groupTaskId })
    for (const step of task.steps) await update(room.id, groupTaskId, step.id, 'done', 'The group coordinator checked the mock fixture.')
    await bench.tool(room.id, 'complete_task', { task_id: groupTaskId, title: 'Group mock result', summary: 'The group result is awaiting human acceptance.', files: [file] })
    assert.equal((await current(groupTaskId)).status, 'awaiting_review')
    assert.notEqual(bench.state().rooms[room.id].task.status, 'completed')
    return { taskId: groupTaskId, roomId: room.id, participantCount: task.participantBotIds.length }
  })

  await bench.step('fresh clients and a restarted Host see the same durable tasks', async () => {
    const before = await bench.tasks()
    const calls = bench.calls().length
    await bench.restart()
    await sleep(3500)
    const [clientOne, clientTwo] = await Promise.all([bench.tasks(), bench.api('work-tasks')])
    assert.deepEqual(clientOne, clientTwo)
    for (const id of [taskId, groupTaskId]) {
      const original = before.find(item => item.id === id)
      const restored = clientOne.find(item => item.id === id)
      assert.equal(restored.status, original.status)
      assert.deepEqual(restored.deliveries, original.deliveries)
      assert.deepEqual(restored.criteria, original.criteria)
    }
    assert.equal(bench.calls().length, calls)
    assert.equal((await savedFile(taskId, oldDeliveryId)).toString('utf8'), first)
    return { taskIds: [taskId, groupTaskId], matchingClientViews: true, spontaneousModelCalls: 0 }
  })

  await bench.step('an accepted group starts its next cycle under the current coordinator group session', async () => {
    const previous = await current(groupTaskId)
    const oldRoom = bench.state().rooms[previous.roomId]
    await bench.api('control-work-task', { taskId: groupTaskId, expectedRevision: previous.revision, action: 'accept', note: 'Accepted this group review of the mock CSV.' })
    await bench.settle()
    assert.equal((await current(groupTaskId)).status, 'completed')
    await bench.api('update-room', { id: previous.roomId, admin: chief.id })
    await bench.api('send', { sessionId: previous.roomId, text: 'Start another review cycle of the same mock fixture with the current coordinator.' })
    await bench.settle()
    const room = bench.state().rooms[previous.roomId]
    assert.notEqual(room.task.workTaskId, groupTaskId)
    assert.equal(room.task.cycle, oldRoom.task.cycle + 1)
    const next = await current(room.task.workTaskId)
    assert.equal(next.ownerBotId, chief.id)
    assert.equal(next.originBotId, chief.id)
    assert.equal(next.status, 'active')
    assert.equal(next.steps.length, 3)
    assert(next.steps.every(step => step.status === 'pending'))
    assert(next.bindings.some(binding => binding.botId === chief.id && binding.sessionId === room.sessions[chief.id] && binding.purpose === 'execution'))
    assert.deepEqual((await current(groupTaskId)).deliveries, previous.deliveries)
    return { previousTaskId: groupTaskId, nextTaskId: next.id, cycle: room.task.cycle, ownerBotId: next.ownerBotId, groupExecutionSession: room.sessions[chief.id] }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bench = new WorkTaskBench()
  try {
    await bench.prepare()
    await bench.start()
    await runWorkTaskSmoke(bench)
    console.log(`Passed ${bench.results.length} real-Host task checks. Evidence: ${join(HOME, 'work-tasks-report.json')}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await bench.stop()
  }
}
