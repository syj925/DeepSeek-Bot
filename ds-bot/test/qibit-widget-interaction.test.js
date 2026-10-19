import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/qibit-command-center.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

const findAll = (node, predicate) => !node || typeof node !== 'object' ? [] : [
  ...(predicate(node) ? [node] : []), ...node.children.flatMap(child => findAll(child, predicate)),
]
const find = (node, predicate) => findAll(node, predicate)[0]
const byClass = (tree, name) => find(tree, node => String(node.props.className ?? '').split(' ').includes(name))
const character = tree => find(tree, node => node.type?.name === 'AgentAvatarPreview')
const anchor = tree => ({ x: tree.props.style.left + tree.props.style.width / 2, y: tree.props.style.top + (tree.props['data-folded'] ? 212 : 284) })

function fixture(initial = { x: 700, y: 400, folded: false }) {
  const slots = [], frames = new Map(), writes = [], calls = []
  const saved = new Map([['ds-bot:spatial-widgets', JSON.stringify({ 'qibit-command': initial })]])
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { writes.push({ key, value }); saved.set(key, value) },
  }
  let cursor = 0, serial = 0, updates = 0, renders = 0
  const root = { style: {}, dataset: {} }
  const captured = new Set()
  const grip = {
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext: value => ({ _currentValue: value }),
    useContext: context => context._currentValue,
    useState(initialValue) {
      const slot = slots[cursor++] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; updates++ }]
    },
    useRef(initialValue) { return slots[cursor++] ??= { current: initialValue } },
    useEffect() { cursor++ }, useLayoutEffect() { cursor++ },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, localStorage: storage,
    requestAnimationFrame: run => { const id = ++serial; frames.set(id, run); return id },
    cancelAnimationFrame: id => frames.delete(id),
    require: name => ({ react, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const actions = { openPalette: query => calls.push(['search', query]), openCanvasEntity: id => calls.push(['entity', id]) }
  const props = { actions, roster: { bots: [] }, searchIcon: () => null }
  const draw = () => {
    cursor = 0; renders++
    const tree = module.exports.QiBitCommandCenter(props)
    tree.props.ref.current = root
    Object.assign(root.style, tree.props.style)
    root.dataset.folded = String(tree.props['data-folded'])
    return tree
  }
  const pointer = (type, x, y, extra = {}) => ({
    type, pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y,
    currentTarget: grip, preventDefault() {}, stopPropagation() {}, ...extra,
  })
  return {
    draw, root, writes, calls, frames, captured, pointer,
    saved: () => JSON.parse(saved.get('ds-bot:spatial-widgets'))['qibit-command'],
    get updates() { return updates }, get renders() { return renders },
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(run => run()) },
  }
}

test('drag motion batches its own DOM update and saves the final character anchor without replaying', () => {
  const app = fixture()
  let tree = app.draw()
  const drag = byClass(tree, 'bt-qibit-drag')
  const replay = character(tree).props.triggerKey
  const beforeUpdates = app.updates, beforeRenders = app.renders
  drag.props.onPointerDown(app.pointer('pointerdown', 100, 100))
  assert.ok(app.captured.has(1))
  drag.props.onPointerMove(app.pointer('pointermove', 103, 101))
  assert.equal(app.frames.size, 0, 'a click-sized movement does not begin dragging')
  drag.props.onPointerMove(app.pointer('pointermove', 120, 110))
  drag.props.onPointerMove(app.pointer('pointermove', 145, 135))
  drag.props.onPointerMove(app.pointer('pointermove', 160, 140))
  assert.equal(app.frames.size, 1, 'several moves share a single animation frame')
  assert.equal(app.root.style.transform, 'none')
  assert.equal(app.updates, beforeUpdates, 'pointer motion does not update React state')
  assert.equal(app.renders, beforeRenders)
  assert.equal(app.writes.length, 0, 'pointer motion does not synchronously write storage')
  app.flushFrames()
  assert.equal(app.root.style.transform, 'translate3d(60px,40px,0)')
  drag.props.onPointerUp(app.pointer('pointerup', 160, 140))
  assert.deepEqual(app.saved(), { x: 760, y: 440, folded: false })
  assert.equal(app.writes.length, 1)
  assert.equal(app.root.style.transform, 'none')
  assert.equal(app.root.dataset.dragging, undefined)
  assert.equal(app.frames.size, 0)
  assert.equal(app.captured.size, 0)
  tree = app.draw()
  assert.deepEqual(anchor(tree), { x: 760, y: 440 })
  assert.equal(character(tree).props.triggerKey, replay)
  assert.deepEqual(app.calls, [])
})

