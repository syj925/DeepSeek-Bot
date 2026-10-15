import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { cleanVersion, install, newer, sourceOf } from '../src/host/update.js'

const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const LEGACY_PKG = { ...PKG, repository: 'https://github.com/Fei2411/DeepSeek-Bot.git', dsh: { ...PKG.dsh, update: undefined } }
const HOSTED_PKG = { ...PKG, dsh: { ...PKG.dsh, update: { url: 'https://desktop.qibitai.ai', pluginId: 'ds-bot', channel: 'stable' } } }
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// The update module alone, on a stub plugin manager and a scripted fetch.
function start({ source, registries, answers = {}, result = { application: 'restart-required' }, config = {}, profileDir, pkg = LEGACY_PKG, manager = {} }) {
  const fetched = []
  const installs = []
  const warnings = []
  const effects = []
  globalThis.fetch = async (url) => {
    fetched.push(url)
    const answer = answers[url]
    if (answer === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (answer instanceof Error) throw answer
    return { ok: true, status: 200, json: async () => answer }
  }
  const pluginManager = {
    listBundles: async () => [{ name: 'other', source: 'other@^1.0.0' }, ...(source === undefined ? [] : [{ name: PKG.name, source }])],
    registries: async () => registries ?? { registry: null, fallbackRegistries: ['https://registry.npmmirror.com/'], resolved: 'https://registry.npmjs.org/' },
    installBundle: async (spec, options) => { installs.push([spec, options]); return typeof result === 'function' ? result() : result },
    ...manager,
  }
  const rt = {
    ctx: { get: name => (name === 'pluginManager' ? pluginManager : name === 'profileContext' && profileDir ? { dir: profileDir } : undefined), effect: (_, name) => effects.push(name) },
    config,
    warn: (...args) => warnings.push(args),
  }
  install(rt, pkg)
  return { rt, fetched, installs, warnings, effects }
}

test('versions compare in semver order and lose their v and build metadata', () => {
  assert.equal(cleanVersion('v1.2.3+build.5'), '1.2.3')
  assert.equal(cleanVersion('latest'), null)
  assert.equal(newer('0.2.0', '0.1.9'), true)
  assert.equal(newer('0.10.0', '0.9.0'), true)
  assert.equal(newer('1.0.0', '1.0.0'), false)
  assert.equal(newer('1.0.0', '1.0.0-beta.2'), true)
  assert.equal(newer('1.0.0-beta.10', '1.0.0-beta.2'), true)
  assert.equal(newer('0.1.0', '0.2.0'), false)
})

test('the install source decides where a newer version is looked for', () => {
  assert.deepEqual(sourceOf('ds-bot@^0.1.0'), { kind: 'registry' })
  assert.deepEqual(sourceOf('@scope/ds-bot@latest'), { kind: 'registry' })
  // A profile's own dependency entry says the same without the package name.
  assert.deepEqual(sourceOf('^0.1.0'), { kind: 'registry' })
  assert.deepEqual(sourceOf('npm:ds-bot@^0.1.0'), { kind: 'registry' })
  assert.deepEqual(sourceOf('link:E:/项目库/My Bots/ds-bot'), { kind: 'path' })
  assert.deepEqual(sourceOf('/home/user/ds-bot'), { kind: 'path' })
  assert.deepEqual(sourceOf('C:/packages/ds-bot-0.1.5.tgz'), { kind: 'tarball' })
  assert.deepEqual(sourceOf('file:../ds-bot-0.1.5.tar.gz'), { kind: 'tarball' })
  assert.deepEqual(sourceOf('github:Fei2411/DeepSeek-Bot#v0.1.0&path:/ds-bot'),
    { kind: 'git', owner: 'Fei2411', repo: 'DeepSeek-Bot', ref: 'v0.1.0', rest: ['path:/ds-bot'] })
  assert.deepEqual(sourceOf('git+https://github.com/Fei2411/DeepSeek-Bot.git#main'),
    { kind: 'git', owner: 'Fei2411', repo: 'DeepSeek-Bot', rest: [] })
  assert.deepEqual(sourceOf('https://example.com/ds-bot-0.1.0.tgz'), { kind: 'tarball' })
  assert.deepEqual(sourceOf(undefined), { kind: 'unknown' })
})

test('a registry install finds the newest version on the next registry and installs it from there', async () => {
  const { rt, fetched, installs } = start({
    source: `${PKG.name}@^${PKG.version}`,
    answers: {
      [`https://registry.npmjs.org/${PKG.name}/latest`]: new Error('offline'),
      [`https://registry.npmmirror.com/${PKG.name}/latest`]: { version: '9.0.0' },
    },
    result: { application: 'restart-required', version: '9.0.0' },
  })
  const view = await rt.updateCheck()
  assert.deepEqual(fetched, [`https://registry.npmjs.org/${PKG.name}/latest`, `https://registry.npmmirror.com/${PKG.name}/latest`])
  assert.equal(view.available, true)
  assert.equal(view.latest, '9.0.0')
  assert.equal(view.current, PKG.version)
  assert.equal(view.source, 'registry')
  assert.equal(view.notesUrl, 'https://github.com/Fei2411/DeepSeek-Bot/releases')
  assert.equal(rt.updateStart().phase, 'installing')
  await flush()
  assert.deepEqual(installs, [[`${PKG.name}@9.0.0`, { registry: 'https://registry.npmmirror.com/' }]])
  const done = await rt.updateCheck()
  assert.equal(done.phase, 'installed')
  assert.equal(done.installed, '9.0.0')
  assert.equal(done.available, false)
})

test('a private registry of pnpm\'s own is asked alone, and an answer stands for a while', async () => {
  const { rt, fetched } = start({
    source: `${PKG.name}@^${PKG.version}`,
    registries: { registry: null, fallbackRegistries: ['https://registry.npmmirror.com/'], resolved: 'https://npm.corp.example/' },
    answers: { [`https://npm.corp.example/${PKG.name}/latest`]: { version: PKG.version } },
  })
  const view = await rt.updateCheck()
  assert.equal(view.available, false)
  assert.deepEqual(fetched, [`https://npm.corp.example/${PKG.name}/latest`])
  await rt.updateCheck()
  assert.equal(fetched.length, 1)
  await rt.updateCheck({ fresh: true })
  assert.equal(fetched.length, 2)
})

test('a versioned GitHub install follows the latest release tag and keeps its path', async () => {
  const { rt, installs } = start({
    source: 'github:Fei2411/DeepSeek-Bot#v0.1.0&path:/ds-bot',
    answers: { 'https://api.github.com/repos/Fei2411/DeepSeek-Bot/releases/latest': { tag_name: 'v9.1.0' } },
  })
  const view = await rt.updateCheck()
  assert.equal(view.available, true)
  assert.equal(view.latest, '9.1.0')
  rt.updateStart()
  await flush()
  assert.deepEqual(installs, [['github:Fei2411/DeepSeek-Bot#v9.1.0&path:/ds-bot', {}]])
})

test('a versioned GitHub install follows the release to the repository\'s current address', async () => {
  const { rt, installs } = start({
    source: 'github:old-owner/DeepSeek-Bot#v0.1.0&path:/ds-bot',
    answers: {
      'https://api.github.com/repos/old-owner/DeepSeek-Bot/releases/latest': {
        tag_name: 'v9.1.0',
        html_url: 'https://github.com/Fei2411/DeepSeek-Bot/releases/tag/v9.1.0',
      },
    },
  })
  const view = await rt.updateCheck()
  assert.equal(view.available, true)
  assert.equal(view.latest, '9.1.0')
  rt.updateStart()
  await flush()
  assert.deepEqual(installs, [['github:Fei2411/DeepSeek-Bot#v9.1.0&path:/ds-bot', {}]])
})

test('a linked checkout, an unversioned git install, or a disabled check never asks the network', async () => {
  for (const source of [`link:/work/${PKG.name}`, 'github:Fei2411/DeepSeek-Bot#main', undefined]) {
    const { rt, fetched } = start({ source })
    const view = await rt.updateCheck()
    assert.equal(view.available, false)
    assert.deepEqual(fetched, [])
    assert.throws(() => rt.updateStart(), /No DS Bot update/)
  }
  const { rt, fetched } = start({ source: `${PKG.name}@^${PKG.version}`, config: { updateCheck: false } })
  assert.equal((await rt.updateCheck({ fresh: true })).available, false)
  assert.deepEqual(fetched, [])
})

test('the star count comes from the repository, is kept for an hour, and survives a failed answer', async () => {
  const repo = 'https://api.github.com/repos/Fei2411/DeepSeek-Bot'
  const answers = { [repo]: new Error('offline') }
  const { rt, fetched } = start({ source: `${PKG.name}@^${PKG.version}`, answers })
  assert.equal(rt.updateView().repoUrl, 'https://github.com/Fei2411/DeepSeek-Bot')
  assert.equal(await rt.repoStars(), null)
  answers[repo] = { stargazers_count: 42 }
  assert.equal(await rt.repoStars(), 42)
  answers[repo] = new Error('offline')
  assert.equal(await rt.repoStars(), 42)
  assert.deepEqual(fetched, [repo, repo])
})

test('without a source from the plugin manager, the profile\'s own dependency entry decides', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-bot-update-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { [PKG.name]: `^${PKG.version}` } }))
  const { rt } = start({
    profileDir: dir,
    answers: { [`https://registry.npmjs.org/${PKG.name}/latest`]: { version: '9.0.0' } },
  })
  const view = await rt.updateCheck()
  assert.equal(view.source, 'registry')
  assert.equal(view.available, true)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { [PKG.name]: 'link:/work/ds-bot' } }))
  assert.equal((await rt.updateCheck({ fresh: true })).source, 'path')
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('a check that finds nothing clears the version a check before it found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-bot-update-'))
  const setSource = source => writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { [PKG.name]: source } }))
  setSource(`^${PKG.version}`)
  const latest = `https://registry.npmjs.org/${PKG.name}/latest`
  const answers = { [latest]: { version: '9.0.0' } }
  const { rt } = start({ profileDir: dir, answers })
  const offered = await rt.updateCheck()
  assert.equal(offered.available, true)
  assert.equal(offered.latest, '9.0.0')
  // The profile now links a local checkout: the old registry offer must go.
  setSource('link:/work/ds-bot')
  const linked = await rt.updateCheck({ fresh: true })
  assert.equal(linked.available, false)
  assert.equal(linked.latest, null)
  assert.throws(() => rt.updateStart(), /No DS Bot update/)
  // Back on the registry with no copy answering: the offer stays cleared.
  delete answers[latest]
  setSource(`^${PKG.version}`)
  const gone = await rt.updateCheck({ fresh: true })
  assert.equal(gone.available, false)
  assert.equal(gone.latest, null)
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('a failed install reports why and can be tried again', async () => {
  let attempt = 0
  const { rt, installs } = start({
    source: `${PKG.name}@^${PKG.version}`,
    config: { updateRegistry: 'https://registry.example' },
    answers: { [`https://registry.example/${PKG.name}/latest`]: { version: '9.0.0' } },
    result: () => (++attempt === 1
      ? { application: 'failed', error: { code: 'incompatible-version', diagnostic: 'needs a newer DSH' } }
      : { application: 'restart-required', version: '9.0.0' }),
  })
  await rt.updateCheck()
  rt.updateStart()
  await flush()
  const failed = await rt.updateCheck()
  assert.equal(failed.phase, 'failed')
  assert.equal(failed.error, 'needs a newer DSH')
  assert.equal(failed.available, true)
  rt.updateStart()
  await flush()
  assert.equal((await rt.updateCheck()).phase, 'installed')
  assert.equal(installs.length, 2)
  assert.deepEqual(installs[0][1], { registry: 'https://registry.example/' })
})

