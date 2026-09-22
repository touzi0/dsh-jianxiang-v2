/**
 * 「新工作任务」文案模组自测：把已构建的 `lib/client.js` 当模块工厂加载，喂假 locale
 * 服务跑 `apply()`，断言它只通过官方 locale 机制（addLanguage + register + setLocale）
 * 生效，且词典键与官方键一一对应。
 * 跑法：`node selftest-locale.mts`。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))

interface LoaderEntry {
  id: string
  factory: (require: (spec: string) => unknown) => {
    inject?: readonly string[]
    apply?: (ctx: unknown) => unknown
  }
}

// ---- jsdom-free 的最小 window/localStorage 替身（本模组不碰 DOM） ----
const store = new Map<string, string>()
const fakeWindow: Record<string, unknown> = {
  localStorage: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  },
}
;(globalThis as unknown as { window: unknown }).window = fakeWindow

const loaded: LoaderEntry[] = []
;(fakeWindow as { __ModuleLoader__?: unknown }).__ModuleLoader__ = {
  load: (entry: LoaderEntry) => { loaded.push(entry) },
}

await import(pathToFileURL(join(PKG_DIR, 'lib/client.js')).href)

const checks: [string, boolean][] = []
const record = (label: string, ok: boolean): void => { checks.push([label, ok]) }

record('产物用 __ModuleLoader__ 注册了一个 bundle', loaded.length === 1)
const entry = loaded[0]
record('bundle id 正确', entry?.id === 'dsh-new-task-label')
const mod = entry!.factory(() => { throw new Error('本模组不应 require 任何模块') })
record('依赖声明只有 locale', JSON.stringify(mod.inject) === JSON.stringify(['locale']))

// ---- 假 locale 服务 ----
interface Call { kind: 'language' | 'dict' | 'set' }
const calls: Call[] = []
const dicts = new Map<string, Record<string, string>>()
let locales = [{ id: 'zh' }, { id: 'en' }]
const fakeLocale = {
  getLocale: (): { active: string, locales: { id: string }[] } => ({ active: 'zh', locales }),
  addLanguage: (input: { id: string, label: string, fallback: string }): (() => void) => {
    calls.push({ kind: 'language' })
    locales = [...locales, { id: input.id }]
    record(`变体语言 ${input.id} 的 fallback 是 ${input.fallback}`, input.fallback === (input.id === 'zh-jx' ? 'zh' : 'en'))
    record(`变体语言 ${input.id} 的显示名非空`, input.label.trim().length > 0)
    return () => {}
  },
  register: (ns: string, localeId: string, dict: Record<string, string>): (() => void) => {
    calls.push({ kind: 'dict' })
    dicts.set(`${ns}/${localeId}`, dict)
    return () => { dicts.delete(`${ns}/${localeId}`) }
  },
  setLocale: (id: string): void => { calls.push({ kind: 'set' }); (fakeLocale as { activeNow?: string }).activeNow = id },
}
const ctx = { locale: fakeLocale }

const cleanup = mod.apply!(ctx) as () => void
record('apply 返回了卸载函数', typeof cleanup === 'function')

record('注册了 2 个变体语言（zh-jx / en-jx）',
  calls.filter(c => c.kind === 'language').length === 2)
record('注册了 4 份词典（2 ns × 2 locale）',
  calls.filter(c => c.kind === 'dict').length === 4)
record('当前语言是中文 → 一次性迁移到 zh-jx',
  calls.some(c => c.kind === 'set' && (fakeLocale as { activeNow?: string }).activeNow === 'zh-jx'))
record('迁移记号已写入 localStorage', store.get('jx.new-task-label.migrated.v1') === '1')

const sidebarZh = dicts.get('sidebar/zh-jx')
record('sidebar/zh-jx 覆盖 session.new=新工作任务', sidebarZh?.['session.new'] === '新工作任务')
record('sidebar/zh-jx 覆盖 session.new.label=新工作任务', sidebarZh?.['session.new.label'] === '新工作任务')
const sidebarEn = dicts.get('sidebar/en-jx')
record('sidebar/en-jx 覆盖 session.new=New Work Task', sidebarEn?.['session.new'] === 'New Work Task')
const workspaceZh = dicts.get('workspace/zh-jx')
record('workspace/zh-jx 覆盖 session.new=新工作任务', workspaceZh?.['session.new'] === '新工作任务')
record('workspace/zh-jx 的 aria 保留 {name} 占位符',
  workspaceZh?.['actions.newSession.aria']?.includes('{name}') === true)
record('workspace/en-jx 覆盖 session.new=New Work Task', dicts.get('workspace/en-jx')?.['session.new'] === 'New Work Task')
record('词典没有夹带官方键之外的键',
  [...dicts.values()].every(dict => Object.keys(dict).every(key =>
    ['session.new', 'session.new.label', 'actions.newSession.aria'].includes(key))))

// 重复 apply（模拟重载）：不应抛错、不再迁移。
calls.length = 0
let threw = false
try { mod.apply!(ctx) } catch { threw = true }
record('重复 apply 不抛错', threw === false)
record('重复 apply 不再重复迁移', calls.some(c => c.kind === 'set') === false)

// 卸载：apply 返回的 cleanup 撤下全部词典。
cleanup()
record('卸载后词典全部撤下', dicts.size === 0)

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${label}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 项通过`)
if (failed > 0) process.exit(1)
