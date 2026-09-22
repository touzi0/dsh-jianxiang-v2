# tools/office-runtime — Office 能力与运行时依赖

源码检出的 DSH 只带 `office-to-pdf`（格式转换）的**行**，不具备**编写** Office 文档的
能力，也不具备**读取** PDF 的能力，且多个上游新插件没有链接进 profile 的解析池而不声不响地失效。
本目录把这三件事补齐，并记录与官方桌面端的差异。

## 〇、PDF 读取能力

官方**没有**提供 PDF 读取技能（它给的是 skill 机制 + 装了库的 Python 运行时，
把"要不要读某种文件"留给 skill 作者）。本目录补上一个 `pdf` 技能，与官方那三个
Office 技能同构：SKILL.md 是给模型的指令，`scripts/pdf_tool.py` 是共享脚本。

| 通路 | 库 | 用途 |
|---|---|---|
| `text` | pypdfium2 | 文本型 PDF 抽文字 |
| `image` | pypdfium2 | 整页渲染成 PNG，交给支持图片的模型直接看（**扫描件唯一可行通路**） |
| `embed` | pypdf | 抽取内嵌位图（照片、扫描图、图表） |

选型理由：`pypdfium2`（Apache-2.0 / BSD-3）与 `pypdf`（BSD-3）都是宽松许可，
可随自建桌面端发行。**不要换成 PyMuPDF**：它是 AGPL-3.0，会传染发行物。

两个 wheel 已写入 `apps/desktop/scripts/primary-runtime-lock.json` 的 `wheels`
与 `pythonPackages`，因此由 `build-office-runtime.mjs` 与官方打包流程
（`prepare-primary-runtime.ts`）**共同**安装，版本与 SHA-256 同源。

## 一、Office 编写能力

官方桌面端由三块拼成，其中第三块必须自行准备：

| 组成 | 来源 | 源码检出状态 |
|---|---|---|
| `@deepseek-ai/dsh-skill-office` | `packages/skill/skill-office` | 源码内已有，但未链接进解析池 |
| `load_workspace_dependencies` 工具 | `apps/desktop-host/src/workspace-dependencies.ts` | 源码内已有 |
| **可重定位运行时载荷** | 桌面端打包时生成 | **需要本目录构建** |

载荷是一个不依赖系统环境的便携 Python 3.12 发行版，内含
`python-docx`、`python-pptx`、`openpyxl`、`pandas`、`numpy`、`Pillow`、`lxml`、
`XlsxWriter`，另附 Node、pnpm，以及三个 skill 的指令与只读结构检查器
`check_office.py`。因此它不改动 `PATH`，也不需要机器上装过 Python。

### 构建载荷

```sh
node tools/office-runtime/build-office-runtime.mjs --root dsh-home/office-runtime
```

版本与 SHA-256 全部取自 `apps/desktop/scripts/primary-runtime-lock.json`——
与官方桌面端打包共用同一份锁定清单，本脚本不放宽任何校验。归档缓存到
`<root>/.cache`，重复构建不重新下载。

产出布局刻意与桌面端一致，故 `apps/desktop-host` 的 `installPrimaryRuntime`
可以直接消费：

```
<root>/primary-runtime/
  runtime.json                     # 组件版本与载荷摘要
  dependencies/python/             # 便携 Python 与 Office 库
  dependencies/node/               # 便携 Node
  dependencies/pnpm/               # pnpm
<root>/office-skills/              # office-docx / office-pptx / office-xlsx 与 scripts/
```

| 参数 | 含义 |
|---|---|
| `--root` | 必填；产出根目录 |
| `--cache` | 归档缓存目录，默认 `<root>/.cache` |
| `--target` | 构建目标，取值 `win-x64` / `mac-arm64` / `mac-x64`，默认当前主机 |

### 端到端自检

```sh
node tools/office-runtime/verify-runtime-chain.mjs
```

它用 `apps/desktop-host` 的真实模块依次跑 `readPrimaryRuntime` →
`installPrimaryRuntime` → `workspaceDependencyPaths`，并校验重复安装幂等。

## 二、解析池修复（这是"能力消失"的真正原因）

profile 的 `node_modules` 是 pnpm hoisted 布局：工作区包软链到 `packages/`，
外部包软链到根 `.pnpm`。上游给 bundle 加了新插件而池未同步时，
`cordis.yml` 里那些行**按包名解析失败并被静默跳过**——没有报错，能力整体消失。

