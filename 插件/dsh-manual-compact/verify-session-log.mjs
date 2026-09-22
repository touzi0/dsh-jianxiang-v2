/**
 * 会话日志取证：验证一次手动压缩在会话日志里留下的完整官方事务痕迹。
 *
 * 用法：
 *   node verify-session-log.mjs [会话JSONL路径]
 * 不带参数时取 dsh-home\sessions 里最近 30 分钟内有改动的会话文件。
 *
 * 断言（全部来自官方会话日志，append-only JSONL）：
 *   1. compaction/start（standalone 手动事务，turn: null）；
 *   2. compaction/summary（含 shadowedRange / shadowedSeqs / 摘要文本 / provider+model）；
 *   3. 紧随其后的 user/message 替换事件（surfaceOp replace，即压缩检查点落盘）；
 *   4. compaction/end（无 error）；
 *   5. 替换之后仍有新的 user/message 追加（压缩后会话继续正常对话）。
 * 输出：每一步 PASS/FAIL + 摘要文本预览 + 关键行号。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(PKG_DIR, '../..')
const SESSIONS = join(ROOT, 'dsh-home', 'sessions')

/** 收集要检查的会话文件。 */
function collectTargets() {
  if (process.argv[2] !== undefined) {
    const path = resolve(process.argv[2])
    if (!existsSync(path)) {
      console.error(`[verify] 找不到会话文件：${path}`)
      process.exit(1)
    }
    return [path]
  }
  const cutoff = Date.now() - 30 * 60 * 1000
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.startsWith('session') && entry.name.endsWith('.jsonl')) {
        if (statSync(full).mtimeMs >= cutoff) files.push(full)
      }
    }
  }
  if (!existsSync(SESSIONS)) {
    console.error(`[verify] 找不到会话目录：${SESSIONS}`)
    process.exit(1)
  }
  walk(SESSIONS)
  files.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
  return files.slice(0, 3)
}

const targets = collectTargets()
if (targets.length === 0) {
  console.error('[verify] 最近 30 分钟没有改动的会话文件——请先在界面上完成一次压缩。')
  process.exit(1)
}

let verified = false
for (const file of targets) {
  console.log(`\n===== ${file.replace(ROOT + '\\', '')} =====`)
  const lines = readFileSync(file, 'utf8').split('\n').filter(line => line.trim() !== '')
  /** 每行解析 { seq, type, data, surfaceOp? }（字段名按官方会话日志）。 */
  const events = []
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line)
      events.push({ lineNo: index + 1, ...parsed })
    } catch {
      // 半行（写入中的尾部）忽略。
    }
  }
  const startIndex = events.findIndex(event => event.type === 'compaction/start')
  if (startIndex === -1) {
    console.log('该会话没有 compaction/start 事件，跳过。')
    continue
  }
  verified = true

  const checks = []
  const record = (label, ok, detail = '') => {
    checks.push({ label, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ` —— ${detail}`}`)
  }

  const start = events[startIndex]
  record('① compaction/start（手动 standalone，turn: null）',
    start.data?.turn === null || start.data?.turn === undefined,
    `line ${start.lineNo}，compactionId=${String(start.data?.compactionId).slice(0, 18)}…`)

  const summary = events.slice(startIndex + 1).find(event => event.type === 'compaction/summary')
  if (summary === undefined) {
    record('② compaction/summary', false, '没有找到（压缩未完成？）')
  } else {
    const summaryText = (summary.data?.summary ?? [])
      .map(block => typeof block === 'string' ? block : (block.text ?? '')).join('')
    const seqCount = summary.data?.shadowedSeqs?.length
    record('② compaction/summary（范围与摘要文本）',
      Array.isArray(summary.data?.shadowedSeqs) && summaryText.length > 0,
      `line ${summary.lineNo}，压掉 ${seqCount} 条，摘要 ${summaryText.length} 字，route=${summary.data?.provider ?? '?'}/${summary.data?.model ?? '?'}`)
    console.log(`   摘要预览：${summaryText.slice(0, 220).replace(/\s+/g, ' ')}…`)

    // ③ 紧随的 user/message 替换（官方契约：压缩检查点必须紧跟 summary）。
    const after = events.slice(events.indexOf(summary) + 1)
    const replacement = after.find(event => event.type === 'user/message')
    const isReplace = replacement !== undefined && JSON.stringify(replacement).includes('"replace"')
    record('③ 替换落盘（user/message，surfaceOp=replace 压缩检查点）', isReplace,
      replacement === undefined ? '没有找到' : `line ${replacement.lineNo}，checkpoint=${replacement.data?.content?.[0]?.text?.slice(0, 80)?.replace(/\s+/g, ' ')}…`)

    // ④ compaction/end 无 error。
    const end = after.find(event => event.type === 'compaction/end')
    record('④ compaction/end（无 error）', end !== undefined && end.data?.error === undefined,
      end === undefined ? '没有找到' : `line ${end.lineNo}`)

    // ⑤ 之后还有新对话（压缩后会话继续正常使用）。
    const endIndex = end === undefined ? events.length - 1 : events.indexOf(end)
    const later = events.slice(endIndex + 1).filter(event => event.type === 'user/message')
    record('⑤ 压缩点之后仍有新消息（会话继续正常对话）', later.length > 0,
      later.length === 0 ? '压缩后没有新消息（可再发一条验证）' : `${later.length} 条新消息`)
  }

  const failed = checks.filter(item => !item.ok).length
  console.log(failed === 0 ? `→ 本会话 ${checks.length} 项全部通过` : `→ 本会话 ${failed}/${checks.length} 项失败`)
  break
}
if (!verified) {
  console.log('\n[verify] 最近改动的会话里都没有 compaction 事件。')
  process.exitCode = 1
}
