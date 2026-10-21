import assert from 'node:assert/strict'
import { test } from 'node:test'
import { departmentDisplay, independentDockDisplay, orderDockGroups, temporaryDockRepresentative } from '../src/client/dock-department-display.js'

const labels = ['总裁办', '人事部', '设计部', '渠道部', '技术研发部', '数据运营部']

test('department display preserves the sidebar avatars for leaders and members', () => {
  for (const name of labels) {
    const agents = [
      { id: 'leader', isLead: true, avatar: { image: 'saved-leader' } },
      { id: 'member', avatar: { image: 'saved-member' } },
      { id: 'shape', avatar: { shape: 'moon' } },
    ]
    const department = { key: 'actual-team', name, desc: 'Actual responsibilities', agents }
    const displayed = departmentDisplay(department)
    assert.equal(displayed.agents, agents)
    assert.equal(displayed.desc, department.desc)
    assert.equal(displayed.key, department.key)
  }
  const chief = { id: 'chief', generalAssistant: true }
  assert.equal(independentDockDisplay(chief), chief, 'use the same default portrait as the sidebar')
  const customChief = { ...chief, avatar: { image: 'saved-chief' } }
  assert.equal(independentDockDisplay(customChief), customChief)
})

test('unknown teams, groups and independent employees stay accessible and sorting preserves their relative order', () => {
  const unknown = { key: 'real-lab', name: 'Research Lab', agents: [{ id: 'real-researcher', role: '产品设计' }] }
  assert.equal(departmentDisplay(unknown), unknown, 'employee role never infers a department')
  const bot = { id: 'independent', name: '产品经理', avatar: { image: 'saved' } }
  assert.equal(independentDockDisplay(bot), bot)
  const ops = departmentDisplay({ key: 'real-ops', name: '运营部', agents: [{ id: 'ops-lead', isLead: true }] })
  const groups = [
    { key: 'room:planning', leadEntity: { id: 'planning' } },
    { key: 'real-ops', leadEntity: ops.agents[0], dept: ops },
    { key: unknown.key, leadEntity: unknown.agents[0], dept: unknown },
    { key: 'bot:chief', leadEntity: { id: 'chief', generalAssistant: true } },
    { key: 'bot:independent', leadEntity: bot },
  ]
  assert.deepEqual(orderDockGroups(groups).map(group => group.key),
    ['bot:chief', 'real-ops', 'room:planning', 'real-lab', 'bot:independent'])
  assert.equal(groups[0].key, 'room:planning', 'sorting does not mutate the caller array')
})

test('temporary department lead uses the former executive portrait while employee identities survive', () => {
  const bot = { id: 'real-temp', name: '临时测试', employment: 'temporary', avatar: { image: 'saved-photo' } }
  assert.equal(independentDockDisplay(bot), bot)
  const displayed = temporaryDockRepresentative(bot)
  assert.equal(displayed.id, bot.id)
  assert.equal(displayed.employment, 'temporary')
  assert.equal(displayed.dockPortraitAssetId, '27_strategy')
  assert.match(displayed.avatar.image, /^data:image\/webp;base64,/)
  assert.equal(bot.avatar.image, 'saved-photo')
  assert.equal(departmentDisplay(null), null)
  assert.equal(orderDockGroups([]).length, 0, 'empty organization never creates placeholder people or departments')
})
