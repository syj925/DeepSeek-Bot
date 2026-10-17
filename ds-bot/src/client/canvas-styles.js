
export const canvasStyles = `
:root {
  /* 背景：从上浅到下深 */
  --canvas-background: linear-gradient(
    180deg,
    #e7e7e7 0%,
    #dedede 50%,
    #d4d4d4 100%
  );

  /* 乳白磨砂 */
  --glass-window: rgba(255, 255, 255, 0.5);
  --glass-floating: rgba(255, 255, 255, 0.5);
  --glass-border: rgba(255, 255, 255, 0.45);
  --glass-blur: 50px;
  --glass-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.08);

  --text-primary: #262626;
  --text-secondary: #757575;
  --divider: rgba(0, 0, 0, 0.08);
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
.bt-canvas-window[data-mode=card][data-kind=bot] {
  min-width: 0;
  min-height: 0;
  overflow: visible;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  cursor: grab;
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
}
.bt-canvas-avatar-open {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 80px;
  min-width: 0;
  height: 76px;
  padding: 8px 12px;
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
  border-radius: 50%;
  box-shadow: 0 4px 14px rgba(0,0,0,.08), 0 0 0 3px rgba(255,255,255,.9);
  background: transparent !important;
  background-color: transparent !important;
  transition: box-shadow .16s cubic-bezier(0.16,1,0.3,1), transform .16s cubic-bezier(0.16,1,0.3,1);
}
.bt-canvas-avatar-open:hover > .bt-mark {
  box-shadow: 0 6px 18px rgba(0,0,0,.12), 0 0 0 4px rgba(255,255,255,1);
  transform: translateY(-2px);
}
.bt-canvas-window[data-mode=card][data-kind=bot]:is([data-active=true],[data-active=""]) .bt-canvas-avatar-open > .bt-mark {
  box-shadow: 0 6px 20px rgba(0,0,0,.14), 0 0 0 3px #10a37f;
}
.bt-canvas-window[data-mode=card][data-kind=bot]:is([data-selected=true],[data-selected=""]) .bt-canvas-avatar-open > .bt-mark {
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

.bt-canvas-window[data-kind=room][data-mode=card] .bt-canvas-window-header{padding-top:10px;padding-bottom:8px}
.bt-canvas-window[data-kind=room][data-mode=card] .bt-canvas-compact>footer{padding-top:2px}
.bt-canvas-window[data-kind=room][data-mode=card] .bt-canvas-open-conversation{background:#e3eee9;border-color:transparent;color:#256754}
.bt-canvas-window[data-kind=room][data-mode=card] .bt-canvas-open-conversation:hover{background:#d7e8df}
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
  height: var(--dock-height, 72px);
  min-height: 72px;
  max-height: 112px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px 12px;
  transform: translateX(-50%);
  scrollbar-width: none;
  overscroll-behavior: contain;
  border-radius: 22px;
  border: 1px solid var(--glass-border, rgba(255,255,255,.85));
  background: var(--glass-floating, rgba(255,255,255,.78));
  box-shadow: var(--glass-shadow, 0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.95));
  -webkit-backdrop-filter: blur(24px);
  backdrop-filter: blur(24px);
  user-select: none;
  box-sizing: border-box;
}
.bt-canvas-dock::-webkit-scrollbar {
  display: none;
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
  transform:scale(var(--dock-icon-scale,1));
  transform-origin:bottom center;
}
.bt-canvas-dock-item:hover .bt-dock-icon-wrap {
  transform: translateY(-2px) scale(var(--dock-icon-scale,1));
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
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 16px 40px -6px rgba(15, 23, 42, 0.18), 0 4px 16px -2px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.95);
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
  position: absolute;
  bottom: -6px;
  width: 12px;
  height: 12px;
  background: inherit;
  border-right: 1px solid rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid rgba(255, 255, 255, 0.85);
  transform: translateX(-50%) rotate(45deg);
  box-shadow: 2px 2px 4px rgba(15, 23, 42, 0.04);
}

.bt-dock-popover-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
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
  justify-content: space-between;
  gap: 8px;
}

.bt-dock-popover-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.bt-dock-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.bt-dock-status-available {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.bt-dock-status-working {
  background: rgba(14, 165, 233, 0.14);
  color: #0284c7;
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.bt-dock-status-waiting {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.bt-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

.bt-pulse-available {
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
  animation: bt-pulse 2s infinite;
}

.bt-pulse-working {
  background: #0ea5e9;
  box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.6);
  animation: bt-pulse 1.4s infinite;
}

.bt-pulse-waiting {
  background: #f59e0b;
  box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  animation: bt-pulse 1.4s infinite;
}

@keyframes bt-pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.6); }
  70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(14, 165, 233, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(14, 165, 233, 0); }
}

.bt-dock-role-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}

/* Supervision Topology Section */
.bt-dock-supervision-section {
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.bt-dock-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.bt-dock-subagents-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.bt-dock-subagent-card {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 5px 8px;
  min-width: 0;
}

.bt-dock-subagent-card.bt-subagent-working {
  border-color: rgba(14, 165, 233, 0.35);
  background: rgba(14, 165, 233, 0.05);
}

.bt-dock-subagent-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.bt-dock-subagent-name {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.bt-dock-subagent-state {
  font-size: 10px;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-dock-subagent-more {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.bt-dock-subagents-empty {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  padding: 4px 0;
}

/* Department Agents Showcase */
.bt-dock-dept-section {
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.bt-dock-dept-title-tag {
  font-size: 11px;
  font-weight: 600;
  color: #0284c7;
  background: rgba(14, 165, 233, 0.1);
  padding: 2px 7px;
  border-radius: 6px;
  margin-left: 6px;
}

.bt-dock-dept-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 3px 0 8px 0;
}

.bt-dock-dept-agents-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.bt-dock-agent-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  transition: all 0.18s ease;
  cursor: grab;
}

.bt-dock-agent-card:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(14, 165, 233, 0.35);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);
  transform: translateY(-1px);
}

.bt-dock-agent-card-top {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.bt-dock-agent-card-meta {
  flex: 1 1 auto;
  min-width: 0;
}

.bt-dock-agent-card-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bt-dock-agent-card-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-dock-agent-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
  flex: none;
}

.bt-dock-agent-badge.bt-badge-lead {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}

.bt-dock-agent-card-role {
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bt-dock-agent-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 3px;
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.bt-dock-agent-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.035);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.bt-dock-agent-mini-btn:hover {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.3);
}

/* Dock item department tag */
.bt-dock-item-name {
  font-size: 12px;
  font-weight: 600;
}

.bt-dock-dept-tag {
  font-size: 9.5px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  letter-spacing: 0.2px;
}

/* Supervision Chain for Sub-Agent */
.bt-dock-supervision-chain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 10px;
}

.bt-dock-chain-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.bt-dock-chain-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  flex: 1 1 auto;
  text-align: center;
}

.bt-dock-chain-arrow-text {
  font-size: 10px;
  font-weight: 600;
  color: #0284c7;
  white-space: nowrap;
}

.bt-dock-chain-arrow-icon {
  font-size: 12px;
  color: #0284c7;
}

/* Room chain */
.bt-dock-room-chain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}

.bt-dock-room-admin-tag {
  font-weight: 600;
  color: var(--text-primary);
}

/* Collaboration Pipeline */
.bt-dock-pipeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.bt-dock-step {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
}

.bt-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.05);
}

.bt-step-done .bt-step-icon {
  background: rgba(16, 185, 129, 0.16);
  color: #059669;
}

.bt-step-active {
  color: #0284c7;
  font-weight: 600;
}

.bt-step-active .bt-step-icon {
  background: rgba(14, 165, 233, 0.18);
  color: #0284c7;
}

.bt-step-connector {
  flex: 1 1 auto;
  height: 2px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 1px;
}

.bt-step-connector.bt-conn-active {
  background: linear-gradient(90deg, #10b981, #0ea5e9);
}

/* Current Task Preview */
.bt-dock-task-preview {
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary, #475569);
  margin-bottom: 12px;
  word-break: break-word;
}

.bt-dock-task-highlight {
  font-weight: 600;
  color: #0284c7;
}

/* Actions footer */
.bt-dock-popover-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.bt-dock-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
}

.bt-dock-action-primary {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.3);
}

.bt-dock-action-primary:hover {
  background: rgba(14, 165, 233, 0.2);
}

@media (prefers-color-scheme: dark) {
  .bt-dock-popover {
    background: rgba(24, 28, 38, 0.94);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 40px -6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .bt-dock-popover-arrow {
    background: rgba(24, 28, 38, 0.94);
    border-right-color: rgba(255, 255, 255, 0.12);
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }
  .bt-dock-supervision-section,
  .bt-dock-supervision-chain,
  .bt-dock-room-chain,
  .bt-dock-task-preview,
  .bt-dock-dept-section {
    background: rgba(255, 255, 255, 0.035);
    border-color: rgba(255, 255, 255, 0.08);
  }
  .bt-dock-subagent-card,
  .bt-dock-agent-card {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.08);
  }
  .bt-dock-agent-card:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(14, 165, 233, 0.4);
  }
  .bt-dock-agent-mini-btn {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: var(--text-secondary);
  }
  .bt-dock-agent-mini-btn:hover {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
  }
  .bt-dock-dept-tag {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
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
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,.15) transparent;
}
.bt-canvas [data-composer-seat] {
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
  .bt-canvas-dock{bottom:76px;max-width:calc(100% - 24px)}
}
@media(max-width:900px){
  .bt-canvas-dock{bottom:76px;max-width:calc(100% - 24px)}
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
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:#f8f8f8}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent!important}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:#f8f8f8!important}
}
@media(prefers-reduced-transparency:reduce){
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty,.bt-canvas-group,.bt-canvas-avatar-tools){background:#f8f8f8;-webkit-backdrop-filter:none;backdrop-filter:none}
  .bt-canvas-window[data-mode=card][data-kind=bot]{background:transparent!important}
  .bt-canvas :is([data-composer-seat],[data-composer-card]){background:#f8f8f8!important;-webkit-backdrop-filter:none;backdrop-filter:none}
}
@media(prefers-reduced-motion:reduce){
  .bt-canvas,.bt-canvas *,.bt-canvas *::before,.bt-canvas *::after,.bt-canvas-launcher{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media(forced-colors:active){
  .bt-canvas{--bt-ink:CanvasText;--bt-ink-2:CanvasText;--bt-ink-3:CanvasText;--bt-card:Canvas;--bt-main:Canvas;--bt-accent:Highlight;background:Canvas;color:CanvasText}
  .bt-canvas::before,.bt-canvas::after{display:none}
  .bt-canvas :is(.bt-canvas-toolbar,.bt-canvas-window,.bt-canvas-dock,.bt-canvas-zoom,.bt-canvas-status,.bt-canvas-empty){background:Canvas;border-color:CanvasText;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
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
  filter: drop-shadow(0 8px 24px rgba(56, 120, 250, 0.35));
}

.bt-metaball-badge {
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
    transform: translate(-50%, -40%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.bt-canvas-merge-target {
  outline: 3px solid #3878fa !important;
  box-shadow: 0 0 32px rgba(56, 120, 250, 0.5) !important;
  animation: bt-merge-target-pulse 0.75s ease-in-out infinite alternate !important;
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
