/**
 * 浏览器半边自测：把已构建的 `lib/client.js` 当模块工厂加载，喂假 ctx 跑 `apply()`，
 * 再用真 React + jsdom 渲染主面板（假 remote 数据），断言页面、表单与校验链路。
 * 跑法：`node selftest-client.mts`（先 `node build.mjs` 构建 lib/client.js）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const PNPM = join(ROOT, 'node_modules', '.pnpm')

/** 在 .pnpm 里按目录名前缀取包的安装目录（与 build.mjs 链接 zod 同一套做法）。 */
function pnpmDir(prefix: string): string {
  const dir = readdirSync(PNPM).find(entry => new RegExp(`^${prefix}@\\d`).test(entry))
  if (dir === undefined) throw new Error(`找不到 ${prefix}：${PNPM}`)
  return join(PNPM, dir, 'node_modules', ...prefix.split('/'))
}

/** 加载一个 CJS 文件并返回 module.exports（.pnpm 里的包都是 CJS）。 */
async function loadCjs(path: string): Promise<Record<string, unknown>> {
  const loaded = await import(pathToFileURL(path).href) as { default?: unknown }
  return (loaded.default ?? loaded) as Record<string, unknown>
}

/** 按包自身 package.json 的 main 字段加载整个包。 */
async function loadPackage(packageDir: string): Promise<Record<string, unknown>> {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { main?: string }
  return loadCjs(join(packageDir, manifest.main ?? 'index.js'))
}

const reactDir = pnpmDir('react')
const React = await loadPackage(reactDir)
const jsxRuntime = await loadCjs(join(reactDir, 'jsx-runtime.js'))
const jsdomModule = await loadPackage(pnpmDir('jsdom'))
const reactDomClient = await loadCjs(join(pnpmDir('react-dom'), 'client.js'))

// ---- jsdom 环境（React 与 bundle 都按浏览器跑） ----
const { JSDOM } = jsdomModule as unknown as { JSDOM: new (html: string, options: { url: string }) => { window: Record<string, unknown> } }
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
const window = dom.window
const document = window.document as Document
const globals = globalThis as unknown as Record<string, unknown>
globals.window = window
globals.document = document
globals.HTMLElement = window.HTMLElement
globals.HTMLInputElement = window.HTMLInputElement
globals.HTMLTextAreaElement = window.HTMLTextAreaElement
globals.Node = window.Node
globals.MouseEvent = window.MouseEvent
globals.Event = window.Event
globals.getComputedStyle = (window.getComputedStyle as (el: unknown) => unknown).bind(window)
globals.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })

interface LoaderEntry {
  id: string
  factory: (require: (spec: string) => unknown) => Record<string, unknown>
}
const loaded: LoaderEntry[] = []
;(window as { __ModuleLoader__?: unknown }).__ModuleLoader__ = {
  load: (entry: LoaderEntry) => { loaded.push(entry) },
}

await import(pathToFileURL(join(PKG_DIR, 'lib/client.js')).href)

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }
const text = (node: Element | null): string => node?.textContent ?? ''

record('产物用 __ModuleLoader__ 注册了一个 bundle', loaded.length === 1)
const entry = loaded[0]
record('bundle id 正确', entry?.id === 'dsh-todo-scheduler')

// ---- ui-primitives 假件（只复刻本插件用到的契约） ----
const icon = (props: { size?: number }) => React.createElement('svg', { 'data-icon': '', width: props.size ?? 16 })
const FakeButton = (props: Record<string, unknown>) =>
  React.createElement('button', {
    type: 'button',
    'data-variant': props.variant,
    disabled: props.disabled === true,
    onClick: props.onClick,
  }, props.icon as never, props.children as never)
const FakeSwitch = (props: { checked: boolean, onChange: (next: boolean) => void, label: string }) =>
  React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.checked,
    'aria-label': props.label,
    onClick: () => { props.onChange(!props.checked) },
  })
const FakeStateDot = (props: { state: string }) => React.createElement('span', { 'data-state': props.state })
// createPortal 用真件（jsdom 里渲染到 document.body）。
const reactDomMain = await loadCjs(join(pnpmDir('react-dom'), 'index.js')) as { createPortal: (node: unknown, container: Element) => unknown }
const fakeRequire = (specifier: string): unknown => {
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  if (specifier === 'react-dom') return reactDomMain
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return {
      Button: FakeButton, Switch: FakeSwitch, StateDot: FakeStateDot,
      IconAlarmClockOutline16: icon, IconPlusOutline16: icon,
    }
  }
  throw new Error(`客户端半边请求了预期外的模块：${specifier}`)
}

