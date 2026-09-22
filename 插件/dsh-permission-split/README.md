# dsh-permission-split —— 权限分离（坚祥模组）

把官方的「权限」从**单选预设**补成**两列模型**：

| 列 | 内容 | 归属 |
|---|---|---|
| 左列 | 官方预设（沙箱模式 × 审批策略） | 官方，**行为与写路径完全不动** |
| 右列 | 三项会话内能力授权，方框多选 | 本模组 |

三项能力：

- `browser` —— 允许操作浏览器（派生浏览器进程）
- `computer` —— 允许操作电脑（鼠标/键盘/屏幕）
- `shell` —— 允许沙箱外执行命令程序

**目的**：勾上某项能力后，模型调用该类工具**不再弹窗**——审批请求被直接认领，
官方与客户端的应答者根本不会被问到。

## 为什么需要它

v2 的 `ApprovalOutcome` 只有四个值：`allowed-once` / `rejected` / `cancelled` /
`unavailable`——**没有「会话内始终允许」**。v1 曾实现过 `allowed-always`（见
`坚祥数字助理/.agents/notes/implemented/feature/2026-08-20-sandbox-always-allow`），
v2 回退掉了。本模组把它带回来，并按用户决策扩成三项能力。

官方客户端 `ApprovalDecision` 同样硬编码两值
`'allowed-once' | 'rejected'`，`ApprovalPanel` 只有两个按钮——
**从协议到按钮整条链都缺**。

## 宿主半边（已实现）

`src/index.ts` → `lib/index.js`（6.8 kB）。

- **能力定义**：`CAPABILITIES`、`NO_GRANTS`、`Grants`、`normalizeGrants()`、`anyGranted()`。
- **网关** `JxPermissionGateway`（`ctx.jxPermission`），Remote 方法 `get` / `set` / `clear`；
  构造与远程方法标记的写法对照官方 `PluginInventoryGateway` 与既有模组 `dsh-mode-switch`。
- **存储：双写**。会话日志记一条 `jx/permission-split` 事件（审计 + 可重放），
  内存表供同步读取。授权判定在工具执行热路径上，**不能**是异步投影查询。
- **事件必须标 `ignorable: true`**：未知事件类型且未标该标记时，harness
  **拒绝解析整个日志**（`storage-contract.ts`）。本模组的事件是纯信息性的，
  其丢失不影响会话重建。官方明确该标记就是下游插件的兼容机制
  （`known-event-types.ts`：事件名登记被否决）。
- **「会话内有效」是天然语义**：进程重启后内存清零，退化为全关，fail closed。
- **沙箱外执行复用官方开关**：调用官方 `setSandboxMode(session, 'danger-full-access')`，
  执行侧与 `sandboxMode` 投影**无需任何新机制**。该授权只开「沙箱外运行进程」这一含义，
  文件权限轴仍由官方 Access 控件自行掌控（沿用 v1 的决策）。
- **执行点：已授权能力上的审批请求直接被认领**（`installApprovalBypass`）。
  **返回 outcome 即认领**，弹窗不会出现；未授权时一律 `next()` 交还瀑布，fail closed。
  调用约定照抄官方 `ApprovalService.request`：
  `ctx.waterfall(scopeTarget(agent, agent), 'approval/request', req, fallback)`。
  监听器在**构造器**里装（类形式插件不保证被调用 `start()`）。
- **工具名 → 能力**（`capabilityOfTool`）用片段匹配以容忍各 provider 命名差异，
  刻意**不含** `tool-bash` / `tool-pwsh`：那条路径由官方审批与沙箱升级掌管，
  并被其它策略依赖；`shell` 能力只表示「允许沙箱外执行」，不吞 shell 工具的审批。

冒烟（`dsh-home/profiles/web/smoke-permission-split.mjs`，**24 项全通过**）分三层：

1. **加载与导出**：模块可导入、三项能力、`NO_GRANTS` 全关、默认导出为网关类。
2. **纯函数**：`anyGranted` 两态、`normalizeGrants` 丢弃未知键且只认真布尔 `true`、
   远程方法标记含 `get`/`set`/`clear`、`capabilityOfTool` 七个用例。
3. **真实瀑布行为**（关键）：用真 `Context` 与真 `ctx.waterfall` 驱动，
   下游挂一个计数应答者代表弹窗——

   | 场景 | 断言 |
   |---|---|
   | 未授权调 `browser_click` | 委托下游（`prompted` +1）= 会弹窗 |
   | 授权后调 `browser_click` | 直接 `allowed-once`，**下游计数不变** = 不弹窗 |
   | 未授权的 `computer_use` | 仍弹窗（按能力隔离） |
   | `read_file` 等非能力工具 | 不受影响，走官方审批 |
   | 仅授权 `shell` 后调 `tool-bash` | 仍弹窗（不吞 shell 审批） |
   | `clear()` 撤回后 | 恢复弹窗 |

## 客户端半边：两列权限菜单（已实现）

