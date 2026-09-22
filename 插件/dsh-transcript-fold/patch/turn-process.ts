import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationLocation, ConversationNodeContext, ConversationNodeDefinition, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools/types'
import { hasAssistantReplyContent } from '../contract/assistant-content.ts'
import type { AssistantChatData, ChatNode, FinalAssistantChatData } from '../contract/chat-nodes.ts'
import {
  isSubagentDelegationTool, sameTurnProcessSpec, type TurnProcessSpec,
} from '../contract/turn-process.ts'
import { CHAT_SYNTHETIC_SEQ_OFFSETS, chatNode } from './common.ts'
import { toAssistantBlocks } from './event-projection.ts'

declare module '../contract/chat-nodes.ts' {
  interface ChatNodeDataMap {
    /** Turn-level disclosure controlling process rows before the finalized answer. */
    'turn-process': import('../contract/chat-nodes.ts').TurnProcessChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Process range and finalized answer boundary for this Turn. */
    'turn-process': TurnProcessSpec
  }
}

/**
 * 坚祥折叠时机（jx fold timing）——中间正文保持可见的阈值，取自旧折叠体系
 * (packages/client/ui-conversation chat-flow.ts)：3 个非空行，或 85 个全角当量字符。
 */
const LONG_TEXT_LINES = 3

/** Full-width-equivalent character threshold: a CJK/full-width char counts 1, a half-width char 0.5. */
const LONG_TEXT_CHARS = 85

/**
 * 坚祥：执行中（既没有最终输出、也没有长中间正文）只保留最后 TAIL_ROWS 行执行过程，
 * 更早的行持续折叠起来——既能看见正在跑什么，又方便往上翻。
 */
const TAIL_ROWS = 10

/** 坚祥：一行可折叠的执行过程（一个 Assistant 步骤行或一次工具调用行）。 */
interface ProcessRow {
  readonly seq: number
  readonly step: number
}

interface TurnProcessState {
  readonly turn: number
  readonly assistantStartByStep: ReadonlyMap<number, number>
  readonly messageCountByStep: ReadonlyMap<number, number>
  /** 坚祥：每个 Assistant 步骤累积的中间正文，用于长中间正文判定。 */
  readonly narrationTextByStep: ReadonlyMap<number, string>
  /** 坚祥：已经收到耐久 assistant/message 的步骤，其后只追加、不再被直播文本覆盖。 */
  readonly durableNarrationSteps: ReadonlySet<number>
  readonly otherStartSeq?: number
  readonly controlAnchorSeq?: number
  /** 坚祥：最近一个跨过长正文阈值的步骤。 */
  readonly longNarrationStep?: number
  /** 坚祥：本回合按顺序记录的执行过程行（步骤行 + 每次工具调用行）。 */
  readonly processRows: readonly ProcessRow[]
  readonly messageCount: number
  readonly toolCallCount: number
  readonly subagentCount: number
}

type ConversationEvent = Parameters<ConversationNodeDefinition['match']>[0]

function eventTurn(event: ConversationEvent): number | undefined {
  const data = event.data as unknown as { turn?: unknown }
  return typeof data.turn === 'number' ? data.turn : undefined
}

function visibleChunk(chunk: StreamChunk): boolean {
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text.trim() !== ''
  if (chunk.type === 'block-start') {
    return chunk.blockType !== 'text'
        && chunk.blockType !== 'reasoning'
        && chunk.blockType !== 'tool-call'
  }
  if (chunk.type !== 'block-end') return false
  const block = chunk.block
  if (block.type === 'tool-call') return false
  if (block.type === 'text' || block.type === 'reasoning') return block.text.trim() !== ''
  return true
}

function visibleAssistantEvent(event: ConversationEvent): boolean {
  if (event.type === 'assistant/live-chunk') return visibleChunk(event.data.chunk)
  if (event.type === 'assistant/attempt') return false
  return event.type === 'assistant/message'
    && event.surfaceOp === 'append'
    && toAssistantBlocks(event.data.message.content).some((block) => {
      if (block.kind === 'tool-call') return false
      if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== ''
      return true
    })
}

type ProcessEvidence =
  | { readonly kind: 'assistant'; readonly seq: number; readonly step: number }
  | { readonly kind: 'other'; readonly seq: number }

function processEvidence(event: ConversationEvent): ProcessEvidence | undefined {
  if (visibleAssistantEvent(event)) {
    if (event.type !== 'assistant/live-chunk'
      && event.type !== 'assistant/message'
      && event.type !== 'assistant/attempt') return undefined
    return { kind: 'assistant', seq: event.seq, step: event.data.step }
  }
  if (event.type === 'tool/call'
    || (event.type === 'tool/result' && event.surfaceOp === 'append')
    || event.type === 'llm/retry') return { kind: 'other', seq: event.seq }
  return undefined
}

