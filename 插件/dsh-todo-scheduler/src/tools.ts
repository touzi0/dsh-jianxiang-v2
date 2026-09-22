/**
 * 面向模型的待办/定时任务工具（全局层，注册进 `ctx.tools`，所有会话可见，
 * 官方注册方式与 `packages/todo/tool-todo`（`todo_write`）同一条正道）。
 *
 * 工具集（增删改查 + 立即执行 + 工作区枚举）：
 * - todo_task_list / todo_task_get：查看
 * - todo_task_create / todo_task_update / todo_task_delete：增/改/删
 * - todo_task_run：立即执行一次（delete 与 run 走官方审批，不绕过）
 * - todo_workspace_list：程序任务要选工作目录，模型先看有哪些
 *
 * schedule 是明确的结构化参数（三种形态见 SCHEDULE_PARAM），不收自由字符串；
 * 返回值一律含任务 id 与人类可读确认，便于多轮操作。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  CommandSpec,
  CreateTaskRequest,
  RunRecord,
  Schedule,
  TaskItem,
  TaskView,
  TodoSnapshot,
  UpdateTaskRequest,
  WorkspaceOption,
} from './types.ts'

/** 工具 execute 拿到的执行上下文（官方 ToolExecution 的最小结构面）。 */
export interface ToolExecLike {
  readonly name: string
  readonly callId?: unknown
  /** 发起调用的 agent；非会话调用（自测/诊断）没有。 */
  readonly agent?: unknown
}

/**
 * 审批回调：宿主侧接官方 `ctx.get('approval')`。
 * @returns true = 已获用户批准（或调用方没有 agent 上下文，无从审批）。
 */
export type AskApproval = (exec: ToolExecLike, reason: string) => Promise<boolean>

/** 网关的公开方法面（JxTodoGateway 满足；自测可用假件）。 */
export interface TodoGatewayFace {
  listTasks(): Promise<TodoSnapshot>
  createTask(request: CreateTaskRequest): Promise<{ task: TaskView }>
  updateTask(request: UpdateTaskRequest): Promise<{ task: TaskView }>
  deleteTask(request: { id: string }): Promise<{ ok: true }>
  runNow(request: { id: string }): Promise<{ ok: boolean, sessionId?: string, error?: string }>
  listWorkspaces(): Promise<{ items: WorkspaceOption[] }>
}

/** 内容块 helper：工具输出一律纯文本。 */
function textBlock(text: string): { type: 'text', text: string }[] {
  return [{ type: 'text', text }]
}

const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
} as const

/** 时刻 “HH:mm” → 当天分钟数（校验用，复用宿主同一规则）。 */
function parseTimeToMinutes(time: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time.trim())
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined
  return hours * 60 + minutes
}

/**
 * “YYYY-MM-DD HH:mm”（本地时区）→ epoch 毫秒。也接受可被 Date.parse 的
 * ISO 形式做兜底，但推荐明确格式。
 */
function parseLocalDateTime(text: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/u.exec(text.trim())
  if (match !== null) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
    return Number.isNaN(date.getTime()) ? undefined : date.getTime()
  }
  const parsed = Date.parse(text.trim())
  return Number.isNaN(parsed) ? undefined : parsed
}

/** 工具参数里的 schedule（模型友好形状）→ 宿主 Schedule；不合法抛人话错误。 */
export function toSchedule(raw: {
  kind?: unknown
  at?: unknown
  time?: unknown
  days?: unknown
  every_minutes?: unknown
}): Schedule {
  const kind = raw.kind
  switch (kind) {
    case 'manual':
      return { kind: 'manual' }
    case 'once': {
      if (typeof raw.at !== 'string') throw new Error('定时一次需要 at（“YYYY-MM-DD HH:mm”，本地时区）')
      const at = parseLocalDateTime(raw.at)
      if (at === undefined) throw new Error(`at 无法解析：${JSON.stringify(raw.at)}，请用 “YYYY-MM-DD HH:mm” 格式`)
      return { kind: 'once', at }
    }
    case 'daily':
    case 'weekdays': {
      if (typeof raw.time !== 'string' || parseTimeToMinutes(raw.time) === undefined) {
        throw new Error('每天/仅工作日需要 time（“HH:mm”）')
      }
      return { kind, time: raw.time.trim() }
    }
    case 'weekly': {
      if (typeof raw.time !== 'string' || parseTimeToMinutes(raw.time) === undefined) {
        throw new Error('每周执行需要 time（“HH:mm”）')
      }
      if (!Array.isArray(raw.days) || raw.days.length === 0 || raw.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new Error('每周执行需要 days（非空数组，0=周日 … 6=周六）')
      }
      return { kind: 'weekly', days: raw.days as number[], time: raw.time.trim() }
    }
    case 'interval': {
      const minutes = raw.every_minutes
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 43200) {
        throw new Error('循环间隔需要 every_minutes（1 到 43200 的整数分钟）')
      }
      return { kind: 'interval', everyMinutes: minutes }
    }
    default:
      throw new Error('schedule.kind 必须是 manual / once / daily / weekly / weekdays / interval 之一')
  }
}

