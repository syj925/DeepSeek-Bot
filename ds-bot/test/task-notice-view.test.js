import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: ['src/client/task-notices.js'], bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'] })
const module = { exports: {} }
runInNewContext(outputFiles[0].text, { module, exports: module.exports, setTimeout, clearTimeout,
  require: name => name === 'react' ? {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }),
    useEffect() {}, useRef: current => ({ current }), useState: value => [typeof value === 'function' ? value() : value, () => {}],
  } : {} })
const find = (node, match) => match(node) ? node : node?.children?.map(child => find(child, match)).find(Boolean)

test('notification body and padding open once; files and dismiss do not navigate', () => {
  const opens = [], files = [], dismissed = []
  const item = { id: 'notice', botId: 'writer', targetId: 'room', name: 'Writer', kind: 'message', summary: 'Done', files: [{ name: 'Report', path: '/report.docx' }] }
  const actions = { openTaskConversation: value => opens.push(value.id), openTaskResult: (_, file) => files.push(file.path), dismissTaskNotices: ids => dismissed.push(ids) }
  const tree = module.exports.TaskNotifications({ useTaskNotices: pick => pick({ open: false, toasts: ['notice'], items: [item] }), useRoster: pick => pick({ byId: {} }), actions })
  const toastElement = find(tree, node => node?.type?.name === 'Toast')
  const toast = toastElement.type({ ...toastElement.props, children: toastElement.children })
  const deliveryElement = find(toast, node => node?.type?.name === 'Delivery')
  const delivery = deliveryElement.type(deliveryElement.props)
  assert.equal(find(delivery, node => node?.type === 'button' && node.children.includes('Open conversation')), undefined)
  delivery.props.onClick({ target: { closest: () => null } })
  toast.props.onClick({ target: { closest: () => ({}) } })
  assert.deepEqual(opens, ['notice'])
  toast.props.onClick({ target: { closest: () => null } })
  assert.equal(opens.length, 2)
  const self = {}
  delivery.props.onKeyDown({ target: self, currentTarget: self, key: 'Enter', preventDefault() {} })
  assert.equal(opens.length, 3)
  const file = find(delivery, node => node?.type === 'button' && node.props.title === '/report.docx')
  file.props.onClick()
  delivery.props.onClick({ target: { closest: () => ({}) } })
  toast.props.onClick({ target: { closest: () => ({}) } })
  assert.deepEqual(files, ['/report.docx'])
  assert.equal(opens.length, 3)
  assert.equal(typeof find(toast, node => node?.props?.className === 'bt-icon-btn bt-notice-dismiss').props.onClick, 'function')
})
