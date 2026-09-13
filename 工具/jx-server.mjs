#!/usr/bin/env node
/**
 * 坚祥服务启动包装：由 启动坚祥.bat 在服务窗口里调用。
 * 在这里设置 DSH_HOME 与 --patch 参数，避免 bat 内引号嵌套问题。
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const child = spawn(process.execPath, [
  join('apps', 'cli', 'lib', 'bin.js'),
  'web',
  '--patch', join('插件', '.jx-mods.patch.yml'),
], {
  cwd: ROOT,
  env: { ...process.env, DSH_HOME: join(ROOT, 'dsh-home') },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal !== null) return
  process.exit(code ?? 0)
})
