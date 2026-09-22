/**
 * 浏览器半边自测：把已构建的 `lib/client.js` 当模块工厂加载，喂假 ctx 跑 `apply()`，
 * 再用真 React + jsdom 把药丸渲染出来，断言它确实是官方 AgentPresetSeat 的原生样子
 * （芯片类名、菜单行「名称一行 + 灰色小字描述一行」、样式表注入与撤销）。
 * 跑法：`node selftest-client.mts`。
 *
 * 平台基线的替身：ui-primitives 只给 Menu 与两个图标的最小实现（Menu 复刻我们依赖的
 * 契约：className 落到外层壳、open 时渲染 items 的 label），React 用仓库 .pnpm 里的真货。
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
globals.Node = window.Node
globals.MouseEvent = window.MouseEvent
globals.getComputedStyle = (window.getComputedStyle as (el: unknown) => unknown).bind(window)
globals.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })

interface LoaderEntry {
  id: string
  factory: (require: (spec: string) => unknown) => {
    apply?: (ctx: unknown) => Promise<unknown>
    inject?: readonly string[]
  }
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
record('bundle id 正确', entry?.id === 'dsh-mode-switch')

/** 图标替身：把 className 落到 svg 上，供断言查类名。 */
const icon = (props: { className?: string }) => React.createElement('svg', { className: props.className })
/** Menu 替身：外层壳吃 className（官方 `.root` + 传入类名），open 时渲染各行 label，
 *  行是按钮且点击回调 onSelect（与官方 Menu 的 .item 行为一致）。 */
const FakeMenu = (props: {
  open: boolean
  className?: string
  anchor: unknown
  items: { id: string, label: unknown }[]
  onSelect: (id: string) => void
}) => React.createElement(
  'span',
  { className: props.className },
  props.anchor as never,
  props.open
    ? React.createElement('div', { role: 'menu' }, props.items.map(item =>
      React.createElement(
        'button',
        { key: item.id, type: 'button', 'data-row': item.id, onClick: () => { props.onSelect(item.id) } },
        item.label as never,
      )))
    : null,
)

const fakeRequire = (specifier: string): unknown => {
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return { Menu: FakeMenu, IconAgentPresetOutline16: icon, IconChevronDownOutline14: icon }
  }
  throw new Error(`客户端半边请求了预期外的模块：${specifier}`)
}

const moduleExports = entry?.factory(fakeRequire)
record('工厂执行成功', moduleExports !== undefined)
record(
  '顶层注入只要求 remote',
  Array.isArray(moduleExports?.inject) && moduleExports.inject.length === 1 && moduleExports.inject[0] === 'remote',
)

// ---- 假客户端 ctx ----
interface Registration { options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown }
const registrations: Registration[] = []
let childApplyCalled = false

const slotChild = {
  // 子插件读的是自己的 ctx.remote（注入声明 remote.jxPreset / remote.agentPresets）。
  remote: {
    jxPreset: { switch: async () => ({ ok: true, value: 'standard' }) },
    agentPresets: { list: async () => ({ ok: true, value: { presets: [] } }) },
  },
  slots: {
    inject: (slot: string, factory: () => void) => {
      record('注册的槽名是 conversation.input.left', slot === 'conversation.input.left')
      factory()
    },
    register: (options: Record<string, unknown>, component: Registration['component']) => {
      registrations.push({ options, component })
      return { dispose: () => undefined }
    },
  },
}

const styleEffects: (() => void)[] = []
const ctx = {
  effect: (fn: () => void) => {
    const cleanup = fn()
    if (typeof cleanup === 'function') styleEffects.push(cleanup as () => void)
    return async () => { (cleanup as (() => void) | undefined)?.() }
  },
  remote: {
    $mount: async () => async () => undefined,
    jxPreset: { switch: async () => ({ ok: true, value: 'standard' }) },
    agentPresets: { list: async () => ({ ok: true, value: { presets: [] } }) },
  },
  plugin: (definition: { apply: (child: unknown) => void }) => {
    childApplyCalled = true
    definition.apply(slotChild)
    return async () => undefined
  },
}

const dispose = await moduleExports?.apply?.(ctx)
record('子插件 apply 已执行', childApplyCalled)
record('槽只注册一次', registrations.length === 1)
record('注册 id 为 mode-switch', registrations[0]?.options.id === 'mode-switch')

