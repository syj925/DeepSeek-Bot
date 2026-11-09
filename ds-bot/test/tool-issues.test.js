import assert from 'node:assert/strict'
import { test } from 'node:test'
import { install, toolIssueCode } from '../src/host/tool-issues.js'
import { conversationToolIssues } from '../src/client/recovery-state.js'

const message = (text, isError = false) => ({ isError, content: [{ type: 'text', text }] })
test('environment errors are recognized even when a wrapper incorrectly reports success', () => {
  assert.equal(toolIssueCode('ops_bash', message('COMMAND_FAILED: DSH workspace preparation failed. host needs WRITE_OWNER')), 'WORKSPACE_ACCESS')
  assert.equal(toolIssueCode('dsh_browser_open', message('sidebar unavailable (browser bridge: open the owning session first)', true)), 'BROWSER_SESSION')
  assert.equal(toolIssueCode('web_fetch', message('DSH workspace preparation failed')), undefined)
  assert.equal(toolIssueCode('pwsh', message('ordinary script exception', true)), undefined)
})
test('command initialization failures use the wrapper status, not quoted numbers or web content', () => {
  for (const code of [3221225794, -1073741502]) {
    const text = `(no output)\n[COMMAND_FAILED; effects: unknown; retry: never] Do not repeat the command.\n[exit code: ${code}]`
    assert.equal(toolIssueCode('ops_bash', message(text)), 'SHELL_INIT_FAILED')
    assert.equal(toolIssueCode('pwsh', message(`(no output)\n[exit code: ${code}]`)), 'SHELL_INIT_FAILED')
    assert.equal(toolIssueCode('web_fetch', message(text)), undefined)
  }
  assert.equal(toolIssueCode('pwsh', message('The documentation mentions 3221225794')), undefined)
  assert.equal(toolIssueCode('ops_bash', message('[COMMAND_FAILED]\n[exit code: 1]')), undefined)
  assert.equal(toolIssueCode('ops_bash', message('[exit code: 3221225794]')), undefined)
})
test('issues retain scope, contain no raw data and resolve only after same-tool success', () => {
  const rt = { state: {}, groupOwners: new Map([['worker', { botId: 'b', roomId: 'r' }]]), botOf: id => ({ id }), save: async () => {}, warn() {} }
  install(rt)
  const emit = (name, text, isError = false) => {
    rt.observeToolIssue('worker', { type: 'tool/call', data: { callId: 'call', name } })
    rt.observeToolIssue('worker', { type: 'tool/result', data: { message: { ...message(text, isError), toolCallId: 'call' } } })
  }
  emit('pwsh', 'DSH workspace preparation failed secret-data')
  assert.equal(rt.state.toolIssues.length, 1)
  assert.ok(!JSON.stringify(rt.state.toolIssues).includes('secret-data'))
  emit('read', 'ok')
  emit('pwsh', 'another error', true)
  emit('pwsh', '[exit code: 1]')
  assert.equal(rt.state.toolIssues.length, 1)
  const roster = { toolIssues: rt.state.toolIssues, byId: { b: { id: 'b' } } }
  assert.equal(conversationToolIssues('r', roster).length, 1)
  assert.equal(conversationToolIssues('b', roster).length, 0)
  emit('pwsh', 'ok')
  assert.equal(rt.state.toolIssues.length, 0)
})
