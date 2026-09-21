#!/usr/bin/env node
/**
 * 坚祥服务启动包装：由 启动坚祥.bat 在服务窗口里调用。
 * 在这里设置 DSH_HOME 与 --patch 参数，避免 bat 内引号嵌套问题。
 *
 * 另外做一件事：官方 dsh web 启动后会打印一行带登录令牌的网址
 * （形如 `dsh web: http://127.0.0.1:3080/?token=...`），令牌每次启动都不同。
 * 本包装把这行抓出来写进 dsh-home\.web-url，让 启动坚祥.bat 在
 * 「服务已经在跑」时也能打开可用地址（否则它打开的不带令牌地址会被 401 拒绝）。
 * 服务退出时删除该文件，避免留下过期网址。
 *
 * 另：Git 版 ssh.exe（Cygwin 系）在 DSH 沙箱受限令牌下 CreateFileMapping 崩溃，
 * 把 Windows 原生 OpenSSH 提到 PATH 最前（存在才生效），agent 的 ssh 一律走原生版。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = join(ROOT, 'dsh-home')
const URL_FILE = join(DSH_HOME, '.web-url')

const NATIVE_SSH = 'C:/Windows/System32/OpenSSH/ssh.exe'

mkdirSync(DSH_HOME, { recursive: true })
rmSync(URL_FILE, { force: true })

const child = spawn(process.execPath, [
  join('apps', 'cli', 'lib', 'bin.js'),
  'web',
  '--patch', join('插件', '.jx-mods.patch.yml'),
], {
  cwd: ROOT,
  env: {
    ...process.env,
    DSH_HOME,
    ...(existsSync(NATIVE_SSH)
      ? { PATH: `C:\\Windows\\System32\\OpenSSH;${process.env.PATH ?? ''}` }
      : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

/** 官方那行网址：`dsh web: http://127.0.0.1:3080/?token=…`（后面可能跟 LAN 尾注）。 */
const URL_LINE = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u
let pending = ''

child.stdout.on('data', chunk => {
  const text = chunk.toString('utf8')
  process.stdout.write(text)
  pending += text
  const matched = URL_LINE.exec(pending)
  if (matched !== null) {
    try {
      writeFileSync(URL_FILE, `${matched[1]}\n`, 'utf8')
    } catch (error) {
      console.log(`[jx-server] 写入可复用网址失败：${String(error)}`)
    }
    pending = ''
    return
  }
  // 没有匹配就只保留尾部，长时间运行时缓冲区不会无限增长。
  if (pending.length > 4096) pending = pending.slice(-1024)
})

child.stderr.on('data', chunk => process.stderr.write(chunk))

child.on('exit', (code, signal) => {
  rmSync(URL_FILE, { force: true })
  if (signal !== null) return
  process.exit(code ?? 0)
})
