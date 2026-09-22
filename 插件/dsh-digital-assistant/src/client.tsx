/**
 * 数字助理 —— 浏览器半边。
 *
 * 入口的呈现方式：**克隆官方「新建会话」那个按钮**，插到它正下方——这样样式、折叠态、
 * 悬停态天然与它一致（同一批 CSS Module 哈希类名），看起来就是同级的两项。
 * 为什么不注册官方 `sidebar.panellist`：那个槽渲染的是「全局面板行」，样式由 shell
 * 固定，做不到「新建会话」同款。panellist 注册仍保留作兜底（万一 DOM 注入失败至少还有
 * 入口），注入成功时用一条 CSS 把那行藏掉，避免出现两次。
 *
 * 官方 CSS Modules 的类名形态是 `[hash]_[local]`（见 packages/client/tsdown.client.ts:563），
 * 所以按类名里的 `newSession` 就能精确定位那个按钮（品牌行按钮的类名是 `…_brand`，不会误命中）。
 *
 * 只依赖平台基线里的模块（react、ui-primitives）与 Cordis 服务，不 import 任何别的功能插件的值。
 */
import { useEffect, useRef, useState } from 'react'
import { IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'
import { en, NS, zh } from './locales.ts'

/** 侧边栏行的 id，必须与 main 面板的 key 一致（兜底路径用）。 */
export const PANEL_ID = 'digital-assistant'

/** 标记我们插进侧边栏的那个按钮。 */
const ENTRY_ATTR = 'data-jx-assistant-entry'

/** 注入样式的标识，便于卸载时精确清理。 */
const STYLE_ID = 'jx-digital-assistant-entry-style'

/** 顶层插件先挂 Remote 命名空间服务（jxAssistant 由 apply 里的 $mount 产生，不能写进 inject）。 */
export const inject = ['remote']

type RemoteResult<T> = { ok: true; value: T } | { ok: false, error: { code: string, message: string } }

interface AssistantRemote {
  ensure: () => Promise<RemoteResult<{ sessionId: string }>>
  status: () => Promise<RemoteResult<{ sessionId: string, cwd: string, running: boolean, dispatched: number }>>
}

/**
 * 找官方「新建会话」按钮：它的类名形如 `[hash]_newSession`。
 * @returns 按钮元素；页面还没渲染出来时是 undefined。
 */
function findNewSessionButton(): HTMLElement | undefined {
  for (const element of document.querySelectorAll('button')) {
    const className = element.getAttribute('class') ?? ''
    if (className.includes('newSession') && !className.includes('newSessionLabel')) return element
  }
  return undefined
}

/** 官方 IconUserOutline16 的路径，按原按钮的尺寸渲染成一个小人。 */
function userIconSvg(size: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + '<path d="M11.0307 5.46369C11.0305 3.78995 9.6734 2.43357 7.99961 2.43357C6.32601 2.43379 4.96972 3.79009 4.96949 5.46369C4.96949 7.13748 6.32587 8.49455 7.99961 8.49477C9.67354 8.49477 11.0307 7.13762 11.0307 5.46369ZM12.3163 5.46369C12.3163 7.84777 10.3837 9.78042 7.99961 9.78042C5.61572 9.7802 3.68288 7.84763 3.68288 5.46369C3.6831 3.07993 5.61586 1.14718 7.99961 1.14695C10.3836 1.14695 12.3161 3.0798 12.3163 5.46369Z" fill="currentColor"/>'
    + '<path d="M8.00002 10.3316C11.7343 10.3316 14.1864 11.8997 15.0387 14.4445L14.4292 14.6483L13.8197 14.8531C13.1955 12.9893 11.3673 11.6182 8.00002 11.6182C4.63277 11.6182 2.80455 12.9893 2.18031 14.8531L1.5708 14.6483L0.961304 14.4445C1.81368 11.8997 4.26579 10.3316 8.00002 10.3316Z" fill="currentColor"/>'
    + '</svg>'
}

/**
 * 打开失败时让它在界面上看得见（只在控制台报错的话，用户只会觉得「点了没反应」）。
 * @param button - 入口按钮。
 * @param reason - 失败原因，写进 title 供排查。
 */
function flashFailure(button: HTMLElement, reason: unknown): void {
  const span = [...button.querySelectorAll('span')].find(item => (item.textContent ?? '').trim() !== '')
  if (span === undefined) return
  const original = span.textContent
  span.textContent = '数字助理（打不开）'
  button.setAttribute('title', String(reason))
  window.setTimeout(() => {
    span.textContent = original
    button.removeAttribute('title')
  }, 6000)
}

/**
 * 把「数字助理」按钮插到官方「新建会话」正下方，并持续维护它。
 * @param enter - 点击后要做的事（保证会话存在并打开它）。
 * @param labelOf - 当前界面的入口文案。必须取自官方 locale 服务：`document.documentElement.lang`
 *   在页面早期还是空的，用它算出来的文案会和官方词典给出的对不上，兜底面板行就藏不掉。
 * @returns dispose 卸载；resync 在文案就绪后重新同步一次。
 */
function installSidebarEntry(enter: () => Promise<void>, labelOf: () => string): {
  dispose: () => void
  resync: () => void
} {
  // 兜底面板行（aria-label 等于同一文案）平时藏起来：注入成功时不该出现两次。
  const style = document.createElement('style')
  style.id = STYLE_ID
  const applyLabel = (): string => {
    const label = labelOf()
    style.textContent = `button[aria-label="${label}"]:not([${ENTRY_ATTR}]){display:none !important}`
    return label
  }
  applyLabel()
  document.head.append(style)

  /** 克隆官方按钮，只改图标与文字——类名全部保留，折叠态与悬停态自然跟着官方走。 */
  const makeEntry = (official: HTMLElement): HTMLElement => {
    const label = labelOf()
    const clone = official.cloneNode(true) as HTMLElement
    clone.setAttribute(ENTRY_ATTR, '1')
    clone.setAttribute('aria-label', label)
    clone.removeAttribute('aria-current')
    const icon = clone.querySelector('svg')
    if (icon !== null) icon.outerHTML = userIconSvg(icon.getAttribute('width') ?? '14')
    for (const span of clone.querySelectorAll('span')) {
      if ((span.textContent ?? '').trim() !== '') {
        span.textContent = label
        break
      }
    }
    clone.addEventListener('click', (event) => {
      event.preventDefault()
      // 别让事件冒到 React 的 root 委托上：克隆节点不在 fiber 树里，冒泡过去会被算给
      // 它最近的 fiber 祖先，可能触发无关的容器级 onClick。
      event.stopPropagation()
      void enter().catch((reason: unknown) => {
        console.error('[digital-assistant] 打开失败:', reason)
        flashFailure(clone, reason)
      })
    })
    return clone
  }

  let scheduled = false
  const sync = (): void => {
    scheduled = false
    const official = findNewSessionButton()
    if (official === undefined) return
    const existing = official.nextElementSibling
    if (existing !== null && existing.hasAttribute(ENTRY_ATTR)) {
      if (existing.getAttribute('aria-label') !== labelOf()) existing.replaceWith(makeEntry(official))
      return
    }
    // 官方 React 重渲染会带走我们的节点，所以每次快照变化都补一次。
    for (const stale of document.querySelectorAll(`[${ENTRY_ATTR}]`)) stale.remove()
    official.after(makeEntry(official))
  }
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    // rAF 在真实浏览器里总有；没有的环境（老 WebView/测试 DOM）退回定时器。
    const raf = window.requestAnimationFrame ?? ((cb: () => void) => window.setTimeout(cb, 16))
    raf(sync)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  sync()

  return {
    dispose: () => {
      observer.disconnect()
      for (const stale of document.querySelectorAll(`[${ENTRY_ATTR}]`)) stale.remove()
      style.remove()
    },
    resync: () => {
      applyLabel()
      sync()
    },
  }
}

/** 兜底跳转面板：挂载即打开数字助理会话，随后自己被主列卸载。 */
function AssistantPanel(props: { enter: () => Promise<void>, t: (key: string) => string }) {
  const [error, setError] = useState<string | undefined>(undefined)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void props.enter().catch((reason: unknown) => { setError(String(reason)) })
  }, [props])
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      height: '100%',
      padding: '24px',
      fontSize: '13px',
      color: 'var(--dsw-alias-text-secondary, #8a8a8a)',
      textAlign: 'center',
    }}
    >
      <IconSparkle16 size={20} />
      <div>{props.t('opening')}</div>
      {error !== undefined && (
        <div style={{ maxWidth: '520px', color: 'var(--dsw-alias-state-error-primary, #e5484d)' }}>
          <div>{props.t('openFailed')}</div>
          <div style={{ marginTop: '4px', wordBreak: 'break-all' }}>{error}</div>
          <div style={{ marginTop: '6px' }}>{props.t('retry')}</div>
        </div>
      )}
    </div>
  )
}

