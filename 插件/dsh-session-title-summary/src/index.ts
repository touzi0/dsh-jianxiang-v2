/**
 * 分段总结式会话标题（坚祥定制，原 packages/session/session-title-summary-llm 迁移为模组）。
 *
 * 标题是顿号连接的短语列表，首短语锚定会话初始话题；每 interval 条新用户消息
 * 滚动重生成一次，锚点恒置首位。重启后按会话日志重建节流与锚点状态；照抄输入
 * 原文的短语（≥rawQuoteChars 字）被丢弃。替换原生 session-title-llm。
 *
 * 新版适配：deepFreeze 改从 @deepseek-ai/dsh-util-values 导入；register 返回的
 * disposer 为 Promise（不使用）；generate 返回 {title, messageSeqs, model?} 契约不变。
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deadline, MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'
import { SESSION_TITLE_TIMEOUT_CODE } from '@deepseek-ai/dsh-session-title-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'

export const name = 'dsh-session-title-summary'
export const inject = ['sessionTitle', 'llm', 'sessions']

export interface Config {
  readonly interval: number
  readonly recentCount: number
  readonly messageByteCap: number
  readonly maxPhrases: number
  readonly minPhrases: number
  readonly maxTitleBytes: number
  readonly maxOutputTokens: number
  readonly timeoutMs: number
  readonly temperature: number
  readonly rawQuoteChars: number
  readonly provider?: string
  readonly model?: string
}

export const Config: z<Config> = z.object({
  interval: z.number().step(1).min(1).required(),
  recentCount: z.number().step(1).min(1).required(),
  messageByteCap: z.number().step(1).min(1).required(),
  maxPhrases: z.number().step(1).min(1).required(),
  minPhrases: z.number().step(1).min(1).required(),
  maxTitleBytes: z.number().step(1).min(1).required(),
  maxOutputTokens: z.number().step(1).min(1).required(),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
  temperature: z.number().min(0).required(),
  rawQuoteChars: z.number().step(1).min(1).required(),
  provider: z.string(),
  model: z.string(),
})

type Policy = Config

// —— 与官方 dsh-session-title / dsh-session 的结构化类型（仅类型，构建时擦除） ——

interface TitleUserMessage { seq: number; text: string }
interface TitleRoute { provider: string; model: string }
interface TitleEvent {
  type: string
  data: {
    title?: string
    messageSeqs?: number[]
    source?: { kind?: string; provider?: string }
  }
}
interface TitleSession {
  readonly id: string
  /** 0.1.6 起 Session 以 snapshotEvents() 暴露事件快照（旧 events getter 已移除）。 */
  snapshotEvents(): readonly TitleEvent[]
  append(type: string, data: unknown): unknown
}
interface TitleRequest {
  readonly session: TitleSession
  readonly messages: readonly TitleUserMessage[]
  readonly route?: TitleRoute
  readonly signal: AbortSignal
}
interface TitleResult {
  readonly title: string
  readonly messageSeqs: readonly number[]
  readonly model?: TitleRoute
}

export type SessionTitlePromptVariant = 'initial' | 'rolling'

export interface PhraseGuard {
  readonly texts: readonly string[]
  readonly minChars: number
}

export interface RestoredTitleState {
  readonly anchor?: string
  readonly covered?: number
}

const SPLIT_RE = /[、，,;；|]+/
const TAIL_PUNCT_RE = /[。！？!?]+$/

function cleanPhrase(part: string): string {
  return part.replace(/\s+/g, ' ').trim().replace(TAIL_PUNCT_RE, '').trim()
}

function isSubstringDuplicate(candidate: string, existing: readonly string[]): boolean {
  return existing.some(item => candidate.includes(item) || item.includes(candidate))
}

function isRawQuote(phrase: string, guard: PhraseGuard): boolean {
  return phrase.length >= guard.minChars && guard.texts.some(text => text.includes(phrase))
}

