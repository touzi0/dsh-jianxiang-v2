/**
 * 宿主半边自测：模拟 jx-boot 的 junction 规则把宿主依赖链进本包，然后真实
 * `import('../lib/index.js')`，断言：
 *   - 模块能加载（外部依赖面与愈合池/jx-boot 的解析一致）；
 *   - 默认导出是网关类，原型上有 typert 的 SRC 标记（method=compact，direct 调用）；
 *   - `describeCompactionError` 把官方 ManualCompactionError 每个 code 都翻成中文；
 *   - 官方 compactSurfaceRegion 事务确实被打包进产物（「压缩复用官方机制」的证据）。
 * 跑法：`node selftest-host.mjs`（不需要服务在跑）。
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const HEALED_POOL = join(ROOT, 'dsh-home', 'profiles', 'node_modules')
const LOCAL_MODULES = join(PKG_DIR, 'node_modules')

/** jx-boot 同款：宿主 peer 依赖链接进本包（悬空自愈，幂等）。 */
function ensurePoolLink(dep) {
  const target = join(HEALED_POOL, dep)
  const linkPath = join(LOCAL_MODULES, dep)
  let linkExists = true
  try { lstatSync(linkPath) } catch { linkExists = false }
  if (linkExists && existsSync(linkPath)) return
  if (linkExists) rmSync(linkPath, { recursive: true, force: true })
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(target, linkPath, 'junction')
}

for (const dep of [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-llm',
]) {
  if (!existsSync(join(HEALED_POOL, dep))) {
    console.error(`[selftest] 愈合池缺 ${dep}；请先用 启动坚祥.bat 跑一遍 jx-boot。`)
    process.exit(1)
  }
  ensurePoolLink(dep)
}

/** 产物里必须出现的官方事务代码指纹。 */
async function readProduction() {
  const { readFileSync } = await import('node:fs')
  return readFileSync(join(PKG_DIR, 'lib', 'index.js'), 'utf8')
}

const checks = []
const record = (label, ok) => { checks.push([label, ok]) }

const host = await readProduction()
record('产物内联了官方压缩事务（compaction 锁检查）', host.includes('compaction already in progress'))
record('产物内联了官方 replace 落盘（surfaceOp replace）', /op:\s*["']replace["']/.test(host))
record('产物内联了官方摘要定位（selected-span 稳定性检查）', host.includes('selected-span'))

let gatewayModule
try {
  gatewayModule = await import(pathToFileURL(join(PKG_DIR, 'lib', 'index.js')).href)
  record('宿主模块加载成功', true)
} catch (error) {
  record(`宿主模块加载成功（${String(error)}）`, false)
  gatewayModule = undefined
}

const Gateway = gatewayModule?.default
record('默认导出是网关类', typeof Gateway === 'function')

const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const marker = Gateway?.prototype?.[REMOTE_METHODS_KEY]
record('原型带 typert SRC 标记', marker?.version === 1
  && Array.isArray(marker?.methods)
  && marker.methods.length === 1
  && marker.methods[0]?.method === 'compact'
  && marker.methods[0]?.invocation?.kind === 'direct')

record('导出 describeCompactionError', typeof gatewayModule?.describeCompactionError === 'function')

// ManualCompactionError 直接从官方包取（与产物同一份实例）。
const { ManualCompactionError } = await import('@deepseek-ai/dsh-compaction')
const describe = gatewayModule?.describeCompactionError
const cases = [
  ['busy', '会话正在运行'],
  ['cancelled', '已取消'],
  ['changed', '发生了变化'],
  ['summary', '压不出更小的摘要'],
  ['commit', '没有干净地完成'],
  ['persistence', '保存失败'],
]
for (const [code, expected] of cases) {
  const text = describe?.(new ManualCompactionError(code, 'raw'))
  record(`错误分类 ${code} → 中文`, typeof text === 'string' && text.includes(expected))
}
record('普通 Error 原样透传', describe?.(new Error('测试消息X')) === '测试消息X')

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
}
console.log(failed === 0 ? `全部通过（${checks.length} 项）` : `${failed}/${checks.length} 项失败`)
if (failed > 0) process.exitCode = 1
