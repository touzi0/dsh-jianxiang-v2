/**
 * Typert Remote 工件自测：descriptors 的方法清单、参数 codec 可构造可解析
 * （官方 0.1.6+ 要求 `create: () => zod`），以及请求体 roundtrip。
 * 跑法：`node selftest-remote.mts`。
 */
import { createRequire } from 'node:module'
import { TYPERT_REMOTE } from './src/remote-client.ts'

const require2 = createRequire(import.meta.url)
const z = require2('zod') as { z: import('zod').z }
const { z: zod } = z

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }

const remote = TYPERT_REMOTE as unknown as {
  id: string
  descriptors: Array<{
    id: string
    service: string
    namespace: string
    method: string
    invocation: { kind: string }
    parameters: Array<{ name: string, source: string, codec: { mode: string, create: () => { safeParse: (input: unknown) => { success: boolean } } } }>
    result: { _output?: unknown }
  }>
}

record('远端包名是 dsh-todo-scheduler（官方工件顶层形状 package+descriptors）', (remote as unknown as { package: string }).package === 'dsh-todo-scheduler')
const methods = remote.descriptors.map(descriptor => descriptor.method)
record('八个远端方法齐全', ['status', 'listTasks', 'createTask', 'updateTask', 'deleteTask', 'runNow', 'resolveMissed', 'listWorkspaces']
  .every(method => methods.includes(method)))
record('descriptor id 是 包名#命名空间/方法', remote.descriptors.every(descriptor => descriptor.id === `dsh-todo-scheduler#jxTodo/${descriptor.method}`))
record('invocation 全部 direct', remote.descriptors.every(descriptor => descriptor.invocation.kind === 'direct'))
record('参数单一 request（source json）', remote.descriptors.every(descriptor => descriptor.parameters.length <= 1
  && (descriptor.parameters.length === 0 || (descriptor.parameters[0]!.name === 'request' && descriptor.parameters[0]!.source === 'json'))))

// codec：官方要求 create 工厂返回 zod schema；这里逐个构造并解析一条样本。
const samples: Record<string, unknown> = {
  status: {},
  listTasks: {},
  listWorkspaces: {},
  runNow: { id: 'task-jx-mobile-access' },
  deleteTask: { id: 'task-x' },
  resolveMissed: { id: 'task-x', action: 'run' },
  createTask: {
    title: '标题', description: '描述', schedule: { kind: 'manual' }, target: { workspaceId: '' },
  },
  updateTask: { id: 'task-x', patch: { title: '新标题' } },
}
for (const descriptor of remote.descriptors) {
  if (descriptor.parameters.length === 0) continue // status/listTasks/listWorkspaces 无参
  const codec = descriptor.parameters[0]!.codec
  record(`${descriptor.method}.codec 是 strict 模式`, codec.mode === 'strict')
  let parsed = false
  let rejected = false
  try {
    const schema = codec.create()
    parsed = schema.safeParse(samples[descriptor.method]!).success
    rejected = !schema.safeParse({ totally: 'wrong' }).success
  } catch { /* 构造失败按未通过计 */ }
  record(`${descriptor.method}.codec 可构造并接受合法样本`, parsed)
  record(`${descriptor.method}.codec 拒绝任意对象`, rejected)
}

// 业务规则在 codec 里的体现：非 manual 必须带工作区；时间格式 HH:mm。
const createCodec = remote.descriptors.find(descriptor => descriptor.method === 'createTask')!.parameters[0]!.codec
const schema = createCodec.create()
// wire codec 只管形状（字段类型），业务规则（HH:mm、非 manual 必须带工作区）由宿主
// 网关的 assertValidSchedule/assertValidTarget 校验（selftest-gateway 覆盖）。
record('形状合法但业务非法的请求在 wire 层放行（业务校验在宿主）',
  schema.safeParse({ title: 'x', description: 'x', schedule: { kind: 'daily', time: '99:99' }, target: { workspaceId: '' } }).success)
record('manual 允许空工作区', schema.safeParse({ title: 'x', description: 'x', schedule: { kind: 'manual' }, target: { workspaceId: '' } }).success)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) process.exit(1)
