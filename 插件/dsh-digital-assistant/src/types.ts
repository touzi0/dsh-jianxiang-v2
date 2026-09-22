/**
 * 数字助理 —— 宿主半边用到的结构化类型。
 *
 * 全部按「结构面」声明（只写真正读到的成员），不 import 官方包的值：
 * 模组跑在真实 ctx 上，服务实例由宿主注入，形状以官方实现为准。
 */

/** 会话头（官方 SessionHeader 的子集）。 */
export interface SessionHeaderLike {
  readonly id: string
  readonly cwd?: string
  readonly createdAt?: number
  readonly agentPreset?: string
  readonly origin?: string
}

/** 会话对象（官方 Session 的子集）。 */
export interface SessionLike {
  readonly id: string
  readonly header: SessionHeaderLike
  /** 官方 0.1.6 起为 snapshotEvents()；旧版是 events getter。 */
  snapshotEvents?: () => readonly SessionEventLike[]
  events?: readonly SessionEventLike[]
  append?: (type: string, data: unknown) => unknown
}

/** 运行中的 agent（官方 Agent 的子集）。 */
export interface AgentLike {
  readonly id: string
  readonly session: SessionLike
  readonly status?: string
  followup: (message: unknown) => void
  whenIdle?: () => Promise<void>
}

/** 会话事件（只读信封 + data）。 */
export interface SessionEventLike {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: Record<string, unknown>
}

/** 工作区（官方 Workspace 的子集）。 */
export interface WorkspaceLike {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly createdAt?: string
  readonly sessionIds: readonly string[]
  attachSession: (sessionId: string) => Promise<void>
}

/** 会话查询服务（官方 ctx.sessionQuery 的子集）。 */
export interface SessionQueryLike {
  listSessions: (signal?: AbortSignal) => Promise<readonly { header: SessionHeaderLike; live: boolean; persisted: boolean }[]>
  readSession: (sessionId: string) => Promise<{ session: SessionHeaderLike; events: readonly SessionEventLike[] }>
  readTitle?: (sessionId: string) => Promise<{ title?: string } | undefined>
}

/** 工作区注册表（官方 ctx.workspaceRegistry 的子集）。 */
export interface WorkspaceRegistryLike {
  list: () => readonly WorkspaceLike[]
  get: (id: string) => WorkspaceLike | undefined
  create: (path: string, title?: string) => Promise<WorkspaceLike>
  /**
   * 已归档会话的登记表。官方用它把会话从侧边栏列表里隐藏
   * （只影响列表可见性，`openSession` 照常能打开——见 ui-workspace 的 sessionVisible）。
   */
  readonly archivedSessionIds?: readonly string[]
  /** 把会话登记为已归档。 */
  archiveSession?: (sessionId: string) => Promise<void>
}

/** agent 注册表（官方 ctx.agents 的子集）。 */
export interface AgentsLike {
  get: (id: string) => AgentLike | undefined
  create: (options: unknown) => Promise<{ agent: AgentLike }>
  resume: (options: unknown) => Promise<{ agent: AgentLike }>
}

/** agent preset 服务（官方 ctx.agentPresets 的子集）。 */
export interface AgentPresetsLike {
  list?: () => Promise<readonly { id: string; name?: string; description?: string; broken?: boolean }[]>
  resolve: (id?: string) => Promise<{ id: string }>
  mount: (agentCtx: unknown, id?: string) => Promise<{ id: string }>
}

/** 权限预设服务（官方 ctx.permissionPresets 的子集）。 */
export interface PermissionPresetsLike {
  resolve: (name: string) => unknown
  set: (session: SessionLike, name: string) => void
  current?: (session: SessionLike) => string
}

/** 默认模型服务（官方 ctx.agentDefaultModel 的子集）。 */
export interface AgentDefaultModelLike {
  currentSelection: () => { provider: string; model: string }
}

/** 模型提供方（官方 LlmProviderInfo 的子集）。 */
export interface LlmProviderInfoLike {
  readonly id: string
  readonly name: string
}

/** 模型（官方 LlmModelInfo 的子集）。 */
export interface LlmModelInfoLike {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/** 模型运行时（官方 ctx.llm 的子集），用来让数字助理看得见可选的提供方与模型。 */
export interface LlmLike {
  listProviders: () => readonly LlmProviderInfoLike[]
  listModels: (provider: string) => Promise<readonly LlmModelInfoLike[]>
}

/** 工具注册表（官方 ctx.tools 的子集）。 */
export interface ToolsLike {
  get: (name: string) => unknown
  register: (definition: unknown) => () => void
  restrict: (filter: { allow?: readonly string[]; deny?: readonly string[] }) => unknown
}

/** 系统提示词注册表（官方 ctx.systemPrompt 的子集）。 */
export interface SystemPromptLike {
  section: (section: { name: string; order: number; text: string }) => () => void
}

/** 摘要里的文件改动（只区分新增/修改/未知，删除没有可信来源）。 */
export interface ChangedFile {
  readonly path: string
  readonly op: 'create' | 'update' | 'unknown'
}

/** 一个会话的「压缩摘要」：只描述做了什么，不含思考内容与工具参数。 */
export interface WorkSummary {
  /** 完成的轮数。 */
  readonly turns: number
  /** 模型调用步数。 */
  readonly steps: number
  /** 带非空思考的步数。 */
  readonly reasoningSteps: number
  /** 工具调用：名称 + 次数（按首次出现顺序）。 */
  readonly toolCalls: readonly { readonly name: string; readonly count: number }[]
  /** 中间正文片段（每条已截断）。 */
  readonly middleTexts: readonly string[]
  /** 最后一轮正文（已截断）。 */
  readonly finalText: string
  /** 改动的文件。 */
  readonly changedFiles: readonly ChangedFile[]
  /** 结束原因（completed / aborted / error / …）。 */
  readonly stopReason: string
  /** 首个 turn/start 的时间戳（毫秒）。 */
  readonly startedAt?: number
  /** 最后一个 turn/end 的时间戳（毫秒）。 */
  readonly endedAt?: number
}

/** 一条派发记录：数字助理开了哪个会话、让它干什么。 */
export interface DispatchRecord {
  readonly sessionId: string
  readonly workspaceId?: string
  readonly cwd?: string
  readonly task: string
  readonly startedAt: number
  /** 已回报过的 turn 序号，避免重复回报。 */
  reportedTurns: Set<number>
  /** 数字助理在等的汇报；子会话被用户接管后不再回报。 */
  active: boolean
}
