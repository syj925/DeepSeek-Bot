# QibitAI Bot 0.1.87 源码包说明

日期：2026-11-10。仓库 `syj925/DeepSeek-Bot`，分支 `feat/bot-independent-tasks-20261109`。源码从 Git 提交导出，文件名包含提交短哈希；压缩包根目录的 `SOURCE-MANIFEST.json` 记录精确提交和逐文件 SHA-256 校验值。

## 包含内容

- 完整 DS Bot 插件：`ds-bot/src/client/`、`src/host/`、`src/shared/`，以及生成后的 `client.js`、运行入口与包清单。
- 已有素材和技能资源，以及测试、mock 模型、构建和开发脚本。
- 根目录 `UI-HANDOFF.md` 和 `docs/UI-HANDOFF-0.1.87.zh.md`：本次 UI 交接入口、不可破坏的交互、代码位置与验收要求。
- `CHANGELOG.md`、`RELEASE_NOTES.md` 及历史文档；旧文档中的版本、未部署描述和测试数量只代表当时状态。

本版包含独立任务与信息栏基线，以及 0.1.83–0.1.87 的 Dock／会话解耦、名称裁切修复、主动恢复员工会话、删除员工菜单和拖动坐标修复。UI 调整从本包继续，不用旧美化包覆盖业务逻辑。

不包含 `.git`、`node_modules`、用户会话、密钥、测试运行数据和安装备份；与本轮无关的本地草稿不纳入。包内不是 Windows 安装器，也不包含 `qibitai-desktop` 的 Electron 宿主源码。单独的插件 TGZ 不能代替含前端源码的完整 ZIP。

## 校验与开发

本次已通过 1,312 项单元测试、客户端构建一致性和 lint。隔离浏览器验证覆盖三种窗口宽度与显示缩放下的拖动、松手、取消、成员菜单和失败处理。正式桌面确认 Bot 0.1.87 启用且无插件错误，80 个已安装运行文件与本版构建一致；组织关系和会话隐藏偏好在更新前后保持一致。

运行包 `ds-bot-0.1.87.tgz` SHA-256：`42dc8efc68797a9129d08051a61141e4c93ce3dbbfcd4163030eaee302dc3356`。源码 ZIP 的最终 SHA-256 在交付目录的 `SHA256SUMS.txt` 中。

源码 ZIP 使用 Git 保存的文本换行；Windows 工作目录可能使用 CRLF。校验提交时以 Git 文件内容为准，生成客户端另与正式桌面逐字节比对。

在 `ds-bot/` 运行 `npm ci`、`npm run harness`、`npm run build`、`npm test`、`node scripts/build-client.mjs --check`、`npm run lint`。Host 改动另需隔离 mock 冒烟检查，遵守 `AGENTS.md` 的公开 API 和测试数据边界。

本次没有增加新 RAG 服务、自动批准的工作流模板或跨端协作后端；mock 和 UI 验证不代表真实业务数据质量已通过验收。
