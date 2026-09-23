/**
 * 坚祥模组层桌面引导：随包分发 插件\ 模组目录，启动 Host 前完成
 *   1. 模组宿主 peer 依赖 junction 自愈（指向安装包内置宿主闭包）
 *   2. 通过 dsh-mod-manager 的 lib/mods.js（单一事实源）重生成模组补丁层，
 *      剔除 webserver 监听覆盖（桌面端保持 127.0.0.1 默认），
 *      并确保模组管理器自举插入行存在
 *   3. 产出的补丁文件路径经 DSH_JX_PATCH 传给 Host 的 patchFiles
 * 仅在打包形态（resources\jx-plugins 存在）下生效；开发态原样跳过。
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** peer 依赖里属于宿主闭包、需要链接到内置包池的包名模式。 */
const HOST_PEER = /^@(?:deepseek-ai|cordisjs)\//
const MANAGER_ID = 'jx-mod-manager'

/**
 * 准备坚祥模组层并返回补丁文件路径。
 * @param modsRoot 随包分发的模组目录（resources\jx-plugins）
 * @param hostPool 内置宿主包池（asar 内 dsh\node_modules，Electron 进程可读）
 * @param dshHome 本产品独立数据目录（补丁层落盘处）
 * @returns 补丁文件绝对路径；模组目录缺失时返回 undefined
 */
export async function prepareJxModLayer(modsRoot: string, hostPool: string, dshHome: string): Promise<string | undefined> {
  if (!existsSync(modsRoot)) return undefined
  mkdirSync(dshHome, { recursive: true })

  // ---- junction 自愈（逻辑对齐 工具\jx-boot.mjs）----
  let linked = 0
  for (const name of readdirSync(modsRoot)) {
    const modDir = join(modsRoot, name)
    if (name.startsWith('.') || name === 'node_modules' || !statSync(modDir).isDirectory()) continue
    const pkgPath = join(modDir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { peerDependencies?: Record<string, string> }
    const hostPeers = Object.keys(pkg.peerDependencies ?? {}).filter(dep => HOST_PEER.test(dep))
    if (hostPeers.length === 0) continue
    const modModules = join(modDir, 'node_modules')
    for (const scope of new Set(hostPeers.flatMap(dep => dep.split('/', 1)))) {
      mkdirSync(join(modModules, scope), { recursive: true })
    }
    for (const dep of hostPeers) {
      const linkPath = join(modModules, dep)
      let linkExists = true
      try { lstatSync(linkPath) } catch { linkExists = false }
      if (linkExists) {
        // 安装目录移动后悬空（目标不可达）则删除重建
        if (existsSync(linkPath)) continue
        try { rmSync(linkPath, { recursive: true, force: true }) } catch { continue }
        linked++
      }
      try {
        symlinkSync(join(hostPool, dep), linkPath, 'junction')
        linked++
      } catch (error) {
        console.warn(`[jx-desktop] 无法为 ${name} 创建 ${dep} junction（${String(error)}），该模组可能加载失败`)
      }
    }
  }

  // ---- 重生成模组补丁层（单一事实源：管理器自己的 mods.js）----
  const patchFile = join(dshHome, '.jx-desktop-mods.patch.yml')
  const modsLib = join(modsRoot, 'dsh-mod-manager', 'lib', 'mods.js')
  const fallback: unknown[] = []
  let patch: unknown[] = fallback
  if (existsSync(modsLib)) {
    try {
      const modsLibModule = await import(pathToFileURL(modsLib).href) as {
        listMods: () => unknown[]
        regeneratePatch: (mods: unknown[]) => void
        PATCH_FILE: string
      }
      modsLibModule.regeneratePatch(modsLibModule.listMods())
      patch = JSON.parse(readFileSync(modsLibModule.PATCH_FILE, 'utf8')) as unknown[]
    } catch (error) {
      console.warn(`[jx-desktop] 补丁层重生成失败（使用空层）：${String(error).slice(0, 300)}`)
    }
  }

  // ---- 桌面端适配：剔除 webserver 监听覆盖；相对模组路径改写为包内绝对路径 ----
  const entries = patch.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
  const adapted: Record<string, unknown>[] = []
  for (const entry of entries) {
    if ('id' in entry && entry.id === 'webserver' && !('disabled' in entry) && 'config' in entry) continue
    if ('insert' in entry && Array.isArray(entry.insert)) {
      const rewritten = entry.insert.map(item => {
        if (typeof item !== 'object' || item === null || !('name' in item) || typeof item.name !== 'string') return item
        if (!item.name.startsWith('./')) return item
        return { ...item as Record<string, unknown>, name: join(modsRoot, item.name.slice(2)).replaceAll('\\', '/') }
      })
      adapted.push({ ...entry, insert: rewritten })
      continue
    }
    adapted.push(entry)
  }
  const hasManager = adapted.some(entry => {
    if (!('insert' in entry) || !Array.isArray(entry.insert)) return false
    return entry.insert.some(item => typeof item === 'object' && item !== null && 'id' in item && (item as Record<string, unknown>).id === MANAGER_ID)
  })
  if (!hasManager) {
    const managerEntry = join(modsRoot, 'dsh-mod-manager', 'lib', 'index.js').replaceAll('\\', '/')
    adapted.push({ insert: [{ id: MANAGER_ID, name: managerEntry }] })
  }
  writeFileSync(patchFile, `${JSON.stringify(adapted, null, 2)}\n`, 'utf8')
  console.info(`[jx-desktop] 模组层就绪：junction ${String(linked)} 个；补丁层 ${String(adapted.length)} 条 -> ${patchFile}`)
  return patchFile
}
