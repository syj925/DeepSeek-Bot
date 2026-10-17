export const RESTORED_CHAT_CSS = `
.bt-restored-chat{--bt-user:#f1f5f9;--bt-user-ink:#475569;--bt-bubble:rgba(255,255,255,.8);--bt-ink:#475569;--bt-ink-2:#64748b;--bt-ink-3:#94a3b8}
.bt-restored-chat .bt-bubble{background:rgba(255,255,255,.8)!important;color:#475569!important;border:1px solid rgba(255,255,255,.9);border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.035);padding:10px 14px}

.bt-canvas-chat-layer{position:absolute;inset:0;z-index:60;display:grid;place-items:center;pointer-events:none;box-sizing:border-box}
.bt-canvas-chat-float{position:relative;width:min(860px,calc(100% - 48px));height:min(700px,calc(100% - 80px));min-height:0;pointer-events:auto;outline:none;border:1px solid var(--glass-border,rgba(255,255,255,.45));border-radius:24px;background:var(--glass-window,rgba(255,255,255,.5));backdrop-filter:blur(24px);box-shadow:var(--glass-shadow,0 8px 28px rgba(0,0,0,.12));animation:bt-restored-open .26s cubic-bezier(.16,1,.3,1) both}
.bt-canvas-chat-float[data-closing=true]{pointer-events:none;animation:bt-restored-close .18s ease both}
.bt-canvas-chat-float{background:rgba(248,249,250,.97)}
.bt-canvas-chat-float[data-active=true]{box-shadow:0 16px 48px rgba(0,0,0,.14),0 0 0 1px rgba(255,255,255,.8)}
.bt-restored-chat-shell{height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:inherit}
.bt-restored-chat-shell>.bt-team-chat-bar{flex:none;cursor:grab;touch-action:none}
.bt-restored-chat{min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden;color:var(--text-primary,#262626)}
.bt-restored-chat>.bt-canvas-session{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.bt-restored-chat [data-conversation-content]{--dsh-chat-content-width:calc(100% - 32px);min-height:0}
.bt-restored-chat [data-composer-seat]{padding:12px 18px 16px!important;background:transparent!important;box-sizing:border-box}
.bt-restored-chat [data-composer-card]{background:rgba(255,255,255,.75)!important;border:1px solid rgba(255,255,255,.9)!important;border-radius:14px!important;box-shadow:0 4px 16px rgba(0,0,0,.04)}
.bt-restored-chat [data-composer-input]{min-height:64px}
.bt-canvas-contact-ghost{position:fixed;left:0;top:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:9px;width:120px;height:112px;padding-top:12px;pointer-events:none;user-select:none;will-change:transform;filter:drop-shadow(0 8px 12px rgba(0,0,0,.16))}
.bt-canvas-contact-ghost>strong{max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px;border:1px solid rgba(255,255,255,.45);border-radius:10px;background:rgba(255,255,255,.8);color:#262626;font:600 12px/18px system-ui}
.bt-canvas-window[data-mode=card][data-kind=bot] .bt-canvas-avatar-status{pointer-events:none}
@keyframes bt-restored-open{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes bt-restored-close{to{opacity:0;transform:translateY(8px) scale(.98)}}
@media(prefers-reduced-motion:reduce){.bt-canvas-chat-float,.bt-canvas-chat-float[data-closing=true]{animation-duration:.01ms}}
.bt-chat-resize{position:absolute;z-index:100;touch-action:none;user-select:none}
.bt-chat-resize[data-edge=n],.bt-chat-resize[data-edge=s]{left:20px;right:20px;height:10px;cursor:ns-resize}
.bt-chat-resize[data-edge=n]{top:-5px}.bt-chat-resize[data-edge=s]{bottom:-5px}
.bt-chat-resize[data-edge=e],.bt-chat-resize[data-edge=w]{top:20px;bottom:20px;width:10px;cursor:ew-resize}
.bt-chat-resize[data-edge=e]{right:-5px}.bt-chat-resize[data-edge=w]{left:-5px}
.bt-chat-resize[data-edge=ne],.bt-chat-resize[data-edge=se],.bt-chat-resize[data-edge=sw],.bt-chat-resize[data-edge=nw]{width:22px;height:22px}
.bt-chat-resize[data-edge=ne]{right:-4px;top:-4px;cursor:nesw-resize}.bt-chat-resize[data-edge=se]{right:-4px;bottom:-4px;cursor:nwse-resize}
.bt-chat-resize[data-edge=sw]{left:-4px;bottom:-4px;cursor:nesw-resize}.bt-chat-resize[data-edge=nw]{left:-4px;top:-4px;cursor:nwse-resize}
.bt-chat-resize[data-edge=se]:after{content:'';position:absolute;right:7px;bottom:7px;width:7px;height:7px;border-right:2px solid var(--bt-ink-3);border-bottom:2px solid var(--bt-ink-3);border-radius:0 0 3px 0;opacity:.45}`
