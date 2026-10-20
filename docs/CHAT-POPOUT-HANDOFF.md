# 对话拖出画布交互开发说明

本增量基于已交付的 `QibitAI-UI源码与开发测试交接-0.1.46-fc02507-ui20261019.zip` 中 `source/QibitAI-ui-0.1.46`。移除侧栏对话的 **Pop out to canvas** 按钮，改为拖动当前对话的标题或正文空白处，在画布内松手后打开同一会话的独立窗口。单聊和群聊共用实现。

## 代码入口

| 文件 | 职责及开发修改位置 |
| --- | --- |
| `ds-bot/src/client/chat-popout.js` | 独立交互模块。拖动触发、可拖区域、取消、轻量预览、点击保护、快捷键和一次性窗口定位均在此处。 |
| `ds-bot/src/client/sidebar.js` | 仅负责接入 hook、移除按钮，以及先卸载嵌入编辑器，再打开原会话。 |
| `ds-bot/src/client/canvas-workspace.js` | 新浮窗读取落点；已有浮窗接收重定位事件，恢复原目标会话并取消待关闭状态。 |
| `ds-bot/test/chat-popout.test.js` | 独立模块的手势、取消、选择文本、触屏、键盘、定位和资源清理测试。 |
| `ds-bot/test/sidebar-team-chat.test.js` | 侧栏卸载顺序、会话身份、切换和关闭计时器回归。 |
| `ds-bot/test/canvas-workspace.test.js` | 新窗和已有窗、任务群内导航重置、焦点、缩放及画布收缩回归。 |

`client.js` 是构建产物。请修改上面的源文件后重新构建。后台、权限、成员、消息、会话 ID 与头像世界坐标未修改。

## 独立模块接口

```js
const handlers = useChatPopoutDrag({ enabled, id, onPopout })
// handlers: onPointerDownCapture / onClickCapture / onKeyDownCapture
// onPopout({ id, rect, bounds })，rect/bounds 均为浏览器 CSS 像素坐标
stageChatPopout(id, rect, bounds, view)
takeChatPopout(id)
// CHAT_POPOUT_EVENT: bt:chat-popout
// CHAT_POPOUT_CSS: 仅侧栏对话标题的鼠标样式和触屏设置
```

`stageChatPopout` 先记录再通知；`takeChatPopout` 只消费一次。保存的是窗口尺寸和相对画布中心的偏移，不写业务数据、不除画布 zoom、不移动原头像。位置与尺寸由已有 `fitChat` 限制在画布内；落点靠边时会向内收。

调整拖动距离：在 `onPointerDownCapture` 内的 `move` 修改当前 **6 CSS px** 阈值，并同步测试。调整可拖区域：修改 `interactive` 和 `textAtPoint`；禁止拖动的自定义控件可加 `data-no-chat-drag`。调整拖动预览：修改创建 `.bt-chat-popout-ghost` 的样式；该预览不复制真实编辑器。调整拖动后点击保护：查看 `suppressPointerClick`，当前最长 **600 ms**，新的一次按下会立即撤销保护，键盘点击放行。

## 交互规则

- 普通点击和不足 6 px 的移动不弹出。鼠标可从标题文字或正文非交互空白开始拖动；正文消息文字仍可选择。
- 输入框、按钮、链接、附件、图片、滚动条、尺寸调节柄和自定义禁拖控件不触发。已有文字选区时，先点击空白取消选区再拖动。
- 在画布内松手打开原会话；画布外或其他弹窗区域松手取消。Escape、失焦、滚动、切换会话、窗口尺寸改变或指针中断都会清理手势。
- 触屏从标题拖动；正文保持正常滚动。对话区域获得焦点后，Windows 用 Ctrl+Shift+Enter，Mac 用 Command+Shift+Enter；输入框和中文输入法组合输入不接管此快捷键。
- 拖出先用 `flushSync` 卸载侧栏编辑器，再打开原会话。请保留该顺序，避免双编辑器竞争同一 Session。任务群、最大化和调整窗口尺寸仍走原有实现。

## 接入和启动

这是上一份完整源码包的增量，不是独立运行的网页。解压到单独目录，先阅读本说明；在上一份完整包的源码根目录对 `chat-popout.patch` 执行 `git apply --check`，核对无冲突后再应用。如果功能侧已继续开发，请按上述两个接入点合并，避免整文件覆盖新功能。`changed-files` 保留本次文件完整副本，供对照。

在合并后的 `ds-bot` 目录中执行（Windows PowerShell 与 Mac 均可）：

```sh
npm ci
npm run harness
npm run build
node scripts/build-client.mjs --check
node --import ./test/harness-resolve.mjs --test test/chat-popout.test.js test/sidebar-team-chat.test.js test/canvas-workspace.test.js test/chat-geometry.test.js test/canvas-session.test.js test/floating-team.test.js test/canvas-state.test.js
npm run lint
```

`npm run harness` 仅准备测试依赖。页面仍通过功能侧兼容的 DSH 宿主启动，遵循上一份完整包 `00_START_HERE.md` 的宿主及 Windows/WSL 要求；不要把 `npm run build` 当成页面启动命令。已在桌面宿主运行的插件需替换构建结果并刷新或按宿主流程重新加载。不要使用真实用户数据做重置测试。

## 优先验收

1. 单聊、群聊各测一次标题和正文空白拖出。确认按钮消失，标题、成员和原消息一致，没有新建另一条会话。
2. 确认输入、文字选择、滚动、附件按钮和关闭按钮仍可用；轻点不弹出，拖动输入框不弹出。
3. 拖动后按 Escape、拖出画布范围、拖动期间切换另一会话，确认取消且不误开旧会话。
4. 原会话已在画布打开时再拖出，确认复用原窗并移动到新位置。若该窗先前导航到了任务群，确认重回本次拖出的目标会话。
5. 宿主联调重点：输入未发送草稿、已有附件，再拖出，确认内容保留；中文输入法组合输入、正在回复时、刷新重开分别复核。
6. Windows Chrome/Edge 100% 和 125% 缩放、小窗口、触屏标题拖动，以及两个系统的快捷键。

验证记录：新版源码 133 项定向测试通过，构建一致性通过，lint 退出码为 0（有现存警告和测试 fixture 提示）。当前 Mac Chrome 的 3081 旧版预览实际验证了群聊标题及正文空白拖出、按钮移除和原群聊继续打开。新版 0.1.46 在真实桌面宿主、Windows、未发送草稿/附件和 IME 的完整验收仍由功能侧按上表执行；未将定向测试标为全套测试。

本增量未覆盖上一份源码压缩包，也未更新上一份安装 tgz；若发安装包，需用合并后的源码重新构建打包。本机 3081 预览已单独接入同一交互。
