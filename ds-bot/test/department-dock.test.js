import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/canvas-workspace.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const findAll = (node, predicate) => !node || typeof node !== 'object' ? [] : [
  ...(predicate(node) ? [node] : []), ...(node.children ?? []).flatMap(child => findAll(child, predicate)),
]
const find = (node, predicate) => findAll(node, predicate)[0]
const hasClass = (node, className) => node?.props?.className?.split(/\s+/).includes(className)
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
    emit(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event) },
    count(type) { return listeners.get(type)?.size ?? 0 },
  }
}

function harness() {
  const timers = new Map(), frames = new Map(), effects = []
  const scope = { slots: [] }
  let cursor = 0, serial = 0, writes = 0, mounted = true, clock = 0
  const hook = init => scope.slots[cursor++] ??= init()
  const useEffect = (create, deps) => {
    const cell = hook(() => ({ kind: 'effect', deps: undefined, cleanup: undefined }))
    if (!sameDeps(cell.deps, deps)) {
      effects.push(() => {
        cell.cleanup?.()
        cell.deps = deps
        cell.cleanup = create()
      })
    }
  }
  const useMemo = (make, deps) => {
    const cell = hook(() => ({ kind: 'memo', deps: undefined }))
    if (!sameDeps(cell.deps, deps)) { cell.deps = deps; cell.value = make() }
    return cell.value
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext: value => ({ _currentValue: value }),
    Fragment: 'fragment',
    useRef: initial => hook(() => ({ current: initial })),
    useState(initial) {
      const cell = hook(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      return [cell.value, next => {
        assert.ok(mounted, 'a scheduled callback must not update an unmounted Dock')
        const value = typeof next === 'function' ? next(cell.value) : next
        if (!Object.is(cell.value, value)) { writes++; cell.value = value }
      }]
    },
    useEffect, useLayoutEffect: useEffect, useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useId: () => 'dock-test-id',
  }
  const window = eventSurface(), document = eventSurface()
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, window, document,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, delay, at: clock + delay }); return id },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: node => node.computedStyle ?? { paddingLeft: '0px', paddingRight: '0px' },
    require: name => ({ react, 'react-dom': { createPortal: node => node }, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  return {
    ...module.exports, timers, frames, window, document,
    render(component, props, attachRefs) {
      let tree
      for (let iteration = 0; iteration < 10; iteration++) {
        const before = writes
        cursor = 0
        tree = component(props)
        attachRefs?.(tree)
        while (effects.length) effects.shift()()
        if (before === writes) return tree
      }
      assert.fail('Dock effect rendering did not settle')
    },
    advance(ms) {
      const until = clock + ms
      for (;;) {
        const next = Array.from(timers).filter(([, timer]) => timer.at <= until).sort((left, right) => left[1].at - right[1].at)[0]
        if (!next) break
        const [id, timer] = next
        clock = timer.at
        if (timers.delete(id)) timer.callback()
      }
      clock = until
    },
    flushTimers() {
      const pending = Array.from(timers).sort((left, right) => left[1].at - right[1].at)
      for (const [id, timer] of pending) {
        if (!timers.delete(id)) continue
        clock = Math.max(clock, timer.at)
        timer.callback()
      }
    },
    flushFrame() {
      for (const [id, callback] of Array.from(frames)) {
        if (!frames.delete(id)) continue
        callback(16)
      }
    },
    unmount() {
      for (const slot of scope.slots) if (slot.kind === 'effect') slot.cleanup?.()
      mounted = false
    },
  }
}

function fixture() {
  const render = harness()
  assert.equal(typeof render.CanvasDepartmentDock, 'function', 'workspace must export CanvasDepartmentDock')
  const metrics = { tab: 0, root: 0, wrap: 0, queries: 0 }
  const rootRect = { left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }
  const wrapRect = { left: 200, top: 600, right: 800, bottom: 672, width: 600, height: 72 }
  const rects = new Map([
    ['ops', { left: 260, top: 600, right: 318, bottom: 672, width: 58, height: 72 }],
    ['design', { left: 500, top: 600, right: 558, bottom: 672, width: 58, height: 72 }],
  ])
  const tabNodes = new Map()
  for (const key of rects.keys()) tabNodes.set(key, {
    dataset: { deptKey: key },
    getBoundingClientRect() { metrics.tab++; return rects.get(key) },
    scrollIntoView() {},
  })
  const scroll = {
    ...eventSurface(), scrollLeft: 0,
    getBoundingClientRect() { metrics.wrap++; return wrapRect },
    querySelector(selector) {
      metrics.queries++
      const key = selector.match(/data-dept-key=["']([^"']+)["']/)?.[1]
      return tabNodes.get(key) ?? null
    },
  }
  const root = { getBoundingClientRect() { metrics.root++; return rootRect } }
  const region = {
    ...eventSurface(),
    contains: target => target === region || target === scroll || [...tabNodes.values()].includes(target),
  }
  const ops = { id: 'real-ops', name: '运营 Agent', role: '运营主管' }
  const designer = { id: 'real-designer', name: '设计 Agent', role: '设计主管' }
  const roster = { bots: [ops, designer], rooms: [], byId: { [ops.id]: ops, [designer.id]: designer }, roomsById: {}, mainBotIds: [], teams: [
    { id: 'ops', name: '运营部', members: [ops.id], leaderId: ops.id },
    { id: 'design', name: '设计部', members: [designer.id], leaderId: designer.id },
  ] }
  const drag = { current: null }, starts = [], opened = []
  const props = {
    roster, work: { bots: {}, rooms: {} }, actions: { openCanvasEntity: (...args) => opened.push(args) },
    size: { width: 1000, height: 700 }, canvasRoot: { current: root }, activeDeptKey: 'ops', drag,
    onStartDrag(event, entity) { starts.push([event, entity]); drag.current = { kind: 'dock', entity } },
  }
  let tree
  const attachRefs = value => {
    for (const node of findAll(value, candidate => candidate.props?.ref)) {
      const target = hasClass(node, 'bt-dock-scroll-wrap') ? scroll : node.props.style?.display === 'contents' ? region : null
      if (!target) continue
      if (typeof node.props.ref === 'function') node.props.ref(target)
      else node.props.ref.current = target
    }
  }
  const draw = () => tree = render.render(render.CanvasDepartmentDock, props, attachRefs)
  const item = key => find(tree, value => value.type?.name === 'DockItem' && value.props['data-dept-key'] === key)
  const floating = () => find(tree, value => hasClass(value, 'bt-dock-floating-avatar-layer'))
  const icon = key => find(item(key), value => value.type?.name === 'DockIcon')
  const popover = () => find(tree, value => value.type?.name === 'DockCollaborationPopover')
  const enter = key => {
    item(key).props.onMouseEnter({ currentTarget: tabNodes.get(key), target: tabNodes.get(key) })
    return draw()
  }
  const leave = key => item(key).props.onMouseLeave({ currentTarget: tabNodes.get(key), relatedTarget: null })
  const pointer = key => ({ button: 0, pointerId: 1, clientX: 280, clientY: 630,
    currentTarget: tabNodes.get(key), preventDefault() {}, stopPropagation() {},
  })
  draw()
  return { render, draw, item, icon, floating, popover, enter, leave, pointer, props, drag, starts, opened, metrics, rects, tabNodes, scroll, rootRect, wrapRect, region }
}

test('hover preserves each original keyed icon while preview and selected department stay independent', () => {
  const app = fixture()
  const original = ['ops', 'design'].map(key => ({
    key, itemKey: app.item(key).props.key, type: app.icon(key).type,
    botId: find(app.icon(key), node => node.type?.name === 'BotAvatar').props.bot.id,
  }))
  app.enter('ops')
  assert.equal(app.popover(), undefined)
  app.render.advance(120); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-ops')
  app.leave('ops'); app.enter('design')
  assert.equal(app.popover(), undefined, 'the old department preview must disappear while the new one waits')
  app.render.advance(120); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  for (const { key, itemKey, type, botId } of original) {
    assert.equal(app.item(key).props.key, itemKey)
    assert.equal(app.icon(key).type, type)
    assert.equal(find(app.icon(key), node => node.type?.name === 'BotAvatar').props.bot.id, botId)
  }
  assert.equal(app.floating(), undefined, 'hover must keep the original icon instead of replacing it with a separate floating avatar')
  assert.equal(app.item('ops').props['aria-pressed'], true)
  assert.equal(app.item('design').props['aria-pressed'], false)
  assert.equal(app.render.timers.size, 0)
  app.item('design').props.onClick({ detail: 0, currentTarget: app.tabNodes.get('design') })
  app.draw()
  assert.equal(app.item('design').props['aria-pressed'], true)
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  app.render.unmount()
})

test('a quick sweep across departments shows no preview before the latest 120ms dwell', () => {
  const app = fixture()
  for (const key of ['ops', 'design', 'ops', 'design']) {
    app.enter(key)
    app.render.advance(40); app.draw()
    assert.equal(app.popover(), undefined)
    assert.equal(app.render.timers.size, 1, 'only the latest department may own a pending preview')
  }
  app.render.advance(79); app.draw()
  assert.equal(app.popover(), undefined)
  app.render.advance(1); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  app.render.unmount()
})

test('leaving before the preview delay cancels it and closes the active department after 240ms', () => {
  const app = fixture()
  app.enter('ops'); app.render.advance(119); app.draw()
  app.leave('ops')
  app.draw().props.onMouseLeave()
  app.render.advance(120); app.draw()
  assert.equal(app.popover(), undefined, 'a canceled preview must not appear after the pointer has left')
  assert.equal(app.render.timers.size, 1, 'only the delayed department close remains')
  app.render.advance(120)
  const tree = app.draw()
  assert.equal(tree.props['data-hover-open'], false)
  assert.equal(app.popover(), undefined)
  assert.equal(app.render.timers.size, 0)
  app.render.unmount()
})

test('crossing to a new tab cancels the old deadline and only opens the latest department', () => {
  const app = fixture()
  app.enter('ops'); app.render.advance(80); app.draw()
  app.leave('ops'); app.enter('design')
  app.render.advance(40); app.draw()
  assert.equal(app.popover(), undefined, 'the first department deadline must not publish stale content')
  app.render.advance(79); app.draw()
  assert.equal(app.popover(), undefined)
  app.render.advance(1); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  assert.equal(app.render.timers.size, 0)
  app.render.unmount()
})

test('repeated close scheduling, region and popover re-entry, explicit close and unmount clear hover timers', () => {
  const app = fixture()
  app.enter('ops'); app.render.advance(120); app.draw()
  app.leave('ops'); app.leave('ops')
  assert.equal(app.render.timers.size, 1)
  app.draw().props.onMouseEnter()
  assert.equal(app.render.timers.size, 0)
  app.draw().props.onMouseLeave()
  assert.equal(app.render.timers.size, 1)
  app.popover().props.onMouseEnter()
  assert.equal(app.render.timers.size, 0)
  app.popover().props.onMouseLeave()
  assert.equal(app.render.timers.size, 1)
  app.popover().props.onClose(); app.draw()
  assert.equal(app.render.timers.size, 0)
  assert.equal(app.popover(), undefined)
  app.leave('ops')
  assert.equal(app.render.timers.size, 0, 'leaving a closed Dock does not schedule an idle timer')
  app.enter('design'); app.render.advance(120); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  app.leave('design')
  assert.equal(app.render.timers.size, 1)
  app.render.unmount()
  assert.equal(app.render.timers.size, 0)
  app.render.advance(1000)
})

test('pointer-generated clicks do not reopen preview while keyboard detail zero opens immediately', () => {
  const app = fixture()
  app.enter('design'); app.leave('design')
  assert.equal(app.render.timers.size, 1)
  app.item('design').props.onPointerDown(app.pointer('design')); app.draw()
  assert.equal(app.render.timers.size, 0)
  assert.equal(app.starts.length, 1)
  assert.equal(app.popover(), undefined)
  app.drag.current = null // Workspace finishes the pointer gesture before the browser click.
  app.item('design').props.onClick({ detail: 1, currentTarget: app.tabNodes.get('design') }); app.draw()
  assert.equal(app.popover(), undefined)
  app.item('design').props.onClick({ detail: 0, currentTarget: app.tabNodes.get('design') }); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  assert.equal(app.item('design').props['aria-pressed'], true)
  assert.equal(app.render.timers.size, 0, 'keyboard activation must not wait for the hover delay')
  assert.equal(app.starts.length, 1)
  app.render.unmount()
})

test('native drag payload stays intact and an active Workspace drag suppresses hover', () => {
  const app = fixture(), mime = new Map()
  const transfer = { setData: (type, value) => mime.set(type, value) }
  app.enter('ops')
  app.item('ops').props.onPointerDown(app.pointer('ops'))
  app.item('ops').props.onDragStart({ dataTransfer: transfer }); app.draw()
  assert.equal(app.popover(), undefined)
  assert.equal(app.render.timers.size, 0)
  assert.deepEqual(JSON.parse(mime.get('application/x-ds-bot')), { id: 'real-ops', kind: 'bot' })
  assert.equal(transfer.effectAllowed, 'copyMove')
  app.enter('design')
  assert.equal(app.popover(), undefined)
  assert.equal(app.render.timers.size, 0)
  app.drag.current = null
  app.enter('design'); app.render.advance(120); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-designer')
  app.drag.current = { kind: 'avatar' }
  app.enter('ops')
  assert.notEqual(app.popover()?.props.entity.id, 'real-ops')
  app.drag.current = null
  app.enter('ops'); app.render.advance(120); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-ops')
  app.render.unmount()
})

test('dragging and unmounting cancel pending previews without late state updates', () => {
  for (const finish of ['pointer', 'native', 'unmount']) {
    const app = fixture()
    app.enter('design'); app.render.advance(60)
    assert.equal(app.render.timers.size, 1)
    if (finish === 'pointer') app.item('design').props.onPointerDown(app.pointer('design'))
    else if (finish === 'native') app.item('design').props.onDragStart({ dataTransfer: { setData() {} } })
    else app.render.unmount()
    assert.equal(app.render.timers.size, 0)
    app.render.advance(1000)
    if (finish !== 'unmount') { app.draw(); assert.equal(app.popover(), undefined); app.render.unmount() }
  }
})

test('scroll work is merged into one animation frame using the latest geometry and canceled on unmount', () => {
  const app = fixture()
  app.enter('ops'); app.render.advance(120); app.draw()
  const initial = { ...app.popover().props.pos }
  const before = { ...app.metrics }
  for (const left of [300, 340, 380]) {
    app.rects.set('ops', { ...app.rects.get('ops'), left, right: left + 58 })
    app.scroll.emit('scroll')
  }
  assert.equal(app.render.frames.size, 1)
  assert.equal(app.metrics.tab, before.tab, 'scroll handler defers tab measurement')
  assert.equal(app.metrics.root, before.root, 'scroll handler defers root measurement')
  app.draw()
  assert.deepEqual({ ...app.popover().props.pos }, initial)
  app.render.flushFrame(); app.draw()
  assert.equal(app.popover().props.pos.tabCenterX, 409)
  assert.equal(app.metrics.tab - before.tab, 1)
  assert.equal(app.metrics.root - before.root, 1)
  assert.equal(app.render.frames.size, 0)
  app.scroll.emit('scroll')
  assert.equal(app.render.frames.size, 1)
  assert.equal(app.scroll.count('scroll'), 1)
  app.render.unmount()
  assert.equal(app.render.frames.size, 0)
  assert.equal(app.scroll.count('scroll'), 0)
  app.render.flushFrame()
})

test('a tab outside the scroll viewport or removed from the Dock closes its department preview', () => {
  for (const outside of [{ left: 100, right: 158 }, { left: 840, right: 898 }, null]) {
    const app = fixture()
    app.enter('ops'); app.render.advance(120); app.draw()
    if (outside) app.rects.set('ops', { ...app.rects.get('ops'), ...outside })
    else app.tabNodes.delete('ops')
    app.scroll.emit('scroll'); app.render.flushFrame(); app.draw()
    assert.equal(app.floating(), undefined)
    assert.equal(app.popover(), undefined)
    app.render.unmount()
  }
  const app = fixture()
  app.enter('ops'); app.render.advance(120); app.draw()
  app.rects.set('ops', { ...app.rects.get('ops'), left: 180, right: 238 })
  app.scroll.emit('scroll'); app.render.flushFrame(); app.draw()
  assert.equal(app.popover()?.props.entity.id, 'real-ops', 'a partially visible tab remains usable')
  app.render.unmount()
})
