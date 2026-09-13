/** 坚祥模组管理器的共享类型（纯类型模块，两个半边共同导入，不携带任何运行时代码）。 */

/** 一条 id 定向配置覆盖（patch 整段替换语义）。 */
export interface JxOverride {
  /** 被覆盖的组合行 id。 */
  id: string
  /** 替换后的完整 config（支持 $dshHomePath 路径标记）。 */
  config?: Record<string, unknown>
  /** 覆盖行的 disabled 值（可用 false 翻回被 bundle 层禁用的行）。 */
  disabled?: boolean
}

export interface JxModRow {
  /** 模组目录名（同时用作挂载行 id）。 */
  id: string
  name: string
  version: string
  description: string
  /** 相对 插件\ 根的宿主入口。 */
  entry: string
  /** 是否带浏览器半边（声明了 dsh.client）。 */
  hasClient: boolean
  /** 该模组启用时要禁用的原生行 id。 */
  replaces: string[]
  /** 该模组启用时要覆盖 config 的组合行。 */
  overrides: JxOverride[]
  enabled: boolean
  /** 模组 package.json 的 jx.config：原样写进模组自己的挂载行（插件配置）。 */
  config?: Record<string, unknown>
}

export interface JxModsSnapshot {
  modsRoot: string
  patchFile: string
  mods: JxModRow[]
}