/** 工具参数里的命令（模型友好形状）→ 宿主 CommandSpec。 */
function toCommand(raw: { command?: unknown, args?: unknown } | undefined): CommandSpec | undefined {
  if (raw === undefined) return undefined
  if (typeof raw.command !== 'string' || raw.command.trim() === '') throw new Error('command.command 必须是非空字符串（要运行的程序）')
  return { command: raw.command, args: typeof raw.args === 'string' ? raw.args : '' }
}

/** 执行方式的中文标签（给模型的确认文本用）。 */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'manual': return '不定时（只记录，不自动执行）'
    case 'once': return `定时一次（${new Date(schedule.at).toLocaleString('zh-CN')}）`
    case 'daily': return `每天 ${schedule.time}`
    case 'weekly': return `每周${schedule.days.map(day => '日一二三四五六'[day] ?? String(day)).join('、')} ${schedule.time}`
    case 'weekdays': return `工作日每天 ${schedule.time}`
    case 'interval': return `每隔 ${schedule.everyMinutes} 分钟`
  }
}

function describeExecutor(task: TaskItem): string {
  if (task.executor === 'command') {
    const command = task.command
    return `程序任务（$ ${command === undefined ? '?' : `${command.command} ${command.args}`.trim()}）`
  }
  return 'AI 任务（到点转交数字助理执行）'
}

function formatTime(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '无'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

/** 一条任务的清单行（列表工具用）。 */
function taskLine(task: TaskView): string {
  const next = task.nextRunAt !== undefined ? `｜下次 ${formatTime(task.nextRunAt)}` : ''
  const status = task.lastStatus === undefined ? '' : `｜上次 ${task.lastStatus === 'ok' ? '成功' : task.lastStatus === 'failed' ? '失败' : '运行中'}`
  return `- ${task.title}｜id=${task.id}｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? '启用' : '停用'}${next}${status}`
}

/** 单条任务的详情文本。 */
function taskDetail(task: TaskView, records: readonly RunRecord[]): string {
  const mine = records.filter(record => record.taskId === task.id).slice(0, 5)
  const lines = [
    `任务：${task.title}`,
    `id：${task.id}`,
    `执行方式：${describeSchedule(task.schedule)}`,
    `类型：${describeExecutor(task)}`,
    `状态：${task.enabled ? '启用' : '停用'}${task.lastStatus === undefined ? '' : `｜上次执行 ${task.lastStatus === 'ok' ? '成功' : task.lastStatus === 'failed' ? '失败' : '运行中'}`}`,
    `下次执行：${task.nextRunAt !== undefined ? formatTime(task.nextRunAt) : '不自动执行'}`,
    task.lastError === undefined ? '' : `上次错误：${task.lastError}`,
    '',
    '描述：',
    task.description,
    '',
    mine.length === 0 ? '（还没有执行记录）' : `最近执行记录（最多 5 条）：\n${mine.map(record =>
      `- ${formatTime(record.startedAt)}｜${record.trigger === 'schedule' ? '定时' : record.trigger === 'manual' ? '手动' : '补跑'}｜${record.status === 'ok' ? '成功' : record.status === 'failed' ? '失败' : '运行中'}${record.summary === undefined ? '' : `｜${record.summary}`}`,
    ).join('\n')}`,
  ]
  return lines.filter(line => line !== '').join('\n')
}

/** 最近执行记录摘要（列表工具附带）。 */
function recentRecordsText(snapshot: TodoSnapshot): string {
  const records = snapshot.records.slice(0, 5)
  if (records.length === 0) return ''
  const lines = records.map(record => {
    const task = snapshot.tasks.find(item => item.id === record.taskId)
    return `- ${formatTime(record.startedAt)}｜${task?.title ?? record.taskId}｜${record.status === 'ok' ? '成功' : record.status === 'failed' ? '失败' : '运行中'}`
  })
  return `\n\n最近执行记录（最多 5 条）：\n${lines.join('\n')}`
}

/** schedule 参数的统一 schema 片段（create 与 update 共用）。 */
const SCHEDULE_PARAM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      required: true,
      enum: ['manual', 'once', 'daily', 'weekly', 'weekdays', 'interval'],
      description: '执行方式：manual=不定时（只记录，不自动执行）；once=定时一次；daily=每天；weekly=每周某几天；weekdays=仅工作日每天；interval=每隔 N 分钟。',
    },
    at: { type: 'string', description: '仅 kind=once：执行时刻，格式 “YYYY-MM-DD HH:mm”（本地时区）。' },
    time: { type: 'string', description: '仅 kind=daily/weekly/weekdays：当天执行时刻，格式 “HH:mm”（如 “21:00”）。' },
    days: { type: 'array', items: { type: 'number' }, description: '仅 kind=weekly：星期几的数组，0=周日、1=周一 … 6=周六（至少一个）。' },
    every_minutes: { type: 'number', description: '仅 kind=interval：间隔分钟数（1–43200 的整数）。' },
  },
} as const