function hostedEntry(overrides = {}) {
  return {
    source: 'https://desktop.qibitai.ai', pluginId: 'ds-bot', packageName: PKG.name, channel: 'stable',
    installed: true, installedVersion: PKG.version, updateAvailable: true, canInstall: true,
    release: {
      pluginId: 'ds-bot', packageName: PKG.name, channel: 'stable', version: '9.0.0',
      notes: 'Hosted release notes', download: { sha256: 'a'.repeat(64) },
    },
    ...overrides,
  }
}

function startHosted({ entry = hostedEntry(), catalog, result = { application: 'restart-required', version: '9.0.0' }, manager = {}, ...options } = {}) {
  const checks = []
  const hostedInstalls = []
  const started = start({
    source: 'file:C:/plugins/ds-bot.tgz', pkg: HOSTED_PKG, ...options,
    manager: {
      checkPluginUpdates: () => {
        checks.push(true)
        return typeof catalog === 'function' ? catalog() : catalog ?? { plugins: entry ? [entry] : [], errors: [] }
      },
      installHostedPlugin: request => { hostedInstalls.push(request); return typeof result === 'function' ? result() : result },
      ...manager,
    },
  })
  return { ...started, checks, hostedInstalls }
}

test('hosted updates query only on explicit fresh checks and use the exact manager release', async () => {
  const { rt, checks, effects, fetched, installs, hostedInstalls } = startHosted()
  assert.deepEqual(effects, [])
  for (let index = 0; index < 3; index += 1) assert.equal((await rt.updateCheck()).available, false)
  assert.deepEqual(checks, [])
  const view = await rt.updateCheck({ fresh: true })
  assert.equal(view.source, 'hosted')
  assert.equal(view.available, true)
  assert.equal(view.notes, 'Hosted release notes')
  assert.equal(view.notesUrl, null)
  assert.equal(view.checkError, null)
  assert.equal(view.unavailableReason, null)
  assert.equal(rt.updateStart().phase, 'installing')
  assert.equal(rt.updateStart().phase, 'installing')
  await flush()
  assert.deepEqual(hostedInstalls, [{ source: 'https://desktop.qibitai.ai', pluginId: 'ds-bot', packageName: PKG.name, channel: 'stable', version: '9.0.0', sha256: 'a'.repeat(64) }])
  const done = await rt.updateCheck()
  assert.equal(done.phase, 'installed')
  assert.equal(done.application, 'restart-required')
  assert.equal(done.installed, '9.0.0')
  assert.equal(done.available, false)
  assert.throws(() => rt.updateStart(), /No DS Bot update/)
  assert.equal(checks.length, 1)
  assert.deepEqual(fetched, [])
  assert.deepEqual(installs, [])
})

