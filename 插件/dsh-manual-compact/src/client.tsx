/**
 * dsh-manual-compact —— 浏览器半边。
 *
 * 在官方 `conversation.chat.assistant-actions` 插槽（每轮结尾那排小按钮：
 * 时间 / 复制 / 点赞点踩 / 分支 / 用量）里注册 `jx-manual-compact` 条目
 * （order 20，排在官方点赞 order 10 之后）。点赞、复制、分支等官方按钮
 * 原样保留，对话折叠插件替换的是整包行为、与此插槽互不影响。
 *
 * 点击后：用 useChat 反查该轮的轮号与最后一个节点的 seq → 弹官方 Modal
 * 确认 → 调宿主 `jxManualCompact.compact`（进行中转圈、失败显示中文原因、
 * 成功显示数字）。压缩落盘后，官方会话流里自动出现「上下文已压缩」行。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  Button, IconCompactOutline16, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { TYPERT_REMOTE } from './remote-client.ts'
import { en, NS, zh } from './locales.ts'
import type { ManualCompactLocaleKey } from './locales.ts'

/** 按钮行条目的 id 与 order（list 插槽按 order 排序；官方点赞是 order 10）。 */
const ENTRY_ID = 'jx-manual-compact'
const ENTRY_ORDER = 20

/** 注入样式的标识，便于卸载时精确清理。 */
const STYLE_ID = 'jx-manual-compact-style'

/** 顶层插件先挂 Remote 命名空间服务（jxManualCompact 由 $mount 产生，不能写进顶层 inject）。 */
export const inject = ['remote']

/** 宿主 remote 的调用回包形状（typert 把 rejection 包装成 ok: false）。 */
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

interface CompactRemote {
  compact: (sessionId: string, turn: number, anchorSeq: number) => Promise<RemoteResult<{
    shadowedCount: number
    shadowedTokens: number
    summaryChars: number
  }>>
}

type Translate = (key: ManualCompactLocaleKey, params?: Record<string, unknown>) => string

/** 会话级 chat 快照里用到的最小面（结构性描述）。 */
interface ChatSnapshotLike {
  nodes: { values: () => Iterable<{ kind: string; anchorSeq: number; data: { turn?: number; finalNode?: { seq: number; messageId: string } } }> }
}

/** 按钮与对话框的完整 props（插槽框架按声明注入）。 */
interface CompactActionProps {
  messageId: string
  sessionId: string
  useChat: (selector: (snapshot: ChatSnapshotLike) => number) => number
  compact: CompactRemote['compact']
  t: Translate
}

/** 复刻官方 action 按钮的外观变量（token 与 ui-chat 的 MessageIconActions 一致）。 */
const BUTTON_CSS = `
.jx-manual-compact-action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}
.jx-manual-compact-action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}
.jx-manual-compact-action:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.jx-manual-compact-action:disabled{cursor:default;opacity:.4}
.jx-manual-compact-action[data-running='true'] svg{animation:jx-manual-compact-spin 1s linear infinite}
@keyframes jx-manual-compact-spin{to{transform:rotate(360deg)}}
.jx-manual-compact-error{margin:8px 0 0;color:var(--dsw-alias-state-error-primary,#e5484d);font-size:13px;white-space:pre-wrap;word-break:break-word}
.jx-manual-compact-done{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5}
`

/** 注入一次按钮样式；返回清理函数。 */
function installStyle(): () => void {
  if (document.getElementById(STYLE_ID) === null) {
    const tag = document.createElement('style')
    tag.id = STYLE_ID
    tag.textContent = BUTTON_CSS
    document.head.append(tag)
  }
  return () => {
    document.getElementById(STYLE_ID)?.remove()
  }
}

/**
 * 「压缩到此轮为止」按钮 + 确认/进行/完成对话框。
 * @param props - owner 的消息 id、会话 id、chat 快照钩子、宿主动词与文案。
 * @returns 按钮行里的一个图标按钮（轮次未知时不渲染）。
 */
