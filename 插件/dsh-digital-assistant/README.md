# dsh-digital-assistant —— 数字助理

侧边栏「新建会话」下方的**主对话入口**。用户只对数字助理提需求，它自己选工作区、模式、模型、权限，
把活派给**普通顶层会话**去干；那些会话跑完后，数字助理收到一份**压缩摘要**（不含思考内容、不含工具参数），
再向用户汇报。

## 用户看到什么

- 侧边栏**「新建会话」正下方**一行「数字助理主对话」，样式与它完全一致——入口是**克隆官方那个按钮**做的
  （同一批 CSS Module 类名，所以悬停态、折叠成窄栏时的图标态都跟着官方走），图标换成了一个小人。
- 点它进入**常驻唯一**的数字助理对话（固定会话 id，重启后仍是同一个，历史连续）。
- 数字助理对话**不占侧边栏的会话列表**：客户端 ui-workspace 的会话可见性判定按它的固定 id 排除
  （`packages/client/ui-workspace/src/client/tree.ts`，见《修改记录》条目 74），只从左上角入口进。
- 它开出来的对话就是普通会话，出现在侧边栏对应工作区里，用户可随时点进去看或接管。
- 它的落脚目录是 `dsh-home\assistant`，会在宿主侧登记成一个工作区。**这个工作区必须存在**（会话必须挂在它里面，
  客户端才打得开），但它**不会显示在侧边栏**：客户端 ui-workspace 的分组逻辑会跳过「装着数字助理会话的工作区」。
  对用户来说，数字助理只有一个入口——「新建会话」下面那一行。它也不作为派发目标（不在 `list_workspaces` 里，
  硬派过去会被拒）。

## 组成

| 文件 | 作用 |
|---|---|
| `src/index.ts` | 宿主半边：常驻会话的建立与组装（专属提示词 + 专属工具 + 全局工具收窄）、8 个工具、派发、完成回报、`jxAssistant` Remote |
| `src/summary.ts` | 会话事件 → 压缩摘要（纯函数，可单测） |
| `src/types.ts` | 只按结构面声明的宿主服务类型（不 import 官方包的值） |
| `src/client.tsx` | 浏览器半边：克隆官方「新建会话」按钮做入口 + 面板槽兜底 |
| `src/remote-client.ts` | 手写的 Typert Remote 客户端贡献（`ensure` / `status`） |
| `src/locales.ts` | 文案 |
| `selftest-summary.mts` | 摘要折叠自测（11 项） |
| `selftest-gateway.mts` | 宿主网关集成自测：假 ctx 走完 ensure、8 个工具、派发、完全访问拦截、完成回报（42 项） |
| `selftest-client.mts` | 浏览器半边自测（真 React + jsdom）：入口克隆官方按钮、图标/文案、点击打开会话、自动补回、卸载清理（15 项） |

三个自测用 `npm run selftest` 一起跑（需 Node 24 的类型擦除；本机 PowerShell 禁用了 `npm.ps1`，可直接 `node selftest-*.mts`）。
**改完代码务必先跑这三个**：`execute` 丢 `this`、服务名写错、注册错作用域、panellist id 与 main key 不一致这类问题只有它们会报。

## 数字助理的工具

| 工具 | 用途 |
|---|---|
| `list_workspaces` | 已有工作区（id、名称、路径、会话数） |
| `list_sessions` | 最近对话（id、标题、工作区、时间、是否在跑）——用来判断需求相关性 |
| `list_presets` | 可用的模式（agent preset）id |
| `list_models` | 可选的模型提供方与模型 |
| `read_session_summary` | 某个对话的压缩摘要 |
| `dispatch_task` | 在指定工作区**新建**对话并后台执行需求 |
| `send_to_session` | 把需求追加给**已有**对话（相关且不复杂时优先） |
| `create_workspace` | 新建工作区（仅在用户确认路径后调用） |