test('a hosted declaration takes precedence over registry, GitHub, and tarball sources', async () => {
  for (const source of ['ds-bot@0.1.0', 'github:Fei2411/DeepSeek-Bot#v0.1.0', 'https://example.com/ds-bot.tgz', './ds-bot.tgz', 'file:C:/plugins/ds-bot.tgz']) {
    const { rt, fetched, checks } = startHosted({ source, config: { updateRegistry: 'https://registry.example' } })
    assert.equal((await rt.updateCheck({ fresh: true })).available, true)
    assert.equal(checks.length, 1)
    assert.deepEqual(fetched, [])
  }
})

test('hosted checks preserve linked and local development directories', async () => {
  for (const source of ['link:C:/work/ds-bot', 'file:C:/work/ds-bot', './ds-bot', 'C:/work/ds-bot']) {
    const { rt, checks, fetched } = startHosted({ source })
    const view = await rt.updateCheck({ fresh: true })
    assert.equal(view.source, 'path')
    assert.equal(view.available, false)
    assert.match(view.unavailableReason, /local checkout/)
    assert.throws(() => rt.updateStart(), /No DS Bot update/)
    assert.deepEqual(checks, [])
    assert.deepEqual(fetched, [])
  }
})

test('missing hosted APIs and invalid declarations never fall back to npm', async () => {
  for (const manager of [{ checkPluginUpdates: undefined }, { installHostedPlugin: undefined }]) {
    const { rt, fetched, checks } = startHosted({ source: 'ds-bot@0.1.0', manager })
    const view = await rt.updateCheck({ fresh: true })
    assert.equal(view.available, false)
    assert.match(view.unavailableReason, /does not support/)
    assert.deepEqual(checks, [])
    assert.deepEqual(fetched, [])
  }
  for (const update of [null, { url: 'http://desktop.qibitai.ai', pluginId: 'ds-bot' }, { url: 'https://desktop.qibitai.ai/plugins/latest', pluginId: 'ds-bot' }]) {
    const { rt, fetched, checks } = startHosted({ source: 'ds-bot@0.1.0', pkg: { ...HOSTED_PKG, dsh: { update } } })
    assert.ok((await rt.updateCheck({ fresh: true })).checkError)
    assert.deepEqual(checks, [])
    assert.deepEqual(fetched, [])
  }
})

