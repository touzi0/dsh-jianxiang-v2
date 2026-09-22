/**
 * 浏览器半边自测：把已构建的 `lib/client.js` 当模块工厂加载，在真 jsdom + 真 React
 * 里跑通「按钮 → 确认框 → 调宿主 → 成功/失败文案」整条链路，断言：
 *   - 产物用 __ModuleLoader__ 注册 id=dsh-manual-compact 的 bundle；
 *   - apply() 挂载 jxManualCompact Remote（compact 描述符带 3 个参数）；
 *   - 向 conversation.chat.assistant-actions 注册了 id=jx-manual-compact、order=20 的条目；
 *   - 渲染条目组件：按钮出现；点击弹确认框（写明「第 3 轮」）；确认后 compact 以
 *     (sessionId, turn, anchorSeq) 被调用且成功文案出现；失败时错误文案留在框里；
 *   - 卸载时注入的样式被清掉。
 * 跑法：`node selftest-client.mjs`（真 React/jsdom 从仓库 .pnpm 取，与 dsh-digital-assistant 的自测同一套做法）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const PNPM = join(ROOT, 'node_modules', '.pnpm')

/** 在 .pnpm 里按目录名前缀取包的安装目录。 */
function pnpmDir(prefix) {
  const dir = readdirSync(PNPM).find(entry => new RegExp(`^${prefix.replace('/', '+')}@\\d`).test(entry))
    ?? readdirSync(PNPM).find(entry => new RegExp(`^${prefix}@\\d`).test(entry))
  if (dir === undefined) throw new Error(`找不到 ${prefix}：${PNPM}`)
  return join(PNPM, dir, 'node_modules', ...prefix.split('/'))
}

/** 加载一个 CJS 文件并返回 module.exports。 */
async function loadCjs(path) {
  const loaded = await import(pathToFileURL(path).href)
  return loaded.default ?? loaded
}

/** 按包自身 package.json 的 main 字段加载整个包。 */
async function loadPackage(packageDir) {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  return loadCjs(join(packageDir, manifest.main ?? 'index.js'))
}

const reactDir = pnpmDir('react')
const React = await loadPackage(reactDir)
const jsxRuntime = await loadCjs(join(reactDir, 'jsx-runtime.js'))
const reactDomDir = pnpmDir('react-dom')
const ReactDOMClient = await loadCjs(join(reactDomDir, 'client.js'))
const jsdomModule = await loadPackage(pnpmDir('jsdom'))

// ---- jsdom 环境（bundle 里的 document / window 都是全局引用）----
const { JSDOM } = jsdomModule
const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const win = dom.window
;(globalThis).window = win
;(globalThis).document = win.document
if (win.requestAnimationFrame === undefined) {
  win.requestAnimationFrame = cb => globalThis.setTimeout(cb, 0)
}

const flush = (ms = 30) => new Promise(resolvePromise => globalThis.setTimeout(resolvePromise, ms))

/** __ModuleLoader__ 捕获到的 bundle 条目（id + factory）。 */
const loaded = []
win.__ModuleLoader__ = { load: entry => { loaded.push(entry) } }
await import('./lib/client.js')

const checks = []
const record = (label, ok) => { checks.push([label, ok]) }

record('产物用 __ModuleLoader__ 注册了一个 bundle', loaded.length === 1 && loaded[0]?.id === 'dsh-manual-compact')
const entry = loaded[0]

// ---- 基线模块 stub（官方组件在 jsdom 里难以hover，用行为等价的薄壳）----
const fakeRequire = (specifier) => {
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return {
      IconCompactOutline16: props => React.createElement('svg', props),
      Tooltip: ({ children }) => children,
      Modal: ({ open, title, description, children, footer }) => {
        if (!open) return null
        return React.createElement('div', { role: 'dialog' },
          React.createElement('h2', null, title),
          description !== undefined ? React.createElement('p', { 'data-description': true }, description) : null,
          children,
          footer,
        )
      },
      Button: ({ onClick, disabled, variant, children }) => React.createElement(
        'button',
        { onClick, disabled, 'data-variant': variant },
        children,
      ),
    }
  }
  throw new Error(`客户端半边请求了预期外的模块：${specifier}`)
}

let moduleExports
try {
  moduleExports = entry?.factory(fakeRequire)
  record('工厂执行成功', moduleExports !== undefined)
} catch (error) {
  record(`工厂执行成功（${String(error)}）`, false)
}

