/**
 * 数字助理 —— 宿主半边。
 *
 * 一个常驻的唯一会话（固定 sessionId），它有两样专属东西：
 *   1. 专属系统提示词（`systemPrompt.section` 注册在该 agent 作用域）；
 *   2. 专属工具（`agentCtx.tools.register` 注册在该 agent 作用域），
 *      并用 `tools.restrict({ allow: [...] })` 把全局工具收窄到只剩提问工具。
 * 它把需求派给「别的普通顶层会话」：照官方 webhook 范式
 * （`agents.create` + `workspace.attachSession` + `permissionPresets.set` + `followup`）
 * 建会话、投递需求，并在子会话跑完（`session/event` 的 `turn/end`）后
 * 自己折叠出一份压缩摘要回送给自己。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { renderSummaryText, summarizeSession } from './summary.ts'
import type {
  AgentLike,
  AgentDefaultModelLike,
  AgentPresetsLike,
  AgentsLike,
  LlmLike,
  PermissionPresetsLike,
  SessionEventLike,
  SessionLike,
  SessionQueryLike,
  SystemPromptLike,
  ToolsLike,
  WorkspaceLike,
  WorkspaceRegistryLike,
} from './types.ts'

export const name = 'dsh-digital-assistant'

/** 数字助理会话的固定身份：常驻唯一，重启后按同一 id 恢复。 */
export const ASSISTANT_SESSION_ID = 'session-jx-assistant'

/** 数字助理落脚目录登记成的工作区标题。 */
const ASSISTANT_WORKSPACE_TITLE = '数字助理'

/** 数字助理自己的提示词段（scoped，只在它的会话里出现）。 */
const PERSONA_SECTION = 'jx-digital-assistant/persona'

/** 段序：排在部署 persona 前缀（0）之后、后缀（10200）之前。 */
const PERSONA_ORDER = 5000

/** 子会话默认模式。 */
const DEFAULT_PRESET = 'standard'

/** 默认权限：工作区内修改。 */
const DEFAULT_PERMISSION = 'workspace-write'

/** 完全访问权限的取值。 */
const FULL_ACCESS_PERMISSION = 'danger-full-access'

/** `list_sessions` 的默认与上限条数。 */
const SESSIONS_DEFAULT_LIMIT = 12
const SESSIONS_MAX_LIMIT = 40

/** 模组自身位置 → 仓库根 → 数据目录（DSH_HOME 由启动脚本指向仓库内 dsh-home）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const MOD_DIR = resolve(LIB_DIR, '..')
const MODS_DIR = resolve(MOD_DIR, '..')
const REPO_ROOT = resolve(MODS_DIR, '..')
const DSH_HOME = process.env.DSH_HOME ?? join(REPO_ROOT, 'dsh-home')
/** 数字助理会话的工作目录（独立目录，不碰用户的业务目录）。 */
export const ASSISTANT_CWD = join(DSH_HOME, 'assistant')

/**
 * 数字助理的系统提示词。写法面向模型：先说身份与边界，再说分派规则与汇报要求；
 * 不出现 UI/传输/实现词汇（工具名除外）。
 */
const ASSISTANT_PROMPT = `你是「坚祥数字助理」。这个软件是坚祥数字助理，构建在 DSH（DeepSeek Harness）之上；
用户说到「这个软件」「这个助手」「DSH」时，指的就是你现在运行的这个产品（坚祥数字助理 / DeepSeek Harness）。

## 你是谁

你是用户唯一的总入口。用户只对你提需求，由你决定这件事该交给哪个对话去做。
你在界面上只出现在侧边栏左上角的「数字助理」入口：不占工作区里的会话列表，
用户点那个入口就是回到这里。你自己不动手：不读文件、不写文件、不执行命令、不搜网页。
你的全部工作就是「看清需求 → 选对工作区 → 新建或复用对话 → 把需求交代清楚 →
等它做完 → 用摘要向用户汇报」。

## 你手上的工具

- list_workspaces：看用户已经建过哪些工作区。
- list_sessions：看最近的对话（标题、所属工作区、时间、是否还在跑）。
- list_presets：看这台机器上可用的模式（preset）有哪些。
- list_models：看有哪些模型提供方与模型可选。
- read_session_summary：看某个对话做过什么的压缩摘要。
- dispatch_task：在指定工作区**新建**一个对话，并把需求交给它做（后台跑）。
- send_to_session：把新需求追加给**已有**对话。
- create_workspace：新建工作区（只在用户点头之后用；见下）。

## 模式与模型

派活之前用 list_presets / list_models 看一眼可选项，再决定：
- 模式：常规的编码、文件处理、查资料都该用 standard；只在任务确实适合时才换别的模式。
- 模型：用户没点名、你也拿不准时，**不要传 provider/model**，让新对话沿用用户当前的默认模型，这是最稳的选择。
- 只有用户明确指定了某个模型，或任务明显需要某个模型时，才写进 dispatch_task。

## 怎么选目标

1. **先看已有工作区**。优先复用用户已经建过的工作区；不要因为省事就在别处开工。
   我自己的落脚目录不在 list_workspaces 里——那是我的家，不是干活的地方，别往里派活。
2. **没有合适的工作区就提建议并问用户**：给出你建议的目录路径与理由，用 ask_user_question 让用户确认；
   用户同意后才 create_workspace，然后才 dispatch_task。用户不同意就换一个建议，或问他想放哪里。
3. **判断相关性**：先回顾你自己最近十几轮里给用户办过什么、派过哪些活，再对照 list_sessions 里最近的对话
   （必要时用 read_session_summary 看它的轮数与做过什么）。然后照这个规则选：
   - 相关、这件事不复杂、那个对话也还不算长 → 用 send_to_session 复用那个对话（上下文是连续的，效率最高）。
   - 不相关、或者这件事本身复杂、或者那个对话已经很长（轮数多、话题跑偏）→ 用 dispatch_task 新建对话。
   - 拿不准就问用户一句，别自己硬猜。

## 怎么交代需求

写进 dispatch_task / send_to_session 的 task，必须是**一段自足的话**：目标、验收标准、涉及的目录或文件、
以及你知道的相关背景。别写「照上面说的做」这类指代——对面那个对话看不到我们的聊天记录。
目的地工作区要交代清楚，让它在正确的目录里开工。

## 权限

- 默认用 workspace-write（工作区内修改），这是绝大多数情况的正解。
- 只有确实需要动工作区之外的东西（装全局依赖、改系统目录、访问别的盘）时，才考虑 danger-full-access。
- **要用完全访问，必须先问用户**：先用 ask_user_question 把「为什么需要」「要动哪里」讲清楚，让用户选。
  用户明确同意后，调用 dispatch_task 时带上 permission="danger-full-access" 且 user_confirmed=true。
  用户没同意就退回 workspace-write。这一条没有例外。

## 汇报

dispatch_task 是**后台**的：它立刻返回一个会话 id，活在那里跑。
那个对话跑完时，你会自动收到一条消息，里面是它的压缩摘要（做了几轮几步、调用了哪些工具、
中间说了什么、最后的答复、改了哪些文件）——不含它的思考内容和工具参数细节。
收到摘要后，用**用户听得懂的话**汇报：做成了什么、结果在哪、有没有留下没做完的事。
用户想细看，就提示他点侧边栏里那个对话；需要更多细节时你可以 read_session_summary。

一次可以派多个互不相干的需求（并行）。同一件事别重复派。`

