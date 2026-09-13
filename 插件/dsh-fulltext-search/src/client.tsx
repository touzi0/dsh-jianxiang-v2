/**
 * 坚祥聊天记录逐字搜索 —— 浏览器半边。
 * 不加按钮、不改官方搜索框：MutationObserver 盯住侧栏会话浏览区，
 * 官方搜索结果（标题匹配）出现时，在结果区下方注入「聊天记录」区块，
 * 按批次向宿主 jxSearch 拉取逐字命中结果、渐进呈现（微信式），
 * 点击直达会话；同时隐藏官方「内容搜索暂不可用」提示（我们就是内容搜索）。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from './remote-client.ts'

/** 官方 sessions 服务的最小使用面。 */
interface SessionsFace {
  list: { getSnapshot(): { byId: Record<string, { displayTitle: string, origin?: string }> } }
}

/** uiWorkspace.openSession：打开会话并回到会话主面板。 */
interface UiWorkspaceFace {
  openSession(sessionId: string): void
}

type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }
interface JxSearchFace {
  search(query: string, cursor: string): Promise<RemoteResult<{ hits: readonly { sessionId: string, snippet: string, time: number }[], nextCursor: string }>>
}

const text = {
  section: '聊天记录',
  searching: '正在搜索聊天记录…',
  empty: '没有匹配的聊天记录。',
  error: '聊天记录搜索失败',
} as const

/** 顶层插件所需服务（$mount 的载体；jxSearch 命名空间由本插件自己挂出来）。 */
export const inject = ['remote']

