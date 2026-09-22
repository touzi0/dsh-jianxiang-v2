/**
 * 宿主网关自测：假 ctx 实例化网关，走完持久化、CRUD 校验、两类执行全链路
 * （AI 任务转交数字助理；程序任务经 subprocess 跑命令）、错过补跑/忽略、
 * 以及 tick 的防重复触发。数据写到临时目录，不碰真实 dsh-home。
 * 跑法：`node selftest-gateway.mts`（先 `node build.mjs` 构建 lib/index.js）。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }
const is = (label: string, actual: unknown, expected: unknown): void =>
  record(`${label}（实际 ${JSON.stringify(actual)}）`, JSON.stringify(actual) === JSON.stringify(expected))

// ------------------------------------------------------------------ 假宿主服务

interface FakeAgent {
  id: string
  session: { id: string, header: { id: string, cwd?: string } }
  followups: unknown[]
  followup: (message: unknown) => void
}

const workspace = {
  id: 'ws-1',
  path: 'C:\\jx\\ws-demo',
  title: '演示工作区',
  sessionIds: [] as string[],
  attachSession: async (sessionId: string) => { workspace.sessionIds.push(sessionId) },
}

const created: Array<{ options: Record<string, unknown>, agent: FakeAgent }> = []

function makeAgent(options: Record<string, unknown>): FakeAgent {
  const sessionId = String(options.sessionId)
  const agent: FakeAgent = {
    id: sessionId,
    session: { id: sessionId, header: { id: sessionId, cwd: (options.meta as { cwd?: string })?.cwd } },
    followups: [],
    followup(message: unknown) { agent.followups.push(message) },
  }
  return agent
}

const ASSISTANT_ID = 'session-jx-assistant'
let ensureCalls = 0
const assistantGateway = {
  ensure: async () => { ensureCalls += 1; return { sessionId: ASSISTANT_ID } },
}

/** 常驻的数字助理 agent（ensure() 之后网关从 agents.get 拿它投递）。 */
const assistantAgent: FakeAgent = {
  id: ASSISTANT_ID,
  session: { id: ASSISTANT_ID, header: { id: ASSISTANT_ID, cwd: 'C:\\jx\\assistant' } },
  followups: [],
  followup(message: unknown) { assistantAgent.followups.push(message) },
}

/** 程序任务用的假 subprocess：记录 spawn 规格，按预设退出码/输出回放。 */
const spawnSpecs: Array<{ argv: readonly string[], cwd: string }> = []
let commandExit: { exitCode: number | null, stdout: string, stderr: string } = { exitCode: 0, stdout: 'done', stderr: '' }
const subprocess = {
  spawn(spec: { argv: readonly string[], cwd: string }) {
    spawnSpecs.push({ argv: spec.argv, cwd: spec.cwd })
    return {
      collected: {
        stdout: { readFrom: () => ({ text: commandExit.stdout, lossy: false }) },
        stderr: { readFrom: () => ({ text: commandExit.stderr, lossy: false }) },
      },
      waitForExit: async () => ({ exitCode: commandExit.exitCode, signal: null }),
    }
  },
}

const agents = {
  get: (id: string) => (id === ASSISTANT_ID ? assistantAgent : created.find(item => item.agent.id === id)?.agent),
  create: async (options: Record<string, unknown>) => {
    const agent = makeAgent(options)
    created.push({ options, agent })
    await (options.setup as ((agentCtx: unknown) => Promise<void>) | undefined)?.({ mockSetup: true })
    return { agent }
  },
  resume: async (): Promise<never> => { throw new Error('本插件不应 resume 已有会话') },
}

const registry = { list: () => [workspace], get: (id: string) => (id === workspace.id ? workspace : undefined) }

function makeCtx() {
  return {
    // cordis Service 基类构造需要的最小内部面。
    reflect: { provide: () => undefined },
    logger: { warn: (message: string) => { console.warn(`[mock] ${String(message).slice(0, 80)}`) } },
    agents,
    workspaceRegistry: registry,
    get(name: string): unknown {
      if (name === 'jxAssistant') return assistantGateway
      if (name === 'subprocess') return subprocess
      return undefined
    },
    effect: (factory: () => unknown, _label: string) => {
      const dispose = factory() as (() => void) | undefined
      return dispose
    },
    on: (_event: string, _handler: unknown) => () => undefined,
  }
}

// ---------------------------------------------------------------------- 用例