// ---- 假客户端 ctx ----
const mounts = []
const registrations = []
const fakeCtx = {
  remote: {
    $mount: async remote => {
      mounts.push(remote)
      return async () => undefined
    },
  },
  plugin: definition => {
    definition.apply({
      effect: fn => { fn(); return () => undefined },
      locale: {
        register: () => undefined,
        bind: () => (key, params) => params === undefined ? key : `${key}${JSON.stringify(params)}`,
      },
      remote: { jxManualCompact: { compact: async () => ({ ok: true, value: { shadowedCount: 1, shadowedTokens: 1, summaryChars: 1 } }) } },
      slots: {
        inject: (slot, factory) => { factory() },
        register: (options, component) => {
          registrations.push({ slot: options.name, options, component })
          return { dispose: () => undefined }
        },
      },
    })
    return async () => undefined
  },
}

const dispose = await moduleExports.apply(fakeCtx)
record('apply() 返回清理函数', typeof dispose === 'function')
record('挂了 jxManualCompact Remote（compact 描述符、3 个参数）', mounts.length === 1
  && mounts[0].descriptors.some(item => item.service === 'jxManualCompact'
    && item.method === 'compact'
    && item.parameters.length === 3
    && item.parameters.map(parameter => parameter.name).join(',') === 'sessionId,turn,anchorSeq'))

const entryRegistration = registrations.find(item => item.slot === 'conversation.chat.assistant-actions')
record('注册了 assistant-actions 条目（id/order 正确）', entryRegistration !== undefined
  && entryRegistration.options.id === 'jx-manual-compact'
  && entryRegistration.options.order === 20)

// ---- 渲染条目组件：按钮 → 确认框 → 调宿主 → 成功文案 ----
const container = win.document.createElement('div')
win.document.body.append(container)
const root = ReactDOMClient.createRoot(container)

const calls = []
const t = (key, params) => (params === undefined ? key : `${key}${JSON.stringify(params)}`)
const props = {
  messageId: 'msg-3',
  sessionId: 'session-x',
  useChat: selector => selector({
    nodes: {
      values: () => [{
        kind: 'assistant',
        anchorSeq: 42,
        data: { turn: 3, finalNode: { seq: 42, messageId: 'msg-3' } },
      }],
    },
  }),
  compact: async (sessionId, turn, anchorSeq) => {
    calls.push({ sessionId, turn, anchorSeq })
    return calls.length === 1
      ? { ok: true, value: { shadowedCount: 9, shadowedTokens: 12345, summaryChars: 678 } }
      : { ok: false, error: { code: 'busy', message: '会话正在运行（测试注入）' } }
  },
  t,
}
root.render(React.createElement(entryRegistration.component, props))
await flush()

const button = () => container.querySelector('button.jx-manual-compact-action')
record('按钮渲染在按钮行（aria-label=action）', button() !== null && button().getAttribute('aria-label') === 'action')

button()?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await flush()
record('点击后出现确认框（写明第 3 轮）', container.textContent.includes('dialogTitle')
  && container.textContent.includes(`dialogBody${JSON.stringify({ turn: 3 })}`))

const confirmButton = [...container.querySelectorAll('button')].find(item => item.textContent === 'confirm')
confirmButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await flush()
record('确认后 compact 以 (sessionId, turn, anchorSeq) 被调用', calls.length === 1
  && calls[0].sessionId === 'session-x' && calls[0].turn === 3 && calls[0].anchorSeq === 42)
record('成功文案出现（数字回包）', container.textContent.includes(`done${JSON.stringify({ count: 9, tokens: 12345, chars: 678 })}`))

const closeButton = [...container.querySelectorAll('button')].find(item => item.textContent === 'close')
closeButton?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await flush()

// ---- 失败路径：错误文案留在框里，不静默 ----
button()?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await flush()
const confirmAgain = [...container.querySelectorAll('button')].find(item => item.textContent === 'confirm')
confirmAgain?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
await flush()
record('失败时错误原因显示在对话框里', calls.length === 2
  && container.textContent.includes('failed')
  && container.textContent.includes('会话正在运行（测试注入）'))

root.unmount()
await dispose()
record('卸载后注入的样式被清掉', win.document.getElementById('jx-manual-compact-style') === null)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `${failed}/${checks.length} 项失败`)
if (failed > 0) {
  console.log('---- 渲染后的 DOM ----')
  console.log(container.innerHTML.slice(0, 800))
  process.exitCode = 1
}