function turnLocation(context: ConversationNodeContext<TurnProcessState>): TurnLocation | undefined {
  const location: ConversationLocation | undefined = context.start?.location ?? context.matches.at(-1)?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
}

function fallbackState(context: ConversationNodeContext<TurnProcessState>): TurnProcessState | undefined {
  const turn = context.matches.map(match => eventTurn(match.event)).find(candidate => candidate !== undefined)
  if (turn === undefined) return undefined
  let state: TurnProcessState = {
    turn,
    assistantStartByStep: new Map(),
    messageCountByStep: new Map(),
    narrationTextByStep: new Map(),
    durableNarrationSteps: new Set(),
    processRows: [],
    messageCount: 0,
    toolCallCount: 0,
    subagentCount: 0,
  }
  for (const match of context.matches) state = updateProcessState(state, match.event)
  return state
}

function isFinalAssistant(
  data: Readonly<AssistantChatData> | undefined,
): data is Readonly<FinalAssistantChatData> {
  return data?.finalNode !== undefined
}

function latestAnswer(turn: TurnLocation): Readonly<FinalAssistantChatData> | null {
  const latestStep = turn.steps.at(-1)
  const data: Readonly<AssistantChatData> | undefined = latestStep?.data.get('assistant-step')
  if (!isFinalAssistant(data) || !hasAssistantReplyContent(data.blocks)) return null
  return data.blocks.some(block => block.kind === 'tool-call') ? null : data
}

/** Joined text blocks of one Assistant step. */
function narrationText(blocks: Readonly<AssistantChatData>['blocks']): string {
  let text = ''
  for (const block of blocks) {
    if (block.kind === 'text') text += block.text
  }
  return text
}

/** Full-width-equivalent weight of a narration text. */
function narrationWeight(text: string): number {
  let weight = 0
  for (const char of text) weight += char >= '\u{2E80}' ? 1 : 0.5
  return weight
}

/**
 * 坚祥：一段中间正文是否已经长到该保持可见——LONG_TEXT_LINES 个非空行，
 * 或 LONG_TEXT_CHARS 个全角当量字符。
 * @param text - 该步骤累积的正文。
 * @returns 是否跨过阈值。
 */
function isLongNarration(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  if (trimmed.split('\n').filter(line => line.trim() !== '').length >= LONG_TEXT_LINES) return true
  return narrationWeight(trimmed) >= LONG_TEXT_CHARS
}

/** Record narration text for one step and re-derive the latest long-narration step. */
function recordNarration(
  state: TurnProcessState,
  step: number,
  text: string,
  durable: boolean,
): TurnProcessState {
  const known = state.narrationTextByStep.get(step) ?? ''
  const settled = state.durableNarrationSteps.has(step)
  // 耐久消息是该步骤正文的权威来源：首次到达时覆盖直播累积，之后按追加处理。
  const nextText = durable && !settled ? text : known + text
  const narrationTextByStep = new Map(state.narrationTextByStep)
  narrationTextByStep.set(step, nextText)
  const durableNarrationSteps = durable && !settled
    ? new Set([...state.durableNarrationSteps, step])
    : state.durableNarrationSteps
  const longNarrationStep = isLongNarration(nextText)
    ? Math.max(state.longNarrationStep ?? step, step)
    : state.longNarrationStep
  return { ...state, narrationTextByStep, durableNarrationSteps, longNarrationStep }
}

/** 坚祥：按顺序记下一行执行过程（同 seq 只记一次）。 */
function recordRow(state: TurnProcessState, seq: number, step: number): TurnProcessState {
  if (state.processRows.some(row => row.seq === seq)) return state
  return { ...state, processRows: [...state.processRows, { seq, step }] }
}

/** Whether one step's recorded Assistant data carries a tool call (then it is process material). */
function stepHasToolCall(turn: TurnLocation, step: number): boolean {
  for (const candidate of turn.steps) {
    const data: Readonly<AssistantChatData> | undefined = candidate.data.get('assistant-step')
    if (data?.step !== step) continue
    return data.blocks.some(block => block.kind === 'tool-call')
  }
  return false
}

/**
 * 坚祥：长中间正文锚点——最近一个跨过阈值的中间正文步骤，且该步骤没有工具调用。
 * @param turn - 所属回合。
 * @param state - 该回合的过程状态。
 * @returns 锚点的 seq 与 step；没有可折叠锚点时返回 null。
 */