test('hosted entries match exact source, plugin ID, package name, and channel', async () => {
  for (const overrides of [{ source: 'https://other.example' }, { pluginId: 'other' }, { packageName: '@other/ds-bot' }, { channel: 'beta' }]) {
    const { rt, hostedInstalls } = startHosted({ entry: hostedEntry(overrides) })
    const view = await rt.updateCheck({ fresh: true })
    assert.equal(view.available, false)
    assert.match(view.unavailableReason, /not listed/)
    assert.throws(() => rt.updateStart(), /No DS Bot update/)
    assert.deepEqual(hostedInstalls, [])
  }
})

test('no release, current version, and refused installation remain distinct', async () => {
  const unpublished = startHosted({ entry: hostedEntry({ release: null, canInstall: false }) })
  const empty = await unpublished.rt.updateCheck({ fresh: true })
  assert.equal(empty.available, false)
  assert.equal(empty.checkError, null)
  assert.match(empty.unavailableReason, /No release has been published/)
  const current = startHosted({ entry: hostedEntry({ release: { ...hostedEntry().release, version: PKG.version }, canInstall: false, updateAvailable: false }) })
  const latest = await current.rt.updateCheck({ fresh: true })
  assert.equal(latest.available, false)
  assert.equal(latest.unavailableReason, null)
  assert.equal(latest.latest, PKG.version)
  const refused = startHosted({ entry: hostedEntry({ canInstall: false }) })
  const blocked = await refused.rt.updateCheck({ fresh: true })
  assert.equal(blocked.available, false)
  assert.match(blocked.unavailableReason, /does not allow/)
})

