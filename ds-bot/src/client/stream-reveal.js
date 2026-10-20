import { createElement as h, useLayoutEffect, useRef } from 'react'
import { roomContentRoot } from './room-streams.js'

const STEPS = 24
const FADE_MS = 120
const STAGGER_MS = 120
const BURST_LIMIT = 10000
const LIVE_LIMIT = 12000
const STREAM = '[data-bt-streaming]'
const KEY = 'data-bt-stream-key'
const INK = '--bt-reveal-ink'
const PREFIX = 'bt-reveal-'
const documents = new WeakMap()

// Highlight ranges change paint only: Markdown keeps its nodes, selection,
// layout and complete text while each new character settles to its own ink.
export const STREAM_REVEAL_CSS = `::highlight(${PREFIX}pending){color:transparent}\n` + Array.from({ length: STEPS }, (_, step) =>
  `::highlight(${PREFIX}${step}){color:color-mix(in srgb,var(${INK},currentColor) ${Math.round(20 + step * 80 / (STEPS - 1))}%,transparent)}`,
).join('\n')

function registryFor(document, view) {
  let manager = documents.get(document)
  if (manager) return manager
  const registry = view.CSS?.highlights
  if (!registry || typeof view.Highlight !== 'function' || (view.CSS.supports && !view.CSS.supports('color', 'color-mix(in srgb,red 50%,transparent)'))) return null
  const highlights = new Map(), owners = new Map(), inks = new Map()
  const releaseInk = (owner, element) => {
    const ink = inks.get(element)
    if (!ink) return
    ink.owners.delete(owner)
    if (ink.owners.size) return
    if (element.style.getPropertyValue(INK) === ink.color) {
      if (ink.before) element.style.setProperty(INK, ink.before, ink.priority)
      else element.style.removeProperty(INK)
    }
    inks.delete(element)
  }
  manager = {
    attach(owner) { owners.set(owner, { groups: [], elements: new Set() }) },
    update(owner, groups, elements = new Set()) {
      const previous = owners.get(owner)
      if (!previous) return
      for (const element of previous.elements) if (!elements.has(element)) releaseInk(owner, element)
      for (const element of elements) {
        if (previous.elements.has(element)) continue
        let ink = inks.get(element)
        if (!ink) {
          ink = { color: view.getComputedStyle(element).color, before: element.style.getPropertyValue(INK), priority: element.style.getPropertyPriority(INK), owners: new Set() }
          inks.set(element, ink)
          element.style.setProperty(INK, ink.color)
        }
        ink.owners.add(owner)
      }
      for (const step of ['pending', ...Array.from({ length: STEPS }, (_, index) => index)]) {
        let highlight = highlights.get(step)
        for (const range of previous.groups[step] ?? []) highlight?.delete(range)
        if (!groups[step]?.length) continue
        if (!highlight) {
          highlight = new view.Highlight()
          highlights.set(step, highlight)
          registry.set(PREFIX + step, highlight)
        }
        for (const range of groups[step]) highlight.add(range)
      }
      owners.set(owner, { groups, elements })
    },
    detach(owner) {
      if (!owners.has(owner)) return
      manager.update(owner, [])
      owners.delete(owner)
      if (owners.size) return
      for (const [step, highlight] of highlights) if (registry.get(PREFIX + step) === highlight) registry.delete(PREFIX + step)
      documents.delete(document)
    },
  }
  documents.set(document, manager)
  return manager
}

function snapshot(container, document) {
  const root = container.querySelector('[data-bt-reveal-text]') ?? container
  const entries = []
  let text = ''
  const walker = document.createTreeWalker(root, 4)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data || node.parentElement?.closest('button,script,style,textarea,[contenteditable],[aria-hidden="true"],.katex-mathml')) continue
    entries.push({ node, start: text.length, end: text.length + node.data.length })
    text += node.data
  }
  return { text, entries }
}

function difference(before, after) {
  if (after.startsWith(before)) return { start: before.length, oldEnd: before.length, end: after.length }
  let start = 0, suffix = 0
  const limit = Math.min(before.length, after.length)
  while (start < limit && before.charCodeAt(start) === after.charCodeAt(start)) start++
  while (suffix < limit - start && before.charCodeAt(before.length - suffix - 1) === after.charCodeAt(after.length - suffix - 1)) suffix++
  return { start, oldEnd: before.length - suffix, end: after.length - suffix }
}