const style = document.head.querySelector('style[data-jx-mode-switch="seat"]')
record('样式表已挂进 document.head', style !== null)
const css = style?.textContent ?? ''
for (const [label, snippet] of [
  ['芯片 28px / 圆角 16px', '.jx-ms-seat{display:inline-flex'],
  ['展开态与悬停同底色', ".jx-ms-seat[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover)}"],
  ['菜单行名称 13/20 主色', '.jx-ms-item-name{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}'],
  ['菜单行描述 12/16 灰色小字', '.jx-ms-item-desc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-caption);white-space:normal}'],
] as const) {
  record(`样式含「${label}」`, css.includes(snippet))
}

// ---- 真 React 渲染 ----
const { createRoot } = reactDomClient as unknown as { createRoot: (el: Element) => { render: (node: unknown) => void } }
const act = (React as unknown as { act: (fn: () => Promise<void>) => Promise<void> }).act

const OPTIONS = [
  { id: 'standard', trust: 'system', name: '标准模式', description: '写代码、跑命令、改文件。' },
  { id: 'minimal', trust: 'system', name: '极简模式', description: '只给结论，过程从简。' },
  { id: 'plain', trust: 'user', name: '无描述模式' },
]
const modeState = { options: OPTIONS, busy: false, error: null }
const sessionsState = { current: 's1', byId: { s1: { running: false, projectionValues: { agentPreset: 'standard' } } } }
const container = document.createElement('div')
document.body.append(container)
const root = createRoot(container)
const Component = registrations[0]?.component as (props: Record<string, unknown>) => unknown
const selected: string[] = []

await act(async () => {
  root.render(React.createElement(Component as never, {
    sessionId: 's1',
    useSessions: (select: (state: unknown) => unknown) => select(sessionsState),
    useModeSwitch: (select: (state: unknown) => unknown) => select(modeState),
    load: async () => undefined,
    select: async (id: string) => { selected.push(id) },
  }))
})

const seat = document.querySelector('.jx-ms-seat')
record('药丸带 jx-ms-seat 类', seat !== null)
record('外层壳带 jx-ms-anchor 类', document.querySelector('.jx-ms-anchor') !== null)
record('药丸有无障碍名与菜单语义', seat?.getAttribute('aria-label') === '切换工作模式，当前 标准模式'
  && seat?.getAttribute('aria-haspopup') === 'menu' && seat?.getAttribute('aria-expanded') === 'false')
record('药丸显示当前预设名', text(seat?.querySelector('.jx-ms-seat-label') ?? null) === '标准模式')
record('药丸是 图标 + 名称 + 箭头 三件套', seat?.children.length === 3
  && seat?.children[0]?.getAttribute('class') === 'jx-ms-seat-icon'
  && seat?.children[2]?.getAttribute('class') === 'jx-ms-chevron')

const rows = (): NodeListOf<Element> => document.querySelectorAll('[data-row]')
record('未展开时没有菜单行', rows().length === 0)

await act(async () => {
  (seat as HTMLElement).dispatchEvent(new (window.MouseEvent as new (type: string, init: { bubbles: boolean }) => Event)('click', { bubbles: true }))
})
record('点击后展开菜单', rows().length === OPTIONS.length)
record('展开时药丸标注 aria-expanded', seat?.getAttribute('aria-expanded') === 'true')
record('展开时箭头翻转', seat?.children[2]?.getAttribute('class') === 'jx-ms-chevron jx-ms-chevron-open')

const firstRow = document.querySelector('[data-row="standard"]')
record('菜单行名称独立成行', text(firstRow?.querySelector('.jx-ms-item-name') ?? null) === '标准模式')
record('菜单行描述是灰色小字副标题', text(firstRow?.querySelector('.jx-ms-item-desc') ?? null) === '写代码、跑命令、改文件。')
record('行文本不再是「名称 — 描述」长串', !text(firstRow).includes('—'))
const plainRow = document.querySelector('[data-row="plain"]')
record('没有描述的预设只有名称一行', plainRow?.querySelector('.jx-ms-item-desc') === null
  && plainRow?.querySelector('.jx-ms-item')?.children.length === 1
  && firstRow?.querySelector('.jx-ms-item')?.children.length === 2)

await act(async () => {
  (document.querySelector('[data-row="minimal"]') as HTMLElement)
    .dispatchEvent(new (window.MouseEvent as new (type: string, init: { bubbles: boolean }) => Event)('click', { bubbles: true }))
})
record('选中行把 id 交给宿主强切', selected.length === 1 && selected[0] === 'minimal')

await act(async () => { await (dispose as () => Promise<void>)() })
record('卸载后样式表被撤掉', document.head.querySelector('style[data-jx-mode-switch="seat"]') === null)
record('样式 effect 只有一个', styleEffects.length === 1)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
console.log(`\n共 ${checks.length} 项，通过 ${checks.length - failed} 项，失败 ${failed} 项。`)
process.exit(failed === 0 ? 0 : 1)
