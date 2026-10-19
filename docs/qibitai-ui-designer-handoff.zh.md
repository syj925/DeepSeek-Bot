# QibitAI 0.1.46 · 给 UI 设计师及其 AI 的源码交接

交接日期：2026-10-19。仓库：https://github.com/syj925/DeepSeek-Bot 。基准分支：`feat/qibitai-main-agent-groups`。精确提交与逐文件 SHA-256 见压缩包根目录 `SOURCE-MANIFEST.json`。本文件替代之前 0.1.31 的交接说明。

## 交接目标

在这份真实源码上修改展示与交互，保留已实现的底层功能。以 UI 设计师确认的视觉为准，功能侧集成时不擅自重画。不要另做一个只用假数据的页面来替换当前产品，也不要把整个旧目录覆盖回后续版本。

这份包是 **员工画布及协作插件 ds-bot 0.1.46**，不是整个 QibitAI Electron 桌面壳，也不是可双击安装的软件。包含前端、插件后端、测试、构建脚本、设计素材、QiBit Skill 和交接文档。不含依赖、账号、真实聊天、密钥、Git 历史、安装备份和本地测试日志。

## 给接手 AI 的开工指令（可直接复制）

> 请先读 AGENTS.md、本文件、ds-bot/package.json 和 SOURCE-MANIFEST.json。以这份 0.1.46 源码为基准建立独立 UI 分支；不要换回 main 或旧美化包。按设计师确认稿修改真实界面，不重写协作、权限、任务上下文、模型路由及消息协议。可修改布局、字体、颜色、图标和动效，但必须保留真实数据、动作和异常状态。client.js 是生成文件，改 src/client 后运行 npm run build。需要新接口时列出需求，不能用随机值或静态数据伪装成功。交付源码差异、同尺寸截图/录屏、UI-HANDOFF.md 和真实验证结果；未验证项目明确写出。不要操作用户正在使用的桌面数据或调用真实付费模型测试。

## 当前功能与不可破坏的规则

| 功能 | 当前行为及 UI 边界 |
| --- | --- |
| 总助理 | Chief 是唯一总助理身份，需要有清楚标签；不能作为普通员工重复生成。主管身份不等于完整工具权限。 |
| 团队与群聊 | 固定团队表示组织归属；任务群表示协作空间。跨团队成员可入群，入群和画布位置不改变归属或权限。 |
| 任务交接 | 总助识别协作需求后创建任务群、交接任务；专业问题、执行和产物留在群内。任务群已移除“返回总助理”按钮，不再恢复这一入口。 |
| 模型分配 | 派工时已有任务级模型路由，用户指定优先，仅影响本次任务；员工默认模型不被永久改写。当前是配置模型与规则匹配，不是在线能力/价格评测，不承诺“最优”。普通群聊提及不等于任务派工。 |
| 上下文 | 私聊与不同群的员工执行会话隔离。长期员工和总助在任务明确完成后切换分段，历史保留；经验记忆与任务结果分开。/clear 做实际上下文切换，但角色说明和工具仍占基础容量。 |
| 临时员工 | 任务结束且没有其他进行中工作、问题、审批、排队输入或定时任务时才退场；保留历史身份与产物。不能仅关闭聊天窗口就删除员工。 |
| 群聊与私聊 | 保留实际流式回复、工具状态、问题卡、审批、错误与输入框。群聊员工顺序发言，符合条件的任务讨论由管理员总结；不要前端拼凑假流式。 |
| 报错恢复 | 保留重试未完成任务、请总助排查、检查模型配置、复制错误信息及兜底提醒；不能无限自动重试，也不能用 UI 隐藏错误。 |
| 画布交互 | 点击员工打开对应聊天，不强制移动画布；多窗、标题栏拖动、边缘缩放、焦点切换和草稿保留需继续工作。关闭窗口不是取消后台任务。 |
| 选择与菜单 | 选中只高光；右键管理；其他点击取消选择/关闭菜单。保留框选、拖入群、空群与已有群加入等真实动作。 |
| 小组件 | 折叠/展开不能移动员工；临时避让后可恢复位置；窗口尺寸变化保持边缘锚点，自动整理避免将员工放在组件下面。 |
| 通知与未读 | 整张任务通知可点击定位对话，不恢复冗余“打开对话”按钮；真实进入/读取会话后消除未读状态，不能按渲染直接清空。 |
| 员工形象 | 临时员工使用岗位图标，转长期且没有自定义头像时申请正式头像；用户上传头像优先，手动修改取消旧生成结果。旧群消息保留当时的身份图标。 |
| 头像生成限制 | QiBit Skill、提示词和参考图已内置，真实生图服务尚未配置。生成入口不等于已可出图；必须展示未配置/排队/失败/完成状态。实际质量依赖后端生图与视觉审核。 |

