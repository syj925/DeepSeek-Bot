# QibitAI 0.1.70 · 给 UI 设计师及其 AI 的交接文档

交接日期：2026-10-22。仓库：https://github.com/syj925/DeepSeek-Bot 。插件版本：`ds-bot 0.1.70`。功能基准提交：`db6450d524b2176654d9884f22c56c184c01ab42`；其后本轮交接提交仅更新文档，最终包提交见 ZIP 文件名及 GitHub。

## 1. 这次如何分工

UI 设计师负责界面视觉与交互设计，功能侧负责接回真实业务能力。以设计师确认稿为视觉依据：接手 AI 不擅自改成自己的风格，功能侧合并时也不擅自重画设计师的页面。若设计与现有接口冲突，记录具体冲突和所需接口，由双方协调。

本包提供实际运行的画布与协作插件源码。请直接在现有组件上迭代，不用模拟员工、假任务、假消息或静态预览覆盖真实界面。团队、权限、上下文、模型分配、消息协议、产物索引等底层逻辑仍用本包实现。

本包不是 Electron 宿主源码，也不是 Windows 安装器。包含前端、插件后端、生成的 client.js、素材、Skill、测试与开发文档；不含个人会话、密钥、依赖目录和测试运行数据。

## 2. 给接手 AI 的开工指令

> 先阅读根目录 AGENTS.md、UI-HANDOFF.md、本文件和 ds-bot/package.json。以这份 0.1.70 源码建立独立 UI 分支，记录精确基准提交。按设计师确认稿修改真实界面，保留已有 actions、会话身份、数据订阅、错误恢复和持久化行为。纯 UI 工作不改 src/host、模型路由、权限或任务上下文，不修改 DSH 宿主或安装目录内部文件。需要新数据时列出接口需求，不能用假数据伪装成功。修改 src/client 后重新生成 client.js，运行构建一致性、测试和 lint。只使用隔离 mock 测试环境。回传源码差异、截图/录屏、验收结果和未解决问题；不要用历史交接包整体覆盖本版。

ZIP 不含 .git；可以自行 git init 建立 UI 工作分支，记录来源提交。使用仓库克隆时从交付提交建立分支，避免未经检查直接切换到其他版本。不得强推覆盖功能主干。

## 3. 本版必须保留的行为

| 模块 | 保留要求 |
| --- | --- |
| 部门 Dock | 展示真实部门及其成员，不把普通会话、群聊加入 Dock；保留部门人物形象、Chief 身份和临时员工归属。成员可拖入桌面，团队栏会话增删不应等同于部门增删。 |
| 总助理与员工 | Chief 的总助理标签明确；不生成重复的普通 Chief 员工。入群或拖动画布不改变员工归属、权限和任务模型配置。 |
| 团队栏与浮窗 | 点击员工打开对应会话；拖出聊天继续显示同一来源会话的最新消息、输入和执行状态，不能读取旧快照。多窗、草稿、拖动、缩放和焦点行为保留。 |
| 信息栏 | 团队栏聊天右上角保留入口；独立弹窗入口在设置和关闭之间。复用同一面板集中展示任务、最近完成工作、产物和错误恢复，不再额外插入重复的大卡片。 |
| 信息栏角标 | 按工作区、员工/群和信息版本记录已读，两种聊天界面共用。打开面板标记当前信息已读；新产物或新状态再次提示。读过错误不等于错误已解决。 |
| 文件与产物 | 使用真实索引和文件来源会话；团队栏、浮窗、私聊和群聊都能打开。文件缺失、读取中、失败和重试状态必须可见；不要只按文件名猜路径或假装下载完成。 |
| 原生文件卡片 | 画布内的卡片通过 openConversationFile/openCanvasFile 预览。不能重新接到未挂载的经典 sidebarRight。复制路径、WPS/外部应用菜单仍保留原行为。 |
| 状态与错误 | 保留真实工作状态、问题、审批及恢复动作。长时间等待不能只显示空白；不要随机编造当前动作。服务端报错不能通过隐藏 UI 当作修复。 |
| 群聊 | 保留实际成员身份、消息次序、问题回答与任务进度。关闭窗或移出桌面不等于删除群或停止任务。不要为视觉演示改写成员的真实回复。 |
| 选择和删除 | Shift 选择当前可见群聊范围；右键批量删除仍需确认，并处理单项失败。普通点击、空白点击、Escape 的选择取消与菜单关闭行为保留。 |
| 拖拽与布局 | 保留拖拽建群、加入已有群、取消拖动回原位、网格吸附、组件避让、底边移出和 Dock 避让。吸附不能优先覆盖建群判定。底边移出只取消桌面放置，不能删除实体或聊天。 |
| 总助组件 | 放置群聊后收起并停靠右下；自动整理可恢复默认布局。组件展开/收起不能擅自搬动桌面员工。 |
| 人物头像 | 保留预设映射、上传校验和回退；动态预览在创建时仍须保存有效静态头像。临时员工图标和正式形象的身份逻辑不能由 UI 随机替换。 |

