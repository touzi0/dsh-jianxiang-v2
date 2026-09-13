/**
 * 中途切换预设 —— 宿主半边（坚祥定制）。
 *
 * 官方 agentPresets.select 在会话开谈后抛 agent-preset/locked，本模组补一个
 * jxPreset/switch Remote：复用官方 AgentPresets.recompose（公开方法）与
 * agent-preset/selected 事件，只放开「已开谈但回合已结束」的场景；回合进行中
 * 仍然拒绝（重挂作用域会破坏运行中的回合）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

// —— 结构化类型（仅类型，构建时擦除） ——

interface TurnBoundary { openTurnStartSeq: number | null; lastTurn: number }
interface SessionLike { readonly id: string; append(type: string, data: unknown): unknown }
interface AgentLike {
  readonly id: string
  readonly ctx: Context
  readonly session: SessionLike
}
interface AgentsService { get(id: string): AgentLike | undefined }
interface AgentPresetLike { readonly id: string }
interface AgentPresetsService { recompose(agentCtx: Context, id: string): Promise<AgentPresetLike> }
interface SessionProjectionsService {
  stateOf(session: SessionLike, key: 'turnBoundary'): TurnBoundary | undefined
}

export const name = 'dsh-mode-switch'

export class JxPresetGateway extends TypertRemoteService {
  /** 类形式插件的注入声明（写法对照官方 PluginInventoryGateway）。 */
  static inject = ['agents', 'agentPresets', 'sessionProjections']

  /** 每会话串行化（与官方 select 的队列语义一致）。 */
  private readonly switches = new Map<string, Promise<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'jxPreset')
  }

  /**
   * 强制把一个会话切到指定预设。开谈后仍可切（官方锁定的场景），但回合
   * 进行中拒绝。成功后与官方路径一致地记录 agent-preset/selected 事件。
   * @returns 生效的预设 id。
   */
  async switch(sessionId: string, agentPreset: string): Promise<string> {
    const agents = (this.ctx as unknown as { agents: AgentsService }).agents
    const presets = (this.ctx as unknown as { agentPresets: AgentPresetsService }).agentPresets
    const projections = (this.ctx as unknown as { sessionProjections: SessionProjectionsService }).sessionProjections

    const agent = agents.get(sessionId)
    if (agent === undefined) {
      throw new Error(`dsh-mode-switch: no live agent for session ${JSON.stringify(sessionId)}`)
    }
    const queued = this.switches.get(sessionId) ?? Promise.resolve()
    const turn = queued.then(async (): Promise<string> => {
      const boundary = projections.stateOf(agent.session, 'turnBoundary')
      if (boundary !== undefined && boundary.openTurnStartSeq !== null) {
        throw new Error('dsh-mode-switch: 会话回合正在进行中，等它结束后再切换模式')
      }
      const preset = await presets.recompose(agent.ctx, agentPreset)
      agent.session.append('agent-preset/selected', { agentPreset: preset.id })
      return preset.id
    })
    const guard = turn.catch(() => undefined)
    this.switches.set(sessionId, guard)
    try {
      return await turn
    } finally {
      if (this.switches.get(sessionId) === guard) this.switches.delete(sessionId)
    }
  }
}

// typert-protocol 的远程方法标记（等价于 @Remote('switch')）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxPresetGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'switch', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

export default JxPresetGateway