const moduleExports = entry?.factory(fakeRequire)
record('工厂执行成功', moduleExports !== undefined)
record('顶层注入只要求 remote', JSON.stringify(moduleExports?.inject) === JSON.stringify(['remote']))
record('PANEL_ID 是 todo-scheduler', moduleExports?.PANEL_ID === 'todo-scheduler')

// ---- 假 remote 数据（含种子任务、定时任务、错过、记录） ----
const NOW = Date.now()
const remoteCalls: string[] = []
let created: unknown
const snapshotValue = {
  tasks: [
    {
      id: 'task-jx-mobile-access', title: '手机端访问：解锁局域网 + 扫码入口',
      description: '按《手机端访问实施方案.md》的结论做第一步和第二步。', enabled: true,
      executor: 'assistant', schedule: { kind: 'manual' }, target: { workspaceId: '' },
      createdAt: NOW, updatedAt: NOW,
    },
    {
      id: 'task-daily', title: '每晚巡检', description: '工作日每天晚上检查一遍。', enabled: true,
      executor: 'assistant', schedule: { kind: 'weekdays', time: '21:00' }, target: { workspaceId: 'ws-1' },
      createdAt: NOW, updatedAt: NOW, nextRunAt: NOW + 3_600_000, lastRunAt: NOW - 3_600_000, lastStatus: 'ok',
      lastSessionId: 'session-abc',
    },
  ],
  records: [
    { id: 'run-1', taskId: 'task-daily', trigger: 'schedule', startedAt: NOW - 3_600_000, status: 'ok', sessionId: 'session-abc', summary: '共 1 轮｜最后答复：检查完毕。' },
  ],
  missed: [{ taskId: 'task-daily', slotTime: NOW - 60_000 }],
  dataFile: 'C:\\jx\\dsh-home\\jx-todo\\tasks.json',
}
const workspacesValue = { items: [{ id: 'ws-1', title: '演示工作区', path: 'C:\\jx\\ws-demo' }] }
const remote = {
  jxTodo: {
    listTasks: async () => { remoteCalls.push('listTasks'); return { ok: true as const, value: snapshotValue } },
    listWorkspaces: async () => ({ ok: true as const, value: workspacesValue }),
    createTask: async (request: unknown) => { remoteCalls.push('createTask'); created = request; return { ok: true as const, value: { task: snapshotValue.tasks[0] } } },
    updateTask: async () => ({ ok: true as const, value: { task: snapshotValue.tasks[0] } }),
    deleteTask: async () => ({ ok: true as const, value: { ok: true as const } }),
    runNow: async () => ({ ok: true as const, value: { ok: true, sessionId: 'session-new' } }),
    resolveMissed: async () => ({ ok: true as const, value: { ok: true as const } }),
  },
}
const openedSessions: string[] = []

// ---- 假客户端 ctx ----
interface Registration { options: Record<string, unknown>, component: unknown }
const registrations: Registration[] = []
let childApplyCalled = false
const dictionaries: Array<Record<string, string>> = []
const dicts: Array<{ ns: string, dicts: Record<string, Record<string, string>> }> = []

const slotChild = {
  remote,
  get: (name: string) => (name === 'uiWorkspace' ? { openSession: (id: string) => { openedSessions.push(id) } } : undefined),
  effect: (fn: () => unknown) => {
    const cleanup = fn()
    if (typeof cleanup === 'function') childEffects.push(cleanup as () => void)
    return cleanup
  },
  locale: {
    register: (ns: string, dictPair: Record<string, Record<string, string>>) => {
      dicts.push({ ns, dicts: dictPair })
      return () => undefined
    },
    bind: (ns: string) => (key: string, params?: Record<string, string>): string => {
      const dict = dicts.find(item => item.ns === ns)?.dicts.zh ?? {}
      let value = dict[key] ?? key
      for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, replacement)
      return value
    },
  },
  slots: {
    inject: (slot: string, factory: () => void) => { factory(); record(`注册的槽名合法（${slot}）`, slot === 'main' || slot === 'sidebar.panellist') },
    register: (options: Record<string, unknown>, component: unknown) => {
      registrations.push({ options, component })
      return () => undefined
    },
  },
}

