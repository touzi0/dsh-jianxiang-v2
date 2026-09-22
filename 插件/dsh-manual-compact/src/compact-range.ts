/**
 * 「压缩到此轮为止」的范围计算与事务调用。
 *
 * 摘要与事务全部复用官方实现：
 * - `compactSurfaceRegion` 直接从官方 `@deepseek-ai/dsh-compaction-basic/src/region.ts`
 *   链接（构建期打进本插件产物；该函数是官方 `compactNow` / `compactRegion` 共用的
 *   事务编排，官方包未对外导出，因此走它声明的 `./src/*` 导入面）。锁、摘要调用、
 *   收缩检查、稳定性检查、`compaction/*` 事件与替换落盘全部是官方代码。
 * - 摘要依赖（token meter、summarize、错误恢复）取自官方引擎实例自己的
 *   `regionDependencies()` 工厂，与 `/compact` 命令跑的是同一条摘要链路。
 *
 * 本文件自己写的只有「范围」：从表面第一个非 system 节点开始，到用户点的那一轮
 * 最后一个节点为止。
 * @module dsh-manual-compact/compact-range
 */
import type { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { compactSurfaceRegion } from '@deepseek-ai/dsh-compaction-basic/src/region.ts'
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session'

/** 官方 `regionDependencies()` 工厂返回的摘要依赖（结构性描述，避免依赖内部类型）。 */
export interface CompactRangeDependencies {
  /** 官方 token meter：压缩定价与收缩检查用。 */
  meter: unknown
  /** 官方摘要钩子（引擎实例上绑定的 `summarize`）。 */
  summarize: (input: unknown, agent: unknown, signal?: AbortSignal) => Promise<unknown>
  /** 官方摘要失败恢复瀑布（`compaction/summary-error`）。 */
  recover: (error: unknown, agent: unknown, sourceEventSeqs: readonly SessionSeq[], signal?: AbortSignal) => boolean
}

/** 一次成功压缩回给界面 account 的数字。 */
export interface CompactUpToResult {
  /** 被摘要替换掉的表面节点数。 */
  shadowedCount: number
  /** 被替换内容估算的 token 数。 */
  shadowedTokens: number
  /** 新摘要的字符数。 */
  summaryChars: number
}

/** 压缩事务的可选项。 */
export interface CompactUpToOptions {
  /** 压缩成功落盘后的持久化检查点（官方 `compactNow` 传 `sessions.flush`）。 */
  flush?: (() => Promise<void>) | undefined
}

/**
 * 压缩「会话开头到 `anchorSeq` 所在节点为止」的范围（不含 node0 的 system 提示词）。
 * @param dependencies - 官方引擎的 `regionDependencies()`。
 * @param session - 目标会话（须属于一个空闲的 agent）。
 * @param anchorSeq - 用户点击那一轮的最后一个表面节点 seq（客户端反查得到）。
 * @param agent - 摘要调用使用的 agent（提供路由与提示词前缀）。
 * @param options - 可选的持久化检查点。
 * @param signal - 取消信号（runMaintenance 的信号）。
 * @returns 成功压缩的数字摘要。
 * @throws Error 当该轮不在当前表面上（已被此前的压缩覆盖）或没有可压缩内容；
 * 其余错误由官方 `compactSurfaceRegion` 抛出（含 {@link ManualCompactionError}）。
 */
export async function compactUpTo(
  dependencies: CompactRangeDependencies,
  session: Session,
  anchorSeq: number,
  agent: unknown,
  options: CompactUpToOptions,
  signal: AbortSignal,
): Promise<CompactUpToResult> {
  const surface = session.surface.nodes
  const endIdx = surface.indexOf(anchorSeq as SessionSeq)
  if (endIdx === -1) {
    throw new Error('这一轮的内容已不在当前上下文里（可能已经被之前的压缩覆盖了），无需重复压缩。')
  }
  // 与官方 selectCompactableRange 相同的规则：node0 是 system/message 时不压缩它。
  let startIdx = 0
  if (surface.length > 0) {
    // 表面节点都是当前日志 seq，事件必然存在（同官方 region.ts 的读法）。
    const head = session.eventAt(surface[0]!)
    if (head !== undefined && head.type === 'system/message') startIdx = 1
  }
  if (endIdx < startIdx) {
    throw new Error('这一轮之前没有可压缩的对话内容。')
  }
  const start = surface[startIdx]!
  const end = surface[endIdx]!
  const result = await compactSurfaceRegion(
    dependencies as Parameters<typeof compactSurfaceRegion>[0],
    session,
    start,
    end,
    agent as Parameters<typeof compactSurfaceRegion>[3],
    {
      owner: null,
      stability: 'selected-span',
      ...(options.flush === undefined ? {} : { flush: options.flush }),
    },
    signal,
  )
  const summaryChars = result.summary.reduce(
    (total: number, block: { type: string; text?: string }) =>
      total + (block.type === 'text' && typeof block.text === 'string' ? block.text.length : 0),
    0,
  )
  return {
    shadowedCount: result.shadowedSeqs.length,
    shadowedTokens: result.shadowedTokenCount,
    summaryChars,
  }
}