/** 路径比较：Windows 下大小写不敏感，且忽略末尾分隔符。 */
function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replace(/[\\/]+$/u, '').replace(/\//gu, '\\').toLowerCase()
  return normalize(left) === normalize(right)
}

/** epoch 毫秒 → 本地「MM-DD HH:mm」。 */
function formatTime(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 内容块 helper：工具输出一律是纯文本块。 */
function textBlock(text: string): { type: 'text'; text: string }[] {
  return [{ type: 'text', text }]
}

/** 一个工具的统一文本输出 schema。 */
const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
} as const

/** 读取会话的事件（官方 0.1.6 起是 snapshotEvents()，旧版是 events）。 */
function eventsOf(session: SessionLike): readonly SessionEventLike[] {
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  return session.events ?? []
}

/**
 * 数字助理网关：既是它的运行时（保证会话存在、派发、回报），
 * 也是浏览器半边要用的 Remote（`jxAssistant.ensure`）。
 */
export class JxAssistantGateway extends TypertRemoteService {
  /** 宿主服务依赖：缺一个就不挂载（web profile 全部具备）。 */
  static inject = [
    'agents',
    'sessions',
    'workspaceRegistry',
    'sessionQuery',
    'tools',
    'systemPrompt',
  ]

  /** 数字助理会话的创建/恢复在途，避免并发重复建。 */
  private creating: Promise<AgentLike> | undefined

  /** 在跑或已跑过的派发记录：sessionId → 记录。 */
  private readonly dispatches = new Map<string, {
    workspaceTitle?: string
    task: string
    active: boolean
    reportedTurns: Set<number>
  }>()

  /** 本插件注册的事件的释放函数。 */
  private readonly disposers: Array<() => void> = []

  constructor(ctx: Context) {
    super(ctx, 'jxAssistant')
    this.ctx.effect(() => () => {
      for (const dispose of this.disposers.splice(0)) {
        try { dispose() } catch { /* 卸载期的清理失败不阻塞拆除 */ }
      }
    }, 'dsh-digital-assistant: teardown')
    this.watchSessionEvents()
  }

  /** 宿主服务（结构化读取）。 */
  private get agents(): AgentsLike {
    return (this.ctx as unknown as { agents: AgentsLike }).agents
  }

  private get registry(): WorkspaceRegistryLike {
    return (this.ctx as unknown as { workspaceRegistry: WorkspaceRegistryLike }).workspaceRegistry
  }

  private get sessionQuery(): SessionQueryLike {
    return (this.ctx as unknown as { sessionQuery: SessionQueryLike }).sessionQuery
  }

  private get tools(): ToolsLike {
    return (this.ctx as unknown as { tools: ToolsLike }).tools
  }

  private get presets(): AgentPresetsLike | undefined {
    return this.ctx.get('agentPresets') as AgentPresetsLike | undefined
  }

  private get permissions(): PermissionPresetsLike | undefined {
    return this.ctx.get('permissionPresets') as PermissionPresetsLike | undefined
  }

  private get defaultModel(): AgentDefaultModelLike | undefined {
    return this.ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
  }

  /** 模型运行时（可选）：让数字助理看得见可选的提供方与模型。 */
  private get llm(): LlmLike | undefined {
    return this.ctx.get('llm') as LlmLike | undefined
  }

