import { canvasLandscapeUrl } from './canvas-landscape.js'

export const canvasStyles = `
.bt-canvas{
  --bt-ink:#f5f8f7;--bt-ink-2:rgba(245,248,247,.76);--bt-ink-3:rgba(245,248,247,.55);
  --bt-card:#34494b;--bt-main:#293c3f;--bt-sidebar:#293c3f;--bt-bubble:rgba(255,255,255,.09);
  --bt-line:rgba(255,255,255,.12);--bt-line-2:rgba(255,255,255,.23);--bt-line-weak:rgba(255,255,255,.1);
  --bt-hover:rgba(255,255,255,.1);--bt-active:rgba(255,255,255,.17);--bt-accent:#8de0cc;--bt-accent-ink:#153b33;
  --bt-user:rgba(245,248,247,.9);--bt-user-ink:#203436;--bt-tag-bg:rgba(255,255,255,.1);--bt-tag-ink:rgba(245,248,247,.76);
  --bt-canvas-glass:rgba(40,57,60,.58);
  --bt-canvas-chrome:rgba(45,61,64,.62);
  --bt-canvas-border:rgba(255,255,255,.2);
  --bt-canvas-shadow:0 18px 52px -20px rgba(12,30,34,.45),inset 0 1px 0 rgba(255,255,255,.13);
  position:relative;isolation:isolate;display:flex;flex:1 1 0;flex-direction:column;
  width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;
  container-type:inline-size;container-name:bt-canvas;
  color:var(--bt-ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  font-size:14px;line-height:1.5;
  background:#688b92;
}
body[data-ds-dark-theme] .bt-canvas{
  --bt-canvas-glass:rgba(24,39,43,.66);
  --bt-canvas-chrome:rgba(30,46,50,.72);
  --bt-canvas-border:rgba(255,255,255,.18);
  --bt-canvas-shadow:0 18px 44px -16px rgba(0,12,22,.5),inset 0 1px 0 rgba(255,255,255,.06);
}
.bt-canvas::before{content:"";position:absolute;pointer-events:none;z-index:-1;
  inset:0;background-image:linear-gradient(180deg,rgba(15,31,38,.08),rgba(15,31,38,.02) 50%,rgba(15,31,38,.18)),var(--bt-wallpaper-image,url("${canvasLandscapeUrl}"));
  background-size:cover;background-position:center;background-repeat:no-repeat;
}
body[data-ds-dark-theme] .bt-canvas::before{filter:brightness(.8) saturate(.85)}
.bt-canvas [hidden]{display:none!important}
.bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-window-header,.bt-canvas-content,.bt-canvas-compact,.bt-canvas-group,.bt-canvas-group-header,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-button,.bt-canvas-dock-item,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-session,.bt-canvas-session-error){box-sizing:border-box}
.bt-canvas-toolbar,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status{
  position:absolute;z-index:30;border:1px solid var(--bt-canvas-border);
  background:var(--bt-canvas-chrome);box-shadow:var(--bt-canvas-shadow);
  -webkit-backdrop-filter:blur(22px) saturate(115%);backdrop-filter:blur(22px) saturate(115%);
}
.bt-canvas-toolbar{top:16px;left:16px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;width:max-content;max-width:calc(100% - 32px);padding:6px;border-radius:16px}
.bt-canvas-toolbar>strong{min-width:0;padding:0 8px;font-size:13px;font-weight:500;overflow-wrap:anywhere}
.bt-canvas-toolbar>span[role=separator]{width:1px;height:20px;flex:none;margin:0 3px;background:var(--bt-line-2)}
.bt-canvas-stage{position:absolute;inset:0;z-index:0;isolation:isolate;overflow:hidden;touch-action:auto;cursor:grab}
.bt-canvas-background{position:absolute;inset:0;z-index:-1;touch-action:none}
.bt-canvas-stage:is([data-dragging="true"],[data-dragging=""]),.bt-canvas:is([data-dragging="true"],[data-dragging=""]) .bt-canvas-stage{cursor:grabbing}
.bt-canvas-world{position:absolute;left:0;top:0;isolation:isolate;transform-origin:0 0}
.bt-canvas-chat-layer{position:absolute;inset:0;z-index:60;display:grid;place-items:center;pointer-events:none}
.bt-canvas-chat-float{position:relative;box-sizing:border-box;width:min(1040px,calc(100% - 48px));height:min(740px,calc(100% - 144px));min-height:0;pointer-events:auto;outline:none;border-radius:24px;background:linear-gradient(145deg,rgba(76,101,108,.68),rgba(25,43,49,.82));-webkit-backdrop-filter:blur(36px) saturate(125%);backdrop-filter:blur(36px) saturate(125%);transform-origin:50% 55%;animation:bt-chat-open .32s cubic-bezier(.16,1,.3,1) both}
.bt-canvas-chat-float[data-closing=true]{pointer-events:none;animation:bt-chat-close .18s cubic-bezier(.4,0,1,1) both}
.bt-canvas-chat-float>.bt-canvas-window{min-width:0;min-height:0;border-radius:24px;background:transparent;border-color:rgba(255,255,255,.24);box-shadow:0 30px 90px -20px rgba(4,18,26,.55),inset 0 1px 0 rgba(255,255,255,.2);-webkit-backdrop-filter:none;backdrop-filter:none}
.bt-canvas-chat-float .bt-canvas-window-header{min-height:64px;padding:12px 20px;background:rgba(255,255,255,.025)}
.bt-canvas-chat-float .bt-canvas-window-title{max-width:none}
.bt-canvas-chat-float .bt-canvas-window>.bt-canvas-window-meta{gap:4px;padding:4px 18px 8px;border-bottom:1px solid var(--bt-line)}
.bt-canvas-chat-float .bt-canvas-window>.bt-canvas-window-meta>span[role=status]{flex:1 1 auto}
@keyframes bt-chat-open{from{opacity:0;transform:translateY(22px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes bt-chat-close{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(14px) scale(.96)}}
@container bt-canvas (max-width:640px){.bt-canvas-chat-float{width:calc(100% - 24px);height:calc(100% - 48px)}}
@media(prefers-reduced-motion:reduce){.bt-canvas-chat-float,.bt-canvas-chat-float[data-closing=true]{animation-duration:.01ms}}
.bt-canvas-window{
  position:absolute;display:flex;flex-direction:column;min-width:240px;min-height:180px;
  overflow:hidden;border:1px solid var(--bt-canvas-border);border-radius:22px;
  background:var(--bt-canvas-glass);box-shadow:var(--bt-canvas-shadow);color:var(--bt-ink);cursor:default;
  -webkit-backdrop-filter:blur(26px) saturate(116%);backdrop-filter:blur(26px) saturate(116%);
  transition:border-color .14s ease,box-shadow .14s ease;
}
.bt-canvas-window:is([data-active="true"],[data-active=""]){border-color:color-mix(in srgb,var(--bt-accent) 48%,var(--bt-canvas-border));box-shadow:0 18px 50px -18px rgba(16,35,43,.36),inset 0 0 0 1px color-mix(in srgb,var(--bt-accent) 15%,transparent)}
.bt-canvas-window:is([data-selected="true"],[data-selected=""]){outline:2px solid color-mix(in srgb,var(--bt-accent) 70%,var(--bt-card));outline-offset:3px}
.bt-canvas-window[data-mode=card]{border-radius:24px}
.bt-canvas-window[data-mode=card][data-kind=bot]{min-width:0;min-height:0;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none;outline:none;-webkit-backdrop-filter:none;backdrop-filter:none;cursor:grab}
.bt-canvas-avatar-node{position:relative;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;width:120px;height:112px;max-width:100%;isolation:isolate;touch-action:none}
.bt-canvas-avatar-open{box-sizing:border-box;display:flex;flex:none;align-items:center;justify-content:center;width:80px;min-width:0;height:74px;padding:9px 12px;border:0;border-radius:50%;background:transparent;color:var(--bt-ink);font:inherit;line-height:17px;text-align:center;cursor:grab;touch-action:none}
.bt-canvas-avatar-open:active{cursor:grabbing}
.bt-canvas-avatar-open>.bt-mark{flex:none;border-radius:50%;box-shadow:0 3px 12px rgba(12,29,34,.25),0 0 0 4px rgba(255,255,255,.13);transition:box-shadow .14s ease,transform .14s ease}
.bt-canvas-avatar-node>.bt-canvas-window-title{box-sizing:border-box;display:flex;flex:none;flex-direction:column;justify-content:flex-start;gap:1px;width:100%;height:36px;min-height:36px;padding:0 3px;overflow:visible;text-align:center}
.bt-canvas-avatar-node>.bt-canvas-window-title>strong{display:block;flex:none;width:100%;max-width:100%;height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;font-weight:600;text-shadow:0 1px 5px rgba(12,27,32,.85)}
.bt-canvas-avatar-node>.bt-canvas-window-title>span{display:block;flex:none;width:100%;max-width:100%;height:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.86);font-size:10px;line-height:14px;text-shadow:0 1px 5px rgba(12,27,32,.85)}
.bt-canvas-avatar-open:hover>.bt-mark{box-shadow:0 4px 16px rgba(12,29,34,.3),0 0 0 5px rgba(255,255,255,.25);transform:translateY(-2px)}
.bt-canvas-window[data-mode=card][data-kind=bot]:is([data-active=true],[data-active=""]) .bt-canvas-avatar-open>.bt-mark{box-shadow:0 4px 16px rgba(12,29,34,.3),0 0 0 4px rgba(141,224,204,.48)}
.bt-canvas-window[data-mode=card][data-kind=bot]:is([data-selected=true],[data-selected=""]) .bt-canvas-avatar-open>.bt-mark{box-shadow:0 4px 16px rgba(12,29,34,.3),0 0 0 3px var(--bt-accent),0 0 0 7px rgba(141,224,204,.18)}
.bt-canvas-avatar-open:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-canvas-avatar-tools{position:absolute;z-index:2;top:-12px;right:-3px;display:flex;align-items:center;gap:5px;padding:3px 4px;border:1px solid var(--bt-canvas-border);border-radius:999px;background:var(--bt-canvas-chrome);box-shadow:0 4px 12px rgba(12,30,34,.18);opacity:0;pointer-events:none;transition:opacity .14s ease;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
.bt-canvas-avatar-node:is(:hover,:focus-within) .bt-canvas-avatar-tools,.bt-canvas-window:is([data-selected=true],[data-selected=""]) .bt-canvas-avatar-tools{opacity:1;pointer-events:auto}
.bt-canvas-avatar-tools>input[type=checkbox]{width:16px;height:16px;margin:0 3px;accent-color:var(--bt-accent);cursor:pointer}
.bt-canvas-avatar-tools>.bt-canvas-button{width:26px;min-width:26px;min-height:26px;padding:3px;border-radius:50%}
.bt-canvas-avatar-status{position:absolute;z-index:1;top:47px;left:74px;display:grid;place-items:center;width:24px;height:24px;padding:0;box-sizing:border-box;border:0;border-radius:50%;background:transparent;color:var(--bt-ink);cursor:pointer}
.bt-canvas-avatar-status>svg{display:none}
.bt-canvas-avatar-status::before{content:"";display:block;box-sizing:border-box;width:11px;height:11px;border:2px solid #4c6668;border-radius:50%;background:#b8c7c9}
.bt-canvas-avatar-status[data-state=available]::before{background:#8de0cc}
.bt-canvas-avatar-status[data-state=working]::before{background:#8de0cc;box-shadow:0 0 0 3px rgba(141,224,204,.22),0 0 12px rgba(141,224,204,.55)}
.bt-canvas-avatar-status[data-state=waiting]::before{background:#ffd18a;box-shadow:0 0 0 3px rgba(255,209,138,.2)}
.bt-canvas-avatar-status:hover{background:rgba(40,57,60,.6)}
.bt-canvas-avatar-status:focus-visible{outline:2px solid var(--bt-accent);outline-offset:1px}
.bt-canvas-window-header{position:relative;display:flex;align-items:center;gap:10px;flex:none;min-height:62px;padding:10px 12px;touch-action:none;cursor:grab;user-select:none;border-bottom:1px solid color-mix(in srgb,var(--bt-line) 65%,transparent)}
.bt-canvas-window[data-mode=card]>.bt-canvas-window-header{min-height:72px;padding:12px 12px 8px;gap:9px;border-bottom:0}
.bt-canvas-window[data-mode=card][data-kind=room]>.bt-canvas-window-header{min-height:64px;padding:8px 12px 6px}
.bt-canvas-window[data-mode=card]>.bt-canvas-window-header .bt-canvas-window-title{gap:10px}
.bt-canvas-window[data-mode=card]>.bt-canvas-window-header .bt-canvas-window-title strong{font-size:15px;line-height:22px}
.bt-canvas-window-header:active{cursor:grabbing}
.bt-canvas-window-header>.bt-mark,.bt-canvas-window-header>.bt-cluster{flex:none}
.bt-canvas-window-title{display:flex;align-items:center;gap:9px;min-width:0;flex:1 1 auto;min-height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:20px;font-weight:500;text-align:start;overflow:hidden;cursor:grab;touch-action:none}
.bt-canvas-window-title>.bt-mark,.bt-canvas-window-title>.bt-cluster{flex:none}
.bt-canvas-window-title>span:last-child{min-width:0;overflow:hidden}
.bt-canvas-window-title strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.bt-canvas-window-header>input[type=checkbox]{flex:none;width:15px;height:15px;margin:0;accent-color:var(--bt-accent);cursor:pointer}
.bt-canvas-window-meta{display:block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bt-ink-2);font-size:12px;line-height:18px;font-weight:400}
.bt-canvas-window-actions{display:flex;align-items:center;gap:3px;flex:none;cursor:default}
.bt-canvas-window>.bt-canvas-window-meta{display:flex;align-items:center;flex-wrap:wrap;gap:3px;flex:none;max-width:none;padding:4px 12px 6px;white-space:normal;overflow:visible}
.bt-canvas-window>.bt-canvas-window-meta>span[role=status]{flex:1 0 100%;padding:1px 2px;font-size:11px;line-height:16px}
.bt-canvas-window>.bt-canvas-window-meta .bt-canvas-button{min-height:27px;padding:3px 7px;font-size:12px}
.bt-canvas-button,.bt-canvas-dock-item{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  min-width:34px;min-height:34px;max-width:100%;padding:6px 10px;
  border:1px solid transparent;border-radius:10px;background:transparent;color:var(--bt-ink);
  font:inherit;font-size:13px;line-height:20px;font-weight:400;text-align:center;cursor:pointer;
  transition:background-color .12s ease,border-color .12s ease,color .12s ease;
}
.bt-canvas-window-actions .bt-canvas-button{flex:none;min-width:30px;min-height:30px;padding:5px;border-radius:9px}
.bt-canvas-button>svg,.bt-canvas-dock-item>svg{display:block;flex:none;width:16px;height:16px}
.bt-canvas-button>span,.bt-canvas-dock-item>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-canvas-button:hover:not(:disabled),.bt-canvas-dock-item:hover:not(:disabled){background:var(--bt-hover)}
.bt-canvas-button:active:not(:disabled),.bt-canvas-dock-item:active:not(:disabled){background:var(--bt-active)}
.bt-canvas :is(.bt-canvas-button,.bt-canvas-dock-item):is([data-active="true"],[data-active=""],[data-selected="true"],[data-selected=""],[aria-pressed=true],[aria-current=page]){background:color-mix(in srgb,var(--bt-accent) 12%,var(--bt-canvas-chrome));border-color:color-mix(in srgb,var(--bt-accent) 25%,transparent);color:var(--bt-ink)}
.bt-canvas :is(.bt-canvas-button,.bt-canvas-dock-item):disabled{opacity:.45;cursor:default}
.bt-canvas :is(.bt-canvas-button,.bt-canvas-dock-item,.bt-canvas-window-title,.bt-canvas-window-header,.bt-canvas-group-header,.bt-canvas-resize):focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
.bt-canvas-content{display:flex;flex:1 1 0;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:transparent}
.bt-canvas-compact{display:flex;flex:1 1 0;flex-direction:column;gap:6px;min-width:0;min-height:0;padding:0 14px 12px;overflow:hidden}
.bt-canvas-card-state{display:block;align-self:stretch;max-width:100%;min-height:20px;flex:none;padding:0;border:0;border-radius:4px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:11px;line-height:20px;text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.bt-canvas-card-state:hover{color:var(--bt-ink);background:var(--bt-hover)}
.bt-canvas-card-state>span{display:inline-block;width:6px;height:6px;margin-inline-end:6px;vertical-align:1px;border-radius:50%;background:color-mix(in srgb,var(--bt-ink-2) 65%,transparent)}
.bt-canvas-card-state[data-state=working]{color:var(--bt-accent)}
.bt-canvas-card-state[data-state=working]>span{background:var(--bt-accent)}
.bt-canvas-card-state[data-state=waiting]{color:var(--bt-ink)}
.bt-canvas-card-state[data-state=waiting]>span{background:#b47b32;box-shadow:0 0 0 3px color-mix(in srgb,#b47b32 14%,transparent)}
.bt-canvas-compact>p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;min-height:18px;color:var(--bt-ink-2);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.bt-canvas-compact[data-has-groups]>p{-webkit-line-clamp:1}
.bt-canvas-compact>footer{display:flex;align-items:center;gap:4px;flex:none;margin-top:auto;padding-top:0}
.bt-canvas-compact>footer>.bt-canvas-button{min-width:0;min-height:32px;padding:5px 8px;font-size:12px;line-height:20px;white-space:nowrap}
.bt-canvas-compact .bt-canvas-open-conversation{flex:1 1 auto;border-color:color-mix(in srgb,var(--bt-accent) 20%,transparent);background:color-mix(in srgb,var(--bt-accent) 7%,var(--bt-canvas-chrome))}
.bt-canvas-compact .bt-canvas-open-conversation:hover{background:color-mix(in srgb,var(--bt-accent) 13%,var(--bt-canvas-chrome));border-color:color-mix(in srgb,var(--bt-accent) 32%,transparent)}
.bt-canvas-room-summary{display:flex;flex:none;flex-direction:column;gap:4px;min-width:0;max-width:100%}
.bt-canvas-room-mode{display:block;max-width:100%;height:18px;min-width:0;padding:0;border:0;border-radius:4px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:11px;line-height:18px;text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.bt-canvas-room-mode:hover{color:var(--bt-ink);background:var(--bt-hover)}
.bt-canvas-members{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;flex:none;overflow:hidden}
.bt-canvas-members>.bt-canvas-button{position:relative;flex:0 1 auto;gap:5px;min-width:0;min-height:22px;max-width:100%;padding:1px 6px;border-radius:9px;background:var(--bt-hover);font-size:11px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-canvas-member>.bt-mark{flex:none;border-radius:50%}
.bt-canvas-member:has(>.bt-mark){padding:2px 6px 2px 2px}
.bt-canvas-member:has(>.bt-mark)::before{position:absolute;left:25px;bottom:2px;width:6px;height:6px;border:1px solid var(--bt-card)}
.bt-canvas-member[data-state]::before{content:"";flex:none;width:5px;height:5px;border-radius:50%;background:var(--bt-ink-3,var(--bt-ink-2))}
.bt-canvas-member[data-state=work]::before{background:var(--bt-accent)}
.bt-canvas-member[data-state=ask]::before{background:#b47b32;box-shadow:0 0 0 2px color-mix(in srgb,#b47b32 14%,transparent)}
.bt-canvas-resize{position:absolute;right:2px;bottom:2px;z-index:5;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--bt-ink-2);font-size:0;touch-action:none;cursor:nwse-resize}
.bt-canvas-resize{z-index:15}
.bt-canvas-resize::after{content:"";width:9px;height:9px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;border-bottom-right-radius:2px;opacity:.7}
.bt-canvas-resize:has(svg)::after{display:none}
.bt-canvas-resize>svg{width:14px;height:14px}
.bt-canvas-resize:hover{background:var(--bt-hover);color:var(--bt-ink)}
.bt-canvas-group{position:absolute;z-index:0;min-width:0;border:1px solid rgba(255,255,255,.2);border-radius:26px;background:rgba(35,54,57,.3);box-shadow:0 14px 40px -20px rgba(12,30,34,.3),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(18px) saturate(112%);backdrop-filter:blur(18px) saturate(112%)}
.bt-canvas-group:is([data-selected="true"],[data-selected=""]){border-color:var(--bt-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--bt-accent) 30%,transparent)}
.bt-canvas-group-header{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:5px 12px 5px 16px;color:var(--bt-ink);font-size:12px;line-height:18px;cursor:grab;touch-action:none;user-select:none}
.bt-canvas-group-header:active{cursor:grabbing}
.bt-canvas-group-header>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-canvas-group-header .bt-canvas-button{min-height:28px;padding:3px 7px;font-size:12px}
.bt-canvas-group-title{display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:0;overflow:hidden}
.bt-canvas-group-title>.bt-canvas-button:first-child{justify-content:flex-start;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:grab;touch-action:none}
.bt-canvas-group-title>.bt-canvas-button:last-child{flex:none;padding:3px;min-width:28px}
.bt-canvas-group-name{box-sizing:border-box;flex:1 1 auto;min-width:0;width:100%;max-width:320px;height:28px;padding:3px 7px;border:1px solid var(--bt-accent);border-radius:7px;background:var(--bt-canvas-chrome);color:var(--bt-ink);font:inherit;font-size:12px;line-height:20px;outline:none}
.bt-canvas :is(.bt-canvas-card-state,.bt-canvas-room-mode,.bt-canvas-group-name):focus-visible{outline:2px solid var(--bt-accent);outline-offset:1px}
.bt-canvas-marquee{position:absolute;z-index:20;pointer-events:none;border:1px solid var(--bt-accent);border-radius:5px;background:color-mix(in srgb,var(--bt-accent) 14%,transparent)}
.bt-canvas-dock{left:50%;bottom:16px;display:flex;align-items:center;flex-wrap:nowrap;gap:4px;width:max-content;max-width:min(760px,calc(100% - 500px));max-height:86px;overflow-x:auto;overflow-y:hidden;padding:6px 10px;border-radius:999px;transform:translateX(-50%);scrollbar-width:thin;scrollbar-color:var(--bt-line-2) transparent;overscroll-behavior:contain}
.bt-canvas-dock-item{flex:0 0 auto;flex-direction:column;gap:2px;width:58px;min-width:0;max-width:76px;padding:4px;border-radius:18px;font-size:10px;line-height:14px;text-align:center}
.bt-canvas-dock-item>.bt-mark,.bt-canvas-dock-item>.bt-cluster{flex:none;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.18)}
.bt-canvas-dock-item>span:not(.bt-mark):not(.bt-cluster){max-width:100%}
.bt-canvas-zoom{right:16px;bottom:16px;display:flex;align-items:center;gap:3px;padding:6px;border-radius:16px}
.bt-canvas-zoom>output,.bt-canvas-zoom>span{min-width:42px;text-align:center;color:var(--bt-ink-2);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}
.bt-canvas-status{right:16px;bottom:76px;max-width:248px;padding:6px 10px;border-radius:10px;color:var(--bt-ink-2);font-size:12px;line-height:18px;overflow-wrap:anywhere;pointer-events:none}
.bt-canvas-status:empty{display:none}
.bt-canvas-empty{position:absolute;z-index:1;top:50%;left:50%;display:flex;flex-direction:column;align-items:center;gap:12px;width:max-content;max-width:calc(100% - 40px);padding:22px 26px;border:1px solid var(--bt-canvas-border);border-radius:20px;background:var(--bt-canvas-chrome);box-shadow:var(--bt-canvas-shadow);transform:translate(-50%,-50%);text-align:center;color:var(--bt-ink);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px)}
.bt-canvas-empty>p{margin:0;max-width:34ch;color:var(--bt-ink-2);font-size:13px;line-height:20px}
.bt-canvas-empty>:is(strong,h2){margin:0;font-size:16px;line-height:24px;font-weight:500}
.bt-canvas-session{--bt-placeholder:"Message";--bt-first-sep:none;position:relative;display:flex;flex:1 1 0;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
.bt-canvas-session-error{display:flex;flex:1 1 0;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-width:0;min-height:0;padding:20px;text-align:center;color:var(--bt-ink-2);font-size:13px;line-height:20px;overflow-wrap:anywhere}
.bt-canvas-content>.bt-canvas-status{position:static;align-self:center;max-width:100%;margin:auto;padding:16px;background:none;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
.bt-canvas [data-conversation-content]{display:flex;flex:1 1 0;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;background:transparent!important}
.bt-canvas [data-conversation-content]>[data-conversation-scroll]{flex:1 1 0;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;background:transparent;scrollbar-width:thin;scrollbar-color:var(--bt-line-2) transparent}
.bt-canvas [data-composer-seat]{margin-top:auto;background:linear-gradient(180deg,transparent 0,color-mix(in srgb,var(--bt-card) 40%,transparent) 32px)!important;-webkit-backdrop-filter:blur(18px) saturate(112%);backdrop-filter:blur(18px) saturate(112%)}
.bt-canvas [data-composer-card]{background:color-mix(in srgb,var(--bt-card) 72%,transparent)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.bt-canvas [data-composer-input]{color:var(--bt-ink);caret-color:var(--bt-ink)}
/* Embedded conversations have their own window header, rather than the floating pill. */
.bt-canvas-session [class*="_scroll"]:has(> [class*="_column"]){padding-top:12px!important}
.bt-canvas-session [class*="_scroll"]>[class*="_column"]::before{margin-top:0}
.bt-canvas-session [data-conversation-content]{--dsh-chat-content-width:min(960px,100%)}
.bt-canvas-launcher{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;padding:0;border:1px solid var(--bt-line);border-radius:10px;background:var(--bt-main);color:var(--bt-ink-2);font:inherit;line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease,border-color .12s ease}
.bt-canvas-launcher>svg{display:block;width:18px;height:18px}
.bt-canvas-launcher>span{display:flex;align-items:center;justify-content:center;font-size:20px}
.bt-canvas-launcher:hover{background:var(--bt-hover);color:var(--bt-ink);border-color:var(--bt-line-2)}
.bt-canvas-launcher:active{background:var(--bt-active)}
.bt-canvas-launcher:focus-visible{outline:2px solid var(--bt-accent);outline-offset:2px}
@container bt-canvas (max-width:900px){
  .bt-canvas-dock{bottom:78px;max-width:calc(100% - 24px)}
}
@media(max-width:900px){
  .bt-canvas-dock{bottom:78px;max-width:calc(100% - 24px)}
}
@container bt-canvas (max-width:640px){
  .bt-canvas-toolbar{top:12px;left:12px;right:12px;width:auto;max-width:none;gap:3px;padding:5px;border-radius:14px}
  .bt-canvas-toolbar>strong{flex-basis:100%;padding:3px 7px}
  .bt-canvas-toolbar>span[role=separator]{display:none}
  .bt-canvas-toolbar .bt-canvas-button{padding:6px 8px;font-size:12px}
  .bt-canvas-dock{left:50%;right:auto;bottom:76px;max-width:calc(100% - 24px);max-height:86px;padding:5px 8px;border-radius:28px}
  .bt-canvas-dock-item{width:54px;max-width:64px;padding:4px;font-size:10px}
  .bt-canvas-zoom{right:12px;bottom:12px;padding:5px;border-radius:14px}
  .bt-canvas>.bt-canvas-status{display:none}
  .bt-canvas-window-header{gap:7px;padding:9px 10px}
  .bt-canvas-window-actions{gap:1px}
}
@media(max-width:640px){
  .bt-canvas-toolbar{top:12px;left:12px;right:12px;width:auto;max-width:none;gap:3px;padding:5px;border-radius:14px}
  .bt-canvas-toolbar>strong{flex-basis:100%;padding:3px 7px}
  .bt-canvas-toolbar>span[role=separator]{display:none}
  .bt-canvas-toolbar .bt-canvas-button{padding:6px 8px;font-size:12px}
  .bt-canvas-dock{left:50%;right:auto;bottom:76px;max-width:calc(100% - 24px);max-height:86px;padding:5px 8px;border-radius:28px}
  .bt-canvas-dock-item{width:54px;max-width:64px;padding:4px;font-size:10px}
  .bt-canvas-zoom{right:12px;bottom:12px;padding:5px;border-radius:14px}
  .bt-canvas>.bt-canvas-status{display:none}
  .bt-canvas-window-header{gap:7px;padding:9px 10px}
  .bt-canvas-window-actions{gap:1px}
}
@media(pointer:coarse){
  .bt-canvas :is(.bt-canvas-button,.bt-canvas-dock-item){min-width:44px;min-height:44px}
  .bt-canvas-window-actions{gap:2px}
  .bt-canvas-resize{width:44px;height:44px}
  .bt-canvas-window-header{min-height:68px}
  .bt-canvas-window[data-mode=card]>.bt-canvas-window-header{min-height:60px;padding:6px 10px}
  .bt-canvas-window[data-mode=card][data-kind=room]>.bt-canvas-window-header{min-height:60px;padding:6px 10px}
  .bt-canvas-compact{gap:2px;padding:0 12px 6px}
  .bt-canvas-compact>p{-webkit-line-clamp:1}
  .bt-canvas-room-summary{gap:0}
  .bt-canvas-compact>footer>.bt-canvas-button,.bt-canvas-members>.bt-canvas-button{min-height:44px}
  .bt-canvas-compact>footer>.bt-canvas-button{padding:5px 7px}
  .bt-canvas-group-header{min-height:48px}
  .bt-canvas-avatar-tools{top:-20px;right:-5px;opacity:1;pointer-events:auto;padding:0 2px}
  .bt-canvas-avatar-tools>input[type=checkbox]{width:22px;height:22px;margin:0 9px}
  .bt-canvas-avatar-status{top:37px;left:64px;width:44px;height:44px}
}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:var(--bt-card)}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:var(--bt-card)!important}
}
@media(prefers-reduced-transparency:reduce){
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:var(--bt-card);-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:var(--bt-card)!important;-webkit-backdrop-filter:none;backdrop-filter:none}
}
@media(prefers-reduced-motion:reduce){
  .bt-canvas,.bt-canvas *,.bt-canvas *::before,.bt-canvas *::after,.bt-canvas-launcher{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media(forced-colors:active){
  .bt-canvas{--bt-ink:CanvasText;--bt-ink-2:CanvasText;--bt-ink-3:CanvasText;--bt-card:Canvas;--bt-main:Canvas;--bt-accent:Highlight;background:Canvas;color:CanvasText}
  .bt-canvas::before,.bt-canvas::after{display:none}
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty){background:Canvas;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-window:is([data-active="true"],[data-active=""],[data-selected="true"],[data-selected=""]){outline:2px solid Highlight}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent;outline:none}
  .bt-canvas-avatar-node>.bt-canvas-window-title>strong,.bt-canvas-avatar-node>.bt-canvas-window-title>span{color:CanvasText;text-shadow:none}
  .bt-canvas-avatar-open>.bt-mark{outline:1px solid CanvasText}
  .bt-canvas-window[data-mode=card][data-kind=bot]:is([data-active=true],[data-active=""],[data-selected=true],[data-selected=""]) .bt-canvas-avatar-open>.bt-mark{outline:3px solid Highlight;outline-offset:3px}
  .bt-canvas-avatar-tools,.bt-canvas-group{background:Canvas;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-avatar-status::before{background:Canvas;border-color:CanvasText}
  .bt-canvas-group,.bt-canvas-marquee{border-color:Highlight}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:Canvas!important;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-launcher{background:ButtonFace;color:ButtonText;border-color:ButtonText}
}
`
