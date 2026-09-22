/**
 * 运行环境上下文注入（坚祥定制，原 packages/context/env-context 迁移为模组）。
 *
 * 目的：让模型明确知道「现在运行在哪里」——平台/架构/Node 版本/Shell（含实测
 * PowerShell 版本号，区分 pwsh 7.x 与 Windows PowerShell 5.1）/工作目录/
 * 当前时间（带时区），避免因不知道时间和系统而犯错（例如以为在 Linux 上跑
 * bash、用过期时间推算、在 Windows 上不处理 GBK/UTF-8 编码差异、把
 * PowerShell 5.1 当成 7.x 用了不存在的新语法）。同时声明语言偏好：回复与
 * 思考尽量用中文，代码/命令/标识符保持原样。
 * 以 systemPrompt.context 全局贡献注册，任何 agent 预设与沙箱模式都看到同一份快照。
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { spawnSync } from 'node:child_process'
import { createTimestampFormatter, formatTimestamp } from './timestamp.ts'

export const name = 'dsh-env-context'
export const inject = ['systemPrompt']

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

/** win32 shell/文件规则，每条都是完整的模型向句子。 */
const WIN32_NOTES: readonly string[] = [
  'cmd.exe defaults to codepage 936 (GBK): Chinese output may garble unless UTF-8 is active; run `chcp 65001` before Chinese I/O.',
  'PowerShell writes output with the console encoding; set [Console]::OutputEncoding to UTF-8 before Chinese I/O. Under ConstrainedLanguage, .NET static calls, Add-Type, and COM are unavailable.',
  'Write and read files as UTF-8 (no BOM); keep file paths, identifiers, and shell commands untranslated.',
]

const POSIX_NOTES: readonly string[] = [
  'Ensure a UTF-8 locale (LANG/LC_ALL) so Chinese output is not garbled.',
  'Quote file paths containing spaces; keep file paths, identifiers, and shell commands untranslated.',
]

/** 语言偏好规则：中文回复/中文思考，代码与命令保持原样。 */
const LANGUAGE_NOTES: readonly string[] = [
  'Language preference: respond to the user in Chinese (Simplified). Prefer reasoning/thinking in Chinese as well; keep code, shell commands, identifiers, file paths, and quoted log excerpts untranslated.',
]

export interface Config {
  timeZone?: string
  includeSeconds?: boolean
  notes?: string[]
}

export const Config: z<Config> = z.object({
  timeZone: z.string(),
  includeSeconds: z.boolean(),
  notes: z.array(z.string()),
})

interface PowerShellProbe {
  exe: string
  version: string
}

/** 探测单个 PowerShell 可执行文件的版本（$PSVersionTable.PSVersion），失败返回 undefined。 */
function probePowerShell(exe: string): PowerShellProbe | undefined {
  try {
    const result = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.error || result.status !== 0) return undefined
    const version = result.stdout.trim()
    return version === '' ? undefined : { exe, version }
  } catch {
    return undefined
  }
}

/** 枚举 PATH 上某可执行文件名的全部副本（where.exe）；where 不可用时退回按名探测第一个。 */
function whereExe(exe: string): string[] {
  try {
    const result = spawnSync('where.exe', [exe], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    if (result.error || result.status !== 0) return [exe]
    const paths = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
    return paths.length > 0 ? paths : [exe]
  } catch {
    return [exe]
  }
}

/**
 * 探测本机全部 PowerShell 及其实测版本号：枚举 PATH 上每个 pwsh.exe /
 * powershell.exe 副本，逐个问 $PSVersionTable——版本号完全以实测为准，
 * 6.x / 7.x / 5.1 或多版本并装都能如实列出（同版本多副本只记一条）。
 * 仅 win32 调用。
 */
function detectPowerShells(): PowerShellProbe[] {
  const seen = new Set<string>()
  const probes: PowerShellProbe[] = []
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    for (const path of whereExe(exe)) {
      const probe = probePowerShell(path)
      if (probe === undefined) continue
      const key = `${probe.version}`
      if (seen.has(key)) continue
      seen.add(key)
      probes.push({ exe: path, version: probe.version })
    }
  }
  return probes
}

function detectShell(platform: string, powerShells: readonly PowerShellProbe[]): string {
  if (platform === 'win32') {
    const psLabel = powerShells.length > 0
      ? powerShells.map(ps => {
          const base = ps.exe.split(/[\\/]/).pop() ?? ps.exe
          return `PowerShell ${ps.version} (${base})`
        }).join(' / ')
      : 'PowerShell (version unknown)'
    const hasCmd = process.env['ComSpec'] !== undefined
      && /cmd(?:\.exe)?$/i.test(process.env['ComSpec'] ?? '')
    const hasPowerShell = process.env['PSModulePath'] !== undefined
    if (hasCmd && hasPowerShell) return `cmd.exe / ${psLabel}`
    if (hasPowerShell) return psLabel
    return 'cmd.exe'
  }
  return process.env['SHELL'] ?? 'bash'
}

export function renderEnvironmentText(
  platform: string,
  arch: string,
  nodeVersion: string,
  shell: string,
  cwd: string,
  timestamp: string,
  notes: readonly string[],
): string {
  const platformName = PLATFORM_NAMES[platform] ?? platform
  const lines = [
    `Environment: ${platformName} (${platform} ${arch}), Node ${nodeVersion}, shell: ${shell}.`,
    `Working directory: ${cwd}.`,
    `Current time: ${timestamp}.`,
    'Shell and file notes:',
    ...notes.map(note => `- ${note}`),
  ]
  return lines.join('\n')
}

function renderTimestamp(config: Config): { text: string } {
  const includeSeconds = config.includeSeconds ?? false
  const formatter = createTimestampFormatter(config.timeZone, includeSeconds)
  const timeZone = formatter.resolvedOptions().timeZone
  return { text: formatTimestamp(Date.now(), formatter, timeZone, includeSeconds) }
}

export function apply(ctx: Context, config: Config = {}): void {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = createTimestampFormatter(config.timeZone)
  } catch (error: unknown) {
    const message = config.timeZone === undefined
      ? 'dsh-env-context: failed to resolve the system time zone'
      : `dsh-env-context: invalid IANA timeZone ${JSON.stringify(config.timeZone)}`
    throw new Error(message, { cause: error })
  }
  const timeZone = formatter.resolvedOptions().timeZone
  const includeSeconds = config.includeSeconds ?? false
  const notes = [
    ...(process.platform === 'win32' ? WIN32_NOTES : POSIX_NOTES),
    ...LANGUAGE_NOTES,
    ...(config.notes ?? []),
  ]
  // 探测一次即可：PowerShell 版本在进程存活期内不会变，避免每次渲染都 spawn 子进程。
  const powerShells = process.platform === 'win32' ? detectPowerShells() : []
  const shell = detectShell(process.platform, powerShells)

  ctx.systemPrompt.context({
    name: 'runtime:environment',
    order: 105,
    text: (context: { agent?: { session: { header: { cwd?: string } } } }) => {
      const cwd = context.agent?.session.header.cwd ?? process.cwd()
      const { text } = renderTimestamp({ ...config, timeZone, includeSeconds })
      return renderEnvironmentText(
        process.platform,
        process.arch,
        process.version,
        shell,
        cwd,
        text,
        notes,
      )
    },
  })
}