## 文件入口与修改范围

所有路径相对压缩包源码根目录。

| 路径 | 职责及建议 |
| --- | --- |
| ds-bot/src/client/canvas-styles.js、canvas-theme.js、styles.js | 画布与整体样式，优先修改；限制样式作用域。 |
| ds-bot/src/client/chat-surface.js、restored-chat-styles.js | 聊天表面和毛玻璃适配。不同壁纸、明暗主题均需检查，不能只在一张背景上调色。 |
| ds-bot/src/client/canvas-workspace.js、canvas-session.js、team-agent-chat.js | 真实会话、画布与浮窗桥接，保留 session 身份、宿主内容插槽、订阅和销毁流程。 |
| ds-bot/src/client/floating-team.js、spatial-widgets.js、chat-geometry.js | 团队栏、小组件、尺寸与避让。尺寸改动必须验证展开、收起、重启和窗口缩放。 |
| ds-bot/src/client/dock.js、agent-dock.js、context-menu.js、main-agent-drag.js | Dock、菜单、拖拽；保持悬停放大、拖拽阈值和点击语义。 |
| ds-bot/src/client/cells.js、questions.js、execution.js、turn-reasoning.js、chat-reading-position.js | 消息、问答、执行状态、思考展开与滚动阅读位置。不能把点击思考详情改成打开设置。 |
| ds-bot/src/client/task-groups.js、task-notices.js、completion-unread.js、recovery-state.js、model-recovery.js | 协作入口、通知、未读和恢复状态；可改呈现，勿重复实现业务状态机。 |
| ds-bot/src/client/settings.js、bot-settings.js、create-bot.js、group-settings.js、i18n.js | 设置、创建、群配置及文案；保留保存校验和可访问名称。 |
| ds-bot/src/client/employee-icon.js、mark.js、portraits.js、portrait-presets.js | 临时图标、头像和预设呈现；保留上传/生成/默认回退顺序及身份映射。 |
| ds-bot/src/client/api.js、sources.js、index.js | API、数据订阅和动作注册；优先复用既有 actions，不能另建假数据源。 |
| ds-bot/src/host/、ds-bot/src/shared/、ds-bot/index.js | 业务、持久化、工具、权限、模型分配、上下文、头像服务；纯 UI 迭代不修改。 |
| ds-bot/skills/artifact-template-qibit-3d-human-agents/ | 用户提供的设计规范和参考图，不擅自重新生成或覆盖原始参考。 |
| ds-bot/client.js | 生成产物，不手改，构建后一起交付。 |
| ds-bot/test/、dev/、scripts/ | 测试及开发工具，保留断言，不通过删测试让检查变绿。 |

类名和 data 属性可能是交互契约，例如 `.bt-canvas-window`、`.bt-canvas-group`、`.bt-floating-team`、`.bt-spatial-widget`、`data-entity-id`、`data-window-id`。改结构前查引用；优先增加外观类，避免删除功能钩子。不得添加覆盖整个桌面的透明层导致员工无法点击。

## 本地构建与预览

