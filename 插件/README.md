# 坚祥集中插件机制（当前基线：官方 DSH 0.1.6-alpha.2）

所有非官方插件（社区 + 自研）统一放在本文件夹（`插件\`），**一个模组一个子文件夹**。
数据不进 C 盘、不散落在官方各目录；官方仓库源码零改动（`git pull` 永不冲突）。

## 日常使用

| 操作 | 做法 |
|---|---|
| 启动 | 双击仓库根目录的 **`启动坚祥.bat`**（与 `启动DSH官方版.bat` 数据完全隔离，互不影响凭据） |
| 停止 | 关闭最小化的服务器窗口 |
| 管理模组 | 网页 → 设置 → 插件 → **坚祥模组** 标签页：开关、重新扫描；**重启服务后生效** |
| 安装新模组 | 把模组文件夹丢进 `插件\`，在「坚祥模组」页点「重新扫描」，重启 |
| 升级官方版 | 照常 `git pull` + `编译-官方版.bat`，本机制不受影响 |

## 模组清单（package.json）

```jsonc
{
  "name": "my-mod",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",          // 宿主半边入口（必须存在，哪怕是空 apply）
  // 可选：带浏览器界面时声明
  "exports": {
    ".": "./index.js",
    "./client": "./lib/client.js"  // 浏览器半边（官方 client bundle 工厂格式）
  },
  "dsh": { "client": { "inject": ["@deepseek-ai/dsh-client-ui-settings"], "platform": "web" } },
  // 坚祥扩展字段
  "jx": {
    "description": "显示在设置页的描述",
    "replaces": ["session-title-llm"],   // 启用本模组时要禁用的原生插件行 id
    "defaultEnabled": true               // 从未开关过时的默认状态
  }
}
```

- 纯宿主模组：`index.js` 导出 `export function apply(ctx) {...}`（纯 ESM，不能有 TS 语法）。
- 带界面模组：参照 `jx-demo-client\lib\client.js`（手写）或 `dsh-mod-manager`（tsdown 构建）。
- 开关状态存 `插件\.jx-mods.json`；补丁层生成到 `插件\.jx-mods.patch.yml`（勿手改，管理器自动维护）。
- 原生行 id 查询：`dsh --profile web --dump-config`（需设 `DSH_HOME` 指向 `dsh-home\`）。

## 机制原理（全部走官方正道）

```
启动坚祥.bat
  ├─ DSH_HOME=<仓库>\dsh-home          ← 官方环境变量：全部数据（profiles/凭据/会话）落在安装目录旁
  ├─ node 工具\jx-boot.mjs             ← 幂等准备：peer 依赖 junction、管理器自举行、空补丁层
  └─ node apps\cli\lib\bin.js web --patch 插件\.jx-mods.patch.yml   ← 官方 --patch 层：位于 home 层之上、高于一切原生
        ├─ dsh-home\cordis.patch.yml   ← home 层：只有一行（dsh-mod-manager 自举插入行）
        └─ 插件\.jx-mods.patch.yml     ← 模组层（管理器生成）：insert 模组行 + disable 被替换的原生行
```

- 挂载：insert 行的相对路径被官方 `anchorInsertedPluginNames` 锚定到补丁文件旁并转 file:// URL。
- 浏览器半边：官方 client-modules 自动扫描已挂载条目的 `dsh.client` 声明并伺服 bundle（无需任何注册代码）。
- 宿主依赖共享：`工具\jx-boot.mjs` 为声明了 `@deepseek-ai/*` peerDependencies 的模组建 node_modules junction，
  指向 `dsh-home\profiles\node_modules` 愈合池，保证 cordis 等宿主包全局单例。

## dsh-mod-manager（本机制的第一个模组）

`插件\dsh-mod-manager` —— 模组管理器自己就是一个模组（吃自己的狗粮）：

- 宿主半边（`lib/index.js`）：`jxMods` Remote（list / setEnabled / rescan），SRC 标记方式注册（无需生成工件）。
- 浏览器半边（`lib/client.js`）：手写 TYPERT_REMOTE 贡献 + `settings.plugins.tab` 槽注册「坚祥模组」标签页。
- 改代码后重新构建：`cd 插件\dsh-mod-manager && node build.mjs`（用官方仓库自带的 tsdown，无需装依赖）。

## 已知边界

- 换原生插件 = disable 原行 + insert 替代行（官方 patch 不能改写行的模块名，这是官方语义）。
- zip 安装、免重启热挂载暂未做（后续可在脚本/管理器里加解压能力）。
- 模组里的宿主代码必须是构建产物（.js / ESM），不能是 .ts 源码。
- **手写客户端 Remote 贡献（`TYPERT_REMOTE`）在官方 0.1.6+ 必须用 `create: () => <zod>`**：旧的 `schema: <zod>` 会被 `typert.validateCodec` 拒绝（"strict codec has no create() factory"），挂载失败会让整页进「Failed to load plugins」。宿主半边用原型 SRC 标记，不受此改动影响。
- 模组 `build.mjs` 的 zod 链接用「lstat 判本体 + 悬空则删重建」双检：安装目录改名或 zod 升版后链接悬空时能自愈（否则 symlinkSync 报 EEXIST，构建直接失败）。
- **重装依赖（pnpm install）或大版本升级后的首次冷启动**：client-modules 会把当时解析失败的浏览器半边永久缓存到重启为止（宿主半边不受影响）。表现为新模组设置页正常、但界面没出现——**再启动一次即恢复**。
