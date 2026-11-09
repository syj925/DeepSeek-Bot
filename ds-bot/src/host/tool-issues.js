import { textOf } from './text.js'

// Some command wrappers render a failed process as a successful tool message.
// Match their exit-status line, not a number quoted by the program itself.
const commandExitCode = text => {
  const match = /^\[exit code:\s*(-?\d+)\]\s*$/mi.exec(text)
  return match ? Number(match[1]) : undefined
}

// Classify only execution-tool output, never assistant prose or fetched web pages.
export function toolIssueCode(name, message) {
  const text = textOf(message?.content)
  if (['pwsh', 'bash', 'ops_bash'].includes(name)
    && /DSH workspace preparation failed|Workspace is not owned by the current user|host needs WRITE_OWNER/.test(text)) return 'WORKSPACE_ACCESS'
  if (['pwsh', 'bash', 'ops_bash'].includes(name)
    && (/(?:^|\n)\[COMMAND_FAILED[;\]]/.test(text) || /^\(no output\)\r?\n\[exit code:\s*-?\d+\]\s*$/.test(text))
    && [3221225794, -1073741502].includes(commandExitCode(text))) return 'SHELL_INIT_FAILED'
  if (name?.startsWith('dsh_browser_') && /sidebar unavailable|open the owning session first/.test(text)) return 'BROWSER_SESSION'
  return undefined
}

export function install(rt) {
  const calls = new Map()
  rt.observeToolIssue = (sessionId, event) => {
    const data = event.data ?? {}
    if (event.type === 'tool/call' || event.type === 'tool/ptc-dispatch-start') {
      calls.set(`${sessionId}:${data.callId ?? data.subCallId}`, data.name)
      if (calls.size > 500) calls.delete(calls.keys().next().value)
      return
    }
    if (event.type === 'turn/end') {
      for (const key of calls.keys()) if (key.startsWith(sessionId + ':')) calls.delete(key)
      return
    }
    if (event.type !== 'tool/result') return
    const message = data.message
    const key = `${sessionId}:${message?.toolCallId ?? data.callId}`
    const name = calls.get(key)
    calls.delete(key)
    if (!name || !message) return
    const owner = rt.groupOwners.get(sessionId)
    const botId = owner?.botId ?? rt.selfOf(sessionId)
    if (!rt.botOf(botId)) return
    const code = toolIssueCode(name, message)
    const previous = rt.state.toolIssues ?? []
    // A successful retry of the same tool resolves its incident. Other tools do not.
    const text = textOf(message.content)
    const exitCode = ['pwsh', 'bash', 'ops_bash'].includes(name) ? commandExitCode(text) : undefined
    if (!code && (message.isError !== false || /COMMAND_FAILED|"error"\s*:/.test(text) || exitCode !== undefined && exitCode !== 0)) return
    const next = previous.filter(item => item.sessionId !== sessionId || item.tool !== name)
    if (code) next.push({ id: `${sessionId}:${name}`, sessionId, botId, ...(owner ? { roomId: owner.roomId } : {}),
      tool: name, code, at: Date.now() })
    if (!code && next.length === previous.length) return
    rt.state.toolIssues = next.slice(-50)
    void rt.save().catch(error => rt.warn('ds-bot: saving tool issue failed: %s', error))
  }
}
