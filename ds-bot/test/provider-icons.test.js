import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { PROVIDER_ARTWORK } from '../src/client/provider-artwork.js'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/provider-icons.js', import.meta.url))],
  bundle: true, format: 'cjs', platform: 'node', write: false, external: ['react'],
})
const loaded = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, {
  module: loaded, exports: loaded.exports,
  require: () => ({ createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) }),
})
const { modelVendor, ProviderIcon } = loaded.exports

test('resold models keep their actual vendor logos rather than the route name', () => {
  for (const [id, vendor] of [
    ['MiniMax-M2.7', 'minimax'], ['MiniMax-M3', 'minimax'],
    ['claude-fable-5', 'anthropic'], ['claude-fable-5-1', 'anthropic'], ['claude-haiku-4-5-20251001', 'anthropic'],
    ['gpt-6.1-sol', 'openai'], ['gpt-5.3-codex', 'openai'], ['o3-mini', 'openai'], ['o1', 'openai'],
    ['DeepSeek-V3.2', 'deepseek'], ['gemini-2.5-pro', 'google'], ['Qwen3-235B', 'alibaba'],
    ['kimi-k2.5', 'moonshot'], ['grok-4', 'xai'], ['glm-4.5', 'zhipu'],
  ]) {
    assert.equal(modelVendor({ ref: `custom-route/${id}`, providerName: 'QibitAI CodingPlan', name: id }), vendor, id)
  }
})

test('model names and nested IDs tolerate routing prefixes and version suffixes', () => {
  for (const [id, vendor] of [
    ['anthropic/claude-opus-4-6:thinking', 'anthropic'], ['azure/gpt-5.1-2025-11-13', 'openai'],
    ['AZ_gpt-6.1-sol_high', 'openai'], ['AZ-claude-haiku-4-5', 'anthropic'], ['minimax/minimax-m2.7:free', 'minimax'],
    ['deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', 'deepseek'], ['meta-llama/Llama-4-Maverick', 'meta'],
    ['mistralai/Mistral-Small-3.2', 'mistral'], ['stepfun/step-3.5-flash', 'stepfun'],
  ]) assert.equal(modelVendor({ ref: `gateway/${id}`, name: 'Fast model' }), vendor, id)
  assert.equal(modelVendor({ ref: 'qibitai/internal-234', name: 'Claude Opus 4.6' }), 'anthropic')
  assert.equal(modelVendor({ ref: 'qibitai/claude-sonnet-4', name: 'MiniMax alias' }), 'anthropic', 'a clear model ID outranks its alias')
})

test('an unknown model is neutral even when its service route has a known vendor name', () => {
  for (const model of [null, undefined, '', { ref: 'openai/private-reasoner', providerName: 'Anthropic', name: 'Fast' }, { ref: 'qibitai/private', providerName: 'QibitAI' }]) {
    assert.equal(modelVendor(model), null)
    const icon = ProviderIcon({ model })
    assert.equal(icon.props['data-vendor'], 'unknown')
    assert.equal(icon.children[0].type, 'svg')
    assert.equal(icon.children.some(child => typeof child === 'string'), false)
    assert.equal(icon.children[0].props.dangerouslySetInnerHTML, undefined)
  }
})

test('vendor icons use bundled logo paths and never request remote artwork', () => {
  const claude = ProviderIcon({ model: { ref: 'qibitai/claude-opus-4-6' } })
  const minimax = ProviderIcon({ model: { ref: 'qibitai/MiniMax-M2.7' } })
  assert.equal(claude.props['data-vendor'], 'anthropic')
  assert.equal(minimax.props['data-vendor'], 'minimax')
  assert.notEqual(claude.children[0].props.dangerouslySetInnerHTML.__html, minimax.children[0].props.dangerouslySetInnerHTML.__html)
  for (const art of Object.values(PROVIDER_ARTWORK)) {
    assert.match(art.body, /<path\b/)
    assert.doesNotMatch(art.body, /<script|foreignObject|\bhref=|https?:|\bid=|url\(|\bon[a-z]+=/i)
    assert.match(art.viewBox, /^0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?$/)
  }
})