const { JxTodoGateway, TODO_DATA_FILE } = await import('./lib/index.js')

const dir = mkdtempSync(join(tmpdir(), 'jx-todo-selftest-'))
const dataFile = join(dir, 'tasks.json')

const ctx = makeCtx()
const gateway = new JxTodoGateway(ctx as never, dataFile)

record('TODO_DATA_FILE 指向 dsh-home\\jx-todo\\tasks.json', TODO_DATA_FILE.includes('jx-todo') && TODO_DATA_FILE.endsWith('tasks.json'))
record('构造时创建了数据文件', existsSync(dataFile))

// 1) 种子任务（两条不定时：手机端访问 + 数字助理未读提示）。
const first = await gateway.listTasks()
const seed = first.tasks.find(task => task.id === 'task-jx-mobile-access')
is('首启种子任务标题', seed?.title, '手机端访问：解锁局域网 + 扫码入口')
is('种子任务是不定时', seed?.schedule.kind, 'manual')
is('种子任务是 AI 任务', seed?.executor, 'assistant')
is('种子任务已启用', seed?.enabled, true)
record('种子任务描述包含实施方案引用', seed?.description.includes('手机端访问实施方案.md') === true)
is('种子任务未指定工作区', seed?.target.workspaceId, '')
const unread = first.tasks.find(task => task.id === 'task-assistant-unread')
is('第二条种子任务标题', unread?.title, '数字助理主对话：有新回复但前端没有提示')
is('第二条种子也是不定时', unread?.schedule.kind, 'manual')
record('第二条种子描述含未读机制线索', unread?.description.includes('dsh-unread') === true)
is('首启恰好两条种子', first.tasks.length, 2)
is('状态里的数据文件路径', (await gateway.status()).dataFile, dataFile)

// 2) AI 任务执行 = 转交数字助理（无工作区/模型设置、不新建会话）。
const handed = await gateway.runNow({ id: 'task-jx-mobile-access' })
is('AI 任务转交成功', handed.ok, true)
is('ensure() 被调一次', ensureCalls, 1)
is('没有为待办任务新建会话', created.length, 0)
const handedMessage = assistantAgent.followups[0] as { content: Array<{ type: string, text: string }>, source: { kind: string } }
is('转交消息按用户消息显示', handedMessage.source.kind, 'user')
record('转交消息含任务标题', handedMessage.content[0]!.text.includes('手机端访问'))
record('转交消息含描述原文', handedMessage.content[0]!.text.includes('局域网'))
record('转交消息标注手动执行', handedMessage.content[0]!.text.includes('手动执行'))
const handedRecord = (await gateway.listTasks()).records.find(item => item.sessionId === ASSISTANT_ID)
is('转交记录立即完成', handedRecord?.status, 'ok')
record('记录说明已转交', handedRecord?.summary.includes('已转交数字助理') === true)

// 3) 程序任务：CRUD 校验 + 执行。
let threw = ''
try {
  await gateway.createTask({ title: 'x', description: 'x', executor: 'command', schedule: { kind: 'manual' }, target: { workspaceId: 'ws-1' } })
} catch (error) { threw = String(error) }
record('程序任务没有命令被拒绝', threw.includes('命令'))

threw = ''
try {
  await gateway.createTask({ title: 'x', description: 'x', executor: 'command', schedule: { kind: 'manual' }, target: { workspaceId: '' }, command: { command: 'node', args: '' } })
} catch (error) { threw = String(error) }
record('程序任务没有工作目录被拒绝', threw.includes('工作目录'))

const commandTask = (await gateway.createTask({
  title: '每晚备份',
  description: '跑一次备份脚本',
  executor: 'command',
  schedule: { kind: 'daily', time: '23:00' },
  target: { workspaceId: 'ws-1' },
  command: { command: 'node', args: 'backup.js  --quiet' },
})).task
is('程序任务的命令被保留', commandTask.command, { command: 'node', args: 'backup.js  --quiet' })

commandExit = { exitCode: 0, stdout: '备份完成 12 个文件', stderr: '' }
const commandRun = await gateway.runNow({ id: commandTask.id })
is('程序任务执行成功', commandRun.ok, true)
is('命令按空白切分成 argv', spawnSpecs[0]!.argv, ['node', 'backup.js', '--quiet'])
is('命令在工作目录里跑', spawnSpecs[0]!.cwd, workspace.path)
const commandRecord = (await gateway.listTasks()).records.find(item => item.taskId === commandTask.id && item.status === 'ok')
is('命令记录完成', commandRecord?.status, 'ok')
record('记录含退出码', commandRecord?.summary.includes('退出码 0') === true)
record('记录含输出节选', commandRecord?.summary.includes('备份完成 12 个文件') === true)

