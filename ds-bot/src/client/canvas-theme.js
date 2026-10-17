// Shared by the canvas and its floating/portaled panels; never applied to the host body.
const LIGHT = `
  --bt-ink:#262626;--bt-ink-2:#62666b;--bt-ink-3:#777c82;
  --bt-card:#f8f8f9;--bt-main:#fff;--bt-sidebar:#f6f6f7;--bt-bubble:rgba(0,0,0,.04);
  --bt-line:rgba(30,35,40,.08);--bt-line-2:rgba(30,35,40,.16);--bt-line-weak:rgba(30,35,40,.05);
  --bt-hover:rgba(255,255,255,.72);--bt-active:rgba(255,255,255,.94);
  --bt-accent:#247a69;--bt-accent-ink:#fff;--bt-user:#303438;--bt-user-ink:#fff;
  --bt-tag-bg:rgba(30,35,40,.05);--bt-tag-ink:#62666b;
  --bt-canvas-background:linear-gradient(180deg,#e9e9eb 0%,#e0e1e3 50%,#d5d7da 100%);
  --bt-canvas-glass:rgba(255,255,255,.54);--bt-canvas-chrome:rgba(255,255,255,.66);
  --bt-canvas-border:rgba(255,255,255,.8);--bt-canvas-button:rgba(255,255,255,.86);
  --bt-canvas-shadow:0 8px 28px -12px rgba(28,32,40,.16),inset 0 1px 0 rgba(255,255,255,.9);
  --bt-canvas-chat:rgba(248,249,250,.78);--bt-canvas-veil:rgba(80,86,98,.1);
  --bt-canvas-chat-shadow:0 24px 70px -24px rgba(28,32,40,.24),inset 0 1px 0 rgba(255,255,255,.95);
  --bt-canvas-label-shadow:0 1px 4px rgba(255,255,255,.8);--bt-canvas-error:#b23930;
`
const DARK = `
  --bt-ink:#f1f2f4;--bt-ink-2:#b5b9c2;--bt-ink-3:#969ca8;
  --bt-card:#292d35;--bt-main:#22262e;--bt-sidebar:#252932;--bt-bubble:rgba(255,255,255,.06);
  --bt-line:rgba(255,255,255,.09);--bt-line-2:rgba(255,255,255,.2);--bt-line-weak:rgba(255,255,255,.06);
  --bt-hover:rgba(255,255,255,.09);--bt-active:rgba(255,255,255,.15);
  --bt-accent:#86cbbb;--bt-accent-ink:#17382f;--bt-user:#ebedf1;--bt-user-ink:#22262e;
  --bt-tag-bg:rgba(255,255,255,.08);--bt-tag-ink:#b5b9c2;
  --bt-canvas-background:linear-gradient(180deg,#30343d 0%,#262a33 50%,#20242c 100%);
  --bt-canvas-glass:rgba(45,49,59,.68);--bt-canvas-chrome:rgba(49,54,65,.76);
  --bt-canvas-border:rgba(255,255,255,.15);--bt-canvas-button:rgba(255,255,255,.09);
  --bt-canvas-shadow:0 8px 28px -12px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);
  --bt-canvas-chat:rgba(35,39,48,.86);--bt-canvas-veil:rgba(0,0,0,.16);
  --bt-canvas-chat-shadow:0 24px 70px -24px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.1);
  --bt-canvas-label-shadow:0 1px 4px rgba(0,0,0,.45);--bt-canvas-error:#ffada2;
`

export const canvasTheme = selector => `${selector}{${LIGHT}}body[data-ds-dark-theme] ${selector}{${DARK}}`
