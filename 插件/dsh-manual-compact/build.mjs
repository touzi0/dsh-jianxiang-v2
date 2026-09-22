#!/usr/bin/env node
/**
 * 用官方仓库自带的 tsdown 构建宿主半边（lib/index.js）与浏览器半边（lib/client.js）。
 * 不需要独立安装任何依赖（写法同 dsh-mod-manager/build.mjs）。
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const TSDOWN = join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs')

if (!existsSync(TSDOWN)) {
  console.error(`[build] 找不到官方仓库的 tsdown：${TSDOWN}，请先编译官方仓库。`)
  process.exit(1)
}

// 构建期解析依赖：把 .pnpm 仓库里的 zod 链进本包（幂等，仅构建用）；
// 官方 compaction-basic 用 workspace 源码目录直链（构建期要打进产物的
// region.ts 只存在于 checkout 源码里，pnpm 不会为 workspace 包建根链接）。
const pnpmStore = join(ROOT, 'node_modules', '.pnpm')
const localModules = join(PKG_DIR, 'node_modules')
const scopedModules = join(localModules, '@deepseek-ai')

/**
 * 幂等地建一个 junction；链接悬空（本体不存在）时先删再建。
 * @param target - 链接指向的本体。
 * @param linkPath - 链接路径。
 */
function ensureJunction(target, linkPath) {
  let linkExists = true
  try { lstatSync(linkPath) } catch { linkExists = false }
  if (linkExists && existsSync(linkPath)) return
  if (linkExists) rmSync(linkPath, { recursive: true, force: true })
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(target, linkPath, 'junction')
}

const zodDir = readdirSync(pnpmStore).find(name => /^zod@\d/.test(name))
if (zodDir !== undefined) {
  ensureJunction(join(pnpmStore, zodDir, 'node_modules', 'zod'), join(localModules, 'zod'))
}
{
  const compactionBasic = join(ROOT, 'packages', 'compaction', 'compaction-basic')
  if (!existsSync(join(compactionBasic, 'src', 'region.ts'))) {
    console.error(`[build] 找不到官方 compaction-basic 源码：${compactionBasic}，无法构建。`)
    process.exit(1)
  }
  ensureJunction(compactionBasic, join(scopedModules, 'dsh-compaction-basic'))
}

rmSync(join(PKG_DIR, 'lib'), { recursive: true, force: true })
mkdirSync(join(PKG_DIR, 'lib'), { recursive: true })

for (const config of ['tsdown.host.ts', 'tsdown.client.ts']) {
  const result = spawnSync(process.execPath, [TSDOWN, '--config', join(PKG_DIR, config)], {
    cwd: PKG_DIR,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`[build] ${config} 构建失败。`)
    process.exit(result.status ?? 1)
  }
}

// 产物自检：宿主半边必须内联了官方 compactSurfaceRegion（构建期链接检查），
// 客户端半边必须带 __ModuleLoader__ 注册行。
const hostPath = join(PKG_DIR, 'lib', 'index.js')
if (!existsSync(hostPath)) {
  console.error('[build] 宿主半边没有产出 lib/index.js。')
  process.exit(1)
}
const host = readFileSync(hostPath, 'utf8')
if (!host.includes('compaction already in progress') || !host.includes('selected-span')) {
  console.error('[build] 宿主产物里找不到官方压缩事务标记：官方 region.ts 可能没有链接进来，拒绝发布。')
  process.exit(1)
}
const clientPath = join(PKG_DIR, 'lib', 'client.js')
if (!existsSync(clientPath)) {
  console.error('[build] 浏览器半边没有产出 lib/client.js。')
  process.exit(1)
}
const client = readFileSync(clientPath, 'utf8')
if (!client.includes('window.__ModuleLoader__.load')) {
  console.error('[build] 浏览器产物里找不到 __ModuleLoader__ 注册行，拒绝发布。')
  process.exit(1)
}

// 去行尾空白：产物入库，上游 lefthook 的 whitespace 钩子（git diff --check）会拦。
for (const file of ['lib/index.js', 'lib/client.js']) {
  const path = join(PKG_DIR, file)
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  const trimmed = text.replace(/[ \t]+$/gmu, '')
  if (trimmed !== text) writeFileSync(path, trimmed)
}

console.log('[build] dsh-manual-compact 构建完成：lib/index.js + lib/client.js')