## 4. 本轮文件入口

以下路径均相对源码根目录。改组件结构前检索引用，保留用于拖拽、菜单和会话归属的 class/data 属性。

| 文件或目录 | 职责 |
| --- | --- |
| ds-bot/src/client/ui-typography.js、visual-tokens.js、canvas-styles.js | 字体、颜色、磨砂与画布样式；限制作用域，避免全局规则误伤其它窗口。 |
| ds-bot/src/shared/ui-font.js、ds-bot/assets/fonts/ | 本地字体声明与资源，保留无外部字体请求的加载方式。 |
| ds-bot/src/client/sidebar.js、floating-team.js、team-agent-chat.js | 团队列表、展开栏与嵌入聊天。 |
| ds-bot/src/client/conversation-task-panel.js、task-panel-reads.js | 信息栏内容、角标、跨窗口已读和加载/失败状态。 |
| ds-bot/src/client/canvas-session.js、canvas-presented-file.js | 嵌入会话桥接、taskPanel 参数、原生交付文件卡片的点击路由。 |
| ds-bot/src/client/index.js、api.js、sources.js | 真实 actions、API 与订阅；不要另造一套模拟数据源。 |
| ds-bot/src/client/canvas-workspace.js、canvas-grid.js、chat-geometry.js | 桌面放置、网格、浮窗与窗口几何。 |
| ds-bot/src/client/dock.js、agent-dock.js、dock-department-display.js | 部门联系人 Dock 与成员呈现。 |
| ds-bot/src/client/context-menu.js、qibit-command-center.js | 菜单、选择和总助组件。 |
| ds-bot/src/client/create-bot.js、portraits.js、portrait-presets.js | 员工创建、预设形象与头像持久化。 |
| ds-bot/src/client/recovery-state.js、model-recovery.js、execution-status.js | 恢复操作及执行状态。 |
| ds-bot/src/client/i18n.js | 英文产品字符串及中文翻译，新增文案按现有机制提供。 |
| ds-bot/src/host/conversation-files.js、groups.js、task-notices.js、store.js、channel.js | 产物来源索引、群聊、通知、存储与接口。纯 UI 迭代保留逻辑。 |
| ds-bot/client.js | 生成文件，只通过构建更新，不能手工编辑。 |

信息栏通过 `conversation-files` 动作获取明确分享的文件。继续复用 `actions.openTaskResult`、`actions.openConversationFile`，保留 sessionId 和 source Session，不要自行构造本机路径。CanvasSession 的 `taskPanel` 参数控制重复卡片的归入方式，不能仅删标题栏按钮或只恢复聊天正文卡片。

原生文件卡片由宿主提供：当前代码在自己的 `.bt-canvas-session` 根节点接管限定预览按钮，利用 `data-presented-file` 标记，不修改宿主内容或内部实现。调整 DOM 时应保留作用域，避免父窗口误接管嵌套会话。

## 5. 视觉和性能验收重点

