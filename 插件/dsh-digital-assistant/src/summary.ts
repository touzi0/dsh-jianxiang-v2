/**
 * 会话事件 → 压缩摘要（纯函数，宿主半球）。
 *
 * 设计要点：
 * - 只读白名单字段：工具只看 `name`（绝不含 arguments）、思考只数「有几条」，
 *   正文只取 `text` 块（`content` 里混着 reasoning 与 tool-call 块，必须显式判 type）；
 * - 文件改动自己折叠：`workspace/changes` 事件与其内存摘要不覆盖/不持久，
 *   顶层会话与子会话都走 `tool/call` + `tool/result` 配对；
 * - 删除没有可信来源（write 只报 create/update），故只给 create/update/unknown。
 */
import type { ChangedFile, SessionEventLike, WorkSummary } from './types.ts'

/** 会改文件的工具名（按官方工具目录）。 */
const WRITE_TOOLS = new Set(['write', 'edit', 'str_replace_editor'])

/** 摘要渲染参数。 */
export interface SummaryOptions {
  /** 中间正文最多保留几条。 */
  readonly middleTextLimit?: number
  /** 每条正文片段的最大字符数。 */
  readonly snippetChars?: number
  /** 最终答复的最大字符数。 */
  readonly finalChars?: number
  /** 改动文件最多列出几个。 */
  readonly maxFiles?: number
}

const DEFAULTS = {
  middleTextLimit: 3,
  snippetChars: 220,
  finalChars: 900,
  maxFiles: 30,
}

/** 压缩空白并按上限截断，超限加省略号。 */
export function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit - 1)}…`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/** 从工具参数 JSON 串里取文件路径（只认 file_path / path）。 */
function pathFromArguments(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  try {
    const parsed = asRecord(JSON.parse(raw))
    if (parsed === undefined) return undefined
    for (const key of ['file_path', 'path']) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim() !== '') return value
    }
    return undefined
  } catch {
    return undefined
  }
}

/** 该 step 的压缩流里是否含非空思考。 */
function streamHasReasoning(stream: unknown): boolean {
  const records = Array.isArray(stream) ? stream : asRecord(stream)?.records
  if (!Array.isArray(records)) return false
  return records.some((record) => {
    const entry = asRecord(record)
    if (entry === undefined || entry.type !== 'reasoning-chunks') return false
    const chunks = entry.chunks
    return Array.isArray(chunks) && chunks.length > 0
  })
}

/** 一轮的结束原因。 */
function reasonOf(data: Record<string, unknown>): string {
  const reason = data.reason
  if (typeof reason === 'string') return reason
  const kind = asRecord(reason)?.kind
  return typeof kind === 'string' ? kind : 'completed'
}

/** 工具结果是否失败（工具结果消息自带 isError，失败还会有 error 字段）。 */
function resultFailed(data: Record<string, unknown>, message: Record<string, unknown> | undefined): boolean {
  if (data.error !== undefined) return true
  if (message?.isError === true) return true
  const content = message?.content
  if (Array.isArray(content)) {
    return content.some(block => asRecord(block)?.isError === true)
  }
  return false
}

/** 折叠一个会话的全部事件，得到「做了什么」的压缩摘要。 */
export function summarizeSession(events: readonly SessionEventLike[], options: SummaryOptions = {}): WorkSummary {
  const config = { ...DEFAULTS, ...options }
  let turns = 0
  let steps = 0
  let reasoningSteps = 0
  let startedAt: number | undefined
  let endedAt: number | undefined
  let stopReason = 'completed'
  const snippets: string[] = []
  const toolCounts = new Map<string, number>()
  const toolOrder: string[] = []
  /** callId → 该次调用的工具名与目标路径。 */
  const calls = new Map<string, { name: string; path?: string }>()
  const files = new Map<string, ChangedFile['op']>()

  for (const event of events) {
    const data = asRecord(event.data) ?? {}
    switch (event.type) {
      case 'turn/start': {
        if (startedAt === undefined && typeof event.time === 'number') startedAt = event.time
        break
      }
      case 'turn/end': {
        turns += 1
        if (typeof event.time === 'number') endedAt = event.time
        stopReason = reasonOf(data)
        break
      }
      case 'step/end': {
        steps += 1
        break
      }
      case 'assistant/message': {
        const message = asRecord(data.message)
        const content = message?.content
        if (!Array.isArray(content)) break
        const own: string[] = []
        let hasReasoning = false
        for (const rawBlock of content) {
          const block = asRecord(rawBlock)
          if (block === undefined) continue
          if (block.type === 'reasoning' && typeof block.text === 'string' && block.text.trim() !== '') {
            hasReasoning = true
          }
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
            own.push(block.text)
          }
        }
        if (hasReasoning) reasoningSteps += 1
        if (own.length > 0) snippets.push(own.join('\n\n'))
        break
      }
      case 'assistant/attempt': {
        if (streamHasReasoning(data.stream)) reasoningSteps += 1
        break
      }
      case 'tool/call': {
        const name = typeof data.name === 'string' ? data.name : 'unknown'
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
        if (!toolOrder.includes(name)) toolOrder.push(name)
        const callId = data.callId
        if (typeof callId === 'string') {
          calls.set(callId, { name, path: pathFromArguments(data.arguments) })
        }
        break
      }
      case 'tool/result': {
        const message = asRecord(data.message)
        const callId = asRecord(message?.source)?.callId
        const call = typeof callId === 'string' ? calls.get(callId) : undefined
        if (call === undefined || call.path === undefined) break
        if (!WRITE_TOOLS.has(call.name)) break
        if (resultFailed(data, message)) break
        const operation = asRecord(data.meta)?.operation
        const op: ChangedFile['op'] = operation === 'create' ? 'create' : operation === 'update' ? 'update' : 'unknown'
        // 同一路径先出现 create 后出现 update 时保留 create（本轮内新建文件）。
        const previous = files.get(call.path)
        if (previous === undefined || previous === 'unknown') files.set(call.path, op)
        break
      }
      default:
        break
    }
  }

  const finalRaw = snippets.length > 0 ? snippets[snippets.length - 1] as string : ''
  const middleRaw = snippets.slice(0, Math.max(0, snippets.length - 1))
  const middleTexts = middleRaw.slice(-config.middleTextLimit).map(text => clip(text, config.snippetChars))

  return {
    turns,
    steps,
    reasoningSteps,
    toolCalls: toolOrder.map(name => ({ name, count: toolCounts.get(name) ?? 0 })),
    middleTexts,
    finalText: clip(finalRaw, config.finalChars),
    changedFiles: [...files.entries()].slice(0, config.maxFiles).map(([path, op]) => ({ path, op })),
    stopReason,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
  }
}

/** 结束原因的中文说法。 */
function stopReasonText(reason: string): string {
  switch (reason) {
    case 'completed': return '正常完成'
    case 'aborted': return '被中断'
    case 'interrupted': return '异常中断（可能是宿主重启/崩溃）'
    case 'blocked': return '被策略拦下'
    case 'max-tokens': return '触达输出上限'
    case 'error': return '出错结束'
    default: return reason
  }
}

/** 文件改动的中文说法。 */
function opText(op: ChangedFile['op']): string {
  switch (op) {
    case 'create': return '新增'
    case 'update': return '修改'
    default: return '改动'
  }
}

/** 用时的人类可读写法。 */
function durationText(summary: WorkSummary): string {
  if (summary.startedAt === undefined || summary.endedAt === undefined) return ''
  const seconds = Math.max(0, Math.round((summary.endedAt - summary.startedAt) / 1000))
  if (seconds < 60) return `，用时 ${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `，用时 ${minutes} 分 ${seconds % 60} 秒`
}

