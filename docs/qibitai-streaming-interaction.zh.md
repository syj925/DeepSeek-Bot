# 0.1.55 输入与流式交互维护说明

本版保留员工、群聊、任务队列和权限逻辑，调整模型入口、输入框反馈和流式文字绘制。参考界面用于理解交互节奏，未复制其实现。

## 模型厂商身份

紧凑模型入口及模型列表显示原厂图形，不再用路由名称首字母代替厂商图标。Claude 经由其他网关提供时仍显示 Claude 对应图形，MiniMax 同理。
识别只读取模型标识和展示名称；无法识别时显示中性图标。群聊先选员工，再修改该员工保存的模型或思考等级，群聊没有共享模型。
图形数据见 [provider-artwork.js](../ds-bot/src/client/provider-artwork.js)，识别见 [provider-icons.js](../ds-bot/src/client/provider-icons.js)，菜单接入见 [model-menu.js](../ds-bot/src/client/model-menu.js)。
第三方图形来源、许可和商标说明见根目录 [NOTICE](../NOTICE)；增加或更新图形时同步核对该声明。

## 稳定的渲染身份

[cells.js](../ds-bot/src/client/cells.js) 按翻译后的复制、复制成功和脚注文案缓存 Markdown labels，同语言流式更新复用同一个对象。
宿主 Markdown 渲染器会在 labels 身份改变时重置流式缓存，故不得在每次正文更新时无条件新建该对象；切换语言时应正常更新。
气泡继续使用稳定消息及 stream 标识，正式消息接替临时流式气泡，避免为动画重新创建整段正文。

## 流式文字渐显

[stream-reveal.js](../ds-bot/src/client/stream-reveal.js) 观察本窗口正在输出的文本，只为新增或小幅改写的字符创建 Range。
CSS Custom Highlights 按 20 个绘制阶段将新字从 16% 墨色过渡到正常墨色，单字持续 240 ms；同批字符最多错开约 90 ms。
高亮改变绘制，不包装文字、不分割文本节点、不替换 Markdown 元素，不延迟真正收到的正文，也不以额外打字队列拖慢完成。
支持时使用字素分段，避免把组合字符或 emoji 按 UTF-16 单元拆开；大批历史载入、折叠内容和过大增量直接显示。
[stream-follow.js](../ds-bot/src/client/stream-follow.js) 只平滑宿主已经跟随的小幅内容增长，不写 scrollTop；用户翻阅历史时立即让出控制。

## 输入框与中文输入法

[composer-motion.js](../ds-bot/src/client/composer-motion.js) 为单个输入表面添加聚焦、背景、发送/语音状态过渡和约 210 ms 的多行高度变化。
宿主继续拥有 contenteditable、选区、输入法和发送动作。不要逐键改写 innerHTML、包裹输入字符、缩放文字或重设选区来制造动画。
组合输入开始时停止尺寸动画；组合输入期间不对首页 textarea 执行自适应高度写入，结束后再测量。
[qibit-command-center.js](../ds-bot/src/client/qibit-command-center.js) 的首页输入支持 Enter 发送和 Shift+Enter 换行；composition 与 keyCode 229 不触发发送。
聊天输入框继续悬浮在窗口底部。样式使用具体输入表面与安装标记提高优先级，避免旧版 disabled 主按钮隐藏规则覆盖状态过渡。

## 窗口生命周期和降级

每个会话窗口独立拥有观察器和动画；同一 document 的高亮注册表按所有者管理，不互相删除其他窗口的范围。
窗口关闭或切换表面时取消 rAF、WAAPI 和事件监听，断开 MutationObserver/ResizeObserver，恢复插件写入的属性与样式。
开启减少动态效果时取消视觉动画。隐藏标签页暂停渐显并清空旧范围，恢复时不补播已收到的文字。
缺少 CSS Highlights、Highlight 或所需颜色混合支持时直接显示流式文字；缺少 WAAPI 时保留输入与布局功能。
生成入口仍是 [client 源码](../ds-bot/src/client/)，通过构建更新 client.js，不手改生成包，不修改宿主编辑器实现。

## 本版验证及测量边界

本版单元测试 1006 项、发布工具测试 11 项通过，lint 通过；这证明已覆盖路径，不代替真实用户体验验收。
真实应用浏览器检查捕捉到最多 20 个活跃高亮范围、最低墨色透明度 0.16；采样期间 Markdown 旧节点移除数为 0，编辑器节点未被替换。
上述是该次场景中的观察结果，不能扩展成所有模型、消息长度或设备的恒定保证。
真实浏览器在后台的采样间隔约为一秒，不能用来声称 FPS 提升、帧率稳定或输入框始终完全零位移。
独立 fixture 可验证真实观察器、动画、高亮范围与节点保留；其稳定 Markdown DOM 不包含宿主解析器开销，帧间隔和零位移只属于该 fixture。
回归重点是中文输入法确认、多行伸缩、快速发送/停止状态切换、两窗口并存、上翻历史、减动画开关及关闭窗口后的资源释放。
发布验证另检查冻结包、最终提交和公网下载的完整字节一致；发布可用、客户端安装、重启激活与真实用户验收应分别报告。
