/**
 * dsh-ssh-review —— 浏览器半边。
 * 顶层 $mount 自有 jxSshReview 命名空间，子插件注册「安全审查」标签页
 * （结构沿用 dsh-mod-manager / dsh-mode-switch 验证过的模式）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { ReviewTab } from './Tab.tsx'
import { TYPERT_REMOTE } from './remote-client.ts'
import type { ReviewRecord } from './types.ts'

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
interface SessionsState { current?: string }
interface JxSshReviewRemoteFace {
  list(limit: number): Promise<RemoteResult<ReviewRecord[]>>
  clear(): Promise<RemoteResult<{ cleared: true }>>
}

export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeTab = ctx.plugin({
    name: 'dsh-ssh-review/tab',
    inject: ['slots', 'remote.jxSshReview'],
    apply(child: ClientContext) {
      const remote = (child as unknown as { remote: { jxSshReview: JxSshReviewRemoteFace } }).remote
      const unwrap = <T,>(result: RemoteResult<T>): T => {
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      }
      child.slots.inject('settings.plugins.tab', () => child.slots.register({
        name: 'settings.plugins.tab',
        id: 'jxSshReview',
        order: 22,
        label: () => '安全审查',
        inject: (): { hooks: Record<string, never>, list: (limit: number) => Promise<ReviewRecord[]>, clear: () => Promise<{ cleared: true }> } => ({
          hooks: {},
          list: async (limit: number) => unwrap(await remote.jxSshReview.list(limit)),
          clear: async () => unwrap(await remote.jxSshReview.clear()),
        }),
      }, ReviewTab as (props: Record<string, unknown>) => unknown))
    },
  })

  return async () => {
    await disposeTab()
    await disposeMount()
  }
}

// zod 在此文件仅被 remote-client.ts 间接使用；显式引用避免打包器摇树时丢失副作用。
void z
