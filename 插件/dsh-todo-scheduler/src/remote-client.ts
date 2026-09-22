/**
 * 手写的 Typert Remote 客户端贡献（与官方 typert.remote-client.js 生成工件同构）。
 * 由客户端半边经 ctx.remote.$mount() 挂载，得到 ctx.remote.jxTodo。
 * 注：官方 0.1.6+ 起 codec 必须给 `create: () => <zod>`（旧的 `schema:` 会被拒绝）。
 */
import { z } from 'zod'

// ---------------------------------------------------------------- 共享 schema

const scheduleSchema = z.union([
  z.object({ kind: z.literal('manual') }),
  z.object({ kind: z.literal('once'), at: z.number() }),
  z.object({ kind: z.literal('daily'), time: z.string() }),
  z.object({ kind: z.literal('weekly'), days: z.array(z.number()), time: z.string() }),
  z.object({ kind: z.literal('weekdays'), time: z.string() }),
  z.object({ kind: z.literal('interval'), everyMinutes: z.number() }),
])

const targetSchema = z.object({
  workspaceId: z.string(),
  preset: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
})

const commandSchema = z.object({
  command: z.string(),
  args: z.string(),
})

const executorSchema = z.union([z.literal('assistant'), z.literal('command')])

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  executor: executorSchema,
  schedule: scheduleSchema,
  target: targetSchema,
  command: commandSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastRunAt: z.number().optional(),
  lastStatus: z.union([z.literal('running'), z.literal('ok'), z.literal('failed')]).optional(),
  lastError: z.string().optional(),
  lastSessionId: z.string().optional(),
})

const taskViewSchema = taskSchema.extend({ nextRunAt: z.number().optional() })

const recordSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  trigger: z.union([z.literal('schedule'), z.literal('manual'), z.literal('catch-up')]),
  startedAt: z.number(),
  status: z.union([z.literal('running'), z.literal('ok'), z.literal('failed')]),
  sessionId: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
})

const missedSchema = z.object({ taskId: z.string(), slotTime: z.number() })

// ---------------------------------------------------------------- 请求 schema

const createTaskRequestSchema = z.object({
  title: z.string(),
  description: z.string(),
  executor: executorSchema.optional(),
  schedule: scheduleSchema,
  target: targetSchema,
  command: commandSchema.optional(),
  enabled: z.boolean().optional(),
})

const updateTaskRequestSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    executor: executorSchema.optional(),
    schedule: scheduleSchema.optional(),
    target: targetSchema.optional(),
    command: commandSchema.optional(),
  }),
})

const idRequestSchema = z.object({ id: z.string() })

const resolveMissedRequestSchema = z.object({ id: z.string(), action: z.union([z.literal('run'), z.literal('dismiss')]) })

// ---------------------------------------------------------------- 结果 schema

const statusResultSchema = z.object({
  taskCount: z.number(),
  enabledCount: z.number(),
  missedCount: z.number(),
  dataFile: z.string(),
})

const listTasksResultSchema = z.object({
  tasks: z.array(taskViewSchema),
  records: z.array(recordSchema),
  missed: z.array(missedSchema),
  dataFile: z.string(),
})

const taskResultSchema = z.object({ task: taskViewSchema })

const deleteResultSchema = z.object({ ok: z.literal(true) })

const runNowResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
})

const workspacesResultSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string(), path: z.string() })),
})

// ---------------------------------------------------------------- descriptors

/** 一个 strict codec 的便捷构造。 */
function codec(typeSymbol: string, create: () => z.ZodType): { mode: 'strict', typeSymbol: string, create: () => z.ZodType } {
  return { mode: 'strict', typeSymbol, create }
}

/** 一个 json 参数的便捷构造。 */
function param(name: string, schema: z.ZodType, symbol: string) {
  return {
    name,
    wire: name,
    source: 'json' as const,
    codec: codec(symbol, () => schema),
  }
}

const NS = 'jxTodo'
const PKG = 'dsh-todo-scheduler'

function descriptor(method: string, options: {
  params?: ReturnType<typeof param>[]
  result: z.ZodType
  resultSymbol: string
}) {
  return {
    id: `${PKG}#${NS}/${method}`,
    service: NS,
    namespace: NS,
    method,
    invocation: { kind: 'direct' } as const,
    parameters: options.params ?? [],
    result: codec(options.resultSymbol, () => options.result),
    sourceLocation: { file: 'src/index.ts', line: 1, column: 3 },
  }
}

export const TYPERT_REMOTE = {
  package: PKG,
  descriptors: [
    descriptor('status', { result: statusResultSchema, resultSymbol: `${PKG}/types#TodoStatus` }),
    descriptor('listTasks', { result: listTasksResultSchema, resultSymbol: `${PKG}/types#TodoSnapshot` }),
    descriptor('createTask', {
      params: [param('request', createTaskRequestSchema, `${PKG}/types#CreateTaskRequest`)],
      result: taskResultSchema,
      resultSymbol: `${PKG}/types#CreateTaskResult`,
    }),
    descriptor('updateTask', {
      params: [param('request', updateTaskRequestSchema, `${PKG}/types#UpdateTaskRequest`)],
      result: taskResultSchema,
      resultSymbol: `${PKG}/types#UpdateTaskResult`,
    }),
    descriptor('deleteTask', {
      params: [param('request', idRequestSchema, `${PKG}/types#TaskRefRequest`)],
      result: deleteResultSchema,
      resultSymbol: `${PKG}/types#DeleteTaskResult`,
    }),
    descriptor('runNow', {
      params: [param('request', idRequestSchema, `${PKG}/types#TaskRefRequest`)],
      result: runNowResultSchema,
      resultSymbol: `${PKG}/types#RunNowResult`,
    }),
    descriptor('resolveMissed', {
      params: [param('request', resolveMissedRequestSchema, `${PKG}/types#ResolveMissedRequest`)],
      result: deleteResultSchema,
      resultSymbol: `${PKG}/types#ResolveMissedResult`,
    }),
    descriptor('listWorkspaces', { result: workspacesResultSchema, resultSymbol: `${PKG}/types#WorkspacesResult` }),
  ],
}

export default TYPERT_REMOTE
