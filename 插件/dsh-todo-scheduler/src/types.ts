/**
 * 待办事项与定时任务 —— 数据模型与线上（wire）类型。
 * 宿主半边持久化、Remote 结果与浏览器半边共用这一份形状。
 */

/** 执行方式种类。 */
export type ScheduleKind = 'manual' | 'once' | 'daily' | 'weekly' | 'weekdays' | 'interval'

/**
 * 执行方式。
 * - manual：只记在清单里，不自动执行（页面「立即执行」或用户自行处理）。
 * - once：指定时刻执行一次（epoch 毫秒）。
 * - daily / weekdays / weekly：按当天 `time`（`HH:mm`，本地时区）重复；
 *   weekly 的 `days` 是 0（周日）…6（周六）。
 * - interval：每隔 `everyMinutes` 分钟一次。
 */
export type Schedule =
  | { readonly kind: 'manual' }
  | { readonly kind: 'once'; readonly at: number }
  | { readonly kind: 'daily'; readonly time: string }
  | { readonly kind: 'weekly'; readonly days: readonly number[]; readonly time: string }
  | { readonly kind: 'weekdays'; readonly time: string }
  | { readonly kind: 'interval'; readonly everyMinutes: number }

/**
 * 任务类型：
 * - assistant：AI 任务。到点把描述转交给数字助理主对话，由它安排执行并汇报
 *   （派发、选工作区、选模型都是它的事，这里不做任何模型/模式设置）。
 * - command：程序任务。到点用官方 subprocess 在指定工作目录直接运行命令
 *   （不经过模型），输出记进执行记录。
 */
export type TaskExecutor = 'assistant' | 'command'

/** 程序任务的命令：程序 + 空格分隔的参数（执行时按空白切分成 argv）。 */
export interface CommandSpec {
  readonly command: string
  readonly args: string
}

/** 派发目标。assistant 类只关心「有没有工作区」之外的一切都交给数字助理，字段留空；command 类用 `workspaceId` 当工作目录。 */
export interface TaskTarget {
  readonly workspaceId: string
  readonly preset?: string
  readonly provider?: string
  readonly model?: string
}

/** 一条工作任务。 */
export interface TaskItem {
  readonly id: string
  readonly title: string
  /** 将来原样派出去的那段话（自足，不依赖聊天记录）。 */
  readonly description: string
  readonly enabled: boolean
  /** 任务类型（数据 v1 的旧任务都是 assistant）。 */
  readonly executor: TaskExecutor
  readonly schedule: Schedule
  readonly target: TaskTarget
  /** 仅 executor='command'：要运行的命令。 */
  readonly command?: CommandSpec
  readonly createdAt: number
  readonly updatedAt: number
  /** 最近一次（或最近一个被处理掉的）槽点；防重复触发与错过判定的基准。 */
  readonly lastRunAt?: number
  readonly lastStatus?: 'running' | 'ok' | 'failed'
  readonly lastError?: string
  readonly lastSessionId?: string
}

/** 任务视图：任务本体加调度器算出的下次执行时间（展示用派生值）。 */
export type TaskView = TaskItem & { readonly nextRunAt?: number }

/** 一次执行（触发）的记录。 */
export interface RunRecord {
  readonly id: string
  readonly taskId: string
  readonly trigger: 'schedule' | 'manual' | 'catch-up'
  readonly startedAt: number
  readonly status: 'running' | 'ok' | 'failed'
  readonly sessionId?: string
  /** 完成后的摘要：assistant 是转交说明；command 是退出码与输出节选。 */
  readonly summary?: string
  readonly error?: string
}

/** 一条已错过、等用户决定的执行槽点。 */
export interface MissedItem {
  readonly taskId: string
  readonly slotTime: number
}

/** 持久化文档（`dsh-home\jx-todo\tasks.json`）。 */
export interface TodoData {
  readonly version: 2
  readonly tasks: readonly TaskItem[]
  readonly records: readonly RunRecord[]
}

/** listTasks 的线上结果。 */
export interface TodoSnapshot {
  readonly tasks: readonly TaskView[]
  readonly records: readonly RunRecord[]
  readonly missed: readonly MissedItem[]
  readonly dataFile: string
}

/** 新建任务的线上请求。 */
export interface CreateTaskRequest {
  readonly title: string
  readonly description: string
  readonly executor: TaskExecutor
  readonly schedule: Schedule
  readonly target: TaskTarget
  /** 仅 executor='command'。 */
  readonly command?: CommandSpec
  /** 缺省即启用。 */
  readonly enabled?: boolean
}

/** updateTask 的线上请求：给出的字段整体替换。 */
export interface UpdateTaskRequest {
  readonly id: string
  readonly patch: {
    readonly title?: string
    readonly description?: string
    readonly enabled?: boolean
    readonly executor?: TaskExecutor
    readonly schedule?: Schedule
    readonly target?: TaskTarget
    readonly command?: CommandSpec
  }
}

/** runNow / resolveMissed 的线上请求。 */
export interface TaskRefRequest {
  readonly id: string
}

/** resolveMissed 的线上请求。 */
export interface ResolveMissedRequest {
  readonly id: string
  readonly action: 'run' | 'dismiss'
}

/** 工作区下拉项。 */
export interface WorkspaceOption {
  readonly id: string
  readonly title: string
  readonly path: string
}

/** runNow 的线上结果。 */
export interface RunNowResult {
  readonly ok: boolean
  readonly sessionId?: string
  readonly error?: string
}

/** 宿主 `ctx.tools` 的最小注册面（全局模型工具注册，官方 tool-todo 同一条正道）。 */
export interface ToolsFace {
  register(definition: unknown): () => void
}

/** 官方 approval 服务的最小请求面（delete/run 工具走审批）。 */
export interface ApprovalFace {
  request(req: {
    agent: unknown
    toolName: string
    callId?: unknown
    reason?: string
    signal?: AbortSignal
  }): Promise<string>
}