commandExit = { exitCode: 2, stdout: '', stderr: 'ENOENT: no such file' }
const failingRun = await gateway.runNow({ id: commandTask.id })
is('非零退出码返回成功但记录失败', failingRun.ok, true)
const failedRecord = (await gateway.listTasks()).records.find(item => item.taskId === commandTask.id && item.status === 'failed')
is('失败记录在案', failedRecord?.status, 'failed')
record('失败原因含 stderr', failedRecord?.error?.includes('ENOENT') === true)
is('任务状态转失败', (await gateway.listTasks()).tasks.find(item => item.id === commandTask.id)?.lastStatus, 'failed')

// 4) updateTask 切换任务类型：AI → 程序（缺命令要拒绝）。
threw = ''
try { await gateway.updateTask({ id: 'task-jx-mobile-access', patch: { executor: 'command', target: { workspaceId: 'ws-1' } } }) } catch (error) { threw = String(error) }
record('AI 任务改成程序任务但没命令时拒绝', threw.includes('命令'))
const switched = (await gateway.updateTask({
  id: 'task-jx-mobile-access',
  patch: { executor: 'command', target: { workspaceId: 'ws-1' }, command: { command: 'git', args: 'status' } },
})).task
is('切换后的类型', switched.executor, 'command')
is('切换后命令在场', switched.command?.command, 'git')

// 5) CRUD 通用规则。
const manual = (await gateway.createTask({
  title: '记一条不定时',
  description: '先记着，不自动执行',
  executor: 'assistant',
  schedule: { kind: 'manual' },
  target: { workspaceId: '' },
})).task
is('不定时 AI 任务允许不选工作区', manual.enabled, true)

threw = ''
try { await gateway.createTask({ title: 'x', description: 'x', executor: 'assistant', schedule: { kind: 'interval', everyMinutes: 0 }, target: { workspaceId: '' } }) } catch (error) { threw = String(error) }
record('间隔 0 分钟被拒绝', threw.includes('间隔'))

const updated = (await gateway.updateTask({ id: manual.id, patch: { title: '改了名' } })).task
is('updateTask 改标题', updated.title, '改了名')
await gateway.deleteTask({ id: manual.id })
is('deleteTask 生效', (await gateway.listTasks()).tasks.some(task => task.id === manual.id), false)

// 6) tick：到点转交一次、不重复。
const onceTick = (await gateway.createTask({
  title: 'tick 用例',
  description: '马上到点',
  executor: 'assistant',
  schedule: { kind: 'once', at: Date.now() + 80 },
  target: { workspaceId: '' },
})).task
await new Promise(resolve => setTimeout(resolve, 150))
const tick = (gateway as unknown as { tick: () => void }).tick.bind(gateway)
const followupsBeforeTick = assistantAgent.followups.length
tick()
await new Promise(resolve => setImmediate(resolve))
is('到点的 once 被 tick 转交', assistantAgent.followups.length, followupsBeforeTick + 1)
tick()
await new Promise(resolve => setImmediate(resolve))
is('同一槽点不重复触发', assistantAgent.followups.length, followupsBeforeTick + 1)
is('tick 后 lastRunAt 推进到槽点', (await gateway.listTasks()).tasks.find(item => item.id === onceTick.id)?.lastRunAt, onceTick.schedule.at)

// 7) 错过检测 + 补跑 / 忽略。
const pastOnce = (await gateway.createTask({
  title: '错过的',
  description: '服务没开着时过的点',
  executor: 'assistant',
  schedule: { kind: 'once', at: Date.now() - 3_600_000 },
  target: { workspaceId: '' },
})).task
const withMissed = await gateway.listTasks()
is('错过列表包含它', withMissed.missed.some(item => item.taskId === pastOnce.id), true)
await gateway.resolveMissed({ id: pastOnce.id, action: 'run' })
const afterCatchUp = await gateway.listTasks()
is('补跑后不再提示错过', afterCatchUp.missed.some(item => item.taskId === pastOnce.id), false)
const catchUpRecord = afterCatchUp.records.find(item => item.taskId === pastOnce.id)
is('补跑记录的触发方式', catchUpRecord?.trigger, 'catch-up')

