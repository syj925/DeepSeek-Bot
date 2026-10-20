import { createElement as h } from 'react'
import { PROVIDER_ARTWORK } from './provider-artwork.js'

// Route names are user-defined and can resell any model. Only a model's own ID
// and display name identify its maker; a QibitAI route must not turn Claude into Q.
const VENDORS = [
  ['anthropic', /(?:^|[^a-z0-9])(?:claude|anthropic)(?:$|[^a-z0-9])/i],
  ['openai', /(?:^|[^a-z0-9])(?:gpt(?:[- .]?\d)?|chatgpt|codex|o[134])(?:$|[^a-z0-9])/i],
  ['deepseek', /(?:^|[^a-z0-9])deepseek(?:$|[^a-z0-9])/i],
  ['minimax', /(?:^|[^a-z0-9])mini[- ]?max(?:$|[^a-z0-9])/i],
  ['google', /(?:^|[^a-z0-9])(?:gemini|gemma)(?:$|[^a-z0-9])/i],
  ['alibaba', /(?:^|[^a-z0-9])(?:qwen\d*|qwq|qvq)(?:$|[^a-z0-9])/i],
  ['moonshot', /(?:^|[^a-z0-9])(?:kimi|moonshot)(?:$|[^a-z0-9])|^k[23](?:[- .]|$)/i],
  ['xai', /(?:^|[^a-z0-9])grok(?:$|[^a-z0-9])/i],
  ['meta', /(?:^|[^a-z0-9])(?:llama\d*|codellama)(?:$|[^a-z0-9])/i],
  ['mistral', /(?:^|[^a-z0-9])(?:mistral|mixtral|magistral|codestral|devstral|ministral|pixtral)(?:$|[^a-z0-9])/i],
  ['zhipu', /(?:^|[^a-z0-9])(?:glm(?:[- .]?\d)?|zhipu|zai)(?:$|[^a-z0-9])/i],
  ['bytedance', /(?:^|[^a-z0-9])(?:doubao|seed(?:[- .]?\d)?)(?:$|[^a-z0-9])/i],
  ['stepfun', /(?:^|[^a-z0-9])(?:stepfun|step(?:[- .]?\d))(?:$|[^a-z0-9])/i],
  ['cohere', /(?:^|[^a-z0-9])(?:cohere|command|c4ai)(?:$|[^a-z0-9])/i],
  ['microsoft', /(?:^|[^a-z0-9])phi(?:[- .]?\d)(?:$|[^a-z0-9])/i],
  ['amazon', /(?:^|[^a-z0-9])nova(?:$|[^a-z0-9])/i],
  ['tencent', /(?:^|[^a-z0-9])hunyuan(?:$|[^a-z0-9])/i],
  ['xiaomi', /(?:^|[^a-z0-9])mimo(?:$|[^a-z0-9])/i],
  ['baidu', /(?:^|[^a-z0-9])(?:ernie|wenxin)(?:$|[^a-z0-9])/i],
  ['perplexity', /(?:^|[^a-z0-9])(?:sonar|perplexity)(?:$|[^a-z0-9])/i],
  ['nvidia', /(?:^|[^a-z0-9])nemotron(?:$|[^a-z0-9])/i],
  ['meituan', /(?:^|[^a-z0-9])longcat(?:$|[^a-z0-9])/i],
  ['inception', /(?:^|[^a-z0-9])mercury(?:$|[^a-z0-9])/i],
]

export function modelVendor(model) {
  if (!model) return null
  const ref = typeof model === 'string' ? model : model.ref ?? ''
  const id = typeof model === 'object' && model.id ? model.id : ref.slice(ref.indexOf('/') + 1)
  const names = [id, typeof model === 'object' ? model.name : '']
  for (const name of names) {
    if (typeof name !== 'string') continue
    const entry = VENDORS.find(([, pattern]) => pattern.test(name))
    if (entry) return entry[0]
  }
  return null
}

export function ProviderIcon({ model }) {
  const vendor = modelVendor(model)
  const art = PROVIDER_ARTWORK[vendor]
  return h('span', { className: 'bt-model-glyph', 'data-vendor': vendor ?? 'unknown', 'aria-hidden': true, style: art?.color ? { '--bt-provider-color': art.color } : undefined },
    art ? h('svg', { viewBox: art.viewBox, fill: 'currentColor', fillRule: 'evenodd', width: 20, height: 20, focusable: false, dangerouslySetInnerHTML: { __html: art.body } })
      : h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, width: 20, height: 20, focusable: false },
        h('rect', { x: 5, y: 5, width: 14, height: 14, rx: 4 }),
        h('path', { d: 'M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3' }),
        h('circle', { cx: 12, cy: 12, r: 2.5 })))
}
