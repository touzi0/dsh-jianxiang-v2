/**
 * 审查检测逻辑（纯函数，无宿主依赖，便于自测）。
 * 拆分自 dsh-ssh-guard/guard.ts，只保留灾难级与中间地带检测；rm 改写已移至
 * dsh-ssh-rm-rewrite。
 *
 * 三类判决：
 *  - pass          放行（不记录）
 *  - catastrophic  灾难级模式 → 弹窗让用户决定，人话说明
 *  - reviewNeeded  中间地带（有删除意味但不够灾难）→ 交给 AI 审查
 */
export type ReviewVerdict =
  | { kind: 'pass' }
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

/** 从 ssh 命令中提取远端载荷（剥掉引号；载荷可提取时查载荷，更准）。 */
function extractSshPayload(command: string): string | undefined {
  const quotedTail = command.match(/((?:^|[\s;&|(])ssh\s[^;\n]*?\s)("([^"\\]|\\.)*"|'([^'\\]|\\.)*')\s*$/)
  if (quotedTail !== null) return stripQuotes(quotedTail[2] ?? '')
  const bare = command.match(/((?:^|[\s;&|(])ssh\s+(?:-{1,2}[\w-]+(?:\s+(?:"[^"]*"|'[^']*'|[^\s"']+))?\s+)*((?:[\w.-]+@)?[\w.\[\]:-]+)\s)(.+)$/)
  if (bare !== null && bare[3] !== undefined) return stripQuotes(bare[3])
  return undefined
}

function stripQuotes(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim()
  }
  return t
}

export function analyzeReview(command: string): ReviewVerdict {
  if (!REMOTE_CARRIER.test(command)) return { kind: 'pass' }
  // 灾难级检测：载荷可提取时查载荷，否则保守地查整条命令
  const scanText = extractSshPayload(command) ?? command
  for (const rule of CATASTROPHIC) {
    if (rule.re.test(scanText)) return { kind: 'catastrophic', reasonZh: rule.zh }
  }
  if (DESTRUCTIVE_HINT.test(scanText)) return { kind: 'reviewNeeded' }
  return { kind: 'pass' }
}