  /** 会话标题服务（可选）：派发的会话由它写标题，绝不自己拼 session/title 事件。 */
  private get sessionTitle(): { rename: (session: SessionLike, title: string) => unknown } | undefined {
    return this.ctx.get('sessionTitle') as { rename: (session: SessionLike, title: string) => unknown } | undefined
  }

  /**
   * 保证数字助理会话存在（活跃则直接返回，冷会话恢复，全新则创建），
   * 并把它的 id 交给浏览器半边用来跳转。
   * @returns 数字助理会话的 id。
   */
  async ensure(): Promise<{ sessionId: string }> {
    // 入口点击的每一步都留痕：客户端那边「点了没反应」时，看服务窗口就知道卡在哪一段。
    console.log('[dsh-digital-assistant] ensure(): 请求到达')
    try {
      const agent = await this.ensureAssistant()
      console.log(`[dsh-digital-assistant] ensure(): 完成 → ${agent.id}`)
      return { sessionId: agent.id }
    } catch (error: unknown) {
      console.error('[dsh-digital-assistant] ensure(): 失败', error)
      throw error
    }
  }

  /** 数字助理会话的当前状态（诊断用）。 */
  async status(): Promise<{ sessionId: string; cwd: string; running: boolean; dispatched: number }> {
    const agent = await this.ensureAssistant()
    return {
      sessionId: agent.id,
      cwd: agent.session.header.cwd ?? ASSISTANT_CWD,
      running: agent.status === 'running',
      dispatched: this.dispatches.size,
    }
  }

  // ---------------------------------------------------------------- 会话

  /** 取出（必要时建立）数字助理会话。 */
  private async ensureAssistant(): Promise<AgentLike> {
    const live = this.agents.get(ASSISTANT_SESSION_ID)
    if (live !== undefined) return live
    if (this.creating !== undefined) return this.creating
    const attempt = this.createOrResumeAssistant().finally(() => {
      if (this.creating === attempt) this.creating = undefined
    })
    this.creating = attempt
    return attempt
  }

  /** 冷恢复优先、否则新建；两种路径都装上同一套提示词与工具。 */
  private async createOrResumeAssistant(): Promise<AgentLike> {
    const cwd = await this.ensureAssistantWorkspace()
    const setup = async (agentCtx: unknown): Promise<void> => { await this.composeAssistant(agentCtx) }
    // 数字助理不挂 preset，提示词只用到 {{cwd}}，所以模型拿不到时不必强求；
    // 拿得到就传上，让 {{provider}}/{{model}} 也有值。
    const route = this.optionalRoute()
    const agentOptions = route === undefined ? {} : { agentOptions: route }
    const persisted = await this.hasPersisted(ASSISTANT_SESSION_ID)
    let handle
    if (persisted === false) {
      handle = await this.agents.create({ sessionId: ASSISTANT_SESSION_ID, meta: { cwd }, ...agentOptions, setup })
    } else {
      // 已知存在、或持久化暂时读不出来时先走冷恢复；只有确认「不存在」才新建，
      // 免得在持久化不可读时另建一个同 id 的会话，把历史劈成两半。
      try {
        handle = await this.agents.resume({ resumeSessionId: ASSISTANT_SESSION_ID, ...agentOptions, setup })
      } catch (error: unknown) {
        if (persisted === true) throw error
        this.warn(`冷恢复数字助理会话失败，改为新建：${String(error)}`)
        handle = await this.agents.create({ sessionId: ASSISTANT_SESSION_ID, meta: { cwd }, ...agentOptions, setup })
      }
    }
    const agent = handle.agent
    // 必须把会话挂进它落脚目录对应的工作区：实测（Playwright 真机点入口）发现，
    // **不属于任何工作区的会话，客户端 openSession 会静默失败**（宿主侧 ensure 正常返回、
    // 客户端也不报错，但主列不切换）。所以这里保留工作区归属；「不占侧边栏会话列表」
    // 由客户端 sessionVisible 按固定 id 排除负责（《修改记录》条目 74）。
    // 注意：挂工作区后，落脚目录一旦变化（换 DSH_HOME / 挪安装位置），同一个会话会被
    // 两个工作区记账，官方会判 `workspace domain is inconsistent`——所以别改 ASSISTANT_CWD。
    await this.attachToWorkspace(agent.session, cwd)
    return agent
  }

  /** 该会话是否已在持久化里：true/false，读不出来时是 undefined（未知）。 */
  private async hasPersisted(sessionId: string): Promise<boolean | undefined> {
    try {
      const records = await this.sessionQuery.listSessions()
      return records.some(record => record.header.id === sessionId)
    } catch (error: unknown) {
      this.warn(`列举会话失败，按「未知」处理：${String(error)}`)
      return undefined
    }
  }

  /** 保证数字助理的落脚目录存在；返回它的路径（**不**登记为工作区）。 */
  private async ensureAssistantWorkspace(): Promise<string> {
    try {
      mkdirSync(ASSISTANT_CWD, { recursive: true })
    } catch (error: unknown) {
      this.warn(`建立数字助理落脚目录失败：${String(error)}`)
    }
    return ASSISTANT_CWD
  }