模式与模型的选择规则写在系统提示词里：**拿不准就不指定 provider/model**，让新对话沿用用户当前的默认模型。
（实现上，`dispatch_task` / `send_to_session` **总会**给会话带上 `agentOptions`——会话的 `{{model}}` 提示词变量
取自 `agent.options.model`，缺了它、又挂着会用到该变量的预设，会话第一次组装提示词就会直接失败。）

全局工具被 `tools.restrict({ allow: [...] })` 收窄到只剩提问类工具——数字助理不能读写文件、不能跑命令。
（真实环境里若 `ask_user_question` 不在全局层，会退化为黑名单模式，宿主控制台会打印告警。）

## 压缩摘要

```
【会话 session-…】标题 —— 正常完成，用时 1 分 20 秒
· 工作区：…
· 派给它的需求：…
· 规模：3 轮 / 11 步（其中 7 步带思考）
· 工具调用：read×5、glob×2、edit×3
· 中间正文：<每步一条，截断>
· 最终答复：<截断到 900 字>
· 改动文件：src/a.ts（新增）、docs/b.md（修改）
```

刻意**不含**思考内容与工具参数；文件改动由 `tool/call` + `tool/result` 自己配对折叠
（官方 `workspace/changes` 的内存摘要不覆盖子会话、也不持久）。
删除文件没有可信来源，故只区分新增/修改/未知。

## 权限

默认 `workspace-write`（工作区内修改）。要用 `danger-full-access` 必须：
数字助理先用 `ask_user_question` 让用户明确同意 → 再以 `user_confirmed=true` 调用 `dispatch_task`；
否则工具直接拒绝并说明怎么补确认。这条约束同时写在工具描述与系统提示词里。

## 开关、生效与回退

- 开关：`.jx-mods.json` 里的 `dsh-digital-assistant`（`package.json` 的 `jx.defaultEnabled` 为 `true`）；
  也可在「设置 → 插件 → 坚祥模组」里开关。**改开关或改代码都要重启服务。**
- 重新构建：`node build.mjs`（用仓库自带 tsdown，无需装依赖）。
- 回退：删掉 `插件\dsh-digital-assistant\` 整个目录（或把开关置 `false`）后重启。
  它只创建过一个「数字助理」工作区与一个 `session-jx-assistant` 会话，按需在界面上删掉即可。

## 已知边界

- 派发记录（谁在跑、回报过没有）只在宿主内存里：**服务重启后，重启前没跑完的派发不会再自动回报**。
- 回报以「一轮结束（`turn/end`）」为单位；用户手动接管该会话说话，也会触发一次回报（首轮回报后即停）。
- **「数字助理」那个工作区不能删**，也不要改 `ASSISTANT_CWD`（`dsh-home\assistant`）：会话必须挂在它里面，
  客户端才打得开；落脚目录一变，同一个会话会被两个工作区记账，官方启动校验直接判
  `workspace domain is inconsistent`，把 session-controller 一起拖成 pending。
- 入口文案取自**官方 locale 服务**（不能用 `document.documentElement.lang`——那段在页面早期是空的，
  算出来的文案会和官方词典对不上，兜底面板行就藏不掉、侧边栏出现两行）；语言就绪后靠一次 `resync()` 跟上。
- 入口靠**克隆官方「新建会话」按钮**实现（按 CSS Module 类名里的 `newSession` 定位，形态 `[hash]_newSession`）。
  官方哪天改了这个类名或按钮结构，克隆会失败——此时自动退回「面板槽里的一行」兜底形态：功能照常，只是样式
  变回官方的面板行（比「新建会话」小一号）。**官方升级后如果入口样式变了，先看这里。**
- 「不进侧边栏列表」是一条官方客户端源码改动（ui-workspace 的 `sessionVisible` 按固定 id 排除）；
  **升级官方版本时要重放这一条**。想让它照常出现在列表里，删掉那一条判定即可。
- 试过但否决的两条路：`origin: 'subagent'`（会话会被判为「子代理所有」、拒绝一切普通操作）；
  归档（`clearArchivedCurrent()` 会在列表快照变化时清空当前主视图——数字助理一说话用户就被踢出去）。
- 数字助理自己的上下文压缩机制尚未专门处理（用户要求后续再做）。
