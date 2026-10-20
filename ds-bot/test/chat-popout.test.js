import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/chat-popout.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})

const plain = value => JSON.parse(JSON.stringify(value))
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

function eventSurface() {
  const listeners = new Map()
  return {
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) { listener(event); if (event.immediateStopped) break }
      return !event.defaultPrevented
    },
    count() { return [...listeners.values()].reduce((total, entries) => total + entries.size, 0) },
  }
}

function runtime(options = {}) {
  const frames = new Map(), timers = new Map(), slots = [], effects = [], calls = [], dispatched = []
  let cursor = 0, serial = 0, clock = 0, mounted = true, dirty = false, handlers
  const document = eventSurface(), window = eventSurface()
  class Element {
    constructor(tag = 'div', className = '', rect = box(0, 0, 0, 0)) {
      Object.assign(this, eventSurface())
      this.nodeType = 1
      this.tagName = tag.toUpperCase()
      this.className = className
      this.rect = rect
      this.ownerDocument = document
      this.parentElement = null
      this.children = []
      this.childNodes = []
      this.dataset = {}
      this.attributes = new Map()
      this.captures = new Set()
      this.style = { setProperty(name, value) { this[name] = value }, removeProperty(name) { delete this[name] } }
      this.classList = {
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(' ') },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ') },
        contains: name => this.className.split(/\s+/).includes(name),
      }
    }
    matches(selector) {
      return selector.split(',').some(part => {
        const rule = part.trim()
        if (!rule) return false
        if (rule.startsWith('.')) return this.classList.contains(rule.slice(1))
        const attribute = rule.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\](?::not\(\[contenteditable=["']?false["']?\]\))?$/)
        if (attribute) {
          const [, name, value] = attribute
          return this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value) && (!rule.includes(':not(') || this.getAttribute('contenteditable') !== 'false')
        }
        return rule.toLowerCase() === this.tagName.toLowerCase()
      })
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null }
    contains(target) { for (let node = target; node; node = node.parentElement ?? node.parentNode) if (node === this) return true; return false }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]) }
    getBoundingClientRect() { return this.rect }
    getClientRects() { return [this.rect] }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
    getAttribute(name) { return this.attributes.get(name) ?? null }
    hasAttribute(name) { return this.attributes.has(name) }
    removeAttribute(name) { this.attributes.delete(name) }
    setPointerCapture(id) { this.captures.add(id) }
    hasPointerCapture(id) { return this.captures.has(id) }
    releasePointerCapture(id) { this.captures.delete(id) }
    append(...children) { for (const child of children) { child.parentElement = this; child.parentNode = this; this.children.push(child); this.childNodes.push(child) } }
    appendChild(child) { this.append(child); return child }
    remove() {
      if (!this.parentElement) return
      this.parentElement.children = this.parentElement.children.filter(child => child !== this)
      this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this)
      this.parentElement = null
    }
    cloneNode() { return new Element(this.tagName, this.className, this.rect) }
  }
  window.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
  const dispatch = window.dispatchEvent
  window.dispatchEvent = event => { dispatched.push(event); return dispatch(event) }
  window.requestAnimationFrame = callback => { const id = ++serial; frames.set(id, callback); return id }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, at: clock + delay }); return id }
  window.clearTimeout = id => timers.delete(id)
  window.getSelection = () => ({ isCollapsed: true, toString: () => '' })
  document.defaultView = window
  document.body = new Element('body')
  document.documentElement = new Element('html')
  document.createElement = tag => new Element(tag)
  document.getSelection = window.getSelection
  const frame = new Element('div', 'bt-canvas-frame')
  const canvas = new Element('div', 'bt-canvas', options.bounds ?? box(100, 20, 1200, 800))
  const pane = new Element('section', 'bt-team-split-chat', options.rect ?? box(140, 80, 720, 560))
  const header = new Element('header', 'bt-team-chat-bar', box(140, 80, 720, 50))
  const title = new Element('strong', 'bt-team-chat-name', box(170, 90, 180, 28))
  title.childNodes = [{ nodeType: 3, textContent: 'Writer', parentElement: title, parentNode: title }]
  const body = new Element('div', 'bt-team-chat-body', box(140, 130, 720, 510))
  const blank = new Element('div', '', box(150, 500, 600, 80))
  const text = new Element('p', '', box(160, 170, 300, 30))
  text.childNodes = [{ nodeType: 3, textContent: 'Actual conversation text', parentElement: text, parentNode: text }]
  frame.append(canvas, pane); pane.append(header, body); header.append(title); body.append(blank, text)
  document.body.append(frame)
  document.querySelector = selector => document.body.querySelector(selector)
  document.activeElement = pane
  const hook = initialize => slots[cursor++] ??= initialize()
  const useEffect = (create, deps) => {
    const cell = hook(() => ({ deps: undefined, cleanup: undefined }))
    if (!sameDeps(cell.deps, deps)) effects.push(() => { cell.cleanup?.(); cell.deps = deps; cell.cleanup = create() })
  }
  const useMemo = (create, deps) => {
    const cell = hook(() => ({ deps: undefined }))
    if (!sameDeps(cell.deps, deps)) { cell.deps = deps; cell.value = create() }
    return cell.value
  }
  const react = {
    useRef: initial => hook(() => ({ current: initial })), useEffect, useLayoutEffect: useEffect,
    useMemo, useCallback: (callback, deps) => useMemo(() => callback, deps),
    useState(initial) {
      const cell = hook(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      return [cell.value, next => { assert.ok(mounted, 'no state update after unmount'); cell.value = typeof next === 'function' ? next(cell.value) : next; dirty = true }]
    },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, require: name => name === 'react' ? react : {},
    window, document, Element, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    Date: class extends Date { static now() { return clock } },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
    getComputedStyle: () => ({ paddingLeft: '0px', paddingRight: '0px' }),
  })
  const props = { enabled: true, id: 'writer', onPopout: value => calls.push(value), ...options.props }
  const render = next => {
    Object.assign(props, next)
    let limit = 10
    do {
      cursor = 0; dirty = false
      handlers = module.exports.useChatPopoutDrag(props)
      while (effects.length) effects.shift()()
    } while (dirty && --limit > 0)
    assert.ok(limit > 0, 'drag hooks settle')
    return handlers
  }
  const event = (values = {}) => ({
    type: 'pointerdown', button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse',
    clientX: 170, clientY: 110, target: title, currentTarget: pane,
    defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true },
    stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true },
    nativeEvent: {}, ...values,
  })
  const advance = milliseconds => {
    const end = clock + milliseconds
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((left, right) => left[1].at - right[1].at)[0]
      if (!next) break
      const [id, timer] = next
      timers.delete(id); clock = timer.at; timer.callback()
    }
    clock = end
  }
  render()
  return {
    ...module.exports, props, calls, dispatched, frames, timers, document, window, pane, canvas, frame, header, title, body, blank, text, Element, event, render, advance,
    down(values) { const next = event(values); handlers.onPointerDownCapture(next); return next },
    send(type, values = {}, surface = document) { const next = event({ ...values, type }); surface.dispatchEvent(next); return next },
    click(values) { const next = event({ type: 'click', detail: 1, ...values }); handlers.onClickCapture(next); return next },
    key(values) { const next = event({ type: 'keydown', key: 'Enter', shiftKey: true, ctrlKey: true, target: pane, ...values }); handlers.onKeyDownCapture(next); return next },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback() },
    unmount() { for (const cell of slots) cell?.cleanup?.(); mounted = false },
    assertClean() {
      assert.equal(pane.captures.size, 0, 'pointer capture is released')
      assert.equal(frames.size, 0, 'pending preview frames are cancelled')
      assert.deepEqual(document.body.children, [frame], 'drag previews are removed')
      if (calls.length) advance(600)
      assert.equal(document.count(), 0, 'gesture and expired click blocker listeners are removed')
      assert.equal(window.count(), 0, 'window gesture listeners are removed')
      assert.equal(timers.size, 0, 'click blocker expiry timers are removed')
    },
  }
}