function longNarrationAnchor(
  turn: TurnLocation,
  state: TurnProcessState,
): { readonly seq: number, readonly step: number } | null {
  const step = state.longNarrationStep
  if (step === undefined) return null
  const seq = state.assistantStartByStep.get(step)
  if (seq === undefined) return null
  if (stepHasToolCall(turn, step)) return null
  return { seq, step }
}

/**
 * 坚祥：执行中的尾巴窗口——还没有任何锚点时，把倒数第 TAIL_ROWS 行当折叠边界，
 * 于是最新 TAIL_ROWS 行照常显示，更早的执行过程持续折叠起来。
 * @param state - 该回合的过程状态。
 * @returns 边界行的 seq 与 step；行数不足 TAIL_ROWS 时返回 null（不折）。
 */
function tailWindowAnchor(state: TurnProcessState): { readonly seq: number, readonly step: number } | null {
  const rows = state.processRows
  if (rows.length <= TAIL_ROWS) return null
  return rows[rows.length - TAIL_ROWS] ?? null
}

function processSpec(state: TurnProcessState, turn: TurnLocation): TurnProcessSpec | null {
  const controlAnchorSeq = state.controlAnchorSeq
  if (controlAnchorSeq === undefined) return null
  const answer = latestAnswer(turn)
  const counts = {
    messageCount: answer === null
      ? state.messageCount
      : [...state.messageCountByStep]
        .filter(([step]) => step < answer.step)
        .reduce((total, [, count]) => total + count, 0),
    toolCallCount: state.toolCallCount,
    subagentCount: state.subagentCount,
  }
  if (answer === null) {
    // 坚祥：还没有最终输出时的两种锚点，按优先级取第一个可用的——
    // ① 长中间正文（该段保持可见、它上方折起来）；
    // ② 执行中的尾巴窗口（只留最后 TAIL_ROWS 行，更早的持续折叠）。
    // 两条都没有就维持官方的「不折」。
    const anchor = longNarrationAnchor(turn, state) ?? tailWindowAnchor(state)
    if (anchor !== null) {
      return {
        turn: turn.turn,
        controlAnchorSeq,
        processStartSeq: turn.start?.seq ?? controlAnchorSeq,
        answerAnchorSeq: anchor.seq,
        answerStep: anchor.step,
        inlineReasoning: false,
        messageCount: [...state.messageCountByStep]
          .filter(([step]) => step < anchor.step)
          .reduce((total, [, count]) => total + count, 0),
        toolCallCount: state.toolCallCount,
        subagentCount: state.subagentCount,
      }
    }
    return {
      turn: turn.turn,
      controlAnchorSeq,
      processStartSeq: controlAnchorSeq,
      answerAnchorSeq: null,
      answerStep: null,
      inlineReasoning: false,
      ...counts,
    }
  }
  const inlineReasoning = answer.blocks.some(block => block.kind === 'reasoning' && block.text.trim() !== '')
  const earlierAssistantSeq = Math.min(
    ...[...state.assistantStartByStep]
      .filter(([step]) => step < answer.step)
      .map(([, seq]) => seq),
  )
  const externalProcessSeq = Math.min(
    state.otherStartSeq ?? Number.POSITIVE_INFINITY,
    earlierAssistantSeq,
  )
  return {
    turn: turn.turn,
    controlAnchorSeq,
    processStartSeq: turn.start?.seq
      ?? (Number.isFinite(externalProcessSeq) ? externalProcessSeq : answer.finalNode.seq),
    answerAnchorSeq: answer.finalNode.seq,
    answerStep: answer.step,
    inlineReasoning,
    ...counts,
  }
}

