#!/usr/bin/env node
/** 用官方仓库自带的 tsdown 构建宿主半边（lib/index.js）与浏览器半边（lib/client.js）。 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const TSDOWN = join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs')

if (!existsSync(TSDOWN)) {
  console.error(`[build] 找不到官方仓库的 tsdown：${TSDOWN}，请先编译官方仓库。`)
  process.exit(1)
}

// 构建期解析依赖：把 .pnpm 仓库里的 zod 链进本包（幂等，仅构建用）。
const pnpmStore = join(ROOT, 'node_modules', '.pnpm')
const zodDir = readdirSync(pnpmStore).find(name => /^zod@\d/.test(name))
if (zodDir !== undefined) {
  const localModules = join(PKG_DIR, 'node_modules')
  const linkPath = join(localModules, 'zod')
  if (!existsSync(linkPath)) {
    mkdirSync(localModules, { recursive: true })
    symlinkSync(join(pnpmStore, zodDir, 'node_modules', 'zod'), linkPath, 'junction')
  }
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

console.log('[build] dsh-fulltext-search 构建完成：lib/index.js + lib/client.js')
