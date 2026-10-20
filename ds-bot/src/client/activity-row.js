import { createElement as h, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BotMark, RoomAvatar } from './mark.js'
import { Shimmer, PHRASES } from './cells.js'
import { reducedMotion } from './motion.js'
import { t } from './i18n.js'
import { currentPart } from './text.js'
import { executionState } from './execution-status.js'

// -------------------------------------------------------------------------
// The activity row: the Bot's mark and a shimmering phrase at the transcript
// tail while it works. Embedded chats use the transcript itself because the
// shell can remove its running host between updates.

const PHRASE_HOLD_MS = 800
const WAITING_PHRASES = [
  'I have your request. Let me think it through',
  'Thanks for waiting. I am still waiting for a reply',
  'I have your request; no need to send it again',
  'I am still waiting for the reply. Check the progress below',
]
const drawPhrase = pool => t(pool[Math.min(pool.length - 1, Math.floor(Math.random() * pool.length))])
export function elapsedLabel(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
}
export { reducedMotion }

function useRunningHost(active, rootRef, inline) {
  const [host, setHost] = useState(null)
  useEffect(() => {
    if (!active) { setHost(null); return undefined }
    const root = rootRef ? rootRef.current : document
    if (!root) return undefined
    let frame = 0
    const find = () => {
      frame = 0
      const node = root.querySelector(inline ? '[data-chat-flow]' : '[data-chat-flow] > [data-chat-running]')
      setHost(prev => (prev === node ? prev : node))
    }
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(find) })
    observer.observe(rootRef ? root : (root.querySelector('[data-conversation-scroll]') ?? document.body), { childList: true, subtree: true })
    find()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [active, rootRef, inline])
  return host
}

// New rows slide in. The first paint of a transcript, history
// loaded above, and bulk loads arrive without motion.
function useRowEntrances(replacing, rootRef) {
  const check = useRef(replacing)
  check.current = replacing
  useEffect(() => {
    const root = rootRef ? rootRef.current : document
    if (!root) return undefined
    const seen = new WeakSet()
    const started = Date.now()
    let column = null
    let frame = 0
    const settle = (event) => {
      if (event.target !== event.currentTarget || !/^bt-row/.test(event.animationName)) return
      delete event.currentTarget.dataset.btEnter
      event.currentTarget.removeEventListener('animationend', settle)
    }
    const scan = () => {
      frame = 0
      const next = root.querySelector('[data-chat-flow]')
      if (next !== column) {
        observer.disconnect()
        column = next
        observer.observe(rootRef ? root : (column ?? document.body), { childList: true, subtree: true })
      }
      if (!column) return
      const items = [...column.querySelectorAll(':scope > [data-chat-flow-key]')]
      let last = -1
      items.forEach((item, index) => { if (seen.has(item)) last = index })
      const fresh = items.filter(item => !seen.has(item) && item.offsetHeight > 0)
      for (const item of fresh) seen.add(item)
      if (last < 0 || Date.now() - started < 800 || fresh.length > 3) return
      for (const item of fresh) {
        if (items.indexOf(item) < last) continue
        const reply = [undefined, 'assistant-step', 'tool-call'].includes(item.dataset.chatFlowKind)
        item.dataset.btEnter = reply && check.current() ? 'after-collapse' : 'new'
        item.addEventListener('animationend', settle)
      }
    }
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan) })
    observer.observe(rootRef ? root : document.body, { childList: true, subtree: true })
    scan()
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [rootRef])
}

const useEmptyWork = pick => pick({})

