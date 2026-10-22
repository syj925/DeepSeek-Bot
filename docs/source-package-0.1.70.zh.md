# QibitAI 0.1.70 源码包说明

日期：2026-10-22。此快照对应已安装并验证的 ds-bot 0.1.70，包含 0.1.67–0.1.70 的累计更新。

交给 UI 设计师及其 AI 时，请从根目录 UI-HANDOFF.md 进入 [本版交接文档](UI-HANDOFF-0.1.70.zh.md)，不要使用历史版本的开工指令。

## 包内内容

- `ds-bot/src/client/`：画布、部门 Dock、团队栏、聊天弹窗、信息栏、文件预览及交互源码。
- `ds-bot/src/host/`、`index.js`：员工、团队、群聊、任务、上下文、产物索引和恢复等插件逻辑。
- `ds-bot/src/shared/`、`assets/`、`skills/`：共享模块、字体、图片及角色生成资源。
- `ds-bot/client.js`：由前端源码生成的桌面插件客户端。
- `ds-bot/test/`、`dev/`、`scripts/`：测试、mock 模型及开发构建工具。
- `docs/`、`CHANGELOG.md`、`RELEASE_NOTES.md`：功能说明、验证记录及更新摘要。

源码 ZIP 从 Git 提交直接导出，排除 `.git`、`node_modules`、隔离测试数据、个人会话、密钥、本机清理脚本和安装产物。插件 TGZ 是独立运行包，不包含前端开发源码和测试。

此仓库当前交付的是 QibitAI 桌面所加载的 ds-bot 插件，不包含独立 Electron 宿主源码，也不是 Windows 安装器。桌面应用程序版本与插件版本分别管理。

## 开发与接入

进入 `ds-bot/` 后运行：

```sh
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

宿主逻辑变更还需按根目录 AGENTS.md 运行隔离 mock 冒烟测试，不能使用正式桌面数据作为测试数据。

安装 TGZ 时使用桌面的插件管理器。UI 修改应编辑 `src/client/` 并重新生成 `client.js`；保留现有主逻辑、来源会话、信息栏及错误恢复接口，不用旧版交接包整体覆盖当前源码。

## 本次累计更新

1. 信息栏同时用于团队栏和拖出的聊天弹窗，集中任务、产物和错误恢复；跨窗口同步已读状态。
2. 保留群聊文件来源，减少历史裁剪或上下文分段后找不到产物的问题。
3. 融入设计交接的字体、磨砂按钮、群聊多选、网格吸附、Dock 避让和底边移出交互。
4. 修复原生文件卡片在画布内调用经典侧栏而无法打开的问题，覆盖 CSV、Markdown 和两种聊天窗口。

详见 information-panel-0.1.67.zh.md、ui-integration-0.1.69.zh.md 和 file-preview-0.1.70.zh.md。

## 验证与边界

- 1,206 项单元测试通过；生成文件一致性、lint 通过，既有 lint 警告保留。
- 累计宿主修改通过 40 步隔离 mock 冒烟测试。
- 真实 present 工具生成的 CSV、Markdown 卡片在团队栏、独立弹窗分别打开，四种组合通过。
- 运行包与正式桌面已安装版本比对，保证这份源码对应实际桌面功能。
- 模型服务返回 `QIBITAI_INVALID_REQUEST` 的具体原因仍需结合请求诊断；本版本不宣称修复该服务端拒绝问题。
- 不包含数据目录迁移设置，也不包含尚未验证和安装的旧工作区实验性平台修复。

上传 main 只同步源码；没有推送发布标签时，不会触发面向用户的稳定通道发布。
