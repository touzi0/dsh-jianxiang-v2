/**
 * 网关集成自测：用假 ctx 实例化 `JxAssistantGateway`，走完 `ensure()` 与一次派发，
 * 断言调用序列正确。跑法：`node selftest-gateway.mts`（需 Node 24 的类型擦除）。
 *
 * 它替代不了真实宿主，但能在重启前抓出「服务名写错 / setup 里注册错作用域 /
 * 工具体丢了 this / 派发少调了一步」这类运行时错误——本轮就是它抓出了
 * `execute` 写成方法简写导致 `this` 丢失的问题。
 */
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { JxAssistantGateway, ASSISTANT_SESSION_ID, ASSISTANT_CWD } from './src/index.ts'

const calls: string[] = []
const followups: string[] = []
const sections: string[] = []
const listeners: Array<(session: unknown, event: unknown) => void> = []
const definitions = new Map<string, { name: string, execute: (args: never, exec: never) => Promise<unknown> }>()
const permissionCalls: string[] = []
const titleCalls: string[] = []
/** 每次 create/resume 收到的模型路由（{{model}} 变量靠它，缺了会话就跑不起来）。 */
const routeCalls: Array<{ sessionId: string, model?: string }> = []
const archived: string[] = []
/** 数字助理会话组装时挂进来的子插件名。 */
const pluginMounts: string[] = []

const assistantAgent = {
  id: ASSISTANT_SESSION_ID,
  session: { id: ASSISTANT_SESSION_ID, header: { id: ASSISTANT_SESSION_ID, cwd: ASSISTANT_CWD }, snapshotEvents: () => [] },
  status: 'idle',
  followup: (message: unknown) => { followups.push(JSON.stringify(message)) },
}

const workspace = {
  id: 'ws-assistant',
  path: ASSISTANT_CWD,
  title: '数字助理',
  sessionIds: [] as string[],
  attachSession: async (id: string) => { calls.push(`attach:${id}`) },
}

/** 用户的业务工作区：派发目标。 */
const businessWorkspace = {
  id: 'ws-2',
  path: 'D:\\work\\other',
  title: '停机产量分析',
  sessionIds: [] as string[],
  attachSession: async (id: string) => { calls.push(`attach:${id}`) },
}

const tools = {
  get: (name: string) => (name === 'ask_user_question' ? { name } : undefined),
  register: (definition: { name: string, execute: (args: never, exec: never) => Promise<unknown> }) => {
    definitions.set(definition.name, definition)
    return () => undefined
  },
  restrict: (filter: { allow?: readonly string[] }) => {
    calls.push(`tools.restrict:allow=${(filter.allow ?? []).join('|')}`)
    return () => undefined
  },
}

const presets = {
  list: async () => [{ id: 'standard', name: '标准' }, { id: 'minimal', broken: true }],
  resolve: async (id?: string) => ({ id: id ?? 'standard' }),
  mount: async (_ctx: unknown, id?: string) => { calls.push(`presets.mount:${id ?? ''}`); return { id: id ?? 'standard' } },
}

const permissionPresets = {
  resolve: (name: string) => { permissionCalls.push(`resolve:${name}`); return {} },
  set: (_session: unknown, name: string) => { permissionCalls.push(`set:${name}`) },
}

const sessionTitle = {
  rename: (_session: unknown, title: string) => { titleCalls.push(title) },
}

/** 全局默认模型：官方 create/resume 都拿它填 agentOptions。 */
const agentDefaultModel = {
  currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
}

/** 被派发出去的子会话 agent（真正接活的那个）。 */
const childFollowups: string[] = []
const dispatchedAgent = {
  id: 'child-placeholder',
  session: { id: 'child-placeholder', header: { id: 'child-placeholder', cwd: 'D:\\work\\assistant' }, snapshotEvents: () => [] },
  status: 'idle',
  followup: (message: unknown) => { childFollowups.push(JSON.stringify(message)) },
}

/** 数字助理会话是否已在线：一开始不在（走创建路径），回报阶段才置为在线。 */
let assistantLive = false

