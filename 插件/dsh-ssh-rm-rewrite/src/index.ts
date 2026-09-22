/**
 * dsh-ssh-rm-rewrite —— 宿主单面（拆分自 dsh-ssh-guard 的改写半边）。
 *
 * 挂官方 tools/pre-execute 与 tools/post-execute 瀑布缝：远端 rm（ssh 载体、
 * 结构简单）→ 原地改写为「移入远端回收站」，工具结果追加标注让模型明确知道
 * 命令被改过、效果等价。灾难级检测与 AI 审查在 dsh-ssh-review。
 * 自身任何异常一律放行（永不阻断正常工具流）。无浏览器半边（无 UI）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeRewrite } from './rewrite.ts'
import type { RewriteConfig, RewriteRecord } from './types.ts'

export { analyzeRewrite }
export const name = 'dsh-ssh-rm-rewrite'

interface ExecLike {
  readonly callId: string
  readonly name: string
  readonly arguments: { command?: unknown }
  readonly agent?: { session: { id: string } }
}

const DEFAULT_CONFIG: RewriteConfig = {
  trashDir: '~/.jx-trash',
  retentionDays: 7,
}

export function apply(ctx: Context, config: Partial<RewriteConfig> = {}): void {
  void ctx
  const merged: RewriteConfig = { ...DEFAULT_CONFIG, ...config }
  // 记录放模组根目录（lib/ 会被每次重建清空）。
  const recordsFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'records.jsonl')
  const pendingNotes = new Map<string, string>()

  const record = (entry: Omit<RewriteRecord, 't'> & { rewritten?: string }): void => {
    try {
      const row: RewriteRecord = { t: new Date().toISOString(), ...entry }
      appendFileSync(recordsFile, `${JSON.stringify(row)}\n`)
    } catch { /* 记录失败不影响主流程 */ }
  }

  const pre = async (exec: ExecLike, next: () => Promise<unknown>): Promise<unknown> => {
    try {
      if (exec.name !== 'bash' && exec.name !== 'pwsh') return await next()
      const command = typeof exec.arguments?.command === 'string' ? exec.arguments.command : ''
      if (command === '') return await next()
      const verdict = analyzeRewrite(command, merged)
      if (verdict.kind === 'pass') return await next()

      let rewrittenOk = false
      try {
        // 官方缝不提供参数替换，但 pre-execute 收到的是注册表持有的活对象，
        // 顶层 arguments 槽可赋值（值本身深冻结，整体替换为新的冻结对象）。
        ;(exec as unknown as { arguments: unknown }).arguments = deepFreeze({ ...exec.arguments, command: verdict.rewritten })
        rewrittenOk = true
      } catch { /* 上游冻结策略变化时降级为问人 */ }
      if (rewrittenOk) {
        pendingNotes.set(exec.callId, verdict.note)
        record({ action: 'rewrite', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: verdict.note, rewritten: verdict.rewritten })
        return await next()
      }
      record({ action: 'rewrite-fallback-ask', tool: exec.name, session: exec.agent?.session.id ?? '', command, note: verdict.note })
      return { kind: 'ask', reason: `安全闸：远端删除命令需要确认。影响说明：${verdict.note}` }
    } catch {
      return await next()
    }
  }

  const post = async (exec: ExecLike, result: { content?: Array<{ type: string, text?: string }> }, next: () => Promise<unknown>): Promise<unknown> => {
    const accepted = await next()
    const note = pendingNotes.get(exec.callId)
    pendingNotes.delete(exec.callId)
    if (note === undefined) return accepted
    try {
      const content = [...(result.content ?? []), { type: 'text', text: note }]
      return { kind: 'accept', content }
    } catch {
      return accepted
    }
  }

  ;(ctx as unknown as { on: (name: string, fn: never) => void }).on('tools/pre-execute', pre as never)
  ;(ctx as unknown as { on: (name: string, fn: never) => void }).on('tools/post-execute', post as never)
}
