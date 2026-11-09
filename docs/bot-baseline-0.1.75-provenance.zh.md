# Bot 0.1.75 源码基线来源（2026-11-09）

本目录用于在 DSH Bot 业务插件内继续开发独立任务。未修改 Harness、正式桌面安装目录或用户运行数据。下述校验结果记录业务开发开始前的基线状态；后续功能修改不要求继续与旧安装包相同。

## 来源

- 新工作树：`E:\DSH SingLab\.review-bot-tasks-20261109`
- 分支：`feat/bot-independent-tasks-20261109`
- Git 基础提交：`dea30ab05a291dada11ae8660ecf1b2937db8b64`
- 候选源码：`E:\DSH SingLab\.review-information-panel-0.1.66`。复制了其当前 Git 跟踪文件及未跟踪的源码、测试和 Markdown 文档，共 502 个文件。原目录未改动。
- 正式产品包：`E:\DSH SingLab\exports\QibitAI-0.1.75-prospecting-audit\ds-bot-0.1.75.tgz`。
- 产品包 SHA-256：`be9297fab3b8dcb3b085a507d09551bf03e7f5369c99c83cf01ecf5987bde1ad`。
- 详细产品文件列表及 SHA-256 见 `bot-baseline-0.1.75.manifest.json`。

候选源码中未上线的设计协作流程、跨端协作服务器及客户端入口不属于此次正式基线。已从新工作树移除 `src/host/design-workflow.js`、`src/host/collaboration.js`、`src/shared/collaboration.js`、`src/collaboration/`、`collaboration-server.mjs`、客户端 `collaboration-panel.js` 及其对应测试。相关 Launcher、actions、文案、样式及空 roster 字段也已从客户端源文件中排除。

复制的历史设计/协作 Markdown 文档只是历史规划，不代表正式 0.1.75 已安装对应能力。未复制候选目录的测试运行数据、日志和大型 Word 报告。

## 以正式包为准的校准

正式包的全部 77 个产品文件覆盖到新副本。客户端按源码重新构建，逐项去除未上线差异；没有手工修改生成文件来伪造一致性。最后一项差异是 `cells.js` 为未上线设计任务向 `TaskGroupCard` 额外传入的 `actions` 属性。

基线校验时，77 个产品文件与正式包逐字节一致，包含重新构建的 `client.js`。客户端 SHA-256：

`e6d4d96cba3c366ca4cc6d7a3168e65de155b8b9b08031df6393519d800a6dab`

## 校验结果

- `npm run build`：通过。
- `node scripts/build-client.mjs --check`：通过。
- `npm test`：1227 项通过，0 失败、0 跳过。
- `npm run lint`：退出码 0；保留正式基线原有警告，未为消除警告改变正式产品逻辑。
- 本次基线准备未启动 Host 冒烟实例、未运行真实模型，也未替换桌面。业务功能完成后另做隔离 Host 验收。

依赖使用目录连接：`ds-bot/node_modules` 与 `ds-bot/dev/harness/node_modules` 指向候选源码对应依赖。没有安装或修改依赖。测试临时目录与日志均位于新副本 `ds-bot/.artifacts/baseline/`。这类运行文件不应进入源码交付包。

本次仅准备工作树，未提交、推送或部署。
