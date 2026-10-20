import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/client/employee-work-context.js'], bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'] })
const module = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports,
  require: () => ({ createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(Boolean) }) }) })
const { employeeGroupWork, EmployeeWorkContext } = module.exports
const plain = value => JSON.parse(JSON.stringify(value))
const find = (node, predicate) => predicate(node) ? node : node?.children?.map(child => find(child, predicate)).find(Boolean)

function fixture() {
  const bot = { id: 'writer', sessionId: 'writer-current', parts: ['writer-old'], taskIndex: [] }
  const room = { id: 'research', name: 'Research', members: ['chief', 'writer'] }
  return { bot, room, roster: { bots: [bot], byId: { writer: bot }, rooms: [room], roomsById: { research: room }, taskNotices: [] } }
}

test('group work belongs to the employee across private parts, never to group views or another employee', () => {
  const h = fixture()
  h.bot.taskIndex = [{ key: 'research:1', roomId: 'research', title: 'Market report', summary: 'Report delivered.', at: 1000 }]
  assert.equal(employeeGroupWork('writer-current', h.roster)[0].title, 'Market report')
  assert.equal(employeeGroupWork('writer-old', h.roster)[0].title, 'Market report')
  assert.deepEqual(plain(employeeGroupWork('research', h.roster)), [])
  assert.deepEqual(plain(employeeGroupWork('other-worker', h.roster)), [])
  assert.equal(h.bot.taskIndex[0].targetId, undefined, 'presentation never mutates the saved task record')
})

test('private completions and handoffs do not become completed group work', () => {
  const h = fixture()
  h.bot.taskIndex = [
    { key: 'private:1', title: 'Private report', at: 3000 },
    { key: 'handoff:research:1', roomId: 'research', title: 'Delegated report', at: 4000 },
  ]
  assert.deepEqual(plain(employeeGroupWork('writer', h.roster)), [])
  h.roster.taskNotices.push({ id: 'reply', botId: 'writer', roomId: 'research', title: 'New message', summary: 'I have a question.', at: 5000, kind: 'message' })
  const records = employeeGroupWork('writer', h.roster)
  assert.equal(records.length, 1)
  assert.equal(records[0].completed, false)
})

test('verified group results backfill old teams, respect membership and deduplicate indices and notices', () => {
  const h = fixture()
  h.room.task = { status: 'completed', cycle: 2, completedAt: 4000, result: { title: 'Report', summary: 'Delivered', files: [] } }
  h.bot.taskIndex = [
    { key: 'research:1', roomId: 'research', title: 'Report', summary: 'Delivered', at: 1000 },
    { key: 'research:2', roomId: 'research', title: 'Report', summary: 'Delivered', at: 4100 },
  ]
  h.roster.taskNotices.push({ id: 'done', botId: 'writer', roomId: 'research', title: 'Report', summary: 'Delivered', at: 4000, files: [] })
  assert.deepEqual(plain(employeeGroupWork('writer', h.roster).map(record => record.key)), ['research:2', 'research:1'])
  h.bot.taskIndex = []
  h.roster.taskNotices = []
  assert.equal(employeeGroupWork('writer', h.roster)[0].completed, true)
  h.room.members = ['chief']
  assert.deepEqual(plain(employeeGroupWork('writer', h.roster)), [])
  h.room.task.originBotId = 'writer'
  assert.equal(employeeGroupWork('writer', h.roster).length, 1)
  h.room.task.status = 'active'
  assert.deepEqual(plain(employeeGroupWork('writer', h.roster)), [], 'unfinished work does not become a completion')
})

test('records are bounded and sorted by actual activity time, not roster order', () => {
  const h = fixture()
  h.bot.taskIndex = Array.from({ length: 12 }, (_, index) => ({ key: `research:${index}`, roomId: 'research', title: `Report ${index}`, at: 1000 + index }))
  const records = employeeGroupWork('writer', h.roster)
  assert.equal(records.length, 6)
  assert.deepEqual(plain(records.map(record => record.title)), ['Report 11', 'Report 10', 'Report 9', 'Report 8', 'Report 7', 'Report 6'])
})

test('compact work context opens the original group locally and reuses the existing result viewer', () => {
  const h = fixture(), opened = [], results = []
  h.bot.taskIndex = [{ key: 'research:1', roomId: 'research', sessionId: 'group-writer-old', title: 'Report', summary: 'Verified.', at: 1000, files: [{ path: '/reports/market.md', name: 'market.md' }] }]
  const tree = EmployeeWorkContext({ sessionId: 'writer-current', roster: h.roster,
    actions: { openSession: () => assert.fail('floating conversation navigation must win'), openTaskResult: (record, file) => results.push({ record, file }) }, onOpenConversation: id => opened.push(id) })
  assert.equal(tree.type, 'details')
  assert.equal(tree.props.open, undefined, 'work history is collapsed until requested')
  find(tree, node => node?.type === 'button' && node.children.includes('Open original group')).props.onClick()
  assert.deepEqual(opened, ['research'])
  find(tree, node => node?.type === 'button' && node.props.title === '/reports/market.md').props.onClick()
  assert.equal(results[0].record.targetId, 'research')
  assert.equal(results[0].record.sessionId, 'group-writer-old', 'file lookup retains its execution session')
  assert.equal(results[0].file.path, '/reports/market.md')
})

test('deleted groups retain factual summaries without dead navigation or file actions', () => {
  const h = fixture()
  h.bot.taskIndex = [{ key: 'gone:1', roomId: 'gone', title: 'Saved report', summary: 'Still saved.', files: [{ path: '/report.md' }] }]
  const record = employeeGroupWork('writer', h.roster)[0]
  assert.equal(record.available, false)
  assert.equal(record.at, undefined, 'missing timestamps are not replaced by invented activity')
  const tree = EmployeeWorkContext({ sessionId: 'writer', roster: h.roster, actions: {} })
  assert.equal(find(tree, node => node?.type === 'button'), undefined)
  assert.ok(find(tree, node => node?.type === 'p' && node.children.includes('Still saved.')))
})