export function parsePhrases(
  raw: string,
  currentTitle: string | undefined,
  config: Pick<Config, 'maxPhrases' | 'minPhrases'>,
  guard?: PhraseGuard,
): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const part of String(raw).split(SPLIT_RE)) {
    const phrase = cleanPhrase(part)
    if (phrase.length === 0) continue
    if (guard !== undefined && isRawQuote(phrase, guard)) continue
    const key = phrase.toLowerCase()
    if (seen.has(key)) continue
    if (isSubstringDuplicate(phrase, unique)) continue
    seen.add(key)
    unique.push(phrase)
    if (unique.length >= config.maxPhrases) break
  }
  if (unique.length < config.minPhrases && currentTitle !== undefined) {
    for (const part of String(currentTitle).split(SPLIT_RE)) {
      const phrase = cleanPhrase(part)
      if (phrase.length === 0) continue
      if (guard !== undefined && isRawQuote(phrase, guard)) continue
      const key = phrase.toLowerCase()
      if (seen.has(key)) continue
      if (isSubstringDuplicate(phrase, unique)) continue
      seen.add(key)
      unique.push(phrase)
      break
    }
  }
  return unique
}

export function mergeAnchor(anchor: string, phrases: readonly string[], maxPhrases: number): string[] {
  const anchorKey = anchor.toLowerCase()
  const rest = phrases.filter(phrase => {
    const key = phrase.toLowerCase()
    return key !== anchorKey && !phrase.includes(anchor) && !anchor.includes(phrase)
  })
  return [anchor, ...rest].slice(0, maxPhrases)
}

function firstFreshPhrase(title: string, guard: PhraseGuard): string | undefined {
  for (const part of String(title).split(SPLIT_RE)) {
    const phrase = cleanPhrase(part)
    if (phrase.length === 0) continue
    if (isRawQuote(phrase, guard)) continue
    return phrase
  }
  return undefined
}

export function restoreFromLog(
  events: readonly TitleEvent[],
  provider: string,
  guard: PhraseGuard,
): RestoredTitleState {
  let anchor: string | undefined
  let covered: number | undefined
  for (const event of events) {
    if (event.type !== 'session/title') continue
    const source = event.data.source
    if (source?.kind !== 'provider' || source.provider !== provider) continue
    for (const seq of event.data.messageSeqs ?? []) covered = Math.max(covered ?? seq, seq)
    if (anchor === undefined && event.data.title !== undefined) anchor = firstFreshPhrase(event.data.title, guard)
  }
  return {
    ...(anchor === undefined ? {} : { anchor }),
    ...(covered === undefined ? {} : { covered }),
  }
}

