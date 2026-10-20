import { createElement as h, useLayoutEffect, useRef } from 'react'

const EDITOR = '[data-composer-input][contenteditable=true]'
const ADDRESS_BEFORE = /[a-z0-9_./\\]/i

// Input actions address each reference chip as one character; the public draft
// expands it to its clipboard text. Fold those public occurrence ranges back to
// the selection coordinate system without reading or changing the editor DOM.
export function detectMentionDraft({ draft = '', occurrences = [] }) {
  let text = '', cursor = 0
  for (const occurrence of [...occurrences].sort((a, b) => a.offset - b.offset)) {
    if (occurrence.offset < cursor || occurrence.length < 1) continue
    text += draft.slice(cursor, occurrence.offset) + '\ufffc'
    cursor = occurrence.offset + occurrence.length
  }
  return text + draft.slice(cursor)
}

export function inlineMentionHit(input, selection) {
  if (!input || !selection || input.phase !== 'plain' || selection.start !== selection.end || selection.draftRev !== input.draftRev) return null
  const draft = detectMentionDraft(input), end = selection.end
  const match = /@([^\s@]*)$/u.exec(draft.slice(0, end))
  if (!match) return null
  const start = match.index, before = draft[start - 1]
  // The shell already handles the start of a draft and whitespace. Extend only
  // its missing inline boundary; addresses and file paths remain literal text.
  if (start === 0 || /\s/u.test(before) || ADDRESS_BEFORE.test(before) || before === '\ufffc') return null
  const prefix = draft.slice(0, start)
  if ((prefix.match(/```/g)?.length ?? 0) % 2 || (prefix.replace(/```[\s\S]*?```/g, '').match(/`/g)?.length ?? 0) % 2 || /\[[^\]\n]*$/u.test(prefix) || /\]\([^)\n]*$/u.test(prefix)) return null
  return { trigger: '@', query: match[1], quoted: false, position: 'inline', span: { start, end, draftRev: input.draftRev } }
}

export function mentionLaunch(input, selection) {
  if (!input || !selection || input.phase !== 'plain' || selection.draftRev !== input.draftRev) return null
  const draft = detectMentionDraft(input)
  if (selection.start < 0 || selection.end < selection.start || selection.end > draft.length) return null
  const prefix = draft.slice(0, selection.start)
  const token = selection.start === selection.end ? /@([^\s@]*)$/u.exec(prefix) : null
  if (token && (token.index === 0 || !ADDRESS_BEFORE.test(prefix[token.index - 1]))) {
    return { span: { ...selection, start: token.index }, query: token[1] }
  }
  return { span: selection, text: `${prefix && !/\s$/u.test(prefix) ? ' ' : ''}@`, query: '' }
}

export function observeInlineMentions(card, { readInput, captureInsertion, open, close }) {
  const document = card.ownerDocument, view = document.defaultView
  let frame = 0, composing = false, stopped = false, previous = null, lastHit = null
  const refresh = () => {
    frame = 0
    if (stopped || composing || document.hidden) return
    const editor = document.activeElement
    if (!card.contains(editor) || !editor?.matches?.(EDITOR)) return
    const hit = inlineMentionHit(readInput(), captureInsertion())
    const key = hit && JSON.stringify(hit)
    if (key === previous) return
    previous = key
    if (hit) open(hit)
    else if (lastHit) close?.(lastHit)
    lastHit = hit
  }
  // Let the shell commit its draft and native trigger tracking first. Only the
  // missing inline case reaches this public synthetic-menu API afterwards.
  const schedule = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(refresh) }
  const compose = event => { composing = event.type === 'compositionstart'; if (!composing) schedule() }
  document.addEventListener('selectionchange', schedule)
  card.addEventListener('input', schedule)
  card.addEventListener('compositionstart', compose)
  card.addEventListener('compositionend', compose)
  const stop = () => {
    stopped = true
    view.cancelAnimationFrame(frame)
    document.removeEventListener('selectionchange', schedule)
    card.removeEventListener('input', schedule)
    card.removeEventListener('compositionstart', compose)
    card.removeEventListener('compositionend', compose)
  }
  stop.refresh = schedule
  return stop
}

export function ComposerInlineMentions({ sessionId, useInput, inputActions, actions }) {
  const input = useInput(value => value), latest = useRef(input), anchor = useRef(null), observer = useRef(null)
  latest.current = input
  useLayoutEffect(() => {
    const card = anchor.current?.closest('[data-composer-card]')
    if (!card || !inputActions?.captureInsertion || !actions.inlineMentionBots) return undefined
    const stop = observeInlineMentions(card, {
      readInput: () => latest.current,
      captureInsertion: () => inputActions.captureInsertion(),
      open: hit => actions.inlineMentionBots(sessionId, hit),
      close: hit => actions.closeInlineMentionBots?.(sessionId, hit),
    })
    observer.current = stop
    return () => { stop(); observer.current = null }
  }, [sessionId, inputActions, actions])
  useLayoutEffect(() => { observer.current?.refresh() }, [input])
  return h('span', { ref: anchor, hidden: true, 'data-bt-inline-mentions': '' })
}