test('staging stores geometry before notifying an existing float, and geometry is consumed once', () => {
  const app = runtime()
  let consumed
  app.window.addEventListener(app.CHAT_POPOUT_EVENT, event => { consumed = app.takeChatPopout(event.detail.entityId) })
  const rect = box(350, 180, 500, 400), bounds = box(100, 50, 1200, 900)
  app.stageChatPopout('writer', rect, bounds, app.window)
  assert.deepEqual(plain(consumed), { entityId: 'writer', size: { width: 500, height: 400 }, offset: { x: -100, y: -120 } })
  assert.deepEqual(plain(app.dispatched[0].detail), plain(consumed))
  assert.equal(app.takeChatPopout('writer'), undefined)
  app.unmount()
})

test('staged floats fit CSS client bounds and keep different conversations independent', () => {
  const app = runtime(), rect = Object.freeze(box(-1000, 2000, 2000, 1400)), bounds = Object.freeze(box(200, 100, 1000, 700))
  app.stageChatPopout('writer', rect, bounds, app.window)
  app.stageChatPopout('room', box(400, 200, 500, 400), bounds, app.window)
  assert.deepEqual(plain(app.takeChatPopout('writer')), { entityId: 'writer', size: { width: 976, height: 676 }, offset: { x: 0, y: 0 } })
  assert.deepEqual(plain(app.takeChatPopout('room')), { entityId: 'room', size: { width: 500, height: 400 }, offset: { x: -50, y: -50 } })
  assert.equal(app.takeChatPopout('missing'), undefined)
  app.unmount()
})

