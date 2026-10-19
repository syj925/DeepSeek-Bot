import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const MOCK = fileURLToPath(new URL('../dev/mock-llm.mjs', import.meta.url))

// One Anthropic-shaped request, its SSE reply folded into { text, tools }.
async function call(url, messages, names = ['list_bots']) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mock', stream: true, tools: names.map(name => ({ name })), messages }),
  })
  assert.equal(res.status, 200)
  const events = (await res.text()).split('\n\n')
    .map(chunk => /^data: (.+)$/m.exec(chunk)?.[1]).filter(Boolean).map(line => JSON.parse(line))
  let text = ''
  const tools = []
  const inputs = new Map()
  for (const event of events) {
    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      const used = { id: event.content_block.id, name: event.content_block.name }
      tools.push(used)
      inputs.set(event.index, { used, json: '' })
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') text += event.delta.text
    if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') inputs.get(event.index).json += event.delta.partial_json
  }
  for (const { used, json } of inputs.values()) used.input = JSON.parse(json || '{}')
  return { text, tools }
}

// Append the reply and its tool results, as the next model request would carry them.
function fold(messages, out) {
  messages.push(
    { role: 'assistant', content: [...(out.text ? [{ type: 'text', text: out.text }] : []), ...out.tools.map(used => ({ type: 'tool_use', id: used.id, name: used.name, input: {} }))] },
    { role: 'user', content: out.tools.map(used => ({ type: 'tool_result', tool_use_id: used.id, content: '[]' })) },
  )
}

async function startMock(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsb-mock-'))
  const mock = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_PORT: '0', MOCK_LOG: join(home, 'mock.jsonl'), MOCK_DELAY_MS: '5', MOCK_JITTER_MS: '0' },
  })
  t.after(() => { mock.kill(); rmSync(home, { recursive: true, force: true, maxRetries: 5 }) })
  // MOCK_PORT=0 lets the kernel pick a free port; the mock prints the real one.
  return new Promise((resolve, reject) => {
    mock.stdout.on('data', chunk => {
      const found = /127\.0\.0\.1:(\d+)\/v1/.exec(String(chunk))
      if (found !== null) resolve(`http://127.0.0.1:${found[1]}/v1/messages`)
    })
    mock.once('exit', code => reject(new Error(`mock-llm exited ${code}`)))
  })
}

// "长任务 N [K]" adds about K×1000 characters per step, defaulting to 4. A missing K once
// parsed as NaN, so every step after the opener silently sent no text block.
test('长任务 writes text on every step when the step size is left out', async (t) => {
  const url = await startMock(t)

  const messages = [{ role: 'user', content: '长任务 3' }]
  let out = await call(url, messages)
  assert.equal(out.text.length, 4000) // 步骤0
  fold(messages, out)

  out = await call(url, messages)
  assert.equal(out.text.length, 4000) // a tool result continues the task
  fold(messages, out)

  // A spliced Bot message mid-task hits the other parse of the same command, and its
  // note comes before the step's text.
  messages.push({ role: 'user', content: '[Message from HelperBot] 进度如何？' })
  out = await call(url, messages)
  const ack = '（已按 HelperBot 的话调整）\n'
  assert.ok(out.text.startsWith(ack), out.text.slice(0, 40))
  assert.equal(out.text.length - ack.length, 4000)
  fold(messages, out)

  out = await call(url, messages)
  assert.match(out.text, /长任务做完了，一共 3 步。/)
})

test('model smoke commands distinguish requested saved changes from task-only and unrequested changes', async (t) => {
  const url = await startMock(t)
  const names = ['update_bot', 'message_bot']
  for (const [command, toolName, expected] of [
    ['smoke:set-model RouteWorker mock/flash', 'update_bot', { bot: 'RouteWorker', model: 'mock/flash', model_user_requested: true }],
    ['smoke:set-model-unrequested RouteWorker mock/flash', 'update_bot', { bot: 'RouteWorker', model: 'mock/flash' }],
    ['任务模型 RouteWorker mock/flash general: Brief reply', 'message_bot', { to: 'RouteWorker', model: 'mock/flash', model_user_requested: true, task_kind: 'general', message: 'Brief reply' }],
    ['任务模型未授权 RouteWorker mock/flash general: Brief reply', 'message_bot', { to: 'RouteWorker', model: 'mock/flash', task_kind: 'general', message: 'Brief reply' }],
    ['任务模型 RouteWorker auto coding: Implement a function', 'message_bot', { to: 'RouteWorker', task_kind: 'coding', message: 'Implement a function' }],
  ]) {
    const out = await call(url, [{ role: 'user', content: command }], names)
    assert.equal(out.tools.length, 1, command)
    assert.equal(out.tools[0].name, toolName, command)
    assert.deepEqual(out.tools[0].input, expected, command)
  }
  const messages = [{ role: 'user', content: 'smoke:set-model RouteWorker mock/flash' }]
  const out = await call(url, messages, names)
  messages.push(
    { role: 'assistant', content: out.tools.map(used => ({ type: 'tool_use', ...used })) },
    { role: 'user', content: out.tools.map(used => ({ type: 'tool_result', tool_use_id: used.id, content: 'Updated RouteWorker. Model: mock/flash. Applies to subsequent turns.' })) },
  )
  const reply = await call(url, messages, names)
  assert.equal(reply.text, 'Updated RouteWorker. Model: mock/flash. Applies to subsequent turns.')
  assert.equal(reply.tools.length, 0)
})
