/**
 * 模型自主上下文压缩（原生协议）——坚祥模组，宿主单面。
 *
 * 核心逻辑与 billion-context（ACP）对齐（2026-09-13 重读其内核后定型）：
 * - **模型自写摘要**（主路径，bili 同款）：compress 工具的参数就带 ranges +
 *   summary——模型刚读过原文，自己决定保留什么（精确文件路径/命令/报错原文/
 *   标识符/数值/用户修正），宿主同步落官方四事件协议（start → summary →
 *   checkpoint replace → end），**零额外 LLM 调用**；多个不连续范围一次调用
 *   逐个成块；每块可带 topic 主题（写成摘要标题，供检索）。
 * - **引擎摘要**（备选路径）：省略 ranges 时自动选范围并调官方 compactRegion
 *   （官方引擎另起一次摘要调用，八段结构提示词）。
 * 两条路径的产物都是官方原生事件：会话流出现官方压缩标记行（可展开摘要正文、
 * 折叠条目/token 数），轨迹页可见；投影折叠对任意生产者开放（core/session/
 * src/types.ts:427），UI 按事件协议渲染（ui-chat conversation-nodes/command.ts）。
 *
 * 范围选择（status 建议与自动路径共用）为尾部偏向增量：只压「上一摘要检查点
 * 之后」的新内容，已有摘要字节不动（前缀缓存稳定，bili staged 策略同效）；
 * 摘要堆积不足最小阈值时级联重折旧摘要（缓存重置的罕见兜底）。边界用官方
 * toolPairingBalancedBefore/After 收拢，工具调用/结果配对不拆。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { compactCheckpointSource, toolPairingBalancedBefore, toolPairingBalancedAfter } from '@deepseek-ai/dsh-compaction'

export const name = 'dsh-compaction-tools'
export const inject = ['tools', 'compaction', 'tokenMeter', 'systemPrompt']

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
    turn?: number
    source?: { kind?: string; plugin?: string }
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
  /** 当前日志长度（下一个 seq）。 */
  readonly seq: number
  /** 事件快照（官方 API：snapshotEvents；[].slice 语义，右开区间）。 */
  snapshotEvents(fromSeq?: number, toExclusive?: number): readonly SessionEventLike[]
  readonly surface: { readonly nodes: readonly number[] }
  append(type: string, data: unknown, ...opts: unknown[]): { seq: number }
}
interface AgentLike {
  readonly session: SessionLike
  readonly options: { provider?: string; model?: string }
}
interface ToolExec { agent?: AgentLike; signal: AbortSignal }

// —— 工具函数 ——

/** 自写摘要压缩事务的 id 计数器。 */
let selfCounter = 0