const mockCtx = {
  reflect: { provide: () => undefined },
  effect: (fn: () => unknown) => {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => undefined
  },
  on: (name: string, handler: (session: unknown, event: unknown) => void) => {
    if (name === 'session/event') listeners.push(handler)
    return () => undefined
  },
  get: (name: string) => {
    if (name === 'agentPresets') return presets
    if (name === 'permissionPresets') return permissionPresets
    if (name === 'sessionTitle') return sessionTitle
    if (name === 'agentDefaultModel') return agentDefaultModel
    return undefined
  },
  logger: { warn: (message: string) => { calls.push(`warn:${String(message).slice(0, 50)}`) } },
  agents: {
    get: (id: string) => (assistantLive && id === ASSISTANT_SESSION_ID ? assistantAgent : undefined),
    create: async (options: { sessionId: string, meta?: { cwd?: string }, agentOptions?: { model?: string }, setup?: (ctx: unknown) => unknown }) => {
      calls.push(`agents.create:${options.sessionId}`)
      routeCalls.push({ sessionId: options.sessionId, ...(options.agentOptions?.model === undefined ? {} : { model: options.agentOptions.model }) })
      await options.setup?.({
        tools,
        systemPrompt: { section: (item: { name: string }) => { sections.push(item.name); return () => undefined } },
        plugin: (mod: { name?: string }) => { pluginMounts.push(mod?.name ?? 'unknown') },
      })
      return { agent: options.sessionId === ASSISTANT_SESSION_ID ? assistantAgent : dispatchedAgent }
    },
    resume: async (options: { resumeSessionId: string, agentOptions?: { model?: string }, setup?: (ctx: unknown) => unknown }) => {
      routeCalls.push({ sessionId: options.resumeSessionId, ...(options.agentOptions?.model === undefined ? {} : { model: options.agentOptions.model }) })
      await options.setup?.({})
      return { agent: dispatchedAgent }
    },
  },
  workspaceRegistry: {
    list: () => [workspace, businessWorkspace] as unknown[],
    get: (id: string) => [workspace, businessWorkspace].find(item => item.id === id),
    create: async (path: string, title?: string) => {
      calls.push(`workspace.create:${path}:${title ?? ''}`)
      return workspace
    },
    archivedSessionIds: archived,
    archiveSession: async (sessionId: string) => { archived.push(sessionId) },
  },
  sessionQuery: {
    listSessions: async () => [] as unknown[],
    readSession: async (id: string) => ({ session: { id, cwd: workspace.path }, events: [] }),
    readTitle: async () => undefined,
  },
  tools,
}

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }

// ---- 一、ensure()：建/恢复数字助理会话并完成组装 ----
const gateway = new JxAssistantGateway(mockCtx as never)
const ensured = await gateway.ensure()

record('ensure() 返回固定会话 id', ensured.sessionId === ASSISTANT_SESSION_ID)
record('用 agents.create 建会话（不是 resume）', calls.includes(`agents.create:${ASSISTANT_SESSION_ID}`))
record('注册了 8 个工具', definitions.size === 8)
record('工具名齐全', ['list_workspaces', 'list_sessions', 'list_presets', 'list_models', 'read_session_summary', 'dispatch_task', 'send_to_session', 'create_workspace']
  .every(name => definitions.has(name)))
record('提示词段注册在 agent 作用域（不是全局）', sections.includes('jx-digital-assistant/persona'))
record('全局工具收窄为白名单', calls.includes('tools.restrict:allow=ask_user_question'))
record('数字助理挂进落脚工作区（不挂的话客户端 openSession 会静默失败）', calls.includes(`attach:${ASSISTANT_SESSION_ID}`))
record('给数字助理挂了官方提问工具', pluginMounts.includes('tool-ask-user'))
record('监听 session/event', listeners.length === 1)
record('没有意外告警', !calls.some(call => call.startsWith('warn:')))
record('建会话时带了模型路由（否则 {{model}} 无值、会话跑不起来）',
  routeCalls.some(item => item.sessionId === ASSISTANT_SESSION_ID && typeof item.model === 'string' && item.model !== ''))
record('不靠归档隐藏（归档会被 clearArchivedCurrent 把用户踢出主视图）', !archived.includes(ASSISTANT_SESSION_ID))

