// Declared hosted updates use the carrier's verified installer. Packages without
// a declaration keep their original registry/tag updater. Linked checkouts are
// never replaced, and hosted sources are queried only on an explicit check.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PKG = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/'
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com/'
// Every window that opens asks; within this long the last answer stands.
export const CHECK_TTL_MS = 10 * 60_000
export const FETCH_TIMEOUT_MS = 8000
// The first check waits until the host has settled its own start.
const STARTUP_DELAY_MS = 15_000
const VERSION = /^v?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\+[\w.]+)?$/

/** A release version without its `v` and build metadata, or null. */
export const cleanVersion = value => VERSION.exec(String(value ?? '').trim())?.[1] ?? null

/** Whether version `a` is newer than `b` (semver order, prereleases before their release). */
export function newer(a, b) {
  const parse = (value) => {
    const [core, pre] = (cleanVersion(value) ?? '0.0.0').split(/-(.*)/s)
    return { nums: core.split('.').map(Number), pre: pre ?? null }
  }
  const x = parse(a)
  const y = parse(b)
  for (let index = 0; index < 3; index++) if (x.nums[index] !== y.nums[index]) return x.nums[index] > y.nums[index]
  if (x.pre === y.pre) return false
  if (x.pre === null) return true
  if (y.pre === null) return false
  return x.pre.localeCompare(y.pre, 'en', { numeric: true }) > 0
}

/**
 * How the profile installed this package, from the plugin manager's `source` spec:
 * `registry` (name@range), `git` (with `owner`, `repo`, the version `ref` and the
 * other fragment parts when it pins a GitHub tag), `path` (link:, file: or a folder),
 * `tarball`, or `unknown`.
 */
export function sourceOf(spec) {
  const text = typeof spec === 'string' ? spec.trim() : ''
  if (text === '') return { kind: 'unknown' }
  if (!/^link:/i.test(text) && /\.(?:tgz|tar\.gz)$/i.test(text)) return { kind: 'tarball' }
  if (/^(link|file):/i.test(text) || /^([a-z]:[\\/]|[\\/]|~|\.)/i.test(text)) return { kind: 'path' }
  const github = /^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.*))?$/i.exec(text)
  const gitLike = /^(git\+|git:|git@|github:|gitlab:|bitbucket:)/i.test(text) || /\.git(#|$)/i.test(text)
  if (github && (gitLike || !text.startsWith('@'))) {
    const parts = (github[3] ?? '').split('&').filter(Boolean)
    const ref = parts.find(part => !part.includes(':')) ?? ''
    return {
      kind: 'git', owner: github[1], repo: github[2],
      ...(cleanVersion(ref) ? { ref } : {}),
      rest: parts.filter(part => part !== ref),
    }
  }
  if (gitLike) return { kind: 'git' }
  if (/^https?:/i.test(text)) return { kind: 'tarball' }
  return { kind: 'registry' }
}

const normalizeRegistry = url => `${String(url).trim().replace(/\/+$/, '')}/`
export const encodeName = name => (name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name))

export const fetchJson = async (url, headers = {}) => {
  const response = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

// The registries the plugin manager installs from, in its order: its configured
// first one (else pnpm's own), then the fallbacks, unless that first one is private.
export async function registryPlan(config, manager) {
  if (typeof config.updateRegistry === 'string' && config.updateRegistry !== '') return [normalizeRegistry(config.updateRegistry)]
  const configured = await Promise.resolve(manager?.registries?.()).catch(() => null)
  if (!configured) return [OFFICIAL_REGISTRY, MIRROR_REGISTRY]
  const fallbacks = (configured.fallbackRegistries ?? []).map(normalizeRegistry)
  const own = configured.resolved ? normalizeRegistry(configured.resolved) : null
  const first = configured.registry ? normalizeRegistry(configured.registry) : own ?? OFFICIAL_REGISTRY
  const isPublic = first === OFFICIAL_REGISTRY || fallbacks.includes(first)
  return isPublic ? [...new Set([first, ...fallbacks])] : [first]
}

// The plugin manager's `source` for this package; DSH releases before it reported
// one leave the profile's own dependency entry to say the same.
export async function installSpecOf(ctx, pkg = PKG) {
  const manager = ctx.get?.('pluginManager')
  const bundles = await Promise.resolve().then(() => manager?.listBundles?.()).catch(() => null)
  const own = Array.isArray(bundles) ? bundles.find(bundle => bundle.name === pkg.name) : undefined
  if (typeof own?.source === 'string') return own.source
  const dir = ctx.get?.('profileContext')?.dir
  if (typeof dir !== 'string') return undefined
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies?.[pkg.name]
  } catch { return undefined }
}

// The public repository the releases live in, for tags and the "what's new" link.
export const repoSlug = (pkg = PKG) =>
  /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(String(pkg.repository?.url ?? pkg.repository ?? ''))?.[1] ?? null

