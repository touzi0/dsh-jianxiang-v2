/**
 * dsh-ssh-guard —— 宿主半边。
 *
 * 挂官方 tools/pre-execute 与 tools/post-execute 瀑布缝：
 *  - 远端 rm（ssh 载体、结构简单）→ 原地改写为「移入远端回收站」，工具结果
 *    追加标注让模型明确知道命令被改过、效果等价（post-execute 内容增补）；
 *  - 灾难级模式 → 返回 ask 走官方审批弹窗，理由是人话影响说明（不贴原始命令）；
 *  - 可选 AI 审查（jx.config.review）→ 中间地带命令由小模型快评放行/建议问人，
 *    全部动作记入 records.jsonl，前端「安全审查」标签页可查。
 * 自身任何异常一律放行（guard 永不阻断正常工具流）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze } from './guard.ts'
import type { GuardConfig, GuardRecord } from './types.ts'

export { analyze }
export const name = 'dsh-ssh-guard'

// —— 结构化类型（仅类型，构建时擦除） ——

interface ExecLike {
  readonly callId: string
  readonly name: string
  readonly arguments: { command?: unknown }
  readonly agent?: { session: { id: string } }
}
interface LlmService {
  stream(options: unknown): AsyncIterable<unknown>
}
type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
type PresetRow = { id: string; trust: 'system' | 'user'; name?: string; description?: string; broken?: string }
type SessionsState = { current?: string }

const DEFAULT_CONFIG: GuardConfig = {
  trashDir: '~/.jx-trash',
  retentionDays: 7,
  review: false,
  reviewProvider: 'deepseek-official',
  reviewModel: 'deepseek-chat',
}

export class JxSshGuardGateway extends TypertRemoteService {
  static inject = ['llm']

  /** 改写/审查后待标注的调用（callId → 给模型看的说明）。 */
  private readonly pendingNotes = new Map<string, string>()
  /** 记录文件路径（模组目录内 records.jsonl）。 */
  private readonly recordsFile: string
  private readonly config: GuardConfig

  constructor(ctx: Context, config: Partial<GuardConfig> = {}) {
    super(ctx, 'jxSshGuard')
    this.config = { ...DEFAULT_CONFIG, ...config }
    // 记录放模组根目录（lib/ 会被每次重建清空）。
    this.recordsFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'records.jsonl')
    this.installHooks()
  }

  // —— 审批/改写主流程 ——

  private installHooks(): void {
    const pre = async (exec: ExecLike, next: () => Promise<unknown>): Promise<unknown> => {
      try {
        if (exec.name !== 'bash' && exec.name !== 'pwsh') return await next()
        const command = typeof exec.arguments?.command === 'string' ? exec.arguments.command : ''
        if (command === '') return await next()
        const verdict = analyze(command, this.config)
        if (verdict.kind === 'pass') return await next()

        if (verdict.kind === 'rewrite') {
          let rewrittenOk = false
          try {
            // 官方缝不提供参数替换，但 pre-execute 收到的是注册表持有的活对象，
            // 顶层 arguments 槽可赋值（值本身深冻结，整体替换为新的冻结对象）。
            ;(exec as unknown as { arguments: unknown }).arguments = deepFreeze({ ...exec.arguments, command: verdict.rewritten })
            rewrittenOk = true
          } catch { /* 上游冻结策略变化时降级为问人 */ }
          if (rewrittenOk) {
            this.pendingNotes.set(exec.callId, verdict.note)
            this.record({ action: 'rewrite', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: verdict.note, rewritten: verdict.rewritten })
            return await next()
          }
          this.record({ action: 'rewrite-fallback-ask', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: verdict.note })
          return { kind: 'ask', reason: `安全闸：远端删除命令需要确认。影响说明：${verdict.note}` }
        }

        if (verdict.kind === 'catastrophic') {
          this.record({ action: 'ask-catastrophic', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: verdict.reasonZh })
          return { kind: 'ask', reason: `安全闸：${verdict.reasonZh}。如果这不是本次任务的明确意图，请拒绝。` }
        }

        // reviewNeeded：开启 AI 审查才处理，否则放行
        if (!this.config.review) return await next()
        const review = await this.aiReview(exec, command)
        if (review === undefined) {
          this.record({ action: 'ai-error', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: '审查调用失败，按放行处理' })
          return await next()
        }
        if (review.decision === 'ask') {
          this.record({ action: 'ai-ask', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: review.impact })
          return { kind: 'ask', reason: `AI 安全审查建议确认：${review.impact}` }
        }
        this.record({ action: 'ai-allow', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: review.impact })
        this.pendingNotes.set(exec.callId, `[jx-ssh-guard] AI 安全审查已通过（${review.impact}）。`)
        return await next()
      } catch {
        return await next()
      }
    }

    const post = async (exec: ExecLike, result: { content?: Array<{ type: string, text?: string }> }, next: () => Promise<unknown>): Promise<unknown> => {
      const accepted = await next()
      const note = this.pendingNotes.get(exec.callId)
      this.pendingNotes.delete(exec.callId)
      if (note === undefined) return accepted
      try {
        const content = [...(result.content ?? []), { type: 'text', text: note }]
        return { kind: 'accept', content }
      } catch {
        return accepted
      }
    }

    ;(this.ctx as unknown as { on: (name: string, fn: never) => void }).on('tools/pre-execute', pre as never)
    ;(this.ctx as unknown as { on: (name: string, fn: never) => void }).on('tools/post-execute', post as never)
  }

  // —— AI 安全审查（可选，小额快评） ——

  private async aiReview(exec: ExecLike, command: string): Promise<{ decision: 'allow' | 'ask', impact: string } | undefined> {
    try {
      const llm = (this.ctx as unknown as { llm?: LlmService }).llm
      if (llm === undefined) return undefined
      const system = [
        '你是服务器命令安全审查员。用户代理正要在远程服务器上执行命令。',
        '判断它是否会造成「大规模、不可逆」的破坏（整盘/整库/整目录树删除、覆写设备、停机、波及无关数据）。',
        '普通的单文件删除、配置修改、服务重启、可恢复的操作一律判 allow。',
        '只输出一行严格 JSON：{"decision":"allow"或"ask","impact":"一句中文说明该命令的目的与最坏影响，给非技术用户看"}',
      ].join('\n')
      const message = createUserMessage({
        content: [{ type: 'text', text: command.slice(0, 4000) }],
        source: { kind: 'plugin', plugin: 'dsh-ssh-guard' },
      })
      const options = deepFreeze({
        provider: this.config.reviewProvider,
        model: this.config.reviewModel,
        messages: [message],
        system,
        temperature: 0,
        maxTokens: 200,
        sessionId: exec.agent?.session.id,
        signal: AbortSignal.timeout(20000),
      })
      const assembler = new BlockAssembler()
      for await (const chunk of llm.stream(options)) assembler.push(chunk)
      const text = assembler.blocks()
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(' ')
      const match = /\{[\s\S]*\}/.exec(text)
      if (match === null) return undefined
      const parsed = JSON.parse(match[0]) as { decision?: unknown, impact?: unknown }
      if (parsed.decision !== 'allow' && parsed.decision !== 'ask') return undefined
      return { decision: parsed.decision, impact: typeof parsed.impact === 'string' ? parsed.impact.slice(0, 300) : '（AI 未给出说明）' }
    } catch {
      return undefined
    }
  }

  // —— 记录（JSONL 追加；读取倒序） ——

  private record(entry: Omit<GuardRecord, 't'> & { rewritten?: string }): void {
    try {
      const record: GuardRecord = { t: new Date().toISOString(), ...entry }
      appendFileSync(this.recordsFile, `${JSON.stringify(record)}\n`)
    } catch { /* 记录失败不影响主流程 */ }
  }

  /** 最近的安全闸记录（倒序）。 */
  async list(limit: number): Promise<GuardRecord[]> {
    const max = Math.max(1, Math.min(500, Math.floor(limit) || 100))
    try {
      if (!existsSync(this.recordsFile)) return []
      const lines = readFileSync(this.recordsFile, 'utf8').split('\n').filter(line => line.trim().length > 0)
      const records = lines.map(line => { try { return JSON.parse(line) as GuardRecord } catch { return null } })
        .filter((record): record is GuardRecord => record !== null)
      return records.slice(-limit).reverse()
    } catch {
      return []
    }
  }

  /** 清空记录。 */
  async clear(): Promise<{ cleared: true }> {
    try {
      writeFileSync(this.recordsFile, '')
    } catch { /* 忽略 */ }
    return { cleared: true }
  }
}

// typert-protocol 的远程方法标记（等价 @Remote('list'/'clear')）。
const REMOTE_METHODS_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'
const directMarker = (method: string) => Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) })
Object.defineProperty(JxSshGuardGateway.prototype, REMOTE_METHODS_KEY, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([directMarker('list'), directMarker('clear')]),
  }),
})

export default JxSshGuardGateway