/** 兜底面板行里的图标（正常路径下这行是隐藏的）。 */
function AssistantPanelIcon(props: { size: number }) {
  return <IconSparkle16 size={props.size} />
}

/** 挂载 jxAssistant Remote，装上侧边栏入口，并保留面板槽兜底。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)

  /**
   * 「打开数字助理」的实现必须待在**子插件**里：只有那里能在 inject 里声明
   * `remote.jxAssistant`（它由上面的 $mount 产生，写进顶层 inject 会互相等待而死锁）。
   * 顶层只拿一个引用，DOM 入口点击时再取。
   */
  let enterRef: (() => Promise<void>) | undefined

  /** 等子插件就绪（正常几毫秒；页面刚起来就点也不会失手）。 */
  const waitEnter = async (): Promise<() => Promise<void>> => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (enterRef !== undefined) return enterRef
      await new Promise<void>((resolve) => { window.setTimeout(resolve, 50) })
    }
    throw new Error('数字助理还没初始化完，请再点一次')
  }

  /** 入口文案：先按中文占位，子插件拿到官方 locale 后立刻换成与它一致的那一份。 */
  let entryLabelNow = zh.panel
  const entry = installSidebarEntry(async () => { await (await waitEnter())() }, () => entryLabelNow)

  const disposeUi = ctx.plugin({
    name: 'dsh-digital-assistant/ui',
    inject: ['slots', 'locale', 'remote.jxAssistant', 'uiWorkspace'],
    apply(child: ClientContext) {
      child.effect(() => child.locale.register(NS, { zh, en }), 'dsh-digital-assistant: dictionaries')
      const scoped = child as unknown as {
        locale: { bind: (ns: string) => (key: string) => string }
        remote: { jxAssistant: AssistantRemote }
        get: (name: string) => unknown
        slots: {
          inject: (name: string, factory: () => unknown) => void
          register: (options: Record<string, unknown>, component: unknown) => unknown
        }
      }
      const t = scoped.locale.bind(NS)
      entryLabelNow = t('panel')
      entry.resync()

      /** 保证数字助理会话存在，并把它打开成主列的普通对话。 */
      const enter = async (): Promise<void> => {
        const uiWorkspace = scoped.get('uiWorkspace') as { openSession: (sessionId: string) => void } | undefined
        if (uiWorkspace === undefined) throw new Error('uiWorkspace 服务不可用')
        const result = await scoped.remote.jxAssistant.ensure()
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        uiWorkspace.openSession(result.value.sessionId)
      }
      enterRef = enter

      scoped.slots.inject('main', () => scoped.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ enter, t }),
      }, AssistantPanel))

      scoped.slots.inject('sidebar.panellist', () => scoped.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        // 官方「插件」行是 order 0；大于 0 即排在它下方。
        order: 10,
        label: () => t('panel'),
        locale: NS,
      }, AssistantPanelIcon))
    },
  })

  return async () => {
    entry.dispose()
    await disposeUi()
    await disposeMount()
  }
}
