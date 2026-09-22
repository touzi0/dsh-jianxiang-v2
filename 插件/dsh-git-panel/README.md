# dsh-git-panel —— 右侧面板里的 Git 面板（只读）

在右侧面板加一个 `Git` 标签页：识别当前会话工作目录所在的 git 仓库，只读展示

- 仓库：当前仓库根 + 同目录下扫描到的其它仓库（可切换）；目录不是仓库时给出明确提示，不报错
- 分支、上游、领先/落后（`↑ahead ↓behind`）、工作区是否干净
- 改动文件：**已暂存 / 未暂存 / 未跟踪**（有冲突时多一组「冲突」），带 `M/A/D/R/C/T/??/U` 状态标记
- 点文件看 **逐行 diff**：`+`/`-`/`@@`/头部各自配色；大 diff 先渲染 400 行、可展开；二进制只说明不渲染
- 提交历史：最近 30 条（短哈希/标题/作者/时间），点开看该次提交的改动文件清单与 diff
- 手动「刷新」按钮；面板打开、切换仓库、页面重新可见时自动拉一次（不做文件监听）

**本阶段只读**：没有任何提交、推送、回滚、暂存按钮；宿主半边只允许 `rev-parse` / `status` / `diff` / `log` / `show` 五个读数子命令。

## 怎么用

1. 打开右侧面板（会话标题栏右上角的展开按钮）。
2. 点会话标题栏上的 **Git 入口按钮**（分支图形图标）——它会打开右侧面板的 Git 标签页。
   - 右侧面板的「加号」只打开官方的引导页，插件的页由 `ctx.sidebarRight.openTab(kind)` 打开，所以入口做成了 header 按钮。
3. 左侧「坚祥模组」页可开关本模组（**改开关或改代码都要重启服务**）。

## 数据来源与安全边界

| 关注点 | 做法 |
|---|---|
| 执行缝 | 官方 `ctx.subprocess`（`packages/subprocess/subprocess`）：显式 argv、**永不过 shell**、输出上限、`AbortSignal` 超时（15s）+ `graceMs` 终止宽限 |
| 只读保障 | 白名单子命令；环境固定 `GIT_CONFIG_COUNT=0` / `GIT_TERMINAL_PROMPT=0` / `GIT_OPTIONAL_LOCKS=0`（不弹凭据、不抢 index 锁）/ `LC_ALL=C` |
| 防注入 | 不拼命令字符串；路径作为 `--` 之后的独立 argv 元素；提交标识必须是 4–40 位十六进制 |
| 路径边界 | 浏览器只能选**宿主自己扫描出的候选仓库根**，给别的路径一律落到默认仓库 |
| 输出边界 | stdout 4MB 上限并标记截断；diff 文本 200KB；状态列表 1000 条；历史 30 条（+1 判定「还有更早的」） |
| 渲染安全 | diff 与路径全部作为 React 文本节点渲染（自动转义），**不用 `innerHTML`** |
| 会话目录 | `ctx.sessions.get(sessionId)?.header.cwd`（活会话）；取不到时明确报「会话没有工作目录」 |

## 文件结构

```
插件\dsh-git-panel\
  package.json       模组清单（jx.defaultEnabled: true）
  tsdown.host.ts     宿主半边打包（@deepseek-ai/* 保持 external，不 minify——SRC 网关要读参数名）
  tsdown.client.ts   浏览器半边打包（平台基线 9 个模块 external，zod 内联）
  build.mjs          一条命令构建两半（自动链 .pnpm 里的 zod、去产物行尾空白）
  src\git.ts         纯逻辑：porcelain=v2 解析分组、日志/改动清单解析、字节截断、伪 diff、仓库扫描
  src\diff-lines.ts  unified diff 行分类（两半与自测共用）
  src\index.ts       宿主半边：JxGitGateway（Typert Remote，方法 status/diff/log/show）
  src\remote-client.ts  手写 TYPERT_REMOTE 贡献（codec 用 0.1.6+ 要求的 create: () => zod）
  src\locales.ts     中英文案
  src\client.tsx     浏览器半边：注册标签页类型 + 正文 + 会话 header 入口，渲染整个面板
  selftest.mjs       纯逻辑自测（43 项）
  selftest-live.mjs  真机自测：临时目录造真仓库，用真 git 输出验解析（24 项）
  lib\               构建产物（index.js + client.js）
```

## 自测与构建

```powershell
cd 插件\dsh-git-panel
node build.mjs          # 重新构建两半
node selftest.mjs       # 纯逻辑
node selftest-live.mjs  # 真机 git 输出（在系统临时目录造仓库，不碰工作区）
```

## 已知限制

- **未跟踪文件**在 git 里没有 index 版本，`git diff` 为空；面板用文件内容合成「整份新增」伪 diff（>1.6MB 或含 NUL 的文件只给说明）。
- 合并提交的 diff 用 `git show` 的默认呈现（可能只显示合并摘要），不做父提交比较。
- 大仓库首次 `status` 可能接近秒级；有 15s 超时兜底，超时会被终止并提示。
- 扫描候选仓库只覆盖「当前仓库根的上一级目录向下两层、跳过 node_modules 等依赖目录、预算 400 个目录」，不是全盘搜索。
- 面板宽度、标签页布局由官方右侧面板决定；本模组只贡献页内容。