```sh
node tools/office-runtime/audit-profile-plugins.mjs          # 报告哪些行解析不到
node tools/office-runtime/repair-profile-pool.mjs            # 报告可补的链接
node tools/office-runtime/repair-profile-pool.mjs --fix      # 补上
```

修复后 `cordis.yml` 引用的包名全部可解析。补链接不改动任何已有条目，
也不触碰已提交的 `pnpm-lock.yaml`。

> 不要用 `pnpm install` 在 profile 目录里"修"这件事：profile 的
> `package.json` 走 `dsh.profile.bundles`，其工作区并不包含本仓库的 `packages/`，
> 直接安装会把池里的源码链接替换成 npm 上的发布版。

### 全量对比

```sh
node tools/office-runtime/audit-parity.mjs
```

它对比「工作区全部包」与「池里可解析的包」，并区分三类：

| 类别 | 含义 | 处理 |
|---|---|---|
| 组合引用了但解析不到 | **已经在用却没生效**，静默失效 | 必须补 |
| 公开包但未链接 | 选装能力，用户启用时会失效 | 一并补，避免埋雷 |
| private 包 | 不对外发布，由桌面端打包流程收进核心包集 | 不进池 |

private 包只有 `apps/desktop-host`（Electron 宿主入口，与 profile 无关）。
`repair-profile-pool.mjs` 现在按同一口径补齐：组合引用的 + 工作区全部公开包。

## 三、接入运行环境

载荷就绪、池补好后，在 `dsh-home/cordis.patch.yml` 中插入 `desktop-office`
组合位（`apps/desktop-host/src/office.ts`）：其 `config.source` 指向
`<root>/primary-runtime`，`config.root` 为安装目录。它会挂载工作区依赖查询工具，
并把三个 Office skill 注册进 skill 注册表。`skill` 与 `tool-skill` 由 `standard`
Agent 预设提供，无需在 profile 层重复启用。

之后模型可通过 `skill` 工具加载 `office-docx` / `office-xlsx` / `office-pptx`。

## 四、浏览器能力与沙箱

浏览器 provider（`browser-use` + `chrome-devtools-mcp` / `playwright-mcp` /
`stagehand`）与电脑操作 provider（`computer-use` + CUA driver）**官方默认也不挂载**：
base bundle 里没有任何对应行，`OPTIONAL_BUNDLES` 只含两个 agent-team profile。
它们是"可启用"，不是"默认开"。

启用示例（放进 profile 的组合层，**必须在 Session 创建或恢复之前**挂载——
provider 不会接管已激活的会话）：

```yaml
- name: '@deepseek-ai/dsh-browser-use'
- name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
  config:
    mode: launch          # 或 attach + endpoint
    headless: true
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
```

`executablePath` 指向本机已装的 Chrome 即可，无需下载 Chromium。

```sh
node tools/office-runtime/verify-browser-launch.mjs "$PWD"
```

该脚本用仓库内 `@playwright/mcp` 自带的 `playwright-core` 驱动本机 Chrome，
验证"启动浏览器 → 读 DOM → 真实导航"整条链路。

> **沙箱前提**：DSH 自身的进程沙箱默认拦截派生浏览器进程
> （表现为 `browserType.launch: spawn EPERM`）。浏览器能力要真正生效，
> Host 需以允许派生该进程的权限运行；`danger-full-access` 模式下已验证可用。

## 五、与官方桌面端的关系

**两端用的是同一套 bundle 栈**：`PROFILE_TEMPLATES` 里没有 `desktop` 模板，
`apps/desktop/src/project-manager.ts` 用 `WEB_PROFILE.bundles` 初始化桌面 profile，
即 `dsh-base` + `dsh-web-app`，与源码检出的 `profiles/web` 逐字相同。

因此"桌面端有、源码版没有"通常不是缺源码，而是**池没同步**：
包都在 `packages/` 里、都构建好了，只是没被链接进解析池，运行时静默跳过。
本目录的两支脚本就是修这个。

桌面端打包走 `apps/desktop/scripts/prepare-primary-runtime.ts`，下载同一批锁定归档
写入 Electron 构建资源目录，并把 `packages/skill/skill-office/assets` 复制到
`primary-runtime` 的同级 `office-skills/`。本目录的构建脚本是该流程的等价物，
只是产出到 Harness home，供源码检出使用。自建桌面端时两者可并存：打包脚本负责
发行资源，本脚本负责开发机上的同名载荷。
