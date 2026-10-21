# 当前交接入口

当前插件版本为 0.1.62，以 `main` 为开发与发布底座。请先阅读[本轮主干合并说明](docs/main-integration-0.1.62.zh.md)。协作分支的 0.1.61 已合入主干；后续开发先同步 `main`，不要重新以历史源码包覆盖主干。此前的 [UI 设计师与 AI 交接文档](docs/UI-HANDOFF-0.1.59.zh.md) 及下文仅供追溯。

---

# QibitAI 0.1.51 源码入口（历史）

当前源码为员工画布及协作插件 ds-bot 0.1.51，已接入 QibitAI 桌面端；不包含 Electron 桌面壳或用户数据。请先阅读 AGENTS.md、ds-bot/package.json、docs/chief-routing-desktop-0.1.51.zh.md。压缩包内 SOURCE-MANIFEST.json 记录精确 Git 提交和逐文件校验值。

本版保留设计师视觉，加入 Chief 任务分流、主页直接对话、真实执行状态、字体及按钮规范，以及位置恢复和拖动融球优化。修改界面时保留已有功能与交互，使用真实接口，不以演示数据替代。client.js 为生成文件，修改 src/client 后重新构建。

验证：912 项测试、40 项 mock 冒烟通过，桌面构建哈希已核对；Mac 视觉验收和真实模型分流遵循率未验证。具体范围见版本说明。更早的交接文档仅作历史参考。

## 原设计师 0.1.46 回交记录（历史）

本副本在 fc02507fa8f32487423457114b2c1fb4495ca34e 基础上合并视觉交互，交付标识ui-20261019。请先阅读整包根目录的00_START_HERE.md和handoff/UI-HANDOFF.md；变动文件表与验证记录位于handoff/。

SOURCE-MANIFEST.json记录当前源码哈希，UPSTREAM-SOURCE-MANIFEST.json保留开发原始哈希。docs/qibitai-ui-designer-handoff.zh.md是开发原文，其中801项/40步是开发原基准报告，不能视作本UI副本复验结果。当前已执行24个文件228项定向回归；全量和真实宿主验收仍待功能侧。
