/**
 * 逐字扫描逻辑（纯函数，宿主侧）。
 * 候选文本 = 真人消息（user/message 且 data.source.kind === 'user'）
 *          + 每轮最后一个 assistant/message（轮界：turn/end 或下一条真人消息/日志结束；
 *            中间的思考、工具调用、模型中途小返回一律跳过）。
 * 按时间顺序找第一个包含 needle（大小写不敏感子串）的候选，命中即止。
 */

interface LooseEvent {
  readonly type: string
  readonly time: number
  readonly data: unknown
}

interface Candidate {
  text: string
  time: number
}

/** 会话扫描顺序：有 cwd 的会话按官方顺序（最新在前）保留。 */
export function sessionScanOrder(records: readonly { id: string, cwd?: string }[]): string[] {
  return records.filter(record => record.cwd !== undefined).map(record => record.id)
}

/** 取 content blocks 的 text 拼接（与官方 extraction 同规则）。 */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}

/** 事件里的可搜索文本；不可搜索事件返回 undefined。 */
function eventText(event: LooseEvent): string | undefined {
  const data = event.data as Record<string, unknown> | null
  if (data === null || typeof data !== 'object') return undefined
  if (event.type === 'user/message') {
    if ((data.source as { kind?: unknown } | undefined)?.kind !== 'user') return undefined
    return contentText(data.content)
  }
  if (event.type === 'assistant/message') {
    const message = data.message as { content?: unknown } | undefined
    return contentText(message?.content)
  }
  return undefined
}

/** 以命中位置为中心截取摘要窗口，超界加省略号。 */
export function makeSnippet(text: string, index: number, radius: number): string {
  const characters = Array.from(text)
  if (characters.length <= radius * 2 + 4) return text
  const start = Math.max(0, index - radius)
  const end = Math.min(characters.length, index + radius)
  return `${start > 0 ? '…' : ''}${characters.slice(start, end).join('')}${end < characters.length ? '…' : ''}`
}

/**
 * 找会话内第一条命中的候选。
 * @returns 命中的摘要与时间；未命中返回 undefined。
 */
export function nextHitInSession(
  events: readonly LooseEvent[],
  needle: string,
  snippetRadius: number,
): { snippet: string, time: number } | undefined {
  const candidates: Candidate[] = []
  let pendingAssistant: Candidate | undefined

  const flushAssistant = (): void => {
    if (pendingAssistant !== undefined) candidates.push(pendingAssistant)
    pendingAssistant = undefined
  }

  for (const event of events) {
    if (event.type === 'turn/end') {
      flushAssistant()
      continue
    }
    const text = eventText(event)
    if (text === undefined || text.length === 0) continue
    if (event.type === 'assistant/message') {
      // 每轮只保留最后一个 assistant/message（最终回答）。
      pendingAssistant = { text, time: event.time }
      continue
    }
    // 真人消息开启新一轮：先把上一轮的最终回答落进候选。
    flushAssistant()
    candidates.push({ text, time: event.time })
  }
  flushAssistant()

  for (const candidate of candidates) {
    const index = candidate.text.toLowerCase().indexOf(needle)
    if (index >= 0) {
      return { snippet: makeSnippet(candidate.text, index, snippetRadius), time: candidate.time }
    }
  }
  return undefined
}
