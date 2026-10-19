
import { canvasSnowfieldUrl } from './canvas-landscape.js'

export const canvasStyles = `
:root {
  /* 背景：冰原 4K 纯净壁纸 */
  --canvas-wallpaper: url("${canvasSnowfieldUrl}");
  --canvas-background: var(--bt-wallpaper-image, var(--canvas-wallpaper));

  /* 乳白磨砂 */
  --glass-window: rgba(255, 255, 255, 0.5);
  --glass-floating: rgba(255, 255, 255, 0.5);
  --glass-border: rgba(255, 255, 255, 0.45);
  --glass-blur: 50px;
  --glass-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.08);

  --text-primary: #262626;
  --text-secondary: #757575;
  --divider: rgba(0, 0, 0, 0.08);

  /* 统一字体排版体系 */
  --bt-font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
  --bt-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --bt-fs-xs: 11px;
  --bt-fs-sm: 12px;
  --bt-fs-base: 13px;
  --bt-fs-md: 14px;
  --bt-fs-lg: 16px;
  --bt-fs-xl: 18px;
}

/* 添加在视口层，内部画布内容继续使用原来的 transform */
.canvas-viewport {
  background: var(--canvas-background);
  color: var(--text-primary);
}

/* 实色后备，同时保留组件原来的定位和尺寸 */
.agent-window,
.team-panel,
.agent-dock,
.floating-toolbar {
  background: #f8f8f8;
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  box-shadow: var(--glass-shadow);
}

.team-panel,
.agent-dock {
  border-radius: 28px;
}

.floating-toolbar {
  border-radius: 16px;
}

/* 支持背景模糊时，启用透明玻璃 */
@supports (
  (backdrop-filter: blur(1px)) or
  (-webkit-backdrop-filter: blur(1px))
) {
  .agent-window,
  .team-panel,
  .agent-dock,
  .floating-toolbar {
    background: var(--glass-window);
    -webkit-backdrop-filter: blur(var(--glass-blur));
    backdrop-filter: blur(var(--glass-blur));
  }

  .team-panel,
  .agent-dock,
  .floating-toolbar {
    background: var(--glass-floating);
  }
}

/* 窗口内部保持完整玻璃感，不重复模糊 */
.agent-window__header,
.agent-window__toolbar,
.agent-window__input-area {
  background: transparent;
  border-color: var(--divider);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

/* 柔和白色按钮 */
.glass-button {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.04);
}

.glass-button--pill {
  border-radius: 999px;
}

/* 团队列表和 Dock 的选中态 */
.team-item[aria-selected="true"],
.dock-item[aria-pressed="true"] {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 18px;
  box-shadow:
    0 5px 16px rgba(0, 0, 0, 0.05),
    inset 0 0 0 1px rgba(255, 255, 255, 0.9);
}

.text-secondary {
  color: var(--text-secondary);
}

.glass-button:focus-visible,
.team-item:focus-visible,
.dock-item:focus-visible {
  outline: 2px solid #888;
  outline-offset: 3px;
}

.bt-canvas {
  --bt-ink: var(--text-primary);
  --bt-ink-2: var(--text-secondary);
  --bt-ink-3: #8c8c8c;
  --bt-card: #f8f8f8;
  --bt-main: #ffffff;
  --bt-sidebar: #ffffff;
  --bt-bubble: rgba(0, 0, 0, 0.04);
  --bt-line: var(--divider);
  --bt-line-2: rgba(0, 0, 0, 0.1);
  --bt-line-weak: rgba(0, 0, 0, 0.04);
  --bt-hover: rgba(0, 0, 0, 0.04);
  --bt-active: rgba(0, 0, 0, 0.08);
  --bt-accent: #10a37f;
  --bt-accent-ink: #ffffff;
  --bt-user: #262626;
  --bt-user-ink: #ffffff;
  --bt-tag-bg: rgba(0, 0, 0, 0.05);
  --bt-tag-ink: var(--text-secondary);
  --bt-canvas-glass: var(--glass-window);
  --bt-canvas-chrome: var(--glass-floating);
  --bt-canvas-border: var(--glass-border);
  --bt-canvas-shadow: var(--glass-shadow);

  position: relative;
  isolation: isolate;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  container-type: inline-size;
  container-name: bt-canvas;
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  background: var(--canvas-background);
}

.bt-canvas[data-wallpaper=custom] {
  background-image: var(--bt-wallpaper-image), var(--canvas-background);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.bt-canvas::before {
  display: none !important;
}

.bt-canvas [hidden] { display: none !important; }
.bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-window-header,.bt-canvas-content,.bt-canvas-compact,.bt-canvas-group,.bt-canvas-group-header,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-button,.bt-canvas-dock-item,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-session,.bt-canvas-session-error) { box-sizing: border-box; }

.bt-canvas-toolbar, .bt-canvas-dock, .bt-canvas-zoom, .bt-canvas-status {
  position: absolute;
  z-index: 30;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.bt-canvas-toolbar {
  display: none !important;
  top: 16px;
  left: 16px;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 6px 8px;
  border-radius: 16px;
}
.bt-canvas-toolbar > strong {
  min-width: 0;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.bt-canvas-toolbar > span[role=separator] {
  width: 1px;
  height: 18px;
  flex: none;
  margin: 0 4px;
  background: var(--divider);
}

.bt-canvas-toolbar.bt-canvas-drawer {
  top: 16px;
  left: 16px;
  z-index: 35;
  display: flex;
  flex-direction: column;
  width: auto;
  max-width: none;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.bt-canvas-drawer-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px 0 12px;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: background-color .14s ease, border-color .14s ease, color .14s ease, transform .12s cubic-bezier(0.16,1,0.3,1);
}
.bt-canvas-drawer-trigger:hover {
  background: #ffffff;
  color: var(--text-primary);
  transform: translateY(-1px);
}
.bt-canvas-drawer-trigger:active { transform: scale(0.97); }
.bt-drawer-trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  color: var(--text-primary);
}
.bt-drawer-trigger-text { min-width: 0; white-space: nowrap; }
.bt-canvas-drawer-trigger svg { flex: none; width: 14px; height: 14px; color: var(--text-secondary); transition: transform .14s ease; }

.bt-canvas-toolbar.bt-canvas-drawer[data-open=true] {
  width: 260px;
  max-height: calc(100% - 32px);
  padding: 12px 10px;
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  background: var(--glass-floating);
  box-shadow: var(--glass-shadow);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  animation: btDrawerSlide .2s cubic-bezier(0.16,1,0.3,1);
  overflow: hidden;
}
@keyframes btDrawerSlide {
  from { opacity: 0; transform: translateX(-10px) scale(0.98); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

.bt-drawer-content { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.bt-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 2px 4px 10px;
  border-bottom: 1px solid var(--divider);
  flex: none;
}
.bt-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--text-primary);
}
.bt-drawer-title strong { font-size: 14px; font-weight: 600; }
.bt-drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all .12s ease;
}
.bt-drawer-close:active { transform: scale(0.94); }
.bt-drawer-close svg { width: 16px; height: 16px; }

.bt-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,.15) transparent;
  padding: 6px 0 2px;
}
.bt-drawer-section-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  padding: 10px 8px 3px;
  user-select: none;
}
.bt-drawer-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
  user-select: none;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease, transform .12s cubic-bezier(0.16,1,0.3,1);
}
.bt-drawer-item > svg { flex: none; width: 15px; height: 15px; color: var(--text-secondary); transition: color .12s ease; }
.bt-drawer-item > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bt-drawer-item:hover:not(:disabled) {
  background: rgba(0,0,0,.04);
  color: var(--text-primary);
  transform: translateX(2px);
}
.bt-drawer-item:hover:not(:disabled) > svg { color: var(--text-primary); }
.bt-drawer-item:active:not(:disabled) { background: rgba(0,0,0,.08); transform: scale(0.98); }
.bt-drawer-item:disabled { opacity: .35; cursor: default; }
.bt-drawer-separator { height: 1px; margin: 6px 8px; background: var(--divider); flex: none; }
.bt-drawer-body .bt-wallpaper-control { display: flex; width: 100%; }
.bt-drawer-body .bt-wallpaper-control > .bt-canvas-button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
  transition: background-color .12s ease, transform .12s cubic-bezier(0.16,1,0.3,1);
}
.bt-drawer-body .bt-wallpaper-control > .bt-canvas-button > svg { flex: none; width: 15px; height: 15px; color: var(--text-secondary); }
.bt-drawer-body .bt-wallpaper-control > .bt-canvas-button:hover {
  background: rgba(0,0,0,.04);
  color: var(--text-primary);
  transform: translateX(2px);
}

.bt-canvas-stage { position: absolute; inset: 0; z-index: 0; isolation: isolate; overflow: hidden; touch-action: auto; cursor: grab; }
.bt-canvas-background { position: absolute; inset: 0; z-index: -1; touch-action: none; }
.bt-canvas-stage:is([data-dragging="true"],[data-dragging=""]), .bt-canvas:is([data-dragging="true"],[data-dragging=""]) .bt-canvas-stage { cursor: grabbing; }
.bt-canvas-world { position: absolute; left: 0; top: 0; isolation: isolate; transform-origin: 0 0; }

.bt-canvas-window {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 260px;
  min-height: 180px;
  overflow: hidden;
  color: var(--text-primary);
  cursor: default;
  outline: none !important;
  -webkit-tap-highlight-color: transparent;
  transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.bt-canvas-window:focus,
.bt-canvas-window:focus-visible,
.bt-canvas-window:focus-within {
  outline: none !important;
}
.bt-canvas-window:is([data-active="true"],[data-active=""]) {
  outline: none !important;
  border-color: rgba(255, 255, 255, 0.7);
  box-shadow: 0 6px 24px 0 rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
.bt-canvas-window:is([data-selected="true"],[data-selected=""]) {
  outline: none !important;
  box-shadow: 0 6px 24px 0 rgba(0, 0, 0, 0.12), 0 0 0 2px rgba(255, 255, 255, 0.7);
}
.bt-canvas-window[data-mode=card] { border-radius: 24px; }
.bt-canvas-window.bt-canvas-avatar-window,
.bt-canvas-window[data-mode=card][data-kind=bot] {
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: visible !important;
  border: 0 !important;
  border-width: 0 !important;
  border-color: transparent !important;
  border-radius: 0 !important;
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  cursor: grab;
}

.bt-canvas-window.bt-canvas-avatar-window:is([data-active="true"],[data-active=""],[data-selected="true"],[data-selected=""]),
.bt-canvas-window[data-mode=card][data-kind=bot]:is([data-active="true"],[data-active=""],[data-selected="true"],[data-selected=""]) {
  border: 0 !important;
  border-color: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.bt-canvas-avatar-node {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  height: 114px;
  max-width: 100%;
  isolation: isolate;
  touch-action: none;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.bt-canvas-avatar-open {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 64px;
  min-width: 0;
  height: 64px;
  padding: 0;
  margin-top: 6px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  line-height: 1;
  text-align: center;
  cursor: grab;
  touch-action: none;
}
.bt-canvas-avatar-open:active { cursor: grabbing; }
.bt-canvas-avatar-open > .bt-mark {
  flex: none;
  border-radius: 50% !important;
  box-shadow: 0 4px 14px rgba(0,0,0,.08) !important;
  background: transparent !important;
  background-color: transparent !important;
  transition: box-shadow .16s cubic-bezier(0.16,1,0.3,1), transform .16s cubic-bezier(0.16,1,0.3,1);
}
.bt-canvas-avatar-open:hover > .bt-mark {
  box-shadow: 0 6px 18px rgba(0,0,0,.12) !important;
  transform: translateY(-2px);
}
.bt-canvas-window:is([data-active=true],[data-active=""]) .bt-canvas-avatar-open > .bt-mark {
  box-shadow: 0 6px 20px rgba(0,0,0,.14), 0 0 0 3px #10a37f;
}
.bt-canvas-window:is([data-selected=true],[data-selected=""]) .bt-canvas-avatar-open > .bt-mark {
  box-shadow: 0 6px 20px rgba(0,0,0,.14), 0 0 0 3px #10a37f, 0 0 0 6px rgba(16,163,127,.25);
}
.bt-canvas-avatar-open:focus-visible { outline: 2px solid #888; outline-offset: 3px; }

.bt-canvas-avatar-node > .bt-canvas-window-title {
  box-sizing: border-box;
  display: flex;
  flex: none;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  width: 100%;
  height: 36px;
  min-height: 36px;
  padding: 0 4px;
  overflow: visible;
  text-align: center;
}
.bt-canvas-avatar-node > .bt-canvas-window-title > strong {
  display: block;
  flex: none;
  width: 100%;
  max-width: 100%;
  height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  text-shadow: 0 1px 2px rgba(255,255,255,.9);
}
.bt-canvas-avatar-node > .bt-canvas-window-title > span {
  display: block;
  flex: none;
  width: 100%;
  max-width: 100%;
  height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 2px rgba(255,255,255,.9);
}

.bt-canvas-avatar-tools {
  position: absolute;
  z-index: 2;
  top: -12px;
  right: -3px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px;
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .14s ease;
}
.bt-canvas-avatar-node:is(:hover,:focus-within) .bt-canvas-avatar-tools,
.bt-canvas-window:is([data-selected=true],[data-selected=""]) .bt-canvas-avatar-tools {
  opacity: 1;
  pointer-events: auto;
}
.bt-canvas-avatar-tools > input[type=checkbox] {
  width: 15px;
  height: 15px;
  margin: 0 2px;
  accent-color: #10a37f;
  cursor: pointer;
}
.bt-canvas-avatar-tools > .bt-canvas-button {
  width: 26px;
  min-width: 26px;
  min-height: 26px;
  padding: 3px;
  border-radius: 50%;
}

.bt-canvas-avatar-status {
  position: absolute;
  z-index: 1;
  top: 48px;
  left: 74px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.bt-canvas-avatar-status > svg { display: none; }
.bt-canvas-avatar-status::before {
  content: "";
  display: block;
  box-sizing: border-box;
  width: 10px;
  height: 10px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 1px 3px rgba(0,0,0,.15);
}
.bt-canvas-avatar-status[data-state=available]::before { background: #10a37f; }
.bt-canvas-avatar-status[data-state=working]::before {
  background: #10a37f;
  box-shadow: 0 0 0 3px rgba(16,163,127,.24), 0 0 8px rgba(16,163,127,.5);
}
.bt-canvas-avatar-status[data-state=waiting]::before {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245,158,11,.22);
}
.bt-canvas-avatar-status:hover { background: rgba(0,0,0,.05); }
.bt-canvas-avatar-status:focus-visible { outline: 2px solid #888; outline-offset: 2px; }

/* Avatar Quick Chat below each Agent */
.bt-avatar-chatbox {
  position: absolute;
  top: 118px;
  left: 50%;
  transform: translateX(-50%);
  width: 196px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px 3px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.1), 0 1px 3px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95);
  transition: width 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease, border-color 0.18s ease;
  z-index: 5;
  pointer-events: auto;
  user-select: none;
}

.bt-avatar-chatbox:hover,
.bt-avatar-chatbox:focus-within {
  width: 216px;
  background: rgba(255, 255, 255, 0.96);
  border-color: rgba(16, 163, 127, 0.4);
  box-shadow: 0 6px 20px -2px rgba(15, 23, 42, 0.14), 0 0 0 2px rgba(16, 163, 127, 0.18);
}

.bt-avatar-chat-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 24px;
  padding: 0;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  font-family: inherit;
  font-size: 11.5px;
  color: var(--text-primary);
  line-height: 24px;
  user-select: text;
}

.bt-avatar-chat-input::placeholder {
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
}

.bt-avatar-chat-send {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: #10a37f;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease, background 0.12s ease;
}

.bt-avatar-chat-send:disabled {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.3);
  cursor: default;
}

.bt-avatar-chat-send:not(:disabled):hover {
  background: #0d8a6b;
  transform: scale(1.06);
}

.bt-avatar-chat-send:not(:disabled):active {
  transform: scale(0.92);
}

.bt-avatar-chat-send svg {
  width: 12px;
  height: 12px;
}

.bt-avatar-chat-open-btn {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}

.bt-avatar-chat-open-btn:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.06);
}

.bt-avatar-chat-open-btn svg {
  width: 13px;
  height: 13px;
}

@media (prefers-color-scheme: dark) {
  .bt-avatar-chatbox {
    background: rgba(28, 33, 44, 0.88);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .bt-avatar-chatbox:hover,
  .bt-avatar-chatbox:focus-within {
    background: rgba(32, 38, 52, 0.96);
    border-color: rgba(16, 163, 127, 0.5);
  }
  .bt-avatar-chat-send:disabled {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.3);
  }
}

.bt-canvas-window-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  min-height: 56px;
  padding: 10px 14px;
  touch-action: none;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--divider);
}
.bt-canvas-window[data-mode=card] > .bt-canvas-window-header {
  min-height: 64px;
  padding: 12px 14px 8px;
  gap: 10px;
  border-bottom: 0;
}
.bt-canvas-window[data-mode=card][data-kind=room] > .bt-canvas-window-header {
  min-height: 60px;
  padding: 10px 14px 6px;
}
.bt-canvas-window[data-mode=card] > .bt-canvas-window-header .bt-canvas-window-title { gap: 10px; }
.bt-canvas-window[data-mode=card] > .bt-canvas-window-header .bt-canvas-window-title strong {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  letter-spacing: -0.012em;
}
.bt-canvas-window-header:active { cursor: grabbing; }
.bt-canvas-window-header > .bt-mark, .bt-canvas-window-header > .bt-cluster { flex: none; }
.bt-canvas-window-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 34px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-align: start;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.bt-canvas-window-title > .bt-mark, .bt-canvas-window-title > .bt-cluster { flex: none; }
.bt-canvas-window-title > span:last-child { min-width: 0; overflow: hidden; }
.bt-canvas-window-title strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: var(--text-primary);
}
.bt-canvas-window-header > input[type=checkbox] {
  flex: none;
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #10a37f;
  cursor: pointer;
}
.bt-canvas-window-meta {
  display: block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
}
.bt-canvas-window-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  cursor: default;
}
.bt-canvas-window > .bt-canvas-window-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  flex: none;
  max-width: none;
  padding: 4px 14px 8px;
  white-space: normal;
  overflow: visible;
  border-bottom: 1px solid var(--divider);
}
.bt-canvas-window > .bt-canvas-window-meta > span[role=status] {
  flex: 1 0 100%;
  padding: 2px 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.bt-canvas-window > .bt-canvas-window-meta .bt-canvas-button {
  min-height: 26px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
}

.bt-canvas-button, .bt-canvas-dock-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border:1px solid rgba(255,255,255,.8);
  background:rgba(255,255,255,.72);
  min-width: 32px;
  min-height: 32px;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 12px;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: background-color .14s ease, border-color .14s ease, color .14s ease, transform .12s cubic-bezier(0.16,1,0.3,1);
}
.bt-canvas-window-actions .bt-canvas-button {
  flex: none;
  min-width: 28px;
  min-height: 28px;
  padding: 4px;
  border-radius: 8px;
}
.bt-canvas-button > svg, .bt-canvas-dock-item > svg { display: block; flex: none; width: 15px; height: 15px; }
.bt-canvas-button > span, .bt-canvas-dock-item > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bt-canvas-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 1);
  color: var(--text-primary);
}
.bt-canvas-button:active:not(:disabled) {
  transform: scale(0.97);
}
.bt-canvas :is(.bt-canvas-button):disabled { opacity: .4; cursor: default; }

.bt-canvas-content {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}
.bt-canvas-compact {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  min-height: 0;
  padding: 0 14px 12px;
  overflow: hidden;
}
.bt-canvas-card-state {
  display: flex;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  min-height: 22px;
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--divider);
  border-radius: 6px;
  background: rgba(255, 255, 255, .7);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .12s ease, color .12s ease;
}
.bt-canvas-card-state:hover { color: var(--text-primary); background: #ffffff; }
.bt-canvas-card-state > span {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-inline-end: 6px;
  border-radius: 50%;
  background: #94a3b8;
}
.bt-canvas-card-state[data-state=working] {
  color: #10a37f;
  background: rgba(16,163,127,.08);
  border-color: rgba(16,163,127,.2);
}
.bt-canvas-card-state[data-state=working] > span { background: #10a37f; }
.bt-canvas-card-state[data-state=waiting] {
  color: #b45309;
  border-color: rgba(245,158,11,.3);
  background: rgba(245,158,11,.1);
}
.bt-canvas-card-state[data-state=waiting] > span {
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245,158,11,.25);
}

.bt-canvas-compact > p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  min-height: 18px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.bt-canvas-compact[data-has-groups] > p { -webkit-line-clamp: 1; }
.bt-canvas-compact > footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin-top: auto;
  padding-top: 4px;
}
.bt-canvas-compact > footer > .bt-canvas-button {
  min-width: 0;
  min-height: 32px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  white-space: nowrap;
}
.bt-canvas-compact .bt-canvas-open-conversation {
  flex: 1 1 auto;
}
.bt-canvas-compact .bt-canvas-open-conversation:hover {
  transform: translateY(-1px);
}

/* A group stays small until its member preview is explicitly expanded. */
.bt-canvas-room-avatar-window .bt-canvas-room-avatar-node { height:132px; }
.bt-canvas-room-avatar-open { width:80px;height:80px;margin-top:0;border-radius:22px; }
.bt-canvas-room-avatar-open>.bt-cluster { transition:transform .16s ease,box-shadow .16s ease; }
.bt-canvas-room-avatar-open:hover>.bt-cluster { transform:translateY(-2px);box-shadow:0 5px 16px rgba(0,0,0,.1); }
.bt-canvas-room-avatar-window .bt-canvas-avatar-status { top:60px;left:86px;pointer-events:none; }
.bt-canvas-room-preview-toggle { position:absolute;bottom:0;left:46px;width:28px;height:20px;min-width:0;min-height:0;padding:0;justify-content:center;border:0;background:transparent;box-shadow:none; }
.bt-canvas-room-preview-toggle:hover { background:rgba(255,255,255,.5); }
.bt-canvas-group-card[data-room-stage="preview"] {
  width:var(--bt-room-preview-width,320px)!important;
  min-width:0!important;
  max-width:min(320px,calc(100% - 24px))!important;
  height:var(--bt-room-preview-height,300px)!important;
  min-height:0!important;
  border-radius:22px!important;
  background:var(--glass-window,rgba(255,255,255,.5))!important;
  border:1px solid var(--glass-border,rgba(255,255,255,.45))!important;
  box-shadow:var(--glass-shadow,0 4px 20px rgba(0,0,0,.08))!important;
  -webkit-backdrop-filter:blur(var(--glass-blur,50px))!important;
  backdrop-filter:blur(var(--glass-blur,50px))!important;
}
@keyframes bt-room-preview-in { from { opacity:0;transform:translateY(4px); } to { opacity:1;transform:translateY(0); } }
.bt-canvas-room-hover-preview { z-index:36;overflow:visible;animation:bt-room-preview-in 140ms cubic-bezier(.2,.8,.2,1) both; }
.bt-canvas-room-hover-preview::before { content:'';position:absolute;pointer-events:auto; }
.bt-canvas-room-hover-preview[data-side=right]::before { top:0;bottom:0;left:-14px;width:14px; }
.bt-canvas-room-hover-preview[data-side=left]::before { top:0;bottom:0;right:-14px;width:14px; }
.bt-canvas-room-hover-preview[data-side=below]::before { left:0;right:0;top:-14px;height:14px; }
.bt-canvas-room-hover-preview[data-side=above]::before { left:0;right:0;bottom:-14px;height:14px; }
.bt-group-card-body { box-sizing:border-box;display:flex;flex-direction:column;gap:8px;height:100%;padding:14px;overflow:auto;border-radius:inherit;user-select:none; }
.bt-group-card-header { display:flex;align-items:center;gap:7px;min-width:0;flex:none; }
.bt-group-card-header>input { flex:none;width:14px;height:14px;margin:0;accent-color:#10a37f; }
.bt-group-card-header>.bt-cluster { flex:none; }
.bt-group-card-header>.bt-canvas-button { flex:none;width:24px;min-width:0;height:28px;min-height:0;padding:3px;border:0;background:transparent;box-shadow:none; }
.bt-group-card-header>.bt-canvas-button:hover { background:rgba(255,255,255,.6); }
.bt-group-card-heading { display:flex;flex:1;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;min-width:0;padding:0;text-align:start; }
.bt-group-card-title { display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;line-height:20px;color:var(--text-primary); }
.bt-group-card-count { display:block;font-size:11px;line-height:14px; }
.bt-group-card-body>.bt-canvas-card-state { align-self:flex-start;flex:none;height:18px; }
.bt-canvas-group-card[data-room-stage="preview"] .bt-canvas-room-mode { padding:0; }
.bt-canvas-group-card[data-room-stage="preview"] .bt-canvas-members { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;overflow:visible; }
.bt-canvas-group-card[data-room-stage="preview"] .bt-canvas-members>.bt-canvas-button { width:100%;min-width:0;min-height:32px;justify-content:flex-start;padding:3px 5px; }
.bt-canvas-group-card[data-room-stage="preview"] .bt-canvas-member>.bt-mark { width:24px!important;height:24px!important; }
.bt-group-card-preview { display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;flex:none;margin:0;font-size:12px;line-height:18px;overflow-wrap:anywhere; }
.bt-group-card-enter { display:flex;align-items:center;justify-content:center;gap:8px;flex:none;width:100%;height:40px;margin-top:auto;border:0;border-radius:12px;background:#171717;color:#fff;font:inherit;font-size:12px;cursor:pointer; }
.bt-group-card-enter:hover { background:#2b2b2b; }
.bt-group-card-enter>svg { flex:none; }
@media(pointer:coarse) {
  .bt-canvas-room-preview-toggle { left:40px;bottom:-8px;width:40px;height:36px; }
  .bt-group-card-header>.bt-canvas-button { min-width:28px;min-height:40px; }
  .bt-canvas-group-card[data-room-stage="preview"] .bt-canvas-members>.bt-canvas-button { min-height:40px; }
  .bt-group-card-preview { -webkit-line-clamp:1; }
}
@media(prefers-reduced-motion:reduce) {
  .bt-canvas-room-avatar-open>.bt-cluster { transition:none; }
}

.bt-canvas-room-summary { display: flex; flex: none; flex-direction: column; gap: 6px; min-width: 0; max-width: 100%; }
.bt-canvas-room-mode {
  display: block;
  max-width: 100%;
  height: 20px;
  min-width: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 20px;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.bt-canvas-room-mode:hover { color: var(--text-primary); background: rgba(0,0,0,.04); }
.bt-canvas-members { display: flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; flex: none; overflow: hidden; }
.bt-canvas-members > .bt-canvas-button {
  position: relative;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
  min-height: 24px;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, .7);
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bt-canvas-member > .bt-mark { flex: none; border-radius: 50%; }
.bt-canvas-member:has(>.bt-mark) { padding: 2px 8px 2px 3px; }
.bt-canvas-member[data-state]::before { content: ""; flex: none; width: 5px; height: 5px; border-radius: 50%; background: #94a3b8; }
.bt-canvas-member[data-state=work]::before { background: #10a37f; }
.bt-canvas-member[data-state=ask]::before { background: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,.22); }

.bt-canvas-resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  z-index: 15;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0;
  touch-action: none;
  cursor: nwse-resize;
  transition: color .12s ease, background-color .12s ease;
}
.bt-canvas-resize::after {
  content: "";
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  border-bottom-right-radius: 2px;
  opacity: .7;
}
.bt-canvas-resize:hover { background: rgba(0,0,0,.04); color: var(--text-primary); }

.bt-canvas-group {
  position: absolute;
  z-index: 0;
  min-width: 0;
  border: 1px dashed rgba(0,0,0,.15);
  border-radius: 24px;
  background: rgba(255,255,255,.35);
  box-shadow: 0 8px 24px rgba(0,0,0,.03);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}
.bt-canvas-group:is([data-selected="true"],[data-selected=""]) {
  border-color: #888;
  border-style: solid;
  box-shadow: 0 0 0 1px rgba(0,0,0,.15);
}
.bt-canvas-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  padding: 4px 12px 4px 14px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 18px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.bt-canvas-group-header:active { cursor: grabbing; }
.bt-canvas-group-header > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bt-canvas-group-header .bt-canvas-button { min-height: 26px; padding: 2px 7px; font-size: 11px; }
.bt-canvas-group-title { display: flex; align-items: center; gap: 3px; flex: 1 1 auto; min-width: 0; overflow: hidden; }
.bt-canvas-group-title > .bt-canvas-button:first-child {
  justify-content: flex-start;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: grab;
  touch-action: none;
  font-weight: 600;
}
.bt-canvas-group-title > .bt-canvas-button:last-child { flex: none; padding: 3px; min-width: 26px; }
.bt-canvas-group-name {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  max-width: 320px;
  height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--text-primary);
  border-radius: 7px;
  background: #ffffff;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  outline: none;
}

.bt-canvas-marquee {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  border: 1px solid rgba(0,0,0,.2);
  border-radius: 6px;
  background: rgba(0,0,0,.04);
}

.bt-canvas-dock {
  left: 50%;
  bottom: 16px;
  display: flex;
  align-items: flex-end;
  flex-wrap: nowrap;
  gap: 4px;
  width: max-content;
  max-width: min(860px, calc(100% - 240px));
  height: 72px;
  min-height: 72px;
  max-height: 72px;
  overflow: visible;
  padding: 6px 12px;
  transform: translateX(-50%);
  border-radius: 22px;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  user-select: none;
  box-sizing: border-box;
  isolation: isolate;
  z-index: 25;
  --dock-hover-scale: 1.09;
  --dock-motion-duration: 280ms;
  --dock-motion-ease: cubic-bezier(.2,.8,.2,1);
}
/* Stretch the glass independently so tab hit boxes and popover anchors stay fixed. */
.bt-canvas-dock::before {
  content: '';
  position: absolute;
  inset: -1px;
  z-index: -1;
  pointer-events: none;
  box-sizing: border-box;
  border-radius: inherit;
  border: 1px solid var(--glass-border, rgba(255,255,255,.85));
  background: var(--glass-floating, rgba(255,255,255,.78));
  box-shadow: var(--glass-shadow, 0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.95));
  -webkit-backdrop-filter: blur(24px);
  backdrop-filter: blur(24px);
  transform: scaleX(1);
  transform-origin: center;
}
@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference) {
  .bt-canvas-dock::before { transition: transform var(--dock-motion-duration) var(--dock-motion-ease); }
  .bt-dock-hover-region:is(:hover,[data-hover-open=true]) > .bt-canvas-dock::before { transform: scaleX(var(--dock-hover-scale)); }
}
.bt-canvas-dock::-webkit-scrollbar {
  display: none;
}
/* Reserve room for the original icons to rise without clipping or covering the canvas. */
.bt-dock-scroll-wrap {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  width: 100%;
  height: calc(100% + 64px);
  margin-top: -64px;
  padding: 0 4px;
  pointer-events: none;
}
.bt-dock-scroll-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  min-width: 100%;
  height: calc(100% - 64px);
  margin-top: 64px;
  pointer-events: auto;
}
.bt-dock-scroll-wrap::-webkit-scrollbar {
  display: none;
}
.bt-dock-dept-tab {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: var(--dock-item-width, 68px);
  min-width: 62px;
  height: 100%;
  padding: 4px 6px 6px;
  border-radius: 16px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 15px;
  letter-spacing: -0.005em;
  text-align: center;
  color: var(--text-primary, #262626);
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  cursor: grab;
  user-select: none;
  overflow: visible;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.bt-dock-dept-tab:active {
  cursor: grabbing;
}
.bt-dock-dept-tab:hover:not(.bt-dock-dept-tab--selected) {
  background: rgba(255, 255, 255, 0.45);
  border-color: rgba(255, 255, 255, 0.6);
}
.bt-dock-dept-tab--selected {
  background: rgba(0, 0, 0, 0.065) !important;
  border-color: rgba(0, 0, 0, 0.04) !important;
  color: var(--text-primary, #18181b) !important;
  box-shadow: none !important;
}
.bt-dock-dept-tab--selected:hover {
  background: rgba(0, 0, 0, 0.085) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}
.bt-dock-dept-tab--selected .bt-dock-dept-name {
  color: var(--text-primary, #18181b) !important;
  font-weight: 600 !important;
}
.bt-dock-dept-indicator {
  display: none !important;
}
.bt-dock-dept-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  line-height: 14px;
  transition: color 0.15s ease;
}
.bt-dock-dept-tab:hover .bt-dock-dept-name {
  color: var(--text-primary, #18181b);
}

.bt-canvas-dock-item {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 2px;
  width: var(--dock-item-width, 58px);
  min-width: 48px;
  padding: 4px 2px 2px;
  border-radius: 16px;
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
  letter-spacing: -0.005em;
  text-align: center;
  color: var(--text-primary);
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
  cursor: grab;
  -webkit-user-drag: element;
  user-select: none;
  overflow: visible;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.bt-canvas-dock-item:active {
  cursor: grabbing;
}
.bt-row[draggable="true"] {
  cursor: grab;
  -webkit-user-drag: element;
  user-select: none;
}
.bt-row[draggable="true"]:active {
  cursor: grabbing;
}
.bt-canvas-dock-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.45);
  border-color: rgba(255, 255, 255, 0.7);
}
.bt-dock-icon-wrap {
  width: var(--dock-icon-size, 36px);
  height: var(--dock-icon-size, 36px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,.08), 0 0 0 1px rgba(255,255,255,.9);
  background: transparent !important;
  background-color: transparent !important;
  transform: translateY(var(--dock-icon-lift,0px)) scale(var(--dock-icon-scale,1));
  transform-origin: bottom center;
  pointer-events: auto;
}
@media (prefers-reduced-motion:reduce) {
  .bt-canvas-dock .bt-dock-icon-wrap { transform: none; }
}
.bt-dock-icon-wrap > .bt-mark, .bt-dock-icon-wrap > .bt-cluster {
  flex: none;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bt-dock-icon-wrap svg {
  width: 100%;
  height: 100%;
}
.bt-dock-label-floating {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  padding: 3px 9px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary, #262626);
  white-space: pre;
  pointer-events: none;
  z-index: 40;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.bt-dock-label-floating[data-visible="true"] {
  opacity: 1;
  transform: translateX(-50%) translateY(-6px);
}
.bt-canvas-dock-item > span:not(.bt-mark):not(.bt-cluster):not(.bt-dock-label-floating) { max-width: 100%; }

/* Dock Collaboration Popover */
.bt-dock-popover {
  position: absolute;
  z-index: 70;
  width: 440px;
  max-width: calc(100vw - 32px);
  transform: translateX(-50%);
  border-radius: 20px;
  padding: 16px;
  background: var(--glass-window, rgba(255, 255, 255, 0.5)) !important;
  backdrop-filter: blur(var(--glass-blur, 50px)) saturate(180%) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur, 50px)) saturate(180%) !important;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.45)) !important;
  box-shadow: var(--glass-shadow, 0 4px 20px 0 rgba(0, 0, 0, 0.08)), 0 16px 40px -8px rgba(15, 23, 42, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.95) !important;
  color: var(--text-primary);
  font-family: inherit;
  pointer-events: auto;
  user-select: none;
  animation: bt-dock-popover-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes bt-dock-popover-in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.bt-dock-popover-arrow {
  display: none !important;
}

.bt-dock-popover-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.bt-dock-popover-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}

.bt-dock-popover-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bt-dock-popover-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.bt-dock-popover-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.bt-dock-dept-badge {
  font-size: 11px;
  font-weight: 500;
  color: #0284c7;
  background: rgba(14, 165, 233, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(14, 165, 233, 0.2);
  padding: 1.5px 7px;
  border-radius: 6px;
  flex: none;
}

.bt-dock-synergy-badge {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  padding: 1.5px 7px;
  border-radius: 6px;
  flex: none;
}

.bt-dock-popover-role-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-dock-popover-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.14s ease;
  flex: none;
}
.bt-dock-popover-close:hover {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.85);
  color: #0f172a;
}
.bt-dock-popover-close svg {
  width: 14px;
  height: 14px;
}

/* 协作 Agent 区域 - 无大灰色底框 */
.bt-dock-collab-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.bt-dock-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bt-dock-collab-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

/* 协作 Agent 卡片 - 毛玻璃质感 */
.bt-collab-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  background: rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.025), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: all 0.16s ease;
  min-width: 0;
}
.bt-collab-card:hover {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(14, 165, 233, 0.35);
  box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1), inset 0 1px 0 #ffffff;
  transform: translateY(-1px);
}

/* 临时 Bot 卡片弱化样式 - 轻柔毛玻璃虚线 */
.bt-collab-card--temp {
  background: rgba(255, 255, 255, 0.32) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px dashed rgba(14, 165, 233, 0.28) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6) !important;
}
.bt-collab-card--temp:hover {
  background: rgba(255, 255, 255, 0.58) !important;
  border-color: rgba(14, 165, 233, 0.45) !important;
  box-shadow: 0 2px 10px rgba(14, 165, 233, 0.06), inset 0 1px 0 #ffffff !important;
}

.bt-collab-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bt-collab-card-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bt-collab-card-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.bt-collab-card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-collab-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #64748b;
  flex: none;
}
.bt-badge-temp {
  background: rgba(14, 165, 233, 0.1) !important;
  color: #0284c7 !important;
  border: 1px solid rgba(14, 165, 233, 0.22) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
}

.bt-collab-card-role {
  font-size: 11px;
  color: #64748b;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-collab-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding-top: 5px;
  border-top: 1px solid rgba(255, 255, 255, 0.6);
}

.bt-collab-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  color: #475569;
  cursor: pointer;
  transition: all 0.12s ease;
}
.bt-collab-mini-btn:hover {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.3);
}
.bt-collab-more-btn {
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* 底部操作区：只保留打开对话和放到画布 - 毛玻璃质感 */
.bt-dock-popover-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.6);
}

.bt-dock-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.95);
  color: #334155;
  cursor: pointer;
  transition: all 0.14s ease;
}
.bt-dock-action-btn:hover {
  background: rgba(255, 255, 255, 0.88);
  color: #0f172a;
  border-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05), inset 0 1px 0 #ffffff;
}

.bt-dock-action-primary {
  background: rgba(14, 165, 233, 0.14) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  color: #0284c7 !important;
  border: 1px solid rgba(14, 165, 233, 0.32) !important;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  font-weight: 600 !important;
}
.bt-dock-action-primary:hover {
  background: rgba(14, 165, 233, 0.22) !important;
  color: #0369a1 !important;
  border-color: rgba(14, 165, 233, 0.45) !important;
  box-shadow: 0 3px 12px rgba(14, 165, 233, 0.2), inset 0 1px 0 #ffffff !important;
}

@media (prefers-color-scheme: dark) {
  .bt-dock-popover {
    background: rgba(20, 24, 33, 0.65) !important;
    backdrop-filter: blur(var(--glass-blur, 50px)) saturate(180%) !important;
    -webkit-backdrop-filter: blur(var(--glass-blur, 50px)) saturate(180%) !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
    box-shadow: 0 16px 40px -6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
  }
  .bt-collab-card {
    background: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .bt-collab-card:hover {
    background: rgba(30, 41, 59, 0.75);
    border-color: rgba(14, 165, 233, 0.35);
  }
  .bt-collab-card--temp {
    background: rgba(30, 41, 59, 0.3) !important;
    border-color: rgba(14, 165, 233, 0.25) !important;
  }
  .bt-collab-card--temp:hover {
    background: rgba(30, 41, 59, 0.55) !important;
  }
  .bt-collab-mini-btn {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: #94a3b8;
  }
  .bt-collab-mini-btn:hover {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border-color: rgba(14, 165, 233, 0.35);
  }
  .bt-dock-dept-tab--selected {
    background: rgba(255, 255, 255, 0.12) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
    color: #f1f5f9 !important;
  }
  .bt-dock-dept-tab--selected .bt-dock-dept-name {
    color: #f1f5f9 !important;
  }
  .bt-dock-action-btn {
    background: rgba(30, 41, 59, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.12);
    color: #cbd5e1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .bt-dock-action-btn:hover {
    background: rgba(30, 41, 59, 0.8);
    color: #f1f5f9;
  }
  .bt-dock-action-primary {
    background: rgba(14, 165, 233, 0.25) !important;
    border-color: rgba(14, 165, 233, 0.45) !important;
    color: #38bdf8 !important;
  }
  .bt-dock-action-primary:hover {
    background: rgba(14, 165, 233, 0.35) !important;
    color: #7dd3fc !important;
  }
  .bt-dock-popover-actions {
    border-top-color: rgba(255, 255, 255, 0.08);
  }
}

.bt-canvas-zoom {
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px;
}
.bt-canvas-zoom > output, .bt-canvas-zoom > span {
  min-width: 40px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
.bt-canvas-zoom .bt-canvas-button {
  min-width: 28px;
  min-height: 28px;
  padding: 4px;
  border-radius: 8px;
}

.bt-canvas-status {
  right: 16px;
  bottom: 72px;
  max-width: 260px;
  padding: 6px 12px;
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  pointer-events: none;
  background: var(--glass-floating);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
}
.bt-canvas-status:empty { display: none; }

.bt-canvas-empty {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: max-content;
  max-width: calc(100% - 40px);
  padding: 24px 28px;
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  background: var(--glass-floating);
  box-shadow: var(--glass-shadow);
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-primary);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
}
.bt-canvas-empty > p { margin: 0; max-width: 34ch; color: var(--text-secondary); font-size: 13px; line-height: 20px; }
.bt-canvas-empty > :is(strong,h2) { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: -0.015em; color: var(--text-primary); }

.bt-canvas-session {
  --bt-placeholder: "Message";
  --bt-first-sep: none;
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.bt-canvas-session-error {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.bt-canvas-content > .bt-canvas-status {
  position: static;
  align-self: center;
  max-width: 100%;
  margin: auto;
  padding: 16px;
  background: none;
  border: 0;
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.bt-canvas [data-conversation-content] {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: transparent !important;
}
.bt-canvas [data-conversation-content] > [data-conversation-scroll] {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: transparent;
  padding-bottom: 18px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,.15) transparent;
}
.bt-canvas .bt-group-failure{display:flex;flex-wrap:wrap;align-items:center;gap:7px 10px;padding:8px 10px;color:#b42318;background:rgba(254,242,242,.82);border:1px solid rgba(248,113,113,.28);border-radius:10px}
.bt-canvas .bt-group-failure-note{flex-basis:100%;font-size:11px;color:#9f1239}
.bt-canvas .bt-group-failure-actions{display:inline-flex;gap:6px}
.bt-canvas .bt-group-failure-actions .bt-soft{padding:3px 8px;border:1px solid rgba(180,35,24,.22);border-radius:7px;background:rgba(255,255,255,.72);color:#9f1239;cursor:pointer;font:inherit;font-size:11px}
.bt-canvas .bt-group-failure-actions .bt-soft:hover{background:#fff}
.bt-canvas [data-composer-seat] {
  position:relative;
  z-index:2;
  flex:none;
  margin-top: auto;
  background: transparent !important;
  border-top: 1px solid var(--divider) !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
.bt-canvas [data-composer-card] {
  background: rgba(255, 255, 255, 0.45) !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  backdrop-filter: blur(16px) !important;
}
.bt-canvas [data-composer-input] {
  color: var(--text-primary) !important;
  caret-color: var(--text-primary) !important;
}
.bt-canvas .bt-bubble {
  background: rgba(255, 255, 255, 0.35) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.35) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04) !important;
}
.bt-canvas-session [class*="_scroll"]:has(> [class*="_column"]) { padding-top: 12px !important; }
.bt-canvas-session [class*="_scroll"] > [class*="_column"]::before { margin-top: 0; }
.bt-canvas-session [data-conversation-content] { --dsh-chat-content-width: min(960px, 100%); }

.bt-canvas-launcher {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-primary);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.04);
  transition: background-color .14s ease, color .14s ease, border-color .14s ease, transform .12s cubic-bezier(0.16,1,0.3,1);
}
.bt-canvas-launcher > svg { display: block; width: 18px; height: 18px; }
.bt-canvas-launcher > span { display: flex; align-items: center; justify-content: center; font-size: 20px; }
.bt-canvas-launcher:hover { background: #ffffff; color: var(--text-primary); }
.bt-canvas-launcher:active { transform: scale(0.96); }
.bt-canvas-launcher:focus-visible { outline: 2px solid #888; outline-offset: 2px; }

@container bt-canvas (max-width:900px){
  .bt-canvas-dock{bottom:76px;max-width:calc(100% - 24px);--dock-hover-scale:1}
}
@media(max-width:900px){
  .bt-canvas-dock{bottom:76px;max-width:calc(100% - 24px);--dock-hover-scale:1}
}
@container bt-canvas (max-width:640px){
  .bt-canvas-toolbar{top:12px;left:12px;right:12px;width:auto;max-width:none;gap:3px;padding:5px;border-radius:12px}
  .bt-canvas-toolbar>strong{flex-basis:100%;padding:2px 6px}
  .bt-canvas-toolbar>span[role=separator]{display:none}
  .bt-canvas-toolbar .bt-canvas-button{padding:5px 8px;font-size:11px}
  .bt-canvas-dock{left:50%;right:auto;bottom:76px;max-width:calc(100% - 24px);min-height:84px;max-height:112px;padding:6px 8px;border-radius:20px}
  .bt-canvas-dock-item{width:52px;max-width:60px;padding:4px 2px 2px;font-size:10px}
  .bt-canvas-zoom{right:12px;bottom:12px;padding:4px;border-radius:10px}
  .bt-canvas>.bt-canvas-status{display:none}
  .bt-canvas-window-header{gap:8px;padding:8px 10px}
  .bt-canvas-window-actions{gap:2px}
}
@media(max-width:640px){
  .bt-canvas-toolbar{top:12px;left:12px;right:12px;width:auto;max-width:none;gap:3px;padding:5px;border-radius:12px}
  .bt-canvas-toolbar>strong{flex-basis:100%;padding:2px 6px}
  .bt-canvas-toolbar>span[role=separator]{display:none}
  .bt-canvas-toolbar .bt-canvas-button{padding:5px 8px;font-size:11px}
  .bt-canvas-dock{left:50%;right:auto;bottom:76px;max-width:calc(100% - 24px);min-height:84px;max-height:112px;padding:6px 8px;border-radius:20px}
  .bt-canvas-dock-item{width:52px;max-width:60px;padding:4px;font-size:10px}
  .bt-canvas-zoom{right:12px;bottom:12px;padding:4px;border-radius:10px}
  .bt-canvas>.bt-canvas-status{display:none}
  .bt-canvas-window-header{gap:8px;padding:8px 10px}
  .bt-canvas-window-actions{gap:2px}
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
  .bt-canvas-dock::before{background:#f8f8f8}

  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:#f8f8f8}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent!important}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:#f8f8f8!important}
}
@media(prefers-reduced-transparency:reduce){
  .bt-canvas-dock::before{background:#f8f8f8;-webkit-backdrop-filter:none;backdrop-filter:none}

  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:#f8f8f8;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent!important}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:#f8f8f8!important;-webkit-backdrop-filter:none;backdrop-filter:none}
}
@media(prefers-reduced-motion:reduce){
  .bt-canvas,.bt-canvas *,.bt-canvas *::before,.bt-canvas *::after,.bt-canvas-launcher{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media(forced-colors:active){
  .bt-canvas-dock{--dock-hover-scale:1}
  .bt-canvas-dock::before{background:Canvas;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}

  .bt-canvas{--bt-ink:CanvasText;--bt-ink-2:CanvasText;--bt-ink-3:CanvasText;--bt-card:Canvas;--bt-main:Canvas;--bt-accent:Highlight;background:Canvas;color:CanvasText}
  .bt-canvas::before,.bt-canvas::after{display:none}
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty){background:Canvas;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-window:is([data-active="true"],[data-active=""],[data-selected="true"],[data-selected=""]){outline:none}
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

/* Windows-style Canvas Context Menu - matching other canvas frosted-glass popups */
.bt-canvas-menu {
  min-width: 210px;
  max-width: 270px;
  padding: 8px;
  background: var(--glass-window, rgba(255, 255, 255, 0.5)) !important;
  backdrop-filter: blur(var(--glass-blur, 50px)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur, 50px)) !important;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.45)) !important;
  border-radius: 18px !important;
  box-shadow: var(--glass-shadow, 0 4px 20px 0 rgba(0, 0, 0, 0.08)) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none;
  z-index: 10000;
  animation: bt-canvas-menu-pop 0.14s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu {
    background: rgba(36, 36, 40, 0.65) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 10px 28px -4px rgba(0, 0, 0, 0.35) !important;
  }
}
@keyframes bt-canvas-menu-pop {
  from { opacity: 0; transform: scale(0.96) translateY(-2px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.bt-canvas-menu-item {
  box-sizing: border-box;
  display: flex !important;
  align-items: center;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  gap: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary, #262626);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, transform 0.1s ease;
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-item {
    color: #f0f0f0;
  }
}
.bt-canvas-menu-item:hover,
.bt-canvas-menu-item.is-active {
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-item:hover,
  .bt-canvas-menu-item.is-active {
    background: rgba(255, 255, 255, 0.12);
  }
}
.bt-canvas-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-secondary, #757575);
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-icon { color: #aaa; }
}
.bt-canvas-menu-item:hover .bt-canvas-menu-icon {
  color: var(--text-primary, #111);
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-item:hover .bt-canvas-menu-icon { color: #fff; }
}
.bt-canvas-menu-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bt-canvas-menu-arrow {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary, #888);
  padding-left: 8px;
}
.bt-canvas-menu-divider {
  height: 1px;
  margin: 5px 6px;
  background: var(--divider, rgba(0, 0, 0, 0.06));
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-divider {
    background: rgba(255, 255, 255, 0.09);
  }
}
.bt-canvas-menu-parent {
  position: relative;
}
.bt-canvas-menu-submenu {
  position: absolute;
  top: -4px;
  left: calc(100% + 6px);
  min-width: 190px;
  padding: 8px;
  background: var(--glass-window, rgba(255, 255, 255, 0.5)) !important;
  backdrop-filter: blur(var(--glass-blur, 50px)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur, 50px)) !important;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.45)) !important;
  border-radius: 18px !important;
  box-shadow: var(--glass-shadow, 0 4px 20px 0 rgba(0, 0, 0, 0.08)) !important;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  animation: bt-canvas-menu-pop 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.bt-canvas-menu-submenu.is-rtl {
  left: auto;
  right: calc(100% + 6px);
}
@media (prefers-color-scheme: dark) {
  .bt-canvas-menu-submenu {
    background: rgba(36, 36, 40, 0.65) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 10px 28px -4px rgba(0, 0, 0, 0.35) !important;
  }
}

/* 团队面板内联搜索框 */
.bt-team-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 14px 10px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  animation: bt-veil-in 0.16s ease-out;
}

.bt-team-search-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.bt-team-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 18px;
  padding: 0;
}

.bt-team-search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}

.bt-team-search-clear,
.bt-team-search-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  line-height: 1;
}

.bt-team-search-clear:hover,
.bt-team-search-close:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.05);
}

.bt-team-search-clear {
  font-size: 16px;
  width: 18px;
  height: 18px;
}

.bt-team-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.bt-team-global-search-btn {
  margin: 8px 12px 12px;
  padding: 8px 12px;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  display: block;
}

.bt-round-active {
  background: rgba(255, 255, 255, 0.95) !important;
  color: #1a73e8 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
}

/* 当处于无限画布模式时，将 .bt-pane 优化为居中磨砂玻璃 Modal 弹窗 */
body:has(.canvas-viewport) .bt-pane {
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 100 !important;
  padding: 20px !important;
  box-sizing: border-box !important;
}

body:has(.canvas-viewport) .bt-pane > .bt-newchat,
body:has(.canvas-viewport) .bt-pane > .bt-create-card,
body:has(.canvas-viewport) .bt-pane > div {
  width: min(560px, 92vw) !important;
  max-height: min(700px, 88vh) !important;
  background: rgba(255, 255, 255, 0.96) !important;
  backdrop-filter: blur(30px) !important;
  -webkit-backdrop-filter: blur(30px) !important;
  border-radius: 24px !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.16) !important;
  overflow-y: auto !important;
}

/* 顶部全局搜索栏 */
.bt-canvas-global-search {
  display: none !important;
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  pointer-events: auto;
}

.bt-canvas-search-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 16px 0 16px;
  background: var(--glass-floating, rgba(255, 255, 255, 0.65)) !important;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.85)) !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.06) !important;
  backdrop-filter: blur(var(--glass-blur, 24px)) !important;
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) !important;
  color: var(--text-secondary) !important;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  min-width: 320px;
}

.bt-canvas-search-pill:hover {
  background: rgba(255, 255, 255, 0.9) !important;
  color: var(--text-primary) !important;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1) !important;
  transform: translateY(-1px);
}

.bt-canvas-search-icon {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.bt-canvas-search-label {
  flex: 1;
  text-align: left;
  font-size: 13.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-canvas-search-pill:hover .bt-canvas-search-label {
  color: var(--text-primary);
}

.bt-canvas-search-kbd {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  letter-spacing: 0.5px;
}

/* 融球建群交互效果 */
.bt-metaball-svg {
  filter: drop-shadow(0 6px 16px rgba(20, 35, 60, 0.08));
}

.bt-metaball-badge {
  position: absolute;
  z-index: 45;
  pointer-events: none;
  box-sizing: border-box;
  max-width: calc(100% - 16px);
  white-space: normal;
  overflow-wrap: anywhere;
  background: #E1FF67 !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  color: #000000 !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  padding: 6px 14px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  animation: bt-merge-badge-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes bt-merge-badge-pop {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.bt-canvas-merge-target .bt-mark {
  outline: 3px solid #3878fa !important;
  box-shadow: 0 0 32px rgba(56, 120, 250, 0.5) !important;
  animation: none !important;
}

@keyframes bt-merge-target-pulse {
  from {
    transform: scale(1.02);
  }
  to {
    transform: scale(1.08);
  }
}
`
