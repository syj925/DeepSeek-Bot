const transient = new Set(['gateway/internal', 'gateway/service-unavailable', 'gateway/context-unavailable', 'gateway/context-failed',
  'gateway/lookup-unavailable', 'gateway/lookup-failed', 'gateway/invocation-unavailable', 'gateway/cancelled', 'file/reader-unavailable'])
const aborted = () => new DOMException('Aborted', 'AbortError')

function pause(ms, signal) {
  if (signal.aborted) return Promise.reject(aborted())
  if (!ms) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(aborted()) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

// Share only the request budget; each window keeps its own contents, authority and cancellation.
export function createFileReader(getReader, { concurrency = 2, retryDelays = [150, 500] } = {}) {
  const queue = [], controllers = new Set()
  let active = 0, closed = false
  const pump = () => { while (!closed && active < concurrency && queue.length) queue.shift()() }
  const schedule = (work, signal) => new Promise((resolve, reject) => {
    let started = false, finished = false
    const finish = (settle, value) => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', cancel)
      if (started) active--
      else { const index = queue.indexOf(start); if (index >= 0) queue.splice(index, 1) }
      settle(value); pump()
    }
    const cancel = () => finish(reject, aborted())
    const start = () => {
      started = true; active++
      void Promise.resolve().then(() => {
        if (signal.aborted) throw aborted()
        return work()
      }).then(value => finish(resolve, value), error => finish(reject, error))
    }
    if (signal.aborted) { reject(aborted()); return }
    signal.addEventListener('abort', cancel, { once: true })
    queue.push(start); pump()
  })
  const read = async (method, sessionId, path, options, signal) => {
    if (closed || signal?.aborted) throw aborted()
    const controller = new AbortController(), cancel = () => controller.abort()
    controllers.add(controller)
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      for (let attempt = 0; ; attempt++) {
        let result, failure, thrown = false
        try {
          result = await schedule(() => {
            const reader = getReader()
            if (typeof reader?.[method] !== 'function') throw Object.assign(new Error('The file reader is unavailable. Open this file in classic view.'), { code: 'file/reader-unavailable' })
            return reader[method](sessionId, path, options, controller.signal)
          }, controller.signal)
        } catch (error) { failure = error; thrown = true }
        if (controller.signal.aborted) throw aborted()
        if (!thrown && result?.ok !== false) return result
        const error = thrown ? failure : result.error
        if (!transient.has(error?.code) || attempt >= retryDelays.length) {
          if (thrown) throw failure
          return result
        }
        // Backoff does not occupy a slot or prevent another window from finishing.
        await pause(retryDelays[attempt], controller.signal)
      }
    } finally {
      signal?.removeEventListener('abort', cancel)
      controllers.delete(controller)
    }
  }
  return {
    read: (sessionId, path, range, signal) => read('read', sessionId, path, range, signal),
    readBytes: (sessionId, path, options, signal) => read('readBytes', sessionId, path, options, signal),
    dispose() { closed = true; for (const controller of controllers) controller.abort() },
  }
}
