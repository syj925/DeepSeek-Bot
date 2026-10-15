import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    contents: [
      "export { ComposerVoice } from './src/client/composer.js'",
      "export { PendingQuestion } from './src/client/questions.js'",
      "export { MemberDock } from './src/client/member-status.js'",
    ].join('\n'),
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
  },
  bundle: true, format: 'cjs', platform: 'browser', write: false, logLevel: 'silent',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})

class Element {
  constructor({ canvas = null, content = null, rect = { left: 0, width: 400 }, parent = null } = {}) {
    this.canvas = canvas
    this.content = content
    this.rect = rect
    this.parentElement = parent
    this.style = {}
    this.dataset = {}
    this.matches = new Map()
    this.focused = 0
  }
  closest(selector) {
    if (selector === '.bt-canvas-window') return this.canvas
    if (selector === '[data-conversation-content]') return this.content
    throw new Error(`unexpected ancestor selector: ${selector}`)
  }
  querySelector(selector) { return this.matches.get(selector) ?? null }
  getBoundingClientRect() { return this.rect }
  focus() { this.focused += 1 }
}
class Input extends Element {}
class TextArea extends Element {}
class Select extends Element {}

function runtime() {
  const effects = [], layouts = [], observers = [], listeners = new Map(), selection = []
  const document = {
    activeElement: null,
    dialog: null,
    querySelector(selector) {
      if (selector === '[role="dialog"], [aria-modal="true"]') return this.dialog
      throw new Error(`global lookup crossed the window boundary: ${selector}`)
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: 'fragment',
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: current => ({ current }), useId: () => 'question',
    useEffect: effect => effects.push(effect), useLayoutEffect: effect => layouts.push(effect),
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this) }
    observe(target) { this.targets.push(target) }
    disconnect() { this.disconnected = true }
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, document,
    window: { getSelection: () => ({ selectAllChildren: node => selection.push(node), collapseToEnd: () => selection.push('end') }) },
    HTMLElement: Element, HTMLInputElement: Input, HTMLTextAreaElement: TextArea, HTMLSelectElement: Select,
    ResizeObserver, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
    require(name) {
      if (name === 'react') return react
      if (name === 'react-dom') return { createPortal: node => node }
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return {}
      throw new Error(`unexpected platform module: ${name}`)
    },
  })
  const flush = queue => {
    const cleanups = queue.splice(0).map(run => run()).filter(value => typeof value === 'function')
    return () => cleanups.forEach(cleanup => cleanup())
  }
  return {
    ...module.exports, document, selection, observers,
    effects: () => flush(effects), layouts: () => flush(layouts),
    key(key, options = {}) {
      const event = { key, target: new Element(), defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, ...options }
      for (const listener of listeners.get('keydown') ?? []) listener(event)
      return event
    },
  }
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  return node.children?.map(child => find(child, predicate)).find(Boolean)
}

test('reply quoting focuses only the editor in its own conversation', () => {
  const page = runtime(), content = new Element(), ownEditor = new Element(), otherEditor = new Element()
  content.matches.set('[role=textbox][contenteditable=true]', ownEditor)
  const inserted = [], cleared = []
  const voice = page.ComposerVoice({
    sessionId: 'writer', useUi: pick => pick({ quote: { sessionId: 'writer', token: 1, text: 'A quoted reply' } }),
    inputActions: { captureInsertion: () => 'writer-caret', insertText: (...args) => inserted.push(args) },
    actions: { clearQuote: token => cleared.push(token), speech: () => undefined },
  })
  find(voice, node => node.props.className === 'bt-voice').props.ref.current = new Element({ content })
  page.effects()
  assert.deepEqual(inserted, [['> A quoted reply\n\n', 'writer-caret']])
  assert.deepEqual(cleared, [1])
  assert.equal(ownEditor.focused, 1)
  assert.equal(otherEditor.focused, 0)
  assert.deepEqual(page.selection, [ownEditor, 'end'])
})

test('reply quoting never falls back to another editor when its content is absent', () => {
  const page = runtime(), inserted = []
  const voice = page.ComposerVoice({
    sessionId: 'writer', useUi: pick => pick({ quote: { sessionId: 'writer', token: 1, text: 'Quote' } }),
    inputActions: { captureInsertion: () => 'caret', insertText: text => inserted.push(text) },
    actions: { clearQuote() {}, speech: () => undefined },
  })
  find(voice, node => node.props.className === 'bt-voice').props.ref.current = new Element()
  assert.doesNotThrow(() => page.effects())
  assert.equal(inserted.length, 1)
  assert.deepEqual(page.selection, [])
})

