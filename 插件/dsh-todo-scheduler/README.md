# dsh-todo-scheduler — 待办事项与定时任务

在侧边栏原官方「插件」按钮的位置（该行已被 dsh-plugin-entry 隐藏，本行 order 5 接在同一槽位）提供一个
「待办事项与定时任务」入口，页面风格沿用官方原生插件页（居中 960px、卡片列表、官方 ui-primitives 组件）。
任务分两类：**AI 任务**到点转交数字助理执行，**程序任务**到点直接运行命令；执行记录与结果入口都在页面里。

## 功能

- **两种任务类型**（新建时二选一，卡片上有类型徽标）：
  - **AI 任务**：到点把描述原样转交给**数字助理**主对话，由它安排执行（派子会话、选工作区、汇报结果都是它的事）。这里**不做**任何工作区/模式/模型设置。
  - **程序任务**：到点用官方 `subprocess` 在指定**工作目录**直接运行一条命令（显式 argv、不过 shell、stdout 64 KB / stderr 16 KB 上限、默认 10 分钟超时中止），退出码与输出节选记进执行记录。**参数按空格分隔**（不支持引号包裹含空格的参数）。
- **任务字段**：标题、描述（派活原文）、任务类型、启用/停用开关、执行方式、目标（仅程序任务选工作目录）。
- **执行方式**（六种）：不定时（manual，只手动跑）、定时一次（once）、每天（daily）、每周某几天（weekly）、仅工作日（weekdays）、每隔 N 分钟（interval，1–43200 分钟）。
- **列表**按下次执行时间排序；支持新建 / 编辑 / 删除（两段确认）/ 启用停用 / 立即执行。
- **执行记录**：触发时间、触发方式（定时 / 手动 / 错过补跑）、成败、摘要（AI 任务=「已转交数字助理」+ 会话入口；程序任务=退出码与输出/报错节选）、「查看会话」跳转。
- **新建/编辑弹窗**经 React portal 渲到 `document.body`：遮罩盖满整页（页面树里带 transform 的容器会把 fixed 遮罩裁成一列），表单为两列等宽栅格、标签固定单行。
- **边界纪律**：时间未到不提前跑；同一槽点不重复触发（派发前先落 `lastRunAt`）；程序没开着时错过的任务**不自动补跑**，启动后在页面顶部提示「有 N 条已错过」，逐条选择补跑或忽略；间隔类落后超过一个节拍同样只提示不追赶。

## 执行方式（复用既有能力）

- **AI 任务**：`ctx.get('jxAssistant')` 拿数字助理网关 → `ensure()` 保证主对话在场 → `agents.get(sessionId)` → `agent.followup(..., source: 'user')`（按用户消息显示，条目 79）。**转交即完成**：不等待数字助理跑完，记录立即落「已转交」，会话 id 即数字助理主会话。派发与汇报是数字助理自己的职责（它的提示词与 `dispatch_task` 工具），本插件只负责「到点投递」。
- **程序任务**：官方 `ctx.subprocess.spawn({ argv, cwd, stdio 收集上限, graceMs, signal })` + `waitForExit()` + `collected.*.readFrom(0)`（与 dsh-git-panel 同一用法），不经过模型。
- 宿主侧 API 是 Typert Remote 服务 `jxTodo`（`static inject = ['agents','workspaceRegistry']`），客户端经 `ctx.remote.$mount` 得到 `ctx.remote.jxTodo`。

## 数据位置

`<DSH_HOME>\jx-todo\tasks.json`（默认 `dsh-home\jx-todo\tasks.json`），**格式 version 2**：

- v1 数据（无 `executor` 字段）载入时自动迁移：全部视为 AI 任务，落盘即升级为 v2。
- 首次启动写入一条**不定时**预置 AI 任务「手机端访问：解锁局域网 + 扫码入口」（描述含实施方案引用，不会自动执行）。
- 写入为临时文件 + 原子改名；文件损坏时改名保留为 `tasks.json.bad-<时间戳>` 再按空清单重建，不丢现场。
- 放在 DSH_HOME 而不是插件目录：插件目录属于代码，升级/重装会被清掉；DSH_HOME 是用户数据区（会话、配置都在这），随实例生命周期存续。

## 目录结构

```
package.json       模组清单（jx.defaultEnabled: true，默认启用）
index.js           宿主空入口（真正的服务在 lib/index.js 由 main 暴露）
lib/index.js       宿主半边：JxTodoGateway（Typert Remote 服务 + 20s 调度 tick + 两类执行）
lib/client.js      浏览器半边：词典 + 样式 + main 面板 + sidebar.panellist 行
selftest-*.mts     四个自测：调度纯函数 / remote 工件 / 宿主网关 / jsdom 渲染
```

## 构建与自测

```sh
node build.mjs        # tsdown 双半边（用官方仓库自带 tsdown；zod 链接进本包仅构建期用）
node selftest-schedule.mts   # 48 项：到期/错过/不重复/不追赶的时间边界
node selftest-remote.mts     # 22 项：descriptors 与 zod codec（官方要求的 create 工厂）
node selftest-gateway.mts    # 53 项：假 ctx 走完两类执行全链路、v1 迁移、错过补跑、tick 防重
node selftest-client.mts     # 49 项：jsdom 真渲染页面/表单/类型切换/portal 遮罩/记录跳转
```

## 启用

`jx.defaultEnabled: true`，无需在模组管理里手动开。改动生效：关掉服务窗口 → `启动坚祥.bat` →
设置 → 插件 → 坚祥模组「重新扫描」→ 再次重启（两步重启是官方 patch 机制的要求）。