const repoUrl = (pkg) => {
  const repo = repoSlug(pkg)
  return repo ? `https://github.com/${repo}` : null
}
const releasesUrl = (pkg) => {
  const repo = repoUrl(pkg)
  return repo ? `${repo}/releases` : (pkg.homepage ?? null)
}

export const STARS_TTL_MS = 60 * 60_000
export const hasHostedUpdate = pkg => pkg.dsh?.update !== undefined

function hostedDeclaration(pkg) {
  const declaration = pkg.dsh?.update
  if (!declaration || typeof declaration.url !== 'string') throw new Error('Invalid hosted update declaration')
  const url = new URL(declaration.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('The hosted update source must be an HTTPS origin')
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(declaration.pluginId ?? '')) throw new Error('Invalid hosted plugin ID')
  const channel = declaration.channel ?? 'stable'
  if (!['stable', 'beta'].includes(channel)) throw new Error('Invalid hosted release channel')
  return { source: url.origin, pluginId: declaration.pluginId, packageName: pkg.name, channel }
}

export function install(rt, pkg = PKG) {
  const { ctx, config } = rt
  const enabled = config.updateCheck !== false
  const manager = () => ctx.get?.('pluginManager')
  const hosted = hasHostedUpdate(pkg)

  const status = {
    name: pkg.name, current: pkg.version, latest: null, source: hosted ? 'hosted' : 'unknown', notesUrl: hosted ? null : releasesUrl(pkg),
    checkedAt: 0, phase: 'idle', installed: null, error: null, application: null, checkError: null, notes: null,
    unavailableReason: hosted ? 'Use Check for updates to query QibitAI.' : null,
  }
  // Where the newest version was found, and the spec that installs it.
  let target = null
  let checking = null

  const view = () => ({
    name: status.name, current: status.current, latest: status.latest, source: status.source, notesUrl: status.notesUrl,
    repoUrl: repoUrl(pkg), enabled,
    checkedAt: status.checkedAt, phase: status.phase, installed: status.installed, error: status.error,
    application: status.application, checkError: status.checkError, unavailableReason: status.unavailableReason, notes: status.notes,
    available: !['installed', 'installing'].includes(status.phase) && target !== null && status.latest !== null && newer(status.latest, status.current),
  })

  // Asked only while the About page is open, so a closed page never calls GitHub.
  // A failed answer keeps the last count and is asked again next time.
  let stars = { count: null, at: 0 }
  let starring = null
  async function repoStars() {
    const repo = repoSlug(pkg)
    if (repo === null) return null
    if (Date.now() - stars.at < STARS_TTL_MS) return stars.count
    starring ??= fetchJson(`https://api.github.com/repos/${repo}`, { 'user-agent': `${pkg.name}/${pkg.version}` })
      .then((info) => { if (Number.isInteger(info?.stargazers_count)) stars = { count: info.stargazers_count, at: Date.now() } })
      .catch(error => rt.warn('ds-bot: star count failed: %s', error?.message ?? error))
      .finally(() => { starring = null })
    await starring
    return stars.count
  }

  async function newestFromRegistry() {
    for (const registry of await registryPlan(config, manager())) {
      try {
        const version = cleanVersion((await fetchJson(`${registry}${encodeName(pkg.name)}/latest`)).version)
        if (version) return { version, spec: `${pkg.name}@${version}`, registry }
      } catch { /* unreachable, or no copy there yet: ask the next one */ }
    }
    return null
  }

  async function newestFromGitHub(source) {
    if (!source.ref) return null
    const release = await fetchJson(`https://api.github.com/repos/${source.owner}/${source.repo}/releases/latest`, { 'user-agent': `${pkg.name}/${pkg.version}` })
    const version = cleanVersion(release?.tag_name)
    if (!version) return null
    // The API answers through redirects, so the release's html_url names the
    // repository's current address; the install moves to it.
    const current = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/releases\//.exec(release.html_url ?? '')
    const [owner, repo] = current ? [current[1], current[2]] : [source.owner, source.repo]
    const fragment = [release.tag_name, ...source.rest].join('&')
    return { version, spec: `github:${owner}/${repo}#${fragment}` }
  }

  async function runHostedCheck() {
    target = null
    Object.assign(status, { latest: null, notes: null, checkError: null, unavailableReason: null, source: 'hosted' })
    try {
      const source = sourceOf(await installSpecOf(ctx, pkg))
      if (source.kind === 'path') {
        status.source = 'path'
        status.unavailableReason = 'This local checkout is updated from its source files.'
        return
      }
      const declaration = hostedDeclaration(pkg)
      const service = manager()
      if (typeof service?.checkPluginUpdates !== 'function' || typeof service?.installHostedPlugin !== 'function') {
        status.unavailableReason = 'This host does not support QibitAI hosted plugin updates. Update QibitAI Desktop first.'
        return
      }
      const result = await service.checkPluginUpdates()
      if (!Array.isArray(result?.plugins)) throw new Error('The plugin manager returned an invalid update catalog')
      const selected = result.plugins.find(entry => ['source', 'pluginId', 'packageName', 'channel'].every(key => entry[key] === declaration[key]))
      if (!selected) {
        const errors = (result.errors ?? []).filter(error => [declaration.source, pkg.name].includes(error.source))
        if (errors.length) throw new Error(errors.map(error => error.diagnostic).join('; '))
        status.unavailableReason = 'This plugin is not listed in its declared QibitAI update source.'
        return
      }
      const installed = cleanVersion(selected.installedVersion)
      if (installed && newer(installed, status.current)) {
        Object.assign(status, { phase: 'installed', installed, application: 'restart-required', error: null })
      }
      if (selected.release === null) {
        status.unavailableReason = 'No release has been published for this update channel.'
        return
      }
      const release = selected.release
      if (!release || !['pluginId', 'packageName', 'channel'].every(key => release[key] === declaration[key])
        || !cleanVersion(release.version) || !/^[a-f0-9]{64}$/i.test(release.download?.sha256 ?? '')) {
        throw new Error('The plugin manager returned an invalid hosted release')
      }
      status.latest = cleanVersion(release.version)
      status.notes = typeof release.notes === 'string' ? release.notes : null
      if (status.phase === 'installed') return
      if (!newer(status.latest, installed ?? status.current)) return
      if (!selected.canInstall) {
        status.unavailableReason = 'The plugin manager does not allow this release to be installed in this profile.'
        return
      }
      target = { version: status.latest, request: { ...declaration, version: release.version, sha256: release.download.sha256 } }
    } catch (error) {
      status.checkError = String(error?.message ?? error).slice(0, 600)
      rt.warn('ds-bot: hosted update check failed: %s', status.checkError)
    } finally {
      status.checkedAt = Date.now()
    }
  }

  async function runCheck() {
    if (hosted) return runHostedCheck()
    const source = sourceOf(await installSpecOf(ctx, pkg))
    status.source = source.kind
    let found = null
    try {
      if (source.kind === 'registry') found = await newestFromRegistry()
      else if (source.kind === 'git') found = await newestFromGitHub(source)
    } catch (error) {
      rt.warn('ds-bot: update check failed: %s', error?.message ?? error)
    }
    status.checkedAt = Date.now()
    // Nothing found now (a linked checkout, a moved tag, an unreachable registry)
    // retires the version a check before it found; offering it would install over
    // a source that never updates.
    if (found === null) {
      status.latest = null
      target = null
      return
    }
    status.latest = found.version
    target = newer(found.version, status.current) ? found : null
  }

  /** Ask where the package came from for its newest version; a fresh check ignores the last answer. */
  async function check({ fresh = false } = {}) {
    if (!enabled) return view()
    if (status.phase === 'installing' || (hosted && !fresh)) return view()
    if (checking) return checking
    if (!fresh && Date.now() - status.checkedAt < CHECK_TTL_MS) return view()
    checking = runCheck().then(view).finally(() => { checking = null })
    return checking
  }

  /** Start reinstalling the newest version; the answer comes back through `check`. */
  function start() {
    if (status.phase === 'installing') return view()
    if (target === null) throw new Error('No DS Bot update is available')
    const service = manager()
    if (typeof service?.[hosted ? 'installHostedPlugin' : 'installBundle'] !== 'function') throw new Error('The required plugin manager update API is not available in this profile')
    const chosen = target
    Object.assign(status, { phase: 'installing', error: null, application: null })
    void Promise.resolve().then(() => hosted
      ? service.installHostedPlugin(chosen.request)
      : service.installBundle(chosen.spec, chosen.registry ? { registry: chosen.registry } : {}))
      .then((result) => {
        if (result?.application === 'cancelled') {
          Object.assign(status, { phase: 'cancelled', application: 'cancelled', error: result.error?.diagnostic ?? null })
          return
        }
        if (result?.error || !['applied', 'restart-required'].includes(result?.application)) {
          throw new Error(result?.error?.diagnostic ?? result?.error?.code ?? `install ${result?.application ?? 'failed'}`)
        }
        Object.assign(status, { phase: 'installed', application: result.application, installed: cleanVersion(result.version) ?? chosen.version })
        target = null
      })
      .catch((error) => {
        rt.warn('ds-bot: update to %s failed: %s', chosen.spec ?? chosen.version, error?.message ?? error)
        Object.assign(status, { phase: 'failed', application: 'failed', error: String(error?.message ?? error).slice(0, 600) })
      })
    return view()
  }

  if (enabled && !hosted) {
    ctx.effect(() => {
      const timer = setTimeout(() => { void check() }, STARTUP_DELAY_MS)
      // A pending first check never keeps the process alive.
      timer.unref?.()
      return () => clearTimeout(timer)
    }, 'ds-bot: update check')
  }

  Object.assign(rt, { updateCheck: check, updateStart: start, updateView: view, repoStars })
}
