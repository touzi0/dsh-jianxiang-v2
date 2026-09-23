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

/** 侧边栏入口的图标尺寸：官方行图标是 14px，这张脸 14px 下细节不清，按用户选定的 22px 渲染。 */
const DA_ICON_SIZE = '22'

/** 竖直「超椭圆」眼睛（n=3，介于椭圆与胶囊之间：中段有短竖直直线、两头圆收），中心在原点。 */
const DA_EYE_PATH = 'M3.00,0.00L2.93,2.44L2.73,3.78L2.38,4.76L1.89,5.45L1.22,5.86L0.00,6.00L-1.22,5.86L-1.89,5.45L-2.38,4.76L-2.73,3.78L-2.93,2.44L-3.00,0.00L-2.93,-2.44L-2.73,-3.78L-2.38,-4.76L-1.89,-5.45L-1.22,-5.86L0.00,-6.00L1.22,-5.86L1.89,-5.45L2.38,-4.76L2.73,-3.78L2.93,-2.44L3.00,0.00Z'

/** 图标内的动画。完成态是「眼睛压扁成线 → 笑眼弧线同帧弹出」，任意时刻都有可见元素，无空档。 */
const DA_FACE_CSS = `
[data-state] .da-eye,[data-state] .da-eyes{transform-box:fill-box;transform-origin:center}
.da-smile{opacity:0}
[data-state="idle"] .da-eye{animation:da-blink 4.5s ease-in-out infinite}
[data-state="thinking"] .da-eyes{animation:da-scan 2.2s ease-in-out infinite}
[data-state="thinking"] .da-eye{transform:scaleY(.55)}
[data-state="done"] .da-eye{animation:da-squish 6s cubic-bezier(.5,0,.5,1) infinite}
[data-state="done"] .da-smile{animation:da-pop 6s cubic-bezier(.5,0,.5,1) infinite}
@keyframes da-blink{0%,86%,100%{transform:scaleY(1)}90%,92%{transform:scaleY(.1)}}
@keyframes da-scan{0%,100%{transform:translateX(0)}30%{transform:translateX(1.8px)}50%{transform:translateX(0)}80%{transform:translateX(-1.8px)}}
@keyframes da-squish{0%,7%{transform:scaleY(1)}12%{transform:scaleY(.06)}86%{transform:scaleY(.06)}91%,100%{transform:scaleY(1)}}
@keyframes da-pop{0%,11.5%{opacity:0}15%,85%{opacity:1}88.5%,100%{opacity:0}}
[data-da-face]{transform-box:fill-box;transform-origin:center;transition:transform .22s ease}
[data-da-face]:hover,button:hover [data-da-face]{transform:rotate(11deg)}
[data-da-face]:hover .da-eyes,button:hover [data-da-face] .da-eyes{animation:da-hover 1s ease-in-out infinite}
[data-da-face][data-state="done"]:hover .da-eyes,button:hover [data-da-face][data-state="done"] .da-eyes{animation:none}
@keyframes da-hover{0%,100%{transform:translateX(0)}25%{transform:translateX(1.4px)}50%{transform:translateX(0)}75%{transform:translateX(-1.4px)}}
@media (prefers-reduced-motion:reduce){[data-state] .da-eye,[data-state] .da-eyes,.da-smile{animation:none!important}[data-state="done"] .da-smile{opacity:1}[data-da-face],[data-da-face]:hover,button:hover [data-da-face]{transform:none;transition:none}[data-da-face]:hover .da-eyes,button:hover [data-da-face] .da-eyes{animation:none!important}}
`

/**
 * 数字助理对话图标：圆脸 + 一对实心大眼。三态由 `data-state` 驱动——
 * idle 待机偶发眨眼 / thinking 压眼左右扫视 / done 笑眼弹出（无空档）。
 * @param size - 渲染尺寸（px 字符串），与官方按钮图标同宽。
 * @param state - 初始状态；侧边栏入口默认 idle。
 */
/** 眼睛中心 y：脸心是 24；上移到 22.5（V1 档）留出「脑门」，小尺寸下更像五官。 */
const DA_EYE_CY = 22.5

function assistantFaceSvg(size: string, state: 'idle' | 'thinking' | 'done' = 'idle'): string {
  const eye = (cx: number) => `<g transform="translate(${cx} ${DA_EYE_CY})"><path class="da-eye" d="${DA_EYE_PATH}" fill="currentColor"/></g>`
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-da-face data-state="${state}">`
    + '<circle cx="24" cy="24" r="15.5" fill="none" stroke="currentColor" stroke-width="2.6"/>'
    + `<g class="da-eyes">${eye(17.5)}${eye(30.5)}</g>`
    + '<g class="da-smile" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round">'
    + '<path d="M14.8 23 Q17.5 19.5 20.2 23"/><path d="M27.8 23 Q30.5 19.5 33.2 23"/></g>'
    + `<style>${DA_FACE_CSS}</style></svg>`
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
    if (icon !== null) icon.outerHTML = assistantFaceSvg(DA_ICON_SIZE)
    const setState = (state: 'idle' | 'thinking' | 'done'): void => {
      clone.querySelector('[data-da-face]')?.setAttribute('data-state', state)
    }
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
      setState('thinking')
      void enter().then(() => {
        setState('done')
        window.setTimeout(() => {
          const face = clone.querySelector('[data-da-face]')
          if (face?.getAttribute('data-state') === 'done') setState('idle')
        }, 4200)
      }).catch((reason: unknown) => {
        setState('idle')
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

/** 兜底面板行里的图标（正常路径下这行是隐藏的）：同一张圆脸，静态待机形态。 */
function AssistantPanelIcon(props: { size: number }) {
  return <span aria-hidden="true" style={{ display: 'inline-flex', lineHeight: 0 }}
    dangerouslySetInnerHTML={{ __html: assistantFaceSvg(String(props.size)) }} />
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
