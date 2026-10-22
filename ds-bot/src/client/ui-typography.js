import { UI_FONT } from '../shared/ui-font.js'

const roots = ':is(.bt-side,.team-panel,.bt-canvas,.bt-pane,.bt-settings-layer,.bt-palette-layer,.bt-mem-layer,.bt-menu,.bt-news,.bt-q,.bt-create,.bt-nc,.bt-main-group,.bt-wallpaper-menu,.bt-restored-chat,.bt-canvas-session,.bt-canvas-contact-ghost)'

export const UI_TYPOGRAPHY_CSS = `
@font-face{font-family:"Qibit UI";src:url("${UI_FONT.path.slice(1)}") format("truetype");font-style:normal;font-weight:100 900;font-display:swap}
:root{--bt-font-sans:"Qibit UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}
${roots}{font-family:var(--bt-font-sans)}
${roots} :is(button,input,textarea,select){font-family:var(--bt-font-sans)}
${roots} :is(button,select){font-synthesis:none}
.bt-side .bt-row-title,.bt-side .bt-row-name,.team-panel .bt-row-title,.team-panel .bt-row-name{font:500 14px/20px var(--bt-font-sans)!important}
.bt-side .bt-row-preview,.team-panel .bt-row-preview{font:400 12px/18px var(--bt-font-sans)!important}
.bt-canvas .bt-dock-dept-name{font:500 12px/16px var(--bt-font-sans)!important}
.bt-dock-popover-name{font:600 15px/22px var(--bt-font-sans)!important}
.bt-collab-card-name{font:600 14px/20px var(--bt-font-sans)!important}
.bt-dock-action-btn,.bt-collab-mini-btn{font:500 13px/20px var(--bt-font-sans)!important}
.bt-row[data-multi-selected=true]{background:rgba(80,136,210,.16)!important;box-shadow:inset 0 0 0 1px rgba(80,136,210,.3)}
`

export function installUiTypography(installStyles, doc = document) {
  const style = installStyles(UI_TYPOGRAPHY_CSS, 'typography')
  let live = true
  const status = value => { if (live) doc.body.dataset.qibitFontStatus = value }
  status('loading')
  Promise.resolve().then(() => doc.fonts.load(`500 14px "${UI_FONT.family}"`)).then(faces => {
    status(faces.some(face => face.status === 'loaded') ? 'ready' : 'error')
  }).catch(() => status('error'))
  return () => {
    live = false
    delete doc.body.dataset.qibitFontStatus
    style.remove()
  }
}
