/**
 * 浏览器半边自测：把已构建的 `lib/client.js` 当模块工厂加载，在 **真 jsdom** 里造一个
 * 官方「新建会话」按钮，喂假 ctx 跑 `apply()`，断言：
 *   - 新入口就是克隆官方按钮插在它正下方（同款类名 → 同款样式），图标换成圆脸、文字是「数字助理」；
 *   - 点击它能打开数字助理会话（ensure → openSession）；
 *   - 兜底的面板槽注册仍在，且那行被 CSS 藏起来（避免出现两次）；
 *   - 官方重渲染把它移除后能自己补回来，卸载时清理干净。
 * 跑法：`node selftest-client.mts`（真 React 与 jsdom 从仓库 .pnpm 取，与 dsh-mode-switch 的自测同一套做法）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const PNPM = join(ROOT, 'node_modules', '.pnpm')

/** 在 .pnpm 里按目录名前缀取包的安装目录。 */
function pnpmDir(prefix: string): string {
  const dir = readdirSync(PNPM).find(entry => new RegExp(`^${prefix.replace('/', '+')}@\\d`).test(entry))
    ?? readdirSync(PNPM).find(entry => new RegExp(`^${prefix}@\\d`).test(entry))
  if (dir === undefined) throw new Error(`找不到 ${prefix}：${PNPM}`)
  return join(PNPM, dir, 'node_modules', ...prefix.split('/'))
}

/** 加载一个 CJS 文件并返回 module.exports。 */
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

// ---- jsdom 环境（bundle 里的 document / window / MutationObserver 都是全局引用）----
const { JSDOM } = jsdomModule as unknown as {
  JSDOM: new (html: string, options: { url: string, pretendToBeVisual?: boolean }) => { window: Record<string, unknown> }
}
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const win = dom.window as unknown as {
  document: Document
  MutationObserver: typeof MutationObserver
  requestAnimationFrame?: (cb: () => void) => number
  MouseEvent: typeof MouseEvent
  __ModuleLoader__?: { load: (entry: LoaderEntry) => void }
}
;(globalThis as unknown as { window: unknown }).window = win
;(globalThis as unknown as { document: unknown }).document = win.document
;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = win.MutationObserver
if (win.requestAnimationFrame === undefined) {
  win.requestAnimationFrame = (cb: () => void) => globalThis.setTimeout(cb, 0) as unknown as number
}

interface LoaderEntry {
  id: string
  factory: (require: (spec: string) => unknown) => { apply?: (ctx: unknown) => unknown, inject?: readonly string[] }
}

// ---- 造一个官方「新建会话」按钮（类名形态与官方一致：[hash]_newSession）----
const document = win.document
const official = document.createElement('button')
official.setAttribute('class', 'hb1a2c_newSession')
official.setAttribute('aria-label', '新建会话')
official.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16"></svg><span class="hb1a2c_newSessionLabel">新建会话</span>'
document.body.append(official)

const loaded: LoaderEntry[] = []
win.__ModuleLoader__ = { load: (entry: LoaderEntry) => { loaded.push(entry) } }
await import('./lib/client.js')

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }

record('产物用 __ModuleLoader__ 注册了一个 bundle', loaded.length === 1 && loaded[0]?.id === 'dsh-digital-assistant')
const entry = loaded[0]

const fakeRequire = (specifier: string): unknown => {
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return { IconSparkle16: (props: Record<string, unknown>) => React.createElement('svg', props) }
  }
  throw new Error(`客户端半边请求了预期外的模块：${specifier}`)
}

let moduleExports: { apply?: (ctx: unknown) => unknown, inject?: readonly string[] } | undefined
try {
  moduleExports = entry?.factory(fakeRequire)
} catch (error: unknown) {
  record(`工厂执行（${String(error)}）`, false)
}
record('工厂执行成功', moduleExports !== undefined)

// ---- 假客户端 ctx ----
const mounts: Array<{ descriptors: Array<{ service: string, method: string }> }> = []
const registrations: Array<{ slot: string, options: Record<string, unknown> }> = []
const opened: string[] = []
const jxAssistant = {
  ensure: async () => ({ ok: true, value: { sessionId: 'session-jx-assistant' } }),
  status: async () => ({ ok: true, value: { sessionId: 'session-jx-assistant', cwd: '/w', running: false, dispatched: 0 } }),
}
const uiWorkspace = { openSession: (id: string) => { opened.push(id) } }

