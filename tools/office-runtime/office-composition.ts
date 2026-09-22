/** 源码检出侧的 Office 组合：与官方 `apps/desktop-host/src/office.ts` 复用同一组合。 */

import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import * as officeSkills from '@deepseek-ai/dsh-skill-office'
import * as workspaceDependencies from '../../apps/desktop-host/src/workspace-dependencies.ts'

/**
 * 官方桌面端的 Office 组合，逐字复用 `apps/desktop-host/src/office.ts` 的两步：
 * 挂载工作区依赖查询工具，再把三个 Office skill 注册进 skill 注册表。
 *
 * 为什么不直接用 desktop-host 的入口文件：`apps/desktop-host/lib/index.js` 是
 * **宿主进程入口**（由 Electron 以 argv + IPC 派生），导入后没有任何命名导出，
 * 因此不能被 Cordis 当作插件装载。官方是在启动宿主进程后**命令式**调用
 * `ctx.plugin(office, config)`；本插件把同一次调用搬到 Loader 行上，
 * 从而在源码检出的 web profile 里拿到同一组合结果。
 */
export const name = 'desktop-office'
/** 组合位自身的配置；子插件声明各自的服务依赖。 */
export interface Config {
  /** 载荷父目录；缺失同级 `office-skills` 会导致激活失败。 */
  readonly source: string
  /** 工作区依赖的安装根目录。 */
  readonly root: string
}

/**
 * 启用离线 Office 编写与结构检查。
 * @param ctx - profile 作用域。
 * @param config - 载荷父目录与安装根目录。
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await ctx.plugin(workspaceDependencies, config)
  await ctx.plugin(officeSkills, { assetRoot: join(dirname(config.source), 'office-skills') })
}
