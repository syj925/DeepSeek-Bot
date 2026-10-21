import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { bundleClient } from '../scripts/build-client.mjs'

const committed = () => readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('client.js is the build of src/client', async () => {
  assert.equal(await bundleClient(), committed(), 'client.js is stale: run `npm run build` and commit it')
})

test('the client links against only the installed host primitives public exports', async () => {
  const requireHarness = createRequire(join(process.env.DSH_HARNESS, 'package.json'))
  const { metafile } = await build({ entryPoints: [requireHarness.resolve('@deepseek-ai/dsh-client-ui-primitives')],
    bundle: false, format: 'esm', write: false, metafile: true, logLevel: 'silent' })
  const names = Object.values(metafile.outputs)[0].exports
  assert.ok(names.includes('MarkdownText'))
  // Read the real package's export list without loading its CSS or browser dependencies.
  await build({ entryPoints: ['src/client/index.js'], bundle: true, platform: 'browser', write: false, logLevel: 'silent',
    external: ['react', 'react-dom'], plugins: [{ name: 'public-primitives', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'exports', namespace: 'public-primitives' }))
      builder.onLoad({ filter: /.*/, namespace: 'public-primitives' }, () => ({ contents: names.map(name => `export const ${name} = undefined`).join('\n') }))
    } }] })
})

// dsh runs client.js as a classic script that hands a factory to the module loader; the
// factory's `require` answers only the shell's platform modules.
test('client.js registers a factory that exports apply and inject', () => {
  const registrations = []
  runInNewContext(committed(), { window: { __ModuleLoader__: { load: registration => registrations.push(registration) } } })
  assert.equal(registrations.length, 1)
  const [{ id, factory, ...rest }] = registrations
  assert.equal(id, 'ds-bot')
  assert.deepEqual(Object.keys(rest), [])

  const requested = []
  const platform = {
    'react': { Component: class {}, createContext: value => ({ value, Provider: Symbol('Provider') }), useContext: context => context.value, createElement: () => null, Fragment: Symbol('Fragment'), useState: initial => [initial, () => {}], useEffect: () => {}, useMemo: make => make(), useRef: current => ({ current }) },
    'react-dom': { createPortal: node => node },
    '@deepseek-ai/dsh-client-ui-primitives': { MarkdownText: () => null },
  }
  const exports = factory((specifier) => {
    requested.push(specifier)
    if (!(specifier in platform)) throw new Error(`no platform module ${specifier}`)
    return platform[specifier]
  })
  assert.deepEqual([...new Set(requested)].sort(), Object.keys(platform).sort())
  assert.equal(Object.prototype.toString.call(exports), '[object Module]')
  assert.deepEqual(Object.keys(exports), ['apply', 'inject'])
  assert.equal(typeof exports.apply, 'function')
  // No `configForms`: the client never writes the user's DSH settings, such as the
  // work-details mode it once held at `verbose`.
  assert.deepEqual(Array.from(exports.inject), ['sessions', 'uiWorkspace', 'uiConversation', 'slots', 'theme', 'layout'])
})
