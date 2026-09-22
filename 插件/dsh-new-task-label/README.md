# dsh-new-task-label —— 「新会话」改叫「新工作任务」

把界面上的「新会话 / 新建会话」文案改成「新工作任务」，**完全走官方 locale（i18n）机制**，
零 DOM 文本匹配、零官方源码改动。

## 原理

官方客户端 locale 服务（`packages/client/locale`）原生支持「语言包插件」：
`locale.addLanguage()` 注册一个可选语言，`locale.register(ns, locale, dict)` 的单语言形式
专为语言包补充词典。本模组注册两个官方语言的变体：

| 变体 | 显示名 | fallback | 覆盖的键 |
|---|---|---|---|
| `zh-jx` | 中文·坚祥 | `zh` | `sidebar` ns：`session.new`、`session.new.label`；`workspace` ns：`session.new`、`actions.newSession.aria` |
| `en-jx` | English·Jianxiang | `en` | 同上四键的英文版（`New Work Task` 等） |

官方词典查找链是「活动语言 → fallback → en」（`packages/client/locale/src/client/index.ts`
的 `fallbackChain`/`lookup`），所以变体词典里没写的键自动落回官方译文——**除这几个键外，
整个界面一个字都不变**。用户切回官方「中文 / English」，文案即刻复原。

键与官方来源的对应（逐字核对过）：

- `sidebar/session.new`（「新会话」）—— 宽态侧栏按钮文字，`packages/client/ui-sidebar/src/client/SidebarRoot.tsx:249`
- `sidebar/session.new.label`（「新建会话」）—— 按钮的 `aria-label` 与折叠态 tooltip，同文件 :215/:241/:245
- `workspace/session.new`（「新会话」）—— 空白会话节点在会话列表里的标题，`packages/client/ui-workspace/src/client/rows/Rows.tsx:28`
- `workspace/actions.newSession.aria`（「在“{name}”中新建会话」）—— 行按钮 aria，同文件 :217

## 首次启用

装上并重启服务后，浏览器半边会把当前语言**一次性**迁移到变体（当前是中文 → `zh-jx`，
英文 → `en-jx`；`localStorage` 记号 `jx.new-task-label.migrated.v1` 只迁一次）。
之后用户在 设置 → 通用 → 语言 里选了别的语言，本模组不再干预；重新选回「中文·坚祥」即恢复替换。

## 与其他模组的共存

- 不动任何 DOM，侧边栏结构零变化——数字助理入口（克隆按钮）、dsh-plugin-entry 的隐藏
  「插件」行 CSS 都按 aria-label/类名工作，与本模组互不影响，不会出现重复行或丢行。
- `dsh.client.inject` 声明的三个包（locale / ui-sidebar / ui-workspace）均为信息性依赖边。

## 自测

```bat
node selftest-locale.mts
```

22 项断言：bundle 形态、两个变体语言的 fallback 链、4 份词典（2 ns × 2 locale）逐键值、
`{name}` 占位符保留、一次性迁移与记号、重复 apply 幂等、卸载后词典撤下。

## 回退

设置 → 插件 → 坚祥模组 关掉「dsh-new-task-label」重启；或在语言列表选回官方「中文」。
彻底删除：关开关 → 重启 → 删 `插件\dsh-new-task-label\`。