test('failed checks clear stale offers and preserve relevant catalog diagnostics', async () => {
  let catalog = { plugins: [hostedEntry()], errors: [] }
  const { rt, fetched } = startHosted({ catalog: () => catalog })
  assert.equal((await rt.updateCheck({ fresh: true })).available, true)
  catalog = { plugins: [], errors: [{ source: 'https://other.example', diagnostic: 'unrelated failure' }, { source: 'https://desktop.qibitai.ai', diagnostic: 'gateway offline' }] }
  const failed = await rt.updateCheck({ fresh: true })
  assert.equal(failed.checkError, 'gateway offline')
  assert.equal(failed.available, false)
  assert.equal(failed.latest, null)
  assert.equal(failed.notes, null)
  assert.throws(() => rt.updateStart(), /No DS Bot update/)
  catalog = { plugins: [], errors: [{ source: PKG.name, diagnostic: 'invalid declaration' }] }
  assert.equal((await rt.updateCheck({ fresh: true })).checkError, 'invalid declaration')
  catalog = { plugins: [hostedEntry()], errors: [{ source: 'https://other.example', diagnostic: 'unrelated failure' }] }
  const recovered = await rt.updateCheck({ fresh: true })
  assert.equal(recovered.available, true)
  assert.equal(recovered.checkError, null)
  assert.deepEqual(fetched, [])
})