  /** 把会话挂进它落脚目录对应的工作区（没有就当场登记一个）。 */
  private async attachToWorkspace(session: SessionLike, cwd: string): Promise<void> {
    let workspace = this.registry.list().find(item => samePath(item.path, cwd))
    if (workspace === undefined) {
      try {
        workspace = await this.registry.create(cwd, ASSISTANT_WORKSPACE_TITLE)
      } catch (error: unknown) {
        this.warn(`登记数字助理工作区失败（会话将不属于任何工作区、入口可能打不开）：${String(error)}`)
        return
      }
    }
    try {
      await workspace.attachSession(session.id)
    } catch (error: unknown) {
      this.warn(`会话 ${session.id} 挂工作区失败（入口可能打不开）：${String(error)}`)
    }
  }

  /** 这个工作区是不是数字助理自己的落脚目录。 */
  private isAssistantWorkspace(workspace: WorkspaceLike): boolean {
    return samePath(workspace.path, ASSISTANT_CWD)
  }

  // ------------------------------------------------------- 数字助理的组装

  /**
   * 在 agent 作用域里装提示词、官方提问工具与专属工具。
   * @param agentCtx - 该 agent 的作用域上下文（setup 回调给的那个）。
   */
  private async composeAssistant(agentCtx: unknown): Promise<void> {
    const scoped = agentCtx as {
      tools?: ToolsLike
      systemPrompt?: SystemPromptLike
      plugin?: (mod: unknown) => unknown
    }
    // 必须用 agentCtx 上的服务：cordis 的 tracker 把服务实例的 `ctx` 重定向到访问者，
    // 于是 section() 落进这个 agent 的 scope。用插件的 this.systemPrompt 会注册成
    // 全局段，让每个会话都读到数字助理的提示词——所以拿不到 scoped 服务时宁可不注册。
    const systemPrompt = scoped.systemPrompt
    if (systemPrompt === undefined) {
      this.warn('数字助理作用域里没有 systemPrompt 服务，专属提示词未注册。')
    } else {
      try {
        systemPrompt.section({ name: PERSONA_SECTION, order: PERSONA_ORDER, text: ASSISTANT_PROMPT })
      } catch (error: unknown) {
        this.warn(`注册数字助理提示词失败：${String(error)}`)
      }
    }
    // 提问工具：官方的 ask_user_question 注册在**预设作用域**里，而数字助理不挂预设，
    // 所以把官方那一行插件挂到它自己的作用域（完全访问确认、工作区建议都靠它）。
    try {
      const toolAskUser = await import('@deepseek-ai/dsh-tool-ask-user')
      scoped.plugin?.(toolAskUser)
    } catch (error: unknown) {
      this.warn(`挂提问工具失败（数字助理将无法提问确认完全访问）：${String(error)}`)
    }
    const tools = scoped.tools
    if (tools === undefined) {
      this.warn('数字助理作用域里没有 tools 服务，专属工具未注册。')
      return
    }
    for (const definition of this.buildTools()) {
      try {
        tools.register(definition)
      } catch (error: unknown) {
        this.warn(`注册工具失败：${String(error)}`)
      }
    }
    // 兜底收窄：官方工具其实都注册在预设作用域里、全局层通常是空的——那种情况下这里
    // 什么都不用做（数字助理本来也只看得见我给的这些工具，实测已确认）。真有全局工具时，
    // 白名单优先、退而黑名单，把读写/执行类挡在外面。
    const allowed = ['ask_user_question', 'todo_write'].filter(candidate => this.tools.get(candidate) !== undefined)
    try {
      if (allowed.length > 0) {
        tools.restrict({ allow: allowed })
        return
      }
      const dangerous = [
        'bash', 'pwsh', 'read', 'write', 'edit', 'read_image', 'glob', 'grep', 'str_replace_editor',
        'terminal_open', 'terminal_close', 'terminal_list', 'terminal_read', 'terminal_send', 'terminal_signal',
        'web_search', 'web_fetch', 'present', 'skill', 'lsp', 'workflow', 'ralph', 'plugin_manager',
        'job_list', 'job_output', 'job_kill', 'create_goal', 'get_goal', 'update_goal',
        'session_search', 'session_trace', 'session_event_read', 'session_event_search', 'session_event_trace',
      ].filter(candidate => this.tools.get(candidate) !== undefined)
      if (dangerous.length > 0) {
        tools.restrict({ deny: dangerous })
        this.warn(`全局层存在工具，已用黑名单挡掉 ${dangerous.length} 个读写/执行类工具。`)
      }
    } catch (error: unknown) {
      this.warn(`工具收窄失败：${String(error)}`)
    }
  }

  // -------------------------------------------------------------- 工具集

  /** 构造数字助理的 8 个专属工具。 */
  private buildTools(): unknown[] {
    return [
      this.listWorkspacesTool(),
      this.listSessionsTool(),
      this.listPresetsTool(),
      this.listModelsTool(),
      this.readSummaryTool(),
      this.dispatchTool(),
      this.sendToSessionTool(),
      this.createWorkspaceTool(),
    ]
  }

  private listWorkspacesTool(): unknown {
    return defineTool({
      name: 'list_workspaces',
      description: '列出用户已经建立过的工作区（id、名称、路径、会话数）。选目标之前先看这个。',
      parameters: {},
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (): Promise<{ text: string }> => {
        // 数字助理自己的工作区是它的家，不是派发目标，所以不列给它。
        const workspaces = this.registry.list().filter(item => !this.isAssistantWorkspace(item))
        if (workspaces.length === 0) {
          return { text: '（用户还没有建立任何工作区。要开工就自己建议一个目录路径、用 ask_user_question 问过用户，再用 create_workspace 建）' }
        }
        const lines = workspaces.map(workspace => `- ${workspace.title}｜id=${workspace.id}｜路径=${workspace.path}｜会话 ${workspace.sessionIds.length} 个`)
        return { text: lines.join('\n') }
      },
    })
  }

