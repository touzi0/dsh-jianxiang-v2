/**
 * 模型工具自测：toSchedule 参数转换、7 个工具的增删改查行为、审批分支
 * （允许/拒绝/fail-closed）、以及 tasks.json 的「写盘前并入磁盘外部新增」保护。
 * 跑法：`node selftest-tools.mts`（先 `node build.mjs` 构建 lib/index.js）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }
const is = (label: string, actual: unknown, expected: unknown): void =>
  record(`${label}（实际 ${JSON.stringify(actual)}）`, JSON.stringify(actual) === JSON.stringify(expected))

const lib = await import('./lib/index.js')
const { buildTodoTools, toSchedule } = lib as {
  buildTodoTools: (gateway: unknown, ask: (exec: unknown, reason: string) => Promise<boolean>) => Array<{
    name: string
    parameters: Record<string, unknown>
    execute: (args: unknown, exec?: unknown) => Promise<{ text: string }>
  }>
  toSchedule: (raw: Record<string, unknown>) => { kind: string, at?: number, time?: string, days?: number[], everyMinutes?: number }
}

// -------------------------------------------------------------- toSchedule 转换

is('manual', toSchedule({ kind: 'manual' }).kind, 'manual')
is('once 解析本地日期时间', toSchedule({ kind: 'once', at: '2026-09-23 21:00' }),
  { kind: 'once', at: new Date(2026, 8, 23, 21, 0).getTime() })
is('weekdays', toSchedule({ kind: 'weekdays', time: '21:00' }), { kind: 'weekdays', time: '21:00' })
is('weekly days+time', toSchedule({ kind: 'weekly', days: [1, 3, 5], time: '09:30' }),
  { kind: 'weekly', days: [1, 3, 5], time: '09:30' })
is('interval', toSchedule({ kind: 'interval', every_minutes: 30 }), { kind: 'interval', everyMinutes: 30 })
let threw = ''
try { toSchedule({ kind: 'once' }) } catch (error) { threw = String(error) }
record('once 缺 at 报人话错误', threw.includes('at'))
threw = ''
try { toSchedule({ kind: 'weekly', time: '09:00', days: [] }) } catch (error) { threw = String(error) }
record('weekly 空 days 拒绝', threw.includes('days'))
threw = ''
try { toSchedule({ kind: 'daily', time: '25:00' }) } catch (error) { threw = String(error) }
record('非法 HH:mm 拒绝', threw.includes('time'))

// -------------------------------------------------------------- 工具行为（假网关 + 假审批）

const external = { workspaceItems: [{ id: 'ws-1', title: '演示', path: 'C:\\demo' }] }
let nextId = 0
const fakeTasks: Array<Record<string, unknown> & { id: string }> = []
const fakeGateway = {
  async listTasks() {
    return {
      tasks: fakeTasks,
      records: [{ id: 'run-1', taskId: 't1', trigger: 'manual', startedAt: 0, status: 'ok', summary: 'ok' }],
      missed: [],
      dataFile: 'x',
    }
  },
  async createTask(request: Record<string, unknown>) {
    const task = {
      id: `t${++nextId}`,
      title: request.title,
      description: request.description,
      enabled: request.enabled !== false,
      executor: request.executor,
      schedule: request.schedule,
      target: request.target,
      ...(request.command === undefined ? {} : { command: request.command }),
      createdAt: 1,
      updatedAt: 1,
    }
    fakeTasks.push(task)
    return { task }
  },
  async updateTask(request: { id: string, patch: Record<string, unknown> }) {
    const index = fakeTasks.findIndex(item => item.id === request.id)
    fakeTasks[index] = { ...fakeTasks[index], ...request.patch }
    return { task: fakeTasks[index] }
  },
  async deleteTask(request: { id: string }) {
    const index = fakeTasks.findIndex(item => item.id === request.id)
    fakeTasks.splice(index, 1)
    return { ok: true }
  },
  async runNow(request: { id: string }) {
    if (request.id === 't3') return { ok: false, error: '炸了' }
    return { ok: true, sessionId: 'session-jx-assistant' }
  },
  async listWorkspaces() { return { items: external.workspaceItems } },
}

let askOutcome: 'allow' | 'deny' = 'allow'
const askCalls: string[] = []
const ask = async (_exec: unknown, reason: string): Promise<boolean> => {
  askCalls.push(reason)
  return askOutcome === 'allow'
}

const tools = buildTodoTools(fakeGateway, ask)
const byName = new Map(tools.map(tool => [tool.name, tool]))
is('工具数量', tools.length, 7)
is('工具名清单', tools.map(tool => tool.name).sort(), [
  'todo_task_create', 'todo_task_delete', 'todo_task_get', 'todo_task_list',
  'todo_task_run', 'todo_task_update', 'todo_workspace_list',
])

// 列表
const listed = await byName.get('todo_task_list')!.execute({}, {})
record('空清单提示', listed.text.includes('空的'))

// 新建（三种执行方式 + 两类任务）
const created1 = await byName.get('todo_task_create')!.execute({
  title: '测试待办', description: '描述原文', schedule: { kind: 'manual' },
}, {})
record('新建不定时成功并返回 id', created1.text.includes('已新建任务「测试待办」') && created1.text.includes('id=t1'))

const created2 = await byName.get('todo_task_create')!.execute({
  title: '工作日晚九点', description: '提醒', schedule: { kind: 'weekdays', time: '21:00' },
}, {})
record('新建工作日循环成功', created2.text.includes('工作日每天 21:00'))

const created3 = await byName.get('todo_task_create')!.execute({
  title: '跑脚本', description: '每晚备份', executor: 'command',
  schedule: { kind: 'daily', time: '23:00' }, command: { command: 'node', args: 'backup.js' }, workspace_id: 'ws-1',
}, {})
record('新建程序任务成功', created3.text.includes('程序任务'))

const badCreate = await byName.get('todo_task_create')!.execute({
  title: 'x', description: 'x', schedule: { kind: 'once', at: '不是时间' },
}, {})
record('坏 at 返回人话错误', badCreate.text.includes('失败') && badCreate.text.includes('YYYY-MM-DD'))

// 查看
const got = await byName.get('todo_task_get')!.execute({ task_id: 't1' }, {})
record('详情含描述原文', got.text.includes('描述原文'))
record('详情含执行记录', got.text.includes('成功'))
const gotMissing = await byName.get('todo_task_get')!.execute({ task_id: 'nope' }, {})
record('未知 id 人话提示', gotMissing.text.includes('找不到'))

// 修改
const updated = await byName.get('todo_task_update')!.execute({ task_id: 't1', enabled: false, title: '改名了' }, {})
record('更新成功返回新状态', updated.text.includes('停用') && updated.text.includes('改名了'))

// 审批分支：delete / run
askOutcome = 'deny'
askCalls.length = 0
const deniedDelete = await byName.get('todo_task_delete')!.execute({ task_id: 't1' }, { name: 'todo_task_delete', agent: {} })
record('拒绝审批时删除不生效', deniedDelete.text.includes('没有批准') && fakeTasks.some(task => task.id === 't1'))
record('删除走了审批', askCalls.length === 1)

askOutcome = 'allow'
const allowedDelete = await byName.get('todo_task_delete')!.execute({ task_id: 't1' }, { name: 'todo_task_delete', agent: {} })
record('批准后删除生效', allowedDelete.text.includes('已删除') && !fakeTasks.some(task => task.id === 't1'))

askOutcome = 'deny'
const deniedRun = await byName.get('todo_task_run')!.execute({ task_id: 't2' }, { name: 'todo_task_run', agent: {} })
record('拒绝审批时不执行', deniedRun.text.includes('没有批准'))
askOutcome = 'allow'
const okRun = await byName.get('todo_task_run')!.execute({ task_id: 't2' }, { name: 'todo_task_run', agent: {} })
record('批准后执行并给确认', okRun.text.includes('已转交数字助理'))
const failRun = await byName.get('todo_task_run')!.execute({ task_id: 't3' }, { name: 'todo_task_run', agent: {} })
record('执行失败回传错误', failRun.text.includes('炸了'))

// 工作区列表
const workspaces = await byName.get('todo_workspace_list')!.execute({}, {})
record('工作区列表', workspaces.text.includes('ws-1'))

// ---------------------------------------------- 写盘合并保护（真实网关 + 临时数据文件）

const { JxTodoGateway } = lib as { JxTodoGateway: new (ctx: never, dataFile: string) => unknown }
function makeCtx(): unknown {
  return {
    reflect: { provide: () => undefined },
    logger: { warn: () => undefined },
    agents: { get: () => undefined, create: async () => { throw new Error('本用例不建会话') } },
    workspaceRegistry: { list: () => [], get: () => undefined },
    get: () => undefined,
    effect: (factory: () => unknown) => (factory() as (() => void) | undefined),
    on: () => () => undefined,
  }
}

const dir = mkdtempSync(join(tmpdir(), 'jx-todo-tools-selftest-'))
const dataFile = join(dir, 'tasks.json')
const gateway = new JxTodoGateway(makeCtx() as never, dataFile)
const gatewayFace = gateway as unknown as {
  createTask(request: Record<string, unknown>): Promise<{ task: { id: string } }>
  deleteTask(request: { id: string }): Promise<{ ok: true }>
  listTasks(): Promise<{ tasks: Array<{ id: string, title: string }> }>
}

// 外部手工往磁盘加一条任务（模拟「宿主内存旧数据」场景），再让网关落盘一次。
const diskBefore = JSON.parse(readFileSync(dataFile, 'utf8')) as { tasks: Array<{ id: string }> }
const externalTask = {
  id: 'task-external-manual',
  title: '手工加的任务',
  description: '外部写入',
  enabled: true,
  executor: 'assistant',
  schedule: { kind: 'manual' },
  target: { workspaceId: '' },
  createdAt: 1,
  updatedAt: 1,
}
writeFileSync(dataFile, JSON.stringify({ ...diskBefore, tasks: [...diskBefore.tasks, externalTask] }, null, 2), 'utf8')
await gatewayFace.createTask({ title: '网关新建', description: 'x', executor: 'assistant', schedule: { kind: 'manual' }, target: { workspaceId: '' } })
const diskAfter = JSON.parse(readFileSync(dataFile, 'utf8')) as { tasks: Array<{ id: string }> }
record('外部手工加的任务在网关落盘后仍在磁盘', diskAfter.tasks.some(task => task.id === 'task-external-manual'))
record('外部任务并入内存清单', (await gatewayFace.listTasks()).tasks.some(task => task.id === 'task-external-manual'))

// 删除不被合并步骤复活（墓碑）。
const doomed = await gatewayFace.createTask({ title: '要删的', description: 'x', executor: 'assistant', schedule: { kind: 'manual' }, target: { workspaceId: '' } })
await gatewayFace.deleteTask({ id: doomed.task.id })
await gatewayFace.createTask({ title: '再落一次盘', description: 'x', executor: 'assistant', schedule: { kind: 'manual' }, target: { workspaceId: '' } })
const diskFinal = JSON.parse(readFileSync(dataFile, 'utf8')) as { tasks: Array<{ id: string }> }
record('删除后的任务不被合并复活', !diskFinal.tasks.some(task => task.id === doomed.task.id))
record('数据文件仍存在', existsSync(dataFile))

rmSync(dir, { recursive: true, force: true })

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) process.exit(1)
