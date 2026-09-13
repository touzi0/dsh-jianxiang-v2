/**
 * 运行环境上下文注入（坚祥定制，原 packages/context/env-context 迁移为模组）。
 *
 * 目的：让模型明确知道「现在运行在哪里」——平台/架构/Node 版本/Shell/工作目录/
 * 当前时间（带时区），避免因不知道时间和系统而犯错（例如以为在 Linux 上跑
 * bash、用过期时间推算、在 Windows 上不处理 GBK/UTF-8 编码差异）。
 * 以 systemPrompt.context 全局贡献注册，任何 agent 预设与沙箱模式都看到同一份快照。
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
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

function detectShell(platform: string): string {
  if (platform === 'win32') {
    const hasCmd = process.env['ComSpec'] !== undefined
      && /cmd(?:\.exe)?$/i.test(process.env['ComSpec'] ?? '')
    const hasPowerShell = process.env['PSModulePath'] !== undefined
    if (hasCmd && hasPowerShell) return 'cmd.exe / PowerShell (pwsh)'
    if (hasPowerShell) return 'PowerShell (pwsh)'
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
    ...(config.notes ?? []),
  ]

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
        detectShell(process.platform),
        cwd,
        text,
        notes,
      )
    },
  })
}