function CompactAction({ messageId, sessionId, useChat, compact, t }: CompactActionProps) {
  // useChat 的 selector 必须返回基本类型（快照比较用 Object.is），
  // 所以拆成两个 number：该轮的轮号、该轮最后一个节点的 seq。
  const turn = useChat((snapshot) => {
    for (const node of snapshot.nodes.values()) {
      if (node.kind === 'assistant' && node.data.finalNode?.messageId === messageId) {
        return node.data.turn ?? -1
      }
    }
    return -1
  })
  const anchorSeq = useChat((snapshot) => {
    for (const node of snapshot.nodes.values()) {
      if (node.kind === 'assistant' && node.data.finalNode?.messageId === messageId) {
        return node.anchorSeq ?? node.data.finalNode.seq
      }
    }
    return -1
  })

  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ shadowedCount: number; shadowedTokens: number; summaryChars: number } | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const open = phase !== 'idle'
  const close = useCallback(() => {
    if (!alive.current) return
    setPhase('idle')
    setError(null)
  }, [])

  const start = useCallback(async () => {
    if (!alive.current) return
    setPhase('running')
    setError(null)
    const result = await compact(sessionId, turn, anchorSeq)
    if (!alive.current) return
    if (result.ok) {
      setOutcome(result.value)
      setPhase('done')
    } else {
      // 失败原因留在对话框里给用户看，绝不静默。
      setError(result.error.message || result.error.code || '压缩失败')
      setPhase('confirm')
    }
  }, [anchorSeq, compact, sessionId, turn])

  if (turn < 0 || anchorSeq < 0) return null
  const running = phase === 'running'

  return (
    <>
      <Tooltip label={running ? t('running') : t('action')} side="bottom">
        <button
          type="button"
          className="jx-manual-compact-action"
          aria-label={running ? t('running') : t('action')}
          data-running={running || undefined}
          disabled={running}
          onClick={() => { setError(null); setPhase('confirm') }}
        >
          <IconCompactOutline16 />
        </button>
      </Tooltip>
      <Modal
        open={open}
        onClose={running ? () => { /* 进行中不允许误关 */ } : close}
        title={phase === 'done' ? t('action') : t('dialogTitle')}
        closeLabel={t('close')}
        description={phase === 'confirm' ? t('dialogBody', { turn }) : undefined}
        footer={phase === 'done'
          ? (
              <Button variant="primary" onClick={close}>{t('close')}</Button>
            )
          : (
              <>
                <Button variant="outline" disabled={running} onClick={close}>{t('cancel')}</Button>
                <Button variant="primary" disabled={running} onClick={() => { void start() }}>
                  {running ? t('running') : t('confirm')}
                </Button>
              </>
            )}
      >
        {error !== null && <p className="jx-manual-compact-error" role="alert">{`${t('failed')}：${error}`}</p>}
        {phase === 'done' && outcome !== null && (
          <p className="jx-manual-compact-done">
            {t('done', { count: outcome.shadowedCount, tokens: outcome.shadowedTokens, chars: outcome.summaryChars })}
          </p>
        )}
      </Modal>
    </>
  )
}

/** 挂载 jxManualCompact Remote，注册按钮行条目与词典。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE)
  const disposeStyle = installStyle()

  const disposeUi = ctx.plugin({
    name: 'dsh-manual-compact/ui',
    inject: ['slots', 'locale', 'remote.jxManualCompact'],
    apply(child: ClientContext) {
      child.effect(() => child.locale.register(NS, { zh, en }), 'dsh-manual-compact: dictionaries')
      const scoped = child as unknown as {
        locale: { bind: (ns: string) => Translate }
        remote: { jxManualCompact: CompactRemote }
        slots: {
          inject: (name: string, factory: () => unknown) => void
          register: (options: Record<string, unknown>, component: unknown) => unknown
        }
      }
      const t = scoped.locale.bind(NS)
      const compact = (sessionId: string, turn: number, anchorSeq: number) =>
        scoped.remote.jxManualCompact.compact(sessionId, turn, anchorSeq)

      scoped.slots.inject('conversation.chat.assistant-actions', () => scoped.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: ENTRY_ID,
        order: ENTRY_ORDER,
        locale: NS,
        inject: () => ({ compact, t }),
      }, CompactAction))
    },
  })

  return async () => {
    await disposeUi()
    disposeStyle()
    await disposeMount()
  }
}