const makeChildCtx = (): unknown => ({
  locale: {
    register: () => undefined,
    // 真实环境里这是官方 locale 给的文案；入口与兜底行的文案必须来自同一处，
    // 所以这里也返回真文案（不再让代码去猜 document.lang）。
    bind: (namespace: string) => (key: string) => (key === 'panel' ? '数字助理主对话' : `${namespace}.${key}`),
  },
  remote: { jxAssistant },
  get: (name: string) => (name === 'uiWorkspace' ? uiWorkspace : undefined),
  effect: (fn: () => unknown) => {
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => undefined
  },
  slots: {
    inject: (_slot: string, factory: () => unknown) => { factory() },
    register: (options: Record<string, unknown>) => {
      registrations.push({ slot: String(options.name), options })
      return { dispose: () => undefined }
    },
  },
})

const fakeCtx = {
  remote: {
    $mount: async (remote: { descriptors: Array<{ service: string, method: string }> }) => {
      mounts.push(remote)
      return async () => undefined
    },
    // 刻意**不**提供 jxAssistant：真实环境里它是 $mount 之后才挂上的命名空间，
    // 顶层 ctx 不能把它写进 inject（会与 $mount 互相等待而死锁）。写死在这里，
    // 谁再从顶层取它就会红——真机上曾被这条咬过一次。
  },
  get: (name: string) => (name === 'uiWorkspace' ? uiWorkspace : undefined),
  plugin: (definition: { apply: (ctx: unknown) => void }) => {
    definition.apply(makeChildCtx())
    return async () => undefined
  },
}

const dispose = await (moduleExports?.apply as (ctx: unknown) => Promise<unknown>)(fakeCtx)
record('apply() 返回清理函数', typeof dispose === 'function')
record('$mount 挂了 jxAssistant Remote', mounts.length === 1
  && mounts[0]?.descriptors.some(item => item.service === 'jxAssistant' && item.method === 'ensure'))

// ---- 新入口：克隆官方按钮、插在它下面、图标是圆脸、文字是「数字助理」----
const clone = official.nextElementSibling as HTMLElement | null
record('入口插在「新建会话」正下方', clone !== null && clone.hasAttribute('data-jx-assistant-entry'))
record('入口沿用官方类名（样式与折叠态跟着官方走）', (clone?.getAttribute('class') ?? '').includes('newSession'))
record('入口图标换成了圆脸（data-da-face，默认待机态）', (() => {
  const face = clone?.querySelector('[data-da-face]')
  return face !== null && face.getAttribute('data-state') === 'idle'
})())
record('入口文字是「数字助理主对话」', (clone?.querySelector('span')?.textContent ?? '').trim() === '数字助理主对话')
record('入口 aria-label 正确', clone?.getAttribute('aria-label') === '数字助理主对话')
record('兜底样式已注入（藏掉面板槽那一行）', document.getElementById('jx-digital-assistant-entry-style') !== null)

// ---- 点击入口 → 打开数字助理会话 ----
clone?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await new Promise(resolve => globalThis.setTimeout(resolve, 20))
record('点击入口打开了数字助理会话', opened.length === 1 && opened[0] === 'session-jx-assistant')

// ---- 兜底：面板槽注册仍在（正常路径下被 CSS 隐藏）----
record('仍注册了侧边栏兜底行', registrations.some(item => item.slot === 'sidebar.panellist' && item.options.id === 'digital-assistant'))
record('仍注册了 main 兜底面板', registrations.some(item => item.slot === 'main' && item.options.key === 'digital-assistant'))

// ---- 官方重渲染后能自己补回来 ----
clone?.remove()
document.body.append(document.createElement('div'))
await new Promise(resolve => globalThis.setTimeout(resolve, 40))
record('节点被移除后会自动补回', official.nextElementSibling?.hasAttribute('data-jx-assistant-entry') === true)

// ---- 卸载清理 ----
await (dispose as () => Promise<void>)()
record('卸载后入口与样式都被清掉', document.querySelector('[data-jx-assistant-entry]') === null
  && document.getElementById('jx-digital-assistant-entry-style') === null)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `${failed}/${checks.length} 项失败`)
if (failed > 0) {
  console.log('---- 注入后的 DOM ----')
  console.log(document.body.innerHTML.slice(0, 800))
  process.exitCode = 1
}
