const unavailable = 'The native browser interface is unavailable in this host.'
const moved = 'The conversation changed before its browser could open. Try again from the employee task.'

const aborted = signal => {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error('Opening the browser was cancelled.')
}

function waitForSession(sidebar, sessionId, navigate, signal, timeout) {
  return new Promise((resolve, reject) => {
    let off = () => {}, timer, done = false
    const finish = error => {
      if (done) return
      done = true; clearTimeout(timer); off(); signal?.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolve()
    }
    const check = () => { if (sidebar.ready.getSnapshot() === sessionId) finish() }
    const cancel = () => { try { aborted(signal) } catch (error) { finish(error) } }
    off = sidebar.ready.subscribe(check)
    timer = setTimeout(() => finish(new Error('The employee browser interface did not open. Please try again.')), timeout)
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      aborted(signal)
      const navigation = navigate(sessionId)
      void Promise.resolve(navigation).then(check, finish)
      check()
    } catch (error) { finish(error) }
  })
}

// Public Sidebar operations open the real execution Session; no second webview is made.
export async function openNativeBrowser({ sidebar, sessionId, navigate, signal, timeout = 5000 }) {
  if (!sidebar?.ready?.subscribe || !sidebar.ready.getSnapshot || !sidebar.mounted?.getSnapshot
    || typeof sidebar.openTab !== 'function' || typeof sidebar.active !== 'function' || typeof sidebar.focus !== 'function') {
    return { supported: false, reason: unavailable }
  }
  if (typeof sessionId !== 'string' || !sessionId || typeof navigate !== 'function') throw new Error('An execution conversation is required to open its browser.')
  aborted(signal)
  await waitForSession(sidebar, sessionId, navigate, signal, timeout)
  const current = () => {
    aborted(signal)
    if (sidebar.ready.getSnapshot() !== sessionId || sidebar.mounted.getSnapshot() !== sessionId) throw new Error(moved)
  }
  current()
  const existing = sidebar.openTabs?.getSnapshot?.().find(tab => tab.sessionId === sessionId && tab.kind === 'browser')
  let tabId = existing?.tabId
  if (tabId) sidebar.focus(tabId)
  else {
    sidebar.openTab('browser')
    current()
    const active = sidebar.active()
    if (active?.kind !== 'browser' || !active.id) throw new Error('The browser tab could not be opened. Check that the browser plugin is enabled.')
    tabId = active.id
  }
  current()
  const floatingSupported = typeof sidebar.float === 'function'
  if (floatingSupported) sidebar.float(tabId)
  // This confirms the UI tab, not guest acquisition or a successful automation call.
  return { supported: true, sessionId, tabId, created: !existing, floatingSupported, floatingRequested: floatingSupported }
}
