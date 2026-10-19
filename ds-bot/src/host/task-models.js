// Task routes travel with the queued message, never with the employee's settings.
import { SOURCE_KIND, REPLY_KIND } from './constants.js'
import { splitRef } from './text.js'

const KINDS = ['general', 'writing', 'coding', 'analysis', 'vision']
export function taskKind(text = '') {
  if (/图片|截图|视觉|image|screenshot|vision/i.test(text)) return 'vision'
  if (/代码|编程|调试|修复.*bug|code|coding|debug|refactor/i.test(text)) return 'coding'
  if (/分析|研究|推理|审计|analysis|research|reasoning|audit/i.test(text)) return 'analysis'
  if (/写作|文案|文章|报告|润色|writing|article|report|draft/i.test(text)) return 'writing'
  return 'general'
}

// These are transparent name-based preferences, not measured prices or benchmarks.
export function rankTaskModels(entries, { kind, priority = 'balanced', fallback }) {
  return entries.filter(entry => kind !== 'vision' || entry.input?.includes('image')).map(entry => {
    const name = `${entry.id} ${entry.name}`.toLowerCase()
    const light = /mini|nano|flash|haiku|lite|small/.test(name)
    const deep = /reasoner|thinking|opus|pro\b|\bo[134]\b|\br1\b/.test(name)
    let score = entry.ref === fallback ? 2 : 0
    if (priority === 'speed' || priority === 'economy') score += light ? 8 : 0
    else if (priority === 'quality' || kind === 'analysis') score += deep ? 6 : 0
    else if (kind === 'general') score += light ? 5 : 0
    if (kind === 'coding' && /coder|codex|code/.test(name)) score += 9
    if (kind === 'writing' && /sonnet/.test(name)) score += 4
    return { entry, score }
  }).sort((a, b) => b.score - a.score || a.entry.ref.localeCompare(b.entry.ref)).map(item => item.entry)
}

export function install(rt) {
  const active = new Map()
  async function planTaskModel(bot, { text = '', kind = taskKind(text), priority = 'balanced', model, reason, effort } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`Unknown task kind: ${kind}`)
    if (!['balanced', 'speed', 'economy', 'quality'].includes(priority)) throw new Error(`Unknown task priority: ${priority}`)
    const entries = await rt.catalog({ fresh: true })
    const fallback = bot.model ?? await rt.defaultModel()
    const explicit = model ? await rt.resolveModel(model) : undefined
    const selected = explicit ? entries.find(entry => entry.ref === explicit)
      : rankTaskModels(entries, { kind, priority, fallback })[0]
    if (!selected) throw new Error('No configured model supports this task. Configure an available model before dispatching it.')
    if (kind === 'vision' && !selected.input?.includes('image')) throw new Error(`Model ${selected.ref} has no declared image input support. Choose an image-capable model.`)
    const level = effort !== undefined ? await rt.resolveEffort(selected.ref, effort) : await rt.desiredEffort(bot, selected.ref)
    return {
      ref: selected.ref, kind, priority, explicit: Boolean(explicit),
      ...(level !== undefined ? { effort: level } : {}),
      reason: explicit ? String(reason || 'Model specified for this task').slice(0, 240)
        : `Rule-based match for ${kind}, ${priority} priority; not a measured price or speed ranking`,
    }
  }

  rt.planTaskModel = planTaskModel
  rt.taskRouteFor = id => active.get(id)?.route

  // Admission happens before user/message is logged. Waiting for session/event is
  // too late for the first request's adapter and context window to be correct.
  rt.ctx.on('agent/pre-step', async (payload, next) => {
    const { agent, turn, signal } = payload
    await rt.load()
    if (!rt.isBotSession(agent.id) || signal.aborted) return next()
    const previous = active.get(agent.id)
    if (previous?.turn === turn) return next()
    const opening = payload.messages.find(message => ['user', SOURCE_KIND, REPLY_KIND, 'schedule'].includes(message.source?.kind)
      && !(message.source?.handoff === true && message.source?.resume !== true))
    const task = opening?.source?.kind === SOURCE_KIND ? opening.source.taskModel : undefined
    const bot = rt.botOf(rt.selfOf(agent.id))
    const ref = task?.ref ?? (bot && await rt.desiredModel(bot)) ?? await rt.defaultModel()
    const effort = task ? task.effort !== undefined ? await rt.resolveEffort(ref, task.effort) : undefined : bot ? await rt.desiredEffort(bot, ref) : undefined
    const route = ref ? { ...splitRef(ref), ...(effort ? { reasoningEffort: effort } : {}) } : undefined
    const record = { turn, route, task }
    active.set(agent.id, record)
    try {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) {
        if (active.get(agent.id) === record) active.delete(agent.id)
      }
      return decision
    } catch (error) {
      if (active.get(agent.id) === record) active.delete(agent.id)
      throw error
    }
  }, { prepend: true })

  rt.ctx.on('agent/request', async ({ agent, turn }, next) => {
    const config = await next()
    const record = active.get(agent.id)
    if (record?.turn !== turn || !record.route) return config
    // Adapter-owned defaults resolve again under this route. Never carry an
    // unsupported reasoning level or output cap across providers.
    if (!record.config) record.config = !record.task && config.provider === record.route.provider && config.model === record.route.model
      ? { ...config, ...record.route } : { ...record.route }
    return { ...record.config }
  })
  rt.ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end') active.delete(session.id)
  })
}
