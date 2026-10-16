import { createElement as h } from 'react'
import { t } from './i18n.js'
import { portraitsFor } from './portraits.js'
export { PORTRAITS, isPortrait } from './portraits.js'

// Supplied Starbots artwork. Choosing a portrait changes only the avatar, never the Bot's job.
export function PortraitGrid({ image, onPick, generalAssistant = false }) {
  return h('div', { className: 'bt-portraits', role: 'group', 'aria-label': t('Role portraits') },
    portraitsFor(generalAssistant).map(portrait => h('button', {
      key: portrait.id, type: 'button', className: 'bt-portrait', 'aria-pressed': image === portrait.image,
      'aria-label': t(portrait.label), title: t(portrait.label), onClick: () => onPick(portrait.image),
    }, h('img', { src: portrait.image, alt: '', draggable: false }), h('span', null, t(portrait.label)))))
}

export const PORTRAIT_CSS = `
.bt-portraits{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;min-width:0}
.bt-portrait{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;padding:8px 4px;border:1px solid var(--bt-line);border-radius:16px;background:var(--bt-main);color:var(--bt-ink-2);font:inherit;cursor:pointer;transition:background .15s,border-color .15s}
.bt-portrait>img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 3px 4px rgba(0,0,0,.08))}
.bt-portrait>span{width:100%;font-size:10px;line-height:16px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-portrait:hover{background:var(--bt-hover);border-color:var(--bt-line-2)}
.bt-portrait[aria-pressed=true]{background:color-mix(in srgb,var(--bt-accent) 7%,var(--bt-main));border-color:var(--bt-accent);color:var(--bt-ink)}
.bt-portrait:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-create-looktabs{display:flex;gap:4px;margin-bottom:12px;padding:3px;border:1px solid var(--bt-line);border-radius:12px;background:var(--bt-bubble)}
.bt-create-looktabs>button{flex:1;padding:7px;border:0;border-radius:9px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-create-looktabs>button[aria-selected=true]{background:var(--bt-main);color:var(--bt-ink);box-shadow:0 1px 4px rgba(0,0,0,.05)}
.bt-create-looktabs>button:focus-visible{outline:2px solid var(--bt-accent);outline-offset:-2px}
.bt-avedit .bt-portraits{padding:6px 0;animation:bt-veil-in .18s ease-out}
@media(prefers-reduced-motion:reduce){.bt-portrait{transition:none}.bt-avedit .bt-portraits{animation:none}}
@media(forced-colors:active){.bt-portrait[aria-pressed=true]{border-color:Highlight;outline:1px solid Highlight}}
`
