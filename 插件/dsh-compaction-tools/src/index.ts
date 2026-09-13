/**
 * 模型自主上下文压缩（原生引擎）——坚祥模组，宿主单面。
 *
 * 四个模型工具全部骑在官方 compaction 机制上（调研结论：SurfaceOp replace
 * 对任意生产者开放，packages/core/session/src/types.ts:427；compactRegion 是
 * 为显式范围预留的公开 API，packages/compaction/compaction/src/index.ts:164）：
 *
 * - context_compress  模型选范围折叠历史 → 官方四连事件 → 会话流出现原生压缩
 *                     标记行（可展开摘要正文、折叠条目/token 数），轨迹页可见；
 * - context_status    上下文用量、可压缩范围建议（带 seq，供 compress 引用）、
 *                     历史压缩块清单；
 * - search_history    关键词检索完整会话日志原文（含已被折叠的内容——原文在
 *                     append-only 日志里永不消失）；
 * - context_restore   按 seq 取回被折叠原文，以工具结果形式返回（结构性恢复
 *                     在原生 surface 里无路径，这是有意的变通）。
 *
 * 范围选择由本模组承担（compactRegion 只收显式范围）：从尾部保留
 * retainRatio 比例，边界用官方 toolPairingBalancedBefore/After 校验收拢，
 * 保证工具调用/结果配对不被拆开。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction'

export const name = 'dsh-compaction-tools'
export const inject = ['tools', 'compaction', 'tokenMeter']

export interface Config {
  /** 压缩时从尾部保留的表面 token 比例（默认 0.25）。 */
  retainRatio?: number
  /** 低于该 token 数的范围不值得压缩（默认 2000）。 */
  minCompressTokens?: number
  /** context_restore 返回内容的字节上限（默认 24000）。 */
  restoreByteCap?: number
  /** search_history 最多返回条数（默认 8）。 */
  searchMaxResults?: number
}

// —— 结构化类型（仅类型，构建时擦除） ——

interface ContentBlock { type: string; text?: string }
interface SessionEventLike {
  seq: number
  type: string
  data: {
    content?: readonly ContentBlock[]
    blocks?: readonly ContentBlock[]
    summary?: readonly ContentBlock[]
    compactionId?: string
    shadowedSeqs?: readonly number[]
    shadowedTokenCount?: number
  }
}
interface SurfaceNode { seq: number; tokens: number }
interface Measurement { totalTokens: number; surfaceTokens: number; nodes: readonly SurfaceNode[] }
interface CompactionResultLike {
  compactionId: string
  startSeq: number
  summarySeq: number
  endSeq: number
  shadowedSeqs: readonly number[]
  shadowedTokenCount: number
  summary: readonly ContentBlock[]
}
interface SessionLike {
  readonly events: readonly SessionEventLike[]
  readonly surface: { readonly nodes: readonly number[] }
}
interface AgentLike {
  readonly session: SessionLike
  readonly options: { provider?: string; model?: string }
}
interface ToolExec { agent?: AgentLike; signal: AbortSignal }

// —— 工具函数 ——

function blockText(blocks: readonly ContentBlock[] | undefined): string {
  if (blocks === undefined) return ''
  return blocks
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')
}

function truncateUtf8(input: string, maxBytes: number): string {
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  let used = 0
  let output = ''
  for (const character of input) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (used + bytes > maxBytes) break
    output += character
    used += bytes
  }
  return output
}

/** 事件的人类可读角色标签。 */
function roleOf(event: SessionEventLike): string {
  switch (event.type) {
    case 'user/message': return '用户'
    case 'assistant/message': return '助手'
    case 'tool/result': return '工具结果'
    case 'compaction/summary': return '压缩摘要'
    default: return event.type
  }
}

/**
 * 计算建议压缩范围（尾部偏向增量，前缀缓存友好）：
 * - 跳过 system 头；从尾部保留 retainRatio；
 * - 首选只压「上一个摘要检查点之后」的新内容——已有摘要不动，压缩点之前
 *   的请求前缀字节不变，缓存命中与逐轮追加时一致（bili 的 staged 策略同款）；
 * - 摘要堆积到新内容不足最小阈值时，级联把旧摘要一起重折（此时前缀缓存
 *   会整体重置，属于多代压缩的罕见兜底）；
 * - 边界用官方 toolPairingBalancedBefore/After 收拢，工具配对不拆。
 */
