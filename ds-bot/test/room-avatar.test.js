import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/mark.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'browser', write: false,
  external: ['react'],
})
const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports,
  require: () => ({ createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) }),
})
const { RoomAvatar } = module.exports

function fixture(count, id = 'planning', size = 36) {
  const members = Array.from({ length: count }, (_, index) => `member-${index}`)
  const room = { id, members }
  const roster = { byId: Object.fromEntries(members.map(member => [member, { id: member }])) }
  return { room, roster, size }
}
function seats(tree) {
  return Array.from(tree.children, child => {
    const { left, top, width, height } = child.props.style
    return [left, top, width, height].map(value => Number.parseFloat(value))
  })
}

test('three or more portraits vary in size and stay inside the container', () => {
  for (let count = 3; count <= 12; count++) {
    for (let group = 0; group < 20; group++) {
      const tree = RoomAvatar(fixture(count, `group-${group}`))
      const layout = seats(tree)
      assert.equal(layout.length, Math.min(count, 9))
      assert.ok(new Set(layout.map(([, , width]) => width.toFixed(2))).size > 1)
      for (const [x, y, width, height] of layout) {
        assert.equal(width, height)
        assert.ok(x >= 5.99 && y >= 5.99)
        assert.ok(x + width <= 94.01 && y + height <= 94.01)
      }
    }
  }
})

test('a group keeps its composition across renders and scales proportionally', () => {
  const original = seats(RoomAvatar(fixture(6)))
  assert.deepEqual(seats(RoomAvatar(fixture(6))), original)
  const resized = seats(RoomAvatar(fixture(6, 'planning', 64)))
  resized.forEach((seat, index) => seat.forEach((value, axis) => assert.ok(Math.abs(value - original[index][axis]) < 0.00001)))
  assert.notDeepEqual(seats(RoomAvatar(fixture(6, 'another-group'))), original)
})

test('portraits may overlap at their rims but never cover another portrait centre', () => {
  for (let count = 3; count <= 9; count++) {
    const layout = seats(RoomAvatar(fixture(count)))
    layout.forEach(([x, y, width], index) => {
      for (const [otherX, otherY, otherWidth] of layout.slice(index + 1)) {
        const distance = Math.hypot(x + width / 2 - otherX - otherWidth / 2, y + width / 2 - otherY - otherWidth / 2)
        assert.ok(distance > Math.max(width, otherWidth) / 2)
      }
    })
  }
})

test('two portraits retain equal sizes and diagonal placement', () => {
  const [[x1, y1, size1], [x2, y2, size2]] = seats(RoomAvatar(fixture(2)))
  assert.equal(size1, size2)
  assert.ok(x1 < x2 && y1 < y2)
})

test('overflow preserves the first eight identities and the complete remaining count', () => {
  const props = fixture(12)
  const before = Array.from(props.room.members)
  const tree = RoomAvatar(props)
  assert.deepEqual(Array.from(tree.children.slice(0, 8), child => child.props.key), before.slice(0, 8))
  assert.equal(tree.children[8].children[0], '+4')
  assert.deepEqual(props.room.members, before)
  assert.equal(Object.keys(props.roster.byId).length, 12)
})

test('tiny inline avatars keep the readable stack and empty groups keep their fallback', () => {
  const tiny = RoomAvatar(fixture(6, 'inline', 18))
  assert.equal(tiny.props.className, 'bt-stack')
  assert.equal(tiny.children.length, 4)
  assert.equal(tiny.children[3].children[0], '+3')
  const empty = RoomAvatar(fixture(0))
  assert.equal(empty.type.name, 'BotMark')
})