/** 官方 checkpoint 消息的引导语（与 compaction-basic summarizer 同文，保持模型视角一致）。 */
const CHECKPOINT_PREAMBLE = 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.'
const SUMMARY_OPEN_TAG = '<compacted-summary>'
const SUMMARY_CLOSE_TAG = '</compacted-summary>'

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
  for (const event of session.snapshotEvents()) eventBySeq.set(event.seq, event)
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
  const blocks = session.snapshotEvents().filter(event => event.type === 'compaction/summary')
  if (blocks.length > 0) {
    lines.push(`历史压缩：${blocks.length} 次，共折叠 ${blocks.reduce((total, event) => total + (event.data.shadowedSeqs?.length ?? 0), 0)} 条消息。`)
  }
  if (suggestion !== null) {
    lines.push(`建议压缩范围：seq ${suggestion.startSeq} ~ ${suggestion.endSeq}（约 ${suggestion.tokens} tokens，保留最近 ${Math.round(config.retainRatio * 100)}%${suggestion.cascade ? '；注意：本次需级联重折旧摘要，前缀缓存会重置' : '；增量折叠，已有摘要不动，缓存前缀保持稳定'}）。`)
    lines.push(`推荐用法：调用 context_compress 传 ranges=[{ startSeq: ${suggestion.startSeq}, endSeq: ${suggestion.endSeq}, topic: "...", summary: "你自己写的自包含摘要（保留文件路径、命令、报错原文、标识符、数值、用户修正意见）" }]——自己写摘要效果最好；省略 ranges 则由引擎自动摘要。`)
  } else {
    lines.push('当前没有值得压缩的范围（历史太短或不足最小阈值）。')
  }
  lines.push(`被折叠的原文仍在日志里：可用 search_history 检索、context_restore 取回。当前表面外的 seq：${session.snapshotEvents().filter(event => onSurface.has(event.seq) === false && (event.type === 'user/message' || event.type === 'assistant/message')).length} 条。`)
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

  // 压缩哲学常驻提示（对标 bili 注入的 compression philosophy；工具描述只讲
  // 用法，这里讲"何时压、压什么、怎么写摘要"的常驻原则）。
  ctx.systemPrompt.context({
    name: 'jx:context-management',
    order: 120,
    text: [
      'Context management: this session runs long. You own your context budget.',
      '- After large tool outputs or long stretches of conversation, call context_status to check pressure and get the suggested range.',
      '- When it suggests compressing, call context_compress WITH self-written summaries in ranges[]: you just read the content and know best what matters. Preserve exact file paths, commands, error strings, identifiers, numbers, function signatures, and user corrections verbatim. Give each block a short topic.',
      '- Compress in small incremental blocks (the suggested range keeps the prefix stable); do not re-fold existing summaries unless status says cascade.',
      '- Do not compress: the user\'s latest instructions, content you are actively using, or ranges below the suggested minimum.',
      '- When you need folded-back details, search_history (keywords over full original log) then context_restore (fetch exact seqs).',
    ].join('\n'),
  })

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
    description: '把一段已读过的历史折叠成摘要，释放上下文空间。**推荐自己写摘要**：你刚读过原文，最清楚哪些关键（在 ranges[].summary 里自己写自包含摘要——保留精确的文件路径、命令、报错原文、标识符、数值、函数签名和用户的修正意见；不要提"压缩/摘要"本身）。先调 context_status 拿建议范围的 seq。省略 ranges 则自动选范围并由引擎另起一次摘要调用（效果略逊于自写）。折叠后原文仍可用 search_history 检索、context_restore 取回；用户界面会显示压缩标记与摘要。',
    parameters: {
      ranges: {
        type: 'array',
        description: '要压缩的范围列表（seq 来自 context_status）。多个不连续范围会各自成为独立摘要块。',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            startSeq: { type: 'number', required: true, description: '范围起始 seq（含）。' },
            endSeq: { type: 'number', required: true, description: '范围结束 seq（含）。' },
            summary: { type: 'string', required: true, description: '你自己写的自包含摘要，将替换该范围。保留关键原文（路径/命令/报错/标识符/数值/用户修正）。' },
            topic: { type: 'string', description: '该摘要块的主题标题（便于日后检索）。' },
          },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    async execute(args: { ranges?: Array<{ startSeq: number, endSeq: number, summary: string, topic?: string }> }, exec: ToolExec) {
      const agent = agentOf(exec)
      const session = agent.session

      // —— 主路径：模型自写摘要（bili 同款，同步追加官方协议，零额外调用）。
      if (args.ranges !== undefined && args.ranges.length > 0) {
        const ranges = args.ranges
        if (ranges.length > 8) return { text: '一次最多压缩 8 个范围。' }
        // 压缩锁：日志里存在未闭合的 compaction/start 时拒绝。
        const closed = new Set(session.snapshotEvents().filter(event => event.type === 'compaction/end').map(event => event.data.compactionId))
        const open = session.snapshotEvents().some(event => event.type === 'compaction/start' && event.data.compactionId !== undefined && !closed.has(event.data.compactionId))
        if (open) return { text: '已有压缩事务在进行中，稍后再试。' }

        const measurement = tokenMeter.measure(session)
        const currentTurn = session.snapshotEvents().filter(event => event.type === 'turn/start').at(-1)?.data.turn ?? null
        const surfaceSeqs = [...session.surface.nodes]
        const used = new Set<number>()
        const results: string[] = []

        for (const range of ranges) {
          if (typeof range.summary !== 'string' || range.summary.trim() === '') {
            return { text: `范围 seq ${range.startSeq}~${range.endSeq} 缺少 summary（自己写的自包含摘要）。` }
          }
          const startIdx = surfaceSeqs.indexOf(range.startSeq)
          const endIdx = surfaceSeqs.indexOf(range.endSeq)
          if (startIdx === -1 || endIdx === -1) {
            return { text: `seq ${range.startSeq}~${range.endSeq} 不在当前表面上（可能已被折叠）。用 context_status 重新获取。` }
          }
          if (startIdx >= endIdx || startIdx < 1) {
            return { text: `范围无效（seq ${range.startSeq}~${range.endSeq}：顺序颠倒、过短或包含 system 头）。` }
          }
          const spanSeqs = surfaceSeqs.slice(startIdx, endIdx + 1)
          if (spanSeqs.some(seq => used.has(seq))) {
            return { text: `范围重叠（seq ${range.startSeq}~${range.endSeq} 与已处理范围相交）。` }
          }
          for (const seq of spanSeqs) used.add(seq)
          let balancedBefore = false
          let balancedAfter = false
          try {
            balancedBefore = toolPairingBalancedBefore(session as never, range.startSeq)
            balancedAfter = toolPairingBalancedAfter(session as never, range.endSeq)
          } catch {
            return { text: `范围边界校验失败（seq ${range.startSeq}~${range.endSeq}）。` }
          }
          if (!balancedBefore || !balancedAfter) {
            return { text: `范围 seq ${range.startSeq}~${range.endSeq} 会拆开工具调用/结果配对，请按 context_status 给出的边界调整。` }
          }
          let rangeTokens = 0
          for (const node of measurement.nodes) {
            if (spanSeqs.includes(node.seq)) rangeTokens += node.tokens
          }
          const summaryTokens = Math.ceil(range.summary.length / 2)
          if (rangeTokens > 0 && summaryTokens >= rangeTokens) {
            return { text: `范围 seq ${range.startSeq}~${range.endSeq} 的摘要不比原文短（约 ${summaryTokens} ≥ ${Math.round(rangeTokens)} tokens），没有压缩意义。` }
          }

          // 同步临界区：读表面到追加之间无 await，事务原子。
          const compactionId = `jxc-${Date.now().toString(36)}-${(selfCounter++).toString(36)}`
          const summaryBlocks: ContentBlock[] = [{ type: 'text', text: range.summary }]
          const startEvent = session.append('compaction/start', { compactionId, turn: currentTurn })
          const summaryEvent = session.append('compaction/summary', {
            compactionId,
            summary: summaryBlocks,
            shadowedRange: { start: range.startSeq, end: range.endSeq },
            shadowedSeqs: spanSeqs,
            shadowedTokenCount: Math.round(rangeTokens),
            provider: agent.options.provider ?? 'self',
            model: `${agent.options.model ?? 'model'} (self-written)`,
          })
          const checkpointText = `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}${range.topic !== undefined ? `\n# ${range.topic}\n` : '\n'}${range.summary}\n${SUMMARY_CLOSE_TAG}`
          session.append('user/message', {
            content: [{ type: 'text', text: checkpointText }],
            source: compactCheckpointSource(compactionId),
          }, {
            surfaceOp: { op: 'replace', startSeq: range.startSeq, endSeq: range.endSeq },
            sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...spanSeqs],
          })
          session.append('compaction/end', { compactionId, turn: currentTurn })
          results.push(`seq ${range.startSeq}~${range.endSeq}：折叠 ${spanSeqs.length} 条（约 ${Math.round(rangeTokens)} tokens）${range.topic !== undefined ? `，主题「${range.topic}」` : ''}`)
        }
        return {
          text: [
            `已压缩 ${results.length} 块（摘要为你自己写的内容，已置入上下文）：`,
            ...results.map(line => `- ${line}`),
            '原文仍在日志里：需要细节时用 search_history 检索、context_restore 取回。',
          ].join('\n'),
        }
      }

      // —— 备选路径：自动选范围 + 引擎摘要（官方 compactRegion）。
      const measurement = tokenMeter.measure(session)
      const suggestion = computeCompressibleRange(session, measurement, policy)
      if (suggestion === null) {
        return { text: '当前没有值得压缩的范围（历史太短或不足最小阈值）。不需要调用本工具。' }
      }
      const result = await compaction.compactRegion(suggestion.startSeq, suggestion.endSeq, agent, exec.signal)
      const summaryText = blockText(result.summary)
      return {
        text: [
          `已压缩：折叠 ${result.shadowedSeqs.length} 条消息（约 ${result.shadowedTokenCount} tokens），摘要已置入上下文。`,
          summaryText === '' ? '' : `摘要开头：${truncateUtf8(summaryText, 400)}`,
          '提示：下次推荐在 ranges 里自己写摘要（保留路径/命令/报错等关键原文，效果更好）。',
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
      for (const event of agent.session.snapshotEvents()) {
        let text = ''
        let role = ''
        if (event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'tool/result') {
          text = blockText(event.data.content ?? event.data.blocks)
          role = roleOf(event)
        } else if (event.type === 'compaction/summary') {
          // 摘要块也参与检索（对标 bili 的 search_context；标题即块首行 # 主题）。
          text = blockText(event.data.summary)
          role = '压缩摘要'
        } else {
          continue
        }
        if (text === '') continue
        const lower = text.toLowerCase()
        const at = lower.indexOf(query)
        if (at === -1) continue
        const excerpt = truncateUtf8(text.slice(Math.max(0, at - 100), at + 200), 320)
        const folded = onSurface.has(event.seq) ? '' : '（已被压缩折叠）'
        matches.push(`[seq ${event.seq}] ${role}${folded}：…${excerpt}…`)
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
      const events = agent.session.snapshotEvents().filter(event =>
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
