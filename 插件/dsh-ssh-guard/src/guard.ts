/**
 * 检测与改写逻辑（纯函数，无宿主依赖，便于自测）。
 *
 * 三类判决：
 *  - pass             放行（不记录）
 *  - rewrite          远端 rm 可安全改写为「移入回收站」（结构简单才改，宁漏勿坏）
 *  - catastrophic     灾难级模式 → 转人工审批，人话说明
 *  - reviewNeeded     中间地带（有删除意味但不够灾难、也不可安全改写）→ 交给可选 AI 审查
 */
import type { GuardConfig } from './types.ts'

export type Verdict =
  | { kind: 'pass' }
  | { kind: 'rewrite'; rewritten: string; note: string }
  | { kind: 'catastrophic'; reasonZh: string }
  | { kind: 'reviewNeeded' }

/** 远端载体：ssh / scp / rsync / sftp / sshpass（出现在命令位，非路径片段）。 */
const REMOTE_CARRIER = /(?:^|[\n;&|(]\s*|\bsudo\s+)(?:ssh|scp|rsync|sftp|sshpass)\b/

/** 灾难级模式 → 类别 → 人话说明。 */
const CATASTROPHIC: ReadonlyArray<{ re: RegExp; zh: string }> = [
  { re: /\bdd\b[^|;&\n]*\bof=/, zh: '用 dd 直接覆写磁盘/设备，目标设备上的全部数据会立即丢失，且无法用回收站恢复' },
  { re: /\bmkfs(?:\.\w+)?\b/, zh: '格式化磁盘分区，该分区全部数据将被清除且不可恢复' },
  { re: /\bwipefs\b/, zh: '擦除磁盘签名（wipefs），会使分区/文件系统不可访问' },
  { re: />\s*\/dev\/(?:sd|nvme|vd|hd|xvd|mmcblk)/, zh: '把输出直接重定向写入裸磁盘设备，会破坏该设备上的数据' },
  { re: /\brm\s+(?:-[a-zA-Z-]+\s+)*\/(?:\s|$|\*|;|&)/, zh: '对根目录 / 本身执行删除（rm 到根），会尝试删除整个文件系统' },
  { re: /\brm\s+(?:-[a-zA-Z-]+\s+)*\/\*/, zh: '对 /* 根下全部内容执行删除，等价于清空整个文件系统' },
  { re: /\brm\s+(?:-[a-zA-Z-]+\s+)*~(?:\/\*)?(?:\s|$|;|&)/, zh: '删除整个用户主目录（~），该账号的全部数据会被清掉' },
  { re: /\b(?:chmod|chown)\s+-[a-zA-Z]*R[a-zA-Z]*\b[^;|&\n]*\s+\/(?:\s|$)/, zh: '递归修改根目录权限，通常会让整个系统不可用' },
  { re: /\b(?:shutdown|reboot|halt|poweroff)\b/, zh: '直接关闭/重启远程服务器，未保存的状态会丢失' },
  { re: /\binit\s+[06]\b/, zh: '切换运行级别到关机/重启，服务器会停机' },
  { re: /\bdrop\s+(?:database|schema)\b/i, zh: '删除整个数据库/schema，其中全部数据立即消失且不走回收站' },
  { re: /\btruncate\s+table\b/i, zh: '清空数据库表（truncate），表内全部行立即消失' },
]

/** 远端载荷里“有删除/破坏意味”的提示（用于决定是否需要 AI 审查）。 */
const DESTRUCTIVE_HINT = /\brm\b|\bdrop\b|\btruncate\b|\bdd\b/i

/** 远端命令是否含复杂结构（改写有风险，宁可放过）。 */
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
function trashSegment(paths: string[], config: GuardConfig): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const trash = config.trashDir.startsWith('~/') || config.trashDir.startsWith('~')
    ? config.trashDir
    : `~/${config.trashDir.replace(/^\//, '')}`
  const prune = `find ${trash} -maxdepth 1 -mtime +${config.retentionDays} -exec rm -rf {} + 2>/dev/null || true`
  return `mkdir -p ${trash}/${stamp} && mv -t ${trash}/${stamp} -- ${paths.join(' ')} ; ${prune}`
}

export function analyze(command: string, config: GuardConfig): Verdict {
  if (!REMOTE_CARRIER.test(command)) return { kind: 'pass' }

  const extracted = extractSshPayload(command)
  // 灾难级检测：载荷可提取时查载荷，否则保守地查整条命令
  const scanText = extracted?.payload ?? command
  for (const rule of CATASTROPHIC) {
    if (rule.re.test(scanText)) return { kind: 'catastrophic', reasonZh: rule.zh }
  }

  // rm → 回收站改写：仅当载荷可提取、整段由 rm 组成（; / && 连接）且无复杂结构。
  // 改写产物 = 原命令前缀（ssh/选项/host）+ 双引号包裹的新载荷（重写回完整本地命令）。
  if (extracted !== undefined && /\brm\b/.test(extracted.payload) && !UNSAFE_TO_REWRITE.test(extracted.payload)) {
    const segments = extracted.payload.split(/\s*(?:&&|;)\s*/).filter(segment => segment.trim().length > 0)
    const parsed = segments.map(segment => parseSimpleRm(segment))
    if (parsed.length > 0 && parsed.every(part => part !== undefined)) {
      const newPayload = parsed.map(part => trashSegment(part!.paths, config)).join(' && ')
      const rewritten = `${extracted.prefix}"${newPayload}"`
      return {
        kind: 'rewrite',
        rewritten,
        note: `[jx-ssh-guard] 你的远端 rm 命令已被安全改写为「移入远端回收站 ${config.trashDir}」（保留 ${config.retentionDays} 天后自动清理）。目标路径已从原位置移除，效果与删除一致；若确实要立即彻底删除，可对回收站内路径执行 rm。`,
      }
    }
  }

  if (DESTRUCTIVE_HINT.test(scanText)) return { kind: 'reviewNeeded' }
  return { kind: 'pass' }
}
