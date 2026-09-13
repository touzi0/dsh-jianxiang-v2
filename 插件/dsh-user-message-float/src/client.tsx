/**
 * 用户消息浮窗（坚祥定制，原 packages/client/ui-user-message-float 迁移为模组）。
 *
 * 视口停在回合中段（工具调用/思考——既看不到用户消息也看不到最终回答）时，
 * 把当前问题钉在会话区右上角；看到提问本身或最终回答时自动隐藏。可折叠成
 * 「你的要求」药丸、长文折叠展开、滚动到顶部自动加载更早历史。
 *
 * 新版适配：client-runtime 已拆包（sessions 服务来自 dsh-api-session-controller）；
 * chat 快照的 nodes 改为 store，遍历走 legacy.nodes（节点带 key/kind/data）。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

// —— 结构化类型（仅类型，构建时擦除；来源 dsh-api-session-controller/client 与 ui-conversation） ——

interface UserContentBlock { type: string; text?: string }
interface ConversationNode { kind: string; key?: string; data?: { content?: readonly UserContentBlock[] } }
interface ChatLike {
  order?: readonly string[]
  legacy?: { nodes?: readonly ConversationNode[] }
  nodes?: { values?: () => readonly ConversationNode[] }
}
interface SessionFace {
  subscribe(listener: () => void): () => void
  getSnapshot(): { hasMore?: boolean; loadingOlder?: boolean }
  loadOlder(): Promise<void>
}
interface SessionBinding { session: SessionFace }
interface ChatTarget {
  getSnapshot(): ChatLike | undefined | null
  subscribe(listener: () => void): () => void
}
interface SessionsState { current?: string }
interface SessionsService {
  list: { getSnapshot(): SessionsState; subscribe(fn: () => void): () => void }
  binding(id: string): SessionBinding | undefined
}
interface UiConversationService {
  binding(binding: SessionBinding): { target(name: 'chat'): ChatTarget }
}

/** 注入面（框架平铺为顶层 props：useFloatView；标准套件给 useSessions）。 */
export interface FloatInjected {
  hooks: { floatView: HostObservableLike<FloatView> }
}
interface HostObservableLike<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

// —— FloatView 与控制器（React-free 数据层） ——

export interface FloatView {
  readonly key: string | null
  readonly text: string | null
}

const EMPTY: FloatView = Object.freeze({ key: null, text: null })
const IMAGE_ONLY = '（图片消息）'

export function extractUserText(blocks: readonly UserContentBlock[] | undefined): string {
  const parts: string[] = []
  let hasImage = false
  for (const block of blocks ?? []) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
      parts.push(block.text)
    } else if (block.type === 'image') {
      hasImage = true
    }
  }
  const text = parts.join('\n')
  if (text !== '') return text
  return hasImage ? IMAGE_ONLY : ''
}

export class FloatController {
  private view: FloatView = EMPTY
  private readonly listeners = new Set<() => void>()

  readonly source = {
    getSnapshot: (): FloatView => this.view,
    subscribe: (fn: () => void): (() => void) => {
      this.listeners.add(fn)
      return () => { this.listeners.delete(fn) }
    },
  }

  /** chat 快照 → {chat-flow key → 用户消息文本}（user 与 steering 行）。 */
  static foldChat(chat: ChatLike | undefined | null): ReadonlyMap<string, string> {
    const userText = new Map<string, string>()
    // 新版快照里 legacy 兼容层常为空数组，实际节点在 nodes.values()。
    let nodes: readonly ConversationNode[] = Array.isArray(chat?.legacy?.nodes)
      ? chat?.legacy?.nodes ?? []
      : []
    if (nodes.length === 0 && typeof chat?.nodes?.values === 'function') {
      try { nodes = chat.nodes.values() } catch { nodes = [] }
    }
    for (const node of nodes) {
      if (node.kind !== 'user' && node.kind !== 'steering') continue
      if (node.key === undefined) continue
      userText.set(node.key, extractUserText(node.data?.content))
    }
    return userText
  }

