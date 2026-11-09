import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { install, prospectingOperation } from '../src/host/chief-permissions.js'
import { install as approvals } from '../src/host/approvals.js'
import { fakeContext } from './fake-ctx.js'

async function setup(t) {
  const root = await realpath(await mkdtemp(resolve('../.dsh-test-chief-permissions-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const ctx = fakeContext()
  ctx.workspaceRegistry = { get: () => ({ path: root }) }
  const state = { bots: { chief: { id: 'chief', name: 'Chief', generalAssistant: true }, worker: { id: 'worker', name: 'Worker' } },
    rooms: { room: { id: 'room', name: 'Leads', members: ['worker'], task: { status: 'active' } } }, workspaceId: 'workspace' }
  const rt = { ctx, state, live: new Map(), groupOwners: new Map([['group-session', { botId: 'worker', roomId: 'room' }]]),
    chatOwners: new Map([['private', 'worker'], ['chief', 'chief']]), load: async () => {}, save: async () => {},
    botOf: id => state.bots[id], findBot: name => Object.values(state.bots).find(bot => bot.name === name), roomOf: id => state.rooms[id],
    selfOf: id => id === 'group-session' || id === 'private' ? 'worker' : id,
    chatOf: id => id === 'worker' ? 'private' : id, ensureGroupSession: async () => ({ id: 'group-session' }) }
  install(rt); approvals(rt)
  const emit = (id, type, turn = 1) => {
    if (type === 'turn/start') rt.live.set(id, { turn, calls: new Map() })
    for (const listener of ctx.listeners.get('session/event')) listener({ id }, { type, data: { turn } })
    if (type === 'turn/end') rt.live.delete(id)
  }
  const request = (id, name = 'web_search', args = { queries: ['manufacturers'] }, signal) => {
    rt.live.get(id).calls.set('call', { name, args: JSON.stringify(args) })
    return { agent: { id, session: { id, header: { cwd: root } } }, toolName: name, callId: 'call', signal }
  }
  const grant = room => rt.grantTaskAccess('chief', { botId: 'worker', ...(room ? { roomId: 'room' } : {}), objective: 'Find qualified companies' })
  return { root, ctx, rt, state, emit, request, grant, ask: (req, next = async () => 'from-host') => ctx.listeners.get('approval/request')[0](req, next) }
}

test('Chief cannot self-enable policy or grant as another employee; grant is scoped to one turn and conversation', async t => {
  const h = await setup(t)
  await assert.rejects(h.grant(), /off/)
  await h.rt.setChiefPermissionPolicy(true)
  await assert.rejects(h.rt.grantTaskAccess('worker', { botId: 'worker', objective: 'test' }), /General Assistant/)
  await h.grant(true)
  h.emit('group-session', 'turn/start'); h.emit('private', 'turn/start')
  assert.equal(await h.rt.reviewChiefApproval(h.request('private')), false)
  assert.equal(await h.ask(h.request('group-session')), 'allowed-once')
  assert.equal(h.rt.approvalsView().length, 0)
  h.emit('group-session', 'turn/end')
  h.emit('group-session', 'turn/start', 2)
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session')), false)
})

test('disabled policy keeps native private approvals and group manual approval resumes the same request', async t => {
  const h = await setup(t)
  h.emit('private', 'turn/start'); h.emit('group-session', 'turn/start')
  assert.equal(await h.ask(h.request('private')), 'from-host')
  const pending = h.ask(h.request('group-session', 'pwsh', { command: 'anything' }))
  const entry = h.rt.approvalsView()[0]
  h.rt.answerApproval(entry.id, 'allow')
  assert.equal(await pending, 'allowed-once')
  assert.equal(h.rt.approvalsView().length, 0)
})

test('pending group review authorizes safe operations without redispatch; shell remains a human decision', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true)
  h.emit('group-session', 'turn/start')
  const pending = h.ask(h.request('group-session'))
  for (let i = 0; i < 10 && !h.rt.approvalsView().length; i++) await new Promise(resolve => setImmediate(resolve))
  await h.rt.reviewApprovalWithChief(h.rt.approvalsView()[0].id)
  assert.equal(await pending, 'allowed-once')
  const shell = h.ask(h.request('group-session', 'pwsh', { command: 'Write-Output test' }))
  for (let i = 0; i < 10 && !h.rt.approvalsView().length; i++) await new Promise(resolve => setImmediate(resolve))
  const entry = h.rt.approvalsView()[0]
  await assert.rejects(h.rt.reviewApprovalWithChief(entry.id), /outside/)
  h.rt.answerApproval(entry.id, 'reject')
  assert.equal(await shell, 'rejected')
})

test('revocation, expiry, abort, group completion and policy disable all prevent automatic approval', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true); h.emit('group-session', 'turn/start')
  let grant = await h.grant(true)
  grant.expiresAt = 0
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session')), false)
  await h.grant(true)
  const abort = new AbortController(); abort.abort()
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session', 'web_search', { queries: ['test'] }, abort.signal)), false)
  h.state.rooms.room.task.status = 'completed'
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session')), false)
  h.state.rooms.room.task.status = 'active'
  await h.grant(true); await h.rt.revokeTaskAccess('group-session')
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session')), false)
  await h.grant(true); await h.rt.setChiefPermissionPolicy(false)
  assert.equal(await h.rt.reviewChiefApproval(h.request('group-session')), false)
})

