// Local licensed font, loaded through the plugin's authenticated public route.
// Keep content sizes and code fonts under the conversation renderer's control.
export const VISUAL_TOKENS = `
@font-face{font-family:"Qibit UI";src:url("api/bot?asset=qibit-font-v1") format("truetype");font-weight:100 900;font-style:normal;font-display:swap}
body{--bt-font-sans:"Qibit UI","Noto Sans SC",system-ui,sans-serif;--bt-action-bg:#171717;--bt-action-fg:#fff;--bt-action-hover:#262626;--bt-action-pressed:#0a0a0a}
body[data-ds-dark-theme]{--bt-action-bg:#f2f2f2;--bt-action-fg:#171717;--bt-action-hover:#e5e5e5;--bt-action-pressed:#d4d4d4}
:is(.bt-canvas,.bt-sidebar,.bt-overlay,.bt-drawer,.bt-dialog,.bt-palette,.bt-settings,.bt-canvas-session){font-family:var(--bt-font-sans);font-synthesis:none}
:is(.bt-canvas,.bt-sidebar,.bt-overlay,.bt-drawer,.bt-dialog,.bt-palette,.bt-settings) :is(button,input,textarea,select){font-family:var(--bt-font-sans)}
:is(.bt-action-primary,.bt-send,.bt-q-submit,.bt-nc-send){background:var(--bt-action-bg)!important;color:var(--bt-action-fg)!important;font-weight:500}
:is(.bt-action-primary,.bt-send,.bt-q-submit,.bt-nc-send):hover:not(:disabled){background:var(--bt-action-hover)!important}
:is(.bt-action-primary,.bt-send,.bt-q-submit,.bt-nc-send):active:not(:disabled){background:var(--bt-action-pressed)!important}
:is(.bt-action-primary,.bt-send,.bt-q-submit,.bt-nc-send):disabled{background:#e5e5e5!important;color:#a3a3a3!important;cursor:default}
:is(.bt-action-primary,.bt-send,.bt-q-submit,.bt-nc-send,.bt-soft):focus-visible{outline:2px solid var(--bt-accent);outline-offset:3px}
.bt-soft{border:1px solid var(--bt-line-2)!important;background:transparent!important;font-weight:500}
.bt-soft:hover:not(:disabled){background:var(--bt-hover)!important}
.bt-canvas-session [data-composer-card] button[class*="_primary"]{background:var(--bt-action-bg)!important;color:var(--bt-action-fg)!important}
.bt-canvas-session [data-composer-card] button[class*="_primary"]:hover:not(:disabled){background:var(--bt-action-hover)!important}
`
