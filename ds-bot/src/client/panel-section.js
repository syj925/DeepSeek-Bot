import { createElement as h } from 'react'
import { t } from './i18n.js'

export function panelSection({ id, title, count, collapsed = false, onToggle, className, sectionKey }, ...children) {
  return h('section', { className, 'data-panel-section': sectionKey },
    h('h3', null, onToggle ? h('button', { type: 'button', className: 'bt-panel-section-toggle',
      'aria-label': t(collapsed ? 'Expand {section}' : 'Collapse {section}', { section: t(title) }),
      'aria-expanded': !collapsed, 'aria-controls': id, onClick: onToggle },
      h('span', { className: 'bt-panel-section-title' }, t(title), count ? h('span', { className: 'bt-panel-section-count' }, count) : null),
      h('span', { className: 'bt-panel-section-action', 'aria-hidden': true }, t(collapsed ? 'Expand' : 'Collapse')),
      h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true },
        h('path', { d: collapsed ? 'm4 2 4 4-4 4' : 'm2 4 4 4 4-4' }))) : t(title)),
    h('div', { id, className: 'bt-panel-section-body', hidden: collapsed }, ...children))
}
