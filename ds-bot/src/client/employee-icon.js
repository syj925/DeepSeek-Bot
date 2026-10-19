import { createElement as h } from 'react'

const paths = {
  code: 'm9 8-4 4 4 4m6-8 4 4-4 4m-2-10-2 12',
  design: 'm5 16 10-10 3 3-10 10-4 1 1-4m8-8 3 3',
  finance: 'M8 5h8v14H8zM10 8h4m-4 4h1m2 0h1m-4 3h1m2 0h1',
  chart: 'M5 5v14h14M9 15v-4m4 4V7m4 8v-6',
  search: 'M15 15l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  write: 'M8 4H5v16h14v-8M10 14l1-4 7-7 3 3-7 7-4 1',
  work: 'M4 8h16v11H4zM9 8V5h6v3M4 12l8 3 8-3m-8 1v3',
}

export function EmployeeIcon({ icon = 'work' }) {
  return h('svg', { viewBox: '0 0 32 32', 'aria-hidden': true },
    h('rect', { x: 1, y: 1, width: 30, height: 30, rx: 10, fill: '#e7f1ee' }),
    h('path', { d: paths[icon] ?? paths.work, transform: 'translate(4 4)', fill: 'none', stroke: '#37796f', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
}
