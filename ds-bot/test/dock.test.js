import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/dock.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})

class Events {
  constructor() { this.listeners = new Map() }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  emit(type, fields = {}) {
    const event = { type, target: this, currentTarget: this, ...fields }
    for (const listener of this.listeners.get(type) ?? []) listener(event)
    return event
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0) }
}

function fixture({ externalRegion = true, hoverLift = 0, focusedIconSize = 50, hoverExitDelay = 0 } = {}) {
  const timers = new Map(), frames = new Map(), observers = [], operations = [], scopes = new Map(), pendingEffects = []
  let frameSerial = 0, now = 0, hooks, cursor
  const window = new Events()
  window.performance = { now: () => now }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  const requestAnimationFrame = run => { frames.set(++frameSerial, run); return frameSerial }
  const cancelAnimationFrame = id => frames.delete(id)
  window.requestAnimationFrame = requestAnimationFrame
  window.cancelAnimationFrame = cancelAnimationFrame
  const document = new Events()
  document.defaultView = window
  document.hidden = false
  window.document = document

  class Element extends Events {
    constructor(name, rect = { left: 0, top: 0, width: 260, height: 72 }, parent = null) {
      super()
      this.name = name; this.rect = rect; this.parentElement = parent
      this.ownerDocument = document; this.isConnected = true
      this.scales = []; this.properties = new Map()
      this.style = {
        setProperty: (property, value) => {
          operations.push({ kind: 'write', element: name, property, value: String(value) })
          this.properties.set(property, String(value))
          if (property === '--dock-icon-scale') this.scales.push(Number(value))
        },
        removeProperty: property => this.properties.delete(property),
      }
    }
    getBoundingClientRect() {
      operations.push({ kind: 'read', element: this.name })
      return { ...this.rect, x: this.rect.left, y: this.rect.top, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }
    }
    contains(target) {
      for (let current = target; current; current = current.parentElement) if (current === this) return true
      return false
    }
  }
  class ResizeObserver {
    constructor(run) { this.run = run; this.targets = new Set(); this.disconnected = false; observers.push(this) }
    observe(target) { this.targets.add(target) }
    unobserve(target) { this.targets.delete(target) }
    disconnect() { this.disconnected = true; this.targets.clear() }
    trigger() { if (!this.disconnected) this.run([...this.targets].map(target => ({ target })), this) }
  }

  const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const useEffect = (run, deps) => {
    const index = cursor++, previous = hooks[index]
    if (previous && sameDeps(previous.deps, deps)) return
    const effect = { run, deps, cleanup: previous?.cleanup }
    hooks[index] = effect
    pendingEffects.push(effect)
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext: value => {
      const context = { value }
      context.Provider = ({ value, children }) => { context.value = value; return children }
      return context
    },
    useContext: context => context.value,
    useRef: initial => hooks[cursor++] ??= { current: initial },
    useState: initial => {
      const cell = hooks[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useMemo: (make, deps) => {
      const index = cursor++, previous = hooks[index]
      if (previous && sameDeps(previous.deps, deps)) return previous.value
      const cell = { value: make(), deps }; hooks[index] = cell; return cell.value
    },
    useEffect, useLayoutEffect: useEffect,
  }
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps)
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, window, document,
    performance: window.performance, requestAnimationFrame, cancelAnimationFrame,
    setTimeout(callback, delay) { const id = ++frameSerial; timers.set(id, { callback, deadline: now + delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    ResizeObserver, HTMLElement: Element, Element,
    matchMedia: window.matchMedia,
    require: name => { assert.equal(name, 'react'); return react },
  })
  const render = (component, props, key) => {
    hooks = scopes.get(key) ?? []; scopes.set(key, hooks); cursor = 0
    return component(props)
  }
  const region = new Element('region')
  const nav = new Element('nav', undefined, externalRegion ? region : null)
  const floating = new Element('floating-avatar', undefined, region)
  const popover = new Element('popover', undefined, region)
  const items = Array.from({ length: 3 }, (_, index) => new Element(`item-${index}`, { left: index * 70, top: 0, width: 58, height: 60 }, nav))
  nav.querySelectorAll = () => items
  const tree = render(module.exports.Dock, { ...(externalRegion ? { hoverRegionRef: { current: region } } : {}), hoverLift, focusedIconSize, hoverExitDelay }, 'dock')
  tree.props.ref.current = nav
  if (!externalRegion) {
    // React delegates these props; they are not native listeners on the nav.
    const emitNative = nav.emit.bind(nav)
    nav.emit = (type, fields = {}) => {
      const event = emitNative(type, fields)
      if (type === 'mousemove') tree.props.onMouseMove?.(event)
      if (type === 'mouseleave') tree.props.onMouseLeave?.(event)
      return event
    }
  }
  const provider = tree.children.find(child => child?.type === module.exports.DockProvider)
  assert.ok(provider, 'Dock exposes its item registration context')
  const context = render(module.exports.DockProvider, provider.props, 'provider')
  context.type(context.props)
  for (const [index, item] of items.entries()) {
    const button = render(module.exports.DockItem, { index }, `item-${index}`)
    button.props.ref.current = item
  }
  // Child registration effects run before the parent's observer/listener effect.
  for (const effect of pendingEffects.splice(0).reverse()) {
    effect.cleanup?.()
    effect.cleanup = effect.run()
  }
  const hover = externalRegion ? region : nav
  const move = (clientX, target = nav) => hover.emit('mousemove', { clientX, pageX: clientX, target })
  const frame = () => {
    now += 1000 / 60
    const queued = [...frames.values()]; frames.clear()
    queued.forEach(run => run(now))
  }
  const settle = () => {
    let count = 0
    while (frames.size && count++ < 300) frame()
    assert.equal(frames.size, 0, 'a stationary pointer must not leave an endless animation loop')
    return count
  }
  const unmount = () => {
    for (const cells of scopes.values()) for (const cell of cells) cell?.cleanup?.()
    pendingEffects.splice(0)
  }
  const reads = () => operations.filter(operation => operation.kind === 'read' && operation.element.startsWith('item-'))
  const scale = index => Number(items[index].properties.get('--dock-icon-scale') ?? 1)
  const lift = index => Number.parseFloat(items[index].properties.get('--dock-icon-lift') ?? '0')
  const advance = ms => { now += ms; for (const [id, timer] of timers) if (timer.deadline <= now && timers.delete(id)) timer.callback() }
  return { window, nav, region, floating, popover, items, frames, observers, operations, hover, move, frame, settle, unmount, reads, scale, lift, timers, advance }
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .003, `${actual} should be close to ${expected}`)

test('Dock settles at the original magnification and stops requesting frames while still hovered', t => {
  const app = fixture(); t.after(app.unmount)
  app.move(29)
  assert.equal(app.frames.size, 1)
  const animatedFrames = app.settle()
  assert.ok(animatedFrames > 0)
  near(app.scale(0), 50 / 36)
  near(app.scale(2), 1)
  assert.equal(app.frames.size, 0)
  assert.deepEqual(app.items.map(item => item.rect.width), [58, 58, 58], 'magnification must not change hit boxes')
  t.diagnostic(`Initial hover: ${animatedFrames} animation frames, ${app.reads().length} item measurements, ${app.frames.size} frames pending after settling`)
})

test('new pointer motion wakes one loop without accumulating duplicate frame callbacks', t => {
  const app = fixture(); t.after(app.unmount)
  for (let i = 0; i < 8; i++) app.move(29)
  assert.equal(app.frames.size, 1)
  app.settle()
  for (let i = 0; i < 8; i++) app.move(169)
  assert.equal(app.frames.size, 1)
  app.settle()
  near(app.scale(2), 50 / 36)
  near(app.scale(0), 1)
})

test('Dock batches all geometry reads before scale writes and does not remeasure or rewrite settled values', t => {
  const app = fixture(); t.after(app.unmount)
  app.operations.length = 0
  app.move(29); app.frame()
  const initialReads = app.reads().length
  assert.equal(initialReads, app.items.length)
  const lastRead = app.operations.findLastIndex(operation => operation.kind === 'read' && operation.element.startsWith('item-'))
  const firstWrite = app.operations.findIndex(operation => operation.kind === 'write' && operation.property === '--dock-icon-scale')
  assert.ok(firstWrite > lastRead, 'read every fixed hit box before writing any scale')
  app.settle()
  assert.equal(app.reads().length, initialReads, 'spring integration must reuse cached geometry')
  assert.ok(app.items[0].scales.length > 0)
  for (const item of app.items) {
    for (let index = 1; index < item.scales.length; index++) assert.notEqual(item.scales[index], item.scales[index - 1], `${item.name} should not receive an unchanged scale`)
  }
})

test('scroll, window resize and ResizeObserver refresh cached geometry under a stationary pointer', t => {
  const app = fixture(); t.after(app.unmount)
  app.move(29); app.settle()
  let before = app.reads().length
  for (const item of app.items) item.rect.left -= 70
  app.window.emit('scroll', { target: app.nav })
  app.settle()
  assert.equal(app.reads().length, before + app.items.length)
  near(app.scale(1), 50 / 36)
  before = app.reads().length
  app.window.emit('resize')
  app.settle()
  assert.equal(app.reads().length, before + app.items.length)
  assert.ok(app.observers.length > 0, 'Dock observes changes to its layout')
  before = app.reads().length
  for (const observer of app.observers) observer.trigger()
  app.settle()
  assert.equal(app.reads().length, before + app.items.length, 'observer notifications coalesce into one geometry pass')
  t.diagnostic(`Initial hover plus scroll, resize and observer invalidations: ${app.reads().length} item measurements total for ${app.items.length} items`)
})

test('the shared hover region keeps magnification across nav, floating avatar and popover until fully left', t => {
  const app = fixture(); t.after(app.unmount)
  app.move(29); app.settle()
  app.nav.emit('mouseleave', { relatedTarget: app.floating })
  app.move(29, app.floating); app.settle()
  near(app.scale(0), 50 / 36)
  app.move(29, app.popover); app.settle()
  near(app.scale(0), 50 / 36)
  app.hover.emit('mouseleave', { relatedTarget: null })
  app.settle()
  app.items.forEach((_, index) => near(app.scale(index), 1))
})

test('Dock without an external hover region still responds to its own nav', t => {
  const app = fixture({ externalRegion: false }); t.after(app.unmount)
  app.move(29); app.settle()
  near(app.scale(0), 50 / 36)
  app.nav.emit('mouseleave', { relatedTarget: null }); app.settle()
  near(app.scale(0), 1)
})

test('unmount cancels the active frame and removes hover, scroll, resize and observer callbacks', () => {
  const app = fixture()
  app.move(29)
  assert.equal(app.frames.size, 1)
  app.unmount()
  assert.equal(app.frames.size, 0)
  assert.equal(app.region.listenerCount, 0)
  assert.equal(app.nav.listenerCount, 0)
  assert.equal(app.window.listenerCount, 0)
  assert.ok(app.observers.every(observer => observer.disconnected))
  app.move(169)
  app.window.emit('scroll'); app.window.emit('resize')
  assert.equal(app.frames.size, 0, 'removed listeners cannot restart an unmounted animation')
})


test('department icons scale and rise continuously from their fixed original hit boxes', t => {
  const app = fixture({ hoverLift: 30, focusedIconSize: 52 }); t.after(app.unmount)
  app.move(29); app.frame()
  assert.ok(app.scale(0) > 1 && app.scale(0) < 52 / 36)
  assert.ok(app.lift(0) < 0 && app.lift(0) > -30)
  app.settle()
  near(app.scale(0), 52 / 36)
  assert.equal(app.lift(0), -30)
  app.move(169); app.frame()
  assert.ok(app.lift(0) > -30 && app.lift(0) < 0, 'the previous icon must return rather than disappear')
  assert.ok(app.lift(2) < 0 && app.lift(2) > -30, 'the next icon must rise from its original location')
  app.settle()
  near(app.scale(2), 52 / 36)
  assert.equal(app.lift(2), -30)
  assert.equal(app.lift(0), 0)
  assert.deepEqual(app.items.map(item => item.rect.width), [58, 58, 58])
  app.hover.emit('mouseleave'); app.settle()
  app.items.forEach((_, index) => { near(app.scale(index), 1); assert.equal(app.lift(index), 0) })
  assert.equal(app.frames.size, 0)
})

test('moving across a department preview keeps the originating icon animation target', t => {
  const app = fixture({ hoverLift: 30, focusedIconSize: 52 }); t.after(app.unmount)
  app.move(29); app.settle()
  const before = app.operations.length
  app.move(169, app.popover)
  app.move(-300, app.floating)
  assert.equal(app.frames.size, 0, 'preview movement must not wake or retarget the Dock')
  near(app.scale(0), 52 / 36)
  assert.equal(app.lift(0), -30)
  assert.equal(app.lift(2), 0)
  assert.equal(app.operations.length, before)
  app.move(169); app.settle()
  near(app.scale(2), 52 / 36)
})


test('the gap before a department preview does not lower the icon, while a full exit settles and cleans up', t => {
  const app = fixture({ hoverLift: 30, focusedIconSize: 52, hoverExitDelay: 240 }); t.after(app.unmount)
  app.move(29); app.settle()
  app.hover.emit('mouseleave')
  app.advance(120)
  assert.equal(app.lift(0), -30)
  assert.equal(app.frames.size, 0)
  app.move(169, app.popover)
  app.advance(240)
  assert.equal(app.timers.size, 0)
  assert.equal(app.lift(0), -30, 're-entering the preview cancels the pending return animation')
  near(app.scale(0), 52 / 36)
  app.hover.emit('mouseleave')
  app.advance(240); app.settle()
  assert.equal(app.lift(0), 0)
  near(app.scale(0), 1)
  assert.equal(app.frames.size, 0)
  app.move(169); app.settle()
  app.hover.emit('mouseleave')
  assert.equal(app.timers.size, 1)
  app.unmount()
  assert.equal(app.timers.size, 0)
})