  private listSessionsTool(): unknown {
    return defineTool({
      name: 'list_sessions',
      description: '列出最近的对话（默认 12 条，最多 40 条）：id、标题、所属工作区、创建时间、是否正在运行。用来判断新需求跟哪个对话相关。',
      parameters: {
        limit: { type: 'number', description: `返回条数，默认 ${SESSIONS_DEFAULT_LIMIT}，上限 ${SESSIONS_MAX_LIMIT}。` },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: { limit?: number }): Promise<{ text: string }> => {
        const raw = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : SESSIONS_DEFAULT_LIMIT
        const limit = Math.min(Math.max(1, raw), SESSIONS_MAX_LIMIT)
        let records
        try {
          records = await this.sessionQuery.listSessions()
        } catch (error: unknown) {
          return { text: `读取会话列表失败：${String(error)}` }
        }
        const workspaces = this.registry.list()
        const pick = records
          .filter(record => record.header.id !== ASSISTANT_SESSION_ID && record.header.origin !== 'subagent')
          .sort((left, right) => (right.header.createdAt ?? 0) - (left.header.createdAt ?? 0))
          .slice(0, limit)
        if (pick.length === 0) return { text: '（除我之外还没有别的对话）' }
        const lines: string[] = []
        for (const record of pick) {
          const header = record.header
          const workspace = workspaces.find(item => header.cwd !== undefined && samePath(item.path, header.cwd))
          const title = await this.readTitle(header.id)
          const live = this.agents.get(header.id)
          const running = live?.status === 'running' ? '｜正在运行' : ''
          const dispatched = this.dispatches.has(header.id) ? '｜我派发的' : ''
          lines.push(`- ${title}｜id=${header.id}｜工作区=${workspace?.title ?? header.cwd ?? '未知'}｜${formatTime(header.createdAt)}${running}${dispatched}`)
        }
        return { text: lines.join('\n') }
      },
    })
  }

  private listPresetsTool(): unknown {
    return defineTool({
      name: 'list_presets',
      description: `列出这台机器上可用的模式（agent preset）及其 id。dispatch_task 的 preset 用这里的 id；拿不准就用 ${DEFAULT_PRESET}，或干脆不传。`,
      parameters: {},
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (): Promise<{ text: string }> => {
        const presets = this.presets
        if (presets === undefined || typeof presets.list !== 'function') {
          return { text: `（这个部署没有提供模式服务；dispatch_task 不要传 preset，它会用默认的 ${DEFAULT_PRESET}）` }
        }
        let rows: readonly { id: string; name?: string; description?: string; broken?: boolean }[]
        try {
          rows = await presets.list()
        } catch (error: unknown) {
          return { text: `读取模式列表失败：${String(error)}；dispatch_task 不传 preset 即可。` }
        }
        const usable = rows.filter(row => row.broken !== true)
        if (usable.length === 0) return { text: `（没有可用模式；dispatch_task 不要传 preset）` }
        const lines = usable.map(row => `- ${row.id}${row.name === undefined ? '' : `｜${row.name}`}${row.description === undefined ? '' : `（${row.description}）`}`)
        return { text: `${lines.join('\n')}\n不特别说明时用 ${DEFAULT_PRESET}。` }
      },
    })
  }

  private listModelsTool(): unknown {
    return defineTool({
      name: 'list_models',
      description: '看有哪些模型可选：不带参数列出模型提供方 id，带 provider 列出它的模型。dispatch_task 的 provider/model 用这里返回的值；拿不准就别传，让新对话沿用用户当前的默认模型。',
      parameters: {
        provider: { type: 'string', description: '模型提供方 id；省略则列出全部提供方。' },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: { provider?: string }): Promise<{ text: string }> => {
        const llm = this.llm
        if (llm === undefined) {
          return { text: '（这个部署没有模型服务；dispatch_task 不要传 provider/model，会用用户当前的默认模型）' }
        }
        const provider = typeof args.provider === 'string' ? args.provider.trim() : ''
        try {
          if (provider === '') {
            const providers = llm.listProviders()
            if (providers.length === 0) return { text: '（没有已注册的模型提供方）' }
            return {
              text: `${providers.map(item => `- ${item.id}｜${item.name}`).join('\n')}\n`
                + '（再带 provider 查一次可以看到它的模型；不指定 provider/model 就沿用用户当前的默认模型）',
            }
          }
          const models = await llm.listModels(provider)
          if (models.length === 0) {
            return { text: `（${provider} 没有公布模型清单；它可能仍接受某个具体模型 id，但拿不准就别指定）` }
          }
          return { text: models.map(model => `- ${provider}/${model.id}｜${model.name}`).join('\n') }
        } catch (error: unknown) {
          return { text: `读取模型列表失败：${String(error)}；dispatch_task 不传 provider/model 即可。` }
        }
      },
    })
  }