const styleEffects: Array<() => void> = []
const childEffects: Array<() => void> = []
const ctx = {
  effect: (fn: () => unknown) => {
    const cleanup = fn()
    if (typeof cleanup === 'function') styleEffects.push(cleanup as () => void)
    return async () => { (cleanup as (() => void) | undefined)?.() }
  },
  remote: { $mount: async () => async () => undefined },
  plugin: (definition: { apply: (child: unknown) => void }) => {
    childApplyCalled = true
    definition.apply(slotChild)
    // 宿主拆除子插件时会调用它返回的 dispose；子 ctx 上挂的 effect 一并撤掉。
    return async () => { for (const dispose of childEffects) dispose() }
  },
}

const dispose = await moduleExports?.apply?.(ctx as never) as () => Promise<void>
record('子插件 apply 已执行', childApplyCalled)
record('词典注册为 jxTodoScheduler（zh/en 双语）', dicts.length === 1
  && dicts[0]!.ns === 'jxTodoScheduler'
  && Object.keys(dicts[0]!.dicts).sort().join(',') === 'en,zh')
record('中文词典含页面标题', dicts[0]!.dicts.zh!['page.title'] === '待办事项与定时任务')
record('英文词典含侧栏入口', dicts[0]!.dicts.en!['panel'] === 'Tasks & Scheduled Work')
record('注册了 main 面板与侧栏行', registrations.length === 2)
const mainReg = registrations.find(item => item.options.name === 'main')
const rowReg = registrations.find(item => item.options.name === 'sidebar.panellist')
record('main 面板 key 与行 id 一致', mainReg?.options.key === 'todo-scheduler' && rowReg?.options.id === 'todo-scheduler')
is2('侧栏行 order 排在官方插件行（0）之后', rowReg?.options.order, 5)
const style = document.head.querySelector('style[data-jx-todo-scheduler]')
record('样式表已挂进 document.head', style !== null)
record('样式含页面容器', (style?.textContent ?? '').includes('.jx-todo-page{'))

function is2(label: string, actual: unknown, expected: unknown): void {
  record(`${label}（实际 ${JSON.stringify(actual)}）`, JSON.stringify(actual) === JSON.stringify(expected))
}

// ---- 真 React 渲染主面板 ----
const { createRoot } = reactDomClient as unknown as { createRoot: (el: Element) => { render: (node: unknown) => void, unmount: () => void } }
const act = (React as unknown as { act: (fn: () => Promise<void>) => Promise<void> }).act

const container = document.createElement('div')
document.body.append(container)
const root = createRoot(container)
const Page = mainReg?.component as (props: Record<string, unknown>) => unknown
const pageListCalls: number[] = []
let createCalls = 0
const updateCalls: Array<{ id: string, patch: Record<string, unknown> }> = []

await act(async () => {
  root.render(React.createElement(Page as never, {
    api: {
      t: slotChild.locale.bind('jxTodoScheduler'),
      // TodoPage 的 api 契约收「已解包」数据（RemoteResult 由子插件层 unwrap）。
      listTasks: async () => { pageListCalls.push(1); return snapshotValue },
      listWorkspaces: async () => workspacesValue.items,
      createTask: async (request: unknown) => { createCalls += 1; created = request },
      updateTask: async (request: { id: string, patch: Record<string, unknown> }) => { updateCalls.push(request) },
      deleteTask: async () => undefined,
      runNow: async () => ({ ok: true, sessionId: 'session-new' }),
      resolveMissed: async () => undefined,
      openSession: (id: string) => { openedSessions.push(id) },
    },
  }))
})
await act(async () => { await Promise.resolve() })

record('页面标题渲染', text(document.querySelector('.jx-todo-title')) === '待办事项与定时任务')
record('说明文案渲染', text(document.querySelector('.jx-todo-intro')).includes('工作任务'))
is2('加载拉了一次任务与工作区', pageListCalls.length, 1)
const cards = document.querySelectorAll('.jx-todo-card')
is2('两张任务卡片', cards.length, 2)
record('种子任务标题上卡', text(cards[0]?.querySelector('.jx-todo-task-title') ?? null).includes('手机端访问'))
record('任务卡带「AI 任务」类型徽标', text(cards[1]?.querySelector('.jx-todo-badge') ?? null) === 'AI 任务')
record('定时任务徽标显示「仅工作日 · 21:00」', [...(cards[1]?.querySelectorAll('.jx-todo-badge') ?? [])].some(node => text(node).includes('仅工作日 · 21:00')))
record('下次执行时间渲染', text(cards[1]).includes('下次执行'))
record('错过横幅出现（含计数 1）', text(document.querySelector('.jx-todo-missed') ?? null).includes('1'))
record('数据文件路径展示', text(document.body).includes('tasks.json'))