const dismissTarget = (await gateway.createTask({
  title: '忽略用例',
  description: 'x',
  executor: 'assistant',
  schedule: { kind: 'once', at: Date.now() - 60_000 },
  target: { workspaceId: '' },
})).task
await gateway.resolveMissed({ id: dismissTarget.id, action: 'dismiss' })
is('忽略后不再提示', (await gateway.listTasks()).missed.some(item => item.taskId === dismissTarget.id), false)
const followupsAtEnd = assistantAgent.followups.length

// 8) 持久化 roundtrip（v2）+ v1 数据迁移。
const second = new JxTodoGateway(makeCtx() as never, dataFile)
const secondView = await second.listTasks()
is('重启后任务还在', secondView.tasks.some(item => item.id === pastOnce.id), true)
is('重启后执行记录还在', secondView.records.length > 0, true)
is('重启后没有新的错过提示（基准已推进）', secondView.missed.length, 0)

const v1Dir = mkdtempSync(join(tmpdir(), 'jx-todo-v1-'))
const v1File = join(v1Dir, 'tasks.json')
writeFileSync(v1File, JSON.stringify({
  version: 1,
  tasks: [{ id: 'task-old', title: '旧数据任务', description: 'x', enabled: true, schedule: { kind: 'manual' }, target: { workspaceId: '' }, createdAt: 0, updatedAt: 0 }],
  records: [],
}, null, 2), 'utf8')
const migrated = new JxTodoGateway(makeCtx() as never, v1File)
const migratedTasks = (await migrated.listTasks()).tasks
const migratedTask = migratedTasks.find(item => item.id === 'task-old')
is('v1 任务迁移后是 AI 任务', migratedTask?.executor, 'assistant')
is('v1 迁移时补上两条预置任务', migratedTasks.filter(item => item.id === 'task-jx-mobile-access' || item.id === 'task-assistant-unread').length, 2)
const migratedRaw = JSON.parse(readFileSync(v1File, 'utf8')) as { version: number }
is('迁移后数据文件版本是 2', migratedRaw.version, 2)
rmSync(v1Dir, { recursive: true, force: true })

// 8b) 补种幂等：已有文件缺某条种子时补上；在场条目的用户改动不覆盖。
const topUpDir = mkdtempSync(join(tmpdir(), 'jx-todo-topup-'))
const topUpFile = join(topUpDir, 'tasks.json')
writeFileSync(topUpFile, JSON.stringify({
  version: 2,
  tasks: [{ id: 'task-jx-mobile-access', title: '用户改过的标题', description: '用户改过的描述', enabled: false, executor: 'assistant', schedule: { kind: 'manual' }, target: { workspaceId: '' }, createdAt: 0, updatedAt: 0 }],
  records: [],
}, null, 2), 'utf8')
const topUp = new JxTodoGateway(makeCtx() as never, topUpFile)
const topUpTasks = (await topUp.listTasks()).tasks
is('缺的未读提示种子被补上', topUpTasks.some(item => item.id === 'task-assistant-unread'), true)
const kept = topUpTasks.find(item => item.id === 'task-jx-mobile-access')
is('在场条目的用户改动不被覆盖', kept?.title, '用户改过的标题')
is('在场条目的停用状态保留', kept?.enabled, false)
rmSync(topUpDir, { recursive: true, force: true })

// 9) 损坏文件：改名保留 + 种子恢复。
const brokenDir = mkdtempSync(join(tmpdir(), 'jx-todo-broken-'))
const brokenFile = join(brokenDir, 'tasks.json')
writeFileSync(brokenFile, '{oops', 'utf8')
const third = new JxTodoGateway(makeCtx() as never, brokenFile)
const thirdView = await third.listTasks()
is('坏文件场景恢复出两条种子任务', thirdView.tasks.filter(item => item.id === 'task-jx-mobile-access' || item.id === 'task-assistant-unread').length, 2)
const leftovers = readdirSync(brokenDir)
record('坏文件被改名保留（.bad- 前缀在场，旁有重建的新文件）',
  leftovers.some(name => name.startsWith('tasks.json.bad-')) && leftovers.includes('tasks.json'))

// 清理。
rmSync(dir, { recursive: true, force: true })
rmSync(brokenDir, { recursive: true, force: true })
record('忽略路径没有触发新的转交', assistantAgent.followups.length === followupsAtEnd)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) process.exit(1)