  update(scrollport: HTMLElement, userText: ReadonlyMap<string, string>): void {
    const chatFlow = scrollport.querySelector('[data-chat-flow]')
    if (chatFlow === null) {
      this.publish(EMPTY)
      return
    }
    const rows = chatFlow.children
    const rect = scrollport.getBoundingClientRect()
    const top = rect.top
    const composer = scrollport.querySelector('[data-composer-seat]')
    const composerTop = composer === null ? Number.POSITIVE_INFINITY : composer.getBoundingClientRect().top
    const bottom = Math.min(rect.bottom, composerTop)
    let index = -1
    let userVisible = false
    let processVisible = false
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement
      const rowRect = row.getBoundingClientRect()
      if (index === -1 && rowRect.bottom > top + 1) index = i
      if (rowRect.bottom <= top + 1 || rowRect.top >= bottom) continue
      const kind = row.getAttribute('data-chat-flow-kind')
      if (kind === 'user' || kind === 'steering') {
        userVisible = true
      } else if (kind === 'turn-process' || kind === 'tool-call') {
        processVisible = true
      } else if (kind === 'assistant-step') {
        // 最终回答行开头可能带思考块；仅思考折叠层可见时算过程。
        const thinks = row.querySelectorAll('[data-variant="think"]')
        for (const think of thinks) {
          const thinkRect = think.getBoundingClientRect()
          if (thinkRect.bottom > top + 1 && thinkRect.top < bottom) {
            processVisible = true
            break
          }
        }
      }
    }
    if (!processVisible || userVisible) {
      this.publish(EMPTY)
      return
    }
    let found: FloatView = EMPTY
    for (let i = index; i >= 0; i--) {
      const row = rows[i] as HTMLElement
      const kind = row.getAttribute('data-chat-flow-kind')
      if (kind !== 'user' && kind !== 'steering') continue
      const key = row.getAttribute('data-chat-flow-key')
      const text = key === null ? undefined : userText.get(key)
      if (key !== null && text !== undefined && text !== '') {
        found = Object.freeze({ key, text })
      }
      break
    }
    this.publish(found)
  }

  clear(): void {
    this.publish(EMPTY)
  }

  private publish(next: FloatView): void {
    if (next.key === this.view.key) return
    this.view = next
    for (const fn of [...this.listeners]) fn()
  }
}

// —— 浮窗组件（内联样式，锚点随布局变化重新测量） ——

const CLAMP_LINES = 5
const LINE_HEIGHT_PX = 24

interface FloatPos { top: number; right: number }

function measurePos(): FloatPos | null {
  const layer = document.querySelector('[data-shell-overlay]')
  const scrollport = document.querySelector('[data-conversation-scroll]')
  const chatFlow = scrollport?.querySelector('[data-chat-flow]') ?? null
  if (layer === null || scrollport === null || chatFlow === null) return null
  const layerRect = layer.getBoundingClientRect()
  const scrollRect = scrollport.getBoundingClientRect()
  const flowRect = chatFlow.getBoundingClientRect()
  return {
    top: scrollRect.top - layerRect.top + 12,
    right: Math.max(0, layerRect.right - flowRect.right),
  }
}

const styles = {
  float: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 'min(560px, 80vw)',
    pointerEvents: 'auto',
  } satisfies CSSProperties,
  bodyWrap: {
    minWidth: 0,
    maxWidth: 'min(525px, 74vw)',
    background: 'var(--dsw-specific-bubble)',
    borderRadius: 22,
    padding: '10px 16px',
    boxShadow: '0 6px 24px rgb(0 0 0 / 18%)',
  } satisfies CSSProperties,
  body: {
    maxHeight: '40vh',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 16,
    lineHeight: '24px',
    color: 'var(--dsw-alias-label-primary)',
  } satisfies CSSProperties,
  pill: {
    background: 'var(--dsw-specific-bubble)',
    border: 'none',
    borderRadius: 999,
    padding: '6px 14px',
    cursor: 'pointer',
    color: 'var(--dsw-alias-label-primary)',
    boxShadow: '0 6px 24px rgb(0 0 0 / 18%)',
  } satisfies CSSProperties,
  clampToggle: {
    display: 'block',
    margin: '2px 0 0 auto',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 13,
    lineHeight: '20px',
    cursor: 'pointer',
  } satisfies CSSProperties,
  close: {
    border: 'none',
    background: 'none',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: 4,
  } satisfies CSSProperties,
} as const

