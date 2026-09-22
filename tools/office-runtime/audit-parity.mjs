// 桌面端 vs 源码检出：能力包全量对比。
//
// 病根：profile 的 node_modules 是 pnpm hoisted 池，工作区包需被链接进去才能按包名解析。
// 上游给 bundle 加了行、或发布新的可选包，而池没同步时，这些行在运行时
// 解析失败并被静默跳过——不报错，能力直接消失。这就是"桌面端有、源码版没有"。
//
// 本脚本给出全量差异，而不是逐个举例。
import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const POOL = join(REPO, 'dsh-home', 'profiles', 'node_modules')
const PROFILE = join(REPO, 'dsh-home', 'profiles', 'web')

/** 遍历 packages 下的分组成员，收集每个工作区包。 */
function workspacePackages() {
  const packages = []
  const root = join(REPO, 'packages')
  for (const group of readdirSync(root)) {
    const groupDirectory = join(root, group)
    if (!lstatSync(groupDirectory).isDirectory()) continue
    for (const entry of readdirSync(groupDirectory)) {
      const directory = join(groupDirectory, entry)
      const manifest = join(directory, 'package.json')
      if (!existsSync(manifest)) continue
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
        if (typeof parsed.name === 'string') {
          packages.push({ name: parsed.name, directory, private: parsed.private === true })
        }
      } catch { /* 非包目录跳过 */ }
    }
  }
  return packages
}

const require = createRequire(join(PROFILE, 'cordis.yml'))

/** 逐行提取组合里的模块标识。 */
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
  return names
}

const packages = workspacePackages()
const mounted = compositionNames()
const inPool = (name) => existsSync(join(POOL, name))
const resolves = (name) => { try { require.resolve(name); return true } catch { return false } }

let missingPublic = 0
let missingPrivate = 0
const unlinkedPrivate = []
const unlinkedPublic = []

for (const entry of packages.sort((a, b) => a.name.localeCompare(b.name))) {
  if (inPool(entry.name) || resolves(entry.name)) continue
  if (entry.private) { missingPrivate++; unlinkedPrivate.push(entry); continue }
  missingPublic++
  unlinkedPublic.push(entry)
}

console.log(`未链接进池的【公开包】：${missingPublic}`)
console.log(`未链接进池的【private 包】：${missingPrivate}`)
if (unlinkedPublic.length > 0) {
  console.log('\n未链接的公开包（启用时会静默失效）：')
  for (const entry of unlinkedPublic) {
    // 该包是否被某个组合引用，决定它"已经在用却没生效"还是"纯选装未启用"。
    const used = mounted.has(entry.name) ? '组合已引用' : '未引用（选装）'
    console.log(`  ${entry.name.padEnd(56)} ${used}`)
  }
}
if (unlinkedPrivate.length > 0) {
  console.log('\nprivate 包（不对外发布，自建桌面端时由打包流程从工作区收进核心包集）：')
  for (const entry of unlinkedPrivate) console.log(`  ${entry.name.padEnd(48)} ${entry.directory.slice(REPO.length + 1)}`)
}

// 组合里引用了、但池里解析不到的包——这一类才是"静默失效"。
const broken = [...mounted].filter((name) => !inPool(name) && !resolves(name))
console.log(`\n组合引用了但解析不到的包：${broken.length}`)
for (const name of broken.sort()) console.log(`  ${name}`)
if (broken.length === 0) console.log('  （无——组合里每一行都能装载）')