test('pointer cancellation rolls back its temporary transform and never saves a new position', () => {
  const app = fixture()
  const tree = app.draw(), original = anchor(tree)
  const drag = byClass(tree, 'bt-qibit-drag')
  drag.props.onPointerDown(app.pointer('pointerdown', 100, 100))
  drag.props.onPointerMove(app.pointer('pointermove', 180, 140))
  app.flushFrames()
  assert.equal(app.root.style.transform, 'translate3d(80px,40px,0)')
  drag.props.onPointerMove(app.pointer('pointermove', 200, 160))
  assert.equal(app.frames.size, 1)
  drag.props.onPointerCancel(app.pointer('pointercancel', 200, 160))
  assert.equal(app.frames.size, 0)
  assert.equal(app.root.style.transform, 'none')
  assert.equal(app.root.dataset.dragging, undefined)
  assert.equal(app.captured.size, 0)
  assert.equal(app.writes.length, 0)
  assert.deepEqual(anchor(app.draw()), original)
  assert.deepEqual(app.saved(), { x: 700, y: 400, folded: false })
  assert.deepEqual(app.calls, [])
})

test('folding hides the command body while preserving the query, selected function and character timeline', () => {
  const app = fixture()
  let tree = app.draw()
  find(tree, node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'Quarterly work plan' } })
  byClass(tree, 'bt-qibit-functions').children[0].props.onClick()
  tree = app.draw()
  const original = anchor(tree), replay = character(tree).props.triggerKey
  assert.equal(replay, 1)
  assert.ok(find(tree, node => node.type?.name === 'FeatureCards'))
  byClass(tree, 'bt-qibit-fold').props.onClick()
  tree = app.draw()
  assert.equal(tree.props['data-folded'], true)
  assert.equal(find(tree, node => node.props.id === 'bt-qibit-command-body').props.hidden, true)
  assert.equal(byClass(tree, 'bt-qibit-fold').props['aria-expanded'], false)
  assert.equal(find(tree, node => node.type?.name === 'FeatureCards'), undefined)
  assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'search').props.value, 'Quarterly work plan')
  assert.equal(byClass(tree, 'bt-qibit-functions').children[0].props['aria-pressed'], true)
  assert.deepEqual(anchor(tree), original)
  assert.equal(character(tree).props.triggerKey, replay)
  byClass(tree, 'bt-qibit-fold').props.onClick()
  tree = app.draw()
  assert.equal(tree.props['data-folded'], false)
  assert.equal(find(tree, node => node.props.id === 'bt-qibit-command-body').props.hidden, false)
  assert.equal(byClass(tree, 'bt-qibit-fold').props['aria-expanded'], true)
  assert.ok(find(tree, node => node.type?.name === 'FeatureCards'))
  assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'search').props.value, 'Quarterly work plan')
  assert.deepEqual(anchor(tree), original)
  assert.equal(character(tree).props.triggerKey, replay)
  assert.deepEqual(app.calls, [])
})

test('keyboard movement uses eight pixel steps, Shift uses twenty four, and Home restores automatic placement', () => {
  const app = fixture()
  const press = (key, shiftKey = false) => {
    const tree = app.draw()
    let prevented = false, stopped = false
    byClass(tree, 'bt-qibit-drag').props.onKeyDown({ key, shiftKey, preventDefault() { prevented = true }, stopPropagation() { stopped = true } })
    assert.equal(prevented, true)
    assert.equal(stopped, true)
    return app.draw()
  }
  let tree = press('ArrowRight')
  assert.deepEqual(anchor(tree), { x: 708, y: 400 })
  tree = press('ArrowDown', true)
  assert.deepEqual(anchor(tree), { x: 708, y: 424 })
  tree = press('ArrowLeft', true)
  assert.deepEqual(anchor(tree), { x: 684, y: 424 })
  tree = press('ArrowUp')
  assert.deepEqual(anchor(tree), { x: 684, y: 416 })
  tree = press('Home')
  assert.deepEqual(app.saved(), { x: null, y: null, folded: false })
  assert.deepEqual(anchor(tree), { x: 700, y: 308 })
  assert.equal(character(tree).props.triggerKey, 0)
  assert.deepEqual(app.calls, [])
})

test('hovering over the character when folded triggers animation', () => {
  const app = fixture({ x: 700, y: 400, folded: true })
  let tree = app.draw()
  assert.equal(tree.props['data-folded'], true)
  const initialReplay = character(tree).props.triggerKey
  const drag = byClass(tree, 'bt-qibit-drag')
  drag.props.onPointerEnter(app.pointer('pointerenter', 100, 100))
  tree = app.draw()
  assert.equal(character(tree).props.triggerKey, initialReplay + 1)
})

test('clicking the search bar retracts the surrounding feature cards', () => {
  const app = fixture({ x: 700, y: 400, folded: false })
  let tree = app.draw()
  byClass(tree, 'bt-qibit-functions').children[0].props.onClick()
  tree = app.draw()
  assert.ok(find(tree, node => node.type?.name === 'FeatureCards'))
  assert.equal(byClass(tree, 'bt-qibit-functions').children[0].props['aria-pressed'], true)
  byClass(tree, 'bt-qibit-search').props.onClickCapture()
  tree = app.draw()
  assert.equal(find(tree, node => node.type?.name === 'FeatureCards'), undefined)
  assert.equal(byClass(tree, 'bt-qibit-functions').children[0].props['aria-pressed'], false)
})