export function computeCompressibleRange(
  session: SessionLike,
  measurement: Measurement,
  config: Required<Pick<Config, 'retainRatio' | 'minCompressTokens'>>,
): { startSeq: number; endSeq: number; tokens: number; cascade: boolean } | null {
  const nodes = measurement.nodes
  if (nodes.length < 3) return null
  // 摘要检查点节点 = user/message 且 source.plugin === 'compact'（官方 checkpoint marker）。
  const eventBySeq = new Map<number, SessionEventLike>()
  for (const event of session.events) eventBySeq.set(event.seq, event)
  const isSummaryNode = (seq: number): boolean => {
    const event = eventBySeq.get(seq)
    return event?.type === 'user/message'
      && (event.data as { source?: { plugin?: string } } | undefined)?.source?.plugin === 'compact'
  }
  let lastSummaryIdx = 0
  for (let i = 1; i < nodes.length; i++) {
    if (isSummaryNode(nodes[i]?.seq ?? -1)) lastSummaryIdx = i
  }

  const retainTokens = measurement.surfaceTokens * config.retainRatio
  let kept = 0
  let boundary = nodes.length
  for (let i = nodes.length - 1; i >= 1; i--) {
    if (kept >= retainTokens) break
    kept += nodes[i]?.tokens ?? 0
    boundary = i
  }
  const maxEnd = Math.min(boundary - 1, nodes.length - 2)
  if (maxEnd <= 1) return null

  const pick = (startIdx: number): { startSeq: number; endSeq: number; tokens: number } | null => {
    if (startIdx >= maxEnd) return null
    let end = maxEnd
    for (let step = 0; step < nodes.length && end > startIdx + 1; step++) {
      const seq = nodes[end]?.seq
      if (seq === undefined) return null
      let balanced = false
      try { balanced = toolPairingBalancedAfter(session as never, seq) } catch { return null }
      if (balanced) break
      end--
    }
    let start = startIdx
    for (let step = 0; step < nodes.length && start < end; step++) {
      const seq = nodes[start]?.seq
      if (seq === undefined) return null
      let balanced = false
      try { balanced = toolPairingBalancedBefore(session as never, seq) } catch { return null }
      if (balanced) break
      start++
    }
    if (start >= end) return null
    let tokens = 0
    for (let i = start; i <= end; i++) tokens += nodes[i]?.tokens ?? 0
    if (tokens < config.minCompressTokens) return null
    return { startSeq: nodes[start]?.seq as number, endSeq: nodes[end]?.seq as number, tokens: Math.round(tokens) }
  }

  // 首选：增量——只压上一摘要之后的新内容（前缀缓存保持稳定）。
  const incremental = pick(lastSummaryIdx + 1)
  if (incremental !== null) return { ...incremental, cascade: false }
  // 级联：旧摘要一起重折（缓存重置的罕见兜底）。
  if (lastSummaryIdx > 0) {
    const cascaded = pick(1)
    if (cascaded !== null) return { ...cascaded, cascade: true }
  }
  return null
}

/** 汇总状态面板文本。 */
function renderStatus(
  session: SessionLike,
  measurement: Measurement,
  suggestion: { startSeq: number; endSeq: number; tokens: number; cascade: boolean } | null,
  config: Required<Pick<Config, 'retainRatio'>>,
): string {
  const lines: string[] = []
  lines.push(`当前上下文压力：约 ${measurement.totalTokens} tokens（表面 ${measurement.surfaceTokens}，共 ${measurement.nodes.length} 个表面节点）。`)
  const onSurface = new Set(session.surface.nodes)
  const blocks = session.events.filter(event => event.type === 'compaction/summary')
  if (blocks.length > 0) {
    lines.push(`历史压缩：${blocks.length} 次，共折叠 ${blocks.reduce((total, event) => total + (event.data.shadowedSeqs?.length ?? 0), 0)} 条消息。`)
  }
  if (suggestion !== null) {
    lines.push(`建议压缩范围：seq ${suggestion.startSeq} ~ ${suggestion.endSeq}（约 ${suggestion.tokens} tokens，保留最近 ${Math.round(config.retainRatio * 100)}%${suggestion.cascade ? '；注意：本次需级联重折旧摘要，前缀缓存会重置' : '；增量折叠，已有摘要不动，缓存前缀保持稳定'}）。调用 context_compress 并传 startSeq=${suggestion.startSeq}, endSeq=${suggestion.endSeq}。`)
  } else {
    lines.push('当前没有值得压缩的范围（历史太短或不足最小阈值）。')
  }
  lines.push(`被折叠的原文仍在日志里：可用 search_history 检索、context_restore 取回。当前表面外的 seq：${session.events.filter(event => onSurface.has(event.seq) === false && (event.type === 'user/message' || event.type === 'assistant/message')).length} 条。`)
  return lines.join('\n')
}