  private readSummaryTool(): unknown {
    return defineTool({
      name: 'read_session_summary',
      description: '读某个对话做过什么的压缩摘要（轮数与步数、调用过哪些工具、中间与最后的正文、改动了哪些文件）。不返回思考内容和工具参数。',
      parameters: {
        session_id: { type: 'string', required: true, description: '目标对话的 id。' },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: { session_id: string }): Promise<{ text: string }> => {
        const sessionId = typeof args.session_id === 'string' ? args.session_id.trim() : ''
        if (sessionId === '') return { text: '需要给出 session_id。' }
        return { text: await this.describeSession(sessionId) }
      },
    })
  }

  private dispatchTool(): unknown {
    return defineTool({
      name: 'dispatch_task',
      description: '在指定工作区新建一个对话，把需求交给它后台执行。立刻返回新对话的 id；它跑完时你会收到压缩摘要。用户没同意不要用完全访问权限。',
      parameters: {
        task: { type: 'string', required: true, description: '要交代给那个对话的完整需求（自足的一段话，别用「照上面说的」这类指代）。' },
        workspace_id: { type: 'string', required: true, description: '目标工作区 id，来自 list_workspaces。' },
        preset: { type: 'string', description: `模式（agent preset）id，默认 ${DEFAULT_PRESET}。` },
        provider: { type: 'string', description: '模型提供方 id（与 model 同时给才生效）。' },
        model: { type: 'string', description: '模型 id（与 provider 同时给才生效）。' },
        permission: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'], description: `权限预设，默认 ${DEFAULT_PERMISSION}。完全访问必须先经用户同意。` },
        user_confirmed: { type: 'boolean', description: '仅在用户已通过提问明确同意完全访问权限时传 true。' },
        title: { type: 'string', description: '给新对话起的标题（便于用户和我日后辨认），可省略。' },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: {
        task: string
        workspace_id: string
        preset?: string
        provider?: string
        model?: string
        permission?: string
        user_confirmed?: boolean
        title?: string
      }): Promise<{ text: string }> => {
        const task = typeof args.task === 'string' ? args.task.trim() : ''
        if (task === '') return { text: '需要 task（要交代给那个对话的需求）。' }
        const workspace = this.registry.get(args.workspace_id)
        if (workspace === undefined) {
          return { text: `找不到工作区 ${JSON.stringify(args.workspace_id)}。先用 list_workspaces 看有哪些，或者问用户要不要新建一个。` }
        }
        if (this.isAssistantWorkspace(workspace)) {
          return {
            text: `工作区「${workspace.title}」是数字助理自己的家，不能把活派到那里。`
              + '请改用 list_workspaces 里的某个用户工作区；没有合适的就先建议一个目录路径、问过用户后再用 create_workspace 建。',
          }
        }
        const permission = typeof args.permission === 'string' && args.permission !== '' ? args.permission : DEFAULT_PERMISSION
        if (permission === FULL_ACCESS_PERMISSION && args.user_confirmed !== true) {
          return {
            text: '完全访问权限（danger-full-access）没有被用户确认。请先用 ask_user_question 说明「为什么需要完全访问」「会动到工作区之外的什么」，'
              + '拿到用户的明确同意后，再带上 user_confirmed=true 重新调用。用户不同意就改用 workspace-write。',
          }
        }
        try {
          const sessionId = await this.createDispatchedSession({
            task,
            workspace,
            permission,
            ...(typeof args.preset === 'string' && args.preset !== '' ? { preset: args.preset } : {}),
            ...(typeof args.provider === 'string' && args.provider !== '' ? { provider: args.provider } : {}),
            ...(typeof args.model === 'string' && args.model !== '' ? { model: args.model } : {}),
            ...(typeof args.title === 'string' && args.title !== '' ? { title: args.title } : {}),
          })
          return {
            text: `已开工：会话 ${sessionId}（工作区「${workspace.title}」，权限 ${permission}，${this.describeRoute(args.provider, args.model)}）。`
              + '它在后台跑，跑完我会收到摘要并汇报给用户；现在可以先回用户一句「已经派下去了」。',
          }
        } catch (error: unknown) {
          return { text: `开工失败：${String(error)}` }
        }
      },
    })
  }

  private sendToSessionTool(): unknown {
    return defineTool({
      name: 'send_to_session',
      description: '把新需求追加给一个已有对话（相关且不复杂时优先这样做，上下文是连续的）。它跑完时你会收到压缩摘要。',
      parameters: {
        session_id: { type: 'string', required: true, description: '目标对话 id。' },
        task: { type: 'string', required: true, description: '完整、自足的一段需求。' },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: { session_id: string; task: string }): Promise<{ text: string }> => {
        const sessionId = typeof args.session_id === 'string' ? args.session_id.trim() : ''
        const task = typeof args.task === 'string' ? args.task.trim() : ''
        if (sessionId === '' || task === '') return { text: '需要 session_id 与 task。' }
        try {
          const agent = await this.ensureLiveAgent(sessionId)
          // 同 dispatch：按用户消息显示，开头标明是数字助理转达的。
          agent.followup(createUserMessage({
            content: [{ type: 'text', text: `【数字助理转达】\n\n${task}` }],
            source: { kind: 'user' },
          }))
          const workspaceTitle = this.workspaceTitleOf(agent.session)
          this.dispatches.set(sessionId, {
            ...(workspaceTitle === undefined ? {} : { workspaceTitle }),
            task,
            active: true,
            reportedTurns: new Set<number>(),
          })
          return { text: `已把需求追加给会话 ${sessionId}。它跑完我会收到摘要。` }
        } catch (error: unknown) {
          return { text: `追加失败：${String(error)}` }
        }
      },
    })
  }