- 当前字体基线：侧栏名称 14px/20px/500、摘要 12px/18px/400、Dock 12px/16px/500、部门标题 15px/22px/600、成员名 14px/20px/600、操作按钮 13px/20px/500。若设计师调整，记录新规格，避免旧规则覆盖新字号或字重。
- 按钮保留确认过的浅色磨砂体系；之前全局黑白覆盖已撤回，不从旧包重新带入。不同壁纸下检查玻璃背景、文字和边框。
- 拖动和悬停避免逐帧更新整个 React 组件树；保留现有 requestAnimationFrame 与局部 DOM 更新。避免全画布大面积滤镜重算。
- 1280×720、1440×900、宽屏以及 100%/125%/150% 系统缩放检查。团队栏展开/收起、头像开窗、群聊拖出、边缘缩放不能跳位、闪动或把输入框挤出边界。
- 空员工、长名称、多群聊、多浮窗、无产物、文件缺失、模型错误、等待回答和审批状态都要验收。
- 验证 Enter 发送、Shift+Enter 换行、中文输入法组合输入、占位符隐藏、键盘焦点、Escape 与空白处点击。
- 在团队栏和独立窗分别打开真实 present 产出的 CSV、Markdown；检查原生卡片、正文链接、信息栏文件入口，以及外部应用菜单不被拦截。

## 6. 构建和测试

建议使用 Node.js 24。宿主测试版本以 `ds-bot/dev/harness/package.json` 为准，当前固定 `@deepseek-ai/dsh 0.2.0-rc.2`。在 ds-bot 目录运行：

```sh
npm ci
npm run harness
npm run build
node scripts/build-client.mjs --check
npm test
npm run lint
```

它不是可以直接双击运行的 HTML 页面。实际预览需要兼容 DSH 宿主和隔离 profile；使用 `dev/mock-llm.mjs`，不要请求真实付费模型。`dev/bench.sh` 需要相应 Bash 环境及匹配宿主源码，ZIP 没有 .git 时应显式配置 DSH_HARNESS。不得让测试使用正式桌面数据，也不得为了让预览启动而补丁修改 DSH。

如改变 `ds-bot/index.js` 或 `src/host/`，须按 AGENTS.md 补隔离 mock smoke；纯 UI 改动也需验证嵌入会话与浮窗中的真实交互。桌面接入由功能侧使用 `npm pack` 和应用内插件管理器处理，不直接复制覆盖用户安装目录。

## 7. 基准验证与未解决事项

功能基准已通过 1,206 项本地单元测试、11 项发布工具测试、生成文件一致性和 lint（既有警告保留）。累计宿主改动通过 40 步 mock smoke。团队栏/独立窗各自打开真实 CSV、Markdown 卡片的四种组合已验证。75 个运行包文件与正式桌面安装文件一致。

GitHub 基准提交的 Test 工作流已通过：https://github.com/syj925/DeepSeek-Bot/actions/runs/39747164542 。这些是交付基准的结果，不能代替设计师修改后重新验收。

尚未解决或未覆盖的项目：`QIBITAI_INVALID_REQUEST` 的服务端拒绝原因仍待定位；没有实现数据盘迁移设置；本轮未做 macOS 实机验收；不得承诺所有文档类型都支持在线编辑。旧工作区尚未部署的实验修复不属于本包。

## 8. 设计师回传清单

回传完整源码 ZIP 或 Git 分支/补丁，并附 `UI-RETURN.md`，至少写明：

1. 来源版本、基准提交、回传提交或包名。
2. 修改文件清单、每项视觉/交互变更、是否涉及接口或存储。
3. 同分辨率修改前后截图；Dock 悬停、拖拽建群、团队栏开关和多窗切换录屏。
4. 构建、测试、lint 和交互验收的实际结果；每项标记通过/失败/未验证。
5. 新接口需求、已知问题及恢复原行为的方法。

需要新接口时提供 UI 位置、触发动作、字段、成功结果、加载/失败/取消状态。不要修改权限、模型选择、上下文生命周期或写假数据绕过接口。不要打包 node_modules、.git、账号配置、会话数据、密钥、本机缓存或安装备份。

功能侧接回时按差异合并，保持已确认视觉，在正式桌面验证之后再替换；UI 文档或源码上传不等于已发布到稳定更新通道。