在 ds-bot 目录执行（建议 Node.js 24；测试宿主依赖固定在 dev/harness/package.json）：

```sh
npm ci
npm run harness
npm run build
node scripts/build-client.mjs --check
npm test
npm run lint
```

这不是独立网页，不能双击 client.js 或自行套一个空 HTML 当成桌面运行结果。开发预览需要兼容的 DSH 宿主和独立测试 profile；本包不含宿主源码。测试用 dev/mock-llm.mjs，不需要真实模型密钥。

仓库 dev/bench.sh 是 POSIX 脚本，需匹配的 DSH 源码及 Bash/Linux 环境；不能直接在 PowerShell 中假定可运行。ZIP 无 .git，使用该脚本时必须显式设置 DSH_HARNESS 为匹配的宿主源码目录。先检查其依赖和空闲端口，使用独立 .dsh-test-ui-*，完成后停止自己启动的进程。不要将 DSH_HOME 指向用户真实桌面或 ~/.dsh。

桌面接入由功能侧通过应用内插件管理器安装 `npm pack` 生成的包并重启。桌面专属 profile 不接受普通 CLI 更新，不要修改宿主内部文件来绕过。依赖存储版本冲突应交功能侧处理，不复制用户安装目录作为开发依赖。

没有宿主时可以单独做标注为“静态预览”的视觉样例，但不能删除真实会话桥接，也不能把预览称为正式功能。

## 验收与回传

每项填写“通过/未通过/未验证”，并附实际截图、录屏或检查输出；不能沿用交付方结论当成新 UI 的验证结果。

- 1280×720、1440×900、宽屏，以及不同系统缩放；输入区、窗口边界、团队栏和组件不被裁切。
- 浅色、深色、明暗/复杂壁纸；文字对比、玻璃透明度、浮层边框稳定。
- 空数据、长名称、多员工、Chief 标签、主管、临时/长期头像及失败回退。
- 多窗同时打开，拖拽、缩放、切换、点击空白取消选中、输入草稿不丢失。
- 群聊流式、顺序发言、头像位于气泡顶部、问题由正确负责人提出、任务进度与产物可见。
- 输入占位文字正确隐藏；Enter 发送、Shift+Enter 换行、中文输入法候选期间不误发。
- 通知整卡跳转、未读消除、失败恢复、长等待/审批状态可见。
- 团队栏与头像开窗不卡顿，不做全画布大面积滤镜重算或每帧触发全树渲染；提供展开/收起录屏。
- npm run build、生成文件一致性、npm test、npm run lint；后端若获批准发生变动，另做隔离 mock smoke。

回传至少包含：完整源码或补丁、UI-HANDOFF.md、视觉截图/录屏。UI-HANDOFF.md 写明基准提交、修改文件、设计说明、新接口需求、验证结果及未解决问题。Git 分支建议 `ui/<本轮主题>`，不要强推覆盖功能分支。

如需要新接口，写清 UI 位置、触发动作、所需字段、成功结果、加载/失败/取消状态及数据兼容影响，交功能侧实现。禁止靠前端随机挑模型、生成假消息、直接改存储来伪装功能完成。

功能侧收到回传后按差异合并，在同分辨率下对照设计师确认稿；若接口限制导致视觉变更，先说明具体冲突，不擅自重画。

## 当前基准的验证与限制

本轮代码已通过 801 项测试、构建一致性检查、lint（有现存警告）和 40 步隔离 mock smoke。0.1.46 已安装到实际 QibitAI 桌面端，67 个插件包文件与交付包哈希一致，并检查群聊按钮移除和正式头像入口。未进行真实付费头像生成或视觉质量验收。

相关实现详情见 docs/qibitai-task-model-routing.zh.md、qibitai-task-context-lifecycle.zh.md、qibitai-task-group-journey.zh.md、qibitai-chat-recovery.zh.md、qibitai-employee-portraits.zh.md。历史文档描述早期版本时，以本文件、manifest 和当前源码为准。
