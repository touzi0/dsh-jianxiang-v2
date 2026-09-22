/** 共享类型（纯类型模块）。 */

export interface RewriteConfig {
  /** 远端回收站目录（远端 shell 展开 ~）。 */
  trashDir: string
  /** 回收站保留天数。 */
  retentionDays: number
}

export interface RewriteRecord {
  /** ISO 时间。 */
  t: string
  /** 会话 id（可得时）。 */
  session: string
  /** 工具名（bash / pwsh）。 */
  tool: string
  /** 动作：rewrite（改写入回收站）| rewrite-fallback-ask（改写失败转人工）。 */
  action: 'rewrite' | 'rewrite-fallback-ask'
  /** 原始命令（截断 500 字）。 */
  command: string
  /** 改写后的命令（仅 rewrite）。 */
  rewritten?: string
  /** 人话说明。 */
  note: string
}
