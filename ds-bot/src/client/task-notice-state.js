import { createSource } from './sources.js'

const KEY = 'ds-bot:task-notifications'
export function createTaskNotices({ storage = globalThis.localStorage, page = globalThis.document, since = Date.now(), reading = () => false, systemNotify = () => {}, sound = () => {} } = {}) {
  let saved
  try { saved = JSON.parse(storage?.getItem(KEY) ?? '{}') } catch { /* storage unavailable */ }
  const source = createSource({ items: [], toasts: [], seen: Array.isArray(saved?.seen) ? saved.seen.slice(-200) : [], read: Array.isArray(saved?.read) ? saved.read.slice(-200) : [], enabled: saved?.enabled !== false, sound: saved?.sound === true, open: false })
  const persist = state => { try { storage?.setItem(KEY, JSON.stringify({ seen: state.seen, read: state.read, enabled: state.enabled, sound: state.sound })) } catch { /* storage unavailable */ } }
  const change = update => { source.set(update); persist(source.getSnapshot()) }
  let receivedKey
  return {
    ...source,
    receive(items) {
      if (!Array.isArray(items)) return
      items = items.filter(item => item && typeof item.id === 'string' && typeof item.botId === 'string' && typeof item.targetId === 'string' && typeof item.sessionId === 'string' && typeof item.title === 'string' && typeof item.summary === 'string' && Number.isFinite(item.at)).slice(-100).map(item => ({ ...item, files: (Array.isArray(item.files) ? item.files : []).filter(file => typeof file?.path === 'string' && typeof file.name === 'string').slice(0, 10) }))
      const key = JSON.stringify(items)
      if (key === receivedKey) return
      receivedKey = key
      const state = source.getSnapshot(), seen = new Set(state.seen), read = new Set(state.read)
      // Another window may already have displayed these records.
      try { for (const id of JSON.parse(storage?.getItem(KEY) ?? '{}').seen ?? []) seen.add(id) } catch { /* storage unavailable */ }
      const fresh = items.filter(item => typeof item?.id === 'string' && !seen.has(item.id) && item.at >= since)
      for (const item of items) seen.add(item.id)
      const background = page?.visibilityState === 'hidden' || page?.hasFocus?.() === false
      const visible = fresh.filter(item => {
        if (!background && reading(item)) { read.add(item.id); return false }
        return true
      })
      const activeIds = new Set(items.map(item => item.id))
      change({ ...state, items: items.slice(-100).reverse(), seen: [...seen].slice(-200), read: [...read].slice(-200), toasts: [...state.toasts.filter(id => activeIds.has(id)), ...(state.enabled ? visible.map(item => item.id) : [])].slice(-100) })
      if (state.enabled) {
        try { if (visible.length && state.sound) sound() } catch { /* audio unavailable */ }
        if (background) {
          // A burst produces a single native notification, too.
          try { if (visible.length) systemNotify(visible.at(-1), visible.length) } catch { /* unsupported platform or denied permission */ }
        }
      }
    },
    dismiss: ids => change(state => ({ ...state, toasts: state.toasts.filter(id => !ids.includes(id)) })),
    markRead: id => change(state => ({ ...state, read: [...new Set([...state.read, id])].slice(-200), toasts: state.toasts.filter(value => value !== id) })),
    markAllRead: () => change(state => ({ ...state, read: state.items.map(item => item.id), toasts: [] })),
    toggle: () => source.set(state => ({ ...state, open: !state.open })),
    close: () => source.set(state => ({ ...state, open: false })),
    configure: values => change(state => ({ ...state, ...(typeof values.enabled === 'boolean' ? { enabled: values.enabled } : {}), ...(typeof values.sound === 'boolean' ? { sound: values.sound } : {}), toasts: values.enabled === false ? [] : state.toasts })),
  }
}
