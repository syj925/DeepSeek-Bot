import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { SOURCE_KIND, REPLY_KIND } from './constants.js'
import { textOf } from './text.js'

const EXTENSIONS = 'md|txt|pdf|docx?|xlsx?|pptx?|csv|tsv|html?|png|jpe?g|webp|svg|gif|zip|mp4|mp3|wav'
const outputName = new RegExp(`\\.(?:${EXTENSIONS})$`, 'i')
const barePath = new RegExp(`(?:[A-Za-z]:[\\\\/]|/|\\.{1,2}/|[^\\s\\\\/\\x60<>"':：，。；！？]+[\\\\/])[^\\r\\n\\x60<>"'，。；！？]*?\\.(?:${EXTENSIONS})(?=$|[\\s\\x60<>"'，。；！？)\\]])`, 'gi')
const canonical = path => process.platform === 'win32' ? path.toLowerCase() : path
const inside = (file, root) => { const rel = relative(root, file); return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel) }
const userFacing = source => source?.kind === 'user' || source?.kind === REPLY_KIND || source?.kind === 'schedule'
  || source?.kind === SOURCE_KIND && (source.audience === 'user' || ['reply', 'report', 'retry', 'resume'].includes(source.role) || source.role === 'handoff' && source.resume === true)

// Only paths explicitly shared in a reply, never a workspace-wide file scan.
export function sharedFilePaths(text) {
  if (typeof text !== 'string') return []
  const candidates = []
  let prose = text.slice(0, 200000).replace(/```[\s\S]*?```/g, block => {
    const lines = block.split('\n').slice(1, -1)
    for (const line of lines) if (outputName.test(line.trim())) candidates.push(line.trim())
    return ' '
  })
  prose = prose.replace(/!?\[[^\]\n]*\]\((?:<([^>\n]+)>|((?:[^()\n]|\([^()\n]*\))*))\)/g, (_, angle, path) => { candidates.push(angle ?? path); return ' ' })
  prose = prose.replace(/`([^`\n]+)`/g, (_, path) => { candidates.push(path); return ' ' })
  prose = prose.replace(/https?:\/\/\S+/gi, ' ')
  candidates.push(...(prose.match(barePath) ?? []))
  return [...new Set(candidates.map(value => {
    let path = value.trim()
    try { path = decodeURIComponent(path) } catch { /* a literal percent is a valid filename */ }
    if (path.startsWith('file:///')) path = path.slice(process.platform === 'win32' ? 8 : 7)
    return path
  }).filter(path => outputName.test(path) && path.length < 4096 && !/^[a-z][\w+.-]*:\/\//i.test(path)
    && !/[\r\n]/.test(path) && !path.includes('\0') && !/^(?:\\\\|\/\/)/.test(path)
    && !/(?:^|[\\/])(?:node_modules|\.git|\.cache|\.artifacts)(?:[\\/]|$)/i.test(path)))].slice(0, 40)
}

export function install(rt) {
  const { state } = rt
  const jobs = new Map()
  const cache = new Map()
  const owner = id => {
    const room = rt.roomOf(id)
    const bot = room ? undefined : rt.botOf(id) ?? rt.botOf(rt.selfOf(id))
    // Hidden worker conversations belong to their group, not to an employee's private files.
    if (rt.groupOwners?.has(id) || rt.pastOwners?.get(id)?.roomId) return undefined
    return room ? { targetId: room.id, room } : bot ? { targetId: bot.id, bot } : undefined
  }

  async function inspect({ text = '', files: explicitFiles = [], sessionId, targetId, roomId, botId, title, at, trustedFiles = false }) {
    const candidates = sharedFilePaths(text).map(path => ({ path, trusted: false }))
    if (trustedFiles) for (const file of explicitFiles) if (typeof file?.path === 'string') candidates.push({ path: file.path, trusted: true })
    if (!candidates.length) return []
    let root
    const needsRoot = candidates.some(candidate => !candidate.trusted)
    if (needsRoot) {
      const agent = await rt.resolveAgent(sessionId).catch(() => undefined)
      const cwd = agent?.session.header?.cwd ?? rt.workDirOf?.({ roomId, botId }) ?? rt.teamFolder?.()
      if (cwd) root = await realpath(cwd)
      if (!root) throw new Error('The source workspace is unavailable.')
    }
    const files = []
    const seen = new Set()
    for (const candidate of candidates) {
      const value = candidate.path
      // On POSIX, a Windows path is not a relative filename; never reinterpret it.
      if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(value)) continue
      let path
      if (candidate.trusted) {
        if (!isAbsolute(value)) continue
        path = resolve(value)
      } else {
        if (!root) continue
        path = resolve(root, value.replace(/[\\/]/g, sep))
        if (!inside(path, root)) continue
      }
      const actual = await realpath(path).catch(() => undefined)
      if (actual && !candidate.trusted && !inside(actual, root)) continue
      path = actual ?? path
      const id = `${targetId}:${canonical(path)}`
      if (seen.has(id)) continue
      seen.add(id)
      const details = actual ? await stat(actual).catch(() => undefined) : undefined
      if (details && !details.isFile()) continue
      files.push({ id, targetId, sessionId, ...(roomId ? { roomId } : {}), botId, title, at: at ?? 0,
        path, name: basename(path), available: Boolean(details?.isFile()),
        ...(details?.isFile() ? { modifiedAt: details.mtimeMs, size: details.size } : {}) })
    }
    return files
  }

  rt.recordConversationFiles = async entry => {
    if (rt.readOnly?.()) return
    const files = await inspect(entry)
    if (!files.length) return
    const records = new Map((state.conversationFiles ?? []).map(file => [file.id, file]))
    for (const file of files) records.set(file.id, file)
    state.conversationFiles = [...records.values()].sort((a, b) => a.at - b.at).slice(-500)
    cache.delete(entry.targetId)
    await rt.save()
  }

  rt.conversationFiles = async (sessionId, { force = false } = {}) => {
    const entity = owner(sessionId)
    if (!entity) throw new Error('This conversation is no longer available.')
    const { targetId, room, bot } = entity
    if (jobs.has(targetId)) return jobs.get(targetId)
    const job = (async () => {
      const currentSession = room?.id ?? bot.sessionId ?? sessionId
      const active = room ? undefined : await rt.resolveAgent(currentSession).catch(() => undefined)
      const signature = JSON.stringify([room ? [room.seq ?? room.log?.at(-1)?.seq ?? 0, room.task?.completedAt] : [currentSession, active?.session?.seq, bot.taskIndex?.length],
        state.taskNotices?.at(-1)?.at, state.conversationFiles?.at(-1)?.at, state.conversationFiles?.length])
      const previous = cache.get(targetId)
      if (!force && previous?.signature === signature && Date.now() - previous.at < 8000) return previous.result
      const records = new Map()
      const add = async entry => {
        for (const file of await inspect(entry)) if (!records.has(file.id)) records.set(file.id, file)
      }
      let partial = false
      // Stored announcements retain their original worker and folder after context resets.
      for (const file of [...(state.conversationFiles ?? [])].reverse()) {
        if (file.targetId !== targetId) continue
        try { await add({ ...file, files: [{ path: file.path }], trustedFiles: true }) } catch { partial = true }
      }
      // Group logs contain only messages shared with the group. Do not index user text.
      if (room) {
        for (const line of [...(room.log ?? [])].reverse()) {
          if (!line.botId || line.kind || line.file === false) continue
          const source = line.sessionId ?? room.sessions?.[line.botId] ?? room.id
          try { await add({ text: line.text, sessionId: source, targetId, roomId: room.id, botId: line.botId, title: room.name, at: line.time ?? line.seq ?? 0 }) }
          catch { partial = true }
        }
      } else {
        const parts = (rt.partsOf?.(bot.id) ?? [{ sessionId: currentSession }]).slice(-4).reverse()
        for (const part of parts) {
          try {
            const answers = []
            for await (const event of rt.eventsBackwards(part.sessionId, AbortSignal.timeout(5000), 3)) {
              if (event.type === 'assistant/message') {
                const text = textOf(event.data?.message?.content)
                if (text.trim()) answers.push({ text, at: event.time })
                continue
              }
              if (event.type !== 'user/message') continue
              const source = event.data?.source ?? event.data?.message?.source
              if (userFacing(source) && answers.length) {
                const ordered = [...answers].reverse()
                await add({ text: ordered.map(answer => answer.text).join('\n'), sessionId: part.sessionId, targetId,
                  botId: bot.id, title: bot.name, at: ordered.at(-1)?.at ?? event.time })
              }
              answers.length = 0
            }
          } catch { partial = true }
        }
      }

      // Completion records are scoped to this conversation and have already been explicitly
      // shared with the user. Recheck existence without reading file contents.
      const completions = room
        ? [...(room.task?.result ? [{ ...room.task.result, sessionId: room.id, targetId, roomId: room.id, at: room.task.completedAt }] : []),
          ...(state.taskNotices ?? []).filter(item => item.targetId === targetId && item.roomId === room.id)]
        : [...(bot.taskIndex ?? []).filter(item => !item.roomId && !item.key?.startsWith('handoff:') && item.files?.length).map(item => ({ ...item, targetId, botId: bot.id })),
          ...(state.taskNotices ?? []).filter(item => item.targetId === targetId && !item.roomId)]
      for (const item of completions.reverse()) {
        try { await add({ ...item, files: item.files ?? [], trustedFiles: true, sessionId: item.sessionId ?? (room ? room.id : currentSession), title: room?.name ?? bot.name }) }
        catch { partial = true }
      }

      const result = { files: [...records.values()].sort((a, b) => b.at - a.at).slice(0, 80), partial }
      cache.set(targetId, { signature, at: Date.now(), result })
      if (cache.size > 60) cache.delete(cache.keys().next().value)
      return result
    })().finally(() => jobs.delete(targetId))
    jobs.set(targetId, job)
    return job
  }
}
