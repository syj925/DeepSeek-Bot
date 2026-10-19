import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = dirname(__dirname)

const { outputFiles } = await build({
  entryPoints: [join(rootDir, 'src/client/agent-avatar-preview.js')],
  bundle: true, format: 'cjs', platform: 'browser', write: false, external: ['react'],
})

const module = { exports: {} }
runInNewContext(outputFiles[0].text, {
  module, exports: module.exports, require: () => ({ createElement: () => null, useState: () => [], useEffect: () => {}, useRef: () => ({ current: null }) }),
})
const { AGENT_AVATARS, AGENT_ANIMATION_DURATION_MS, AGENT_AVATAR_CSS } = module.exports

test('AGENT_AVATARS defines 7 characters with 4s animation metadata', () => {
  assert.equal(AGENT_AVATARS.length, 7)
  assert.equal(AGENT_ANIMATION_DURATION_MS, 4000)

  const expectedIds = ['01_QiBit', '02_技术', '03_设计', '04_行政', '05_运营', '06_财务', '07_销售']
  assert.deepEqual(JSON.parse(JSON.stringify(AGENT_AVATARS.map(a => a.id))), expectedIds)

  for (const agent of AGENT_AVATARS) {
    assert.ok(agent.poster.startsWith('data:image/webp;base64,'), 'poster ships inside the plugin bundle')
    assert.ok(agent.animated.startsWith('data:image/webp;base64,'), 'animation ships inside the plugin bundle')
    assert.ok(agent.posterPath.startsWith('/qibit-agent-hover/posters/'), `poster should be in posters/: ${agent.poster}`)
    assert.ok(agent.animatedPath.startsWith('/qibit-agent-hover/animated/'), `animated should be in animated/: ${agent.animated}`)
    assert.ok(agent.posterPath.endsWith('.webp'), `poster should be webp: ${agent.poster}`)
    assert.ok(agent.animatedPath.endsWith('.webp'), `animated should be webp: ${agent.animated}`)

    // Check that asset files exist in ds-bot/assets/
    const posterPath = join(rootDir, 'assets', agent.posterPath.replace(/^\/qibit-agent-hover\//, 'qibit-agent-hover/'))
    const animatedPath = join(rootDir, 'assets', agent.animatedPath.replace(/^\/qibit-agent-hover\//, 'qibit-agent-hover/'))
    assert.ok(existsSync(posterPath), `Poster file must exist: ${posterPath}`)
    assert.ok(existsSync(animatedPath), `Animated file must exist: ${animatedPath}`)
  }
})

test('AGENT_AVATAR_CSS contains responsive centering and non-clipping image rules', () => {
  assert.ok(AGENT_AVATAR_CSS.includes('.bt-agent-stage'), 'CSS includes .bt-agent-stage')
  assert.ok(AGENT_AVATAR_CSS.includes('overflow:visible'), 'CSS preserves overflow:visible')
  assert.ok(AGENT_AVATAR_CSS.includes('object-fit:contain'), 'CSS preserves object-fit:contain')
  assert.ok(AGENT_AVATAR_CSS.includes('is-playing'), 'CSS covers is-playing state')
})
