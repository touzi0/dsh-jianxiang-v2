/**
 * 坚祥计划查阅 —— 宿主半边。
 * jxPlans Remote：list(sessionId) 返回该会话全部 exit_plan_mode 计划
 * （含状态与落盘文件路径），读取走官方 ctx.sessionQuery.readSession。
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { collectPlans, type JxPlanRecord } from './plans.ts'

interface LooseSessionQuery {
  readSession(sessionId: string): Promise<{ events: readonly { type: string, data?: unknown }[] }>
}

export type { JxPlanRecord }

export class JxPlansGateway extends TypertRemoteService {
  static inject = ['sessionQuery']

  constructor(ctx: Context) {
    super(ctx, 'jxPlans')
    void ctx
  }

  /** 本会话的计划清单（最新在前），并幂等同步 dsh-home\plans\ 落盘文件。 */
  async list(sessionId: string): Promise<{ plans: JxPlanRecord[] }> {
    const sessionQuery = (this.ctx as unknown as { sessionQuery: LooseSessionQuery }).sessionQuery
    let events: readonly { type: string, data?: unknown }[]
    try {
      events = (await sessionQuery.readSession(sessionId)).events
    } catch {
      return { plans: [] } // 冷读失败（未保存/损坏）时给出空清单，不拖垮标签页
    }
    return { plans: collectPlans(sessionId, events) }
  }
}

// typert-protocol 的远程方法标记（等价 @Remote('list')，外部包不用装饰器语法）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxPlansGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'list', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

export default JxPlansGateway
