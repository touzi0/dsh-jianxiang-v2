/**
 * rm → 回收站改写逻辑（纯函数，无宿主依赖，便于自测）。
 * 拆分自 dsh-ssh-guard/guard.ts，只保留改写路径：远端载体上的简单形状 rm
 * 才改写（宁漏勿坏）；灾难级检测与 AI 审查已移至 dsh-ssh-review。
 */
import type { RewriteConfig } from './types.ts'

export type RewriteVerdict =
  | { kind: 'pass' }
  | { kind: 'rewrite'; rewritten: string; note: string }

/** 远端载体：ssh / scp / rsync / sftp / sshpass（出现在命令位，非路径片段）。 */
const REMOTE_CARRIER = /(?:^|[\n;&|(]\s*|\bsudo\s+)(?:ssh|scp|rsync|sftp|sshpass)\b/

/** 远端命令含复杂结构时改写有风险，宁可放过。 */
const UNSAFE_TO_REWRITE = /[|<&`$()]/

/** 从 ssh 命令中提取远端载荷及其前缀（前缀含 ssh、选项与 host，用于重组整条命令）。 */
function extractSshPayload(command: string): { prefix: string, payload: string } | undefined {
  // 形态一：整条以 quoted 远端命令结尾：ssh [选项] [user@]host "远端命令"
  const quotedTail = command.match(/((?:^|[\s;&|(])ssh\s[^;\n]*?\s)("([^"\\]|\\.)*"|'([^'\\]|\\.)*')\s*$/)
  if (quotedTail !== null) {
    return { prefix: quotedTail[1] ?? '', payload: stripQuotes(quotedTail[2] ?? '') }
  }
  // 形态二：ssh [选项...] [user@]host 裸文本远端命令
  const bare = command.match(/((?:^|[\s;&|(])ssh\s+(?:-{1,2}[\w-]+(?:\s+(?:"[^"]*"|'[^']*'|[^\s"']+))?\s+)*((?:[\w.-]+@)?[\w.\[\]:-]+)\s)(.+)$/)
  if (bare !== null && bare[3] !== undefined) {
    return { prefix: bare[1] ?? '', payload: stripQuotes(bare[3]) }
  }
  return undefined
}

function stripQuotes(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim()
  }
  return t
}

/** 一段 rm 命令是否是「简单形状」：rm [标志] 路径...，无复杂结构。 */
function parseSimpleRm(segment: string): { flags: string; paths: string[] } | undefined {
  const m = /^rm\s+(?:(-[a-zA-Z-]+)\s+)?(.+)$/s.exec(segment.trim())
  if (m === null) return undefined
  const paths = m[2].trim().split(/\s+/).filter(path => path.length > 0)
  if (paths.length === 0) return undefined
  return { flags: m[1] ?? '', paths }
}

/** 生成回收站搬迁命令段（远端执行，~ 由远端 shell 展开）。 */
function trashSegment(paths: string[], config: RewriteConfig): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const trash = config.trashDir.startsWith('~/') || config.trashDir.startsWith('~')
    ? config.trashDir
    : `~/${config.trashDir.replace(/^\//, '')}`
  const prune = `find ${trash} -maxdepth 1 -mtime +${config.retentionDays} -exec rm -rf {} + 2>/dev/null || true`
  return `mkdir -p ${trash}/${stamp} && mv -t ${trash}/${stamp} -- ${paths.join(' ')} ; ${prune}`
}

/** 整根/整主目录级 rm：不属「可安全改写」，留给 dsh-ssh-review 弹窗问人。 */
const NEVER_REWRITE = /\brm\s+(?:-[a-zA-Z-]+\s+)*\/(?:\s|$|\*|;|&)|\brm\s+(?:-[a-zA-Z-]+\s+)*\/\*|\brm\s+(?:-[a-zA-Z-]+\s+)*~(?:\/\*)?(?:\s|$|;|&)/

export function analyzeRewrite(command: string, config: RewriteConfig): RewriteVerdict {
  if (!REMOTE_CARRIER.test(command)) return { kind: 'pass' }
  const extracted = extractSshPayload(command)
  if (extracted === undefined) return { kind: 'pass' }
  if (NEVER_REWRITE.test(extracted.payload)) return { kind: 'pass' }
  if (!/\brm\b/.test(extracted.payload) || UNSAFE_TO_REWRITE.test(extracted.payload)) return { kind: 'pass' }

  const segments = extracted.payload.split(/\s*(?:&&|;)\s*/).filter(segment => segment.trim().length > 0)
  const parsed = segments.map(segment => parseSimpleRm(segment))
  if (parsed.length === 0 || !parsed.every(part => part !== undefined)) return { kind: 'pass' }

  const newPayload = parsed.map(part => trashSegment(part!.paths, config)).join(' && ')
  const rewritten = `${extracted.prefix}"${newPayload}"`
  return {
    kind: 'rewrite',
    rewritten,
    note: `[jx-ssh-rm-rewrite] 你的远端 rm 命令已被安全改写为「移入远端回收站 ${config.trashDir}」（保留 ${config.retentionDays} 天后自动清理）。目标路径已从原位置移除，效果与删除一致；若确实要立即彻底删除，可对回收站内路径执行 rm。`,
  }
}