function question(page, id, canvas, answers) {
  const pending = page.PendingQuestion({
    sessionId: id, question: { id: `${id}-question`, question: 'Choose', options: ['First', 'Second'], allowCustom: true },
    actions: { answerQuestion: (...args) => { answers.push(args); return Promise.resolve() }, dismissQuestion() {} },
  })
  const component = pending.children[0], form = component.type(component.props)
  form.props.ref.current = new Element({ canvas })
  const own = new TextArea()
  find(form, node => node.type === 'textarea').props.ref.current = own
  const unmount = page.effects()
  return { form, own, unmount }
}

test('question letter shortcuts only answer the active canvas window, including after focus changes', () => {
  const page = runtime(), firstWindow = new Element(), secondWindow = new Element(), answers = []
  secondWindow.dataset.active = 'true'
  const first = question(page, 'first', firstWindow, answers), second = question(page, 'second', secondWindow, answers)
  assert.equal(page.key('a').defaultPrevented, true)
  assert.equal(answers.length, 1)
  assert.equal(answers[0][0], 'second')
  assert.deepEqual(JSON.parse(JSON.stringify(answers[0][2])), { selected: ['First'], custom: '' })
  secondWindow.dataset.active = 'false'
  firstWindow.dataset.active = 'true'
  page.key('b')
  assert.equal(answers.length, 2)
  assert.equal(answers[1][0], 'first')
  first.unmount()
  second.unmount()
  assert.equal(page.key('a').defaultPrevented, false)
})

test('inactive canvas questions cannot focus custom answers or consume typing and dialog keys', () => {
  const page = runtime(), canvas = new Element(), answers = []
  const card = question(page, 'writer', canvas, answers)
  assert.equal(page.key('c').defaultPrevented, false)
  assert.equal(card.own.focused, 0)
  canvas.dataset.active = 'true'
  assert.equal(page.key('c').defaultPrevented, true)
  assert.equal(card.own.focused, 1)
  assert.equal(page.key('a', { target: new TextArea() }).defaultPrevented, false)
  page.document.dialog = new Element()
  assert.equal(page.key('a').defaultPrevented, false)
  assert.deepEqual(answers, [])
})

test('classic questions retain their existing letter shortcut behavior', () => {
  const page = runtime(), answers = []
  const card = question(page, 'classic', null, answers)
  assert.equal(page.key('b').defaultPrevented, true)
  assert.equal(answers[0][0], 'classic')
  assert.equal(page.key('c').defaultPrevented, true)
  assert.equal(card.own.focused, 1)
})

function memberDock(page, node) {
  const tree = page.MemberDock({
    sessionId: 'room',
    useRoster: pick => pick({ byId: { writer: { id: 'writer', name: 'Writer' } }, roomsById: { room: { id: 'room', members: ['writer'] } } }),
    useWork: pick => pick({ bots: {}, rooms: { room: [{ botId: 'writer', since: 1 }] }, approvals: [] }),
    actions: {},
  })
  tree.props.ref.current = node
  return page.layouts()
}

test('member dock measurement uses only its own classic transcript column', () => {
  const page = runtime(), content = new Element(), scroller = new Element(), parent = new Element()
  const flow = new Element({ rect: { left: 240, width: 600 }, parent: scroller })
  content.matches.set('[data-chat-flow]', flow)
  const dock = new Element({ content, rect: { left: 210, width: 100 }, parent })
  const cleanup = memberDock(page, dock)
  assert.deepEqual(dock.style, { marginInlineStart: '30px', width: '600px' })
  assert.equal(page.observers.length, 1)
  assert.deepEqual(page.observers[0].targets, [flow, scroller, parent])
  cleanup()
  assert.equal(page.observers[0].disconnected, true)
})

test('canvas member docks use local width at any zoom without reading screen rectangles', () => {
  const page = runtime(), canvas = new Element(), dock = new Element({ canvas })
  dock.getBoundingClientRect = () => { throw new Error('scaled screen rectangle must not become CSS width') }
  memberDock(page, dock)
  assert.deepEqual(dock.style, { marginInlineStart: '0px', width: '100%' })
  assert.equal(page.observers.length, 0)
})
