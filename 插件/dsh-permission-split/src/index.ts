/**
 * dsh-permission-split —— 宿主半边（坚祥定制）。
 *
 * 把官方的「权限」从**单选预设**补成**预设 + 三项能力授权**两列模型：
 *   左列：官方预设（沙箱模式 × 审批策略），本模组完全不碰。
 *   右列：三项可在会话内独立勾选的能力授权——
 *     - browser  允许操作浏览器（派生浏览器进程）
 *     - computer 允许操作电脑（鼠标/键盘/屏幕）
 *     - shell    允许沙箱外执行命令程序
 *
 * 为什么需要它：v2 的 `ApprovalOutcome` 只有四个值
 * （allowed-once / rejected / cancelled / unavailable），没有「会话内始终允许」；
 * v1 曾实现过 `allowed-always`（见 坚祥数字助理 的
 * .agents/notes/implemented/feature/2026-08-20-sandbox-always-allow）。本模组把它带回来，
 * 并按用户决策扩成三项能力。
 *
 * 存储：双写。会话日志记一条 `jx/permission-split` 事件（审计 + 可重放），
 * 内存表供同步读取（授权判定在工具执行热路径上，不能是异步投影查询）。
 * 「会话内有效」是天然语义：进程重启后内存清零，退化为全关，fail closed。
 * 沙箱外执行走官方 `setSandboxMode(session, 'danger-full-access')`，
 * 因此执行侧与 `sandboxMode` 投影无需任何新机制。
 */
import type { Context } from '@deepseek-ai/cordis'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// 仅类型：审批词表由官方审批包拥有，构建时擦除。
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'

// —— 能力定义 ——

/** 三项能力授权。 */
export const CAPABILITIES = ['browser', 'computer', 'shell'] as const

/** 一项能力授权。 */
export type Capability = typeof CAPABILITIES[number]

/** 全部能力的默认值：一律关闭（fail closed）。 */
export const NO_GRANTS: Readonly<Record<Capability, boolean>> = Object.freeze({
  browser: false, computer: false, shell: false,
})

/** 授权表：能力 → 是否已在本会话内授权。 */
export type Grants = Readonly<Record<Capability, boolean>>

/** 会话内授权事件的载荷。 */
export interface PermissionSplitState {
  /** 本会话当前的能力授权。 */
  readonly grants: Grants
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * 本会话的能力授权被改写一次——log-only（同 `approval/*` 与 `sandbox/mode`）：
     * 持久、可重放、不进模型转录。最后一个此类事件是当前状态。
     */
    'jx/permission-split': PermissionSplitState
  }
}

// —— 结构化类型（仅类型，构建时擦除） ——

interface SessionLike {
  readonly id: string
  /**
   * 追加一条事件。第二个参数是可选的 envelope：`ignorable: true` 让不认识
   * 本事件类型的读取方安全跳过，而不是**拒绝解析整个日志**
   * （见 packages/session/session-persistence/src/storage-contract.ts）。
   * 本模组的事件是纯信息性的，其丢失不影响会话重建，故必须标注。
   */
  append(type: string, data: unknown, envelope?: { ignorable?: true }): unknown
}
interface AgentLike {
  readonly id: string
  readonly session: SessionLike
}
interface AgentsService { get(id: string): AgentLike | undefined }

/**
 * 判定一份授权表里是否至少有一项被打开。
 * @param grants - 待判定的授权表。
 * @returns 是否有任一能力已授权。
 */
export function anyGranted(grants: Grants): boolean {
  return CAPABILITIES.some((capability) => grants[capability])
}

/**
 * 把任意输入规范成一份完整授权表：未知键丢弃、缺省键取 false。
 * 输入来自会话日志（durable 边界）与 Remote 调用（wire 边界），故在此收敛校验。
 * @param value - 待规范的原始值。
 * @returns 完整且只含三项能力的授权表。
 */
export function normalizeGrants(value: unknown): Grants {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [capability, source[capability] === true]),
  ) as unknown as Grants
}

/** 会话授权网关：按会话读写三项能力授权。 */
export class JxPermissionGateway extends TypertRemoteService {
  /** 类形式插件的注入声明（写法对照官方 PluginInventoryGateway）。 */
  static inject = ['agents']

  /**
   * 同步授权表。授权判定发生在工具执行热路径上，必须是同步读；
   * 会话日志仍是权威记录，这里只是它的读缓存。
   *
   * 刻意用 TS-private 而不是 `#private`：Typert Gateway 直调经
   * `Reflect.get(receiver, method)` 派发，receiver 可能是服务的代理对象，
   * 运行时私有成员的品牌检查在代理上会抛
   * “Cannot read private member #grants from an object whose class did not declare it”。
   */
  private readonly grants = new Map<string, Grants>()

  constructor(ctx: Context) {
    super(ctx, 'jxPermission')
    // 在构造器里装监听：类形式插件由 `ctx.plugin()` 实例化后立即生效，
    // 不依赖 Cordis 是否调用 `start()`（该钩子对类形式插件并非公开保证）。
    installApprovalBypass(ctx, this)
  }

  /**
   * 读取一个会话当前的授权表；从未授权或进程重启后返回全关。
   * @param sessionId - 目标会话/Agent 标识。
   * @returns 三项能力的当前授权。
   */
  get(sessionId: string): Grants {
    return this.grants.get(sessionId) ?? { ...NO_GRANTS }
  }

