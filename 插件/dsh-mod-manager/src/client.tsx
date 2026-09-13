/**
 * 坚祥模组管理器 —— 浏览器半边。
 * 顶层插件先 $mount 出 jxMods Remote 命名空间服务，再用一个带
 * `remote.jxMods` 注入声明的子插件注册「坚祥模组」标签页
 * （写法参照官方 ui-settings-plugin-inventory 与 api-remotes 客户端装配）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { JxModsSnapshot } from './types.ts'
import { TYPERT_REMOTE } from './remote-client.ts'
import { JxModsTab, type JxModsTabInjected } from './Tab.tsx'
import { en, zh, type JxModsLocaleKey } from './locales.ts'

export type { JxModsTabInjected }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 坚祥模组管理器文案。 */
    'settings.jxMods': JxModsLocaleKey
  }
}

/** 本插件拥有的词典命名空间。 */
export const NS = 'settings.jxMods'

/** 顶层插件所需服务（$mount 的载体；命名空间服务由本插件自己挂出来）。 */
export const inject = ['remote']

/** 完整组件属性（类型导出，供槽契约消费）。 */
export type JxModsTabSlotProps = PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.jxMods'>
  & JxModsTabInjected

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
type JxModsNamespace = {
  list(): Promise<RemoteResult<JxModsSnapshot>>
  setEnabled(id: string, enabled: boolean): Promise<RemoteResult<{ restartNeeded: boolean }>>
  rescan(): Promise<RemoteResult<JxModsSnapshot>>
}

/** 挂载 jxMods Remote，并在命名空间就绪后贡献「坚祥模组」标签页。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  const disposeTab = ctx.plugin({
    name: 'dsh-mod-manager/tab',
    inject: ['slots', 'locale', 'remote.jxMods'],
    apply(child: ClientContext) {
      child.effect(() => child.locale.register(NS, { zh, en }), 'jx-mod-manager: dictionaries')

      const t = child.locale.bind(NS)
      const unwrap = <T,>(result: RemoteResult<T>, what: string): T => {
        if (!result.ok) throw new Error(`${what} failed: ${result.error.code}: ${result.error.message}`)
        return result.value
      }
      const remote = (child as unknown as { remote: { jxMods: JxModsNamespace } }).remote
      const injected = (): JxModsTabInjected => ({
        list: async () => unwrap(await remote.jxMods.list(), 'jxMods.list'),
        setEnabled: async (id, enabled) => unwrap(await remote.jxMods.setEnabled(id, enabled), 'jxMods.setEnabled'),
        rescan: async () => unwrap(await remote.jxMods.rescan(), 'jxMods.rescan'),
      })

      child.slots.inject('settings.plugins.tab', () => child.slots.register({
        name: 'settings.plugins.tab',
        id: 'jxMods',
        order: 20,
        label: () => t('tab'),
        locale: NS,
        inject: injected,
      }, JxModsTab as (props: JxModsTabSlotProps) => unknown))
    },
  })

  return async () => {
    await disposeTab()
    await disposeMount()
  }
}
