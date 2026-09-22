# dsh-manual-compact —— 手动压缩（压缩到此轮为止）

每一轮回复结尾的按钮行（时间 / 复制 / 点赞点踩 / 分支 那一排）里多一个**「压缩到此轮为止」**按钮（官方 `/compact` 命令同款图标）。
点哪一轮，就把**这一轮及其之前的全部对话**用**官方压缩机制**压成一份摘要；这一轮之后的对话原封不动。例：共 10 轮，点第 5 轮的按钮 → 第 1～5 轮被压成摘要，第 6～10 轮保持原样。

## 安装 / 启用

1. 本目录已含构建产物（`lib\index.js` + `lib\client.js`）；如果改过 `src\`，先重新构建：`cd 插件\dsh-manual-compact && node build.mjs`。
2. 网页 → 设置 → 插件 → **坚祥模组** → 确认 `dsh-manual-compact` 开关已开（默认开）→ **重启服务**（关掉「坚祥数字助理 Server」窗口 → 双击 `启动坚祥.bat`）。
3. **刷新浏览器页面**（浏览器半边按模块缓存，光重启服务不刷新看不到按钮）。

## 按钮在哪儿

每一轮（Turn）结尾的助手消息下方那排小图标里，**点赞/点踩右边、分支按钮左边**（`conversation.chat.assistant-actions` 插槽，order 20；官方点赞是 order 10）。鼠标悬停显示「压缩到此轮为止」。

## 怎么用

1. 点某一轮的「压缩」按钮 → 弹确认框，写明将压缩「第 N 轮及其之前」。
2. 点「开始压缩」→ 按钮转圈、对话框进入进行中状态。
3. 完成：对话框显示压掉多少条记录、约多少 tokens；会话流里该轮之前的内容收进一行官方「上下文已压缩」摘要，之后的轮次原样保留，会话可继续正常对话（下一个模型请求自动带上摘要）。

## 边界与提示（不会静默失败）

| 情形 | 界面表现 |
|---|---|
| 会话正在跑（或已有压缩在进行） | 「会话正在运行，或已有一次压缩在进行；等当前活动结束后再试。」 |
| 点的轮已被之前的压缩覆盖 | 「这一轮的内容已不在当前上下文里……无需重复压缩。」 |
| 该轮之前没有可压内容 | 「这一轮之前没有可压缩的对话内容。」 |
| 范围太小、压不出更小的摘要 | 「……压不出更小的摘要（内容可能太少或已经很紧凑），没有做任何改动。」 |
| 官方压缩事务中途变化 | 对应官方错误码的中文说明（changed / commit / persistence）。 |
| 冷会话（服务重启后没打开过） | 自动按会话记录的 preset 恢复后执行；无法确定模型路由时给出明确提示。 |

## 复用官方机制的原理（没有另写摘要）

- 官方链路：`/compact` 命令（`packages/compaction/command-compact`）→ `ctx.compaction.compactNow()`（web profile 由 `compaction-basic` 行提供 `BasicCompactionEngine`）→ `agent.runMaintenance`（要求空闲）→ 官方事务：`compaction/start`（日志锁）→ 一次 `ctx.llm.stream()` 摘要（重放会话自己的系统提示词/工具/消息前缀，复用 KV cache）→ `compaction/summary`（日志）→ `user/message`（`surfaceOp: replace` 把区间换成一个摘要节点）→ `compaction/end`。全部 append-only 落盘在会话日志。
- 本插件与官方唯一的差别是**范围**：官方 `compactNow` 自己选范围、`compactRegion` 又只能在回合内用；本插件取官方引擎实例的 `regionDependencies()`（官方 token meter + 官方摘要钩子 + 官方错误恢复），并在构建期直接链接官方 `compaction-basic/src/region.ts` 的 `compactSurfaceRegion` 事务函数，范围改为「表面开头（跳过 system 提示词）→ 点击那一轮的最后一个节点」。摘要、定价、锁、落盘 100% 是官方代码（`selftest-host.mjs` 有产物指纹断言）。

## 与其他插件共存

- **不替换任何原生行**（无 `jx.replaces`）；按钮挂在官方预留的 `conversation.chat.assistant-actions` 列表插槽（官方点赞/点踩 `ui-message-feedback` 也挂在这，order 10，本插件 order 20 排它后面）。
- 对话折叠插件 `dsh-transcript-fold` 替换的是整个 `ui-chat` 行（折叠时机），它渲染插槽的逻辑与官方一致，与本插件互不影响。
- 原生按钮（复制、分支、点赞、用量）不受影响。

## 自测与构建

```sh
cd 插件\dsh-manual-compact
node build.mjs            # 官方仓库自带 tsdown 构建双半边 + 产物指纹自检
node selftest-host.mjs    # 宿主：模块加载、SRC 标记、错误分类、官方事务代码内联（14 项）
node selftest-client.mjs  # 浏览器：jsdom + 真 React 跑按钮→确认→调用→文案全链路（11 项）
```

## 已知边界与注意事项

- 压缩要调一次模型（走会话自己的模型路由），会花少量 token；第一次用建议在测试会话里试。
- 一轮的按钮只在**该轮已完成**时出现（正在跑的轮没有按钮行）。
- 官方升级后：若 `compaction-basic/src/region.ts` 的内部签名变化，构建会显式报错（构建期链接 + 指纹自检），对着新源码调整即可。
- 服务端排查：会话日志里每次手动压缩都有 `compaction/start`（`turn: null`，standalone）→ `compaction/summary` → 替换 `user/message` → `compaction/end` 四组事件。