function updateProcessState(state: TurnProcessState, event: ConversationEvent): TurnProcessState {
  let current = state
  // 坚祥：直播正文按步骤累积，用于长中间正文阈值判定。
  if (event.type === 'assistant/live-chunk' && event.data.chunk.type === 'text-delta') {
    current = recordNarration(current, event.data.step, event.data.chunk.text, false)
  }
  if (event.type === 'assistant/message'
    && event.surfaceOp === 'append'
    && hasAssistantReplyContent(toAssistantBlocks(event.data.message.content))) {
    const blocks = toAssistantBlocks(event.data.message.content)
    const messageCountByStep = new Map(current.messageCountByStep)
    messageCountByStep.set(event.data.step, (messageCountByStep.get(event.data.step) ?? 0) + 1)
    current = recordNarration(
      { ...current, messageCountByStep, messageCount: current.messageCount + 1 },
      event.data.step,
      narrationText(blocks),
      true,
    )
  }
  if (event.type === 'tool/call') {
    const subagent = isSubagentDelegationTool(event.data.name)
    const rawStep = (event.data as unknown as { step?: unknown }).step
    current = recordRow({
      ...current,
      toolCallCount: current.toolCallCount + (subagent ? 0 : 1),
      subagentCount: current.subagentCount + (subagent ? 1 : 0),
    }, event.seq, typeof rawStep === 'number' ? rawStep : -1)
  }
  const evidence = processEvidence(event)
  if (evidence === undefined) return current
  if (evidence.kind === 'other') {
    return current.otherStartSeq === undefined
      ? {
        ...current,
        otherStartSeq: evidence.seq,
        controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq),
      }
      : current
  }
  if (current.assistantStartByStep.has(evidence.step)) return current
  const assistantStartByStep = new Map(current.assistantStartByStep)
  assistantStartByStep.set(evidence.step, evidence.seq)
  return {
    ...recordRow(current, evidence.seq, evidence.step),
    assistantStartByStep,
    controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq),
  }
}

/** Turn-scoped process range and answer-boundary Definition. */
export const turnProcessDefinition: ConversationNodeDefinition<TurnProcessState> = {
  kind: 'turn-process',
  target: 'chat',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    const turn = eventTurn(event)
    if (turn === undefined) return null
    if (event.type === 'assistant/live-chunk'
      || event.type === 'assistant/message'
      || event.type === 'tool/call'
      || event.type === 'tool/result'
      || event.type === 'llm/retry'
      || event.type === 'step/start'
      || event.type === 'step/end'
      || event.type === 'turn/end') {
      return { id: String(turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('turn-process start requires turn/start')
    return {
      turn: match.event.data.turn,
      assistantStartByStep: new Map(),
      messageCountByStep: new Map(),
      narrationTextByStep: new Map(),
      durableNarrationSteps: new Set(),
      processRows: [],
      messageCount: 0,
      toolCallCount: 0,
      subagentCount: 0,
    }
  },
  update: (context, match) => updateProcessState(context.state, match.event),
  publication: (match) => {
    if (match.event.type === 'assistant/live-chunk') {
      const type = match.event.data.chunk.type
      return type === 'usage' || type === 'finish' ? 'none' : 'animation-frame'
    }
    return 'immediate'
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn') return null
    const state = context.state ?? fallbackState(context)
    if (state === undefined) return null
    const turn = turnLocation(context)
    if (turn === undefined) return null
    const current = context.current.get('chat') as ChatNode | null | undefined
    const latestStep = turn.steps.at(-1)
    if (previous?.kind === 'turn'
      && previous.key === 'turn-process'
      && current?.kind === 'turn-process'
      && current.data.answerAnchorSeq === null
      && current.data.controlAnchorSeq === state.controlAnchorSeq
      && current.data.messageCount === state.messageCount
      && current.data.toolCallCount === state.toolCallCount
      && current.data.subagentCount === state.subagentCount
      && turn.status !== 'closed'
      && latestStep?.status !== 'closed') return previous
    const spec = processSpec(state, turn)
    if (spec === null) return null
    if (previous?.kind === 'turn'
      && previous.turn === spec.turn
      && previous.key === 'turn-process'
      && sameTurnProcessSpec(previous.value, spec)) return previous
    return {
      kind: 'turn',
      turn: turn.turn,
      key: 'turn-process',
      value: spec,
    }
  },
  buildViewNode: (context) => {
    const turn = turnLocation(context)
    const data = turn?.data.get('turn-process')
    if (turn === undefined || data === undefined) return null
    const current = context.current.get('chat') as ChatNode | null | undefined
    const state = context.state
    if (current?.kind === 'turn-process'
      && state !== undefined
      && current.data.answerAnchorSeq === null
      && current.data.controlAnchorSeq === state.controlAnchorSeq
      && current.data.messageCount === state.messageCount
      && current.data.toolCallCount === state.toolCallCount
      && current.data.subagentCount === state.subagentCount
      && turn.status !== 'closed'
      && turn.steps.at(-1)?.status !== 'closed'
      && current.location === (context.start?.location ?? context.matches[0]?.location)) return current
    return chatNode(
      context,
      'turn-process',
      data.controlAnchorSeq + CHAT_SYNTHETIC_SEQ_OFFSETS.processControl,
      data,
    )
  },
}

/**
 * Register the Turn-scoped process disclosure projection.
 * @param ctx - owning UI Conversation context.
 */
export function registerTurnProcess(ctx: Context): void {
  ctx.uiConversation.events.register(turnProcessDefinition)
}