/** 挂载 jxSearch Remote，并由子插件（注入齐备后）接管 DOM 注入。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)
  const disposeChild = ctx.plugin({
    name: 'dsh-fulltext-search/panel',
    inject: ['sessions', 'uiWorkspace', 'remote.jxSearch'],
    apply(child: ClientContext) {
      const sessions = (child as unknown as { sessions: SessionsFace }).sessions
      const uiWorkspace = (child as unknown as { uiWorkspace: UiWorkspaceFace }).uiWorkspace
      const jxSearch = (child as unknown as { remote: { jxSearch: JxSearchFace } }).remote.jxSearch
      const observer = createPanel(sessions, uiWorkspace, jxSearch)
      child.effect(() => () => { observer.disconnect() }, 'jx-fulltext-search: observer')
    },
  })
  return async () => {
    await disposeChild()
    await disposeMount()
  }
}

interface SearchPanel {
  disconnect(): void
}

/** 组装注入面板：观察者 + 渐进拉取循环。 */
function createPanel(sessions: SessionsFace, uiWorkspace: UiWorkspaceFace, jxSearch: JxSearchFace): SearchPanel {
  let section: HTMLDivElement | null = null
  let listEl: HTMLUListElement | null = null
  let statusEl: HTMLDivElement | null = null
  let input: HTMLInputElement | null = null
  let activeQuery = ''
  let runId = 0
  let scheduled = false

  const ensureSection = (anchor: HTMLElement): HTMLDivElement => {
    if (section !== null && section.isConnected) return section
    section = document.createElement('div')
    section.dataset.jxSearchSection = ''
    Object.assign(section.style, {
      display: 'none', flexDirection: 'column', minHeight: 0,
      // listArea 是 flex column：order 保证排在官方结果之后；固定占 50%
      // 让「聊天记录」从中间开始往下走（官方 treeBody flex:1 拿其余一半）。
      // 不做任何 DOM 移动（避免与 React 的协调循环互搏）。
      order: '99',
      flex: '0 0 50%',
      borderTop: '0.5px solid color-mix(in srgb, CanvasText 10%, transparent)',
      padding: '4px 6px 8px', margin: 0, overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>)
    const head = document.createElement('div')
    head.textContent = text.section
    Object.assign(head.style, {
      padding: '8px 8px 4px', fontSize: '11px', opacity: '0.55',
      textTransform: 'uppercase', letterSpacing: '0.4px',
    } satisfies Partial<CSSStyleDeclaration>)
    statusEl = document.createElement('div')
    Object.assign(statusEl.style, {
      padding: '0 8px 4px', fontSize: '12px', opacity: '0.6',
    } satisfies Partial<CSSStyleDeclaration>)
    listEl = document.createElement('ul')
    Object.assign(listEl.style, {
      overflowY: 'auto', margin: 0, padding: '0 0 4px', listStyle: 'none',
      display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0,
    } satisfies Partial<CSSStyleDeclaration>)
    section.append(head, statusEl, listEl)
    anchor.append(section)
    return section
  }

  const titleOf = (sessionId: string): string => {
    const summary = sessions.list.getSnapshot().byId[sessionId]
    if (summary !== undefined && summary.origin !== 'subagent') return summary.displayTitle
    return sessionId.slice(0, 8)
  }

  const appendHit = (hit: { sessionId: string, snippet: string, time: number }): void => {
    if (listEl === null) return
    if (listEl.querySelector(`[data-session="${hit.sessionId}"]`) !== null) return
    const li = document.createElement('li')
    li.dataset.session = hit.sessionId
    const button = document.createElement('button')
    button.type = 'button'
    Object.assign(button.style, {
      display: 'flex', flexDirection: 'column', gap: '2px', width: '100%',
      textAlign: 'left', padding: '6px 8px', borderRadius: '8px', cursor: 'pointer',
      background: 'transparent', border: 'none', color: 'inherit',
    } satisfies Partial<CSSStyleDeclaration>)
    const title = document.createElement('span')
    title.textContent = titleOf(hit.sessionId)
    Object.assign(title.style, {
      fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap',
      overflow: 'hidden', textOverflow: 'ellipsis',
    } satisfies Partial<CSSStyleDeclaration>)
    const snippet = document.createElement('span')
    snippet.textContent = hit.snippet
    Object.assign(snippet.style, {
      fontSize: '12px', opacity: '0.7', wordBreak: 'break-all',
      display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>)
    button.append(title, snippet)
    button.addEventListener('click', () => {
      // 对齐官方 openSearchResult：先清空搜索框（React setQuery('') → 结果区卸载），
      // 再打开会话；同时复位内部拉取状态，防止残留请求继续 append。
      activeQuery = ''
      runId++
      if (input !== null) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      uiWorkspace.openSession(hit.sessionId)
    })
    li.append(button)
    listEl.append(li)
  }

  const setStatus = (message: string): void => {
    if (statusEl !== null) statusEl.textContent = message
  }

  /** 渐进拉取：批次间检查 runId 防竞态，RPC 串行即天然限流。 */
  const runSearch = (query: string): void => {
    const myRun = ++runId
    if (listEl !== null) listEl.replaceChildren()
    setStatus(text.searching)
    const step = (cursor: string): void => {
      if (myRun !== runId) return
      jxSearch.search(query, cursor)
        .then(result => {
          if (myRun !== runId) return
          if (!result.ok) {
            setStatus(`${text.error}: ${result.error.code}`)
            return
          }
          for (const hit of result.value.hits) appendHit(hit)
          if (result.value.nextCursor === '') {
            setStatus(listEl !== null && listEl.children.length > 0 ? '' : text.empty)
            return
          }
          step(result.value.nextCursor)
        })
        .catch((error: unknown) => {
          if (myRun !== runId) return
          setStatus(`${text.error}: ${String(error)}`)
        })
    }
    step('')
  }

  /** 在浏览区根上找官方搜索输入框（该区域唯一的文本输入）。 */
  const findInput = (anchor: HTMLElement): HTMLInputElement | null => {
    let root: HTMLElement | null = anchor
    for (let i = 0; i < 6 && root !== null; i++) {
      const inputEl = root.querySelector('input:not([type="checkbox"]):not([type="radio"])')
      if (inputEl !== null) return inputEl as HTMLInputElement
      root = root.parentElement
    }
    return null
  }

  const pass = (): void => {
    scheduled = false
    const anchor = document.querySelector<HTMLElement>('[class*="listArea"]')
    if (anchor === null) {
      if (section !== null) section.style.display = 'none'
      return
    }
    ensureSection(anchor)
    const searchTree = anchor.querySelector('[class*="searchTree"]')
    const discovered = findInput(anchor)
    if (discovered !== input) {
      input = discovered
      if (input !== null) input.addEventListener('input', () => { schedule() })
    }
    const query = (input?.value ?? '').trim()
    const visible = searchTree !== null && query !== '' && section !== null
    if (section !== null) section.style.display = visible ? 'flex' : 'none'
    if (visible) {
      // 我们就是内容搜索：官方「内容搜索暂不可用」提示不再出现（隐藏之）。
      for (const warning of anchor.querySelectorAll<HTMLElement>('[class*="searchWarning"]')) {
        warning.style.display = 'none'
      }
      if (query !== activeQuery) {
        activeQuery = query
        runSearch(query)
      }
    } else if (activeQuery !== '') {
      activeQuery = ''
      runId++
      setStatus('')
      if (listEl !== null) listEl.replaceChildren()
    }
  }

  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    window.setTimeout(() => { pass() }, 60)
  }

  const observer = new MutationObserver(() => { schedule() })
  observer.observe(document.body, { childList: true, subtree: true })
  schedule()
  return { disconnect() { observer.disconnect() } }
}