export function ActivityIndicator({ sessionId, useRoster, useWork = useEmptyWork, useSessionStatus, useLive, useSession, actions, rootRef, inline = false, enabled = true }) {
  const roster = useRoster(value => value)
  const work = useWork(value => value)
  const running = useSessionStatus(map => map.get(sessionId)?.running === true)
  const liveKey = useLive(state => JSON.stringify(state[sessionId] ?? {}))
  // A queued message waits for the next turn, so only a transcript or steering
  // send counts as fresh input.
  const pendingInput = useSession(snapshot => Math.max(0, ...(snapshot?.pendingSubmissions ?? [])
    .filter(sub => sub.placement !== 'queued').map(sub => sub.time)))
  const bot = roster.byId[sessionId] ?? roster.bots?.find(item => currentPart(item) === sessionId)
  const room = roster.roomsById[sessionId]
  const entries = useMemo(() => Object.values(JSON.parse(liveKey)), [liveKey])
  const streaming = entries.some(entry => entry.text)
  const tools = entries.filter(entry => !entry.text).sort((a, b) => a.at - b.at)
  // Group chats show who is typing on their own while members speak.
  const relaying = tools.some(entry => entry.relay)
  const execution = executionState({ sessionId, roster, work, running, entries, pending: pendingInput > 0 })
  const blocked = ['error', 'approval', 'question'].includes(execution?.kind)
  const visible = enabled && running && !blocked && !streaming && !relaying && (bot !== undefined || room !== undefined)
  const tool = tools.at(-1)
  const inputRef = useRef(0)
  // A steer keeps the run going, so nothing else resets the row: fresh input is
  // the newest activity, and the phrase and the clock restart from the send.
  const inputAt = Math.max(inputRef.current, pendingInput)
  inputRef.current = inputAt
  const signal = JSON.stringify([sessionId, running, liveKey, inputAt, execution?.kind, execution?.tool, execution?.activity])
  const progress = useRef({ signal, at: Date.now() })
  if (progress.current.signal !== signal) progress.current = { signal, at: Date.now() }
  const runKey = JSON.stringify([sessionId, running, inputAt])
  const run = useRef({ key: runKey, at: Date.now() })
  if (run.current.key !== runKey) run.current = { key: runKey, at: Date.now() }
  const want = !visible ? null
    : inputAt > (tool?.at ?? 0)
      ? { key: `input:${inputAt}`, pool: PHRASES.thinking, state: 'thinking' }
      : execution?.tool ? { key: `tool:${execution.tool}`, label: execution.tool, pool: ['On it'], state: tool?.state ?? 'working' }
        : { key: 'thinking', pool: PHRASES.thinking, state: 'thinking' }
  const [shown, setShown] = useState(null)
  const wantKey = want?.key ?? null
  const markState = useRef('thinking')
  if (want) markState.current = want.state
  useEffect(() => {
    if (wantKey === null || shown?.key === wantKey) return undefined
    const make = () => setShown({ key: wantKey, text: want.label ?? drawPhrase(want.pool), at: Date.now() })
    const wait = shown ? shown.at + PHRASE_HOLD_MS - Date.now() : 0
    if (wait <= 0) { make(); return undefined }
    const timer = setTimeout(make, wait)
    return () => clearTimeout(timer)
  }, [wantKey, shown])
  const [phase, setPhase] = useState(null)
  const endedAt = useRef(0)
  const shift = useRef(null)
  const leaving = useRef(false)
  leaving.current = phase !== null && !visible
  useEffect(() => {
    if (visible) { setPhase('in'); return undefined }
    setPhase(current => (current === 'in' ? 'out' : current))
    const timer = setTimeout(() => {
      const root = rootRef ? rootRef.current : document
      shift.current = root?.querySelector('[data-conversation-scroll]')?.scrollTop ?? null
      setPhase(current => (current === 'out' ? null : current))
    }, 140)
    return () => clearTimeout(timer)
  }, [visible, rootRef])
  // Removing the row at a pinned tail moves the transcript down; a tail
  // shift eases that collapse instead of jumping.
  useLayoutEffect(() => {
    if (phase !== null) return
    endedAt.current = Date.now()
    setShown(null)
    const before = shift.current
    shift.current = null
    const root = rootRef ? rootRef.current : document
    const scroller = root?.querySelector('[data-conversation-scroll]')
    if (inline || before === null || !scroller || reducedMotion()) return
    const delta = before - scroller.scrollTop
    if (delta > 0) scroller.querySelector('[data-chat-flow]')?.animate([{ transform: `translateY(${-delta}px)` }, { transform: 'none' }], { duration: 140, easing: 'cubic-bezier(.23,1,.32,1)' })
  }, [phase, rootRef, inline])
  // Cancelled tools never report a result, so their notes end with the run.
  useEffect(() => { if (!running) actions.clearLive(sessionId) }, [running, sessionId])
  // Only rows that take the activity row's place grow out of it.
  useRowEntrances(() => leaving.current || Date.now() - endedAt.current < 300, rootRef)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (phase !== 'in') return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [phase])
  const host = useRunningHost(running && enabled, rootRef, inline)
  if (!host || !enabled || blocked || phase === null || !shown) return null
  const elapsed = now - run.current.at >= 60000 ? elapsedLabel(now - run.current.at) : null
  const slow = now - progress.current.at >= 45000 && markState.current !== 'alert'
  const waiting = !want?.label && markState.current === 'thinking'
  const phrase = slow ? t('This is taking longer. No new progress yet')
    : waiting ? t(WAITING_PHRASES[Math.floor(Math.max(0, now - progress.current.at) / 8000) % WAITING_PHRASES.length]) : shown.text
  const row = h('div', { className: `bt-typing${inline ? ' bt-typing-stable' : ''}`, 'data-exiting': phase === 'out' ? '' : undefined, role: 'status', 'aria-live': 'polite' },
    bot ? h(BotMark, { bot, size: 28, state: markState.current, live: true, pokeable: true }) : h(RoomAvatar, { room, roster, size: 28 }),
    h('span', { className: 'bt-typing-text' },
      h('span', { key: `${shown.key}:${phrase}`, className: 'bt-typing-label' },
        h(Shimmer, null, `${phrase}…`),
        elapsed ? h('span', { className: 'bt-typing-time' }, `· ${elapsed}`) : null)))
  return createPortal(row, host)
}