// ---- 二、dispatch_task：照官方范式建会话、设权限、投递需求 ----
const planned = definitions.get('dispatch_task')
if (planned === undefined) {
  record('拿到 dispatch_task 定义', false)
} else {
  const result = await planned.execute({ task: '把停机时间按班次汇总', workspace_id: businessWorkspace.id, title: '停机汇总' } as never, {} as never) as { text: string }
  record('派发生成了新会话', /已开工：会话 session-/.test(result.text))
  record('派发挂了工作区', calls.some(call => call.startsWith('attach:session-') && !call.endsWith(ASSISTANT_SESSION_ID)))
  record('派发设了默认权限 workspace-write', permissionCalls.includes('set:workspace-write'))
  record('派发挂了模式 standard', calls.includes('presets.mount:standard'))
  record('派发写了标题', titleCalls.includes('停机汇总'))
  record('派发投递了需求', childFollowups.length === 1)
  record('派发文本报告了模型', result.text.includes('模型'))
}

// ---- 三、完全访问必须被拦住（未带用户确认） ----
if (planned !== undefined) {
  const denied = await planned.execute({ task: 'x', workspace_id: businessWorkspace.id, permission: 'danger-full-access' } as never, {} as never) as { text: string }
  record('完全访问未确认时被拒', denied.text.includes('ask_user_question') && !denied.text.startsWith('已开工'))
  const approved = await planned.execute({ task: 'y', workspace_id: businessWorkspace.id, permission: 'danger-full-access', user_confirmed: true } as never, {} as never) as { text: string }
  record('用户确认后完全访问放行', approved.text.startsWith('已开工') && permissionCalls.includes('set:danger-full-access'))
}

// ---- 四、完成回报：派发出去的会话 turn/end → 摘要回送数字助理 ----
assistantLive = true
const childId = calls
  .filter(call => call.startsWith('agents.create:session-') && !call.endsWith(ASSISTANT_SESSION_ID))
  .at(-1)
  ?.slice('agents.create:'.length)
record('取到派发出去的会话 id', typeof childId === 'string' && childId.length > 0)
if (childId !== undefined) {
  for (const listener of listeners) {
    listener({ id: childId }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  }
  await new Promise(resolve => setTimeout(resolve, 80))
}
record('跑完把摘要回送给了数字助理', followups.some(text => text.includes('派发回报')))
record('回报里带压缩摘要字段', followups.some(text => text.includes('工具调用') && text.includes('最终答复')))
record('同一轮不重复回报', followups.filter(text => text.includes('派发回报')).length === 1)

// ---- 五、其余 6 个工具的行为 ----
const mutable = mockCtx as unknown as {
  get: (name: string) => unknown
  agents: { get: (id: string) => unknown, resume: (options: { resumeSessionId: string, setup?: (ctx: unknown) => unknown }) => Promise<{ agent: unknown }> }
  sessionQuery: {
    listSessions: () => Promise<unknown[]>
    readTitle: (id: string) => Promise<unknown>
    readSession: (id: string) => Promise<unknown>
  }
  workspaceRegistry: { list: () => unknown[], create: (path: string, title?: string) => Promise<unknown> }
}

mutable.get = (name: string) => ({
  agentPresets: presets,
  permissionPresets,
  sessionTitle,
  agentDefaultModel,
  llm: {
    listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek 官方' }],
    listModels: async () => [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
  },
}[name])

mutable.workspaceRegistry.list = () => [
  { id: 'ws-assistant', path: ASSISTANT_CWD, title: '数字助理', sessionIds: [ASSISTANT_SESSION_ID], attachSession: async () => undefined },
  { id: 'ws-2', path: 'D:\\work\\other', title: '停机产量分析', sessionIds: ['session-x1', 'session-x3'], attachSession: async () => undefined },
]
mutable.workspaceRegistry.create = async (path: string, title?: string) => {
  calls.push(`workspace.create:${path}:${title ?? ''}`)
  return { id: 'ws-new', path, title: title ?? '新工作区', sessionIds: [], attachSession: async () => undefined }
}

mutable.sessionQuery.listSessions = async () => [
  { header: { id: 'session-x1', cwd: 'D:\\work\\other', createdAt: 3_000 }, live: false, persisted: true },
  { header: { id: ASSISTANT_SESSION_ID, cwd: 'D:\\work\\assistant', createdAt: 2_000 }, live: true, persisted: true },
  { header: { id: 'session-x2', cwd: 'D:\\work\\other', createdAt: 1_500, origin: 'subagent' }, live: false, persisted: true },
  { header: { id: 'session-x3', cwd: 'D:\\work\\other', createdAt: 1_000 }, live: false, persisted: true },
]
mutable.sessionQuery.readTitle = async (id: string) => ({ title: `标题-${id}` })
mutable.sessionQuery.readSession = async (id: string) => ({
  session: { id, cwd: 'D:\\work\\other', agentPreset: 'standard' },
  events: [
    { type: 'turn/start', time: 1_000, data: { turn: 1 } },
    { type: 'assistant/message', time: 1_100, data: { turn: 1, step: 1, message: { content: [
      { type: 'reasoning', text: '内部思考不该外泄' },
      { type: 'text', text: '我先看一下。' },
    ] } } },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{"file_path":"a.ts"}' } },
    { type: 'tool/result', data: { turn: 1, step: 1, message: { source: { callId: 'c1' }, content: [] } } },
    { type: 'assistant/message', time: 1_300, data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '做完了。' }] } } },
    { type: 'turn/end', time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } },
  ],
})

const runTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
  const definition = definitions.get(name)
  if (definition === undefined) throw new Error(`没有注册工具 ${name}`)
  const value = await definition.execute(args as never, {} as never) as { text: string }
  return value.text
}

const workspacesText = await runTool('list_workspaces', {})
record('list_workspaces 列出用户工作区', workspacesText.includes('停机产量分析') && workspacesText.includes('D:\\work\\other'))
record('list_workspaces 排除数字助理自己的家', !workspacesText.includes('ws-assistant'))

const homeDenied = await runTool('dispatch_task', { task: '随便什么活', workspace_id: 'ws-assistant' })
record('拒绝把活派到数字助理自己的家', homeDenied.includes('数字助理自己的家') && !homeDenied.startsWith('已开工'))

const sessionsText = await runTool('list_sessions', { limit: 10 })
record('list_sessions 带标题与所属工作区', sessionsText.includes('标题-session-x1') && sessionsText.includes('停机产量分析'))
record('list_sessions 排除数字助理自己与子代理会话', !sessionsText.includes(ASSISTANT_SESSION_ID) && !sessionsText.includes('session-x2'))
record('list_sessions 按时间倒序', sessionsText.indexOf('session-x1') < sessionsText.indexOf('session-x3'))

const presetsText = await runTool('list_presets', {})
record('list_presets 过滤坏模式', presetsText.includes('standard') && !presetsText.includes('minimal'))

const providersText = await runTool('list_models', {})
record('list_models 列出提供方', providersText.includes('deepseek-official'))
const modelsText = await runTool('list_models', { provider: 'deepseek-official' })
record('list_models 列出模型', modelsText.includes('deepseek-official/deepseek-chat'))

const summaryText = await runTool('read_session_summary', { session_id: 'session-x1' })
record('read_session_summary 给出工具调用与最终答复', summaryText.includes('read×1') && summaryText.includes('做完了。'))
record('read_session_summary 不外泄思考', !summaryText.includes('内部思考不该外泄'))

const resumedSessions: string[] = []
mutable.agents.get = () => undefined
mutable.agents.resume = async (options) => {
  resumedSessions.push(options.resumeSessionId)
  await options.setup?.({})
  return { agent: dispatchedAgent }
}
const beforeSend = calls.length
const sendText = await runTool('send_to_session', { session_id: 'session-x1', task: '接着把 b.ts 也改了' })
record('send_to_session 冷恢复目标会话', resumedSessions.includes('session-x1'))
record('send_to_session 按会话原模式重挂', calls.slice(beforeSend).includes('presets.mount:standard'))
record('send_to_session 投递了新需求', childFollowups.some(text => text.includes('接着把 b.ts 也改了')))
record('send_to_session 报告已追加', sendText.includes('已把需求追加给会话 session-x1'))

const tempPath = `${tmpdir()}\\dsh-da-selftest-workspace`
const createText = await runTool('create_workspace', { path: tempPath, title: '自测工作区' })
record('create_workspace 登记新工作区', createText.includes('自测工作区'))
record('create_workspace 目录已建立', existsSync(tempPath))
rmSync(tempPath, { recursive: true, force: true })

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `${failed}/${checks.length} 项失败`)
if (failed > 0) {
  console.log('---- 调用序列 ----')
  for (const call of calls) console.log(' ', call)
  console.log('---- 权限 ----', permissionCalls.join(', '))
  console.log('---- 标题 ----', titleCalls.join(', '))
  console.log('---- 回报 ----', followups.join(' | '))
  process.exitCode = 1
}