export function systemPrompt(variant: SessionTitlePromptVariant): string {
  if (variant === 'initial') {
    return [
      '你是会话标题助手。你会收到一个 AI 助手会话的开始消息。',
      '任务：为这个新会话生成初始标题。',
      '标题格式：恰好 1 个短语，2~8 个字。',
      '规则：',
      '1. 短语必须完整概括会话的核心意图，让人一眼知道这个会话是干什么的；',
      '2. 必须是概括性的名词短语，严禁照抄或微改用户原话；',
      '3. 不要动词化描述，不要标点、引号、编号、解释或前后缀；',
      '4. 只输出这一行短语，不要顿号及其他任何字符。',
    ].join('\n')
  }
  return [
    '你是会话标题助手。你会收到一个 AI 助手会话的信息：当前标题和最近几轮用户消息。',
    '任务：生成新的会话标题。',
    '标题格式：用顿号"、"分隔的短语列表，每个短语 2~6 个字，概括会话中的主要话题。',
    '规则：',
    '1. 当前标题的第一个短语是会话的初始话题，必须原样保留在第一位，一字不改；',
    '2. 最近几轮消息涉及的新话题紧跟其后；',
    '3. 从当前标题其余短语中最多保留 1 个仍然重要的旧话题放在末尾；',
    '4. 语义相近或重复的话题必须合并，同一个意思只保留一个短语；',
    '5. 除初始话题外通常再给 1~2 个短语，整个标题最多 4 个短语，宁少勿滥；',
    '6. 每个短语必须是概括性的名词短语，严禁照抄或微改用户原话，不要动词化描述，不要标点、引号、编号、解释或前后缀；',
    '7. 只输出一行，除顿号外不要任何其他字符。',
  ].join('\n')
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

function frameInput(
  variant: SessionTitlePromptVariant,
  currentTitle: string | undefined,
  recent: readonly TitleUserMessage[],
  config: Pick<Config, 'messageByteCap'>,
): string {
  const lines = recent.map((message, index) =>
    `${index + 1}. ${truncateUtf8(message.text, config.messageByteCap)}`)
  if (variant === 'initial') {
    return `会话开始消息：\n${lines.join('\n')}`
  }
  return `当前标题：${currentTitle ?? '（无）'}\n最近几轮用户消息：\n${lines.join('\n')}`
}

function routeOf(request: TitleRequest, policy: Pick<Config, 'provider' | 'model'>): TitleRoute | undefined {
  if (policy.provider !== undefined && policy.model !== undefined) {
    return { provider: policy.provider, model: policy.model }
  }
  return request.route
}

export function apply(ctx: Context, config: Config): void {
  const policy: Policy = deepFreeze({ ...config })
  const titleProvider = SessionTitleProviderId(name)
  const covered = new Map<string, number>()
  const anchored = new Map<string, string>()
  ctx.on('session/disposed', (session: { id: string }) => {
    covered.delete(session.id)
    anchored.delete(session.id)
  })

  void ctx.sessionTitle.register({
    id: titleProvider,
    automatic: 'all-prompts',
    async generate(request: TitleRequest): Promise<TitleResult> {
      const first = request.messages[0]
      if (first === undefined) throw new Error('dsh-session-title-summary: at least one human message is required')
      const session = request.session
      const latestSeq = request.messages.at(-1)?.seq ?? first.seq
      if (!covered.has(session.id) && !anchored.has(session.id)) {
        const restored = restoreFromLog(session.snapshotEvents(), name, {
          texts: request.messages.map(message => message.text),
          minChars: policy.rawQuoteChars,
        })
        if (restored.covered !== undefined) covered.set(session.id, restored.covered)
        if (restored.anchor !== undefined) anchored.set(session.id, restored.anchor)
      }
      const lastCovered = covered.get(session.id)
      const current = ctx.sessionTitle.get(session)
      const currentTitle = current?.title

      const freshCount = request.messages.filter(message => message.seq > (lastCovered ?? -Infinity)).length
      const adopt = lastCovered === undefined
      const isRefresh = !adopt && freshCount === 0
      if (!adopt && !isRefresh && freshCount < policy.interval) {
        return {
          title: currentTitle ?? truncateUtf8(first.text, policy.maxTitleBytes),
          messageSeqs: [first.seq],
        }
      }

      const variant: SessionTitlePromptVariant = adopt ? 'initial' : 'rolling'
      const recent = request.messages.slice(-policy.recentCount)
      const guard: PhraseGuard = {
        texts: recent.map(message => message.text),
        minChars: policy.rawQuoteChars,
      }
      const input = frameInput(variant, currentTitle, recent, policy)
      const route = routeOf(request, policy)
      if (route === undefined) {
        throw new Error('dsh-session-title-summary: no logged request route is available; configure provider and model together')
      }
      const message = createUserMessage({
        content: [{ type: 'text', text: input }],
        source: { kind: 'plugin', plugin: 'dsh-session-title-summary' },
      })
      const system = systemPrompt(variant)
      using callDeadline = deadline(request.signal, policy.timeoutMs, SESSION_TITLE_TIMEOUT_CODE)
      const options = deepFreeze({
        provider: route.provider,
        model: route.model,
        messages: [message],
        system,
        temperature: policy.temperature,
        maxTokens: policy.maxOutputTokens,
        sessionId: session.id,
        purpose: 'session-title',
        signal: callDeadline.signal,
      })
      session.append('session/title-llm-request', {
        titleProvider: name,
        messageSeqs: recent.map(item => item.seq),
        route,
        system,
        messages: [message],
        maxTokens: policy.maxOutputTokens,
      })
      callDeadline.signal.throwIfAborted()
      const assembler = new BlockAssembler()
      for await (const chunk of ctx.llm.stream(options)) {
        callDeadline.signal.throwIfAborted()
        assembler.push(chunk)
      }
      callDeadline.signal.throwIfAborted()
      const text = assembler.blocks()
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(' ')
      const phrases = parsePhrases(
        text,
        adopt ? undefined : currentTitle,
        adopt ? { maxPhrases: policy.maxPhrases, minPhrases: 1 } : policy,
        guard,
      )
      const anchor = anchored.get(session.id)
      let titlePhrases: readonly string[]
      if (anchor === undefined) {
        const firstPhrase = phrases.at(0)
        if (firstPhrase === undefined) {
          throw new Error('dsh-session-title-summary: no usable phrases in model output')
        }
        anchored.set(session.id, firstPhrase)
        titlePhrases = phrases
      } else {
        titlePhrases = mergeAnchor(anchor, phrases, policy.maxPhrases)
      }
      covered.set(session.id, latestSeq)
      return {
        title: truncateUtf8(titlePhrases.join('、'), policy.maxTitleBytes).trimEnd(),
        messageSeqs: recent.map(item => item.seq),
        model: route,
      }
    },
  })
}