export function UserMessageFloat({ useFloatView, useSessions }: {
  useFloatView: (select: (snapshot: FloatView) => FloatView) => FloatView
  useSessions: (select: (state: SessionsState) => string | undefined) => string | undefined
}): ReactNode {
  const view = useFloatView(snapshot => snapshot)
  const [collapsed, setCollapsed] = useState(false)
  const [textExpanded, setTextExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [pos, setPos] = useState<FloatPos | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const currentId = useSessions(state => state.current)

  useEffect(() => {
    setCollapsed(false)
    setTextExpanded(false)
  }, [view.key])

  useEffect(() => {
    const measure = (): void => { setPos(measurePos()) }
    measure()
    const scrollport = document.querySelector('[data-conversation-scroll]')
    const observer = new ResizeObserver(measure)
    if (scrollport !== null) observer.observe(scrollport)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [currentId])

  const visible = view.text !== null && pos !== null
  useEffect(() => {
    if (!visible) return
    const el = bodyRef.current
    if (el === null) return
    const measure = (): void => {
      setOverflowing(el.scrollHeight > CLAMP_LINES * LINE_HEIGHT_PX + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [visible, view.text])

  if (view.text === null || pos === null) return null

  if (collapsed) {
    return (
      <button
        type="button"
        style={{ ...styles.pill, top: pos.top, right: pos.right }}
        onClick={() => { setCollapsed(false) }}
        title="展开用户请求"
      >
        你的要求
      </button>
    )
  }

  return (
    <div style={{ ...styles.float, top: pos.top, right: pos.right }}>
      <div style={styles.bodyWrap}>
        <div
          ref={bodyRef}
          style={{
            ...styles.body,
            ...(overflowing && !textExpanded
              ? { maxHeight: 120, overflow: 'hidden' } satisfies CSSProperties
              : {} satisfies CSSProperties),
          }}
        >
          {view.text}
        </div>
        {overflowing && (
          <button
            type="button"
            style={styles.clampToggle}
            aria-expanded={textExpanded || undefined}
            onClick={() => { setTextExpanded(current => !current) }}
          >
            {textExpanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>
      <button
        type="button"
        style={styles.close}
        aria-label="收起"
        title="收起"
        onClick={() => { setCollapsed(true) }}
      >
        ×
      </button>
    </div>
  )
}

// —— 客户端入口 ——

/** 所需服务：槽注册表 + 会话域 + 会话视图装配（chat 目标源）。 */
export const inject = ['slots', 'sessions', 'uiConversation']

const AUTO_LOAD_THRESHOLD_PX = 400

export function apply(ctx: ClientContext): void {
  const sessions = (ctx as unknown as { sessions: SessionsService }).sessions
  const uiConversation = (ctx as unknown as { uiConversation?: UiConversationService }).uiConversation
  const controller = new FloatController()

  const injected = (): FloatInjected => ({
    hooks: { floatView: controller.source },
  })

  // 当前会话的会话滚动区观察：一次只绑一个 DOM 绑定。
  let rebind: (() => void) | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  ctx.effect(() => {
    const sync = (): void => {
      rebind?.()
      rebind = undefined
      clearTimeout(retryTimer)
      retryTimer = undefined
      const current = sessions.list.getSnapshot().current
      if (current === undefined) {
        controller.clear()
        return
      }
      const binding = sessions.binding(current)
      if (binding === undefined) {
        // 会话列表就绪但绑定未就绪的窗口：列表事件不一定再来，定时重试。
        retryTimer = setTimeout(sync, 400)
        return
      }
      const session = binding.session
      // chat 快照走 uiConversation 的 chat 目标源（新版会话快照不再内嵌 chat）。
      const chatTarget = uiConversation === undefined ? undefined : uiConversation.binding(binding).target('chat')
      let disposed = false
      let scrollport: HTMLElement | null = null
      let rafId = 0
      let hasMore = false
      let loadingOlder = false
      let autoLoading = false
      let lastPolledTop: number | null = null
      const resize = new ResizeObserver(schedule)
      const mutation = new MutationObserver(schedule)
      const unsubscribe = session.subscribe(schedule)
      const unsubscribeChat = chatTarget === undefined ? undefined : chatTarget.subscribe(schedule)
      // 会话视图是懒挂载的：scrollport 出现前先观察整个文档，出现后再切换到
      // scrollport 本身（否则首次 compute 查不到就再也没有触发源了）。
      mutation.observe(document.body, { childList: true, subtree: true })
      // 轮询兜底：滚动/重挂/事件系统在任何环境下都可能丢事件（内嵌浏览器
      // 合成滚动不发事件、观察器可能被解绑）；400ms 轻探一次 scrollTop，
      // 变了才调度真正的计算。
      const poll = setInterval(() => {
        if (disposed) return
        const sp = scrollport ?? document.querySelector<HTMLElement>('[data-conversation-scroll]')
        if (sp === null) return
        const top = sp.scrollTop
        if (top === lastPolledTop && scrollport !== null) return
        lastPolledTop = top
        schedule()
      }, 400)

      function schedule(): void {
        if (disposed || rafId !== 0) return
        // rAF 合帧 + 超时兜底：后台/节流窗口里 rAF 可能长期不触发，
        // 150ms 后用定时器直接算，避免调度被卡死。
        let ran = false
        const run = (): void => {
          if (ran || disposed) return
          ran = true
          clearTimeout(fallback)
          rafId = 0
          compute()
        }
        const fallback = setTimeout(run, 150)
        rafId = requestAnimationFrame(run)
      }

      function compute(): void {
        if (disposed) return
        if (scrollport === null) {
          scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
          if (scrollport !== null) {
            mutation.disconnect()
            mutation.observe(scrollport, { childList: true, subtree: true })
            scrollport.addEventListener('scroll', schedule, { passive: true })
            resize.observe(scrollport)
          }
        }
        if (scrollport === null) {
          controller.clear()
          return
        }
        const snapshot = session.getSnapshot()
        hasMore = snapshot.hasMore === true
        loadingOlder = snapshot.loadingOlder === true
        const chat = chatTarget?.getSnapshot()
        if (dbg !== undefined) dbg.lastChat = chat
        controller.update(scrollport, FloatController.foldChat(chat))
        maybeAutoLoadOlder()
      }

      function maybeAutoLoadOlder(): void {
        if (autoLoading || !hasMore || loadingOlder) return
        if (scrollport === null || scrollport.scrollTop >= AUTO_LOAD_THRESHOLD_PX) return
        autoLoading = true
        const reset = (): void => {
          autoLoading = false
          schedule()
        }
        void Promise.resolve(session.loadOlder()).then(reset, reset)
      }

      compute()
      rebind = () => {
        disposed = true
        clearInterval(poll)
        unsubscribe()
        unsubscribeChat?.()
        if (rafId !== 0) cancelAnimationFrame(rafId)
        resize.disconnect()
        mutation.disconnect()
        scrollport?.removeEventListener('scroll', schedule)
        controller.clear()
      }
    }
    const dispose = sessions.list.subscribe(sync)
    sync()
    return () => {
      dispose()
      clearTimeout(retryTimer)
      retryTimer = undefined
      rebind?.()
      rebind = undefined
    }
  }, 'dsh-user-message-float: scroll binding')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'user-message-float', order: 0, inject: injected },
    UserMessageFloat as (props: Record<string, unknown>) => unknown,
  ))
}
