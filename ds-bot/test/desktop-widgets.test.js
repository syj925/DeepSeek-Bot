import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/desktop-widgets.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})
function fixture() {
  const saved = new Map(), listeners = new Map(), effects = [], states = []
  let cursor = 0
  const module = { exports: {} }
  const context = {
    module, exports: module.exports,
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name), dispatchEvent: event => listeners.get(event.type)?.(event) },
    require: () => ({
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState(initial) { const at = cursor++; if (!(at in states)) states[at] = initial(); return [states[at], value => { states[at] = value }] },
      useEffect: effect => effects.push(effect),
    }),
  }
  runInNewContext(outputFiles[0].text, context)
  const api = module.exports
  return { ...api, context, saved, effects, listeners, draw(props) { cursor = 0; return api.DesktopWidget(props) } }
}

test('removing and restoring a widget retains content and coordinates while persisting visibility', () => {
  const app = fixture(), opened = [], child = { draft: 'Unsent message' }
  app.saved.set('ds-bot:spatial-widgets', '{"quick":{"x":200,"y":100}}')
  const props = { id: 'quick', children: child, actions: { openMenu: menu => opened.push(menu) } }
  let tree = app.draw(props)
  const cleanup = app.effects.shift()()
  const event = { target: { closest: () => false }, clientX: 90, clientY: 120, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
  tree.props.onContextMenu(event)
  assert.equal(event.prevented, true); assert.equal(event.stopped, true)
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ kind: 'widget', id: 'quick', x: 90, y: 120 }])
  app.setWidgetHidden('quick', true)
  tree = app.draw(props)
  assert.equal(tree.props.style.display, 'none')
  assert.equal(tree.children[0], child)
  assert.deepEqual(JSON.parse(JSON.stringify(app.hiddenWidgets())), ['quick'])
  app.setWidgetHidden('quick', false)
  assert.equal(app.draw(props).props.style.display, 'contents')
  assert.equal(app.saved.get('ds-bot:spatial-widgets'), '{"quick":{"x":200,"y":100}}')
  cleanup(); assert.equal(app.listeners.size, 0)
})

test('widget menus preserve native text editing menus and ignore unsupported widget ids', () => {
  const app = fixture()
  const tree = app.draw({ id: 'agenda', actions: { openMenu() { assert.fail('text editing must remain native') } } })
  tree.props.onContextMenu({ target: { closest: () => true } })
  app.setWidgetHidden('unknown', true)
  assert.equal(app.saved.size, 0)
  app.saved.set('ds-bot:hidden-widgets', '["quick","unknown"]')
  assert.equal(JSON.stringify(app.hiddenWidgets()), '["quick"]')
  app.saved.set('ds-bot:hidden-widgets', '{broken')
  assert.equal(JSON.stringify(app.hiddenWidgets()), '[]')
  Object.defineProperty(app.context, 'localStorage', { get() { throw new Error('denied') } })
  assert.equal(JSON.stringify(app.hiddenWidgets()), '[]')
  assert.doesNotThrow(() => app.setWidgetHidden('quick', true))
})