test('disabled panes, nonprimary presses and interactive descendants cannot begin a popout', () => {
  for (const kind of ['disabled', 'secondary', 'nonprimary', 'handled', 'ctrl', 'meta', 'shift', 'alt', 'button', 'input', 'link', 'editable', 'image', 'resize', 'optout', 'separator', 'scrollbar']) {
    const app = runtime({ props: { enabled: kind !== 'disabled' } })
    let target = app.title
    if (['button', 'input', 'link', 'editable', 'image', 'resize', 'optout', 'separator', 'scrollbar'].includes(kind)) {
      target = new app.Element(({ input: 'input', link: 'a', editable: 'div', image: 'img', resize: 'div', optout: 'div', separator: 'div', scrollbar: 'div' })[kind] ?? 'button')
      if (kind === 'editable') target.setAttribute('contenteditable', 'true')
      if (kind === 'resize') target.className = 'bt-team-chat-resize'
      if (kind === 'optout') target.setAttribute('data-no-chat-drag', '')
      if (kind === 'separator' || kind === 'scrollbar') target.setAttribute('role', kind)
      app.header.append(target)
    }
    const down = app.down({ target, button: kind === 'secondary' ? 2 : 0, isPrimary: kind !== 'nonprimary', defaultPrevented: kind === 'handled', ctrlKey: kind === 'ctrl', metaKey: kind === 'meta', shiftKey: kind === 'shift', altKey: kind === 'alt' })
    app.send('pointermove', { clientX: 600, clientY: 300 })
    app.send('pointerup', { clientX: 600, clientY: 300 })
    assert.equal(down.defaultPrevented, kind === 'handled', kind)
    assert.equal(app.calls.length, 0, kind)
    app.assertClean(); app.unmount()
  }
})

