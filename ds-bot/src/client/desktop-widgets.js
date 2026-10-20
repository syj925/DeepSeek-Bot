import { createElement as h, useEffect, useState } from 'react'

const KEY = 'ds-bot:hidden-widgets'
const EVENT = 'ds-bot:widget-visibility'
export const DESKTOP_WIDGETS = { 'qibit-command': 'General Assistant', quick: 'Quick message', agenda: 'Agenda' }

function browserStorage() {
  try { return globalThis.localStorage } catch { return undefined }
}

export function hiddenWidgets(storage = browserStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY))
    return Array.isArray(saved) ? saved.filter(id => Object.hasOwn(DESKTOP_WIDGETS, id)) : []
  } catch { return [] }
}

export function setWidgetHidden(id, hidden, storage = browserStorage(), target = globalThis.window) {
  if (!Object.hasOwn(DESKTOP_WIDGETS, id)) return
  const ids = new Set(hiddenWidgets(storage))
  if (hidden) ids.add(id)
  else ids.delete(id)
  try { storage?.setItem(KEY, JSON.stringify([...ids])) } catch { /* storage unavailable */ }
  target?.dispatchEvent(new CustomEvent(EVENT, { detail: { id, hidden } }))
}

export function DesktopWidget({ id, actions, children }) {
  const [hidden, setHidden] = useState(() => hiddenWidgets().includes(id))
  useEffect(() => {
    const receive = event => { if (event.detail.id === id) setHidden(event.detail.hidden) }
    window.addEventListener(EVENT, receive)
    return () => window.removeEventListener(EVENT, receive)
  }, [id])
  return h('div', {
    style: { display: hidden ? 'none' : 'contents' },
    onContextMenu: event => {
      if (event.target.closest('input,textarea,[contenteditable=true]')) return
      event.preventDefault(); event.stopPropagation()
      actions.openMenu({ kind: 'widget', id, x: event.clientX, y: event.clientY })
    },
  }, children)
}