test('Chief tool resumes the existing pending group request and refuses employee impersonation', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true)
  h.emit('group-session', 'turn/start')
  const pending = h.ask(h.request('group-session'))
  for (let i = 0; i < 10 && !h.rt.approvalsView().length; i++) await new Promise(resolve => setImmediate(resolve))
  const tool = h.ctx.registeredTools.get('authorize_prospecting_task')
  const args = { bot: 'Worker', group: 'Leads', objective: 'Find qualified companies' }
  await assert.rejects(tool.execute(args, { agent: { id: 'private' } }), /General Assistant/)
  assert.equal(h.rt.approvalsView().length, 1)
  assert.match(await tool.execute(args, { agent: { id: 'chief' } }), /Authorized Worker/)
  assert.equal(await pending, 'allowed-once')
  assert.equal(h.rt.approvalsView().length, 0)
  assert.equal(h.state.chiefPermissionAudit.filter(entry => entry.action === 'allowed-once').length, 1)
})

test('a revocation during audit persistence cannot authorize an in-flight request', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true); h.emit('private', 'turn/start'); await h.grant()
  let resume
  h.rt.save = () => new Promise(resolve => { resume = resolve })
  const checking = h.rt.reviewChiefApproval(h.request('private'))
  await new Promise(resolve => setImmediate(resolve))
  h.rt.save = async () => {}
  await h.rt.revokeTaskAccess('private'); resume()
  assert.equal(await checking, false)
})

test('structured file grants reject traversal, existing outputs, links, scripts and missing call evidence', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true)
  const policy = h.state.chiefPermissionPolicy
  await writeFile(join(policy.inputRoot, 'profile.md'), 'public positioning')
  assert.equal(await prospectingOperation('read', { file_path: 'prospecting-inputs/profile.md' }, h.root, policy), true)
  assert.equal(await prospectingOperation('write', { file_path: 'outputs/prospecting/leads.csv', content: 'company,source' }, h.root, policy), true)
  await writeFile(join(policy.outputRoot, 'leads.csv'), 'existing')
  assert.equal(await prospectingOperation('write', { file_path: 'outputs/prospecting/leads.csv', content: 'overwrite' }, h.root, policy), false)
  for (const path of ['outputs/prospecting/../../../outside.csv', 'outputs/prospecting/program.ps1', 'outputs/prospecting/no-parent/leads.csv']) {
    assert.equal(await prospectingOperation('write', { file_path: path, content: 'x' }, h.root, policy), false)
  }
  const outside = join(h.root, 'outside'); await mkdir(outside)
  await symlink(outside, join(policy.outputRoot, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(await prospectingOperation('write', { file_path: 'outputs/prospecting/link/leads.csv', content: 'x' }, h.root, policy), false)
  h.emit('private', 'turn/start'); await h.grant()
  const req = h.request('private'); req.callId = 'not-present'
  assert.equal(await h.rt.reviewChiefApproval(req), false)
  assert.equal(await prospectingOperation('web_fetch', { url: 'http://localhost' }, h.root, policy), false)
})

test('grant is not restored after restart and authorization persistence failures fail closed', async t => {
  const h = await setup(t)
  await h.rt.setChiefPermissionPolicy(true); h.emit('private', 'turn/start'); await h.grant()
  const restarted = { ...h.rt, ctx: fakeContext() }
  install(restarted)
  assert.equal(restarted.chiefPermissionView().grants.length, 0)
  h.rt.save = async () => { throw new Error('disk unavailable') }
  await assert.rejects(h.grant(), /disk unavailable/)
  assert.equal(await h.rt.reviewChiefApproval(h.request('private')), false)
})
