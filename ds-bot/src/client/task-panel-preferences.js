// Presentation preferences belong to the desktop profile, not to employee memory.
const STORE_KEY = 'ds-bot.task-panel-preferences.v1'
const SECTIONS = new Set(['history', 'groups', 'files', 'experience', 'blocked', 'permissions', 'tools', 'errors'])
const EMPTY = { collapsed: {}, removedFiles: {} }
const scopeKey = (workspace, owner) => JSON.stringify([String(workspace ?? '').slice(0, 160), String(owner ?? '').slice(0, 240)])
const browserStorage = () => { try { return globalThis.localStorage } catch { return undefined } }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const validString = value => typeof value === 'string' && value.length > 0 && value.length < 8192

function readSaved(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE_KEY) ?? '{}')
    if (!object(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.length < 850 && object(value)).slice(-100).map(([key, value]) => [key, {
      collapsed: Object.fromEntries(Object.entries(object(value.collapsed) ? value.collapsed : {}).filter(([name, closed]) => SECTIONS.has(name) && closed === true)),
      removedFiles: Object.fromEntries(Object.entries(object(value.removedFiles) ? value.removedFiles : {}).filter(([file, revision]) => validString(file) && validString(revision)).slice(-200)),
    }]))
  } catch { return {} }
}

export function createTaskPanelPreferences(storage = browserStorage(), events = globalThis) {
  let entries = readSaved(storage)
  let unsaved = false
  const listeners = new Set()
  const notify = () => { for (const listener of listeners) listener() }
  const refresh = event => {
    if (!storage?.getItem || unsaved) return
    if (event && event.key !== null && event.key !== STORE_KEY) return
    if (event?.storageArea && event.storageArea !== storage) return
    const next = readSaved(storage)
    if (JSON.stringify(next) === JSON.stringify(entries)) return
    entries = next; notify()
  }
  const change = (workspace, owner, update) => {
    const key = scopeKey(workspace, owner), previous = entries[key] ?? EMPTY
    const next = { collapsed: { ...previous.collapsed }, removedFiles: { ...previous.removedFiles } }
    update(next)
    next.removedFiles = Object.fromEntries(Object.entries(next.removedFiles).slice(-200))
    if (JSON.stringify(previous) === JSON.stringify(next)) return
    const remaining = Object.entries(entries).filter(([name]) => name !== key)
    entries = Object.fromEntries([...remaining, [key, next]].slice(-100))
    try { storage?.setItem(STORE_KEY, JSON.stringify(entries)); unsaved = false } catch { unsaved = true }
    notify()
  }
  return {
    subscribe(listener) {
      if (!listeners.size) { refresh(); events.addEventListener?.('storage', refresh) }
      listeners.add(listener)
      return () => { listeners.delete(listener); if (!listeners.size) events.removeEventListener?.('storage', refresh) }
    },
    getSnapshot() { return entries },
    get(workspace, owner) { return entries[scopeKey(workspace, owner)] ?? EMPTY },
    setCollapsed(workspace, owner, section, collapsed) {
      if (!SECTIONS.has(section)) return
      change(workspace, owner, next => { if (collapsed) next.collapsed[section] = true; else delete next.collapsed[section] })
    },
    removeFile(workspace, owner, key, revision) {
      if (!validString(key) || !validString(revision)) return
      change(workspace, owner, next => { delete next.removedFiles[key]; next.removedFiles[key] = revision })
    },
    restoreFile(workspace, owner, key, revision) {
      change(workspace, owner, next => { if (next.removedFiles[key] === revision) delete next.removedFiles[key] })
    },
    clearRestoredFiles(workspace, owner, keys) {
      if (!keys.length) return
      change(workspace, owner, next => { for (const key of keys) delete next.removedFiles[key] })
    },
  }
}

export const taskPanelPreferences = createTaskPanelPreferences()
export { STORE_KEY as TASK_PANEL_PREFERENCES_KEY }