test('a click or movement below six pixels preserves click behavior, while six pixels starts a drag inside the source pane', () => {
  const app = runtime()
  const down = app.down()
  const short = app.send('pointermove', { clientX: 175, clientY: 110 })
  assert.equal(down.defaultPrevented, false)
  assert.equal(short.defaultPrevented, false)
  assert.equal(app.pane.captures.size, 0)
  app.send('pointerup', { clientX: 175, clientY: 110 })
  assert.equal(app.calls.length, 0)
  assert.equal(app.click().defaultPrevented, false)
  app.assertClean()
  app.down()
  const moved = app.send('pointermove', { clientX: 176, clientY: 110 })
  assert.equal(moved.defaultPrevented, true)
  assert.equal(app.pane.hasPointerCapture(1), true)
  app.send('pointerup', { clientX: 176, clientY: 110 })
  assert.equal(app.calls.length, 1, 'a valid drop need not leave the source panel')
  app.assertClean(); app.unmount()
})

test('motion batches previews and release preserves the grabbed title offset using final client coordinates', () => {
  const app = runtime()
  app.down()
  app.send('pointermove', { clientX: 300, clientY: 180 })
  app.send('pointermove', { clientX: 400, clientY: 220 })
  assert.ok(app.frames.size <= 1, 'at most one preview frame is pending')
  app.send('pointermove', { pointerId: 2, clientX: 1000, clientY: 700 })
  app.send('pointerup', { pointerId: 2, clientX: 1000, clientY: 700 })
  assert.equal(app.calls.length, 0)
  assert.equal(app.pane.hasPointerCapture(1), true)
  app.send('pointerup', { clientX: 570, clientY: 310 })
  assert.equal(app.calls.length, 1)
  const result = app.calls[0]
  assert.equal(result.id, 'writer')
  assert.equal(result.rect.left, 540)
  assert.equal(result.rect.top, 280)
  assert.equal(result.rect.width, 720)
  assert.equal(result.rect.height, 560)
  assert.deepEqual(plain(result.bounds), plain(app.canvas.rect))
  app.flush()
  assert.equal(app.calls.length, 1, 'a queued frame cannot commit a second popout')
  app.assertClean(); app.unmount()
})

test('release outside the canvas never pops out or leaves a drag preview behind', () => {
  const app = runtime()
  app.down(); app.send('pointermove', { clientX: 500, clientY: 300 })
  app.send('pointerup', { clientX: 99, clientY: 300 })
  assert.equal(app.calls.length, 0)
  app.assertClean(); app.unmount()
})

test('mouse can drag noninteractive whitespace but never starts from actual conversation text', () => {
  for (const [target, expected] of [['blank', 1], ['text', 0]]) {
    const app = runtime()
    const down = app.down({ target: app[target], clientX: 200, clientY: target === 'blank' ? 520 : 180 })
    assert.equal(down.defaultPrevented, false)
    app.send('pointermove', { clientX: 500, clientY: 400 })
    app.send('pointerup', { clientX: 500, clientY: 400 })
    assert.equal(app.calls.length, expected, target)
    app.assertClean(); app.unmount()
  }
})

test('touch drags are restricted to the header while header title text remains draggable', () => {
  for (const [target, expected] of [['title', 1], ['blank', 0], ['text', 0]]) {
    const app = runtime()
    app.down({ target: app[target], pointerType: 'touch' })
    app.send('pointermove', { clientX: 500, clientY: 300, pointerType: 'touch' })
    app.send('pointerup', { clientX: 500, clientY: 300, pointerType: 'touch' })
    assert.equal(app.calls.length, expected, target)
    app.assertClean(); app.unmount()
  }
})

test('Escape, cancellation, scroll, blur, resize, lost capture and a second pointer cancel, while handled or composing Escape is preserved', () => {
  for (const reason of ['escape', 'pointercancel', 'scroll', 'blur', 'resize', 'lostpointercapture', 'secondpointer']) {
    const app = runtime()
    app.down(); app.send('pointermove', { clientX: 400, clientY: 220 })
    if (reason === 'escape') app.send('keydown', { key: 'Escape' })
    else if (reason === 'blur' || reason === 'resize') app.send(reason, { target: app.window }, app.window)
    else if (reason === 'secondpointer') app.send('pointerdown', { pointerId: 2 })
    else app.send(reason)
    app.send('pointerup', { clientX: 500, clientY: 300 })
    app.flush()
    assert.equal(app.calls.length, 0, reason)
    app.assertClean(); app.unmount()
  }
  for (const values of [{ defaultPrevented: true }, { isComposing: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }]) {
    const app = runtime()
    app.down(); app.send('pointermove', { clientX: 400, clientY: 220 })
    const escape = app.send('keydown', { key: 'Escape', ...values })
    assert.equal(escape.stopped, false)
    assert.equal(app.pane.hasPointerCapture(1), true, 'IME or an already handled Escape cannot cancel the gesture')
    app.send('pointerup', { clientX: 500, clientY: 300 })
    assert.equal(app.calls.length, 1)
    app.assertClean(); app.unmount()
  }
})

