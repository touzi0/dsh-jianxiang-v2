// 审计：profile 组合里引用的每个包名，是否都能从该 profile 解析到。
// 不能解析的条目在运行时被静默跳过，能力因此整体消失。
// cordis.yml 使用 !!js 求值标签，通用 YAML 解析器读不到内容，故按行扫描。
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const profileDirectory = join(REPO, 'dsh-home', 'profiles', 'web')
const require = createRequire(join(profileDirectory, 'cordis.yml'))

/** 逐行提取 `name:` 值；profile 的 name 均为单行字面量。 */
function pluginNames(path) {
  const names = []
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*-?\s*name:\s*(.+?)\s*$/u.exec(line)
    if (match === null) continue
    let value = match[1]
    // 折叠/字面块标量（`>-`、`|`）不是模块标识，也没有同行取值。
    if (/^[>|][+-]?\d*$/u.test(value)) continue
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    if (value !== '') names.push(value)
  }
  return names
}

const sources = [
  join(REPO, 'packages', 'bundle', 'base', 'cordis.patch.yml'),
  join(REPO, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'),
  join(profileDirectory, 'cordis.yml'),
  join(profileDirectory, 'cordis.patch.yml'),
  join(REPO, 'dsh-home', 'cordis.patch.yml'),
].filter((path) => existsSync(path))

const missing = new Set()
const local = new Set()
const ok = new Set()
for (const source of sources) {
  for (const name of pluginNames(source)) {
    if (name.startsWith('file:')) { ok.add(name); continue }
    if (name.startsWith('.') || name.startsWith('/')) { local.add(name); continue }
    try {
      require.resolve(name)
      ok.add(name)
    } catch {
      missing.add(name)
    }
  }
}

console.log('扫描文件：')
for (const source of sources) console.log(`  ${source.slice(REPO.length + 1)}`)
console.log(`\n可解析包名 ${ok.size} 个；本地相对/绝对路径 ${local.size} 个；无法解析 ${missing.size} 个`)
if (missing.size > 0) {
  console.log('\n无法解析（运行时静默跳过）：')
  for (const name of [...missing].sort()) console.log(`  ${name}`)
}
