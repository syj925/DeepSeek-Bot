import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { MAX_AVATAR_IMAGE } from '../src/host/constants.js'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/create-bot.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
})
const find = (node, predicate) => !node || typeof node !== 'object' ? undefined
  : predicate(node) ? node : node.children.map(child => find(child, predicate)).find(Boolean)
const photo = 'data:image/webp;base64,AA=='

function fixture() {
  let cursor = 0, failure = false
  const slots = [], requests = [], submitted = [], created = []
  const react = {
    createContext: value => ({ value }), useContext: context => context.value,
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const cell = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect() { cursor++ },
  }
  const module = { exports: {} }
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, Blob,
    fetch: async url => {
      requests.push(url)
      return { ok: !failure, blob: async () => new Blob(['portrait'], { type: 'application/octet-stream' }) }
    },
    createImageBitmap: async () => ({ width: 640, height: 360, close() {} }),
    document: { createElement: tag => {
      assert.equal(tag, 'canvas')
      return { getContext: () => ({ drawImage() {} }), toDataURL: () => photo }
    } },
    require: name => ({ react, 'react-dom': {}, '@deepseek-ai/dsh-client-ui-primitives': {} })[name],
  })
  const props = {
    roster: { bots: [], models: [{ ref: 'mock/model' }] },
    actions: { createBot: async payload => {
      if (payload.avatar.image) {
        assert.match(payload.avatar.image, /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/)
        assert.ok(payload.avatar.image.length <= MAX_AVATAR_IMAGE)
      }
      submitted.push(payload)
      return { id: 'created', name: payload.name }
    } },
    onCreated: bot => created.push(bot), onBack() {},
  }
  const draw = () => { cursor = 0; return module.exports.CreateBot(props) }
  const choose = label => find(draw(), node => node.type === 'button' && node.props['aria-label'] === label).props.onClick()
  const create = async () => {
    find(draw(), node => node.props.className === 'bt-send bt-create-go').props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    return draw()
  }
  return { draw, choose, create, requests, submitted, created, set failure(value) { failure = value } }
}

test('each retained character is converted from its poster to an accepted avatar before creation', async () => {
  for (const label of ['QiBit', '技术', '设计', '行政', '运营', '财务', '销售']) {
    const app = fixture()
    app.choose(label)
    assert.equal(find(app.draw(), node => node.type?.name === 'AgentAvatarPreview').props.agent.name, label)
    await app.create()
    assert.equal(app.submitted.length, 1)
    assert.equal(app.created.length, 1)
    assert.equal(app.submitted[0].avatar.image, photo)
    assert.equal(app.requests.length, 1)
    assert.match(app.requests[0], /^data:image\/webp;base64,/)
    assert.ok(!app.requests[0].includes('/animated/'))
  }
})

test('a missing poster reports the error without creating a different-looking Bot and allows retry', async () => {
  const app = fixture()
  app.choose('设计')
  app.failure = true
  let tree = await app.create()
  assert.equal(app.submitted.length, 0)
  assert.equal(app.created.length, 0)
  assert.ok(find(tree, node => node.props.role === 'alert'))
  assert.equal(find(tree, node => node.props.className === 'bt-send bt-create-go').props.disabled, false)
  app.failure = false
  tree = await app.create()
  assert.equal(app.submitted.length, 1)
  assert.equal(app.created.length, 1)
  assert.equal(app.submitted[0].avatar.image, photo)
})

test('uploaded photos are kept as image data and do not fetch a preset or its animation', async () => {
  const app = fixture()
  app.choose('技术')
  find(app.draw(), node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { value: 'photo.png', files: [{ type: 'image/png', size: 123 }] } })
  await new Promise(resolve => setImmediate(resolve))
  await app.create()
  assert.equal(app.submitted.length, 1)
  assert.equal(app.submitted[0].avatar.image, photo)
  assert.deepEqual(app.requests, [])
})
