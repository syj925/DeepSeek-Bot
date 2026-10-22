// The badge tracks information revisions the user has not seen yet. Keep this state in
// the browser profile: it is presentation state, not part of the team's data.
const STORE_KEY = 'ds-bot.task-panel-reads.v1'
const MAX_CONVERSATIONS = 100
const MAX_REVISIONS = 200

const usableStorage = storage => storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : undefined
const browserStorage = () => {
  try { return usableStorage(globalThis.localStorage) } catch { return undefined }
}
const ownerKey = (workspace, owner) => `${String(workspace ?? '').slice(0, 160)}:${String(owner ?? '').slice(0, 240)}`

function readSaved(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => {
      if (typeof key !== 'string' || key.length > 420 || !Array.isArray(value)) return false
      return value.every(item => typeof item === 'string' && item.length > 0 && item.length < 8192)
    }).map(([key, value]) => [key, [...new Set(value)].slice(-MAX_REVISIONS)]).slice(-MAX_CONVERSATIONS))
  } catch { return {} }
}

export function createTaskPanelReads(storage = browserStorage()) {
  let entries = readSaved(storage)
  let snapshot = { revision: 0, entries }
  const listeners = new Set()
  const notify = () => { snapshot = { revision: snapshot.revision + 1, entries }; for (const listener of listeners) listener() }
  const persist = () => {
    try { storage?.setItem(STORE_KEY, JSON.stringify(entries)) } catch { /* browser storage may be unavailable */ }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot() { return snapshot },
    isRead(workspace, owner, revision) { return entries[ownerKey(workspace, owner)]?.includes(revision) === true },
    markRead(workspace, owner, revisions) {
      const values = [...new Set((revisions ?? []).filter(value => typeof value === 'string' && value.length > 0))]
      if (values.length === 0) return
      const key = ownerKey(workspace, owner)
      const next = [...new Set([...(entries[key] ?? []), ...values])].slice(-MAX_REVISIONS)
      if (entries[key]?.length === next.length && entries[key].every((value, index) => value === next[index])) return
      entries = { ...entries, [key]: next }
      const keys = Object.keys(entries)
      if (keys.length > MAX_CONVERSATIONS) entries = Object.fromEntries(keys.slice(-MAX_CONVERSATIONS).map(item => [item, entries[item]]))
      persist(); notify()
    },
  }
}

export const taskPanelReads = createTaskPanelReads()
export { STORE_KEY as TASK_PANEL_READS_KEY }