  private createWorkspaceTool(): unknown {
    return defineTool({
      name: 'create_workspace',
      description: '新建一个工作区（目录不存在会自动创建）。只在用户已明确同意这个路径之后调用。',
      parameters: {
        path: { type: 'string', required: true, description: '工作区目录的绝对路径。' },
        title: { type: 'string', description: '显示名称，省略时用目录名。' },
      },
      output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
      execute: async (args: { path: string; title?: string }): Promise<{ text: string }> => {
        const path = typeof args.path === 'string' ? args.path.trim() : ''
        if (path === '') return { text: '需要 path（目录绝对路径）。' }
        try {
          mkdirSync(path, { recursive: true })
          const workspace = await this.registry.create(path, typeof args.title === 'string' && args.title !== '' ? args.title : undefined)
          return { text: `已建立工作区「${workspace.title}」（id=${workspace.id}，路径=${workspace.path}）。` }
        } catch (error: unknown) {
          return { text: `建立工作区失败：${String(error)}` }
        }
      },
    })
  }

  /**
   * 决定一个会话的模型路由：调用方指定的优先，否则用全局默认。
   * 必须总有值——会话的 `{{model}}` 提示词变量取自 `agent.options.model`，
   * 缺了它、又挂着会用到该变量的预设，第一次组装提示词就会失败。
   * @param provider - 调用方指定的提供方（与 model 成对）。
   * @param model - 调用方指定的模型。
   * @returns 可直接当 `agentOptions` 用的路由。
   */
  private resolveRoute(provider?: string, model?: string): { provider: string, model: string } {
    if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
      return { provider, model }
    }
    const current = this.defaultModel?.currentSelection()
    if (current !== undefined && typeof current.provider === 'string' && current.provider !== ''
      && typeof current.model === 'string' && current.model !== '') {
      return { provider: current.provider, model: current.model }
    }
    throw new Error('无法确定模型：agent-default-model 服务不可用，请在 dispatch_task 里显式给出 provider 与 model。')
  }

  /** 拿得到就用、拿不到就算了（只给数字助理自己的会话用，它不挂预设、只用到 {{cwd}}）。 */
  private optionalRoute(): { provider: string, model: string } | undefined {
    try {
      return this.resolveRoute()
    } catch {
      // 默认模型服务不可用不该阻断数字助理会话的建立。
      return undefined
    }
  }

  /** 派发结果里说明这次用的哪个模型。 */
  private describeRoute(provider?: string, model?: string): string {
    const explicit = typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== ''
    try {
      const route = this.resolveRoute(provider, model)
      return explicit ? `模型 ${route.provider}/${route.model}` : `模型沿用当前默认 ${route.provider}/${route.model}`
    } catch {
      // 这里读不出来只影响文案：真正的派发会先在 resolveRoute 处报错。
      return '模型未能确定'
    }
  }

  // ------------------------------------------------------- 建会话与投递

  /** 建一个顶层会话、设权限与模型、投递需求，并登记回报。 */
  private async createDispatchedSession(input: {
    task: string
    workspace: WorkspaceLike
    permission: string
    preset?: string
    provider?: string
    model?: string
    title?: string
  }): Promise<string> {
    const sessionId = `session-${randomUUID()}`
    const presets = this.presets
    let presetId: string | undefined
    if (presets !== undefined) {
      const resolved = await presets.resolve(input.preset ?? DEFAULT_PRESET)
      presetId = resolved.id
    }
    // 必须总有 agentOptions：会话的 {{model}} 提示词变量取自 agent.options.model
    // （agent-loop 注册），不传的话，挂了 standard 预设的会话第一次组装提示词就会以
    // `prompt variable "{{model}}" has no value` 失败——官方 create/resume 也都必传。
    const route = this.resolveRoute(input.provider, input.model)
    const handle = await this.agents.create({
      sessionId,
      meta: { cwd: input.workspace.path, ...(presetId === undefined ? {} : { agentPreset: presetId }) },
      agentOptions: route,
      setup: async (agentCtx: unknown): Promise<void> => {
        if (presets === undefined || presetId === undefined) return
        await presets.mount(agentCtx, presetId)
      },
    })
    const agent = handle.agent
    try {
      await input.workspace.attachSession(sessionId)
    } catch (error: unknown) {
      this.warn(`新会话 ${sessionId} 挂工作区失败：${String(error)}`)
    }
    const permissions = this.permissions
    if (permissions !== undefined) {
      try {
        permissions.resolve(input.permission)
        permissions.set(agent.session, input.permission)
      } catch (error: unknown) {
        this.warn(`设置权限 ${input.permission} 失败：${String(error)}`)
      }
    }
    if (input.title !== undefined) {
      try {
        // 标题只经官方服务写：session/title 事件的 data 是
        // { title, messageSeqs, source: { kind: 'user' } }，手写少字段会被官方判为
        // 日志损坏（《修改记录》条目 68 的事故），所以一律不自己 append。
        this.sessionTitle?.rename(agent.session, input.title)
      } catch (error: unknown) {
        this.warn(`写标题失败：${String(error)}`)
      }
    }
    // 派发出去的需求要**像一条用户消息那样显示**（右侧气泡），并在开头标明来源：
    // 用 plugin 来源会被前端渲染成一行低调的「上下文注入」，用户会以为「看不到需求」。
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: `【数字助理派发】\n\n${input.task}` }],
      source: { kind: 'user' },
    }))
    this.dispatches.set(sessionId, {
      workspaceTitle: input.workspace.title,
      task: input.task,
      active: true,
      reportedTurns: new Set<number>(),
    })
    return sessionId
  }

  /** 取活跃 agent；冷会话按它记录的 preset 恢复。 */
  private async ensureLiveAgent(sessionId: string): Promise<AgentLike> {
    const live = this.agents.get(sessionId)
    if (live !== undefined) return live
    const snapshot = await this.sessionQuery.readSession(sessionId)
    const presetId = snapshot.session.agentPreset
    const presets = this.presets
    const handle = await this.agents.resume({
      resumeSessionId: sessionId,
      // 冷恢复同样要带路由（官方 session-controller 的 resume 也这么做）：会话自己的
      // 请求头优先，这只在它还没发过请求时定下首个路由、并让 {{model}} 有值。
      agentOptions: this.resolveRoute(),
      setup: async (agentCtx: unknown): Promise<void> => {
        if (presets === undefined || presetId === undefined) return
        await presets.mount(agentCtx, presetId)
      },
    })
    return handle.agent
  }

  // ---------------------------------------------------------- 完成与回报

  /** 盯住派发出去的会话：turn/end 一到就折叠摘要回送数字助理。 */
  private watchSessionEvents(): void {
    const dispose = this.ctx.on('session/event', (session: SessionLike, event: SessionEventLike) => {
      const record = this.dispatches.get(session.id)
      if (record === undefined || !record.active) return
      if (event.type !== 'turn/end') return
      const turn = typeof event.data?.turn === 'number' ? event.data.turn : -1
      if (record.reportedTurns.has(turn)) return
      record.reportedTurns.add(turn)
      record.active = false
      void this.reportCompletion(session.id).catch((error: unknown) => {
        this.warn(`回报会话 ${session.id} 失败：${String(error)}`)
      })
    })
    this.disposers.push(dispose)
  }

  /** 读日志 → 折叠 → 作为一条消息送进数字助理。 */
  private async reportCompletion(sessionId: string): Promise<void> {
    const record = this.dispatches.get(sessionId)
    const assistant = await this.ensureAssistant()
    const text = await this.describeSession(sessionId)
    const head = record === undefined
      ? `【派发回报】会话 ${sessionId} 这一轮结束了。`
      : `【派发回报】你派给工作区「${record.workspaceTitle ?? '未知'}」的那个对话（${sessionId}）这一轮结束了。`
    assistant.followup(createUserMessage({
      content: [{ type: 'text', text: `${head}\n\n${text}\n\n请用用户听得懂的话向他汇报这件事的进展。` }],
      source: { kind: 'plugin', plugin: 'dsh-digital-assistant' },
    }))
  }

  /** 把一个会话折叠成摘要文本（工具与回报共用）。 */
  private async describeSession(sessionId: string): Promise<string> {
    let snapshot
    try {
      snapshot = await this.sessionQuery.readSession(sessionId)
    } catch (error: unknown) {
      return `读会话 ${sessionId} 的日志失败：${String(error)}`
    }
    const summary = summarizeSession(snapshot.events)
    const title = await this.readTitle(sessionId)
    const workspaceTitle = this.workspaceTitleOfPath(snapshot.session.cwd)
    const record = this.dispatches.get(sessionId)
    return renderSummaryText(summary, {
      sessionId,
      ...(title === undefined ? {} : { title }),
      ...(workspaceTitle === undefined ? {} : { workspaceTitle }),
      ...(record === undefined ? {} : { task: record.task }),
    })
  }

  /** 读会话标题；读不到就返回 undefined。 */
  private async readTitle(sessionId: string): Promise<string | undefined> {
    const readTitle = this.sessionQuery.readTitle
    if (typeof readTitle !== 'function') return undefined
    try {
      const snapshot = await readTitle.call(this.sessionQuery, sessionId)
      const title = snapshot?.title
      return typeof title === 'string' && title.trim() !== '' ? title : undefined
    } catch {
      // 标题只是展示信息：读不到（会话损坏/无标题事件）不该让摘要失败。
      return undefined
    }
  }

  /** 按 cwd 找它所属工作区的标题。 */
  private workspaceTitleOfPath(cwd: string | undefined): string | undefined {
    if (cwd === undefined) return undefined
    return this.registry.list().find(item => samePath(item.path, cwd))?.title
  }

  /** 按会话取工作区标题。 */
  private workspaceTitleOf(session: SessionLike): string | undefined {
    return this.workspaceTitleOfPath(session.header.cwd)
  }

  /** 统一的告警出口（模组不静默吞错）。 */
  private warn(message: string): void {
    try {
      // eslint-disable-next-line no-console -- 模组的诊断出口
      console.warn(`[dsh-digital-assistant] ${message}`)
    } catch {
      // 控制台不可用时无处可写，忽略。
    }
  }
}

// typert-protocol 的远程方法标记（等价于每个方法上的 @Remote('...')）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
Object.defineProperty(JxAssistantGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'ensure', invocation: Object.freeze({ kind: 'direct' }) },
      { method: 'status', invocation: Object.freeze({ kind: 'direct' }) },
    ]),
  }),
})

export default JxAssistantGateway