// 记录默认折叠：点「执行记录（1）」展开后再断言摘要与「查看会话」。
const expand = [...(cards[1]?.querySelectorAll('.jx-todo-link') ?? [])].find(node => text(node).includes('执行记录'))
record('定时任务卡有执行记录入口', expand !== undefined)
await act(async () => { (expand as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
record('执行记录摘要上卡', text(cards[1]).includes('检查完毕'))
const openButtons = [...document.querySelectorAll('.jx-todo-link')].filter(node => text(node) === '查看会话')
record('记录行有「查看会话」入口', openButtons.length === 1)
await act(async () => { (openButtons[0] as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
is2('点「查看会话」打开了记录里的会话', openedSessions, ['session-abc'])

// 新建表单：portal 挂在 body（全页遮罩）、字段齐全、类型可切换。
const newButton = [...document.querySelectorAll('button')].find(node => text(node).includes('新建任务'))
record('右上角有「新建任务」按钮', newButton !== undefined)
await act(async () => { (newButton as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
record('表单模态出现', document.querySelector('.jx-todo-modal') !== null)
is2('遮罩经 portal 挂在 body（全页覆盖）', document.body.querySelector(':scope > .jx-todo-mask') !== null, true)
record('标题输入框在场', document.querySelector('#jx-todo-title') !== null)
record('描述输入框在场', document.querySelector('#jx-todo-desc') !== null)
const kindOptions = document.querySelectorAll('#jx-todo-kind option')
is2('执行方式六选', kindOptions.length, 6)
const execButtons = [...document.querySelectorAll('.jx-todo-execseg button')]
is2('任务类型两枚分段按钮', execButtons.map(node => text(node)), ['AI 任务', '程序任务'])
record('AI 任务下没有命令输入', document.querySelector('#jx-todo-command') === null)
const commandSeg = execButtons[1]
await act(async () => { (commandSeg as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
record('切到程序任务后出现命令输入', document.querySelector('#jx-todo-command') !== null)
record('程序任务下有工作目录下拉', text(document.querySelector('#jx-todo-workspace') ?? null).includes('演示工作区'))
const cancelAfterSwitch = [...document.querySelectorAll('.jx-todo-modal-foot button')].find(node => text(node) === '取消')
await act(async () => { (cancelAfterSwitch as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })

// 空表单校验 + 编辑保存链路（编辑路径覆盖 toForm/toRequest，不受受控输入限制）。
await act(async () => { (newButton as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
const saveButton = [...document.querySelectorAll('.jx-todo-modal-foot button')].find(node => text(node).includes('保存'))
await act(async () => { (saveButton as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
record('空表单保存被校验拦下', text(document.querySelector('.jx-todo-modal') ?? null).includes('请填写标题'))
is2('校验拦截后没有发请求', updateCalls.length, 0)
const cancelButton = [...document.querySelectorAll('.jx-todo-modal-foot button')].find(node => text(node) === '取消')
await act(async () => { (cancelButton as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })

const editButton = [...(cards[0]?.querySelectorAll('button') ?? [])].find(node => text(node) === '编辑')
record('任务卡有「编辑」按钮', editButton !== undefined)
await act(async () => { (editButton as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
record('编辑表单预填了标题', (document.querySelector('#jx-todo-title') as HTMLInputElement | null)?.value === '手机端访问：解锁局域网 + 扫码入口')
const saveEdit = [...document.querySelectorAll('.jx-todo-modal-foot button')].find(node => text(node).includes('保存'))
await act(async () => { (saveEdit as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string) => Event)('click', { bubbles: true })) })
is2('保存发出 updateTask', updateCalls.length, 1)
is2('请求体是种子任务的原样 patch', updateCalls[0], {
  id: 'task-jx-mobile-access',
  patch: {
    title: '手机端访问：解锁局域网 + 扫码入口',
    description: '按《手机端访问实施方案.md》的结论做第一步和第二步。',
    executor: 'assistant',
    schedule: { kind: 'manual' },
    target: { workspaceId: '' },
    enabled: true,
  },
})
record('保存成功后表单关闭', document.querySelector('.jx-todo-modal') === null)

// 卸载：子插件 effect（词典 + 样式表）都撤掉。
is2('子插件挂了词典与样式两个 effect', childEffects.length, 2)
await act(async () => { await dispose() })
record('卸载后样式表被撤掉', document.head.querySelector('style[data-jx-todo-scheduler]') === null)
root.unmount()

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
console.log(`\n共 ${checks.length} 项，通过 ${checks.length - failed} 项，失败 ${failed} 项。`)
process.exit(failed === 0 ? 0 : 1)
