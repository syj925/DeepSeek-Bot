# QibitAI Bot 0.1.82 源码包说明

日期：2026-11-09。仓库 `syj925/DeepSeek-Bot`，分支 `feat/bot-independent-tasks-20261109`。源码 ZIP 从提交直接导出，文件名包含提交短哈希。

完整源码包含此前正式基线及累计至 0.1.82 的插件更新：独立任务、验收与交付版本、上下文隔离、可编辑且可溯源的岗位经验、信息栏分类、错误已处理、不可用文件收纳与移除、分区收起及会话展示偏好。摘要见 `CHANGELOG.md` 和 `RELEASE_NOTES.md`；UI 接手从根目录 `UI-HANDOFF.md` 开始。

## 包内内容

- `ds-bot/src/client/`、`src/host/`、`src/shared/`：前端、插件后端与共享源码。
- `ds-bot/client.js`、`index.js`、包清单：生成客户端及运行入口。
- `ds-bot/assets/`、`skills/`：已有图片、字体和角色生成资源。
- `ds-bot/test/`、`dev/`、`scripts/`：测试、mock 模型、构建与开发工具。
- 根目录文档和 `docs/`：变更记录、接口边界和 UI 交接。

排除 `.git`、`node_modules`、测试运行数据、个人会话、密钥和本机安装备份。本包不是 Windows 安装器，也不包含 `qibitai-desktop` 的 Electron 宿主源码。插件 TGZ 是单独的运行包，不能代替含 `src/client/` 的完整源码包。

## 构建

在 `ds-bot/` 目录运行：

```sh
npm ci
npm run harness
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

Host 变更另需隔离 mock 冒烟检查。按根目录 `AGENTS.md` 使用公开插件 API，不补丁修改 Harness。

## 验证范围

- 1,296 项单元测试通过，客户端构建一致性与 lint 通过。
- 0.1.80 Host 改动通过 9 项任务隔离检查及 13 项原任务回归，覆盖实际 mock 模型请求、重启、私聊验收、继续指定任务和错误处理。0.1.81–0.1.82 没有继续修改 Host。
- 0.1.82 界面验证覆盖两种宽度、三个分类、移除／撤销、刷新持久化、会话隔离、多窗口同步、恢复文件返回列表和收起时保留草稿。
- 正式桌面已确认 Bot 0.1.82 启用且无插件错误，原员工与群仍可读取。

运行包 `ds-bot-0.1.82.tgz` SHA-256：`2bd10d43724bfa0b9e541d12c40947ce25b33dd7279a5ba9b9ee00fbd84d448f`。源码归档在交付时另校验与 Git 提交一致、生成客户端与正式插件一致。更早文档的测试数量和“未部署”描述仅代表对应时间点。

本次没有上线跨端协作服务、新 RAG 服务或自动批准的工作流模板。真实业务数据质量和模型稳定性仍需业务验收；mock 通过不代表客户名单质量达标。
