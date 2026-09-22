// 修复 profile 解析池：cordis.yml 引用但池中缺失的包，按池现有的链接形态补上。
//
// 背景：profile 的 node_modules 是 pnpm hoisted 布局——工作区包软链到 packages/，
// 外部包软链到根 .pnpm。上游给 web-app bundle 加了新插件（office-to-pdf、
// 侧栏终端/浏览器等）而池未同步时，这些行在运行时按包名解析失败并被静默跳过，
// 能力整体消失且没有任何报错。本脚本只补链接，不改动已有条目。
//
// 用法：
//   node tools/office-runtime/repair-profile-pool.mjs            # 仅报告
//   node tools/office-runtime/repair-profile-pool.mjs --fix      # 建立缺失链接
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, lstatSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const PROFILE = join(REPO, 'dsh-home', 'profiles', 'web')
const POOL = join(REPO, 'dsh-home', 'profiles', 'node_modules')
const VIRTUAL_STORE = join(REPO, 'node_modules', '.pnpm')
const FIX = process.argv.includes('--fix')

/**
 * 池中缺失的包一律补链接：组合引用的（否则该行静默失效），
 * 以及工作区里所有公开包（否则用户启用选装能力时静默失效）。
 * private 包不进池：它们不对外发布，由桌面端打包流程从工作区收进核心包集。
 */
function referencedNames() {
  const names = new Set()
  for (const name of compositionNames()) names.add(name)
  for (const { name, private: isPrivate } of workspacePackages()) {
    if (!isPrivate) names.add(name)
  }
  return names
}

/** 扫描 profile 组合引用的模块标识；!!js 标签使通用 YAML 解析不可用，故按行读取。 */
function compositionNames() {
  const sources = [
    join(REPO, 'packages', 'bundle', 'base', 'cordis.patch.yml'),
    join(REPO, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'),
    join(PROFILE, 'cordis.yml'),
    join(PROFILE, 'cordis.patch.yml'),
    join(REPO, 'dsh-home', 'cordis.patch.yml'),
  ]
  const names = new Set()
  for (const source of sources) {
    if (!existsSync(source)) continue
    for (const line of readFileSync(source, 'utf8').split(/\r?\n/u)) {
      const match = /^\s*-?\s*name:\s*(.+?)\s*$/u.exec(line)
      if (match === null) continue
      let value = match[1]
      if (/^[>|][+-]?\d*$/u.test(value)) continue
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1)
      }
      if (value !== '' && !value.startsWith('.') && !value.startsWith('/') && !value.startsWith('file:')) names.add(value)
    }
  }
  // 组合之外的可选能力由 referencedNames 从工作区公开包补齐；
  // 这里只负责组合本身引用的标识。
  return names
}

/** 遍历 packages 下的分组成员，返回工作区包名与其源码目录。 */
function workspacePackages() {
  const found = []
  const packagesRoot = join(REPO, 'packages')
  for (const group of readdirSync(packagesRoot)) {
    const groupDirectory = join(packagesRoot, group)
    if (!lstatSync(groupDirectory).isDirectory()) continue
    for (const name of readdirSync(groupDirectory)) {
      const directory = join(groupDirectory, name)
      const manifest = join(directory, 'package.json')
      if (!existsSync(manifest)) continue
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
        if (typeof parsed.name === 'string') found.push({ name: parsed.name, directory, private: parsed.private === true })
      } catch { /* 非包目录跳过 */ }
    }
  }
  return found
}

/** 在根 .pnpm 中定位外部包的实际安装目录，键为 <名字>@<版本> 形式的目录名。 */
function virtualStoreDirectories() {
  const directories = new Map()
  if (!existsSync(VIRTUAL_STORE)) return directories
  for (const entry of readdirSync(VIRTUAL_STORE)) {
    if (entry.startsWith('.')) continue
    const marker = entry.lastIndexOf('@')
    const split = entry.startsWith('@') ? entry.indexOf('@', 1) : marker
    if (split <= 0) continue
    const name = entry.slice(0, split)
    const target = join(VIRTUAL_STORE, entry, 'node_modules', name)
    if (existsSync(target) && !directories.has(name)) directories.set(name, target)
  }
  return directories
}

const require = createRequire(join(PROFILE, 'cordis.yml'))
const workspace = new Map(workspacePackages().map((entry) => [entry.name, entry.directory]))
const virtualStore = virtualStoreDirectories()

const report = { present: [], linked: [], unavailable: [] }
for (const name of [...referencedNames()].sort()) {
  const link = join(POOL, name)
  if (existsSync(link)) { report.present.push(name); continue }
  const source = workspace.get(name) ?? virtualStore.get(name)
  if (source === undefined) {
    // require.resolve 能命中的（例如 package.json exports 子路径）也算可用。
    try { require.resolve(name); report.present.push(name); continue } catch { /* 确实不可达 */ }
    report.unavailable.push(name)
    continue
  }
  if (!FIX) { report.linked.push(`${name}  <-  ${source.slice(REPO.length + 1)}`); continue }
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(source, link, 'junction')
  report.linked.push(`${name}  <-  ${source.slice(REPO.length + 1)}`)
}

console.log(`模式：${FIX ? '修复' : '仅报告'}`)
console.log(`已可解析 ${report.present.length} 个`)
console.log(`缺失 ${report.linked.length + report.unavailable.length} 个`)
if (report.linked.length > 0) {
  console.log(`\n${FIX ? '已补链接' : '可补链接'}：`)
  for (const line of report.linked) console.log(`  ${line}`)
}
if (report.unavailable.length > 0) {
  console.log('\n本机无法补（源码与 .pnpm 均无）：')
  for (const name of report.unavailable) console.log(`  ${name}`)
}
