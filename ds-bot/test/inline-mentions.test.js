import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const harness = process.env.DSH_HARNESS ?? fileURLToPath(new URL('../dev/harness/', import.meta.url))
const { JSDOM } = createRequire(join(harness, 'package.json'))('jsdom')
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/inline-mentions.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent', external: ['react'],
})
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, require: () => ({}) })
const { detectMentionDraft, inlineMentionHit, mentionLaunch, observeInlineMentions } = module.exports
const inputOf = draft => ({ draft, draftRev: 3, phase: 'plain', occurrences: [] })
const selectionOf = (input, start = detectMentionDraft(input).length, end = start) => ({ start, end, draftRev: input.draftRev })
const json = value => JSON.parse(JSON.stringify(value))

test('Chinese inline @ opens only the boundary the shell does not detect', () => {
  for (const draft of ['跑完了@', '跑完了@Report', '请问，@Research', '完成：@']) {
    const input = inputOf(draft), hit = inlineMentionHit(input, selectionOf(input))
    assert.deepEqual(json(hit), { trigger: '@', query: draft.slice(draft.lastIndexOf('@') + 1), quoted: false, position: 'inline', span: { start: draft.lastIndexOf('@'), end: draft.length, draftRev: 3 } })
  }
  for (const draft of ['@', '跑完了 @', 'a@writer', 'a_@writer', 'site.com/@writer', 'path\\@writer', '跑完了@Writer ', '`跑完了@Writer', '```\n跑完了@Writer', '[跑完了@Writer', '[file](路径@Writer']) {
    const input = inputOf(draft)
    assert.equal(inlineMentionHit(input, selectionOf(input)), null, draft)
  }
})

test('selection, phase and revision guards preserve the host input contract', () => {
  const input = inputOf('跑完了@Writer')
  assert.equal(inlineMentionHit(input, { ...selectionOf(input), draftRev: 2 }), null)
  assert.equal(inlineMentionHit(input, selectionOf(input, 3, 4)), null)
  assert.equal(inlineMentionHit({ ...input, phase: 'submitting' }, selectionOf(input)), null)
  assert.equal(inlineMentionHit({ ...input, phase: 'adjudicating' }, selectionOf(input)), null)
  assert.equal(inlineMentionHit({ ...input, phase: 'claimed' }, selectionOf(input)), null)
})

test('the mention launcher reuses an active token or creates a separated token without stale spans', () => {
  for (const draft of ['@', '跑完了@Wr', 'done @Wr']) {
    const input = inputOf(draft), selection = selectionOf(input)
    const result = mentionLaunch(input, selection)
    assert.equal(result.text, undefined)
    assert.equal(result.span.start, draft.lastIndexOf('@'))
    assert.equal(result.query, draft.slice(draft.lastIndexOf('@') + 1))
  }
  for (const [draft, text] of [['', '@'], ['done', ' @'], ['跑完了', ' @'], ['done ', '@'], ['me@host', ' @']]) {
    const input = inputOf(draft)
    assert.equal(mentionLaunch(input, selectionOf(input)).text, text)
  }
  const input = inputOf('replace me')
  assert.equal(mentionLaunch(input, selectionOf(input, 8, 10)).text, '@')
  assert.equal(mentionLaunch({ ...input, phase: 'claimed' }, selectionOf(input)), null)
  assert.equal(mentionLaunch(input, { ...selectionOf(input), draftRev: 2 }), null)
})

test('public reference occurrences keep synthetic spans in captureInsertion coordinates', () => {
  const input = { ...inputOf('@very-long-file.md 跑完了@Writer'), occurrences: [{ offset: 0, length: 18 }] }
  assert.equal(detectMentionDraft(input), '\ufffc 跑完了@Writer')
  const hit = inlineMentionHit(input, selectionOf(input))
  assert.deepEqual(json(hit.span), { start: 5, end: 12, draftRev: 3 })
  assert.equal(hit.query, 'Writer')
  const chip = { ...inputOf('@reference@'), occurrences: [{ offset: 0, length: 10 }] }
  assert.equal(inlineMentionHit(chip, selectionOf(chip)), null)
})

test('inline observer defers to the host, preserves dismissal and ignores composition and other editors', () => {
  const dom = new JSDOM('<!doctype html><body><div data-composer-card><div data-composer-input contenteditable="true" tabindex="0"></div></div><div data-composer-input contenteditable="true" tabindex="0"></div></body>', { pretendToBeVisual: true })
  const { window } = dom, document = window.document, card = document.querySelector('[data-composer-card]'), editor = card.firstChild
  const frames = new Map(), opened = [], closed = []
  let serial = 0, input = inputOf('跑完了@')
  window.requestAnimationFrame = run => { const id = ++serial; frames.set(id, run); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  const paint = () => { const batch = [...frames.values()]; frames.clear(); for (const run of batch) run() }
  const stop = observeInlineMentions(card, { readInput: () => input, captureInsertion: () => selectionOf(input), open: hit => opened.push(hit), close: hit => closed.push(hit) })
  try {
    editor.focus()
    editor.dispatchEvent(new window.Event('input', { bubbles: true }))
    assert.equal(opened.length, 0)
    paint()
    assert.equal(opened.length, 1)
    assert.equal(editor.textContent, '')
    document.dispatchEvent(new window.Event('selectionchange'))
    paint()
    assert.equal(opened.length, 1, 'a dismissed unchanged token stays dismissed')
    editor.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }))
    input = { ...inputOf('跑完了@W'), draftRev: 4 }
    editor.dispatchEvent(new window.Event('input', { bubbles: true }))
    paint()
    assert.equal(opened.length, 1)
    editor.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }))
    paint()
    assert.equal(opened.length, 2)
    input = { ...inputOf('跑完了@W '), draftRev: 5 }
    editor.dispatchEvent(new window.Event('input', { bubbles: true }))
    paint()
    assert.equal(closed.length, 1, 'a completed inline token closes only its own synthetic hit')
    document.body.lastChild.focus()
    document.dispatchEvent(new window.Event('selectionchange'))
    paint()
    assert.equal(opened.length, 2)
    editor.focus()
    stop.refresh()
    stop()
    paint()
    assert.equal(opened.length, 2)
  } finally { stop(); window.close() }
})
