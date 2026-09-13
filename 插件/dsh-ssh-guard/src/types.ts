/** 共享类型（纯类型模块，两个半边共同导入）。 */

export interface GuardRecord {
  /** ISO 时间。 */
  t: string
  /** 会话 id（可得时）。 */
  session: string
  /** 工具名（bash / pwsh）。 */
  tool: string
  /** 动作：rewrite（改写入回收站）| ask-catastrophic（灾难级转人工）| rewrite-fallback-ask（改写失败转人工）| ai-allow / ai-ask（AI 审查结论）| ai-error（审查调用失败放行）。 */
  action: 'rewrite' | 'ask-catastrophic' | 'rewrite-fallback-ask' | 'ai-allow' | 'ai-ask' | 'ai-error'
  /** 原始命令（截断 500 字）。 */
  command: string
  /** 改写后的命令（仅 rewrite）。 */
  rewritten?: string
  /** 人话说明 / AI 影响判断。 */
  note: string
}

export interface GuardConfig {
  /** 远端回收站目录（远端 shell 展开 ~）。 */
  trashDir: string
  /** 回收站保留天数。 */
  retentionDays: number
  /** 是否开启 AI 安全审查（中间地带命令）。 */
  review: boolean
  /** 审查用的 provider（llm 路由名）。 */
  reviewProvider: string
  /** 审查用的模型。 */
  reviewModel: string
}
