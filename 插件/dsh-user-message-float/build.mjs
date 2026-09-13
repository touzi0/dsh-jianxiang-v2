#!/usr/bin/env node
/** 用官方仓库自带 tsdown 构建浏览器半边（官方 client bundle 工厂格式）。 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const TSDOWN = join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs')

if (!existsSync(TSDOWN)) {
  console.error(`[build] 找不到官方仓库的 tsdown：${TSDOWN}`)
  process.exit(1)
}

rmSync(join(PKG_DIR, 'lib'), { recursive: true, force: true })
mkdirSync(join(PKG_DIR, 'lib'), { recursive: true })

const result = spawnSync(process.execPath, [TSDOWN, '--config', join(PKG_DIR, 'tsdown.client.ts')], {
  cwd: PKG_DIR,
  stdio: 'inherit',
})
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('[build] dsh-user-message-float 构建完成：lib/client.js')
