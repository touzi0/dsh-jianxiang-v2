# dsh-permission-split —— 权限分离（坚祥模组）

把官方的「权限」从**单选预设**补成**两列模型**：

| 列 | 内容 | 归属 |
|---|---|---|
| 左列 | 官方预设（沙箱模式 × 审批策略） | 官方，**样式与行为完全不动** |
| 右列 | 三项会话内能力授权，方框多选 | 本模组 |

三项能力：

- `browser` —— 允许操作浏览器（派生浏览器进程）
- `computer` —— 允许操作电脑（鼠标/键盘/屏幕）
- `shell` —— 允许沙箱外执行命令程序

## 为什么需要它

v2 的 `ApprovalOutcome` 只有四个值：`allowed-once` / `rejected` / `cancelled` /
`unavailable`——**没有「会话内始终允许」**。v1 曾实现过 `allowed-always`（见
`坚祥数字助理/.agents/notes/implemented/feature/2026-08-20-sandbox-always-allow`），
v2 回退掉了。本模组把它带回来，并按用户决策扩成三项能力。

同时，官方 `ApprovalDecision`（客户端）也是硬编码两值联合
`'allowed-once' | 'rejected'`，`ApprovalPanel` 只有两个按钮——**从协议到按钮整条链都缺**。

## 已完成：宿主半边

`src/index.ts` → `lib/index.js`（`node build.mjs` 构建，4.2 kB）。

- **能力定义**：`CAPABILITIES`、`NO_GRANTS`、`Grants`、`normalizeGrants()`、`anyGranted()`。
- **网关** `JxPermissionGateway`（`ctx.jxPermission`），Remote 方法 `get` / `set` / `clear`；
  构造与远程方法标记的写法对照官方 `PluginInventoryGateway` 与既有模组 `dsh-mode-switch`。
- **存储：双写**。会话日志记一条 `jx/permission-split` 事件（审计 + 可重放），
  内存表供同步读取。授权判定在工具执行热路径上，**不能**是异步投影查询——
  这是本实现最初的 bug：曾假设存在 `jxPermissionSplit` 投影单元，而投影必须注册才能读，
  那样授权会永远读回全关。
- **「会话内有效」是天然语义**：进程重启后内存清零，退化为全关，fail closed。
- **沙箱外执行复用官方开关**：调用官方 `setSandboxMode(session, 'danger-full-access')`，
  因此执行侧与 `sandboxMode` 投影**无需任何新机制**。该授权只开「沙箱外运行进程」这一含义，
  文件权限轴仍由官方 Access 控件自行掌控（沿用 v1 的决策）。

- **执行点：已授权能力上的审批请求直接被认领**（`installApprovalBypass`）。
  这是本模组真正的目的——勾上之后，模型调用该类工具**根本不弹窗**：
  在 `approval/request` 瀑布上返回 outcome 即认领请求，官方与客户端的应答者
  （弹窗）不会被问到；未授权时一律 `next()` 交还瀑布，fail closed。
  调用约定照抄官方 `ApprovalService.request`：
  `ctx.waterfall(scopeTarget(agent, agent), 'approval/request', req, fallback)`。
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

## 待实现：客户端半边

`src/client.ts` 目前是**空实现**（只为让 `dsh.client` 清单引用的 `lib/client.js` 存在，
浏览器侧装载不报错）。因此**目前没有界面可勾**——执行侧与协议已就绪，
但要让用户在界面上勾选，还需要下面两块 UI。

### 1. 权限菜单两列化

`package.json` 已声明 `jx.replaces: ["ui-permission"]`，实测补丁层已生成
`ui-permission: disabled: true`——官方那一行让位，slot `conversation.input.permission`
已归本模组。**不需要改官方源码。**

新组件要做的是：左列照抄官方 `PermissionSelect` 的预设单选（`Menu` + 盾牌图标 +
`FULL_ACCESS`/`AUTO_REVIEW` 的风险确认流程），右列三项能力用方框多选，
数据读写走 `jxPermission` Remote 的 `get`/`set`。**只出现一个胶囊**，就是官方那颗。

参考：官方 `packages/client/ui-permission-presets/src/client/PermissionSelect.tsx`
（235 行，含 `permissionGlyphs` 与 `RiskConfirmation` 用法）。

### 2. 审批弹窗第三个按钮

按 v1 的做法，**仅在沙箱升级类审批**上渲染「本对话中始终允许」，非升级审批保持两按钮。

需要先扩两个签约类型（各自是闭合联合，加值即可，旧消费者不受影响）：

- 宿主：`packages/interaction/user-approval/src/types.ts` 的 `ApprovalOutcome` 加 `'allowed-always'`
- 客户端：`packages/client/ui-approval/src/client/contract/slots.ts` 的 `ApprovalDecision` 加 `'allowed-always'`

然后在 `set` 路径上：`allowed-always` → 打开对应能力授权（升级类走 `shell`）。

## 构建与接线

```sh
node build.mjs          # 产出 lib/index.js 与 lib/client.js
node ../../工具/jx-boot.mjs   # 建立 peer junction 指向愈合池
```

`jx-boot.mjs` 会为本模组建立 `cordis` / `dsh-sandbox-policy` / `dsh-typert-protocol`
三个 junction 指向 `dsh-home/profiles/node_modules`。**新模组必须先跑一次 jx-boot**，
否则 `lib/index.js` 解析不到宿主包（表现为 `ERR_MODULE_NOT_FOUND`）。

## 已知限制

- 客户端半边未实现，所以目前**只有协议与执行，没有界面**。
- 浏览器/电脑两项能力目前只是**记录授权**，尚未在执行点强制；
  v2 的 browser-use provider 是实验性且默认不挂载，强制点需在挂载该 provider 后另行对齐。
- `shell` 授权会把会话沙箱切到 `danger-full-access`，这是一次**整轴**切换
  （v2 沙箱只有一根轴），无法只放开进程而保留文件轴——与 v1 的双轴行为有差异。
