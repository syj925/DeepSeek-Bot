import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { openPresentedFile } from '../src/client/canvas-presented-file.js'

const { JSDOM } = createRequire(join(process.env.DSH_HARNESS, 'package.json'))('jsdom')
function fixture(sessionId = 'employee-part') {
  const dom = new JSDOM(`<div class="bt-canvas-session"><div data-presented-file><button title="C:/reports/结果.csv"><span>Preview</span></button><div><button title="C:/reports/结果.csv">Copy path</button></div><div><button>WPS</button><button>Menu</button></div></div></div>`)
  const root = dom.window.document.querySelector('.bt-canvas-session')
  const calls = [], native = []
  const actions = { isCanvasVisible: () => true, openConversationFile: (...args) => calls.push(args) }
  root.addEventListener('click', event => openPresentedFile(event, sessionId, actions), true)
  const buttons = [...root.querySelectorAll('button')]
  buttons.forEach((button, index) => button.addEventListener('click', () => native.push(index)))
  return { dom, root, calls, native, actions, buttons }
}
test('delivery preview routes to its embedded employee or group without calling the unmounted sidebar', () => {
  for (const session of ['employee-part', 'group-session']) for (const detail of [0, 1]) {
    const app = fixture(session)
    app.buttons[0].firstChild.dispatchEvent(new app.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, detail }))
    assert.deepEqual(app.calls, [[session, 'C:/reports/结果.csv']])
    assert.deepEqual(app.native, [])
    app.dom.window.close()
  }
})
test('copy path, WPS and menu actions keep their own behavior', () => {
  const app = fixture()
  app.buttons.slice(1).forEach(button => button.click())
  assert.deepEqual(app.calls, [])
  assert.deepEqual(app.native, [1, 2, 3])
  app.dom.window.close()
})
test('classic mode, unrelated buttons and cards without a path are not intercepted', () => {
  const app = fixture()
  app.actions.isCanvasVisible = () => false; app.buttons[0].click()
  app.actions.isCanvasVisible = () => true; app.buttons[0].removeAttribute('title'); app.buttons[0].click()
  assert.deepEqual(app.calls, [])
  assert.deepEqual(app.native, [0, 0])
  app.dom.window.close()
})
test('a nested conversation keeps the file source session instead of using the outer conversation', () => {
  const app = fixture('outer')
  const inner = app.dom.window.document.createElement('div'); inner.className = 'bt-canvas-session'
  inner.innerHTML = '<div data-presented-file><button title="report.md">Preview</button></div>'
  app.root.append(inner)
  const calls = []
  inner.addEventListener('click', event => openPresentedFile(event, 'inner', { ...app.actions, openConversationFile: (...args) => calls.push(args) }), true)
  inner.querySelector('button').click()
  assert.deepEqual(app.calls, []); assert.deepEqual(calls, [['inner', 'report.md']])
  app.dom.window.close()
})