  /**
   * 改写一项能力授权：写会话事件（审计）并更新内存表。
   * 打开 `shell` 时同时把会话沙箱模式切到 `danger-full-access`——
   * 该授权只开「沙箱外运行进程」这一含义，文件权限轴由官方 Access 控件自行掌控。
   * @param sessionId - 目标会话/Agent 标识。
   * @param capability - 要改写的能力。
   * @param granted - 目标状态。
   * @returns 改写后的完整授权表。
   */
  async set(sessionId: string, capability: string, granted: boolean): Promise<Grants> {
    if (!CAPABILITIES.includes(capability as Capability)) {
      throw new Error(`dsh-permission-split: unknown capability ${JSON.stringify(capability)}`)
    }
    const agent = this.agentOf(sessionId)
    const next: Grants = { ...this.get(sessionId), [capability]: granted === true }
    this.grants.set(sessionId, next)
    agent?.session.append('jx/permission-split', { grants: next }, { ignorable: true })
    if (capability === 'shell' && granted === true && agent !== undefined) {
      setSandboxMode(agent.session as Parameters<typeof setSandboxMode>[0], 'danger-full-access')
    }
    return next
  }

  /**
   * 清空本会话的全部能力授权。
   * @param sessionId - 目标会话/Agent 标识。
   * @returns 清空后的授权表（全关）。
   */
  async clear(sessionId: string): Promise<Grants> {
    const next: Grants = { ...NO_GRANTS }
    this.grants.set(sessionId, next)
    this.agentOf(sessionId)?.session.append('jx/permission-split', { grants: next }, { ignorable: true })
    return next
  }

  /**
   * 供同进程的审批瀑布读取：某会话是否已授权某项能力。
   * @param sessionId - 目标会话/Agent 标识。
   * @param capability - 待查询的能力。
   * @returns 是否已授权。
   */
  grantsCapability(sessionId: string, capability: Capability): boolean {
    return this.get(sessionId)[capability]
  }

  /** 按会话标识取 Agent；服务未就绪或会话不在运行时返回 undefined。 */
  private agentOf(sessionId: string): AgentLike | undefined {
    const agents = (this.ctx as unknown as { agents?: AgentsService }).agents
    if (agents === undefined) return undefined
    return agents.get(sessionId)
  }
}

// —— 免弹窗：把已授权能力上的审批请求直接认领 ——

/**
 * 工具名片段 → 能力。
 *
 * 顺序即优先级：先匹配到的先算数。片段匹配（`includes`）而非精确名，
 * 是为了容忍各 provider 的命名差异（`mcp__playwright-mcp__browser_click`
 * 这类上游名与 `computer_use`、`cua_*` 这类本地名都能命中）。
 *
 * 刻意**不含** `tool-bash` / `tool-pwsh`：那条路径由官方审批与沙箱升级掌管，
 * 并被其它策略依赖；`shell` 能力只表示「允许沙箱外执行」，不改动审批策略本身。
 */
export const CAPABILITY_TOOL_PATTERNS: ReadonlyArray<readonly [Capability, readonly string[]]> = Object.freeze([
  ['browser', Object.freeze(['browser_', 'browser-', 'playwright', 'chrome-devtools', 'puppeteer', '__browser'])],
  ['computer', Object.freeze(['computer_', 'computer-', 'computeruse', 'cua_', 'cua-'])],
])

/**
 * 判定一个工具调用请求落在哪项能力下。
 * @param toolName - 待判定的工具名。
 * @returns 命中的能力；不落任何能力时返回 undefined（调用方应委托给下游）。
 */
export function capabilityOfTool(toolName: string): Capability | undefined {
  const name = toolName.toLowerCase()
  for (const [capability, patterns] of CAPABILITY_TOOL_PATTERNS) {
    if (patterns.some((pattern) => name.includes(pattern))) return capability
  }
  return undefined
}

/** 审批请求里本模组需要读的字段。 */
interface ApprovalRequestLike {
  readonly agent: { readonly id: string }
  readonly toolName: string
}

/** Cordis 的瀑布下一步。 */
type ApprovalNext = () => Promise<ApprovalOutcome>

/**
 * 在 `approval/request` 瀑布上认领已授权能力的请求。
 *
 * 这是「勾上就不再弹窗」的执行点：**返回 outcome 即认领**，官方与客户端的
 * 应答者（弹窗）根本不会被问到；只有未命中或未授权时才 `next()` 交还瀑布。
 * 未授时一律委托——默认关闭，fail closed。
 *
 * 作用域：请求带 `agent`，按 `agent.id` 取会话授权。
 *
 * @param ctx - 插件上下文。
 * @param gateway - 授权网关，读取某会话是否已授权某能力。
 * @returns 注销函数。
 */
export function installApprovalBypass(ctx: Context, gateway: JxPermissionGateway): () => void {
  const handler = async (request: ApprovalRequestLike, next: ApprovalNext): Promise<ApprovalOutcome> => {
    const capability = capabilityOfTool(request.toolName)
    if (capability === undefined) return next()
    const sessionId = request.agent?.id
    if (typeof sessionId !== 'string' || sessionId === '') return next()
    if (!gateway.grantsCapability(sessionId, capability)) return next()
    return 'allowed-once'
  }
  return ctx.on('approval/request', handler as never)
}

// typert-protocol 的远程方法标记（等价于 @Remote('get' | 'set' | 'clear')）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxPermissionGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'get', invocation: Object.freeze({ kind: 'direct' }) },
      { method: 'set', invocation: Object.freeze({ kind: 'direct' }) },
      { method: 'clear', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

export default JxPermissionGateway
