/**
 * dsh-manual-compact —— 宿主半边。
 *
 * 以 Typert Remote 服务 `jxManualCompact` 暴露「压缩到此轮为止」（写法与
 * dsh-mod-manager / dsh-digital-assistant 一致：类默认导出由 Cordis 实例化，
 * 原型 SRC 标记声明远程方法，无需生成工件）。
 *
 * 压缩本身完全复用官方机制：`ctx.compaction`（web profile 里是官方
 * compaction-basic 的 `BasicCompactionEngine`）的 `regionDependencies()` 提供
 * 摘要依赖，官方 `compactSurfaceRegion` 事务负责锁、摘要、事件与替换落盘。
 * 与官方 `/compact` 唯一的差别是「范围」：从会话开头压到用户点的那一轮为止，
 * 之后的轮次原样保留。
 */
import type { Context } from '@deepseek-ai/cordis'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { compactUpTo } from './compact-range.ts'
import type { CompactRangeDependencies, CompactUpToResult } from './compact-range.ts'

export const name = 'dsh-manual-compact'

/** 宿主侧需要的最小 agent 形状（结构化读取，不依赖官方类型包）。 */
interface AgentLike {
  id: string
  session: {
    id: string
    surface: { nodes: readonly number[] }
    eventAt: (seq: number) => { type: string } | undefined
  }
  status: string
  options: { provider?: string; model?: string }
  runMaintenance: <T>(task: (signal: AbortSignal) => Promise<T>) => Promise<T>
}

/** 官方 agents 服务用到的最小面。 */
interface AgentsLike {
  get: (sessionId: string) => AgentLike | undefined
  resume: (options: {
    resumeSessionId: string
    agentOptions: { provider: string; model: string }
    setup?: (agentCtx: unknown) => Promise<void>
  }) => Promise<{ agent: AgentLike }>
}

/** 官方 compaction 服务用到的最小面（regionDependencies 是官方引擎的内部工厂）。 */
interface CompactionLike {
  regionDependencies?: () => CompactRangeDependencies
}

/** 每轮按钮触发的压缩入参与回包。 */
export interface CompactRequest {
  /** 目标会话 id。 */
  sessionId: string
  /** 用户点击的轮号（仅用于文案与校验展示）。 */
  turn: number
  /** 该轮最后一个表面节点的 seq（客户端反查得到）。 */
  anchorSeq: number
}

/** 压缩成功后回给界面的数字（与 compact-range 的结果一致）。 */
export type CompactOutcome = CompactUpToResult

