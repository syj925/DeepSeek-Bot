import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const FILE_LIMIT = 20 * 1024 * 1024
const DELIVERY_LIMIT = 50 * 1024 * 1024
const editable = task => ['active', 'blocked'].includes(task.status)
const execution = binding => binding.purpose === 'execution' && binding.active !== false
const clone = value => structuredClone(value)
const refused = message => Object.assign(new Error(message), { code: 'bot/refused' })
const stale = () => Object.assign(new Error('This task changed in another window. Refresh it before trying again.'), { code: 'bot/stale' })
const text = (value, label, limit = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw refused(`${label} must contain 1 to ${limit} characters.`)
  return value.trim()
}
const inside = (root, path) => {
  const part = relative(root, path)
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..\\`) && !part.startsWith('../')
}
const sha256 = data => createHash('sha256').update(data).digest('hex')

async function noLinks(root, path) {
  if (!inside(root, path)) throw refused('The output is outside the assigned workspace.')
  let current = path
  while (relative(root, current) !== '') {
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw refused('Linked files or directories cannot be used as task deliveries.')
    const parent = dirname(current)
    if (parent === current) throw refused('The delivery path does not reach its assigned workspace.')
    current = parent
  }
  if ((await lstat(root)).isSymbolicLink()) throw refused('A linked workspace cannot be used as a task archive.')
}

async function readBounded(path) {
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > FILE_LIMIT) throw refused('Each delivery must be a regular file no larger than 20 MB.')
    const buffer = Buffer.alloc(before.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    const after = await handle.stat()
    if (offset !== before.size || after.size !== before.size || before.mtimeMs !== after.mtimeMs) throw refused('A delivery file changed while it was being saved. Finish writing it first.')
    return buffer.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

async function makeArchive(root, path) {
  if (!inside(root, path) || (await lstat(root)).isSymbolicLink()) throw refused('Invalid task archive root.')
  let current = root
  for (const segment of relative(root, path).split(/[\\/]/)) {
    current = join(current, segment)
    try { await mkdir(current) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) throw refused('A task archive directory is linked or unavailable.')
  }
}

export function install(rt) {
  const { ctx, state } = rt
  let initialized = false
  let pending = Promise.resolve()
  const finalizing = new Map()
  const all = () => Object.values(state.workTasks ?? {})
  const writable = () => { const reason = rt.readOnly?.(); if (reason) throw refused(reason) }
  const serial = action => {
    const result = pending.then(action)
    pending = result.catch(() => {})
    return result
  }

  rt.initializeWorkTasks = () => {
    if (initialized) return false
    if (state.workTasks !== undefined && (!state.workTasks || typeof state.workTasks !== 'object' || Array.isArray(state.workTasks))) throw refused('The saved task records are invalid. They have not been overwritten.')
    if (rt.readOnly?.()) return false
    const changed = state.workTasks === undefined || all().some(task => task.status === 'active')
    state.workTasks ??= {}
    for (const task of all()) {
      if (task.status !== 'active') continue
      task.status = 'blocked'
      task.blocker = { code: 'INTERRUPTED', message: 'The app restarted. Saved checkpoints and outputs are retained; choose Continue when ready.' }
      task.updatedAt = Date.now()
      task.revision += 1
      if (task.dispatch?.status === 'dispatching') task.dispatch.status = 'interrupted'
    }
    initialized = true
    return changed
  }
  const ready = async () => {
    await rt.load?.()
    if (!initialized && !rt.readOnly?.()) {
      if (rt.initializeWorkTasks()) await rt.save()
    }
  }
  const taskOf = id => {
    const task = state.workTasks?.[id]
    if (!task) throw refused('This task was not found.')
    return task
  }
  const checked = (id, revision) => {
    const task = taskOf(id)
    if (!Number.isInteger(revision) || task.revision !== revision) throw stale()
    return task
  }
  const currentBot = sessionId => {
    const id = rt.selfOf(sessionId)
    const bot = rt.botOf(id)
    if (!bot || bot.retiredAt || rt.isBotSession && !rt.isBotSession(sessionId)) throw refused('Only a current employee execution conversation can change a task.')
    return bot
  }
  const actorBinding = (task, sessionId) => {
    const bot = currentBot(sessionId)
    const binding = task.bindings.find(item => item.sessionId === sessionId && item.botId === bot.id && execution(item))
    if (!binding || !task.participantBotIds.includes(bot.id)) throw refused('This execution conversation is not assigned to that task.')
    const roomId = rt.groupOwners?.get(sessionId)?.roomId
    if (task.roomId ? roomId !== task.roomId : roomId || rt.chatOf(bot.id) !== sessionId) throw refused('This task belongs to another conversation.')
    if (task.roomId && !rt.roomOf(task.roomId)?.members.includes(bot.id)) throw refused('This employee is no longer a member of the task group.')
    return binding
  }
  const conflict = (sessionId, taskId) => all().find(task => task.id !== taskId && editable(task) && task.bindings.some(item => execution(item) && item.sessionId === sessionId))
  const assertAvailable = (sessionId, taskId) => {
    if (conflict(sessionId, taskId)) throw refused('This execution conversation already has unfinished work. Finish it or use a separate task group.')
  }
  const publish = async (previous, next) => {
    writable()
    state.workTasks[next.id] = next
    try { await rt.save(); writable() } catch (error) {
      if (state.workTasks[next.id] === next) {
        if (previous) state.workTasks[next.id] = previous
        else delete state.workTasks[next.id]
      }
      throw error
    }
    return clone(next)
  }
  const revised = task => ({ ...clone(task), revision: task.revision + 1, updatedAt: Date.now() })
  const mutate = action => ready().then(() => serial(() => { writable(); return action() }))
  const stepsOf = (steps, objective) => {
    const list = steps ?? [{ id: 'delivery', title: objective }]
    if (!Array.isArray(list) || !list.length || list.length > 12) throw refused('Provide between 1 and 12 ordered task steps.')
    const seen = new Set()
    return list.map(item => {
      const id = text(item?.id, 'Step ID', 80)
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) throw refused('Step IDs must be unique letters, numbers, hyphens or underscores.')
      seen.add(id)
      return { id, title: text(item.title, 'Step title', 2000), status: 'pending', checkpoint: '' }
    })
  }
  rt.workTasksView = () => clone(all().sort((a, b) => b.updatedAt - a.updatedAt))
  rt.workTaskForSession = (sessionId, id) => {
    const tasks = all().filter(task => task.bindings.some(item => execution(item) && item.sessionId === sessionId))
    if (id) return tasks.find(task => task.id === id)
    const current = tasks.filter(editable)
    if (current.length > 1) throw refused('More than one task is bound here. Specify the exact task ID.')
    return current[0] ?? tasks.filter(task => task.status === 'awaiting_review').sort((a, b) => b.updatedAt - a.updatedAt)[0]
  }
  rt.acceptedTaskNeedsContextReset = sessionId => {
    if (rt.groupOwners?.has(sessionId) || all().some(task => editable(task) && task.bindings.some(item => execution(item) && item.sessionId === sessionId))) return false
    return all().some(task => task.status === 'completed' && !task.roomId && task.bindings.some(item => execution(item) && item.sessionId === sessionId))
  }

  rt.createWorkTask = input => mutate(async () => {
    const sessionId = input.originSessionId ?? input.sessionId
    const origin = currentBot(sessionId)
    const objective = text(input.objective, 'Task objective')
    const room = input.roomId && rt.roomOf(input.roomId)
    if (input.roomId && (!room || !room.members.includes(origin.id))) throw refused('Create the task in an existing group you participate in.')
    const owner = rt.botOf(input.ownerBotId ?? room?.admin ?? origin.id)
    if (!owner || owner.retiredAt || room && room.admin !== owner.id || !room && owner.id !== origin.id) throw refused('The responsible employee must be the current employee or the existing group coordinator.')
    if (input.originBotId && input.originBotId !== origin.id) throw refused('The task origin must match the current employee.')
    const participants = [...new Set(input.participantBotIds ?? room?.members ?? [owner.id])]
    if (participants.length > 100 || !participants.includes(owner.id) || participants.some(id => !rt.botOf(id) || rt.botOf(id).retiredAt || room && !room.members.includes(id) || !room && id !== owner.id)) throw refused('Task participants must be actual employees in this conversation.')
    const criteria = input.criteria ?? [objective]
    if (!Array.isArray(criteria) || !criteria.length || criteria.length > 20) throw refused('Provide between 1 and 20 acceptance requirements.')
    const requirements = criteria.map(value => text(value, 'Acceptance requirement'))
    const existing = all().find(task => task.status !== 'completed' && task.ownerBotId === owner.id && task.roomId === room?.id && task.objective === objective && JSON.stringify(task.criteria) === JSON.stringify(requirements)
      && (room || task.bindings.some(item => execution(item) && item.sessionId === sessionId)))
    if (existing) return clone(existing)
    const purpose = room ? 'origin' : 'execution'
    if (purpose === 'execution') assertAvailable(sessionId)
    if (!room && all().some(task => task.bindings.some(item => execution(item) && item.sessionId === sessionId))) {
      throw refused('Start a new task in the chat before registering another task here. Earlier task records and experience are preserved.')
    }
    if (room && all().some(task => task.roomId === room.id && task.status !== 'completed')) throw refused('This group already has an unfinished or unaccepted task. Review or continue that task before starting another one here.')
    const now = Date.now()
    const task = { id: randomUUID(), revision: 1, objective, title: input.title ? text(input.title, 'Task title', 200) : objective.slice(0, 200),
      criteria: requirements, ownerBotId: owner.id, originBotId: origin.id, participantBotIds: participants,
      ...(room ? { roomId: room.id } : {}), bindings: [{ sessionId, botId: origin.id, purpose }],
      steps: stepsOf(input.steps, objective), deliveries: [], status: 'active', createdAt: now, updatedAt: now }
    return publish(undefined, task)
  })

  rt.bindWorkTaskSession = (id, input) => mutate(async () => {
    const task = taskOf(id)
    const bot = currentBot(input.sessionId)
    if (input.botId !== bot.id || !task.participantBotIds.includes(bot.id)) throw refused('The task can only bind an actual participating employee.')
    const roomId = rt.groupOwners?.get(input.sessionId)?.roomId
    if (task.roomId ? roomId !== task.roomId || input.roomId !== task.roomId : roomId || rt.chatOf(bot.id) !== input.sessionId) throw refused('This execution conversation belongs to another task group.')
    if (task.roomId && !rt.roomOf(task.roomId)?.members.includes(bot.id)) throw refused('The employee is no longer a group member.')
    if (editable(task)) assertAvailable(input.sessionId, task.id)
    if (task.bindings.some(item => execution(item) && item.sessionId === input.sessionId && item.botId === bot.id)) return clone(task)
    if (!task.roomId && !input.allowResume && task.bindings.some(item => item.purpose === 'execution')) throw refused('Continue this saved task from its task-history controls instead of attaching it to a new conversation.')
    const next = revised(task)
    next.bindings = next.bindings.filter(item => item.sessionId !== input.sessionId)
    next.bindings.push({ sessionId: input.sessionId, botId: bot.id, purpose: 'execution', ...(roomId ? { roomId } : {}) })
    return publish(task, next)
  })
  rt.replaceWorkTaskSession = (oldId, newId, { detach = false } = {}) => mutate(async () => {
    const changed = []
    for (const task of all()) {
      const binding = task.bindings.find(item => execution(item) && item.sessionId === oldId)
      if (!binding) continue
      const bot = currentBot(newId)
      if (bot.id !== binding.botId) throw refused('A task session can only continue as the same employee.')
      const roomId = rt.groupOwners?.get(newId)?.roomId
      if (roomId !== task.roomId || !task.roomId && rt.chatOf(bot.id) !== newId) throw refused('A task cannot move into another conversation.')
      if (!detach && editable(task)) assertAvailable(newId, task.id)
      const next = revised(task)
      next.bindings.find(item => execution(item) && item.sessionId === oldId).active = false
      if (!detach && task.status !== 'completed') next.bindings.push({ ...binding, sessionId: newId, active: true })
      if (detach && task.status === 'active') {
        next.status = 'blocked'
        next.blocker = { code: 'TASK_SWITCHED', message: 'A new task was started. Saved progress remains here; choose Continue to return to this task.' }
      }
      changed.push(await publish(task, next))
    }
    return changed
  })

  rt.updateWorkTaskProgress = input => mutate(async () => {
    const task = checked(input.taskId, input.expectedRevision)
    actorBinding(task, input.sessionId)
    if (task.status !== 'active') throw refused('This task is not running. The user must explicitly continue it before more work is recorded.')
    const index = task.steps.findIndex(step => step.id === input.stepId)
    if (index < 0 || !['working', 'blocked', 'done'].includes(input.status)) throw refused('Choose an existing step and a valid progress status.')
    if (task.steps.slice(0, index).some(step => step.status !== 'done')) throw refused('Finish and checkpoint the preceding steps first.')
    if (task.steps[index].status === 'done') throw refused('A saved completed step cannot be silently rewritten. Ask the user to request a revision.')
    const checkpoint = text(input.checkpoint, 'Concrete checkpoint summary', 6000)
    const next = revised(task)
    next.steps[index] = { ...next.steps[index], status: input.status, checkpoint, at: Date.now(), ...(input.status === 'done' ? { completedAt: Date.now() } : {}) }
    if (input.status === 'blocked') {
      next.status = 'blocked'
      next.blocker = { code: 'STEP_BLOCKED', message: checkpoint }
    }
    return publish(task, next)
  })

  const saveFiles = async (task, input, version) => {
    const files = input.files ?? []
    if (!Array.isArray(files) || files.length > 10) throw refused('Provide at most 10 final output files.')
    if (!files.length) return []
    const agent = await rt.resolveAgent(input.sessionId)
    const configured = agent.session?.header?.cwd ?? rt.workDirOf?.({ botId: rt.selfOf(input.sessionId), roomId: task.roomId }) ?? rt.teamFolder?.()
    if (!configured || !isAbsolute(configured)) throw refused('The assigned workspace is unavailable. The task has not been submitted.')
    const workspace = resolve(configured)
    const canonical = await realpath(workspace)
    const root = resolve(rt.home, 'task-records', task.id, 'versions', String(version))
    if (!inside(resolve(rt.home, 'task-records'), root)) throw refused('Invalid task archive path.')
    const prepared = []
    let total = 0
    for (const item of files) {
      const sourcePath = typeof item === 'string' ? item : item?.path
      if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) throw refused('Delivery paths must be absolute.')
      const source = resolve(sourcePath)
      await noLinks(workspace, source)
      const real = await realpath(source)
      if (!inside(canonical, real)) throw refused('The delivery is outside the assigned workspace.')
      const data = await readBounded(source)
      await noLinks(workspace, source)
      if (await realpath(source) !== real) throw refused('The delivery path changed while it was being saved.')
      total += data.length
      if (total > DELIVERY_LIMIT) throw refused('A task delivery may contain at most 50 MB in total.')
      const name = basename(source)
      const hash = sha256(data)
      prepared.push({ data, file: { sourcePath: source, name, sha256: hash, size: data.length, path: join(root, `${hash}-${name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-120)}`) } })
    }
    await makeArchive(resolve(rt.home), root)
    await noLinks(resolve(rt.home), root)
    for (const { data, file } of prepared) {
      try { await writeFile(file.path, data, { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
      await noLinks(resolve(rt.home), file.path)
      if (sha256(await readBounded(file.path)) !== file.sha256) throw refused('An existing archive file differs from this delivery. No file was overwritten.')
    }
    return prepared.map(item => item.file)
  }
  const checkDelivery = async (task, delivery) => {
    const root = resolve(rt.home, 'task-records', task.id, 'versions', String(delivery.version))
    for (const file of delivery.files) {
      await noLinks(resolve(rt.home), file.path)
      if (!inside(root, resolve(file.path))) throw refused('The saved delivery is outside its archive.')
      const data = await readBounded(file.path)
      if (data.length !== file.size || sha256(data) !== file.sha256) throw refused('The saved delivery changed or is missing. Restore the original before accepting it.')
    }
  }
  rt.submitWorkTask = (id, input) => mutate(async () => {
    const task = taskOf(id)
    const binding = actorBinding(task, input.sessionId)
    if (binding.botId !== task.ownerBotId) throw refused('Only the task coordinator can submit the combined delivery.')
    if (task.status !== 'active') throw refused('Only a running task can submit a new delivery.')
    if (task.steps.some(step => step.status !== 'done' || !step.checkpoint)) throw refused('Call update_task_progress with a concrete done checkpoint for each ordered step before complete_task.')
    if (await rt.workTaskSubmissionBlocked?.(task, input)) throw refused('Other work, a question or a permission request is still pending. Resolve it before submitting.')
    const summary = text(input.summary, 'Delivery summary', 6000)
    const title = input.title ? text(input.title, 'Delivery title', 200) : task.title
    const version = task.deliveries.length + 1
    const files = await saveFiles(task, input, version)
    actorBinding(task, input.sessionId)
    if (input.turn !== undefined && rt.live?.get(input.sessionId)?.turn !== input.turn) throw refused('The submitting turn is no longer active. Its archive files are retained for retry.')
    const next = revised(task)
    next.deliveries.push({ id: randomUUID(), version, title, summary, files, at: Date.now(), sessionId: input.sessionId, ...(input.epoch !== undefined ? { epoch: input.epoch } : {}) })
    next.status = 'awaiting_review'
    delete next.blocker
    return publish(task, next)
  })

  const finishAcceptanceOnce = async task => {
    if (task.acceptance?.postProcess !== 'pending') return clone(task)
    const delivery = task.deliveries.find(item => item.id === task.acceptance.deliveryId)
    try {
      await rt.acceptWorkTask?.(clone(task), clone(delivery))
      return await mutate(async () => {
        const current = taskOf(task.id)
        if (current.acceptance?.deliveryId !== delivery.id || current.acceptance.postProcess !== 'pending') return clone(current)
        const next = revised(current)
        next.acceptance.postProcess = 'done'
        delete next.acceptance.error
        return publish(current, next)
      })
    } catch (error) {
      await mutate(async () => {
        const current = taskOf(task.id)
        if (current.acceptance?.postProcess !== 'pending') return
        const next = revised(current)
        next.acceptance.error = 'The accepted result is saved; finishing its index or archive needs another attempt.'
        await publish(current, next)
      })
      rt.warn?.('ds-bot: accepted task post-processing deferred: %s', error)
      return clone(taskOf(task.id))
    }
  }
  const finishAcceptance = task => {
    if (finalizing.has(task.id)) return finalizing.get(task.id)
    const job = finishAcceptanceOnce(task).finally(() => finalizing.delete(task.id))
    finalizing.set(task.id, job)
    return job
  }
  rt.repairWorkTaskAcceptance = id => ready().then(() => finishAcceptance(taskOf(id)))
  rt.controlWorkTask = async input => {
    let operation
    const saved = await mutate(async () => {
      const task = checked(input.taskId, input.expectedRevision)
      const next = revised(task)
      if (input.action === 'accept') {
        if (task.status !== 'awaiting_review' || !task.deliveries.length) throw refused('Only a submitted delivery can be accepted.')
        if (await rt.workTaskAcceptanceBlocked?.(task)) throw refused('The task still has running work, a question or a permission request. Wait before accepting it.')
        const delivery = task.deliveries.at(-1)
        await checkDelivery(task, delivery)
        if (await rt.workTaskAcceptanceBlocked?.(task)) throw refused('New work started while checking the delivery. Wait before accepting it.')
        next.status = 'completed'
        next.completedAt = Date.now()
        next.acceptance = { deliveryId: delivery.id, at: next.completedAt, postProcess: 'pending' }
        operation = 'accept'
      } else if (input.action === 'finalize') {
        if (task.status !== 'completed' || task.acceptance?.postProcess !== 'pending') throw refused('This accepted task does not need finalization.')
        operation = 'accept'
      } else if (input.action === 'rework') {
        if (task.status !== 'awaiting_review') throw refused('Request a revision of a submitted delivery. Completed tasks remain an immutable record.')
        const note = text(input.note, 'Revision feedback', 6000)
        const index = input.stepId ? task.steps.findIndex(step => step.id === input.stepId) : 0
        if (index < 0) throw refused('Choose an existing task step to revise.')
        for (const binding of task.bindings.filter(execution)) assertAvailable(binding.sessionId, task.id)
        next.steps = next.steps.map((step, number) => number < index ? step : { ...step, status: 'pending', previousCheckpoint: step.checkpoint })
        next.status = 'blocked'
        next.feedback = { note, stepId: task.steps[index].id, at: Date.now() }
        next.blocker = { code: 'REWORK_REQUESTED', message: 'Revision feedback is saved. Choose Continue to start a new attempt.' }
      } else if (input.action === 'resume') {
        if (task.status !== 'blocked') throw refused('Only a blocked task can be continued. No duplicate work was started.')
        if (await rt.workTaskBusy?.(task)) throw refused('This task still has running work, a question or a permission request. Resolve that before continuing.')
        for (const binding of task.bindings.filter(execution)) assertAvailable(binding.sessionId, task.id)
        next.status = 'active'
        next.dispatch = { id: randomUUID(), status: 'dispatching', at: Date.now() }
        delete next.blocker
        operation = 'resume'
      } else throw refused('Unknown task action.')
      return publish(task, next)
    })
    if (operation === 'accept') return finishAcceptance(saved)
    if (operation !== 'resume') return saved
    try {
      if (typeof rt.dispatchWorkTask !== 'function') throw refused('The task executor is unavailable. The task remains saved.')
      const message = `Continue task ${saved.id}: ${saved.objective}\nRead its saved task record first. Keep completed checkpoints and delivery versions. Work only on unfinished or revised steps. Do not repeat successful external actions.\n${saved.feedback ? `User feedback: ${saved.feedback.note}` : ''}`
      await rt.dispatchWorkTask(clone(saved), message)
      return await mutate(async () => {
        const current = taskOf(saved.id)
        if (current.dispatch?.id !== saved.dispatch.id || current.status !== 'active') return clone(current)
        const next = revised(current)
        next.dispatch.status = 'sent'
        return publish(current, next)
      })
    } catch (error) {
      return mutate(async () => {
        const current = taskOf(saved.id)
        if (current.dispatch?.id !== saved.dispatch.id || current.status !== 'active') return clone(current)
        const next = revised(current)
        next.status = 'blocked'
        next.dispatch.status = 'failed'
        next.blocker = { code: 'DISPATCH_FAILED', message: 'The continuation could not be confirmed. Check the conversation before continuing again; saved work is retained.' }
        rt.warn?.('ds-bot: task continuation failed: %s', error)
        return publish(current, next)
      })
    }
  }
  rt.blockWorkTaskForSession = (sessionId, failure = {}) => {
    // Bind the failure before waiting for persistence: a later task in the same
    // conversation must never inherit an earlier turn's delayed error.
    const observed = rt.workTaskForSession(sessionId)
    if (!observed || observed.status !== 'active') return Promise.resolve(observed && clone(observed))
    const epoch = failure.epoch ?? rt.live?.get(sessionId)?.taskEpoch
    const attempt = observed.dispatch?.id
    return mutate(async () => {
      const task = taskOf(observed.id)
      const live = rt.live?.get(sessionId)
      if (task.status !== 'active' || task.dispatch?.id !== attempt
        || rt.workTaskForSession(sessionId)?.id !== task.id
        || epoch !== undefined && live?.taskEpoch !== epoch
        || failure.turn !== undefined && live?.turn !== undefined && live.turn !== failure.turn) return clone(task)
      const next = revised(task)
      next.status = 'blocked'
      next.blocker = { code: typeof failure.code === 'string' ? failure.code.slice(0, 100) : 'EXECUTION_FAILED', message: typeof failure.message === 'string' && failure.message.trim() ? failure.message.slice(0, 2000) : 'Work stopped. Saved checkpoints and delivery versions are retained; continue explicitly when ready.' }
      return publish(task, next)
    })
  }

  const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
  ctx.tools.register(defineTool({
    name: 'register_task',
    description: 'Save an independent user task with explicit acceptance requirements and up to 12 ordered steps. Use the current actual employee conversation; a group task is coordinated by its existing admin. Does not create employees, grant permissions or execute work. Never replace user requirements with easier ones. Read an existing task rather than duplicating it.',
    parameters: {
      objective: { type: 'string', description: 'Required for a new task: the user requested outcome, including quantity and required format.' },
      criteria: { type: 'array', items: { type: 'string' }, description: 'Required for a new task: explicit acceptance requirements from the user. Preserve unknowns and limitations.' },
      steps: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', required: true }, title: { type: 'string', required: true } }, additionalProperties: false }, description: 'Required for a new task: 1 to 12 ordered, checkable steps with stable IDs.' },
      task_id: { type: 'string', description: 'Existing task ID to bind to the current actual participating employee session.' },
    }, output,
    async execute(args, exec) {
      await ready()
      const sessionId = exec.agent?.id
      const bot = currentBot(sessionId)
      const roomId = rt.groupOwners?.get(sessionId)?.roomId
      if (args.task_id) return JSON.stringify(await rt.bindWorkTaskSession(args.task_id, { sessionId, botId: bot.id, ...(roomId ? { roomId } : {}) }))
      if (!args.objective || !Array.isArray(args.criteria) || !Array.isArray(args.steps)) throw refused('A new task requires its objective, acceptance criteria and ordered steps.')
      const room = roomId && rt.roomOf(roomId)
      if (room && room.admin !== bot.id) throw refused('Only the existing group coordinator can register the shared task. Read the group task and report your assigned step.')
      const result = await rt.createWorkTask({ sessionId, objective: args.objective, criteria: args.criteria, steps: args.steps, ...(room ? { roomId, ownerBotId: room.admin, participantBotIds: room.members } : {}) })
      if (room) {
        await rt.linkWorkTaskToRoom?.(result)
        return JSON.stringify(await rt.bindWorkTaskSession(result.id, { sessionId, botId: bot.id, roomId }))
      }
      return JSON.stringify(result)
    },
  }))
  ctx.tools.register(defineTool({
    name: 'update_task_progress', description: 'Persist a concrete checkpoint for an ordered task step. Done requires actual saved work and its verification or limitations, not a promise. A blocked step preserves earlier results and requires an explicit user continuation. Does not accept or complete a task.',
    parameters: {
      task_id: { type: 'string', required: true }, expected_revision: { type: 'integer', required: true },
      step_id: { type: 'string', required: true }, status: { type: 'string', enum: ['working', 'blocked', 'done'], required: true },
      checkpoint: { type: 'string', required: true, description: 'Specific completed work, evidence/output paths, checks and unresolved limitations.' },
    }, output,
    async execute(args, exec) { return JSON.stringify(await rt.updateWorkTaskProgress({ sessionId: exec.agent?.id, taskId: args.task_id, expectedRevision: args.expected_revision, stepId: args.step_id, status: args.status, checkpoint: args.checkpoint })) },
  }))
  ctx.tools.register(defineTool({
    name: 'read_task_record', description: 'Read saved task requirements, checkpoints, immutable delivery versions and review status linked to this actual employee conversation. Use the returned revision for progress updates; accepted output does not imply any new business rule is confirmed.',
    parameters: { task_id: { type: 'string', description: 'Exact linked task ID; omit to list records linked to this conversation.' } }, output,
    async execute(args, exec) {
      await ready()
      const sessionId = exec.agent?.id
      currentBot(sessionId)
      const botId = rt.selfOf(sessionId)
      if (!args.task_id) return JSON.stringify(all().filter(task => task.status !== 'completed' && task.bindings.some(item => item.sessionId === sessionId && item.active !== false)))
      const tasks = all().filter(task => task.bindings.some(item => item.sessionId === sessionId)
        || (task.originBotId === botId || task.participantBotIds.includes(botId)) && rt.chatOf(botId) === sessionId && !rt.groupOwners?.has(sessionId))
      const task = tasks.find(item => item.id === args.task_id)
      if (!task) throw refused('This task is not linked to the current conversation.')
      return JSON.stringify(task)
    },
  }))
}