export function apply(ctx: Context, config: Config = {}): void {
  const policy = {
    retainRatio: config.retainRatio ?? 0.25,
    minCompressTokens: config.minCompressTokens ?? 2000,
    restoreByteCap: config.restoreByteCap ?? 24000,
    searchMaxResults: config.searchMaxResults ?? 8,
  }
  const compaction = (ctx as unknown as {
    compaction: { compactRegion(start: number, end: number, agent: AgentLike, signal?: AbortSignal): Promise<CompactionResultLike> }
  }).compaction
  const tokenMeter = (ctx as unknown as {
    tokenMeter: { measure(session: SessionLike): Measurement }
  }).tokenMeter

  const agentOf = (exec: ToolExec): AgentLike => {
    if (exec.agent === undefined) throw new Error('dsh-compaction-tools: 仅能在会话内使用（找不到当前 agent）')
    return exec.agent
  }

  ctx.tools.register(defineTool({
    name: 'context_status',
    description: '查看当前上下文压力与可压缩范围（含具体 seq）。长对话中途、或感觉历史很长时调用，据此决定是否调用 context_compress。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    async execute(_args: Record<string, never>, exec: ToolExec) {
      const agent = agentOf(exec)
      const measurement = tokenMeter.measure(agent.session)
      const suggestion = computeCompressibleRange(agent.session, measurement, policy)
      return { text: renderStatus(agent.session, measurement, suggestion, policy) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'context_compress',
    description: '把一段历史折叠成摘要，释放上下文空间。先调 context_status 拿建议范围；传入其给出的 startSeq/endSeq（省略则自动选择）。折叠后摘要保留关键信息，原文仍可用 search_history 检索、context_restore 取回。用户界面会显示本次压缩的标记与摘要。',
    parameters: {
      startSeq: { type: 'number', description: '折叠范围起始 seq（来自 context_status 的建议）。省略则自动选择。' },
      endSeq: { type: 'number', description: '折叠范围结束 seq（含）。省略则自动选择。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    async execute(args: { startSeq?: number, endSeq?: number }, exec: ToolExec) {
      const agent = agentOf(exec)
      let start = args.startSeq
      let end = args.endSeq
      if (start === undefined || end === undefined) {
        const measurement = tokenMeter.measure(agent.session)
        const suggestion = computeCompressibleRange(agent.session, measurement, policy)
        if (suggestion === null) {
          return { text: '当前没有值得压缩的范围（历史太短或不足最小阈值）。不需要调用本工具。' }
        }
        start = suggestion.startSeq
        end = suggestion.endSeq
      }
      const result = await compaction.compactRegion(start, end, agent, exec.signal)
      const summaryText = blockText(result.summary)
      return {
        text: [
          `已压缩：折叠 ${result.shadowedSeqs.length} 条消息（约 ${result.shadowedTokenCount} tokens），摘要已置入上下文。`,
          summaryText === '' ? '' : `摘要开头：${truncateUtf8(summaryText, 400)}`,
          '原文仍在日志里：需要细节时用 search_history 检索、context_restore 取回。',
        ].filter(line => line !== '').join('\n'),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'search_history',
    description: '按关键词检索本会话完整日志原文（包括已被压缩折叠的内容）。需要回忆早前讨论、决定、命令输出时调用。',
    parameters: {
      query: { type: 'string', description: '关键词（不区分大小写的子串匹配）。' },
      maxResults: { type: 'number', description: `最多返回条数（默认 ${policy.searchMaxResults}）。` },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    async execute(args: { query: string, maxResults?: number }, exec: ToolExec) {
      const agent = agentOf(exec)
      const query = args.query.toLowerCase()
      if (query === '') return { text: 'query 不能为空。' }
      const limit = args.maxResults ?? policy.searchMaxResults
      const onSurface = new Set(agent.session.surface.nodes)
      const matches: string[] = []
      for (const event of agent.session.events) {
        if (event.type !== 'user/message' && event.type !== 'assistant/message' && event.type !== 'tool/result') continue
        const text = blockText(event.data.content ?? event.data.blocks)
        if (text === '') continue
        const lower = text.toLowerCase()
        const at = lower.indexOf(query)
        if (at === -1) continue
        const excerpt = truncateUtf8(text.slice(Math.max(0, at - 100), at + 200), 320)
        const folded = onSurface.has(event.seq) ? '' : '（已被压缩折叠）'
        matches.push(`[seq ${event.seq}] ${roleOf(event)}${folded}：…${excerpt}…`)
        if (matches.length >= limit) break
      }
      if (matches.length === 0) return { text: `没有找到包含「${args.query}」的内容。` }
      return { text: [`找到 ${matches.length} 条：`, ...matches].join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'context_restore',
    description: '取回一段日志原文（常配合 search_history 的 seq 使用，恢复被压缩折叠的细节）。内容以本工具结果形式一次性返回，不改变对话结构。',
    parameters: {
      startSeq: { type: 'number', description: '起始 seq（含）。' },
      endSeq: { type: 'number', description: '结束 seq（含）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    async execute(args: { startSeq: number, endSeq: number }, exec: ToolExec) {
      const agent = agentOf(exec)
      const events = agent.session.events.filter(event =>
        event.seq >= args.startSeq && event.seq <= args.endSeq
        && (event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'tool/result'))
      if (events.length === 0) {
        return { text: `seq ${args.startSeq} ~ ${args.endSeq} 范围内没有可读消息。` }
      }
      const body = events.map(event => {
        const text = blockText(event.data.content ?? event.data.blocks)
        return `[seq ${event.seq}] ${roleOf(event)}：${text === '' ? '（无文本内容）' : text}`
      }).join('\n\n')
      return {
        text: truncateUtf8(body, policy.restoreByteCap)
          + (Buffer.byteLength(body, 'utf8') > policy.restoreByteCap ? '\n（超出字节上限已截断，可缩小范围分段取回）' : ''),
      }
    },
  }))
}