test('composer losing focus to the title does not cancel dragging the conversation', () => {
  const app = runtime()
  app.down()
  app.send('blur', { target: app.body }, app.window)
  app.send('pointermove', { clientX: 500, clientY: 300 })
  app.send('pointerup', { clientX: 500, clientY: 300 })
  assert.equal(app.calls.length, 1)
  app.assertClean(); app.unmount()
})

test('conversation changes, disabling and unmount cancel pending gestures instead of opening a stale conversation', () => {
  for (const reason of ['id', 'disabled', 'unmount']) {
    const app = runtime()
    app.down(); app.send('pointermove', { clientX: 400, clientY: 220 })
    if (reason === 'id') app.render({ id: 'room' })
    else if (reason === 'disabled') app.render({ enabled: false })
    else app.unmount()
    app.send('pointerup', { clientX: 500, clientY: 300 })
    app.flush()
    assert.equal(app.calls.length, 0, reason)
    app.assertClean()
    if (reason !== 'unmount') app.unmount()
  }
})

test('a successful drag blocks one document click after unmount, while keyboard clicks, new presses and expired blockers remain usable', () => {
  for (const route of ['unmount', 'newpress', 'expiry']) {
    const app = runtime()
    app.down(); app.send('pointermove', { clientX: 500, clientY: 300 }); app.send('pointerup', { clientX: 500, clientY: 300 })
    assert.equal(app.calls.length, 1)
    app.unmount()
    app.pane.remove()
    assert.equal(app.send('click', { detail: 0, target: app.canvas }).defaultPrevented, false, 'keyboard activation does not consume the blocker')
    if (route === 'newpress') app.send('pointerdown', { clientX: 500, clientY: 300, target: app.canvas })
    else if (route === 'expiry') app.advance(601)
    else app.advance(599)
    const click = app.send('click', { detail: 1, clientX: 500, clientY: 300, target: app.canvas })
    assert.equal(click.defaultPrevented, route === 'unmount', route)
    assert.equal(click.stopped, route === 'unmount', route)
    assert.equal(app.send('click', { detail: 1, target: app.canvas }).defaultPrevented, false, 'only one synthetic pointer click is suppressed')
    app.assertClean()
  }
})

test('Ctrl or Meta Shift Enter only pops out the focused pane and leaves editor keys and composition alone', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const app = runtime()
    const key = app.key({ ctrlKey: false, metaKey: false, [modifier]: true })
    assert.equal(key.defaultPrevented, true)
    assert.equal(app.calls.length, 1)
    assert.equal(app.calls[0].id, 'writer')
    assert.deepEqual(plain(app.calls[0].rect), plain(app.pane.rect))
    app.assertClean(); app.unmount()
  }
  for (const values of [{ shiftKey: false }, { ctrlKey: false }, { repeat: true }, { isComposing: true }, { nativeEvent: { isComposing: true } }]) {
    const app = runtime()
    assert.equal(app.key(values).defaultPrevented, false)
    assert.equal(app.calls.length, 0)
    app.unmount()
  }
  const app = runtime(), input = new app.Element('textarea')
  app.body.append(input); app.document.activeElement = input
  assert.equal(app.key({ target: input }).defaultPrevented, false)
  assert.equal(app.calls.length, 0)
  app.unmount()
})
