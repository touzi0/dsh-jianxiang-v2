/**
 * dsh-permission-split —— 审批契约（坚祥定制）。
 *
 * 官方 `ApprovalDecision` 是闭合两值联合 `'allowed-once' | 'rejected'`，
 * 没有「会话内始终允许」。本模组按 v1 的做法（见 坚祥数字助理 的
 * .agents/notes/implemented/feature/2026-08-20-sandbox-always-allow）把它扩成三值，
 * 并自带一个 `PendingApproval` 实现——官方那个类的 `answer()` 也只接受两值。
 *
 * 之所以能加值而不破坏官方：加宽闭合联合对旧消费者是安全的（它们从不发送新值）。
 */
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-client-ui-session/client' {
  interface SessionPendingInteractionMap {
    /** 本模组呈现的审批请求。 */
    approval: PendingApproval
  }
}

/** 本模组支持的三种决策。 */
export type ApprovalDecision = 'allowed-once' | 'allowed-always' | 'rejected'

/** 客户端可见的审批请求字段。 */
export interface ApprovalPresentationRequest {
  /** 发起决策请求的工具名。 */
  readonly toolName: string
  /** 与请求关联的工具调用。 */
  readonly callId?: ToolCallId
  /** 请求方给出的人类可读理由。 */
  readonly reason?: string
  /** 由宿主瀑布投影过来的取消生命周期。 */
  readonly signal?: AbortSignal
}

let nextApprovalKey = 0

/** 一次可应答的审批呈现；与官方同类同形，额外允许 `allowed-always`。 */
export class PendingApproval {
  /** 会话 pending-interaction 消费者用的领域判别符。 */
  readonly kind: 'approval'
  /** 渲染身份键。 */
  readonly key: string
  /** 发起决策请求的工具名。 */
  readonly toolName: string
  /** 与请求关联的工具调用。 */
  readonly callId: ToolCallId | undefined
  /** 请求方给出的人类可读理由。 */
  readonly reason: string | undefined
  /** 回给宿主瀑布的决策。 */
  readonly result: Promise<ApprovalDecision>

  readonly #resolve: (outcome: ApprovalDecision) => void
  readonly #reject: (reason: unknown) => void
  readonly #signal: AbortSignal | undefined
  readonly #onAbort: (() => void) | undefined
  readonly #delegated = Symbol('pending approval delegated')
  #settled = false

  /**
   * @param sessionId - 拥有该请求的会话身份。
   * @param request - 经 Remote Event 投影的宿主审批请求。
   */
  constructor(readonly sessionId: SessionId, request: ApprovalPresentationRequest) {
    this.kind = 'approval'
    nextApprovalKey += 1
    this.key = `approval:${String(nextApprovalKey)}`
    this.toolName = request.toolName
    this.callId = request.callId
    this.reason = request.reason
    const completion = Promise.withResolvers<ApprovalDecision>()
    this.result = completion.promise
    this.#resolve = completion.resolve
    this.#reject = completion.reject
    this.#signal = request.signal
    if (request.signal === undefined) {
      this.#onAbort = undefined
      return
    }
    const onAbort = (): void => {
      this.abort(request.signal?.reason ?? new Error('approval request was aborted'))
    }
    this.#onAbort = onAbort
    request.signal.addEventListener('abort', onAbort, { once: true })
    if (request.signal.aborted) onAbort()
  }

  /**
   * 用用户的决策结算宿主瀑布。
   * @param outcome - 用户选择的决策。
   * @returns 结算完成。
   */
  answer(outcome: ApprovalDecision): Promise<void> {
    if (this.#settled) return Promise.reject(new Error(`pending approval ${this.key} is already settled`))
    this.finish(() => { this.#resolve(outcome) })
    return Promise.resolve()
  }

  /** 把未应答的请求委托给瀑布的下一个监听器。 */
  delegate(): void {
    if (this.#settled) return
    this.finish(() => { this.#reject(this.#delegated) })
  }

  /**
   * 判断一次拒绝是否表示请求委托。
   * @param reason - 从 {@link PendingApproval.result} 收到的拒绝原因。
   * @returns 是否由 {@link PendingApproval.delegate} 产生。
   */
  isDelegation(reason: unknown): boolean {
    return reason === this.#delegated
  }

  /**
   * 在传输、作用域或插件生命周期结束时终止未应答的呈现。
   * @param reason - 暴露给等待中的 Remote Event 监听器的拒绝原因。
   */
  abort(reason: unknown): void {
    if (this.#settled) return
    this.finish(() => { this.#reject(reason) })
  }

  private finish(settle: () => void): void {
    this.#settled = true
    if (this.#signal !== undefined && this.#onAbort !== undefined) {
      this.#signal.removeEventListener('abort', this.#onAbort)
    }
    settle()
  }
}
