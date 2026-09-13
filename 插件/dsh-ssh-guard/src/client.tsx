/**
 * dsh-ssh-guard —— 浏览器半边。
 * 顶层 $mount 自有 jxSshGuard 命名空间，子插件注册「安全审查」标签页
 * （结构沿用 dsh-mod-manager / dsh-mode-switch 验证过的模式）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { GuardTab } from './Tab.tsx'
import { TYPERT_REMOTE } from './remote-client.ts'
import type { GuardRecord } from './types.ts'

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
interface SessionsState { current?: string }
interface JxSshGuardRemoteFace {
  list(limit: number): Promise<RemoteResult<GuardRecord[]>>
  clear(): Promise<RemoteResult<{ cleared: true }>>
}

export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeTab = ctx.plugin({
    name: 'dsh-ssh-guard/tab',
    inject: ['slots', 'remote.jxSshGuard'],
    apply(child: ClientContext) {
      const remote = (child as unknown as { remote: { jxSshGuard: JxSshGuardRemoteFace } }).remote
      const unwrap = <T,>(result: RemoteResult<T>): T => {
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      }
      child.slots.inject('settings.plugins.tab', () => child.slots.register({
        name: 'settings.plugins.tab',
        id: 'jxSshGuard',
        order: 22,
        label: () => '安全审查',
        inject: (): { hooks: Record<string, never>, list: (limit: number) => Promise<GuardRecord[]>, clear: () => Promise<{ cleared: true }> } => ({
          hooks: {},
          list: async (limit: number) => unwrap(await remote.jxSshGuard.list(limit)),
          clear: async () => unwrap(await remote.jxSshGuard.clear()),
        }),
      }, GuardTab as (props: Record<string, unknown>) => unknown))
    },
  })

  return async () => {
    await disposeTab()
    await disposeMount()
  }
}

// zod 在此文件仅被 remote-client.ts 间接使用；显式引用避免打包器摇树时丢失副作用。
void z
