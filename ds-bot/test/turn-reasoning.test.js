import test from 'node:test'
import assert from 'node:assert/strict'
import { turnReasoning, turnReasoningState } from '../src/client/turn-reasoning.js'

const step = (n, blocks, status = 'settled') => ({ turn: 1, step: n, status, blocks })
const think = text => ({ kind: 'reasoning', text })
const tool = { kind: 'tool-call', name: 'read' }

test('a long tool Turn shows its reasoning once, on the first step, in order', () => {
  const steps = Array.from({ length: 24 }, (_, i) => step(i + 1, [think(`Reasoning ${i + 1}`), tool]))
  const shown = steps.map(current => turnReasoning(steps, current))
  assert.equal(shown.filter(Boolean).length, 1)
  assert.equal(shown[0], steps.map((_, i) => `Reasoning ${i + 1}`).join('\n\n'))
})

test('the row sits on the first step with reasoning', () => {
  const steps = [step(1, [{ kind: 'text', text: 'Looking' }, tool]), step(2, [think('B'), tool]), step(3, [think('C'), { kind: 'text', text: 'Done' }])]
  assert.deepEqual(steps.map(current => turnReasoning(steps, current)), ['', 'B\n\nC', ''])
})

test('public reasoning streams once while a later step runs, after its first owner has settled', () => {
  const steps = [step(1, [think('A'), tool]), step(2, [think('B')], 'running')]
  assert.deepEqual(turnReasoningState(steps, steps[0]), { text: 'A\n\nB', streaming: true })
  assert.deepEqual(turnReasoningState(steps, steps[1]), { text: '', streaming: false })
  steps[1].blocks[0].text += ' continues'
  assert.equal(turnReasoning(steps, steps[0]), 'A\n\nB continues')
  steps[1].blocks.push({ kind: 'text', text: 'Reply' })
  assert.deepEqual(turnReasoningState(steps, steps[0]), { text: 'A\n\nB continues', streaming: false })
})

test('first public reasoning is available during generation, without inventing missing model text', () => {
  const current = step(1, [think('A')], 'running')
  assert.deepEqual(turnReasoningState([current], current), { text: 'A', streaming: true })
  const privateOnly = step(2, [{ kind: 'reasoning', text: '', encryptedContent: 'opaque' }], 'running')
  assert.deepEqual(turnReasoningState([privateOnly], privateOnly), { text: '', streaming: false })
})

test('a step outside the loaded Turn list shows only its own reasoning', () => {
  const current = step(1, [think(' A ')])
  assert.equal(turnReasoning([], current), 'A')
})