/**
 * 把摘要渲染成给数字助理看的文本。这是数字助理了解「别的对话做了什么」的唯一入口，
 * 所以刻意不含思考内容、不含工具参数、不含文件内容。
 * @param summary - 折叠结果。
 * @param meta - 会话标识与标题。
 * @returns 一段中文 Markdown。
 */
export function renderSummaryText(
  summary: WorkSummary,
  meta: { sessionId: string; title?: string; workspaceTitle?: string; task?: string },
): string {
  const lines: string[] = []
  const title = meta.title === undefined || meta.title.trim() === '' ? '（无标题）' : meta.title
  lines.push(`【会话 ${meta.sessionId}】${title} —— ${stopReasonText(summary.stopReason)}${durationText(summary)}`)
  if (meta.workspaceTitle !== undefined) lines.push(`· 工作区：${meta.workspaceTitle}`)
  if (meta.task !== undefined) lines.push(`· 派给它的需求：${clip(meta.task, 200)}`)
  lines.push(`· 规模：${summary.turns} 轮 / ${summary.steps} 步（其中 ${summary.reasoningSteps} 步带思考）`)
  if (summary.toolCalls.length === 0) {
    lines.push('· 工具调用：无')
  } else {
    lines.push(`· 工具调用：${summary.toolCalls.map(tool => `${tool.name}×${tool.count}`).join('、')}`)
  }
  if (summary.middleTexts.length === 0) {
    lines.push('· 中间正文：无')
  } else {
    lines.push('· 中间正文：')
    for (const text of summary.middleTexts) lines.push(`  - ${text}`)
  }
  lines.push(`· 最终答复：${summary.finalText === '' ? '（没有正文输出）' : summary.finalText}`)
  if (summary.changedFiles.length === 0) {
    lines.push('· 改动文件：无（未记录到成功的写文件动作）')
  } else {
    lines.push(`· 改动文件：${summary.changedFiles.map(file => `${file.path}（${opText(file.op)}）`).join('、')}`)
  }
  lines.push('（以上是压缩摘要，不含思考内容与工具参数细节；需要更多细节时读会话或让用户点进该会话查看。）')
  return lines.join('\n')
}