/** 把官方压缩错误翻译成界面能直接显示的中文。 */
export function describeCompactionError(error: unknown): string {
  if (error instanceof ManualCompactionError) {
    switch (error.code) {
      case 'busy': return '会话正在运行，或已有一次压缩在进行；等当前活动结束后再试。'
      case 'cancelled': return '压缩已取消。'
      case 'changed': return '压缩期间这一段对话发生了变化，本次压缩未生效（尝试过程已记录在会话日志里）。'
      case 'summary': return '这一轮之前的内容压不出更小的摘要（内容可能太少或已经很紧凑），没有做任何改动。'
      case 'commit': return '压缩没有干净地完成，部分历史可能已变化；请检查会话当前状态后再试。'
      case 'persistence': return '压缩已完成，但会话保存失败。'
      default: return `压缩失败：${error.message}`
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * 「手动压缩」网关：浏览器半边每轮按钮行的入口。
 */
export class JxManualCompactGateway extends TypertRemoteService {
  /** 缺了就不挂载的服务；其余用 ctx.get 动态读取（可选降级成可读错误）。 */
  static inject = ['agents', 'sessions']

  constructor(ctx: Context) {
    super(ctx, 'jxManualCompact')
  }

  private get agents(): AgentsLike {
    return (this.ctx as unknown as { agents: AgentsLike }).agents
  }

  private get sessions(): { flush: (session: unknown) => Promise<void> } {
    return (this.ctx as unknown as { sessions: { flush: (session: unknown) => Promise<void> } }).sessions
  }

  /**
   * 把「点击那一轮及其之前」的对话用官方压缩机制压成摘要。
   * @param sessionId - 目标会话 id。
   * @param turn - 轮号（展示用）。
   * @param anchorSeq - 该轮最后一个表面节点的 seq。
   * @returns 压缩数字摘要；失败时抛错（message 为中文原因）。
   */
  async compact(sessionId: string, turn: number, anchorSeq: number): Promise<CompactOutcome> {
    const agent = await this.ensureAgent(String(sessionId))
    const engine = this.ctx.get('compaction') as CompactionLike | undefined
    if (engine === undefined || typeof engine.regionDependencies !== 'function') {
      throw new Error('当前部署没有可用的官方压缩服务（compaction-basic），本按钮依赖它工作；请检查服务端插件配置。')
    }
    const dependencies = engine.regionDependencies()
    const session = agent.session
    // 与官方 compactNow 相同的外壳：空闲会话维护任务 + busy 包装。
    // runMaintenance 只在「agent 忙」时同步抛错；任务内部的错误走各自的分类。
    let task: Promise<CompactOutcome>
    try {
      task = agent.runMaintenance(async (signal: AbortSignal) =>
        compactUpTo(dependencies, session as never, Number(anchorSeq), agent, {
          flush: async () => { await this.sessions.flush(session) },
        }, signal))
    } catch (error: unknown) {
      throw new ManualCompactionError('busy', 'manual compaction requires an idle agent', { cause: error })
    }
    try {
      return await task
    } catch (error: unknown) {
      throw new Error(describeCompactionError(error))
    }
  }

  /** 取活跃 agent；冷会话按它记录的 preset 恢复（写法同 dsh-digital-assistant）。 */
  private async ensureAgent(sessionId: string): Promise<AgentLike> {
    const live = this.agents.get(sessionId)
    if (live !== undefined) return live
    const resumeOptions: Parameters<AgentsLike['resume']>[0] = {
      resumeSessionId: sessionId,
      agentOptions: this.resolveRoute(),
    }
    const presets = this.ctx.get('agentPresets') as
      | { mount: (agentCtx: unknown, presetId: string) => Promise<void> }
      | undefined
    let presetId: string | undefined
    const sessionQuery = this.ctx.get('sessionQuery') as
      | { readSession: (id: string) => Promise<{ session: { agentPreset?: string } }> }
      | undefined
    if (sessionQuery !== undefined && presets !== undefined) {
      try {
        const snapshot = await sessionQuery.readSession(sessionId)
        const recorded = snapshot?.session?.agentPreset
        if (typeof recorded === 'string' && recorded !== '') presetId = recorded
      } catch (error: unknown) {
        this.warn(`读取会话 ${sessionId} 的记录失败（按无 preset 冷恢复）：${String(error)}`)
      }
    }
    if (presets !== undefined && presetId !== undefined) {
      resumeOptions.setup = async (agentCtx: unknown) => { await presets.mount(agentCtx, presetId) }
    }
    const handle = await this.agents.resume(resumeOptions)
    return handle.agent
  }

  /** 冷恢复的模型路由：会话自己的请求头优先不存在时用全局默认（同官方 resume）。 */
  private resolveRoute(): { provider: string; model: string } {
    const current = (this.ctx.get('agentDefaultModel') as
      | { currentSelection?: () => { provider?: string; model?: string } }
      | undefined)?.currentSelection?.()
    if (typeof current?.provider === 'string' && current.provider !== ''
      && typeof current?.model === 'string' && current.model !== '') {
      return { provider: current.provider, model: current.model }
    }
    throw new Error('无法确定模型路由（agent-default-model 服务不可用或尚未选择模型）；请先在会话里正常对话一次，再使用压缩按钮。')
  }

  /** 统一的告警出口（模组不静默吞错）。 */
  private warn(message: string): void {
    try {
      // eslint-disable-next-line no-console -- 模组的诊断出口
      console.warn(`[dsh-manual-compact] ${message}`)
    } catch {
      // 控制台不可用时无处可写，忽略。
    }
  }
}

// typert-protocol 的远程方法标记（等价于方法上的 @Remote('...')）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxManualCompactGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'compact', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
})

export default JxManualCompactGateway
