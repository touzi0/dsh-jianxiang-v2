#!/usr/bin/env node
/**
 * 坚祥服务启动包装：由 启动坚祥.bat 在服务窗口里调用。
 * 在这里设置 DSH_HOME 与 --patch 参数，避免 bat 内引号嵌套问题。
 * 另：Git 版 ssh.exe（Cygwin 系）在 DSH 沙箱受限令牌下 CreateFileMapping 崩溃，
 * 把 Windows 原生 OpenSSH 提到 PATH 最前（存在才生效），agent 的 ssh 一律走原生版。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const NATIVE_SSH = 'C:/Windows/System32/OpenSSH/ssh.exe'
const child = spawn(process.execPath, [
  join('apps', 'cli', 'lib', 'bin.js'),
  'web',
  '--patch', join('插件', '.jx-mods.patch.yml'),
], {
  cwd: ROOT,
  env: {
    ...process.env,
    DSH_HOME: join(ROOT, 'dsh-home'),
    ...(existsSync(NATIVE_SSH)
      ? { PATH: `C:\\Windows\\System32\\OpenSSH;${process.env.PATH ?? ''}` }
      : {}),
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal !== null) return
  process.exit(code ?? 0)
})
