# 员工头像生命周期（插件 0.1.46）

## 行为

- 任务群不再显示“返回总助理”，结果和后续沟通留在群内。
- 无自定义图片的临时员工立即使用岗位图标，不调用生图服务。岗位覆盖技术、设计、财务、分析、研究、文案及通用工作。
- 临时员工转为长期员工时，如无自定义图片，自动申请正式头像。员工设置增加“保留为长期员工”和“生成 QiBit 正式头像”入口。
- `update_bot(formal_avatar: true)` 用于用户明确要求正式形象，不改变员工的任用类型。临时员工仍按原任务生命周期退休。
- 原有自定义图片不因转正被覆盖。生成期间用户上传、重置头像会取消旧生成请求，避免晚到的结果覆盖用户选择。
- 新增的临时员工群消息保存轻量图标快照；员工转正或退休后，旧消息继续显示当时图标。旧版消息没有快照，无法还原过去的头像变化。

## 已内置的设计资产

`ds-bot/skills/artifact-template-qibit-3d-human-agents/` 完整保留用户提供的 SKILL、七张原图、风格总览、身份索引和提示词库。原始参考不修改。

## 生图服务接入要求

本插件没有内置付费生图供应商凭据，也不把普通聊天模型当成生图模型。当前桌面尚未配置服务；此时显示“暂未配置头像生成服务”，保留图标。以下是待后端实现的协议，不能将接口存在等同于实际生图能力已上线。

通过宿主支持的插件配置设置：

```yaml
- id: bot
  config:
    portraitServiceUrl: https://YOUR-SERVICE/api/employee-portraits
```

鉴权可由宿主进程环境变量 `QIBIT_PORTRAIT_TOKEN` 提供，通过 Bearer 发送。只允许 HTTPS 或本机 HTTP；拒绝跳转。不能在客户端设置或日志暴露密钥。

POST JSON：`requestId`（幂等键）、`employee: {name, role}`、`skill`、`promptKit`、`reference`（家族总览 PNG data URL）、`size: "1024x1024"`、`background: "transparent"`、`thumbnailSize: 256`、`requiredReview`。不发送聊天记录、任务文件或员工指令。

后端应按岗位生成身份参数卡，在脸型、发型、配饰、服装轮廓中至少两项与既有角色区分；以总览约束风格，使用真实参考图输入和透明背景选项。后端负责视觉审核，不得机械返回全 true。返回：

```json
{
  "image": "data:image/png;base64,...",
  "thumbnail": "data:image/png;base64,...",
  "review": {
    "familyStyle": true,
    "adult": true,
    "distinctIdentity": true,
    "completeHead": true,
    "cleanEdges": true,
    "transparentBackground": true
  }
}
```

原图为 1024×1024、缩略图为 256×256，均为 8 位非交错 RGBA PNG。缩略图 data URL 不超过 160,000 字符，整个响应不超过 12 MiB。插件会解析 PNG 像素，拒绝无透明像素、全透明、尺寸错误、格式错误或未通过审核的响应。风格、美感与身份区别仍依赖服务端视觉审核，不能由尺寸校验保证。

队列全局串行，最多 20 个待处理任务；相同员工进行中的请求去重；网络操作 120 秒超时，无自动付费重试。重启遗留状态显示“已中断”，由用户手动重试。

原图和缩略图保存到插件数据目录 `bot/portraits/<requestId>.png`、`<requestId>-thumb.png`，新版本保留旧文件。名单只保存缩略图和引用 ID；图像不注入员工任务上下文。生成失败继续使用原头像。

## 验证范围

仅使用 mock 模型及本机假生图服务：验证转正、不覆盖自定义图片、请求去重、异步完成、本地文件保存、手动上传取消、重启中断提示、真实透明度与尺寸校验。真实付费生图及视觉质量验收需配置服务后另行验证。