test('synchronous manager check exceptions become visible check failures', async () => {
  const { rt, fetched } = startHosted({ catalog: () => { throw new Error('manager unavailable') } })
  const view = await rt.updateCheck({ fresh: true })
  assert.equal(view.checkError, 'manager unavailable')
  assert.equal(view.available, false)
  assert.deepEqual(fetched, [])
})

test('concurrent fresh checks share their work and all return a view', async () => {
  let resolveCatalog
  const catalog = new Promise(resolve => { resolveCatalog = resolve })
  const { rt, checks } = startHosted({ catalog: () => catalog })
  const first = rt.updateCheck({ fresh: true })
  const second = rt.updateCheck({ fresh: true })
  await flush()
  assert.equal(checks.length, 1)
  resolveCatalog({ plugins: [hostedEntry()], errors: [] })
  const views = await Promise.all([first, second])
  assert.equal(views[0].available, true)
  assert.deepEqual(views[0], views[1])
})

test('a version already installed by the manager waits for restart instead of reinstalling', async () => {
  const { rt, hostedInstalls } = startHosted({ entry: hostedEntry({ installedVersion: '9.0.0', updateAvailable: false, canInstall: false }) })
  const view = await rt.updateCheck({ fresh: true })
  assert.equal(view.phase, 'installed')
  assert.equal(view.application, 'restart-required')
  assert.equal(view.installed, '9.0.0')
  assert.equal(view.current, PKG.version)
  assert.equal(view.available, false)
  assert.throws(() => rt.updateStart(), /No DS Bot update/)
  assert.deepEqual(hostedInstalls, [])
})

test('hosted install results preserve applied, failed, cancelled, and thrown failure states', async () => {
  for (const [result, phase, application, error] of [
    [{ application: 'applied', version: '9.0.0' }, 'installed', 'applied', null],
    [{ application: 'failed', error: { diagnostic: 'needs a newer carrier' } }, 'failed', 'failed', 'needs a newer carrier'],
    [{ application: 'cancelled' }, 'cancelled', 'cancelled', null],
    [() => { throw new Error('installation threw') }, 'failed', 'failed', 'installation threw'],
  ]) {
    const { rt, installs, hostedInstalls } = startHosted({ result })
    await rt.updateCheck({ fresh: true })
    rt.updateStart()
    await flush()
    const view = rt.updateView()
    assert.equal(view.phase, phase)
    assert.equal(view.application, application)
    assert.equal(view.error, error)
    assert.equal(view.available, phase !== 'installed')
    assert.deepEqual(installs, [])
    assert.equal(hostedInstalls.length, 1)
  }
})

test('malformed hosted releases are rejected before an installation is offered', async () => {
  for (const override of [{ pluginId: 'other' }, { packageName: 'other' }, { channel: 'beta' }, { download: { sha256: 'invalid' } }]) {
    const { rt } = startHosted({ entry: hostedEntry({ release: { ...hostedEntry().release, ...override } }) })
    const view = await rt.updateCheck({ fresh: true })
    assert.match(view.checkError, /invalid hosted release/)
    assert.equal(view.available, false)
    assert.throws(() => rt.updateStart(), /No DS Bot update/)
  }
})

test('disabled hosted updates do not check or install', async () => {
  const { rt, checks, effects } = startHosted({ config: { updateCheck: false } })
  assert.equal((await rt.updateCheck({ fresh: true })).available, false)
  assert.equal(rt.updateView().enabled, false)
  assert.deepEqual(checks, [])
  assert.deepEqual(effects, [])
  assert.throws(() => rt.updateStart(), /No DS Bot update/)
})