function segmentsFor(entries, start, end) {
  let low = 0, high = entries.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (entries[middle].end <= start) low = middle + 1
    else high = middle
  }
  const segments = []
  for (let index = low; index < entries.length && entries[index].start < end; index++) {
    const entry = entries[index]
    if (entry.node.isConnected) segments.push({ node: entry.node, start: Math.max(0, start - entry.start), end: Math.min(entry.end, end) - entry.start })
  }
  return segments
}

export function observeStreamReveal(scope, { reducedMotion } = {}) {
  const document = scope.ownerDocument, view = document.defaultView
  const manager = registryFor(document, view)
  if (!manager) return () => {}
  const owner = {}, states = new Map(), dirty = new Set()
  const motion = reducedMotion ?? view.matchMedia?.('(prefers-reduced-motion: reduce)')
  const segmenter = typeof view.Intl?.Segmenter === 'function' ? new view.Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
  let frame = 0, stopped = false, lastPaint = 0
  manager.attach(owner)
  const paused = () => document.hidden || motion?.matches
  const active = node => scope.contains(node) && node.matches(STREAM)
  const enroll = (node, historical = false) => {
    if (!active(node) || states.has(node)) return
    states.set(node, { snapshot: historical || paused() ? snapshot(node, document) : { text: '', entries: [] }, runs: [], quietUntil: 0, key: node.getAttribute(KEY) })
    if (!historical && !paused()) dirty.add(node)
  }
  const discover = (node, historical = false) => {
    if (node.nodeType !== 1) return
    if (node.matches(STREAM)) enroll(node, historical)
    for (const child of node.querySelectorAll(STREAM)) enroll(child, historical)
  }
  const schedule = () => { if (!stopped && !paused() && !frame) frame = view.requestAnimationFrame(paint) }
  const clear = () => {
    view.cancelAnimationFrame(frame)
    frame = 0; lastPaint = 0; dirty.clear()
    for (const [node, state] of states) {
      if (!active(node)) { states.delete(node); continue }
      state.runs = []; state.snapshot = snapshot(node, document)
    }
    manager.update(owner, [])
  }
  const scan = (container, now) => {
    const state = states.get(container)
    if (!state) return
    if (!scope.contains(container)) { states.delete(container); return }
    const next = snapshot(container, document)
    state.key = container.getAttribute(KEY)
    const before = state.snapshot.text
    const change = difference(before, next.text)
    const shift = change.end - change.oldEnd
    state.runs = state.runs.filter(run => {
      if (run.end <= change.start) return true
      if (run.start >= change.oldEnd) { run.start += shift; run.end += shift; return true }
      return false
    })
    const count = change.end - change.start
    const folded = container.matches('details:not([open])') || container.closest('details:not([open])')
    const allowed = !folded && now >= state.quietUntil && count > 0 && count <= BURST_LIMIT
      && (change.start === before.length || count <= 64)
    if (allowed) {
      const tail = next.text.slice(change.start, change.end)
      const characters = segmenter ? [...segmenter.segment(tail)].map(part => part.segment) : Array.from(tail)
      if (state.runs.length + characters.length <= LIVE_LIMIT) {
        let offset = change.start
        const stagger = Math.min(2.4, STAGGER_MS / Math.max(1, characters.length - 1))
        characters.forEach((character, index) => {
          state.runs.push({ start: offset, end: offset + character.length, born: now + index * stagger })
          offset += character.length
        })
      }
    }
    state.snapshot = next
  }
  function paint(now) {
    // A frame timestamp can precede a mutation checkpoint in that same frame.
    now = Math.max(now, view.performance.now(), lastPaint)
    view.cancelAnimationFrame(frame)
    frame = 0
    if (stopped || paused()) { clear(); return }
    // A suspended tab or long main-thread pause must never replay old tokens.
    if (lastPaint && now - lastPaint > 450) for (const state of states.values()) state.runs = []
    lastPaint = now
    for (const node of dirty) scan(node, now)
    dirty.clear()
    const groups = Array.from({ length: STEPS }, () => []), elements = new Set()
    groups.pending = []
    let live = false
    for (const [node, state] of states) {
      if (!scope.contains(node)) { states.delete(node); continue }
      state.runs = state.runs.filter(run => now - run.born < FADE_MS)
      const buckets = new Map()
      for (const run of state.runs) {
        const age = now - run.born
        const stage = age < 0 ? 'pending' : Math.min(STEPS - 1, Math.floor(age / FADE_MS * STEPS))
        let bucket = buckets.get(stage)
        if (!bucket) { bucket = []; buckets.set(stage, bucket) }
        for (const segment of segmentsFor(state.snapshot.entries, run.start, run.end)) {
          const previous = bucket.at(-1)
          if (previous?.node === segment.node && previous.end === segment.start) previous.end = segment.end
          else bucket.push(segment)
        }
      }
      for (const [stage, bucket] of buckets) for (const segment of bucket) {
        const bounds = { startContainer: segment.node, startOffset: segment.start, endContainer: segment.node, endOffset: segment.end }
        let range
        if (typeof view.StaticRange === 'function') range = new view.StaticRange(bounds)
        else { range = document.createRange(); range.setStart(segment.node, segment.start); range.setEnd(segment.node, segment.end) }
        groups[stage].push(range)
        if (segment.node.parentElement) elements.add(segment.node.parentElement)
        live = true
      }
      if (!state.runs.length && !node.matches(STREAM)) states.delete(node)
    }
    manager.update(owner, groups, elements)
    if (live) schedule()
    else lastPaint = 0
  }
  const observer = new view.MutationObserver(records => {
    let touched = false
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement
      let container = element?.closest(STREAM)
      if (!container) for (let at = element; at && scope.contains(at); at = at.parentElement) {
        if (states.has(at)) { container = at; break }
      }
      if (container && scope.contains(container)) { enroll(container); dirty.add(container); touched = true }
      if (record.type === 'attributes' && states.has(element)) { dirty.add(element); touched = true }
      if (record.type === 'childList') {
        for (const added of record.addedNodes) discover(added)
      }
    }
    // Durable group rows can replace a temporary tail while its last letters
    // are still settling. Transfer only the matching stream in this window.
    for (const [node, state] of states) if (!scope.contains(node)) {
      const replacement = state.key && [...scope.querySelectorAll(`[${KEY}]`)].find(candidate => candidate.getAttribute(KEY) === state.key)
      states.delete(node); dirty.delete(node); touched = true
      if (replacement) { states.set(replacement, state); dirty.add(replacement) }
    }
    // Apply the initial mask inside the mutation checkpoint. Waiting for rAF
    // could paint new text at full ink before making it faint on the next frame.
    if (!paused() && (dirty.size || touched)) paint(view.performance.now())
    else if (paused()) clear()
  })
  observer.observe(scope, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-bt-streaming', KEY] })
  const settleMotion = () => { clear() }
  const fold = event => {
    const target = event.target?.closest?.('summary,[aria-expanded]')
    const container = target?.closest(STREAM)
    const state = states.get(container)
    if (!state) return
    state.quietUntil = view.performance.now() + 300
    state.runs = []
    dirty.add(container)
    schedule()
  }
  discover(scope, true)
  motion?.addEventListener?.('change', settleMotion)
  document.addEventListener('visibilitychange', settleMotion)
  scope.addEventListener('click', fold, true)
  return () => {
    if (stopped) return
    stopped = true
    view.cancelAnimationFrame(frame)
    observer.disconnect()
    motion?.removeEventListener?.('change', settleMotion)
    document.removeEventListener('visibilitychange', settleMotion)
    scope.removeEventListener('click', fold, true)
    dirty.clear(); states.clear()
    manager.detach(owner)
  }
}

export function StreamReveal({ sessionId, rootRef }) {
  const anchor = useRef(null)
  useLayoutEffect(() => {
    if (!anchor.current) return undefined
    const scope = rootRef?.current ?? anchor.current.closest('header')?.parentElement ?? anchor.current.parentElement
    if (!scope) return undefined
    let current = null, release = null
    const sync = () => {
      const content = roomContentRoot(anchor.current, sessionId, rootRef?.current)
      if (content === current) return
      release?.()
      current = content
      release = current ? observeStreamReveal(current) : null
    }
    const observer = new scope.ownerDocument.defaultView.MutationObserver(sync)
    observer.observe(scope, { childList: true, subtree: true })
    sync()
    return () => { observer.disconnect(); release?.() }
  }, [sessionId, rootRef])
  return h('span', { hidden: true, ref: anchor, 'data-bt-stream-reveal': sessionId })
}
