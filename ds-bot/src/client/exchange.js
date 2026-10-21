import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { inkText } from './inks.js'
import { dayLabel } from './text.js'
import { colorOf, BotMark } from './mark.js'
import { Bubbles, workPhrase } from './cells.js'
import { CloseIcon } from './icons.js'
import { useEscape } from './overlay-hooks.js'
import { t } from './i18n.js'

export function ExchangeDialog({ pair, roster, actions, useWork }) {
  const work = useWork(value => value)
  const [view, setView] = useState({ entries: null, error: false })
  const [leaving, setLeaving] = useState(false)
  const [unseen, setUnseen] = useState(false)
  const [bounds, setBounds] = useState(null)
  const log = useRef(null)
  const dialog = useRef(null)
  const follow = useRef(true)
  const closeTimer = useRef(null)
  const opener = useRef(document.activeElement)
  const anchor = useRef(opener.current?.closest('.bt-canvas-session') ?? opener.current?.closest('[data-conversation-content]'))
  const close = () => {
    if (closeTimer.current !== null) return
    setLeaving(true)
    closeTimer.current = setTimeout(() => actions.closeOverlay(), 160)
  }
  useEscape(close)
  useLayoutEffect(() => {
    const node = anchor.current
    if (!node) return undefined
    let frame
    let last = ''
    const place = () => {
      if (!node.isConnected) { actions.closeOverlay(); return }
      const rect = node.getBoundingClientRect()
      const key = [rect.left, rect.top, rect.width, rect.height].join(':')
      if (key !== last) { last = key; setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }) }
      frame = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    const previous = opener.current
    dialog.current?.querySelector('button')?.focus({ preventScroll: true })
    return () => {
      clearTimeout(closeTimer.current)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    let stopped = false
    let timer
    let seen = null
    const load = async () => {
      try {
        const result = await actions.exchange(pair[0], pair[1])
        if (stopped) return
        const entries = [...result].sort((a, b) => a.time - b.time)
        const key = JSON.stringify(entries)
        if (key !== seen) {
          if (seen !== null && !follow.current) setUnseen(true)
          seen = key
          setView({ entries, error: false })
        } else setView(current => current.error ? { ...current, error: false } : current)
      } catch {
        if (!stopped) setView(current => ({ ...current, error: true }))
      }
      if (!stopped) timer = setTimeout(load, document.hidden ? 8000 : 2000)
    }
    void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [pair[0], pair[1]])
  useLayoutEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [view.entries])
  const latest = () => {
    follow.current = true
    setUnseen(false)
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }
  const trapFocus = event => {
    if (event.key !== 'Tab') return
    const items = [...dialog.current.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')]
    const first = items[0], last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const left = roster.byId[pair[0]]
  const right = roster.byId[pair[1]]
  const working = pair.map(id => ({ bot: roster.byId[id], job: work.bots?.[id] })).filter(item => item.bot && item.job)
  const layer = h('div', { className: 'bt-exchange-layer', 'data-local': anchor.current ? '' : undefined, 'data-leaving': leaving || undefined,
    style: anchor.current && bounds ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } : undefined,
    onClick: event => event.stopPropagation(), onPointerDown: event => event.stopPropagation() },
  h('section', { ref: dialog, className: 'bt-exchange-card', role: 'dialog', 'aria-modal': true, 'aria-label': t('Collaboration record'), onKeyDown: trapFocus },
    h('header', { className: 'bt-exchange-head' },
      h('div', null, h('strong', null, t('Collaboration record')),
        h('div', { className: 'bt-exchange-pair' }, left ? h(BotMark, { bot: left, size: 20 }) : null, left?.name ?? '?',
          h('span', { 'aria-hidden': true }, '↔'), right ? h(BotMark, { bot: right, size: 20 }) : null, right?.name ?? '?')),
      h('button', { type: 'button', className: 'bt-exchange-close', onClick: close, title: t('Close'), 'aria-label': t('Close') }, h(CloseIcon))),
    h('div', { className: 'bt-exchange-log', ref: log, role: 'log', 'aria-live': 'off', 'aria-label': t('Collaboration record'),
      onScroll: () => { const node = log.current; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; if (follow.current) setUnseen(false) } },
    view.entries === null ? h('p', { className: 'bt-hint' }, t('Loading…'))
      : view.entries.length === 0 ? h('p', { className: 'bt-hint' }, t('No collaboration messages yet'))
        : view.entries.map(entry => {
          const bot = roster.byId[entry.from] ?? { id: entry.from, name: t('a Bot'), color: 'gray' }
          return h('article', { key: entry.id, className: 'bt-group-msg' },
            h('div', { className: 'bt-exchange-message-head' },
              h('span', { style: { color: inkText(colorOf(bot)) } }, bot.name),
              h('time', { dateTime: new Date(entry.time).toISOString() }, dayLabel(entry.time))),
            h(Bubbles, { texts: [entry.text], roster, selfId: bot.id, actions, lead: h('span', { className: 'bt-lead' }, h(BotMark, { bot, size: 22 })) }))
        })),
    h('footer', { className: 'bt-exchange-status' },
      h('span', { role: 'status' }, view.error ? t('Could not load collaboration messages. Retrying…')
        : working.length ? working.map(({ bot, job }) => `${bot.name} · ${workPhrase(job.tool)}…`).join(' / ')
          : t('No employee is currently working')),
      unseen ? h('button', { type: 'button', className: 'bt-soft', onClick: latest }, t('View new messages')) : null)))
  return createPortal(layer, document.body)
}