const COMMAND_PARAM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    command: { type: 'string', required: true, description: '要运行的程序（如 “node”、“pwsh”）。' },
    args: { type: 'string', description: '参数，用空格分隔（不支持引号包空格；复杂需求写个小脚本再运行它）。' },
  },
} as const

/**
 * 构造全部待办工具定义（宿主在插件加载时注册进全局 `ctx.tools`）。
 * @param gateway - 待办网关（公开 CRUD 方法）。
 * @param ask - 审批回调（delete/run 用，接官方 approval 服务）。
 * @returns defineTool 定义数组。
 */
export function buildTodoTools(gateway: TodoGatewayFace, ask: AskApproval): unknown[] {
  const listTool = defineTool({
    name: 'todo_task_list',
    description: '列出用户的全部待办事项与定时任务：每条含 id、标题、执行方式（不定时/定时一次/每天/每周/工作日/间隔）、类型（AI 任务/程序任务）、启用状态、下次执行时间与上次执行结果，另附最近 5 条执行记录。用户提到“待办”“任务清单”“定时任务”时先用这个看全貌；后续增删改都要用这里返回的 id。',
    parameters: {},
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (): Promise<{ text: string }> => {
      const snapshot = await gateway.listTasks()
      if (snapshot.tasks.length === 0) return { text: '（待办清单是空的）' }
      return { text: `共 ${snapshot.tasks.length} 条任务：\n${snapshot.tasks.map(taskLine).join('\n')}${recentRecordsText(snapshot)}` }
    },
  })

  const getTool = defineTool({
    name: 'todo_task_get',
    description: '按 id 查看一条待办/定时任务的完整详情：描述原文、执行方式、类型、启用状态、下次执行时间与最近执行记录。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（来自 todo_task_list）。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (args: { task_id?: string }): Promise<{ text: string }> => {
      const id = typeof args.task_id === 'string' ? args.task_id.trim() : ''
      if (id === '') return { text: '需要 task_id（来自 todo_task_list）。' }
      const snapshot = await gateway.listTasks()
      const task = snapshot.tasks.find(item => item.id === id)
      if (task === undefined) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` }
      return { text: taskDetail(task, snapshot.records) }
    },
  })

  const createTool = defineTool({
    name: 'todo_task_create',
    description: '新建一条待办事项或定时任务。三种执行方式都支持：不定时（只记录）、定时一次（at 指定日期时间）、循环定时（每天/每周某几天/仅工作日 + time 时刻，或每隔 N 分钟）。任务分两类：executor="assistant"（AI 任务，到点把描述转交数字助理执行，用户让“记个待办/提醒我几点做某事”用这类）与 executor="command"（程序任务，到点在指定工作目录直接运行命令，需同时给 command 与 workspace_id）。描述要写成自足的一段话（将来会原样派出去执行）。',
    parameters: {
      title: { type: 'string', required: true, description: '任务标题（简短一行）。' },
      description: { type: 'string', required: true, description: '任务描述：将来原样派发执行的完整需求，自足、不依赖聊天上下文。' },
      schedule: SCHEDULE_PARAM,
      executor: { type: 'string', enum: ['assistant', 'command'], description: '任务类型：assistant=AI 任务（默认，转交数字助理）；command=程序任务（到点运行命令）。' },
      command: COMMAND_PARAM,
      workspace_id: { type: 'string', description: '仅程序任务：工作目录的工作区 id（先用 todo_workspace_list 查）。' },
      enabled: { type: 'boolean', description: '是否启用，默认 true。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (args: {
      title?: string
      description?: string
      schedule?: { kind?: unknown, at?: unknown, time?: unknown, days?: unknown, every_minutes?: unknown }
      executor?: string
      command?: { command?: unknown, args?: unknown }
      workspace_id?: string
      enabled?: boolean
    }): Promise<{ text: string }> => {
      try {
        const schedule = toSchedule(args.schedule ?? {})
        const executor = args.executor === 'command' ? 'command' : 'assistant'
        const task = (await gateway.createTask({
          title: typeof args.title === 'string' ? args.title : '',
          description: typeof args.description === 'string' ? args.description : '',
          executor,
          schedule,
          target: { workspaceId: executor === 'command' ? (typeof args.workspace_id === 'string' ? args.workspace_id : '') : '' },
          ...(executor === 'command' ? { command: toCommand(args.command) } : {}),
          ...(args.enabled !== undefined ? { enabled: args.enabled === true } : {}),
        })).task
        return {
          text: `已新建任务「${task.title}」（id=${task.id}）｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? '启用' : '停用'}。`
            + '页面「待办事项与定时任务」里立即可见；后续用这个 id 修改/删除/立即执行。',
        }
      } catch (error: unknown) {
        return { text: `新建失败：${String(error)}` }
      }
    },
  })

  const updateTool = defineTool({
    name: 'todo_task_update',
    description: '修改一条待办/定时任务：只传要改的字段（未传的保持不变）。可改标题、描述、执行方式（schedule 结构与新建相同）、任务类型（executor/command/workspace_id 需配套）、启用状态。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（来自 todo_task_list）。' },
      title: { type: 'string' },
      description: { type: 'string', description: '新的任务描述（整体替换）。' },
      schedule: SCHEDULE_PARAM,
      executor: { type: 'string', enum: ['assistant', 'command'] },
      command: COMMAND_PARAM,
      workspace_id: { type: 'string', description: '仅程序任务：工作目录的工作区 id。' },
      enabled: { type: 'boolean', description: '启用/停用。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (args: {
      task_id?: string
      title?: string
      description?: string
      schedule?: { kind?: unknown, at?: unknown, time?: unknown, days?: unknown, every_minutes?: unknown }
      executor?: string
      command?: { command?: unknown, args?: unknown }
      workspace_id?: string
      enabled?: boolean
    }): Promise<{ text: string }> => {
      const id = typeof args.task_id === 'string' ? args.task_id.trim() : ''
      if (id === '') return { text: '需要 task_id（来自 todo_task_list）。' }
      const snapshot = await gateway.listTasks()
      const current = snapshot.tasks.find(item => item.id === id)
      if (current === undefined) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` }
      try {
        const patch: UpdateTaskRequest['patch'] = {}
        if (args.title !== undefined) patch.title = args.title
        if (args.description !== undefined) patch.description = args.description
        if (args.schedule !== undefined) patch.schedule = toSchedule(args.schedule)
        if (args.enabled !== undefined) patch.enabled = args.enabled === true
        if (args.executor !== undefined || args.command !== undefined || args.workspace_id !== undefined) {
          patch.executor = args.executor === 'command' ? 'command' : (args.executor === 'assistant' ? 'assistant' : current.executor)
          patch.target = { workspaceId: args.workspace_id !== undefined ? args.workspace_id : current.target.workspaceId }
          patch.command = args.command !== undefined ? toCommand(args.command) : current.command
        }
        const task = (await gateway.updateTask({ id, patch })).task
        return { text: `已更新任务「${task.title}」（id=${task.id}）｜${describeSchedule(task.schedule)}｜${describeExecutor(task)}｜${task.enabled ? '启用' : '停用'}。` }
      } catch (error: unknown) {
        return { text: `更新失败：${String(error)}` }
      }
    },
  })

  const deleteTool = defineTool({
    name: 'todo_task_delete',
    description: '按 id 删除一条待办/定时任务（不可恢复；历史执行记录保留）。删除前会请求用户审批。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（来自 todo_task_list）。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (args: { task_id?: string }, exec: ToolExecLike): Promise<{ text: string }> => {
      const id = typeof args.task_id === 'string' ? args.task_id.trim() : ''
      if (id === '') return { text: '需要 task_id（来自 todo_task_list）。' }
      const snapshot = await gateway.listTasks()
      const task = snapshot.tasks.find(item => item.id === id)
      if (task === undefined) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` }
      const allowed = await ask(exec, `删除待办任务「${task.title}」（${describeSchedule(task.schedule)}）。删除后不可恢复。`)
      if (!allowed) return { text: `用户没有批准删除「${task.title}」。任务保持原样。` }
      try {
        await gateway.deleteTask({ id })
        return { text: `已删除任务「${task.title}」（id=${id}）。` }
      } catch (error: unknown) {
        return { text: `删除失败：${String(error)}` }
      }
    },
  })

  const runTool = defineTool({
    name: 'todo_task_run',
    description: '立即执行一条待办/定时任务（不等它的定时点）：AI 任务立刻转交数字助理，程序任务立刻运行命令。执行前会请求用户审批。想验证任务配置或用户说“现在就跑”时用。',
    parameters: {
      task_id: { type: 'string', required: true, description: '任务 id（来自 todo_task_list）。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (args: { task_id?: string }, exec: ToolExecLike): Promise<{ text: string }> => {
      const id = typeof args.task_id === 'string' ? args.task_id.trim() : ''
      if (id === '') return { text: '需要 task_id（来自 todo_task_list）。' }
      const snapshot = await gateway.listTasks()
      const task = snapshot.tasks.find(item => item.id === id)
      if (task === undefined) return { text: `找不到任务 ${JSON.stringify(id)}；用 todo_task_list 看现有 id。` }
      const allowed = await ask(exec, `立即执行待办任务「${task.title}」（${describeSchedule(task.schedule)}，${describeExecutor(task)}）。`)
      if (!allowed) return { text: `用户没有批准立即执行「${task.title}」。任务保持原样。` }
      try {
        const result = await gateway.runNow({ id })
        if (result.ok) {
          return {
            text: `已执行任务「${task.title}」（id=${id}）：${task.executor === 'command' ? '命令已运行，结果见执行记录（todo_task_get 可查）' : `已转交数字助理（会话 ${result.sessionId ?? '未知'}）` }。`,
          }
        }
        return { text: `执行失败：${result.error ?? '未知错误'}` }
      } catch (error: unknown) {
        return { text: `执行失败：${String(error)}` }
      }
    },
  })

  const workspaceTool = defineTool({
    name: 'todo_workspace_list',
    description: '列出可选的工作区（id、名称、路径）。新建/修改**程序任务**时要选工作目录（workspace_id），先来这里查。',
    parameters: {},
    output: { schema: TEXT_OUTPUT, render: (_args: unknown, value: { text: string }) => textBlock(value.text) },
    execute: async (): Promise<{ text: string }> => {
      const { items } = await gateway.listWorkspaces()
      if (items.length === 0) return { text: '（还没有登记过工作区；程序任务需要先在界面上建立工作区。）' }
      return { text: items.map(item => `- ${item.title}｜id=${item.id}｜路径=${item.path}`).join('\n') }
    },
  })

  return [listTool, getTool, createTool, updateTool, deleteTool, runTool, workspaceTool]
}

/** 全部待办工具名（数字助理插件把它们加进自己的 allow 白名单用）。 */
export const TODO_TOOL_NAMES = Object.freeze([
  'todo_task_list',
  'todo_task_get',
  'todo_task_create',
  'todo_task_update',
  'todo_task_delete',
  'todo_task_run',
  'todo_workspace_list',
])