`src/client.tsx` → `lib/client.js`（16.3 kB）。官方 `ui-permission` 那一行已被
`jx.replaces` 禁用（实测补丁层已生成 `ui-permission: disabled: true`），
于是 slot `conversation.input.permission` 归本模组，**不改官方源码**。

- **只出现官方那一颗胶囊**：trigger 样式照搬官方 `PermissionSelect.module.css`，
  点开是两列弹层。左列官方预设（写路径照搬官方：提交 `/permission <preset>` 命令行），
  右列三项能力用方框多选。
- **响应式走规范通道**：控制器状态经 `hooks` 舱（裸 observable）交给渲染器绑成
  `usePermissionSplit`，组件只读 hook，不自建订阅。
- **外观只用官方 token**（`--dsw-*`）；不引官方包的 CSS Module，
  整表挂进 `document.head` 一次。
- 客户端产物必须是 `window.__ModuleLoader__.load({ id, factory })` 的 **CJS 工厂**，
  不能是裸 ESM——宿主把所有插件的 client.js 拼成一个响应下发，
  其中一个含 `export` 会让**整份响应**解析失败、全部插件一起加载不出来。

产物校验（`dsh-home/profiles/web/smoke-permission-split-client.mjs`，8 项全通过）：
直接装载该外壳，断言它不是裸 ESM、注册 id 正确、工厂导出 `apply` 且声明 `inject`，
并逐项证明外部模块引用都已声明。

## 未接线：审批弹窗第三个按钮

`src/contract.ts` 与 `src/ApprovalPanel.tsx` 已写好但**未接线**：

- `contract.ts` —— 把官方两值的 `ApprovalDecision` 扩成三值
  （`'allowed-once' | 'allowed-always' | 'rejected'`），并自带一份
  `PendingApproval`（官方那个类的 `answer()` 也只接受两值）。
- `ApprovalPanel.tsx` —— 复制官方面板外观，仅在**升级类审批**上多渲染一个
  「会话内始终允许」按钮（`isEscalationReason()` 从 reason 识别升级语义，沿用 v1 做法）。

未接线的原因：要让它生效必须**替换官方 `conversation.composer` 面板**
（该 slot 由 `ui-approval` 拥有），也就是重新实现 pending-interaction 注册与
`answerApproval` 全流程；而浏览器侧无法做视觉验证（冷启动端口被在线实例占用）。
用一个未验证的组件替换核心审批 UI，风险大于收益——**宁可少一个按钮，也不弄坏审批流**。
接线后需用 `DSH_SNAPSHOT=replay pnpm run test:web` 做装配验证。

## 构建与接线

```sh
node build.mjs                # 产出 lib/index.js 与 lib/client.js
node ../../工具/jx-boot.mjs   # 建立 peer junction 指向愈合池
```

`jx-boot.mjs` 会为本模组建立 `cordis` / `dsh-sandbox-policy` /
`dsh-typert-protocol` / `dsh-user-approval` 等 junction 指向
`dsh-home/profiles/node_modules`。**新模组必须先跑一次 jx-boot**，
否则 `lib/index.js` 解析不到宿主包（表现为 `ERR_MODULE_NOT_FOUND`）。

模组开关在 `插件/.jx-mods.json`；`jx-boot.mjs` 由它重新生成
`插件/.jx-mods.patch.yml`。

### 踩过的坑：第三方库必须打进客户端产物

第一版客户端把 `zod` 列为 external，产物里于是出现 `require("zod")`，
而 Web shell 的模块表**不提供 zod**——浏览器加载本插件时 require 直接抛错。

对照可正常工作的 `dsh-mode-switch`：它同样用 zod，但**把 zod 打进产物**、
不向模块表请求。所以客户端产物只应把 baseline
（`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/*`）保持 external。

最终做法是**彻底不用 zod**：远程描述所需的 codec 用轻量内联 schema 占位即可，
那些值只是普通 JSON，严格校验由宿主侧的真实 codec 负责。
现在产物请求的模块与 `dsh-mode-switch` **逐项一致**。

验证方式（不启动服务器即可做）：

```sh
grep -o 'require("[^"]*")' lib/client.js | sort -u
```

再配合 HTTP 面确认服务器确实下发：跑一次 `dsh web`，
首页 HTML 里应出现 `/plugins/??<id>/client.js`，且该 URL 返回 200。

## 已知限制

- 审批弹窗的第三个按钮**未接线**（见上）。
- 浏览器/电脑两项能力目前只**记录授权**；「免弹窗」这一半已生效
  （`approval/request` 认领），但 provider 自身的执行点强制需在挂载
  browser-use provider 后另行对齐（v2 该 provider 实验性且默认不挂载）。
- `shell` 授权会把会话沙箱切到 `danger-full-access`，这是一次**整轴**切换
  （v2 沙箱只有一根轴），无法只放开进程而保留文件轴——与 v1 的双轴行为有差异。
- 两列菜单**尚未在真实 GUI 里点开看过**。已验证的是：宿主半边在真实启动中装载无告警、
  客户端产物被模块表接纳并 HTTP 200 正常下发、执行行为 24 项冒烟全通过。
  剩下的只是视觉确认（布局、间距、深浅色主题）。
