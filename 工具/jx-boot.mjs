#!/usr/bin/env node
/**
 * 坚祥启动前脚本（幂等，每次启动前由 启动坚祥.bat 调用）：
 *   1. 确保目录结构存在（插件\、dsh-home\）
 *   2. 为 插件\ 下声明了宿主 peerDependencies 的模组建立 node_modules junction，
 *      指向 dsh-home\profiles\node_modules 愈合池（保证 cordis 等宿主包全局单例）
 *   3. 预生成模组补丁层 插件\.jx-mods.patch.yml：直接导入 dsh-mod-manager 的
 *      lib/mods.js（纯 Node 无宿主依赖，无需 junction 即可导入），与运行期同一
 *      份逻辑（listMods/renderPatch 的单一事实源，含 jx.config 与 replaces 去重）
 *   4. 确保 dsh-home\cordis.patch.yml 里存在 dsh-mod-manager 的自举插入行
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const TOOL_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(TOOL_DIR, '..')
const MODS_ROOT = join(ROOT, '插件')
const DSH_HOME = join(ROOT, 'dsh-home')
const HEALED_POOL = join(DSH_HOME, 'profiles', 'node_modules')
const HOME_PATCH = join(DSH_HOME, 'cordis.patch.yml')
const MODS_PATCH = join(MODS_ROOT, '.jx-mods.patch.yml')
const MANAGER_ID = 'jx-mod-manager'
const MANAGER_ENTRY = '插件/dsh-mod-manager/lib/index.js'
const MANAGER_MODS_LIB = join(MODS_ROOT, 'dsh-mod-manager', 'lib', 'mods.js')

/** peer 依赖里需要链接到愈合池的包名模式（宿主闭包内的包）。 */
const HOST_PEER = /^@(?:deepseek-ai|cordisjs)\//

mkdirSync(DSH_HOME, { recursive: true })
mkdirSync(MODS_ROOT, { recursive: true })

let linked = 0
if (!existsSync(HEALED_POOL)) {
  console.log('[jx-boot] 首次启动：宿主包愈合池尚未生成，将创建悬空链接，本次启动过程中自动接通。')
}
for (const name of readdirSync(MODS_ROOT)) {
  const modDir = join(MODS_ROOT, name)
  if (name.startsWith('.') || name === 'node_modules' || !statSync(modDir).isDirectory()) continue
  const pkgPath = join(modDir, 'package.json')
  if (!existsSync(pkgPath)) continue
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const peers = Object.keys(pkg.peerDependencies ?? {})
  const hostPeers = peers.filter(dep => HOST_PEER.test(dep))
  if (hostPeers.length === 0) continue
  const modModules = join(modDir, 'node_modules')
  for (const scope of new Set(hostPeers.map(dep => dep.split('/')[0]))) {
    mkdirSync(join(modModules, scope), { recursive: true })
  }
  for (const dep of hostPeers) {
    const linkPath = join(modModules, dep)
    // lstat 判断链接本体是否存在（悬空 junction 的 lstat 也成功）；existsSync
    // 跟随链接判断目标是否可达——安装目录改名/移动后目标悬空，删除重建指向
    // 新路径下的愈合池。愈合池暂未生成时的悬空（lstat 无）按原样创建。
    let linkExists = true
    try { lstatSync(linkPath) } catch { linkExists = false }
    if (linkExists) {
      if (existsSync(linkPath)) continue
      try { rmSync(linkPath, { recursive: true, force: true }) } catch { /* 被占用时下次启动再修 */ }
      linked++
      continue
    }
    // 悬空 junction 是合法的：启动序列里愈合池先于插件挂载生成，挂载时链接已可用。
    symlinkSync(join(HEALED_POOL, dep), linkPath, 'junction')
    linked++
  }
  const missing = hostPeers.filter(dep => !existsSync(join(HEALED_POOL, dep)))
  if (missing.length > 0) {
    console.log(`[jx-boot] 提示：${name} 的 peer 依赖暂不在愈合池中（悬空，启动后如仍缺失则该包不被宿主闭包引用）：${missing.join(', ')}`)
  }
}

// ---- 预生成模组补丁层 -------------------------------------------------
// 用管理器自己的 lib/mods.js（单一事实源）：增删模组文件夹、jx.config 变更、
// 开关状态变化都在下一次启动前生效，不再有补丁滞后问题。
writeFileSync(MODS_PATCH, '[]\n', 'utf8')
if (existsSync(MANAGER_MODS_LIB)) {
  try {
    const modsLib = await import(pathToFileURL(MANAGER_MODS_LIB).href)
    modsLib.regeneratePatch(modsLib.listMods())
  } catch (error) {
    console.log(`[jx-boot] 补丁预生成失败（保留空层）：${String(error).slice(0, 200)}`)
  }
} else {
  console.log('[jx-boot] dsh-mod-manager 尚未构建，补丁层置空。')
}

const entryFile = join(ROOT, MANAGER_ENTRY).replaceAll('\\', '/')
const bootstrapBlock = [
  `# 坚祥自举层（由 工具\\jx-boot.mjs 维护，请勿手工删除；其余内容可自由编辑）`,
  `- insert:`,
  `  - id: ${MANAGER_ID}`,
  `    name: '${entryFile}'`,
].join('\n')

if (!existsSync(HOME_PATCH)) {
  writeFileSync(HOME_PATCH, `${bootstrapBlock}\n`, 'utf8')
  console.log('[jx-boot] 已创建 home 级补丁层并写入模组管理器自举行。')
} else {
  const lines = readFileSync(HOME_PATCH, 'utf8').split('\n')
  const idIndex = lines.findIndex(line => line.trim() === `- id: ${MANAGER_ID}`)
  const namePrefix = '    name: '
  if (idIndex === -1) {
    const separator = lines.at(-1) === '' ? '' : '\n'
    writeFileSync(HOME_PATCH, `${lines.join('\n')}${separator}\n${bootstrapBlock}\n`, 'utf8')
    console.log('[jx-boot] 已在 home 级补丁层追加模组管理器自举行。')
  } else {
    const nameIndex = lines.findIndex((line, index) => index > idIndex && index <= idIndex + 2 && line.trim().startsWith('name:'))
    const wanted = `${namePrefix}'${entryFile}'`
    if (nameIndex !== -1 && lines[nameIndex].trim() !== wanted.trim()) {
      // 整个安装目录被移动后，自举行里的绝对路径会过期：原地改写为当前路径。
      lines[nameIndex] = wanted
      writeFileSync(HOME_PATCH, `${lines.join('\n')}\n`, 'utf8')
      console.log('[jx-boot] 已修正模组管理器自举行的入口路径（安装目录移动过）。')
    }
  }
}

console.log(`[jx-boot] 完成：链接 ${linked} 个依赖；DSH_HOME = ${DSH_HOME}`)
